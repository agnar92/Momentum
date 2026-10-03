"""Testy czystej logiki watchlist.py i finviz.py (bez sieci)."""
import json

import numpy as np
import pandas as pd
import pytest

import finviz
import watchlist


def make_prices(n=300, start=100.0, daily=0.002, end="2026-09-30", high=1.02, low=0.98, volume=1_000_000):
    idx = pd.bdate_range(end=end, periods=n)
    close = start * (1 + daily) ** np.arange(n)
    return pd.DataFrame({"Open": close, "High": close * high, "Low": close * low, "Close": close,
                         "Volume": volume}, index=idx)


class TestFinviz:
    def test_parse_number(self):
        assert finviz.parse_number("10.93%") == 10.93
        assert finviz.parse_number("-3.5%") == -3.5
        assert finviz.parse_number("47.26B") == pytest.approx(47.26e9)
        assert finviz.parse_number("2.27M") == pytest.approx(2.27e6)
        assert finviz.parse_number("1,234.5") == 1234.5
        assert finviz.parse_number("-") is None
        assert finviz.parse_number(None) is None

    def test_parse_screener_page_maps_columns_by_header(self):
        page = """<html><body><div>#1 / 130 Total</div>
        <table class="screener_table"><thead><tr><th>No.</th><th>Ticker</th><th>Forward P/E</th><th>EPS This Y</th>
        <th>EPS Next Y</th><th>Price</th></tr></thead>
        <tr class="styled-row"><td>1</td><td data-boxover-ticker="AAPL">AAPL</td><td>24.85</td><td>10.93%</td><td>-</td><td>167</td></tr>
        <tr class="styled-row"><td>2</td><td>brak</td><td>1</td></tr>
        </table></body></html>"""
        rows, total = finviz.parse_screener_page(page, "121")
        assert total == 130
        assert rows == [{"ticker": "AAPL", "forward_pe": 24.85, "eps_this_y": 10.93, "eps_next_y": None}]

    def test_fetch_watchlist_merges_views_by_ticker(self, monkeypatch):
        views = {
            "111": [{"ticker": "AAA", "sector": "Tech"}, {"ticker": "BBB", "sector": "Health"}],
            "121": [{"ticker": "BBB", "eps_next_y": 9.0}, {"ticker": "ZZZ", "eps_next_y": 1.0}],
        }

        def fake_fetch_view(view, filters, max_tickers, pause_s, session):
            if view == "161":
                raise RuntimeError("503")
            return views[view], 2
        monkeypatch.setattr(finviz, "fetch_view", fake_fetch_view)
        rows, total = finviz.fetch_watchlist("x", 10, 0)
        assert total == 2
        assert {r["ticker"]: r for r in rows} == {"AAA": {"ticker": "AAA", "sector": "Tech"},
                                                   "BBB": {"ticker": "BBB", "sector": "Health", "eps_next_y": 9.0}}


