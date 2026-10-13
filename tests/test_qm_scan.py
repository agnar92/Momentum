"""Testy skanu Qullamaggie na samych cenach (qm_scan.py) — bez sieci."""
import json

import numpy as np
import pandas as pd

import qm_scan
import watchlist


def row(t, dollar_m, adr, r1, r3, r6):
    return {"ticker": t, "dollar_volume_avg": dollar_m * 1e6, "adr_pct": adr, "low_ratio_1m": r1, "low_ratio_3m": r3, "low_ratio_6m": r6}


def universe_row(t, price=50.0, avgvol=1_000_000, vol_m=5.0, p1m=10.0, p3m=20.0, p6m=30.0, d50=20.0, w52=40.0):
    return {"ticker": t, "company": t + " Inc", "sector": "Technology", "industry": "Software", "market_cap": 5e9, "price": price, "avgvol": avgvol,
            "vol_m": vol_m, "p1m": p1m, "p3m": p3m, "p6m": p6m, "d50low": d50, "w52low": w52}


class TestSelect:
    def test_top_pct_is_taken_per_window_and_unioned(self):
        rows = [row("A", 60, 5, 3.0, 1.1, 1.1), row("B", 60, 5, 1.1, 3.0, 1.1), row("C", 60, 5, 1.1, 1.1, 3.0),
                row("D", 60, 5, 1.0, 1.0, 1.0), row("E", 60, 5, 1.0, 1.0, 1.0), row("F", 60, 5, 1.0, 1.0, 1.0),
                row("G", 60, 5, 1.0, 1.0, 1.0), row("H", 60, 5, 1.0, 1.0, 1.0), row("I", 60, 5, 1.0, 1.0, 1.0), row("J", 60, 5, 1.0, 1.0, 1.0)]
        picked = qm_scan.select(rows, {"min_dollar_mln": 50, "min_adr": 3, "top_pct": 10})
        assert picked == {"A": ["1m"], "B": ["3m"], "C": ["6m"]}

    def test_liquidity_thresholds_and_missing_data_drop_stocks(self):
        rows = [row("OK", 60, 5, 2.0, 2.0, 2.0), row("LOWVOL", 10, 5, 9.0, 9.0, 9.0), row("LOWADR", 60, 1, 9.0, 9.0, 9.0), {"ticker": "NODATA"}]
        assert set(qm_scan.select(rows, {"min_dollar_mln": 50, "min_adr": 3, "top_pct": 100})) == {"OK"}

    def test_pool_from_finviz_sets_the_size_of_top_x_percent(self):
        rows = [row(f"S{i}", 60, 5, 1.0 + i / 100, 1.0, 1.0) for i in range(20)]
        pool = [[100e6, 5.0]] * 200 + [[1e6, 1.0]] * 50   # 200 płynnych w całym zbiorze, 50 nie
        picked = qm_scan.select(rows, {"min_dollar_mln": 50, "min_adr": 3, "top_pct": 10, "windows": ["1m"]}, pool=pool)
        assert len(picked) == 20                              # 10 % z 200 = 20, a kandydatów jest tylko 20
        assert len(qm_scan.select(rows, {"min_dollar_mln": 50, "min_adr": 3, "top_pct": 10, "windows": ["1m"]})) == 2   # bez puli: 10 % z 20

    def test_pool_size_counts_only_liquid_pairs(self):
        assert qm_scan.pool_size([[60e6, 5], [10e6, 5], [60e6, 1]], 50, 3) == 1
        assert qm_scan.pool_size(None, 50, 3) == 0

    def test_annotate_lists_windows_and_best_ratio(self):
        r = row("A", 60, 5, 2.5, 1.4, 1.2)
        qm_scan.annotate(r, ["1m", "3m"])
        assert r["qm_windows"] == "1M 3M" and r["qm_max_ratio"] == 2.5

    def test_normalize_clamps_and_defaults(self):
        c = qm_scan.normalize({"top_pct": "250", "min_adr": "3,5", "windows": ["1m", "zzz"], "chart_top_pct": 1})
        assert c["top_pct"] == 100.0 and c["min_adr"] == 3.5 and c["windows"] == ["1m"] and c["chart_top_pct"] >= c["top_pct"]
        d = qm_scan.normalize(None)
        assert d["min_dollar_mln"] == 60.0 and d["min_adr"] == 3.0 and d["keep_dollar_mln"] < d["min_dollar_mln"] and d["keep_adr"] < d["min_adr"]


class TestStageOne:
    def test_candidates_keep_the_top_of_the_return_rankings_among_liquid(self):
        uni = [universe_row(f"U{i}", p1m=float(i), p3m=float(i), p6m=float(i), d50=float(i), w52=float(i)) for i in range(400)]
        uni.append(universe_row("ILLIQ", avgvol=1000, p1m=9999, p3m=9999, p6m=9999, d50=9999, w52=9999))
        uni.append(universe_row("FLAT", vol_m=0.1, p1m=9999, p3m=9999, p6m=9999, d50=9999, w52=9999))
        cands = {c["ticker"] for c in qm_scan.candidates(uni, {"top_pct": 10})}
        assert "U399" in cands and "U0" not in cands
        assert "ILLIQ" not in cands and "FLAT" not in cands
        assert 60 <= len(cands) <= 400

    def test_pool_pairs_skip_incomplete_rows(self):
        pairs = qm_scan.pool_pairs([universe_row("A"), {"ticker": "B", "price": 10.0}])
        assert pairs == [[50_000_000, 5.0]]

    def test_suggest_filters_prefilter(self):
        f = qm_scan.suggest_filters({"keep_dollar_mln": 20, "keep_adr": 3}).split(",")
        assert {"cap_smallover", "ind_stocksonly", "sh_price_o10"} <= set(f)
        assert any(x.startswith("sh_avgvol_o") for x in f) and "ta_volatility_mo2" in f


