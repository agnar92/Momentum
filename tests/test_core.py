"""Testy bez sieci: Green Line, stan GLB, MACD, obrót, warunki, parser Finviz (3 układy strony), fundamenty SEC i odświeżenie z podmienionymi źródłami."""
import datetime as dt

import pytest

import json

import watchlist
from momentum import calc, finviz, prices, sec


def test_green_line_needs_three_closed_months_and_keeps_old_line():
    assert calc.green_line([10, 12, 11, 11]) == (None, None)            # rekord 12 stoi dopiero 2 miesiące
    assert calc.green_line([10, 12, 11, 11, 11]) == (12, 1)             # ≥ 3 miesiące -> linia
    assert calc.green_line([10, 12, 11, 11, 11, 15, 14]) == (12, 1)     # nowy rekord 15 jeszcze nie stoi 3 miesięcy: obowiązuje stara linia
    assert calc.green_line([10, 12, 11, 11, 11, 15, 14, 14, 14]) == (15, 5)
    assert calc.green_line([10, 12, 11, 11, 11, 11, 11, 11, 11])[0] == 12   # „3 lub więcej” — rekord stojący dłużej nadal jest linią


def test_blue_line_uses_weekly_highs_and_three_week_confirmation():
    assert calc.blue_line([10, 12] + [11] * 2) == (None, None)
    assert calc.blue_line([10, 12] + [11] * 3) == (12, 1)
    # A fresh higher high does not replace the confirmed old line until it has aged 3 closed weeks.
    assert calc.blue_line([10, 12] + [11] * 3 + [15, 14] + [14] * 1) == (12, 1)
    assert calc.blue_line([10, 12] + [11] * 3 + [15, 14] + [14] * 2) == (15, 5)


def test_build_row_blb_search_is_gated_by_uptrend_but_confirmed_line_persists():
    dates = [(dt.date(2025, 1, 6) + dt.timedelta(weeks=i)).isoformat() for i in range(40)]
    closes = [float(x) for x in range(1, 41)]
    weekly = {"d": dates, "o": closes, "h": [x + 1 for x in closes],
              "l": [x - 1 for x in closes], "c": closes, "v": [1000.0] * len(closes)}
    # An ATH formed during the uptrend (week 31) stays unbroken for 3 closed weeks.
    highs = [[dates[i], 10.0] for i in range(30)] + [[dates[30], 12.0]] + [[dates[i], 11.0] for i in range(31, 40)]
    up = calc.build_row({"ticker": "AAA"}, weekly, [], None, weekly_highs=highs)
    assert up["trend"] is True
    assert up["blb"] == 12.0
    assert up["blb_search_started"] is True

    down_closes = closes[:30] + [float(x) for x in range(0, -10, -1)]
    down_weekly = {**weekly, "c": down_closes}
    down = calc.build_row({"ticker": "AAA"}, down_weekly, [], None, weekly_highs=highs,
                          previous_row={"blb": 12.0, "blb_search_started": True})
    assert down["trend"] is False
    assert down["blb"] == 12.0
    assert down["blb_state"] is not None

    # ATHs formed while the trend filter is off cannot initiate a new BLB.
    down_history = [[dates[i], float(100 + i)] for i in range(10, 40)]
    no_new = calc.build_row({"ticker": "BBB"}, down_weekly, [], None, weekly_highs=down_history)
    assert no_new["blb"] is None

def test_glb_state():
    assert calc.glb_state(105, 99, 100) == "WYBICIE"
    assert calc.glb_state(105, 103, 100) == "SYGNAŁ"
    assert calc.glb_state(110, 103, 100) == "SYGNAŁ"
    assert calc.glb_state(111, 103, 100) == "NAD"
    assert calc.glb_state(125, 99, 100) == "WYBICIE"                    # tydzień przebicia: dowolnie wysoko = mocne wybicie


def test_fresh_blue_dot_only_in_last_sessions():
    n = 160
    c = [50 + i * 0.4 for i in range(n)]
    c[150:154] = [c[149] - 3, c[149] - 6, c[149] - 7, c[149] - 1]       # korekta w trendzie, potem odbicie: Stochastic przecina 20 w górę
    d = {"d": [f"2026-{1 + i // 28:02d}-{1 + i % 28:02d}" for i in range(n)], "h": [x + 1 for x in c], "l": [x - 1 for x in c], "c": c}
    assert calc.fresh_blue_dot(d, 40, sessions=10) == d["d"][153]
    assert calc.fresh_blue_dot(d, 40, sessions=5) is None                 # kropka starsza niż 5 sesji
    assert calc.fresh_blue_dot(d, 1e9) is None and calc.fresh_blue_dot(None, 40) is None
    assert calc.glb_state(99, 103, 100) == "POD"
    assert calc.glb_state(99, 103, None) == "BRAK"