class TestIndicators:
    def test_compute_metrics_core_fields(self):
        df = make_prices(n=300, daily=0.002)
        m = watchlist.compute_metrics(df)
        assert m["as_of"] == "2026-09-30"
        assert m["rs_score"] > 0 and m["ret_12m_pct"] > m["ret_6m_pct"] > m["ret_3m_pct"] > 0
        # High/Low = +-2% wokol Close => ADR = (1.02/0.98 - 1)*100
        assert m["adr_pct"] == pytest.approx((1.02 / 0.98 - 1) * 100, abs=0.01)
        assert m["dollar_volume_avg"] == pytest.approx(df["Close"].tail(20).mean() * 1_000_000, rel=0.01)
        assert m["low_ratio_6m"] > m["low_ratio_3m"] > m["low_ratio_1m"] > 1
        assert m["pct_above_sma50"] > 0 and m["pct_above_sma200"] > m["pct_above_sma50"]
        assert len(m["spark"]) == watchlist.SPARK_WEEKS and m["spark"][0] == 0

    def test_compute_metrics_young_stock_has_no_rs_score(self):
        m = watchlist.compute_metrics(make_prices(n=120))
        assert m["rs_score"] is None and m["ret_12m_pct"] is None and m["adr_pct"] is not None

    def test_compute_metrics_too_short_history(self):
        assert watchlist.compute_metrics(make_prices(n=10)) is None

    def test_eps_score_renormalizes_and_needs_latest_quarter(self):
        assert watchlist.eps_score(None, 50, 20, 20) is None                     # bez najnowszego kwartału nie ma wyniku
        assert watchlist.eps_score(40, None, None, None) is None                 # za mało składników
        assert watchlist.eps_score(1000, 1000, 1000, 1000) == 1000.0             # surowe procenty, bez obcinania (jak w rs_score)
        assert watchlist.eps_score(-500, -500, None, None) == -500.0             # brakujące składniki pomijane
        # renormalizacja wag: dwa składniki (0,35 i 0,25) -> (0,35*40 + 0,25*20) / 0,6
        assert watchlist.eps_score(40, 20, None, None) == pytest.approx((0.35 * 40 + 0.25 * 20) / 0.6, abs=0.01)

    def test_eps_stability_share_of_positive_quarters(self):
        assert watchlist.eps_stability([10, 20, 15, 30]) == 100.0
        assert watchlist.eps_stability([10, -5, 20, -8]) == 50.0
        assert watchlist.eps_stability([None, 10, 20]) is None                   # < 4 porównań r/r
        # tylko ostatnie 8 kwartałów: dawne straty nie liczą się
        assert watchlist.eps_stability([-5] * 4 + [10] * 8) == 100.0

    def test_eps_rating_blends_growth_and_stability_percentiles(self):
        def quarters_cache(growths):
            # kolejne kwartały co ~91 dni; EPS rośnie/spada tak, by r/r dawało zadane wzrosty
            import datetime as dt
            base = dt.date(2023, 1, 10)
            eps = []
            rows = []
            for i in range(len(growths) + 4):
                d = base + dt.timedelta(days=91 * i)
                if i < 4:
                    v = 1.0
                else:
                    v = eps[i - 4] * (1 + growths[i - 4] / 100)
                eps.append(v)
                rows.append({"date": d.strftime("%Y-%m-%d"), "eps": v, "est": None})
            return {"fetched": "2026-10-01", "rows": rows}
        steady = [20, 20, 20, 20, 20, 20, 20, 20]
        erratic = [60, -30, 60, -30, 60, -30, 60, 40]
        stocks = [{"ticker": "S", "rs_rating": 50, "eps_this_y": 20, "eps_past_5y": 20},
                  {"ticker": "E", "rs_rating": 50, "eps_this_y": 20, "eps_past_5y": 20}]
        watchlist.add_eps_rating(stocks, {"S": quarters_cache(steady), "E": quarters_cache(erratic)})
        s, e = stocks
        assert s["eps_stability"] == 100.0 and e["eps_stability"] < 100.0
        # E ma wyższy wzrost ostatniego kwartału, ale S wygrywa stabilnością w 20 % — rating E nie przekracza 80 % wagi wzrostu
        assert s["eps_stability_rating"] > e["eps_stability_rating"]
        assert s["eps_rating"] is not None and e["eps_rating"] is not None

    def test_add_eps_rating_percentile_and_composite(self):
        def cache(g_new, g_old):
            # kwartały r/r: 4 starsze + 2 nowsze tak, żeby ostatnie dwa miały zadany wzrost
            rows = [{"date": "2025-01-10", "eps": 1.0, "est": None}, {"date": "2025-04-10", "eps": 1.0, "est": None},
                    {"date": "2026-01-10", "eps": 1.0 * (1 + g_old / 100), "est": None}, {"date": "2026-04-10", "eps": 1.0 * (1 + g_new / 100), "est": None}]
            return {"fetched": "2026-10-01", "rows": rows}
        stocks = [{"ticker": "A", "rs_rating": 90, "eps_this_y": 30, "eps_past_5y": 25},
                  {"ticker": "B", "rs_rating": 40, "eps_this_y": 5, "eps_past_5y": 3},
                  {"ticker": "C", "rs_rating": 70, "eps_this_y": None, "eps_past_5y": None}]
        watchlist.add_eps_rating(stocks, {"A": cache(80, 60), "B": cache(-10, 0), "C": {"fetched": "2026-10-01", "rows": []}})
        a, b, c = stocks
        assert a["eps_q0_yoy"] == 80 and a["eps_q1_yoy"] == 60
        assert a["eps_rating"] == 99 and b["eps_rating"] == 1                      # percentyl wśród spółek z wynikiem
        assert c["eps_rating"] is None and c["composite_rating"] is None            # brak EPS -> brak Composite
        assert a["composite_rating"] == round(0.5 * 90 + 0.5 * 99)
        assert b["composite_rating"] == round(0.5 * 40 + 0.5 * 1)

    def test_add_rs_rating_percentiles_with_ties(self):
        stocks = [{"rs_score": 0.1}, {"rs_score": 0.2}, {"rs_score": 0.3}, {"rs_score": 0.3}, {"rs_score": None}]
        watchlist.add_rs_rating(stocks)
        assert [s["rs_rating"] for s in stocks] == [1, 34, 83, 83, None]
        single = [{"rs_score": 0.5}]
        watchlist.add_rs_rating(single)
        assert single[0]["rs_rating"] == 50

    def test_drop_incomplete_bar_removes_todays_open_session_only(self):
        df = make_prices(n=5, end="2026-09-30")
        during = pd.Timestamp("2026-09-30 15:00", tz="UTC")           # 11:00 ET — sesja trwa
        assert len(watchlist.drop_incomplete_bar(df, during)) == 4
        after = pd.Timestamp("2026-09-30 21:30", tz="UTC")            # 17:30 ET — po zamknieciu
        assert len(watchlist.drop_incomplete_bar(df, after)) == 5
        morning_next_day = pd.Timestamp("2026-10-01 05:00", tz="UTC")  # rano nastepnego dnia
        assert len(watchlist.drop_incomplete_bar(df, morning_next_day)) == 5


