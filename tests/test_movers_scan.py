"""Testy skanu Movers (movers_scan.py) — bez sieci."""
import json

import numpy as np
import pandas as pd

import movers_scan
import watchlist


def prices(n=800, last_close=100.0):
    idx = pd.bdate_range(end="2026-10-13", periods=n)
    close = np.linspace(50, last_close, n)
    return pd.DataFrame({"Open": close, "High": close * 1.01, "Low": close * 0.99, "Close": close, "Volume": np.full(n, 2e6)}, index=idx)


def fv_row(t, change=4.0):
    return {"ticker": t, "company": t + " Inc", "sector": "Technology", "industry": "Software", "market_cap": 5e9, "price_fv": 100.0,
            "change_pct": change, "volume": 3e6, "avg_volume": 2e6, "rel_volume": 1.5}


def test_sanitize_drops_nonpositive_candles_and_empty_frames():
    good = prices(50)
    bad = prices(50)
    bad.iloc[10, bad.columns.get_loc("Low")] = 0.0
    allbad = prices(5)
    allbad["Close"] = 0.0
    out = movers_scan.sanitize_frames({"G": good, "B": bad, "Z": allbad}, log=lambda *_: None)
    assert set(out) == {"G", "B"} and len(out["B"]) == 49


def test_view_override_is_restored(monkeypatch):
    import finviz
    before = (dict(finviz.VIEW_COLUMNS["152"]), dict(finviz.VIEW_PARAMS["152"]), set(finviz.TEXT_KEYS))
    seen = {}

    def fake(view, filters, limit):
        seen["cols"] = dict(finviz.VIEW_COLUMNS["152"])
        seen["c"] = finviz.VIEW_PARAMS["152"]["c"]
        return [fv_row("A")], 1
    monkeypatch.setattr(finviz, "fetch_view", fake)
    rows, total = movers_scan.fetch_movers("x", log=lambda *_: None)
    assert total == 1 and rows[0]["ticker"] == "A" and "Change %" in seen["cols"] and seen["c"] == movers_scan.VIEW_IDS
    assert (finviz.VIEW_COLUMNS["152"], finviz.VIEW_PARAMS["152"], finviz.TEXT_KEYS) == before


def test_full_run_writes_files_sorted_by_change(tmp_path, monkeypatch):
    rows = [fv_row("AAA", 3.5), fv_row("BBB", 9.0)]
    monkeypatch.setattr(movers_scan, "fetch_movers", lambda f, log=print: (rows, 2))
    monkeypatch.setattr(watchlist, "download_prices", lambda tickers, period=None: {t: prices() for t in tickers})
    assert movers_scan.run(tmp_path, "refresh", log=lambda *_: None) == 0
    data = json.loads((tmp_path / "watchlist_movers.json").read_text())
    assert [s["ticker"] for s in data["stocks"]] == ["BBB", "AAA"] and data["n_stocks"] == 2
    assert data["stocks"][0]["change_pct"] == 9.0 and data["stocks"][0]["rel_volume"] == 1.5 and data["stocks"][0]["rs_rating"] is None
    charts = json.loads((tmp_path / "charts_movers.json").read_text())
    assert set(charts["stocks"]) == {"AAA", "BBB"} and "daily" in charts


def test_empty_finviz_keeps_previous_files(tmp_path, monkeypatch):
    (tmp_path / "watchlist_movers.json").write_text("{}")
    monkeypatch.setattr(movers_scan, "fetch_movers", lambda f, log=print: ([], 0))
    assert movers_scan.run(tmp_path, "refresh", log=lambda *_: None) == 1
    assert (tmp_path / "watchlist_movers.json").read_text() == "{}"


def test_parse_filters_accepts_codes_colon_form_and_link():
    expected = "cap_midover,sh_curvol_o1000,ta_change_u5,ta_sma20_pc,ta_sma200_pa,ta_sma50_pc"
    assert movers_scan.parse_filters("cap:midover sh_curvol:o1000 ta_change:u5 ta_sma20:pc ta_sma200:pa ta_sma50:pc") == expected
    assert movers_scan.parse_filters(expected) == expected
    assert movers_scan.parse_filters("https://finviz.com/screener?v=111&f=cap_midover%2Csh_curvol_o1000%2Cta_change_u5%2Cta_sma20_pc%2Cta_sma200_pa%2Cta_sma50_pc&o=-volume") == expected
    assert movers_scan.parse_filters("cap_midover cap:midover") == "cap_midover"   # bez duplikatów
    for bad in ("", "  ", "midover", "cap_mid over!"):
        try:
            movers_scan.parse_filters(bad)
        except ValueError:
            continue
        raise AssertionError(bad)


