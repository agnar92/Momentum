"""Watchlisty — ręczne listy spółek (nazwa + filtr Finviz) z pełną analizą TYGODNIOWĄ: RS Rating, EPS Rating i Composite do sortowania.

Workflow `Watchlisty` (watchlists.yml) uruchamia ten skrypt na żądanie. **Lista** = nazwa + filtr Finviz (pole tekstowe `filters`: kody `cap_midover,sh_curvol_o1000,…`,
zapis `cap:midover sh_curvol:o1000 …` albo cały link ze skanera Finviz). Listy są zapamiętane w docs/data/watchlists_def.json; workflow ma akcje `add` (dodaj / zmień listę),
`remove` (usuń listę) i `refresh` (odśwież wszystkie). Każde uruchomienie skanuje WSZYSTKIE zapamiętane listy (fundamenty z Finviz jak w głównej liście), pobiera z yfinance ceny
sumy spółek (bez duplikatów), kwartalne EPS (osobna pamięć docs/data/eps_cache_watchlists.json) i liczy to samo co `watchlist.py`: RS Rating, EPS Rating, Composite, Acc/Dis,
bazy, flagi, wykresy tygodniowe (Dar-Card i słupkowy). Oceny to percentyle wśród WSZYSTKICH spółek ze wszystkich list razem (nie rynku). Wykresów dziennych nie ma.
Wynik: docs/data/watchlists.json (spółki z polem `lists` = do których list należą) i docs/data/charts_watchlists.json — zakładka Watchlisty w aplikacji czyta te pliki.
Nie rusza watchlist.json / charts.json / eps_cache.json (lista CANSLIM, pobierana raz w tygodniu) ani migawki raw-data.
"""
import argparse
import json
import re
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

import finviz
import watchlist

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "docs" / "data"
MAX_PER_LIST = 1000         # tyle spółek bierzemy z jednej listy = limit darmowego screenera Finviz (r=1001 daje 403); każda lista to 4 widoki po 20 wierszy (~3 min na 1000) + EPS z Yahoo (~6 min)
# Domyślna lista (zwykły skaner trendu z Finviz), gdy nie ma jeszcze pliku z listami.
DEFAULT_LIST_NAME = "Watchlista"
DEFAULT_FILTERS = "cap_midover,sh_avgvol_o1000,ta_sma20_pa,ta_sma50_pa,ta_sma200_pa"
LISTS_FILE = "watchlists_def.json"
DATA_FILE = "watchlists.json"
CHARTS_FILE = "charts_watchlists.json"
EPS_FILE = "eps_cache_watchlists.json"
GLB_FILE = "glb_cache_watchlists.json"
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


def fetch_list(filters, max_tickers=MAX_PER_LIST, log=print):
    """Lista ze skanera Finviz z fundamentami (widoki Overview / Valuation / Financial / własny) -> (wiersze, razem według Finviz)."""
    rows, total = finviz.fetch_watchlist(filters, max_tickers)
    if total and total > max_tickers:
        log(f"⚠️  Finviz ma {total} wyników, bierzemy pierwsze {max_tickers} — zawęź filtry.")
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