class TestPipeline:
    def test_build_stocks_merges_finviz_and_adds_rating(self):
        rows = [{"ticker": "AAA", "sector": "Tech", "eps_next_y": 5.0}, {"ticker": "BBB"}, {"ticker": "NOPRICE"}]
        frames = {"AAA": make_prices(daily=0.004), "BBB": make_prices(daily=0.001)}
        out = watchlist.build_stocks(rows, frames, pd.Timestamp("2026-10-01 05:00", tz="UTC"))
        assert [s["ticker"] for s in out] == ["AAA", "BBB"]
        assert out[0]["sector"] == "Tech" and out[0]["eps_next_y"] == 5.0
        assert out[0]["rs_rating"] > out[1]["rs_rating"]

    def test_run_falls_back_to_previous_list_when_finviz_fails(self, tmp_path, monkeypatch):
        out = tmp_path / "watchlist.json"
        out.write_text(json.dumps({"stocks": [{"ticker": "AAA", "sector": "Tech"}], "finviz_total": 7,
                                   "finviz_filters": "old"}), encoding="utf-8")
        monkeypatch.setattr(finviz, "fetch_watchlist", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("403")))
        monkeypatch.setattr(watchlist, "download_prices", lambda tickers: {"AAA": make_prices(), "^GSPC": make_prices(daily=0.0005)})
        monkeypatch.setattr(watchlist, "update_eps_cache", lambda tickers, path: {})
        assert watchlist.run(out) == 0
        assert (tmp_path / "charts.json").exists()
        data = json.loads(out.read_text(encoding="utf-8"))
        assert data["finviz_stale"] is True and data["stocks"][0]["sector"] == "Tech" and data["finviz_total"] == 7

    def test_run_fails_without_finviz_and_without_previous(self, tmp_path, monkeypatch):
        monkeypatch.setattr(finviz, "fetch_watchlist", lambda *a, **k: ([], 0))
        assert watchlist.run(tmp_path / "w.json") == 1

    def test_run_aborts_on_low_price_coverage_and_keeps_old_file(self, tmp_path, monkeypatch):
        out = tmp_path / "w.json"
        out.write_text("OLD", encoding="utf-8")
        rows = [{"ticker": f"T{i}"} for i in range(20)]
        monkeypatch.setattr(finviz, "fetch_watchlist", lambda *a, **k: (rows, 20))
        monkeypatch.setattr(watchlist, "download_prices", lambda tickers: {"T0": make_prices()})
        assert watchlist.run(out) == 1
        assert out.read_text(encoding="utf-8") == "OLD"


