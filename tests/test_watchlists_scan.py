"""Testy skanu Watchlisty (watchlists_scan.py) — bez sieci."""
import json

import numpy as np
import pandas as pd

import watchlist
import watchlists_scan as ws


def prices(n=800, last_close=100.0, daily=None):
    idx = pd.bdate_range(end="2026-10-13", periods=n)
    close = np.linspace(50, last_close, n)
    return pd.DataFrame({"Open": close, "High": close * 1.01, "Low": close * 0.99, "Close": close, "Volume": np.full(n, 2e6)}, index=idx)


def fv_row(t, sector="Technology"):
    return {"ticker": t, "company": t + " Inc", "sector": sector, "industry": "Software", "market_cap": 5e9, "price": 100.0}


QUIET = lambda *_: None   # noqa: E731


def fake_network(monkeypatch, per_filter):
    """Finviz zwraca wiersze zależnie od filtra, yfinance syntetyczne ceny, EPS z pustej pamięci (bez sieci)."""
    monkeypatch.setattr(ws, "fetch_list", lambda f, max_tickers=ws.MAX_PER_LIST, log=print: (per_filter(f), 2))
    monkeypatch.setattr(watchlist, "download_prices", lambda tickers, **k: {t: prices() for t in tickers})
    monkeypatch.setattr(watchlist, "update_eps_cache", lambda tickers, cache_path=None, **k: {})


def test_sanitize_drops_nonpositive_candles_and_empty_frames():
    good, bad, allbad = prices(50), prices(50), prices(5)
    bad.iloc[10, bad.columns.get_loc("Low")] = 0.0
    allbad["Close"] = 0.0
    out = ws.sanitize_frames({"G": good, "B": bad, "Z": allbad}, log=QUIET)
    assert set(out) == {"G", "B"} and len(out["B"]) == 49


def test_parse_filters_accepts_codes_colon_form_and_link():
    expected = "cap_midover,sh_curvol_o1000,ta_change_u5,ta_sma20_pc,ta_sma200_pa,ta_sma50_pc"
    assert ws.parse_filters("cap:midover sh_curvol:o1000 ta_change:u5 ta_sma20:pc ta_sma200:pa ta_sma50:pc") == expected
    assert ws.parse_filters(expected) == expected
    assert ws.parse_filters("https://finviz.com/screener?v=111&f=cap_midover%2Csh_curvol_o1000%2Cta_change_u5%2Cta_sma20_pc%2Cta_sma200_pa%2Cta_sma50_pc&o=-volume") == expected
    assert ws.parse_filters("cap_midover cap:midover") == "cap_midover"   # bez duplikatów
    for bad in ("", "  ", "midover", "cap_mid over!"):
        try:
            ws.parse_filters(bad)
        except ValueError:
            continue
        raise AssertionError(bad)


def test_apply_action_add_replace_remove():
    base = [{"name": "A", "filters": "cap_midover"}]
    lists, _ = ws.apply_action(base, "add", "B", "cap:largeover sh_curvol:o500")
    assert [x["name"] for x in lists] == ["A", "B"] and lists[1]["filters"] == "cap_largeover,sh_curvol_o500"
    lists, msg = ws.apply_action(lists, "add", "b", "cap:smallover")   # ta sama nazwa (bez względu na wielkość liter) = zmiana filtra
    assert len(lists) == 2 and lists[1]["filters"] == "cap_smallover" and "Zmieniono" in msg
    lists, _ = ws.apply_action(lists, "remove", "A")
    assert [x["name"] for x in lists] == ["B"]
    assert ws.apply_action(lists, "refresh")[0] == lists
    for args in (("remove", "ZZZ"), ("add", "", "cap:midover"), ("add", "C", ""), ("zzz",)):
        try:
            ws.apply_action(lists, *args)
        except ValueError:
            continue
        raise AssertionError(args)


def test_full_run_computes_ratings_and_weekly_charts_only(tmp_path, monkeypatch):
    fake_network(monkeypatch, lambda f: [fv_row("AAA"), fv_row("BBB"), fv_row("CCC")])
    assert ws.run(tmp_path, "refresh", log=QUIET) == 0
    data = json.loads((tmp_path / ws.DATA_FILE).read_text())
    assert data["n_stocks"] == 3 and {s["ticker"] for s in data["stocks"]} == {"AAA", "BBB", "CCC"}
    s = data["stocks"][0]
    assert s["lists"] == [ws.DEFAULT_LIST_NAME] and "rs_rating" in s and "eps_rating" in s and "composite_rating" in s
    assert all(isinstance(x["rs_rating"], int) for x in data["stocks"])          # RS Rating = percentyl wśród spółek z list
    charts = json.loads((tmp_path / ws.CHARTS_FILE).read_text())
    assert set(charts["stocks"]) == {"AAA", "BBB", "CCC"} and len(charts["weeks"]) > 100 and "daily" not in charts
    assert (tmp_path / ws.LISTS_FILE).exists()