def _read_json(path):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def _scan(sel, data_dir, now_utc, log):
    """Pełny potok dla list `sel` (Finviz -> ceny -> metryki -> EPS -> oceny -> wykresy tygodniowe). -> (kod 0/1, stocks, charts, info, members);
    oceny (percentyle) wśród spółek TYCH list."""
    now_ts = watchlist.pd.Timestamp(now_utc)
    rows_by_ticker, members, info = {}, {}, []
    for lst in sel:
        log(f"Lista „{lst['name']}”: {lst['filters']}")
        try:
            rows, total = fetch_list(lst["filters"], log=log)
        except Exception as e:
            log(f"❌ Finviz niedostępny ({e}) — zostają poprzednie pliki.")
            return 1, [], None, [], {}
        if not rows:
            log(f"⚠️  Lista „{lst['name']}” jest teraz pusta (żadna spółka nie spełnia filtra) — sprawdź kody, jeśli to nieoczekiwane.")
        for r in rows:
            rows_by_ticker.setdefault(r["ticker"], r)
            members.setdefault(r["ticker"], []).append(lst["name"])
        info.append({"name": lst["name"], "filters": lst["filters"], "n": len(rows), "finviz_total": total})
    tickers = list(rows_by_ticker)
    if not tickers:
        if sel:
            log("❌ Żadna lista nie zwróciła spółek (brak spółek spełniających filtry, blokada Finviz albo zmiana układu strony) — zostają poprzednie pliki.")
            return 1, [], None, info, members
        return 0, [], None, info, members
    log(f"Spółek: {len(tickers)}. Pobieram ceny z yfinance…")
    frames = sanitize_frames(watchlist.download_prices(tickers), log)
    coverage = len(frames) / len(tickers)
    log(f"Ceny dla {len(frames)}/{len(tickers)} spółek ({coverage:.0%}).")
    if coverage < watchlist.MIN_COVERAGE:
        log(f"❌ Pokrycie cen poniżej {watchlist.MIN_COVERAGE:.0%} — przerywam bez zapisu (zostają poprzednie pliki).")
        return 1, [], None, info, members
    try:
        benchmark_df = watchlist.download_prices([watchlist.BENCHMARK]).get(watchlist.BENCHMARK)
    except Exception as e:
        log(f"⚠️  Benchmark {watchlist.BENCHMARK} niedostępny ({e}) — bez linii RS i S&P 500.")
        benchmark_df = None
    with _safe_metrics(log):
        stocks = watchlist.build_stocks(list(rows_by_ticker.values()), frames, now_ts, bench_df=benchmark_df)
    if not stocks:
        log("❌ Żadna spółka nie przeszła obliczeń — nie zapisuję.")
        return 1, [], None, info, members
    try:
        eps_cache = watchlist.update_eps_cache([s["ticker"] for s in stocks], data_dir / EPS_FILE)
    except Exception as e:
        log(f"⚠️  Krok EPS pominięty ({e}) — bez EPS Rating i Composite.")
        eps_cache = {}
    watchlist.add_eps_rating(stocks, eps_cache)    # EPS Rating i Composite (RS + EPS)
    charts = watchlist.build_charts([s["ticker"] for s in stocks], frames, benchmark_df, eps_cache, now_ts)
    for s in stocks:
        summary = ((charts or {}).get("stocks", {}).get(s["ticker"]) or {}).get("rs_line") or {}
        s["rs_line_state"] = summary.get("state")
        s["rs_line_dist_pct"] = summary.get("dist_pct")
    try:
        glb_cache = watchlist.update_glb_cache(frames, data_dir / GLB_FILE)   # GLB: rekord wszech czasów z historii miesięcznej (osobny cache)
    except Exception as e:
        log(f"⚠️  Krok GLB (historia miesięczna) pominięty ({e}) — rekord z ostatnich 10 lat.")
        glb_cache = watchlist._read_json(data_dir / GLB_FILE, {})
    watchlist.add_glb(stocks, charts, frames, glb_cache, now_ts)
    return 0, stocks, charts, info, members


def _sort_stocks(stocks):
    stocks.sort(key=lambda s: (s.get("composite_rating") is None, -(s.get("composite_rating") or 0), s["ticker"]))


def _rerate(stocks):
    """Przelicza percentyle (RS, Acc/Dis, siła grupy, EPS, Composite) z zapisanych wyników po zmianie składu spółek — bez pobierania danych."""
    watchlist.add_rs_rating(stocks)
    watchlist.add_accdis_rating(stocks)
    watchlist.add_group_strength(stocks)
    watchlist.finalize_eps_rating(stocks)
    _sort_stocks(stocks)