class TestCharts:
    def test_weekly_ohlcv_aggregates_and_relabels_partial_last_week(self):
        idx = pd.to_datetime(["2026-09-21", "2026-09-22", "2026-09-25", "2026-09-28", "2026-09-30"])
        df = pd.DataFrame({"Open": [1, 2, 3, 4, 5], "High": [2, 3, 4, 9, 6], "Low": [1, 1.5, 2, 3, 4],
                           "Close": [1.5, 2.5, 3.5, 5, 5.5], "Volume": [10, 10, 10, 10, 10]}, index=idx)
        w = watchlist.weekly_ohlcv(df)
        assert list(w.index) == [pd.Timestamp("2026-09-25"), pd.Timestamp("2026-09-30")]  # niepelny tydzien -> data ostatniej sesji
        assert w.iloc[0].to_dict() == {"Open": 1, "High": 4, "Low": 1, "Close": 3.5, "Volume": 30}
        assert w.iloc[1]["High"] == 9 and w.iloc[1]["Open"] == 4 and w.iloc[1]["Volume"] == 20

    def test_build_daily_has_sma_on_full_history_and_aligns_days(self):
        df = make_prices(n=300, daily=0.002)
        days = list(df.index[-20:])
        d = watchlist.build_daily(df, days)
        assert len(d["c"]) == 20 and all(len(d[k]) == 20 for k in ("o", "h", "l", "v", "sma10", "sma20"))
        assert d["sma20"][0] is not None  # SMA liczona na pelnej historii, nie tylko na oknie

    def test_build_chart_aligns_to_common_weeks_and_pads_missing(self):
        weekly = watchlist.weekly_ohlcv(make_prices(n=300, daily=0.002))
        weeks = list(weekly.index[-10:])
        chart = watchlist.build_chart(weekly, weeks + [weeks[-1] + pd.Timedelta(days=7)])
        assert len(chart["c"]) == 11 and chart["c"][-1] is None and chart["c"][0] is not None
        assert chart["sma10"][0] is not None and chart["sma40"][0] is not None
        assert chart["v"][0] == int(round(weekly["Volume"].iloc[-10] / 1000))

    def test_eps_quarters_yoy_and_next_estimate(self):
        rows = [
            {"date": "2025-07-30", "eps": 1.0, "est": 0.9}, {"date": "2025-10-30", "eps": 2.0, "est": 1.9},
            {"date": "2026-07-30", "eps": 1.5, "est": 1.4}, {"date": "2026-10-29", "eps": 1.0, "est": 1.2},
            {"date": "2027-01-28", "eps": None, "est": 2.5}, {"date": "2027-04-29", "eps": None, "est": 2.9},
        ]
        quarters, nxt = watchlist.eps_quarters(rows)
        assert [q["d"] for q in quarters] == ["2025-07-30", "2025-10-30", "2026-07-30", "2026-10-29"]
        assert quarters[0]["g"] is None                       # brak kwartalu sprzed roku
        assert quarters[2]["g"] == 50                         # 1.0 -> 1.5
        assert quarters[3]["g"] == -50                        # 2.0 -> 1.0
        assert nxt == {"d": "2027-01-28", "e": 2.5}

    def test_eps_quarters_yoy_with_negative_previous_uses_abs(self):
        rows = [{"date": "2025-07-30", "eps": -1.0, "est": None}, {"date": "2026-07-30", "eps": 1.0, "est": None}]
        assert watchlist.eps_quarters(rows)[0][1]["g"] == 200

    def test_update_eps_cache_fetches_only_stale_and_survives_errors(self, tmp_path):
        path = tmp_path / "eps.json"
        path.write_text(json.dumps({"FRESH": {"fetched": "2026-09-30", "rows": [1]},
                                    "OLD": {"fetched": "2026-09-01", "rows": [2]},
                                    "GONE": {"fetched": "2026-09-30", "rows": [3]}}), encoding="utf-8")
        calls = []

        def fake_fetch(t):
            calls.append(t)
            if t == "BAD":
                raise RuntimeError("429")
            return [{"date": "2026-07-30", "eps": 1.0, "est": 1.0}]
        cache = watchlist.update_eps_cache(["FRESH", "OLD", "NEW", "BAD"], path, now="2026-10-01", fetch=fake_fetch)
        assert sorted(calls) == ["BAD", "NEW", "OLD"]
        assert cache["FRESH"]["rows"] == [1] and cache["OLD"]["fetched"] == "2026-10-01"
        assert "BAD" not in cache and "GONE" not in cache  # blad = brak wpisu; spolki spoza listy sprzatane
        assert json.loads(path.read_text(encoding="utf-8")) == cache

    def test_build_charts_structure_with_benchmark_and_eps(self):
        now = pd.Timestamp("2026-10-01 05:00", tz="UTC")
        frames = {"AAA": make_prices(n=400, daily=0.003)}
        cache = {"AAA": {"rows": [{"date": "2026-07-30", "eps": 2.0, "est": 1.8}, {"date": "2025-07-30", "eps": 1.0, "est": 1.0},
                                  {"date": "2026-10-29", "eps": None, "est": 2.2}]}}
        charts = watchlist.build_charts(["AAA", "NOPRICE"], frames, make_prices(n=400, daily=0.001), cache, now, n_weeks=52)
        assert charts["benchmark"] == "^GSPC" and len(charts["weeks"]) == 52 and len(charts["spx"]) == 52
        assert list(charts["stocks"]) == ["AAA"]
        a = charts["stocks"]["AAA"]
        assert all(len(a[k]) == 52 for k in ("o", "h", "l", "c", "v", "sma10", "sma40"))
        assert a["eps"][-1] == {"d": "2026-07-30", "e": 2.0, "g": 100} and a["eps_next"] == {"d": "2026-10-29", "e": 2.2}

    def test_build_charts_without_benchmark_still_works(self):
        charts = watchlist.build_charts(["AAA"], {"AAA": make_prices(n=300)}, None, {}, pd.Timestamp("2026-10-01 05:00", tz="UTC"), 30)
        assert charts["benchmark"] is None and charts["spx"] is None and len(charts["stocks"]["AAA"]["c"]) == 30