def test_macd_cross_and_stop_is_low_of_cross_week():
    closes = [float(i) for i in range(1, 60)] + [60 - i * 2.0 for i in range(1, 15)]
    lows = [c - 1 for c in closes]
    _, _, h = calc.macd(closes)
    cross = calc.macd_cross_down(h)
    assert cross and h[cross[-1]] < 0 <= h[cross[-1] - 1]
    info = calc.macd_info(closes, lows)
    assert info["state"] == "pod" and info["stop"] == lows[cross[-1]]


def test_turnover_and_conditions():
    assert calc.turnover([10, 10, 10, 10], [5e7] * 4) == pytest.approx(1e8)
    good = {"turnover": 120e6, "rev_rr": 20, "dopm": 4}
    assert calc.passes(good) and calc.passes({**good, "turnover": 1e3})   # obrót nie jest warunkiem (filtr w Finviz)
    # RS, P/S i beat2 tylko informacyjnie (badanie 2011–2025: RS ≥ 50 pp obniżał wynik portfela)
    assert calc.passes({**good, "rs": 10, "ps": 40, "beat2": False})
    for k, v in (("rev_rr", 10), ("rev_rr", None), ("dopm", 2), ("dopm", None)):
        assert not calc.passes({**good, k: v})


def test_build_row():
    w = {"d": ["2026-01-05"] * 40, "o": [1] * 40, "h": [1] * 40, "l": [1] * 40, "c": [100.0] * 38 + [99.0, 104.0], "v": [3e6] * 40}
    row = calc.build_row({"ticker": "X"}, w, [50, 100, 90, 90, 90, 95], {"rev_rr": 30, "dopm": 5})
    assert row["glb"] == 100 and row["glb_state"] == "WYBICIE" and row["glb_pct"] == pytest.approx(4)
    assert row["turnover"] == pytest.approx(104 * 3e6 / 5, rel=0.05)
    assert row["rs"] is None and row["ok"]              # brak SPY -> brak RS, ale RS nie jest warunkiem
    r = calc.build_row({"ticker": "Y"}, W, [50, 100, 90, 90, 90, 95], {"rev_rr": 30, "dopm": 5}, SPY, EST)
    assert r["rs"] == pytest.approx(108) and r["ok"] and r["glb_state"] == "SYGNAŁ"
    assert r["surp"] == 8.0 and r["surp_prev"] == 4.0 and r["beat2"] and r["eps_rev"] == 12.0
    assert calc.build_row({"ticker": "Y"}, W, [50, 100, 90, 90, 90, 95], {"rev_rr": 30, "dopm": 5}, SPY)["ok"]   # niespodzianki tylko informacyjnie


def test_surprises_known_at_date_and_fresh():
    est = {"surp": [["2025-08-01", -2.0], ["2025-11-01", 3.0], ["2026-02-01", 6.0]]}
    assert calc.surprises(est, "2026-03-01") == (6.0, 3.0, True)
    assert calc.surprises(est, "2026-01-15") == (3.0, -2.0, False)          # raport z lutego jeszcze nieznany
    assert calc.surprises(est, "2026-07-01") == (None, None, None)          # ostatni raport starszy niż 120 dni
    assert calc.surprises(None, "2026-03-01") == (None, None, None)


def test_rel_strength_vs_spy():
    spy = {"d": W["d"], "c": [400.0] * 30 + [480.0] * 30}               # SPY +20 % w 52 tyg.
    assert calc.rel_strength(W, spy) == pytest.approx(108 - 20)
    assert calc.rel_strength(W, None) is None and calc.rel_strength({**W, "c": W["c"][-40:], "d": W["d"][-40:]}, spy) is None


NEW_LAYOUT = """<div>#1 / 2 Total</div>
<div class="fv-table_row" data-row-key="NVDA"><div data-column-id="company">NVIDIA Corp</div><div data-column-id="sector">Technology</div>
<div data-column-id="marketCap">4.5T</div></div>
<div class="fv-table_row" data-row-key="MU"><div data-column-id="company">Micron</div><div data-column-id="marketCap">120.1B</div></div>"""


