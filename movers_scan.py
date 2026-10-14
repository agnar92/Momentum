"""Movers — ręczny skan spółek na SAMYCH CENACH (bez fundamentów, EPS i estymat), z zapamiętanymi listami.

Workflow `Movers` (movers.yml) uruchamia ten skrypt na żądanie. **Lista** = nazwa + filtr Finviz (pole tekstowe `filters`: kody `cap_midover,sh_curvol_o1000,…`,
zapis `cap:midover sh_curvol:o1000 …` albo cały link ze skanera Finviz). Listy są zapamiętane w docs/data/movers_lists.json; workflow ma akcje `add` (dodaj / zmień listę),
`remove` (usuń listę) i `refresh` (odśwież wszystkie). Każde uruchomienie skanuje WSZYSTKIE zapamiętane listy, pobiera z yfinance 3 lata cen dziennych dla sumy spółek
(bez duplikatów) i liczy średnie, Dar-Card oraz wykresy tygodniowe i dzienne. Wynik: docs/data/watchlist_movers.json (spółki z dzisiejszą zmianą, wolumenem, polem `lists`
= do których list należą) i docs/data/charts_movers.json — zakładka Movers w aplikacji czyta te pliki i pokazuje listy jako podkategorie.
Nie rusza watchlist.json / charts.json (lista CANSLIM, pobierana raz w tygodniu) ani migawki raw-data.
"""
import argparse
import json
import re
from urllib.parse import parse_qs, unquote, urlparse
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

import finviz
import watchlist

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "docs" / "data"
MOVERS_PERIOD = "3y"        # 3 lata dziennych cen: SMA 10 / 40 tygodni, SMA 10 / 50 sesji, Dar-Card, wykres słupkowy (tygodniowy i dzienny)
# Domyślna lista (skaner użytkownika z Finviz, v=111), gdy nie ma jeszcze pliku z listami.
DEFAULT_LIST_NAME = "Movers"
DEFAULT_FILTERS = "cap_midover,sh_curvol_o1000,ta_sma20_pc,ta_sma200_pa,ta_sma50_pc"
LISTS_FILE = "movers_lists.json"
ACTIONS = ("add", "remove", "refresh")
_FILTER_TOKEN = re.compile(r"^[a-z0-9]+_[a-z0-9._-]+$")


def parse_filters(text):
    """Pole „filters” -> kod Finviz po przecinku. Przyjmuje: link ze skanera Finviz (bierze parametr f=), kody `cap_midover,sh_curvol_o1000`
    albo zapis `cap:midover sh_curvol:o1000` (spacje / przecinki / nowe linie). Kształt kodu jest sprawdzany (Finviz po cichu ignoruje literówki
    i poszerza listę, więc nieznany kod to błąd tylko, gdy ma zły format — jego istnienie sprawdź liczbą spółek)."""
    raw = (text or "").strip()
    if not raw:
        raise ValueError("Puste pole filters.")
    if "finviz.com" in raw or "f=" in raw:
        q = parse_qs(urlparse(raw if "://" in raw else "https://" + raw).query)
        raw = (q.get("f") or [""])[0] or raw
    tokens = [t for t in re.split(r"[,\s]+", unquote(raw).strip().lower()) if t]
    out = []
    for t in tokens:
        t = t.replace(":", "_", 1)
        if not _FILTER_TOKEN.match(t):
            raise ValueError(f"Nieprawidłowy filtr {t!r} (oczekiwane np. cap:midover albo cap_midover).")
        if t not in out:
            out.append(t)
    if not out:
        raise ValueError("Puste pole filters.")
    return ",".join(out)


def load_lists(path):
    """Zapamiętane listy [{name, filters}]; bez pliku — jedna lista domyślna."""
    try:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
        lists = [{"name": str(x["name"]), "filters": str(x["filters"])} for x in data.get("lists", []) if x.get("name") and x.get("filters")]
        return lists
    except FileNotFoundError:
        return [{"name": DEFAULT_LIST_NAME, "filters": DEFAULT_FILTERS}]
    except (ValueError, KeyError, TypeError):
        raise ValueError(f"Uszkodzony plik {path} — popraw go lub usuń.")