def _realign(chart, old_weeks, new_weeks):
    """Tablice tygodniowe starego wykresu (po jednej wartości na tydzień) przenosi na nową oś tygodni po datach (brak = None)."""
    if old_weeks == new_weeks:
        return chart
    pos = {d: i for i, d in enumerate(old_weeks)}
    out = {}
    for k, v in chart.items():
        if isinstance(v, list) and len(v) == len(old_weeks):
            v = [v[pos[d]] if d in pos else None for d in new_weeks]
        out[k] = v
    return out


def _finish(data_dir, lists, info, stocks, charts, now_utc, log, charts_replace=True):
    watchlist.add_darvas_state(stocks, charts)   # stan karty Darvasa (dv_*) liczony przy każdej akcji z aktualnych wykresów dziennych
    meta = {"generated_at": now_utc.strftime("%Y-%m-%dT%H:%M:%SZ"), "lists": info}
    data_dir.mkdir(parents=True, exist_ok=True)
    payload = {**meta, "data_as_of": max((s["as_of"] for s in stocks), default=None), "n_stocks": len(stocks), "stocks": stocks}
    _write_json(data_dir / LISTS_FILE, {"lists": lists})
    _write_json(data_dir / DATA_FILE, payload)
    log(f"💾 Zapisano listy ({len(lists)}) i {len(stocks)} spółek, dane z sesji {payload['data_as_of']}.")
    if charts is not None:
        cout = data_dir / CHARTS_FILE
        _write_json(cout, charts)
        log(f"💾 Zapisano {cout} (wykresy tygodniowe {len(charts['stocks'])} spółek, {cout.stat().st_size / 1e6:.1f} MB).")
    return 0