def make_weekly(highs, lows=None, closes=None, start="2025-01-03"):
    idx = pd.date_range(start, periods=len(highs), freq="W-FRI")
    lows = lows if lows is not None else [h * 0.97 for h in highs]
    closes = closes if closes is not None else [(h + lo) / 2 for h, lo in zip(highs, lows)]
    return pd.DataFrame({"Open": closes, "High": highs, "Low": lows, "Close": closes, "Volume": 1000}, index=idx)


class TestBases:
    def test_zigzag_contractions_ignore_noise_and_measure_drops(self):
        closes = [100, 90, 98, 92, 97, 94, 96]
        assert watchlist.zigzag_contractions(closes, pct=3.0) == [10.0, 6.1, 3.1]
        assert watchlist.zigzag_contractions([100, 100.5, 100.2, 100.8], pct=3.0) == []   # sam szum, brak skurczów
        assert watchlist.zigzag_contractions([]) == []

    def test_closed_base_depth_length_and_breakout(self):
        # szczyt 100 w tygodniu 2, korekta do ~80 przez 7 tygodni, potem wybicie ponad 100 (zamyka bazę)
        highs = [90, 95, 100, 96, 92, 88, 85, 86, 90, 95, 102, 104]
        lows = [h * 0.97 for h in highs]
        lows[6] = 80
        bases = watchlist.detect_bases(make_weekly(highs, lows))
        closed = [b for b in bases if not b["open"]]
        assert len(closed) == 1
        b = closed[0]
        assert b["peak"] == 100 and b["pivot"] == 100 and b["low"] == 80
        assert b["depth_pct"] == 20.0 and b["weeks"] == 8 and b["type"] in ("cup", "correction")
        assert b["start"] == "2025-01-17" and b["end"] == "2025-03-07"
        assert b["low_date"] == "2025-02-14" and b["end_close"] is not None

    def test_open_base_flat_vcp_with_shrinking_contractions(self):
        # szczyt 100, potem trzy coraz płytsze skurcze (10% -> 6% -> 3%+) i brak wybicia = otwarta baza "flat"
        closes = [100, 90, 98, 92, 97, 94.5, 96, 95, 96.5, 95.8]
        highs = [100] + [c * 1.005 for c in closes[1:]]
        lows = [c * 0.995 for c in closes]
        bases = watchlist.detect_bases(make_weekly(highs, lows, closes))
        assert len(bases) == 1 and bases[0]["open"] is True
        b = bases[0]
        assert b["type"] == "flat" and b["vcp"] is True and b["pivot"] == 100
        assert b["contractions"] == sorted(b["contractions"], reverse=True)

    def test_short_or_shallow_pullbacks_are_not_bases(self):
        highs = [100, 101, 102, 103, 104, 105, 106, 107]               # ciągły trend, brak korekt
        assert watchlist.detect_bases(make_weekly(highs)) == []
        shallow = [100, 99, 99.5, 99.2, 99.4, 99.1, 99.3]               # < 6 % głębokości
        assert watchlist.detect_bases(make_weekly(shallow, [h * 0.995 for h in shallow])) == []

    def test_metrics_expose_52w_high_distance_and_open_base_summary(self):
        df = make_prices(n=300, daily=0.003)
        df.iloc[-30:, df.columns.get_indexer(["Close", "High", "Low", "Open"])] *= 0.8      # korekta ~20 % od szczytu
        m = watchlist.compute_metrics(df)
        assert m["pct_from_high_52w"] < -5
        assert m["base_type"] in ("flat", "cup", "correction", "deep") and m["pivot"] > m["price"]
        assert m["pct_to_pivot"] > 0 and isinstance(m["vcp"], bool)

    def test_build_charts_includes_recent_bases_only(self):
        df = make_prices(n=400, daily=0.002)
        charts = watchlist.build_charts(["AAA"], {"AAA": df}, None, {}, pd.Timestamp("2026-10-01 05:00", tz="UTC"), 52)
        assert "bases" in charts["stocks"]["AAA"]
        assert len(charts["stocks"]["AAA"]["bases"]) <= watchlist.BASE_MAX_SHOWN