def apply_action(lists, action, name="", filters=""):
    """Zwraca (nowe listy, komunikat). add: dodaje listę albo podmienia filtr o tej samej nazwie; remove: usuwa; refresh: bez zmian."""
    action = (action or "refresh").strip()
    name = (name or "").strip()
    if action not in ACTIONS:
        raise ValueError(f"Nieznana akcja {action!r}; dozwolone: {', '.join(ACTIONS)}")
    lists = [dict(x) for x in lists]
    if action == "add":
        if not name:
            raise ValueError("Akcja add wymaga nazwy listy (pole name).")
        parsed = parse_filters(filters)
        for x in lists:
            if x["name"].lower() == name.lower():
                x["filters"] = parsed
                return lists, f"Zmieniono filtr listy „{x['name']}”."
        lists.append({"name": name, "filters": parsed})
        return lists, f"Dodano listę „{name}”."
    if action == "remove":
        if not name:
            raise ValueError("Akcja remove wymaga nazwy listy (pole name).")
        keep = [x for x in lists if x["name"].lower() != name.lower()]
        if len(keep) == len(lists):
            raise ValueError(f"Nie ma listy „{name}”; są: {', '.join(x['name'] for x in lists) or '(brak)'}.")
        return keep, f"Usunięto listę „{name}”."
    return lists, "Odświeżenie wszystkich list."


FREE_LIMIT = 1000           # darmowy screener Finviz nie oddaje wierszy powyżej 1000 (r=1001 -> 403)
# Widok własny Finviz (c=…): kolumny skanera dnia. Nagłówki tak, jak zwraca je strona.
VIEW_COLUMNS = {"Company": "company", "Sector": "sector", "Industry": "industry", "Market Cap": "market_cap", "Price": "price_fv",
                "Change %": "change_pct", "Volume": "volume", "Avg Volume": "avg_volume", "Rel Volume": "rel_volume"}
VIEW_IDS = "0,1,2,3,4,6,65,66,67,63,64"   # No., Ticker, Company, Sector, Industry, Market Cap, Price, Change %, Volume, Avg Volume, Rel Volume
EXTRA_KEYS = ("price_fv", "change_pct", "volume", "avg_volume", "rel_volume")
# Oceny względne (percentyl wśród spółek na liście) nie mają sensu na liście ruchów dnia — zerujemy je, żeby nie wprowadzały w błąd.
RELATIVE_KEYS = ("rs_rating", "accdis_rating", "accdis", "industry_rating", "leader")


@contextmanager
def _movers_view():
    """Na czas pobierania widok własny „152” zwraca kolumny skanera dnia (zmiana, wolumen, wolumen względny…) zamiast kolumn fundamentów."""
    saved = (finviz.VIEW_COLUMNS.get("152"), finviz.VIEW_PARAMS.get("152"), set(finviz.TEXT_KEYS))
    finviz.VIEW_COLUMNS["152"], finviz.VIEW_PARAMS["152"] = dict(VIEW_COLUMNS), {"c": VIEW_IDS}
    finviz.TEXT_KEYS.update({"company", "sector", "industry"})
    try:
        yield
    finally:
        finviz.VIEW_COLUMNS["152"], finviz.VIEW_PARAMS["152"] = saved[0], saved[1]
        finviz.TEXT_KEYS.clear()
        finviz.TEXT_KEYS.update(saved[2])


def fetch_movers(filters, log=print):
    """Lista ze skanera Finviz (widok własny z kolumnami dnia). -> (wiersze, razem według Finviz)."""
    with _movers_view():
        rows, total = finviz.fetch_view("152", filters, FREE_LIMIT)
    if total and total > FREE_LIMIT:
        log(f"⚠️  Finviz ma {total} wyników, a darmowy screener oddaje tylko {FREE_LIMIT} — zawęź filtry.")
    return rows, total


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


def _write_json(path, obj):
    Path(path).write_text(json.dumps(obj, ensure_ascii=False, allow_nan=False, separators=(",", ":")), encoding="utf-8")


