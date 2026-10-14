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
    assert movers_scan.run(tmp_path, "f", log=lambda *_: None) == 0
    data = json.loads((tmp_path / "watchlist_movers.json").read_text())
    assert [s["ticker"] for s in data["stocks"]] == ["BBB", "AAA"] and data["n_stocks"] == 2
    assert data["stocks"][0]["change_pct"] == 9.0 and data["stocks"][0]["rel_volume"] == 1.5 and data["stocks"][0]["rs_rating"] is None
    charts = json.loads((tmp_path / "charts_movers.json").read_text())
    assert set(charts["stocks"]) == {"AAA", "BBB"} and "daily" in charts


def test_empty_finviz_keeps_previous_files(tmp_path, monkeypatch):
    (tmp_path / "watchlist_movers.json").write_text("{}")
    monkeypatch.setattr(movers_scan, "fetch_movers", lambda f, log=print: ([], 0))
    assert movers_scan.run(tmp_path, "f", log=lambda *_: None) == 1
    assert (tmp_path / "watchlist_movers.json").read_text() == "{}"