def test_stocks_sorted_by_composite_and_lists_persist(tmp_path, monkeypatch):
    seen = []

    def per_filter(f):
        seen.append(f)
        return [fv_row("AAA"), fv_row("BBB")] if "big" in f else [fv_row("BBB"), fv_row("CCC")]
    fake_network(monkeypatch, per_filter)
    assert ws.run(tmp_path, "add", "Duże", "cap_big", log=QUIET) == 0
    assert ws.run(tmp_path, "add", "Małe", "cap_small", log=QUIET) == 0
    saved = json.loads((tmp_path / ws.LISTS_FILE).read_text())
    assert [x["name"] for x in saved["lists"]] == [ws.DEFAULT_LIST_NAME, "Duże", "Małe"]   # domyślna + dodane, zapamiętane między uruchomieniami
    data = json.loads((tmp_path / ws.DATA_FILE).read_text())
    by = {s["ticker"]: s["lists"] for s in data["stocks"]}
    assert by["BBB"] == [ws.DEFAULT_LIST_NAME, "Duże", "Małe"] and by["AAA"] == ["Duże"]
    assert {x["name"]: x["n"] for x in data["lists"]}["Duże"] == 2 and set(by) == {"AAA", "BBB", "CCC"}   # suma bez duplikatów
    assert ws.run(tmp_path, "remove", "Duże", log=QUIET) == 0
    assert [x["name"] for x in json.loads((tmp_path / ws.LISTS_FILE).read_text())["lists"]] == [ws.DEFAULT_LIST_NAME, "Małe"]
    assert ws.run(tmp_path, "remove", "Nie ma takiej", log=QUIET) == 2   # błąd = nic nie zapisano


def test_empty_finviz_keeps_previous_files(tmp_path, monkeypatch):
    (tmp_path / ws.DATA_FILE).write_text("{}")
    fake_network(monkeypatch, lambda f: [])
    assert ws.run(tmp_path, "refresh", log=QUIET) == 1
    assert (tmp_path / ws.DATA_FILE).read_text() == "{}"


def test_removing_the_last_list_writes_an_empty_result(tmp_path):
    (tmp_path / ws.LISTS_FILE).write_text(json.dumps({"lists": [{"name": "X", "filters": "cap_midover"}]}))
    assert ws.run(tmp_path, "remove", "X", log=QUIET) == 0
    assert json.loads((tmp_path / ws.DATA_FILE).read_text())["stocks"] == []


def test_main_rejects_bad_parameters():
    assert ws.main(["--action", "add", "--name", "X"]) == 2


def test_remove_does_not_touch_network_or_other_lists(tmp_path, monkeypatch):
    fake_network(monkeypatch, lambda f: [fv_row("AAA"), fv_row("BBB")] if "big" in f else [fv_row("BBB"), fv_row("CCC")])
    assert ws.run(tmp_path, "add", "Duże", "cap_big", log=QUIET) == 0
    assert ws.run(tmp_path, "add", "Małe", "cap_small", log=QUIET) == 0

    def boom(*a, **k):
        raise AssertionError("remove nie może łączyć się z siecią")
    monkeypatch.setattr(ws, "fetch_list", boom)
    monkeypatch.setattr(watchlist, "download_prices", boom)
    monkeypatch.setattr(watchlist, "update_eps_cache", boom)
    assert ws.run(tmp_path, "remove", "Duże", log=QUIET) == 0
    data = json.loads((tmp_path / ws.DATA_FILE).read_text())
    by = {s["ticker"]: s["lists"] for s in data["stocks"]}
    assert "AAA" not in by and by["BBB"] == [ws.DEFAULT_LIST_NAME, "Małe"] and by["CCC"] == [ws.DEFAULT_LIST_NAME, "Małe"] or "CCC" in by
    assert [x["name"] for x in data["lists"]] == [ws.DEFAULT_LIST_NAME, "Małe"]
    charts = json.loads((tmp_path / ws.CHARTS_FILE).read_text())
    assert "AAA" not in charts["stocks"] and "BBB" in charts["stocks"]


def test_add_scans_only_the_new_list(tmp_path, monkeypatch):
    seen = []

    def per_filter(f):
        seen.append(f)
        return {"cap_big": [fv_row("AAA")], "cap_small": [fv_row("CCC")]}.get(f, [fv_row("BBB")])
    fake_network(monkeypatch, per_filter)
    assert ws.run(tmp_path, "add", "Duże", "cap_big", log=QUIET) == 0
    seen.clear()
    assert ws.run(tmp_path, "add", "Małe", "cap_small", log=QUIET) == 0
    assert seen == ["cap_small"]   # Duże i domyślna lista nie są pobierane od nowa
    data = json.loads((tmp_path / ws.DATA_FILE).read_text())
    assert {s["ticker"] for s in data["stocks"]} == {"AAA", "BBB", "CCC"}
    assert {x["name"]: x["n"] for x in data["lists"]} == {ws.DEFAULT_LIST_NAME: 1, "Duże": 1, "Małe": 1}
    charts = json.loads((tmp_path / ws.CHARTS_FILE).read_text())
    assert set(charts["stocks"]) == {"AAA", "BBB", "CCC"}
    seen.clear()
    assert ws.run(tmp_path, "refresh", log=QUIET) == 0
    assert sorted(seen) == sorted(["cap_big", "cap_small", ws.DEFAULT_FILTERS])   # refresh = wszystkie