class TestConsolidation:
    CFG = dict(k=2, min_len=6, max_len=30, recent=3, pole_lookback=20, pole_min_gain=20.0, max_depth=20.0, box_depth=12.0, box_min_len=10)

    def _frame(self, closes, volume):
        idx = pd.bdate_range("2026-01-01", periods=len(closes))
        c = np.array(closes, dtype=float)
        return pd.DataFrame({"Open": c, "High": c * 1.01, "Low": c * 0.99, "Close": c, "Volume": volume}, index=idx)

    def _flag_series(self, breakout):
        # 30 sesji dryfu, maszt 100 -> 130 w 12 sesji, flaga 14 sesji (130 -> ~124 z falowaniem), potem wybicie
        pre = [100.0] * 30
        pole = list(np.linspace(100, 130, 12))
        wave = [130 - 0.45 * i + (1.5 if i % 4 == 0 else -1.5) for i in range(14)]
        post = [135.0, 138.0, 140.0] if breakout else [124.0, 124.5, 125.0]
        return pre + pole + wave + post

    def test_flag_with_pole_and_volume_confirmed_breakout(self):
        closes = self._flag_series(True)
        vol = np.full(len(closes), 1000.0)
        vol[30:42] = 2000.0                  # maszt: duzy wolumen
        vol[42:56] = 800.0                   # flaga: schnie
        vol[56] = 3000.0                     # wybicie
        tl = watchlist.detect_consolidation(self._frame(closes, vol), self.CFG)
        assert tl is not None and tl["pattern"] == "flaga" and tl["state"] == "wybicie"
        info = tl["info"]
        assert info["pole_gain"] >= 25 and info["vol_ratio"] < 0.6
        assert tl["breakout"]["confirmed"] is True
        assert {ln["kind"] for ln in tl["lines"]} >= {"res"}

    def test_breakout_without_volume_is_not_confirmed(self):
        closes = self._flag_series(True)
        tl = watchlist.detect_consolidation(self._frame(closes, 1000.0), self.CFG)
        assert tl["state"] == "wybicie" and tl["breakout"]["confirmed"] is False

    def test_flag_still_inside_has_no_breakout(self):
        tl = watchlist.detect_consolidation(self._frame(self._flag_series(False), 1000.0), self.CFG)
        assert tl is not None and tl["state"] in (None, "przy oporze") and tl["breakout"] is None

    def test_random_flat_noise_or_short_history_returns_none(self):
        assert watchlist.detect_consolidation(self._frame([100.0] * 8, 1000.0), self.CFG) is None
        rising = list(np.linspace(100, 200, 80))            # czysty trend bez konsolidacji
        assert watchlist.detect_consolidation(self._frame(rising, 1000.0), self.CFG) is None


