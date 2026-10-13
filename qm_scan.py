"""Skan Qullamaggie na samych cenach (bez fundamentów) — odpowiednik skanu z aplikacji MomentumDesktop (desktop/qm.py + sync dwuetapowy).

Ręczny workflow `QM Prices` (qm_prices.yml) uruchamia ten skrypt. Wynik: docs/data/watchlist_qm.json (spółki płynne, z metrykami cenowymi) i
docs/data/charts_qm.json (wykresy tygodniowe + dzienne dla czołówki rankingów) — zakładka Qullamaggie w aplikacji czyta te pliki.

Reguła (ta sama co w qullamaggieRows w watchlist.js): z płynnych spółek (obrót dzienny cena × wolumen ≥ próg, ADR ≥ próg) bierzemy górne X % rankingu
cena / min Low OSOBNO dla okien 1M (22 sesje), 3M (66) i 6M (132); wynik to suma (unikalne spółki), sortowana po największej z tych relacji.

Etap 1 (tylko Finviz, ok. 2 tys. spółek): zbiór ze skanera użytkownika (DEFAULT_FILTERS) jednym widokiem (cena, średni wolumen, zmienność miesiąca, zwroty 1M / 3M / 6M,
odległość od minimum 50 dni i 52 tygodni), sektor po sektorze, bo darmowy screener oddaje maks. 1000 wierszy. Z niego wybieramy kandydatów (czołówka pięciu
rankingów przybliżających cena / min Low wśród spółek płynnych wg Finviz, ~13 % zbioru) i liczymy wielkość puli płynnych (potrzebna do „górnych X %”).
Etap 2 (yfinance): ceny tylko kandydatów -> dokładny obrót, ADR i cena / min Low, wykresy. Opcja --full pobiera ceny całego zbioru (wolniej, bez przybliżenia).
"""
import argparse
import json
import math
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

import finviz
import watchlist

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "docs" / "data"
QM_PERIOD = "3y"            # do RS 12M, ADR, baz i wykresu (domyślnie widać 156 tygodni) wystarczą 3 lata; 10 lat byłoby kilka razy wolniej
FREE_LIMIT = 1000           # darmowy screener Finviz nie oddaje wierszy powyżej 1000 (r=1001 -> 403) — większy zbiór dzielimy po sektorach
SECTORS = ("technology", "healthcare", "financial", "industrials", "consumercyclical", "communicationservices", "consumerdefensive",
           "energy", "basicmaterials", "realestate", "utilities")
MIN_UNIVERSE = 100          # poniżej tego uznajemy odpowiedź Finviz za błędną (blokada / zmiana układu strony)

WINDOWS = {"1m": ("low_ratio_1m", "1M"), "3m": ("low_ratio_3m", "3M"), "6m": ("low_ratio_6m", "6M")}
# Domyślny zbiór = skaner użytkownika z Finviz (v=111, ft=3): średni wolumen > 100 tys., cena > 5 $, cena nad SMA200 i SMA50 nad SMA200 (≈ 2 tys. spółek,
# 13 X 2026: 2020). Ceny pobieramy tylko dla kandydatów z etapu 1 (dwuetapowo jak w desktopie), pełny zbiór to opcja (--full).
DEFAULT_FILTERS = "sh_avgvol_o100,sh_price_o5,ta_sma200_pa,ta_sma50_sa200"
# progi listy: obrót 60 mln $, ADR 3 % (2–3 %), górne 10 % z każdego okna; próg pobierania ADR jest niższy (2 %), żeby w aplikacji dało się go obniżyć bez
# nowego pobierania (obrotu poniżej progu pobierania — uruchom workflow z niższym progiem; niższy próg = więcej kandydatów = dłuższe pobieranie)
DEFAULTS = {"min_dollar_mln": 60.0, "min_adr": 3.0, "top_pct": 10.0, "windows": ["1m", "3m", "6m"], "keep_dollar_mln": 60.0, "keep_adr": 2.0,
            "chart_top_pct": 15.0}