def test_finviz_parse_and_fetch_pages():
    rows, total = finviz.parse_page(NEW_LAYOUT)
    assert total == 2 and rows[0] == {"ticker": "NVDA", "company": "NVIDIA Corp", "sector": "Technology", "market_cap": 4.5e12}
    assert rows[1]["market_cap"] == pytest.approx(120.1e9)

    class R:
        text = NEW_LAYOUT

        def raise_for_status(self):
            pass
    out, total = finviz.fetch("x", pause=0, log=lambda s: None, get=lambda *a, **k: R())
    assert [r["ticker"] for r in out] == ["NVDA", "MU"] and total == 2


def _q(start, end, val):
    return {"start": start, "end": end, "val": val, "filed": "2026-01-01"}


def test_sec_metrics_quarter_vs_year_ago_q4_from_annual():
    rev = [_q("2025-01-01", "2025-03-31", 100), _q("2025-04-01", "2025-06-30", 110), _q("2025-07-01", "2025-09-30", 120),
           _q("2025-01-01", "2025-12-31", 470), _q("2026-01-01", "2026-03-31", 150)]   # Q4 2025 = 470 − 330 = 140
    op = [_q("2025-01-01", "2025-03-31", 10), _q("2025-04-01", "2025-06-30", 11), _q("2025-07-01", "2025-09-30", 12),
          _q("2025-01-01", "2025-12-31", 47), _q("2026-01-01", "2026-03-31", 30)]
    facts = {"us-gaap": {"Revenues": {"units": {"USD": rev}}, "OperatingIncomeLoss": {"units": {"USD": op}}}}
    m = sec.metrics(facts)
    assert m["quarter"] == "2026-03-31" and m["rev_rr"] == pytest.approx(50)
    assert m["opm"] == pytest.approx(20) and m["dopm"] == pytest.approx(10)
    assert "rev_rr1" not in m and [q["rev"] for q in m["qs"]] == [100, 110, 120, 140, 150] and m["qs"][-1]["rev_rr"] == pytest.approx(50)


def test_slowdown():
    assert calc.slowdown({"accel": 4, "dgm": 1}) is None
    assert calc.slowdown({"accel": -12, "dgm": 0.5}) == "HAMUJE" and calc.slowdown({"accel": -12, "dgm": -1}) == "HAMUJE+MB"


def test_sec_update_uses_cache(monkeypatch):
    cache = {"OLD": {"at": dt.date.today().isoformat(), "rev_rr": 1, "v": sec.SEC_VERSION},
             "V1": {"at": dt.date.today().isoformat(), "rev_rr": 1}}      # świeży, ale bez historii kwartałów -> pobierz ponownie
    monkeypatch.setattr(sec, "cik_map", lambda ua: {"NEW": 1, "V1": 2})
    monkeypatch.setattr(sec, "_get", lambda url, ua: {"facts": {}})
    assert sec.update(["OLD", "NEW", "ZZZ", "V1"], cache, log=lambda s: None, pause=0) == ["NEW", "V1"]
    assert cache["OLD"]["rev_rr"] == 1 and "at" in cache["ZZZ"]


class _Frame(dict):
    empty = False

    def dropna(self, subset=None):
        return self


def _yf_fake(monkeypatch, calls, frames):
    monkeypatch.setattr(prices, "_yf", lambda: type("Y", (), {"download": staticmethod(lambda part, **k: calls.append((list(part), k["period"])) or "df")}))
    monkeypatch.setattr(prices, "_frames", lambda df, part: {t: frames[t] for t in part if t in frames})


def test_monthly_updates_only_new_months_and_uses_high(monkeypatch):
    import pandas as pd
    calls = []
    hi = pd.Series([10.0, 12.0], index=pd.to_datetime(["2026-08-01", "2026-09-01"]))
    cache = {"A": {"h": [["2026-07", 9.0], ["2026-08", 10.0]], "upto": "2026-08", "raw": 1}, "C": {"h": [], "upto": "2026-09", "raw": 1},
             "B": {"m": [["2026-09", 1.0]], "upto": "2026-09"},     # stary wpis z zamknięciami (nawet aktualny) -> cała historia
             "D": {"h": [["2026-09", 1.0]], "upto": "2026-09"}}     # aktualny, ale ze skorygowanymi cenami (bez "raw") -> cała historia
    _yf_fake(monkeypatch, calls, {"A": {"High": hi}, "B": {"High": hi}, "D": {"High": hi}})
    prices.monthly(["A", "B", "C", "D"], cache, log=lambda s: None, today=dt.date(2026, 10, 20))
    assert calls == [(["A"], "6mo"), (["B", "D"], "max")]            # C aktualne: bez zapytania
    assert cache["A"] == {"h": [["2026-07", 9.0], ["2026-08", 10.0], ["2026-09", 12.0]], "upto": "2026-09", "raw": 1}
    assert prices.monthly_highs(cache["B"]) == [10.0, 12.0]