class TestRsLine:
    def test_rs_new_high_uses_full_history_and_flags_rs_before_price(self):
        idx = pd.bdate_range("2025-01-01", periods=300)
        bench = pd.Series(100.0, index=idx)                      # rynek stoi w miejscu
        price = pd.Series(100.0, index=idx)
        price.iloc[-60:-20] = np.linspace(100, 130, 40)          # silny wzrost -> szczyt ceny i RS
        price.iloc[-20:] = np.linspace(130, 126, 20)             # lekki odpływ
        rs, rs_hi, px_hi = watchlist.rs_line_flags(price, bench)
        assert rs.iloc[-1] == 1.26 and bool(rs_hi.iloc[-21]) and not bool(rs_hi.iloc[10])   # za mało historii na początku
        summary = watchlist.rs_line_summary(rs, rs_hi, px_hi, recent=30)
        assert summary["state"] == "na szczycie" or summary["state"] == "przed ceną"
        assert summary["dist_pct"] < 0

    def test_state_is_przed_cena_when_rs_high_but_price_below_its_high(self):
        idx = pd.bdate_range("2025-01-01", periods=300)
        price = pd.Series(100.0, index=idx)
        price.iloc[-40:] = np.linspace(100, 120, 40)             # cena rośnie do 120 ...
        bench = pd.Series(100.0, index=idx)
        bench.iloc[:-5] = 100.0
        price.iloc[:-40] = 130.0                                 # ... ale rok temu była wyżej (130) -> cena poniżej maksimum 52 tyg.
        bench.iloc[:-40] = 200.0                                 # a RS było niskie (0.65) -> dziś RS na maksimum
        rs, rs_hi, px_hi = watchlist.rs_line_flags(price, bench)
        assert watchlist.rs_line_summary(rs, rs_hi, px_hi)["state"] == "przed ceną"


class TestEstimates:
    RAW = {
        "pt": {"low": 46.0, "mean": 60.0, "median": 61.0, "high": 74.0},
        "trend": {"0y": {"current": 1.2, "7daysAgo": 1.19, "30daysAgo": 1.0, "60daysAgo": 0.9, "90daysAgo": 0.8},
                  "+1y": {"current": 1.3, "7daysAgo": 1.3, "30daysAgo": 1.4, "60daysAgo": 1.4, "90daysAgo": 1.5}},
        "est": {"0y": {"avg": 1.2, "low": 1.1, "high": 1.3, "numberOfAnalysts": 6.0, "growth": 0.5, "yearAgoEps": 0.8},
                "+1y": {"avg": 1.3, "low": 1.2, "high": 1.5, "numberOfAnalysts": 6.0, "growth": 0.1, "yearAgoEps": 1.2}},
        "rev": {"0y": {"upLast7days": 4, "upLast30days": 5, "downLast30days": 0, "downLast7Days": 0}, "+1y": {}},
    }

    def test_entry_seeds_history_from_trend_and_merges_new_points(self):
        e = watchlist.build_estimate_entry(self.RAW, None, "2026-10-02")
        h = e["p"]["0y"]["h"]
        assert [d for d, _ in h] == ["2026-07-04", "2026-08-03", "2026-09-02", "2026-09-25", "2026-10-02"]
        assert h[0][1] == 0.8 and h[-1][1] == 1.2
        assert e["p"]["0y"]["n"] == 6.0 and e["p"]["0y"]["u30"] == 5
        raw2 = {**self.RAW, "trend": {**self.RAW["trend"], "0y": {**self.RAW["trend"]["0y"], "current": 1.25}}}
        e2 = watchlist.build_estimate_entry(raw2, e, "2026-10-04")
        h2 = e2["p"]["0y"]["h"]
        assert h2[-1] == ["2026-10-04", 1.25]
        assert ["2026-10-02", 1.2] in h2 and len(h2) >= 6          # historia rośnie, stare punkty zostają

    def test_estimate_fields_upside_and_revisions(self):
        e = watchlist.build_estimate_entry(self.RAW, None, "2026-10-02")
        f = watchlist.estimate_fields(e, 50.0)
        assert f["pt_mean"] == 60.0 and f["pt_upside_pct"] == 20.0
        assert f["pt_low"] == 46.0 and f["pt_high"] == 74.0
        assert f["eps_rev90_pct"] == 50.0                            # 0.8 -> 1.2
        assert f["eps1_rev30_pct"] == -7.1                           # 1.4 -> 1.3
        assert f["rev_up30"] == 5 and f["rev_down30"] == 0 and f["analysts"] == 6.0
        assert watchlist.estimate_fields(None, 50.0)["pt_upside_pct"] is None

    def test_update_estimates_uses_cache_skips_fresh_and_survives_errors(self, tmp_path):
        calls = []

        def fake(t):
            calls.append(t)
            if t == "BAD":
                raise RuntimeError("yahoo")
            return self.RAW
        path = tmp_path / "estimates.json"
        out = watchlist.update_estimates(["AAA", "BAD"], path, now="2026-10-02", fetch=fake)
        assert "AAA" in out and "BAD" not in out
        calls.clear()
        watchlist.update_estimates(["AAA", "BAD"], path, now="2026-10-03", fetch=fake)   # AAA świeże (1 dzień), BAD ponawiane
        assert calls == ["BAD"]
        assert json.loads(path.read_text())["stocks"]["AAA"]["pt"]["mean"] == 60.0