# Pomiar na 2019 spółkach ze skanera użytkownika (13 X 2026, porównanie z dokładnym biegiem na cenach z yfinance): Finviz „Volatility M” ≈ ADR (różnica mediana 0,
# od −1,1 do +0,5), obrót cena × „Avg Volume” ≈ obrót z 20 sesji (mediana 1,00×, ale od 0,2× do 2,7× — Finviz liczy średni wolumen z 3 miesięcy, więc świeży skok
# wolumenu umyka), a wielkość puli płynnych z samego Finviz różni się od dokładnej o 1–2 spółki (321 vs 322, 555 vs 554, 741 vs 743).
# Zapas dobrany tak, żeby domyślny wybór (60 mln $, ADR 3 %, górne 10 %) był w kandydatach w całości (61/61), a kandydatów było ~13 % zbioru (267 z 2019).
PROXY_ADR_OFFSET = 1.0
PROXY_DOLLAR_SLACK = 0.4
CAND_FACTOR = 1.25          # z każdego rankingu bierzemy 1,25× tyle, ile wynika z górnych X % (ranking z Finviz tylko przybliża cena / min Low)
CAND_MIN = 30
CAND_MIN_PCT = 10.0         # liczone dla co najmniej tylu % (żeby podniesienie „górnych %” w aplikacji miało z czego brać)
# rankingi przybliżające cena / min Low: zwrot 1M; zwrot 3M i odległość od minimum 50 dni; zwrot 6M i odległość od minimum 52 tygodni
PROXY_KEYS = ("p1m", "p3m", "d50low", "p6m", "w52low")
UNIVERSE_COLUMNS = {"Company": "company", "Sector": "sector", "Industry": "industry", "Market Cap": "market_cap", "Price": "price",
                    "Perf Month": "p1m", "Perf Quart": "p3m", "Perf Half": "p6m", "Volatility M": "vol_m", "Avg Volume": "avgvol",
                    "50D Low": "d50low", "52W Low": "w52low"}
UNIVERSE_IDS = "0,1,2,3,4,6,43,44,45,51,63,65,56,58"   # numery kolumn widoku własnego Finviz (Company, Sector, Industry, Market Cap, Perf M/Q/H, Volatility M, Avg Volume, Price, 50D Low, 52W Low)


def _num(v):
    return v if isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v) else None


def _f(v, default):
    try:
        return float(str(v).replace(",", "."))
    except (TypeError, ValueError):
        return default


def normalize(cfg):
    cfg = cfg or {}
    out = {k: _f(cfg.get(k), DEFAULTS[k]) for k in ("min_dollar_mln", "min_adr", "top_pct", "keep_dollar_mln", "keep_adr", "chart_top_pct")}
    wins = [w for w in (cfg.get("windows") or DEFAULTS["windows"]) if w in WINDOWS]
    out["windows"] = wins or list(DEFAULTS["windows"])
    out["top_pct"] = min(100.0, max(0.0, out["top_pct"]))
    out["chart_top_pct"] = min(100.0, max(out["top_pct"], out["chart_top_pct"]))
    return out


def liquid(rows, min_dollar_mln, min_adr):
    return [r for r in rows if _num(r.get("dollar_volume_avg")) is not None and _num(r.get("adr_pct")) is not None
            and r["dollar_volume_avg"] >= min_dollar_mln * 1e6 and r["adr_pct"] >= min_adr]


def keep(rows, cfg):
    """Spółki zostające w pliku (próg pobierania — szerszy niż próg listy, żeby w aplikacji można było go obniżać bez nowego pobierania)."""
    c = normalize(cfg)
    return liquid(rows, c["keep_dollar_mln"], c["keep_adr"])


def pool_pairs(universe):
    """Zwięzły zapis całego zbioru z Finviz: [[przybliżony obrót, zmienność mies.]] — z tego aplikacja liczy, ile spółek jest „płynnych”."""
    return [[round(u["price"] * u["avgvol"]), u["vol_m"]] for u in universe
            if None not in (_num(u.get("price")), _num(u.get("avgvol")), _num(u.get("vol_m")))]