def test_monthly_refetches_full_history_when_prices_changed(monkeypatch):
    import pandas as pd
    calls = []
    _yf_fake(monkeypatch, calls, {"A": {"High": pd.Series([5.0, 6.0], index=pd.to_datetime(["2026-08-01", "2026-09-01"]))}})
    cache = {"A": {"h": [["2026-08", 10.0]], "upto": "2026-08", "raw": 1}}   # split 2:1 — 10 -> 5
    prices.monthly(["A"], cache, log=lambda s: None, today=dt.date(2026, 10, 20))
    assert calls == [(["A"], "6mo"), (["A"], "max")] and cache["A"]["h"] == [["2026-08", 5.0], ["2026-09", 6.0]]


def test_merge_weekly_appends_new_weeks_and_detects_adjusted_history():
    old = {k: [1, 2, 3] for k in "ohlcv"} | {"d": ["2026-09-28", "2026-10-05", "2026-10-12"]}
    new = {k: [3.01, 4] for k in "ohlcv"} | {"d": ["2026-10-12", "2026-10-19"]}
    m = prices.merge_weekly(old, new)
    assert m["d"] == ["2026-09-28", "2026-10-05", "2026-10-12", "2026-10-19"] and m["c"] == [1, 2, 3.01, 4]
    assert prices.merge_weekly(old, {**new, "c": [1.5, 2]}) is None
    assert prices.merge_weekly(old, new, keep=2)["d"] == ["2026-10-12", "2026-10-19"]


def test_weekly_refetches_short_or_adjusted_cache_and_updates_full_cache(monkeypatch):
    import pandas as pd
    calls = []
    idx = pd.to_datetime(["2026-10-12", "2026-10-19"])
    f = {"Open": [3.0, 4.0], "High": [3.0, 4.0], "Low": [3.0, 4.0], "Close": [3.0, 4.0], "Volume": [1.0, 1.0]}
    df = pd.DataFrame(f, index=idx)
    full = pd.DataFrame({k: [1.0] * 12 for k in f}, index=pd.date_range("2026-08-03", periods=12, freq="W-MON"))
    monkeypatch.setattr(prices, "_yf", lambda: type("Y", (), {"download": staticmethod(lambda part, **k: calls.append((list(part), k["period"])) or k["period"])}))
    monkeypatch.setattr(prices, "_frames", lambda d, part: {t: (full if d == "3y" else df) for t in part})
    # A ma pełny cache i powinien dostać tylko aktualizację; S ma stare dane bez "raw", a N nie ma cache.
    dates = pd.date_range(end="2026-10-12", periods=220, freq="W-MON").strftime("%Y-%m-%d").tolist()
    cache_a = {k: [1.0] * len(dates) for k in "ohlv"}
    cache_a["c"] = [1.0] * (len(dates) - 1) + [3.0]
    cache = {"A": cache_a | {"d": dates, "raw": 1},
             "S": {k: [1, 2, 3] for k in "ohlcv"} | {"d": ["2026-09-28", "2026-10-05", "2026-10-12"]}}
    out = prices.weekly(["A", "N", "S"], log=lambda s: None, cache=cache, today=dt.date(2026, 10, 20))
    assert calls == [(["A"], "1mo"), (["N", "S"], "3y")] and out["A"]["raw"] == 1
    assert out["A"]["c"][-2:] == [3.0, 4.0] and len(out["N"]["c"]) == 12


OLD_TABLE = """<table class="screener_table"><thead><tr><th>No.</th><th>Ticker</th><th>Company</th><th>Sector</th></tr></thead>
<tr class="styled-row"><td>1</td><td data-boxover-ticker="AAA">AAA</td><td>Alpha</td><td>Tech</td></tr></table>"""
SSR_JSON = ('<script type="application/json" data-ssr-props="x">'
            + json.dumps({"data": {"totalCount": 1, "rows": [{"text": {"ticker": "ZZ", "company": "Zeta"}, "numbers": {"marketCap": 1500}}]}})
            + "</script>")