def run(data_dir=None, action="refresh", name="", filters="", log=print):
    """-> 0 / 1 / 2. Akcja na zapamiętanych listach, potem skan WSZYSTKICH list: zapisuje movers_lists.json, watchlist_movers.json i charts_movers.json
    w data_dir (przy błędzie zostają poprzednie pliki)."""
    data_dir = Path(data_dir or DATA_DIR)
    try:
        lists, msg = apply_action(load_lists(data_dir / LISTS_FILE), action, name, filters)
    except ValueError as e:
        log(f"❌ {e}")
        return 2
    log(msg)
    now_utc = datetime.now(timezone.utc)
    now_ts = watchlist.pd.Timestamp(now_utc)
    rows_by_ticker, members, info = {}, {}, []
    for lst in lists:
        log(f"Lista „{lst['name']}”: {lst['filters']}")
        try:
            rows, total = fetch_movers(lst["filters"], log)
        except Exception as e:
            log(f"❌ Finviz niedostępny ({e}) — zostają poprzednie pliki.")
            return 1
        if not rows:
            log(f"⚠️  Lista „{lst['name']}” jest teraz pusta (żadna spółka nie spełnia filtra) — sprawdź kody, jeśli to nieoczekiwane.")
        for r in rows:
            rows_by_ticker.setdefault(r["ticker"], r)
            members.setdefault(r["ticker"], []).append(lst["name"])
        info.append({"name": lst["name"], "filters": lst["filters"], "n": len(rows), "finviz_total": total})
    data_dir.mkdir(parents=True, exist_ok=True)
    meta = {"generated_at": now_utc.strftime("%Y-%m-%dT%H:%M:%SZ"), "lists": info}
    tickers = list(rows_by_ticker)
    if not tickers and lists:
        log("❌ Żadna lista nie zwróciła spółek (brak ruchów spełniających filtry, blokada Finviz albo zmiana układu strony) — zostają poprzednie pliki.")
        return 1
    if not tickers:
        log("Nie ma już żadnej listy — zapisuję pusty wynik.")
        _write_json(data_dir / LISTS_FILE, {"lists": lists})
        _write_json(data_dir / "watchlist_movers.json", {**meta, "data_as_of": None, "n_stocks": 0, "stocks": []})
        _write_json(data_dir / "charts_movers.json", {"stocks": {}})
        return 0
    log(f"Spółek razem: {len(tickers)}. Pobieram {MOVERS_PERIOD} cen z yfinance…")
    frames = sanitize_frames(watchlist.download_prices(tickers, period=MOVERS_PERIOD), log)
    coverage = len(frames) / len(tickers)
    log(f"Ceny dla {len(frames)}/{len(tickers)} spółek ({coverage:.0%}).")
    if coverage < watchlist.MIN_COVERAGE:
        log(f"❌ Pokrycie cen poniżej {watchlist.MIN_COVERAGE:.0%} — przerywam bez zapisu (zostają poprzednie pliki).")
        return 1
    try:
        benchmark_df = watchlist.download_prices([watchlist.BENCHMARK], period=MOVERS_PERIOD).get(watchlist.BENCHMARK)
    except Exception as e:
        log(f"⚠️  Benchmark {watchlist.BENCHMARK} niedostępny ({e}) — wykresy bez linii S&P 500.")
        benchmark_df = None
    with _safe_metrics(log):
        stocks = watchlist.build_stocks(list(rows_by_ticker.values()), frames, now_ts, bench_df=benchmark_df)
    if not stocks:
        log("❌ Żadna spółka nie przeszła obliczeń — nie zapisuję.")
        return 1
    for s in stocks:
        row = rows_by_ticker.get(s["ticker"], {})
        s.update({k: row.get(k) for k in EXTRA_KEYS})
        s.update({k: None for k in RELATIVE_KEYS})
        s["lists"] = members.get(s["ticker"], [])
    stocks.sort(key=lambda s: s.get("change_pct") if isinstance(s.get("change_pct"), (int, float)) else float("-inf"), reverse=True)
    charts = watchlist.build_charts([s["ticker"] for s in stocks], frames, benchmark_df, {}, now_ts)
    for s in stocks:
        summary = ((charts or {}).get("stocks", {}).get(s["ticker"]) or {}).get("rs_line") or {}
        s["rs_line_state"] = summary.get("state")
        s["rs_line_dist_pct"] = summary.get("dist_pct")
    payload = {**meta, "data_as_of": max((s["as_of"] for s in stocks), default=None), "n_stocks": len(stocks), "stocks": stocks}
    _write_json(data_dir / LISTS_FILE, {"lists": lists})
    _write_json(data_dir / "watchlist_movers.json", payload)
    log(f"💾 Zapisano listy ({len(lists)}) i {len(stocks)} spółek, dane z sesji {payload['data_as_of']}.")
    if charts is not None:
        cout = data_dir / "charts_movers.json"
        _write_json(cout, charts)
        log(f"💾 Zapisano {cout} (wykresy tygodniowe i dzienne {len(charts['stocks'])} spółek, {cout.stat().st_size / 1e6:.1f} MB).")
    return 0


def main(argv=None):
    p = argparse.ArgumentParser(description="Movers: zapamiętane listy (nazwa + filtr Finviz) + 3 lata cen -> docs/data/watchlist_movers.json + charts_movers.json")
    p.add_argument("--action", default="refresh", choices=ACTIONS, help="add = dodaj / zmień listę (--name, --filters), remove = usuń listę (--name), refresh = odśwież wszystkie.")
    p.add_argument("--name", default="", help="Nazwa listy.")
    p.add_argument("--filters", default="", help="Filtr Finviz: kody po przecinku, zapis cap:midover sh_curvol:o1000 … albo cały link ze skanera.")
    p.add_argument("--data-dir", type=str, default=None, help="Katalog wyjściowy (domyślnie docs/data).")
    a = p.parse_args(argv)
    return run(a.data_dir, a.action, a.name, a.filters)


if __name__ == "__main__":
    raise SystemExit(main())