def pool_size(pairs, min_dollar_mln, min_adr):
    return sum(1 for dv, vm in pairs or [] if dv >= min_dollar_mln * 1e6 and vm >= min_adr)


def select(rows, cfg, top_pct=None, pool=None):
    """{ticker: [okna]} — płynne spółki z górnych top_pct % rankingu cena / min Low w co najmniej jednym oknie.
    pool (lista par z pool_pairs): górne X % liczone od wielkości CAŁEGO płynnego zbioru z Finviz, nie od kandydatów (ci są już czołówką)."""
    c = normalize(cfg)
    pct = c["top_pct"] if top_pct is None else top_pct
    liq = liquid(rows, c["min_dollar_mln"], c["min_adr"])
    n_pool = pool_size(pool, c["min_dollar_mln"], c["min_adr"]) if pool else None
    picked = {}
    if pct <= 0:
        return picked
    for w in c["windows"]:
        key = WINDOWS[w][0]
        ranked = sorted((r for r in liq if _num(r.get(key)) is not None), key=lambda r: r[key], reverse=True)
        base = n_pool or len(ranked)
        take = min(len(ranked), max(1, math.ceil(base * pct / 100))) if ranked else 0
        for r in ranked[:take]:
            picked.setdefault(r["ticker"], []).append(w)
    return picked


def _proxy_liquid(u, dollar_mln, adr):
    price, vol, vm = _num(u.get("price")), _num(u.get("avgvol")), _num(u.get("vol_m"))
    return None not in (price, vol, vm) and price * vol >= dollar_mln * 1e6 * PROXY_DOLLAR_SLACK and vm >= adr - PROXY_ADR_OFFSET


def _proxy_rankings(universe, cfg):
    """-> (płynne wg Finviz, ile bierzemy z rankingu, {klucz rankingu: lista posortowana malejąco})."""
    c = normalize(cfg)
    pool = [u for u in universe if _proxy_liquid(u, c["keep_dollar_mln"], c["keep_adr"])]
    pct = max(c["top_pct"], CAND_MIN_PCT)
    n = max(CAND_MIN, math.ceil(len(pool) * pct / 100 * CAND_FACTOR))
    ranked = {key: sorted((u for u in pool if _num(u.get(key)) is not None), key=lambda u: u[key], reverse=True) for key in PROXY_KEYS}
    return pool, n, ranked


def candidates(universe, cfg):
    """Etap 1: z całego zbioru Finviz wybiera kandydatów do pobrania cen — płynne (w przybliżeniu) spółki z czołówki któregokolwiek z pięciu rankingów."""
    pool, n, ranked = _proxy_rankings(universe, cfg)
    chosen = {u["ticker"] for key in PROXY_KEYS for u in ranked[key][:n]}
    return [u for u in pool if u["ticker"] in chosen]


def proxy_depth(universe, cfg, tickers):
    """Kontrola zapasu: (najgłębsza pozycja wybranej spółki w najlepszym z rankingów Finviz, ile bierzemy z rankingu).
    Gdy pierwsza liczba zbliża się do drugiej, kandydatów mogło zabraknąć (spółki tuż pod granicą nie zostały pobrane)."""
    _, n, ranked = _proxy_rankings(universe, cfg)
    pos = {key: {u["ticker"]: i + 1 for i, u in enumerate(rows)} for key, rows in ranked.items()}
    depths = [min((pos[k][t] for k in PROXY_KEYS if t in pos[k]), default=None) for t in tickers]
    depths = [d for d in depths if d is not None]
    return (max(depths) if depths else 0), n


# ---------- Finviz: cały zbiór (etap 1) ----------