def make_cup(depth=0.25, n_cup=24, handle=(0.97, 0.95, 0.96), prior_start=60.0, prior_weeks=40, shape="u", rim_gap=0.05):
    """Syntetyczny tygodniowy cup: wzrost przed szczytem 100, miseczka (parabola przez szczyt, dołek, prawy brzeg), rączka."""
    top = 100.0
    closes = list(np.linspace(prior_start, top, prior_weeks))
    low, rim = top * (1 - depth), top * (1 - rim_gap)
    if shape == "u":
        coef = np.polyfit([0, 0.5, 1], [top, low, rim], 2)
        cup = [float(np.polyval(coef, k / n_cup)) for k in range(1, n_cup + 1)]
    else:   # V: prosty spadek i prosty wzrost
        half = n_cup // 2
        cup = list(np.linspace(top, low, half + 1)[1:]) + list(np.linspace(low, rim, n_cup - half + 1)[1:])
    closes += cup
    closes += [rim * m for m in handle]
    highs = [c * 1.01 for c in closes]
    lows = [c * 0.99 for c in closes]
    rim_i = prior_weeks + n_cup - 1
    highs[prior_weeks - 1] = top * 1.01                 # lewy szczyt
    highs[rim_i] = rim * 1.01                           # prawy brzeg = najwyższy szczyt po dołku
    return make_weekly(highs, lows, closes)


class TestCup:
    def test_textbook_cup_with_handle(self):
        bases = watchlist.detect_bases(make_cup())
        cups = [b for b in bases if b["type"] == "cup"]
        assert len(cups) == 1
        b = cups[0]
        assert b["open"] is True and b["cup"]["handle"] is not None and b["cup"]["handle"]["weeks"] == 3
        assert 24 <= b["depth_pct"] <= 27 and b["cup"]["prior_gain_pct"] >= 60
        assert b["pivot"] == b["cup"]["rim"]                               # pivot = górka rączki (prawy brzeg)
        assert b["cup"]["cup_weeks"] == 24 and b["cup"]["fit"] >= 0.6

    def test_v_shape_is_not_a_cup(self):
        assert [b for b in watchlist.detect_bases(make_cup(shape="v")) if b["type"] == "cup"] == []

    def test_cup_needs_a_prior_uptrend(self):
        assert [b for b in watchlist.detect_bases(make_cup(prior_start=95.0)) if b["type"] == "cup"] == []   # +5 % przed szczytem

    def test_depth_limits_and_bear_market_exception(self):
        assert [b for b in watchlist.detect_bases(make_cup(depth=0.08)) if b["type"] == "cup"] == []         # za płytko
        deep = make_cup(depth=0.42)
        assert [b for b in watchlist.detect_bases(deep) if b["type"] == "cup"] == []                          # za głęboko w spokojnym rynku
        weekly = deep
        bench = pd.Series(np.where(np.arange(len(weekly)) < 40, 100.0, np.linspace(100.0, 78.0, len(weekly))[:len(weekly)] * 0 + 100 - np.minimum(22.0, (np.arange(len(weekly)) - 40) * 1.5)), index=weekly.index)
        cups = [b for b in watchlist.detect_bases(weekly, bench) if b["type"] == "cup"]
        assert len(cups) == 1 and cups[0]["cup"]["mkt_dd_pct"] >= 15 and cups[0]["cup"]["mkt_ctx"] is True   # silna korekta S&P dopuszcza głębszą miseczkę

    def test_market_context_flag_and_drawdown(self):
        weekly = make_cup()
        bench = pd.Series(100.0, index=weekly.index)
        bench.iloc[50:56] = 92.0                                                                              # S&P −8 % w trakcie miseczki
        c = [b for b in watchlist.detect_bases(weekly, bench) if b["type"] == "cup"][0]["cup"]
        assert c["mkt_dd_pct"] == 8.0 and c["mkt_ctx"] is True
        calm = [b for b in watchlist.detect_bases(weekly, pd.Series(100.0, index=weekly.index)) if b["type"] == "cup"][0]["cup"]
        assert calm["mkt_dd_pct"] == 0.0 and calm["mkt_ctx"] is False
        assert watchlist.mkt_drawdown(None, "2025-01-01", "2025-06-01") is None