def run(data_dir=None, action="refresh", name="", filters="", log=print):
    """-> 0 / 1 / 2; zapisuje watchlists_def.json, watchlists.json i charts_watchlists.json w data_dir (przy błędzie zostają poprzednie pliki).
    Każda akcja robi tylko swoje:
      remove  — usuwa listę i jej wyłącznych członków z zapisanych plików, BEZ sieci i bez odświeżania pozostałych list;
      add     — skanuje tylko dodaną / zmienioną listę (i listy, których jeszcze nigdy nie skanowano), resztę bierze z poprzednich plików;
      refresh — skanuje WSZYSTKIE listy od nowa."""
    data_dir = Path(data_dir or DATA_DIR)
    old_lists = load_lists(data_dir / LISTS_FILE)
    try:
        lists, msg = apply_action(old_lists, action, name, filters)
    except ValueError as e:
        log(f"❌ {e}")
        return 2
    log(msg)
    now_utc = datetime.now(timezone.utc)
    action = (action or "refresh").strip()
    old_data = _read_json(data_dir / DATA_FILE) or {}
    old_charts = _read_json(data_dir / CHARTS_FILE) or {}
    scanned = {x["name"].lower() for x in old_data.get("lists", [])}
    if action == "remove" and old_data.get("stocks") is not None:
        gone = name.strip().lower()
        stocks = []
        for s in old_data["stocks"]:
            mem = [m for m in s.get("lists", []) if m.lower() != gone]
            if mem:
                stocks.append({**s, "lists": mem})
        counts = {}
        for s in stocks:
            for m in s["lists"]:
                counts[m] = counts.get(m, 0) + 1
        info = [{**x, "n": counts.get(x["name"], 0)} for x in old_data.get("lists", []) if x["name"].lower() != gone]
        keep = {s["ticker"] for s in stocks}
        charts = {**old_charts, "stocks": {t: c for t, c in (old_charts.get("stocks") or {}).items() if t in keep}} if old_charts else None
        if charts:
            charts.pop("daily", None)   # dawny dzienny blok (Darvas jest już tygodniowy)
        if stocks:
            _rerate(stocks)
        log("Bez odświeżania pozostałych list — tylko usunięcie.")
        return _finish(data_dir, lists, info, stocks, charts, now_utc, log)
    if action == "add" and old_data.get("stocks") is not None:
        target = name.strip().lower()
        sel = [x for x in lists if x["name"].lower() == target or x["name"].lower() not in scanned]
        code, new_stocks, new_charts, new_info, members = _scan(sel, data_dir, now_utc, log)
        if code:
            return code
        redo = {x["name"].lower() for x in sel}
        fresh = {s["ticker"] for s in new_stocks}
        stocks, by_old = list(new_stocks), {}
        for s in old_data["stocks"]:
            mem = [m for m in s.get("lists", []) if m.lower() not in redo]
            if s["ticker"] in fresh:
                by_old[s["ticker"]] = mem   # przynależność do list, których nie skanowaliśmy
            elif mem:
                stocks.append({**s, "lists": mem})
        order = {x["name"]: i for i, x in enumerate(lists)}
        for s in new_stocks:
            s["lists"] = sorted(set(members.get(s["ticker"], [])) | set(by_old.get(s["ticker"], [])), key=lambda m: order.get(m, 99))
        for s in stocks:
            s["lists"] = sorted(s["lists"], key=lambda m: order.get(m, 99))
        counts = {}
        for s in stocks:
            for m in s["lists"]:
                counts[m] = counts.get(m, 0) + 1
        by_name = {x["name"].lower(): x for x in old_data.get("lists", [])}
        by_name.update({x["name"].lower(): x for x in new_info})
        info = [{**by_name[x["name"].lower()], "name": x["name"], "filters": x["filters"], "n": counts.get(x["name"], 0)} for x in lists if x["name"].lower() in by_name]
        _rerate(stocks)
        charts = new_charts
        if old_charts.get("stocks") and new_charts is not None:
            charts = {**new_charts, "stocks": dict(new_charts["stocks"])}
            have = {s["ticker"] for s in stocks}
            for t, c in old_charts["stocks"].items():
                if t in have and t not in charts["stocks"]:
                    charts["stocks"][t] = _realign(c, old_charts.get("weeks", []), new_charts["weeks"])
        log("Przeskanowano tylko: " + ", ".join(x["name"] for x in sel) + " — pozostałe listy bez odświeżania.")
        return _finish(data_dir, lists, info, stocks, charts, now_utc, log)
    code, stocks, charts, info, members = _scan(lists, data_dir, now_utc, log)   # refresh (albo add / remove bez poprzednich plików) = wszystkie listy
    if code:
        return code
    if not stocks:
        log("Nie ma już żadnej listy — zapisuję pusty wynik.")
        _write_json(data_dir / LISTS_FILE, {"lists": lists})
        data_dir.mkdir(parents=True, exist_ok=True)
        _write_json(data_dir / DATA_FILE, {"generated_at": now_utc.strftime("%Y-%m-%dT%H:%M:%SZ"), "lists": info, "data_as_of": None, "n_stocks": 0, "stocks": []})
        _write_json(data_dir / CHARTS_FILE, {"stocks": {}})
        return 0
    for s in stocks:
        s["lists"] = members.get(s["ticker"], [])
    _sort_stocks(stocks)
    return _finish(data_dir, lists, info, stocks, charts, now_utc, log)


def main(argv=None):
    p = argparse.ArgumentParser(description="Watchlisty: zapamiętane listy (nazwa + filtr Finviz), RS / EPS / Composite, wykresy tygodniowe -> docs/data/watchlists.json + charts_watchlists.json")
    p.add_argument("--action", default="refresh", choices=ACTIONS, help="add = dodaj / zmień listę i przeskanuj tylko ją (--name, --filters), remove = usuń listę bez odświeżania pozostałych (--name), refresh = odśwież wszystkie.")
    p.add_argument("--name", default="", help="Nazwa listy.")
    p.add_argument("--filters", default="", help="Filtr Finviz: kody po przecinku, zapis cap:midover sh_curvol:o1000 … albo cały link ze skanera.")
    p.add_argument("--data-dir", type=str, default=None, help="Katalog wyjściowy (domyślnie docs/data).")
    a = p.parse_args(argv)
    return run(a.data_dir, a.action, a.name, a.filters)


if __name__ == "__main__":
    raise SystemExit(main())