def test_finviz_old_table_and_ssr_json_layouts():
    assert finviz.parse_page(OLD_TABLE)[0] == [{"ticker": "AAA", "company": "Alpha", "sector": "Tech"}]
    rows, total = finviz.parse_page(SSR_JSON)
    assert total == 1 and rows == [{"ticker": "ZZ", "company": "Zeta", "sector": None, "industry": None, "market_cap": 1.5e9}]


_D = [(dt.date(2025, 1, 6) + dt.timedelta(weeks=i)).isoformat() for i in range(60)]
W = {"d": _D, "o": [1] * 60, "h": [1] * 60, "l": [1] * 60, "c": [50.0] * 19 + [100.0] * 40 + [104.0], "v": [1e7] * 60}   # +108 % w 52 tyg.
EST = {"surp": [["2025-11-10", 4.0], ["2026-02-09", 8.0]], "rev90": 12.0}   # 2 raporty powyżej konsensusu, ostatni w ostatnich tygodniach W
SPY = {"d": _D, "o": [1] * 60, "h": [1] * 60, "l": [1] * 60, "c": [400.0] * 60, "v": [1e7] * 60}


def _monthly(ts, cache, log):
    for t in ts:
        cache[t] = {"h": [["2025-01", 50], ["2025-02", 100], ["2025-03", 90], ["2025-04", 90], ["2025-05", 90]], "upto": "2025-05", "raw": 1}


def _fund(ts, cache, ua, log):
    for t in ts:
        cache[t] = {"at": "2026-10-20", "rev_rr": 25, "dopm": 6}


def _est(ts, cache, log):
    for t in ts:
        cache[t] = {"at": "2026-10-20", **EST, "hist": []}


def _run(tmp_path, fetch_list, symbols=()):
    return watchlist.run({"symbols": list(symbols)}, out=tmp_path / "out", cache_dir=tmp_path / "cache", log=lambda s: None, fetch_list=fetch_list,
                         weekly=lambda ts, log, cache: {t: ({**W, "v": [1e3] * 60} if t.startswith("B") else SPY if t == "SPY" else W) for t in ts},
                         monthly=_monthly, fund=_fund, est=_est,
                         daily=lambda ts, log, **kw: {t: W for t in ts})


def test_run_writes_rows_weekly_files_symbols_and_caches(tmp_path):
    base = [{"ticker": f"A{i}"} for i in range(20)] + [{"ticker": "B1"}]
    rows = _run(tmp_path, lambda f, max_tickers, log: (base, 21), symbols=["SPY", "^GSPC"])
    a = next(r for r in rows if r["ticker"] == "A0")
    assert a["ok"] and a["glb_state"] == "SYGNAŁ"
    assert next(r for r in rows if r["ticker"] == "B1")["ok"]       # mały obrót nie blokuje (płynność = filtr Finviz)
    data = json.loads((tmp_path / "out" / "watchlist.json").read_text())
    assert data["scanners"][0]["name"] == "Domyślny" and a["scanners"] == ["Domyślny"]
    assert len(data["rows"]) == 21 and [r["ticker"] for r in data["symbols"]] == ["SPY", "^GSPC"] and not data["finviz_stale"]
    assert json.loads((tmp_path / "out" / "weekly" / "_GSPC.json").read_text())["c"][-1] == 104.0
    assert "A0" in json.loads((tmp_path / "cache" / "sec.json").read_text())
    assert a["daily"] and (tmp_path / "out" / "daily" / "A0.json").exists()   # nad Green Line -> świece dzienne
    assert a["rvol_w"] == pytest.approx(1.0) and a["rvol_d"] == pytest.approx(1.0)   # wolumen relatywny tydzień / sesja
    assert "vol52" in a                                                                    # zmienność 52 tyg. (None przy krótkiej historii)


def test_run_keeps_previous_list_when_finviz_fails(tmp_path):
    base = [{"ticker": f"A{i}", "company": f"C{i}"} for i in range(20)]
    _run(tmp_path, lambda f, max_tickers, log: (base, 20))

    def blocked(f, max_tickers, log):
        raise OSError("403")
    rows = _run(tmp_path, blocked)
    data = json.loads((tmp_path / "out" / "watchlist.json").read_text())
    assert len(rows) == 20 and data["finviz_stale"] and data["rows"][0]["company"] == "C0"