class TestRun:
    def _prices(self, n, daily, volume, spread=0.04):
        idx = pd.bdate_range(end="2026-10-09", periods=n)
        close = 20 * (1 + daily) ** np.arange(n)
        return pd.DataFrame({"Open": close, "High": close * (1 + spread / 2), "Low": close * (1 - spread / 2), "Close": close, "Volume": volume}, index=idx)

    def test_run_writes_watchlist_and_charts(self, tmp_path, monkeypatch):
        uni = [universe_row(f"T{i}", price=20.0, avgvol=2_000_000, vol_m=4.5, p1m=float(i), p3m=float(i), p6m=float(i), d50=float(i), w52=float(i))
               for i in range(150)]
        monkeypatch.setattr(qm_scan, "fetch_universe", lambda filters, max_tickers=5000, log=print: (uni, len(uni)))
        frames = {u["ticker"]: self._prices(400, 0.001 + i * 0.00005, 2_000_000) for i, u in enumerate(uni)}
        monkeypatch.setattr(watchlist, "download_prices", lambda tickers, period=None, **k: {t: frames[t] for t in tickers if t in frames} if tickers != [watchlist.BENCHMARK] else {watchlist.BENCHMARK: self._prices(400, 0.0005, 1e9)})
        out = tmp_path / "data"
        assert qm_scan.run({"min_dollar_mln": 20, "min_adr": 3, "top_pct": 10}, out, log=lambda *a: None) == 0
        wl = json.loads((out / "watchlist_qm.json").read_text(encoding="utf-8"))
        ch = json.loads((out / "charts_qm.json").read_text(encoding="utf-8"))
        assert wl["n_stocks"] == len(wl["stocks"]) > 0 and wl["qm_universe"] == 150
        assert wl["qm_pool"] == [] and wl["qm_two_stage"] is False       # ceny dla całego zbioru: górne X % liczone wprost od płynnych
        assert all("low_ratio_3m" in s and "dollar_volume_avg" in s for s in wl["stocks"])
        with_chart = [s["ticker"] for s in wl["stocks"] if s["has_chart"]]
        assert with_chart and set(with_chart) == set(ch["stocks"])
        assert len(with_chart) < len(wl["stocks"])             # wykresy tylko dla czołówki
        assert all(s["qm_max_ratio"] is not None and s["qm_windows"] for s in wl["stocks"] if s["has_chart"])

    def test_default_run_downloads_prices_for_the_whole_universe(self, tmp_path, monkeypatch):
        uni = [universe_row(f"T{i}", price=20.0, avgvol=2_000_000, vol_m=4.5) for i in range(150)]
        seen = {}

        def fake_fetch(filters, max_tickers=5000, log=print):
            seen["filters"] = filters
            return uni, len(uni)
        monkeypatch.setattr(qm_scan, "fetch_universe", fake_fetch)
        asked = []

        def fake_dl(tickers, period=None, **k):
            asked.append(list(tickers))
            return {t: self._prices(400, 0.001, 2_000_000) for t in tickers}
        monkeypatch.setattr(watchlist, "download_prices", fake_dl)
        assert qm_scan.run(None, tmp_path, log=lambda *a: None) == 0
        assert seen["filters"] == qm_scan.DEFAULT_FILTERS == "sh_avgvol_o100,sh_price_o5,ta_sma200_pa,ta_sma50_sa200"
        assert len(asked[0]) == 150                      # bez zawężania do kandydatów

    def test_two_stage_run_downloads_only_candidates_and_keeps_the_pool(self, tmp_path, monkeypatch):
        uni = [universe_row(f"T{i}", price=20.0, avgvol=2_000_000, vol_m=4.5, p1m=float(i), p3m=float(i), p6m=float(i), d50=float(i), w52=float(i)) for i in range(400)]
        monkeypatch.setattr(qm_scan, "fetch_universe", lambda filters, max_tickers=5000, log=print: (uni, len(uni)))
        asked = []

        def fake_dl(tickers, period=None, **k):
            asked.append(list(tickers))
            return {t: self._prices(400, 0.001, 2_000_000) for t in tickers}
        monkeypatch.setattr(watchlist, "download_prices", fake_dl)
        assert qm_scan.run({"min_dollar_mln": 20, "min_adr": 3}, tmp_path, two_stage=True, log=lambda *a: None) == 0
        wl = json.loads((tmp_path / "watchlist_qm.json").read_text(encoding="utf-8"))
        assert len(asked[0]) < 400 and wl["qm_two_stage"] is True and len(wl["qm_pool"]) == 400

    def test_run_aborts_on_suspiciously_small_universe(self, tmp_path, monkeypatch):
        monkeypatch.setattr(qm_scan, "fetch_universe", lambda filters, max_tickers=5000, log=print: ([universe_row("A")], 1))
        assert qm_scan.run(None, tmp_path, log=lambda *a: None) == 1
        assert not (tmp_path / "watchlist_qm.json").exists()

    def test_sanitize_frames_drops_nonpositive_candles(self):
        df = self._prices(50, 0.001, 1_000_000)
        df.iloc[10, df.columns.get_loc("Low")] = 0.0
        out = qm_scan.sanitize_frames({"A": df, "B": self._prices(5, 0.0, 1)}, log=lambda *a: None)
        assert len(out["A"]) == 49