@contextmanager
def _universe_view():
    """Na czas pobierania widok własny „152” zwraca kolumny skanu (cena, wolumen, zmienność, zwroty…) zamiast kolumn fundamentów."""
    saved = (finviz.VIEW_COLUMNS.get("152"), finviz.VIEW_PARAMS.get("152"), set(finviz.TEXT_KEYS))
    finviz.VIEW_COLUMNS["152"], finviz.VIEW_PARAMS["152"] = dict(UNIVERSE_COLUMNS), {"c": UNIVERSE_IDS}
    finviz.TEXT_KEYS.update({"company", "sector", "industry"})
    try:
        yield
    finally:
        finviz.VIEW_COLUMNS["152"], finviz.VIEW_PARAMS["152"] = saved[0], saved[1]
        finviz.TEXT_KEYS.clear()
        finviz.TEXT_KEYS.update(saved[2])


def fetch_universe(filters, max_tickers=5000, log=print):
    """Cały zbiór z Finviz bez limitu 1000 wierszy: gdy wyników jest więcej, pobiera osobno każdy sektor i skleja bez duplikatów. -> (wiersze, razem)."""
    with _universe_view():
        _, total = finviz.fetch_view("152", filters, 20)
        if total is None or total <= FREE_LIMIT or "sec_" in filters:
            rows, total2 = finviz.fetch_view("152", filters, min(max_tickers, FREE_LIMIT))
            if total2 and total2 > FREE_LIMIT:
                log(f"⚠️  Finviz ma {total2} wyników, a darmowy screener oddaje tylko {FREE_LIMIT} — zawęź filtry.")
            return rows, total2
        log(f"Finviz: {total} wyników (limit darmowego screenera to {FREE_LIMIT}) — pobieram sektor po sektorze…")
        out, seen = [], set()
        for sec in SECTORS:
            part, tot = finviz.fetch_view("152", f"{filters},sec_{sec}", FREE_LIMIT)
            if tot and tot > FREE_LIMIT:
                log(f"⚠️  Sektor {sec}: {tot} wyników > {FREE_LIMIT} — pobieram tylko pierwsze {FREE_LIMIT}; zawęź filtry.")
            for r in part:
                if r["ticker"] not in seen:
                    seen.add(r["ticker"])
                    out.append(r)
            log(f"  {sec}: {len(part)} (razem {len(out)})")
        return out[:max_tickers], len(out)


# ---------- etap 2: ceny kandydatów ----------

def sanitize_frames(frames, log=print):
    """Usuwa świece z zerową / ujemną / brakującą ceną (Yahoo zdarza się oddać Low = 0) — jedna taka świeca wywala obliczenia dzieleniem przez zero."""
    cols = ["Open", "High", "Low", "Close"]
    out, bad = {}, 0
    for t, df in frames.items():
        try:
            ok = (df[cols] > 0).all(axis=1)
            if not ok.all():
                bad += 1
                attrs = dict(df.attrs)
                df = df[ok]
                df.attrs.update(attrs)
        except Exception:
            pass
        if len(df):
            out[t] = df
    if bad:
        log(f"ℹ️  Usunięto błędne świece (cena ≤ 0) w {bad} spółkach.")
    return out


@contextmanager
def _safe_metrics(log=print):
    """Błąd obliczeń jednej spółki ją pomija, a nie przerywa całego skanu."""
    orig = watchlist.compute_metrics

    def wrapped(df, *a, **k):
        try:
            return orig(df, *a, **k)
        except Exception as e:
            log(f"⚠️  Pominięto spółkę (błąd obliczeń: {type(e).__name__}: {e}).")
            return None
    watchlist.compute_metrics = wrapped
    try:
        yield
    finally:
        watchlist.compute_metrics = orig


def annotate(row, windows):
    """Pola do kolumn: w których oknach spółka jest w górnych X % i największa z ich relacji cena / min Low."""
    row["qm_windows"] = " ".join(WINDOWS[w][1] for w in WINDOWS if w in windows)
    ratios = [row[WINDOWS[w][0]] for w in windows if _num(row.get(WINDOWS[w][0])) is not None]
    row["qm_max_ratio"] = max(ratios) if ratios else None


