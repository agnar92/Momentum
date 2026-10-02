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
    def test_ema34_rising_for_steady_uptrend_and_not_for_downtrend(self):
        up = make_prices(daily=0.003)["Close"]
        rising, slope, ema = watchlist.ema34_trend(up)
        assert rising is True and slope > 0 and ema > 0
        down = make_prices(daily=-0.003)["Close"]
        assert watchlist.ema34_trend(down)[0] is False

    def test_ema34_requires_every_5_day_step_to_rise(self):
        close = make_prices(daily=0.003)["Close"].copy()
        # mocny spadek 8-12 sesji temu: EMA34 w punkcie -10 sesji spada wzgledem -15 => nie "rosnie co 5 dni"
        close.iloc[-16:-6] = close.iloc[-16:-6] * 0.7
        assert watchlist.ema34_trend(close)[0] is False

    def test_ema34_none_without_enough_history(self):
        assert watchlist.ema34_trend(make_prices(n=40)["Close"]) == (None, None, None)

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
        assert m["ema34_rising"] is True
        assert len(m["spark"]) == watchlist.SPARK_WEEKS and m["spark"][0] == 0

    def test_compute_metrics_young_stock_has_no_rs_score(self):
        m = watchlist.compute_metrics(make_prices(n=120))
        assert m["rs_score"] is None and m["ret_12m_pct"] is None and m["adr_pct"] is not None

    def test_compute_metrics_too_short_history(self):
        assert watchlist.compute_metrics(make_prices(n=10)) is None

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