def test_price_ratio_uses_252_sessions_and_short_history_fallback():
    assert watchlist.price_ratio([100, 110, 120], sessions=2) == pytest.approx(1.2)
    assert watchlist.price_ratio([100], sessions=2) is None
    prices = list(range(100, 354))
    assert watchlist.price_ratio(prices, sessions=252) == pytest.approx(353 / 101)


def test_file_name():
    assert watchlist.file_name("^GSPC") == "_GSPC.json" and watchlist.file_name("BRK-B") == "BRK-B.json"


def test_second_run_passes_saved_weekly_series_as_cache(tmp_path):
    base = [{"ticker": f"A{i}"} for i in range(20)]
    seen = []

    def weekly(ts, log, cache):
        seen.append(sorted(cache))
        return {t: SPY if t == "SPY" else W for t in ts}
    for _ in range(2):
        watchlist.run({}, out=tmp_path / "out", cache_dir=tmp_path / "cache", log=lambda s: None,
                      fetch_list=lambda f, max_tickers, log: (base, 20), weekly=weekly, monthly=_monthly, fund=_fund, est=_est, daily=lambda ts, log, **kw: {})
    assert seen[0] == [] and seen[1] == sorted([t["ticker"] for t in base] + ["SPY"])    # SPY zawsze (siła względna)


def test_run_uses_only_one_configured_scanner(tmp_path):
    lists = {"f1": [{"ticker": f"A{i}"} for i in range(20)], "f2": [{"ticker": "A0"}, {"ticker": "Z"}]}
    cfg = {"scanners": [{"name": "Jeden", "filters": "f1"}, {"name": "Dwa", "filters": "f2"}]}
    seen = []

    def fetch(filters, max_tickers, log):
        seen.append(filters)
        return lists[filters], len(lists[filters])

    rows = watchlist.run(cfg, out=tmp_path / "out", cache_dir=tmp_path / "cache", log=lambda s: None, fetch_list=fetch,
                         weekly=lambda ts, log, cache: {t: SPY if t == "SPY" else W for t in ts}, monthly=_monthly, fund=_fund, est=_est, daily=lambda ts, log, **kw: {})
    data = json.loads((tmp_path / "out" / "watchlist.json").read_text())
    assert seen == ["f1"]
    assert len(rows) == 20 and all(r["scanners"] == ["Jeden"] for r in rows)
    assert [m["name"] for m in data["scanners"]] == ["Jeden"]


def test_new_scanner_refresh_preserves_other_named_lists_and_merges_overlap():
    prev = {
        "rows": [
            {"ticker": "OLD", "company": "Old Co", "scanners": ["Saved A"]},
            {"ticker": "BOTH", "company": "Shared Co", "scanners": ["Saved A"]},
            {"ticker": "REPLACE", "company": "Previous", "scanners": ["Saved B"]},
        ],
        "scanners": [
            {"name": "Saved A", "filters": "fa", "total": 2, "n": 2, "stale": False},
            {"name": "Saved B", "filters": "fb", "total": 1, "n": 1, "stale": False},
        ],
    }
    scans = [{"name": "New List", "filters": "fn", "max_tickers": 1500}]
    fresh = [{"ticker": "BOTH", "company": "Shared Co updated"}, {"ticker": "NEW", "company": "New Co"}]
    rows, meta = watchlist.fetch_scanners(scans, prev, lambda f, max_tickers, log: (fresh, 2), lambda _: None, min_tickers=1)
    by = {r["ticker"]: r for r in rows}
    assert set(by) == {"OLD", "BOTH", "REPLACE", "NEW"}
    assert by["OLD"]["scanners"] == ["Saved A"]
    assert by["REPLACE"]["scanners"] == ["Saved B"]
    assert by["BOTH"]["scanners"] == ["New List", "Saved A"]
    assert by["NEW"]["scanners"] == ["New List"]
    assert [m["name"] for m in meta] == ["Saved A", "Saved B", "New List"]


def test_monthly_highs_ignores_dividend_adjusted_entries():
    assert prices.monthly_highs({"h": [["2026-09", 5.0]], "upto": "2026-09"}) == []
    assert prices.monthly_highs({"h": [["2026-09", 5.0]], "upto": "2026-09", "raw": 1}) == [5.0]


    assert prices.monthly_highs({"h": [["2026-09", 5.0]], "upto": "2026-09", "raw": 1}) == [5.0]