def test_apply_action_add_replace_remove():
    base = [{"name": "A", "filters": "cap_midover"}]
    lists, _ = movers_scan.apply_action(base, "add", "B", "cap:largeover sh_curvol:o500")
    assert [x["name"] for x in lists] == ["A", "B"] and lists[1]["filters"] == "cap_largeover,sh_curvol_o500"
    lists, msg = movers_scan.apply_action(lists, "add", "b", "cap:smallover")   # ta sama nazwa (bez względu na wielkość liter) = zmiana filtra
    assert len(lists) == 2 and lists[1]["filters"] == "cap_smallover" and "Zmieniono" in msg
    lists, _ = movers_scan.apply_action(lists, "remove", "A")
    assert [x["name"] for x in lists] == ["B"]
    assert movers_scan.apply_action(lists, "refresh")[0] == lists
    for args in (("remove", "ZZZ"), ("add", "", "cap:midover"), ("add", "C", ""), ("zzz",)):
        try:
            movers_scan.apply_action(lists, *args)
        except ValueError:
            continue
        raise AssertionError(args)


def test_lists_persist_and_scan_covers_every_list(tmp_path, monkeypatch):
    calls = []

    def fake_fetch(filters, log=print):
        calls.append(filters)
        return ([fv_row("AAA", 5.0), fv_row("BBB", 4.0)] if "big" in filters else [fv_row("BBB", 4.0), fv_row("CCC", 6.0)]), 2
    monkeypatch.setattr(movers_scan, "fetch_movers", fake_fetch)
    monkeypatch.setattr(watchlist, "download_prices", lambda tickers, period=None: {t: prices() for t in tickers})
    quiet = lambda *_: None   # noqa: E731
    assert movers_scan.run(tmp_path, "add", "Duże", "cap_big", log=quiet) == 0
    assert movers_scan.run(tmp_path, "add", "Małe", "cap_small", log=quiet) == 0
    saved = json.loads((tmp_path / "movers_lists.json").read_text())
    assert [x["name"] for x in saved["lists"]] == ["Movers", "Duże", "Małe"]   # domyślna + dodane, zapamiętane między uruchomieniami
    data = json.loads((tmp_path / "watchlist_movers.json").read_text())
    by = {s["ticker"]: s["lists"] for s in data["stocks"]}
    assert by["BBB"] == ["Movers", "Duże", "Małe"] and by["AAA"] == ["Duże"] and by["CCC"] == ["Movers", "Małe"]
    assert {x["name"]: x["n"] for x in data["lists"]}["Duże"] == 2
    assert set(by) == {"AAA", "BBB", "CCC"}                                      # suma bez duplikatów
    assert movers_scan.run(tmp_path, "remove", "Duże", log=quiet) == 0
    assert [x["name"] for x in json.loads((tmp_path / "movers_lists.json").read_text())["lists"]] == ["Movers", "Małe"]
    assert "Duże" not in {n for s in json.loads((tmp_path / "watchlist_movers.json").read_text())["stocks"] for n in s["lists"]}
    assert movers_scan.run(tmp_path, "remove", "Nie ma takiej", log=quiet) == 2   # błąd = nic nie zapisano


def test_removing_the_last_list_writes_an_empty_result(tmp_path, monkeypatch):
    (tmp_path / "movers_lists.json").write_text(json.dumps({"lists": [{"name": "X", "filters": "cap_midover"}]}))
    assert movers_scan.run(tmp_path, "remove", "X", log=lambda *_: None) == 0
    assert json.loads((tmp_path / "watchlist_movers.json").read_text())["stocks"] == []


def test_main_rejects_bad_parameters(capsys):
    assert movers_scan.main(["--action", "add", "--name", "X"]) == 2