def run(cfg=None, data_dir=None, filters=None, two_stage=True, log=print):
    """-> 0 / 1. Zapisuje watchlist_qm.json i charts_qm.json w data_dir.
    two_stage=True (domyślnie): etap 1 wybiera kandydatów (czołówka rankingów zwrotów z Finviz), ceny tylko ich. two_stage=False: ceny dla całego zbioru."""
    cfg = normalize(cfg)
    data_dir = Path(data_dir or DATA_DIR)
    filters = filters or DEFAULT_FILTERS
    log(f"Etap 1 (tylko Finviz): filtr {filters}")
    try:
        universe, total = fetch_universe(filters, log=log)
    except Exception as e:
        log(f"❌ Finviz niedostępny ({e}) — zostają poprzednie pliki.")
        return 1
    if len(universe) < MIN_UNIVERSE:
        log(f"❌ Finviz zwrócił tylko {len(universe)} spółek (<{MIN_UNIVERSE}) — wygląda na blokadę / zmianę strony; zostają poprzednie pliki.")
        return 1
    if two_stage:
        cands = candidates(universe, cfg)
        pool = pool_pairs(universe)
        log(f"Etap 1: {len(universe)} spółek w zbiorze → {len(cands)} kandydatów do pobrania cen ({len(cands) / len(universe):.0%}; czołówka zwrotów 1M / 3M / 6M wśród płynnych).")
    else:
        cands, pool = universe, None   # wszystkie spółki mają ceny, więc „górne X %” liczymy wprost od liczby płynnych (bez przybliżonej puli z Finviz)
        log(f"Etap 1: {len(universe)} spółek w zbiorze — ceny pobieram dla wszystkich.")
    tickers = [c["ticker"] for c in cands]
    log(f"Etap 2 (yfinance): ceny {len(tickers)} kandydatów + benchmark…")
    frames = sanitize_frames(watchlist.download_prices(tickers, period=QM_PERIOD), log)
    coverage = len(frames) / len(tickers) if tickers else 0
    log(f"Ceny dla {len(frames)}/{len(tickers)} spółek ({coverage:.0%}).")
    if coverage < watchlist.MIN_COVERAGE:
        log(f"❌ Pokrycie cen poniżej {watchlist.MIN_COVERAGE:.0%} — przerywam bez zapisu (zostają poprzednie pliki).")
        return 1
    try:
        benchmark_df = watchlist.download_prices([watchlist.BENCHMARK], period=QM_PERIOD).get(watchlist.BENCHMARK)
    except Exception as e:
        log(f"⚠️  Benchmark {watchlist.BENCHMARK} niedostępny ({e}) — wykresy bez linii S&P 500.")
        benchmark_df = None
    now_utc = datetime.now(timezone.utc)
    now_ts = watchlist.pd.Timestamp(now_utc)
    with _safe_metrics(log):
        stocks = watchlist.build_stocks(cands, frames, now_ts, bench_df=benchmark_df)
    kept = keep(stocks, cfg)
    log(f"Po obliczeniach: {len(stocks)} spółek, {len(kept)} powyżej progów pobierania (obrót ≥ {cfg['keep_dollar_mln']:g} mln $, ADR ≥ {cfg['keep_adr']:g} %).")
    if not kept:
        log("❌ Żadna spółka nie przeszła progów pobierania — nie zapisuję.")
        return 1
    if two_stage:
        picked_now = select(kept, cfg, pool=pool)
        depth, n = proxy_depth(universe, cfg, list(picked_now))
        log(f"Kontrola zapasu kandydatów: najgłębszy wybrany był {depth}. w rankingu Finviz (z {n} branych z każdego).")
        if depth > 0.8 * n:
            log("⚠️  Wybrane spółki sięgają końca listy kandydatów — część mogła zostać pominięta; uruchom workflow bez dwuetapowego trybu (two_stage = false).")
    # wykresy tylko dla czołówki (progi listy, górne chart_top_pct % — trochę szerzej niż górne X % listy), żeby plik został mały (ok. 20 kB na spółkę);
    # reszta ma dane liczbowe bez wykresu
    chart_pick = select(kept, cfg, cfg["chart_top_pct"], pool)
    for r in kept:
        annotate(r, chart_pick.get(r["ticker"], []))
    chart_tickers = [r["ticker"] for r in kept if r["ticker"] in chart_pick]
    charts = watchlist.build_charts(chart_tickers, frames, benchmark_df, {}, now_ts)
    for r in kept:
        summary = ((charts or {}).get("stocks", {}).get(r["ticker"]) or {}).get("rs_line") or {}
        r["rs_line_state"] = summary.get("state")
        r["rs_line_dist_pct"] = summary.get("dist_pct")
        r["has_chart"] = bool(charts and r["ticker"] in charts.get("stocks", {}))
    payload = {
        "generated_at": now_utc.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "data_as_of": max((s["as_of"] for s in kept), default=None),
        "qm_filters": filters,
        "qm_cfg": cfg,
        "qm_universe": len(universe),
        "qm_pool": pool or [],
        "qm_two_stage": bool(two_stage),
        "n_stocks": len(kept),
        "stocks": kept,
    }
    data_dir.mkdir(parents=True, exist_ok=True)
    out = data_dir / "watchlist_qm.json"
    out.write_text(json.dumps(payload, ensure_ascii=False, allow_nan=False, separators=(",", ":")), encoding="utf-8")
    log(f"💾 Zapisano {out} ({len(kept)} spółek, dane z sesji {payload['data_as_of']}).")
    if charts is not None:
        cout = data_dir / "charts_qm.json"
        cout.write_text(json.dumps(charts, ensure_ascii=False, allow_nan=False, separators=(",", ":")), encoding="utf-8")
        log(f"💾 Zapisano {cout} (wykresy {len(charts['stocks'])} spółek, {cout.stat().st_size / 1e6:.1f} MB).")
    return 0