def test_ps_is_informational():
    """P/S zostaje kolumną (cena × akcje, gdy brak kapitalizacji), ale nie blokuje warunków — nie dało się go sprawdzić historycznie."""
    f = {"rev_rr": 30, "dopm": 12, "ttm_rev": 300e6}
    assert calc.build_row({"ticker": "A", "market_cap": 3e9}, W, [50, 100, 90, 90, 90], f, SPY, EST)["ok"]      # P/S 10
    b = calc.build_row({"ticker": "B", "market_cap": 9e9}, W, [50, 100, 90, 90, 90], f, SPY)
    assert b["ps"] == pytest.approx(30) and b["ok"]
    assert calc.build_row({"ticker": "D"}, W, [], {**f, "shares": 60e6}, SPY)["ps"] == pytest.approx(104 * 60e6 / 300e6)


def test_sec_metrics_ttm_revenue_and_dilution():
    rev = [_q("2025-01-01", "2025-03-31", 100), _q("2025-04-01", "2025-06-30", 110), _q("2025-07-01", "2025-09-30", 120),
           _q("2025-10-01", "2025-12-31", 140), _q("2026-01-01", "2026-03-31", 150)]
    op = [dict(x, val=x["val"] / 10) for x in rev]
    sh = [_q("2025-01-01", "2025-03-31", 100), _q("2026-01-01", "2026-03-31", 110), _q("2025-01-01", "2025-12-31", 105)]   # roczna średnia nie daje Q4
    facts = {"us-gaap": {"Revenues": {"units": {"USD": rev}}, "OperatingIncomeLoss": {"units": {"USD": op}},
                         "WeightedAverageNumberOfDilutedSharesOutstanding": {"units": {"shares": sh}}}}
    m = sec.metrics(facts)
    assert m["ttm_rev"] == pytest.approx(520) and m["shares"] == 110 and m["dil"] == pytest.approx(10) and m["v"] == sec.SEC_VERSION


def test_trend_sma10_above_sma30():
    up = calc.build_row({"ticker": "U"}, W, [50, 100, 90, 90, 90], {"rev_rr": 30, "dopm": 5}, SPY)
    down = calc.build_row({"ticker": "D"}, {**W, "c": W["c"][::-1]}, [50, 100, 90, 90, 90], {"rev_rr": 30, "dopm": 5}, SPY)
    short = calc.build_row({"ticker": "S"}, {k: v[:20] for k, v in W.items()}, [], None)
    assert up["trend"] is True and down["trend"] is False and short["trend"] is None


def test_volatility():
    import math
    up = [100 * 1.02 ** i for i in range(53)]                                 # stały wzrost: zerowa zmienność
    assert calc.volatility(up) == pytest.approx(0.0, abs=1e-9)
    zz = [100 * (1.1 if i % 2 else 1.0) for i in range(53)]                   # naprzemiennie ±log(1.1)
    r = [math.log(1.1), -math.log(1.1)] * 26
    m = sum(r) / len(r)
    assert calc.volatility(zz) == pytest.approx(math.sqrt(sum((x - m) ** 2 for x in r) / 51) * math.sqrt(52))
    assert calc.volatility(up[:30]) is None                                   # za krótka historia
    assert calc.volatility(up[:-1] + [None]) is not None                      # pojedynczy brak nie blokuje


def test_rel_volume():
    assert calc.rel_volume([10] * 10 + [25], 10) == pytest.approx(2.5)
    assert calc.rel_volume([10] * 5, 10) is None and calc.rel_volume([0] * 10 + [5], 10) is None
    assert calc.rel_volume([10] * 9 + [None, 20], 10) == pytest.approx(2.0)          # brak jednego tygodnia nie blokuje


def test_estimates_update_migrates_old_cache_and_keeps_history():
    from momentum import estimates
    cache = {"OLD": {"at": "2026-10-19", "surp": [], "rev90": 1.0, "hist": [["2026-10-19", 1.0]]},
             "X": {"at": "2026-10-01", "surp": [], "rev90": 2.0, "hist": [["2026-10-01", 2.0]]}}
    got = estimates.update(["OLD", "X", "N"], cache, log=lambda s: None, today=dt.date(2026, 10, 21), pause=0,
                           fetch_one=lambda t: {"surp": [["2026-08-01", 5.0]], "rev90": 7.5})
    assert got == ["OLD", "X", "N"] and cache["OLD"]["rev90"] == 7.5                    # jednorazowa migracja starego cache
    assert cache["X"]["hist"] == [["2026-10-01", 2.0], ["2026-10-21", 7.5]] and cache["N"]["surp"] == [["2026-08-01", 5.0]]