def main(argv=None):
    p = argparse.ArgumentParser(description="Skan Qullamaggie na samych cenach -> docs/data/watchlist_qm.json + charts_qm.json")
    p.add_argument("--min-dollar", type=float, default=None, help="Próg obrotu dziennego w mln $ dla listy (domyślnie 60).")
    p.add_argument("--min-adr", type=float, default=None, help="Próg ADR %% dla listy (domyślnie 3).")
    p.add_argument("--top-pct", type=float, default=None, help="Górne X %% z każdego okna 1M / 3M / 6M (domyślnie 10).")
    p.add_argument("--keep-dollar", type=float, default=None, help="Próg pobierania: obrót w mln $ (domyślnie 60) — poniżej spółka nie jest zapisywana.")
    p.add_argument("--keep-adr", type=float, default=None, help="Próg pobierania: ADR %% (domyślnie 2).")
    p.add_argument("--chart-top-pct", type=float, default=None, help="Wykresy tylko dla górnych X %% z każdego okna (domyślnie 15).")
    p.add_argument("--filters", type=str, default=None, help="Filtr Finviz (kody po przecinku); domyślnie skaner użytkownika: " + DEFAULT_FILTERS + ".")
    p.add_argument("--full", action="store_true", help="Ceny dla CAŁEGO zbioru z Finviz zamiast samych kandydatów z czołówki rankingów (dokładniej, ale ~8× więcej pobierania).")
    p.add_argument("--data-dir", type=str, default=None, help="Katalog wyjściowy (domyślnie docs/data).")
    a = p.parse_args(argv)
    cfg = {k: v for k, v in {"min_dollar_mln": a.min_dollar, "min_adr": a.min_adr, "top_pct": a.top_pct, "keep_dollar_mln": a.keep_dollar,
                             "keep_adr": a.keep_adr, "chart_top_pct": a.chart_top_pct}.items() if v is not None}
    return run(cfg, a.data_dir, a.filters, not a.full)


if __name__ == "__main__":
    raise SystemExit(main())