def test_eps_history_and_estimate_rows_are_json_safe():
    import pandas as pd
    from momentum import estimates
    income = pd.DataFrame(
        [[1.25, 1.75, None]],
        index=["Diluted EPS"],
        columns=[pd.Timestamp("2025-03-31"), pd.Timestamp("2025-06-30"), pd.Timestamp("2025-09-30")],
    )
    assert estimates._eps_history(income) == [["2025-03-31", 1.25], ["2025-06-30", 1.75]]
    forecasts = pd.DataFrame(
        [{"numberOfAnalysts": 12, "avg": 2.5, "low": 2.0, "high": 3.0, "yearAgoEps": 2.1, "growth": "+19.0%"}],
        index=["+1y"],
    )
    assert estimates._estimate_rows(forecasts) == [{
        "period": "+1y", "numberOfAnalysts": 12, "avg": 2.5, "low": 2.0,
        "high": 3.0, "yearAgoEps": 2.1, "growth": 19.0,
    }]


def test_build_row_exposes_eps_history_and_forecasts():
    w = {"d": ["2026-10-12", "2026-10-19"], "o": [10, 11], "h": [11, 12], "l": [9, 10], "c": [10, 11], "v": [100, 110]}
    estimates = {"surp": [], "rev90": 5.0, "eps_q": [["2026-06-30", 1.2]], "eps_est": [{"period": "+1y", "avg": 4.0}], "hist": []}
    row = calc.build_row({"ticker": "X"}, w, [], {}, None, estimates)
    assert row["eps_q"] == [["2026-06-30", 1.2]]
    assert row["eps_est"][0]["avg"] == 4.0
    assert row["surp_hist"] == []


def test_deepvue_style_rs_score_weights_recent_relative_performance():
    dates = [(dt.date(2025, 1, 6) + dt.timedelta(days=7 * i)).isoformat() for i in range(60)]
    stock = {"d": dates, "c": [100 + i for i in range(60)]}
    spy = {"d": dates, "c": [100.0] * 60}
    score = calc.rs_rating_score(stock, spy)
    assert score is not None and score > 0
    assert calc.rs_rating_score({"d": dates[:3], "c": [100, 101, 102]}, spy) is None


def test_merge_daily_appends_only_new_dates_and_detects_changed_history():
    old = {"raw": 1, "d": ["2026-10-19", "2026-10-20"], "o": [1, 2], "h": [2, 3], "l": [0, 1], "c": [1, 2], "v": [10, 20]}
    fresh = {"raw": 1, "d": ["2026-10-20", "2026-10-21"], "o": [2, 3], "h": [3, 4], "l": [1, 2], "c": [2, 3], "v": [20, 30]}
    merged = prices.merge_daily(old, fresh)
    assert merged["d"] == ["2026-10-19", "2026-10-20", "2026-10-21"]
    assert merged["c"] == [1, 2, 3]
    changed = {**fresh, "c": [9, 3]}
    assert prices.merge_daily(old, changed) is None


def test_finviz_url_replaces_previous_scanner_and_saves_one_url(tmp_path, monkeypatch):
    config_path = tmp_path / "finviz_screen.json"
    monkeypatch.setattr(watchlist, "CONFIG", config_path)
    cfg = {"symbols": ["SPY"], "scanners": [{"name": "old", "filters": "old", "url": "https://finviz.com/screener.ashx?v=111&f=old"}]}
    rows = [{"ticker": f"A{i}"} for i in range(20)]
    seen = []
    watchlist.run(cfg, out=tmp_path / "out", cache_dir=tmp_path / "cache", log=lambda s: None,
                  fetch_list=lambda f, max_tickers, log: (seen.append(f) or (rows, len(rows))),
                  weekly=lambda ts, log, cache: {t: SPY if t == "SPY" else W for t in ts}, monthly=_monthly, fund=_fund, est=_est,
                  daily=lambda ts, log, **kw: {}, finviz_url="https://finviz.com/screener.ashx?v=111&f=fa_salesqoq_o15,sh_price_o10")
    saved = json.loads(config_path.read_text())
    assert seen == ["fa_salesqoq_o15,sh_price_o10"]
    assert len(saved["scanners"]) == 1 and saved["scanners"][0]["url"].endswith("f=fa_salesqoq_o15,sh_price_o10")
