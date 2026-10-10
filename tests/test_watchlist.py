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

    def test_parse_custom_view_recom_and_target_price(self):
        page = """<html><body><div>#1 / 556 Total</div>
        <table class="screener_table"><thead><tr><th>No.</th><th>Ticker</th><th>Recom</th><th>Target Price</th><th>Inst Own</th><th>Inst Trans</th></tr></thead>
        <tr class="styled-row"><td>1</td><td data-boxover-ticker="A">A</td><td>1.84</td><td>175.89</td><td>95.51%</td><td>-1.09%</td></tr>
        <tr class="styled-row"><td>2</td><td data-boxover-ticker="B">B</td><td>-</td><td>-</td><td>-</td><td>-</td></tr>
        </table></body></html>"""
        rows, total = finviz.parse_screener_page(page, "152")
        assert total == 556
        assert rows == [{"ticker": "A", "recom": 1.84, "finviz_target": 175.89, "inst_own": 95.51, "inst_trans": -1.09},
                        {"ticker": "B", "recom": None, "finviz_target": None, "inst_own": None, "inst_trans": None}]

    def test_parse_custom_view_canslim_columns(self):
        page = """<html><body><div>#1 / 5 Total</div>
        <table class="screener_table"><thead><tr><th>No.</th><th>Ticker</th><th>Sales Q/Q</th><th>Float</th><th>Outstanding</th><th>Insider Own</th><th>Debt/Eq</th></tr></thead>
        <tr class="styled-row"><td>1</td><td data-boxover-ticker="A">A</td><td>31.2%</td><td>280.98M</td><td>281.97M</td><td>0.34%</td><td>0.54</td></tr>
        </table></body></html>"""
        rows, _ = finviz.parse_screener_page(page, "152")
        assert rows == [{"ticker": "A", "sales_qq": 31.2, "shs_float": 280.98e6, "shs_outstanding": 281.97e6, "insider_own": 0.34, "debt_eq": 0.54}]

    def test_fetch_view_adds_custom_columns_param_only_for_the_custom_view(self, monkeypatch):
        seen = []

        class FakeResp:
            text = "<html></html>"

            def raise_for_status(self):
                pass

        class FakeSession:
            def get(self, url, params=None, **kw):
                seen.append(params)
                return FakeResp()
        finviz.fetch_view("152", "f", 5, 0, FakeSession())
        finviz.fetch_view("121", "f", 5, 0, FakeSession())
        assert seen[0]["c"] == finviz.VIEW_PARAMS["152"]["c"] and seen[0]["c"].startswith("0,1,62,69,28,29") and "c" not in seen[1]

    def test_institutional_flag(self):
        assert watchlist.institutional_flag(65.0, 1.2) is True
        assert watchlist.institutional_flag(65.0, -0.5) is False         # odpływ
        assert watchlist.institutional_flag(10.0, 3.0) is False          # za mała własność
        assert watchlist.institutional_flag(None, 1.0) is None
        assert watchlist.institutional_flag(99.4, 0.1) is False          # przesadne obłożenie (> 90 %)
        assert watchlist.institutional_flag(90.0, 0.1) is True
        assert watchlist.institutional_flag(121.0, 2.0) is None          # Finviz > 100 % = dane niewiarygodne

    def test_finviz_upside(self):
        assert watchlist.finviz_upside(120, 100) == 20.0
        assert watchlist.finviz_upside(None, 100) is None
        assert watchlist.finviz_upside(120, 0) is None

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
        assert "tlw_level" in m and "tlw_dist_pct" in m   # poziom oporu tygodniowej flagi/korytarza (None bez formacji)
        assert not any(k.startswith(("dbase_", "dpivot", "tl_")) for k in m)   # wzorce dzienne usunięte — tylko tygodniowe
        assert "dist_top" in m

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

    def test_fetch_and_compute_stages_match_the_all_in_one_run(self, tmp_path, monkeypatch):
        rows = [{"ticker": t, "sector": "Tech"} for t in ("AAA", "BBB", "CCC")]
        frames = {"AAA": make_prices(daily=0.004), "BBB": make_prices(daily=0.001), "CCC": make_prices(daily=0.002)}
        frames["AAA"].attrs["splits"] = [["2026-05-01", 2.0]]
        net = {"on": True}

        def guarded(value):
            def f(*a, **k):
                if not net["on"]:
                    raise AssertionError("sieć w kroku obliczeń")
                return value(*a, **k) if callable(value) else value
            return f
        monkeypatch.setattr(finviz, "fetch_watchlist", guarded((rows, 3)))
        monkeypatch.setattr(finviz, "MIN_TICKERS", 1)
        monkeypatch.setattr(watchlist, "download_prices", guarded(lambda tickers, **k: {t: frames.get(t, make_prices(daily=0.0005)) for t in tickers}))
        monkeypatch.setattr(watchlist, "update_eps_cache", guarded(lambda tickers, path: {}))
        monkeypatch.setattr(watchlist, "update_estimates", guarded(lambda tickers, path: {}))
        monkeypatch.setattr(watchlist, "fetch_usdpln", guarded({"usdpln": 3.9, "as_of": "2026-09-30"}))
        monkeypatch.setattr(watchlist, "MIN_COVERAGE", 0.5)
        all_out = tmp_path / "all" / "watchlist.json"
        assert watchlist.run(all_out) == 0
        split_out, raw_dir = tmp_path / "split" / "watchlist.json", tmp_path / "raw"
        assert watchlist.run(split_out, stage="compute", raw_dir=raw_dir) == 1          # bez migawki nie ma czego liczyć
        assert watchlist.run(split_out, stage="fetch", raw_dir=raw_dir) == 0
        assert not split_out.exists() and (raw_dir / "canslim.pkl.gz").exists()          # pobranie niczego nie liczy ani nie publikuje
        net["on"] = False                                                              # obliczenia nie mogą dotknąć sieci
        assert watchlist.run(split_out, stage="compute", raw_dir=raw_dir) == 0
        a, b = (json.loads(p.read_text(encoding="utf-8")) for p in (all_out, split_out))
        for d in (a, b):
            d.pop("generated_at")
        assert a == b
        assert (split_out.parent / "charts.json").exists()
        assert watchlist.load_raw("canslim", raw_dir)["frames"]["AAA"].attrs["splits"] == [["2026-05-01", 2.0]]

    def test_all_in_one_run_can_also_save_the_snapshot_for_later_computing(self, tmp_path, monkeypatch):
        rows = [{"ticker": t} for t in ("AAA", "BBB")]
        frames = {"AAA": make_prices(daily=0.004), "BBB": make_prices(daily=0.001)}
        monkeypatch.setattr(finviz, "fetch_watchlist", lambda *a, **k: (rows, 2))
        monkeypatch.setattr(finviz, "MIN_TICKERS", 1)
        monkeypatch.setattr(watchlist, "download_prices", lambda tickers, **k: {t: frames.get(t, make_prices(daily=0.0005)) for t in tickers})
        monkeypatch.setattr(watchlist, "update_eps_cache", lambda tickers, path: {})
        monkeypatch.setattr(watchlist, "update_estimates", lambda tickers, path: {})
        monkeypatch.setattr(watchlist, "fetch_usdpln", lambda: {"usdpln": 3.9, "as_of": "2026-09-30"})
        monkeypatch.setattr(watchlist, "MIN_COVERAGE", 0.5)
        raw_dir = tmp_path / "raw"
        out = tmp_path / "a" / "watchlist.json"
        assert watchlist.run(out, raw_dir=raw_dir, save_snapshot=True) == 0
        assert (raw_dir / "canslim.pkl.gz").exists()
        again = tmp_path / "b" / "watchlist.json"
        monkeypatch.setattr(watchlist, "download_prices", lambda *a, **k: (_ for _ in ()).throw(AssertionError("sieć")))
        assert watchlist.run(again, stage="compute", raw_dir=raw_dir) == 0
        a, b = (json.loads(p.read_text(encoding="utf-8")) for p in (out, again))
        for d in (a, b):
            d.pop("generated_at")
        assert a == b

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
        assert quarters[3]["t"] == 5.5 and quarters[2]["t"] is None   # TTM = suma 4 kwartałów; wcześniej brak 4 kwartałów (dwa 2025 + dwa 2026 = 4 wiersze)
        assert nxt == {"d": "2027-01-28", "e": 2.5, "t": 7.0}     # prognoza 2.5 + trzy ostatnie zrealizowane (2.0 + 1.5 + 1.0)

    def test_eps_quarters_yoy_with_negative_previous_uses_abs(self):
        rows = [{"date": "2025-07-30", "eps": -1.0, "est": None}, {"date": "2026-07-30", "eps": 1.0, "est": None}]
        assert watchlist.eps_quarters(rows)[0][1]["g"] == 200

    def test_accdis_score_and_rating_letters(self):
        up = make_prices(n=120, daily=0.002)
        down = up.copy()
        # dni zamykane przy maksimum (akumulacja) vs przy minimum (dystrybucja)
        up["Close"] = up["High"]
        down["Close"] = down["Low"]
        assert watchlist.accdis_score(up) > 0.9 and watchlist.accdis_score(down) < -0.9
        assert watchlist.accdis_score(up.head(10)) is None                      # za mało sesji
        stocks = [{"accdis_score": v} for v in (0.9, 0.5, 0.0, -0.5, -0.9)]
        watchlist.add_accdis_rating(stocks)
        assert [s["accdis"] for s in stocks] == ["A", "B", "C", "D", "E"]
        assert watchlist.accdis_letter(None) is None

    def test_update_eps_cache_fetches_only_stale_and_survives_errors(self, tmp_path):
        path = tmp_path / "eps.json"
        path.write_text(json.dumps({"FRESH": {"fetched": "2026-09-30", "rows": [1], "v": watchlist.EPS_CACHE_VERSION},
                                    "OLDV": {"fetched": "2026-09-30", "rows": [9]},   # wpis ze starej wersji cache (20 kwartałów) — pobierany ponownie
                                    "OLD": {"fetched": "2026-09-01", "rows": [2]},
                                    "OTHER": {"fetched": "2026-09-30", "rows": [3], "v": watchlist.EPS_CACHE_VERSION},      # ticker drugiego skanera — zostaje
                                    "GONE": {"fetched": "2026-06-01", "rows": [4]}}), encoding="utf-8")   # nieodświeżany > CACHE_KEEP_DAYS — sprzątany
        calls = []

        def fake_fetch(t):
            calls.append(t)
            if t == "BAD":
                raise RuntimeError("429")
            return [{"date": "2026-07-30", "eps": 1.0, "est": 1.0}]
        cache = watchlist.update_eps_cache(["FRESH", "OLD", "OLDV", "NEW", "BAD"], path, now="2026-10-01", fetch=fake_fetch)
        assert sorted(calls) == ["BAD", "NEW", "OLD", "OLDV"]
        assert cache["FRESH"]["rows"] == [1] and cache["OLD"]["fetched"] == "2026-10-01"
        assert "BAD" not in cache and "GONE" not in cache  # blad = brak wpisu; wpisy bez odswiezenia > 45 dni sprzatane
        assert cache["OTHER"]["rows"] == [3]               # wpis spolki z drugiego skanera (wspolny plik) zostaje
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
        assert a["eps"][-1] == {"d": "2026-07-30", "e": 2.0, "g": 100, "t": None} and a["eps_next"] == {"d": "2026-10-29", "e": 2.2, "t": None}   # t: za mało kwartałów na TTM

    def test_build_charts_without_benchmark_still_works(self):
        charts = watchlist.build_charts(["AAA"], {"AAA": make_prices(n=300)}, None, {}, pd.Timestamp("2026-10-01 05:00", tz="UTC"), 30)
        assert charts["benchmark"] is None and charts["spx"] is None and len(charts["stocks"]["AAA"]["c"]) == 30


def make_weekly(highs, lows=None, closes=None, start="2025-01-03", volume=1000):
    idx = pd.date_range(start, periods=len(highs), freq="W-FRI")
    lows = lows if lows is not None else [h * 0.97 for h in highs]
    closes = closes if closes is not None else [(h + lo) / 2 for h, lo in zip(highs, lows)]
    return pd.DataFrame({"Open": closes, "High": highs, "Low": lows, "Close": closes, "Volume": volume}, index=idx)


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
        assert b["depth_pct"] == 20.0 and b["weeks"] == 7 and b["type"] in ("cup", "correction")   # czas bazy od pierwszego tygodnia ze spadkiem zamknięcia (peak + 1)
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
        assert m["base_type"] in ("flat", "square_box", "cup", "correction", "deep") and m["pivot"] > m["price"]
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
        assert tl["state"] == "bez wolumenu" and tl["breakout"]["confirmed"] is False   # zamknięcie nad linią bez wolumenu to jeszcze nie wybicie

    def test_high_above_line_without_a_close_above_is_not_a_breakout(self):
        # świece przebijają opór maksimum (High), ale zamknięcia zostają pod linią — wybicia nie ma, nawet na dużym wolumenie
        closes = self._flag_series(False)
        df = self._frame(closes, 1000.0)
        df.iloc[-3:, df.columns.get_loc("High")] = [150.0, 150.0, 150.0]
        df.iloc[-1, df.columns.get_loc("Volume")] = 5000.0
        tl = watchlist.detect_consolidation(df, self.CFG)
        assert tl is not None and tl["state"] != "wybicie" and tl["breakout"] is None

    def test_breakout_that_fell_back_under_the_line_is_not_kept(self):
        closes = self._flag_series(True)[:-1] + [123.0]       # wybicie 2 sesje temu, ostatnie zamknięcie z powrotem pod linią
        vol = np.full(len(closes), 1000.0)
        vol[56] = 3000.0
        tl = watchlist.detect_consolidation(self._frame(closes, vol), self.CFG)
        assert tl is None or tl["state"] not in ("wybicie", "bez wolumenu")

    def test_level_break_needs_a_close_above_with_volume(self):
        closes = [100.0] * 30 + [99.0, 101.5, 102.0]
        df = self._frame(closes, 1000.0)
        df.iloc[-2, df.columns.get_loc("Volume")] = 2500.0
        b = watchlist.detect_level_break(df, 101.0, 5, 50, "D")
        assert b["state"] == "wybicie" and b["vol_ratio"] >= 2 and b["tf"] == "D"
        weak = watchlist.detect_level_break(self._frame(closes, 1000.0), 101.0, 5, 50, "D")
        assert weak["state"] == "bez wolumenu"
        assert watchlist.detect_level_break(df, 105.0, 5, 50, "D") is None                    # zamknięcia pod poziomem
        spiky = df.copy()
        spiky.iloc[-1, spiky.columns.get_loc("High")] = 110.0
        assert watchlist.detect_level_break(spiky, 105.0, 5, 50, "D") is None                 # samo przebicie High nie jest wybiciem
        fell = self._frame(closes[:-1] + [100.5], 1000.0)
        assert watchlist.detect_level_break(fell, 101.0, 5, 50, "D") is None                  # wybicie się nie utrzymało

    def test_volume_surge_takes_the_best_of_the_last_sessions(self):
        df = self._frame([100.0] * 70, 1000.0)
        df.iloc[-3, df.columns.get_loc("Volume")] = 4000.0
        assert watchlist.volume_surge(df) == 4.0
        assert watchlist.volume_surge(self._frame([100.0] * 5, 1000.0)) is None

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


def make_cup(depth=0.25, n_cup=24, handle=(0.97, 0.95, 0.96), prior_start=60.0, prior_weeks=40, shape="u", rim_gap=0.05, dry=True):
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
    vol = [1000.0] * len(closes)
    if dry:
        for j in range(len(handle)):
            vol[prior_weeks + n_cup + j] = 400.0                # wyschnięcie wolumenu w rączce (B)
    return make_weekly(highs, lows, closes, volume=vol)


class TestCup:
    def test_textbook_cup_with_handle(self):
        bases = watchlist.detect_bases(make_cup())
        cups = [b for b in bases if b["type"] == "cup"]
        assert len(cups) == 1
        b = cups[0]
        assert b["open"] is True and b["cup"]["handle"] is not None and b["cup"]["handle"]["weeks"] == 3
        assert 24 <= b["depth_pct"] <= 27 and b["cup"]["prior_gain_pct"] >= 60
        assert b["pivot"] == b["cup"]["rim"]                               # pivot = górka rączki (prawy brzeg)
        assert b["cup"]["cup_weeks"] == 23 and b["cup"]["fit"] >= 0.6   # 24 tygodnie od szczytu, liczone od pierwszego spadku

    def test_handle_is_found_before_the_breakout_above_the_left_peak(self):
        # miseczka, rączka 3 tygodnie, potem wybicie NAD lewy szczyt i dalszy wzrost: baza kończy się dopiero po przekroczeniu lewego szczytu,
        # ale prawy brzeg = szczyt przed rączką (nie najwyższy szczyt po dołku), a rączka kończy się tuż przed wybiciem
        df = make_cup()
        idx = pd.date_range(df.index[-1] + pd.Timedelta(days=7), periods=3, freq="W-FRI")
        extra = pd.DataFrame({"Open": [100.0, 104.0, 108.0], "High": [102.5, 107.0, 111.0], "Low": [96.0, 101.0, 105.0], "Close": [102.0, 106.0, 110.0], "Volume": [2500.0, 1800.0, 1500.0]}, index=idx)
        cups = [b for b in watchlist.detect_bases(pd.concat([df, extra])) if b["type"] == "cup"]
        assert len(cups) == 1
        c = cups[0]["cup"]
        assert c["handle"] is not None and c["handle"]["weeks"] == 3 and not c["no_handle"]
        assert c["rim"] == pytest.approx(95 * 1.01, abs=0.05) and cups[0]["pivot"] == c["rim"]
        assert c["handle"]["end_date"] == df.index[-1].strftime("%Y-%m-%d")                # rączka kończy się w ostatnim tygodniu przed wybiciem

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

    def test_cup_length_must_be_7_to_65_weeks(self):
        assert [b for b in watchlist.detect_bases(make_cup(n_cup=5)) if b["type"] == "cup"] == []             # < 7 tygodni
        assert [b for b in watchlist.detect_bases(make_cup(n_cup=70, prior_weeks=60)) if b["type"] == "cup"] == []   # > 65 tygodni
        assert len([b for b in watchlist.detect_bases(make_cup(n_cup=60, prior_weeks=60, handle=(0.995, 0.99, 0.992))) if b["type"] == "cup"]) == 1   # 60 tyg. mieści się (było limitem 45)

    @staticmethod
    def rejected(**kw):
        bases = watchlist.detect_bases(make_cup(**kw))
        assert [b for b in bases if b["type"] == "cup"] == []
        return [r for b in bases for r in b.get("rejection_reasons", [])]

    def test_handle_flaws_reject_the_cup_and_name_the_reason(self):
        assert any("wedging" in r for r in self.rejected(handle=(0.95, 0.96, 0.97)))                          # dołki rączki rosną
        assert any("tyg." in r and "wymagane" in r for r in self.rejected(handle=(0.97, 0.96, 0.95, 0.96, 0.97, 0.96)))   # rączka 6 tygodni (> 4)
        assert any("głębsza" in r for r in self.rejected(handle=(0.93, 0.86, 0.88)))                          # rączka > 12 %
        assert any("wolumenu" in r for r in self.rejected(dry=False))                                         # brak wyschnięcia wolumenu

    def test_handle_must_stay_above_the_10_week_average(self):
        reasons = self.rejected(handle=(0.93, 0.90, 0.88, 0.89))
        assert any("10-tygodniowej" in r for r in reasons) or any("dolnej połowie" in r for r in reasons) or any("głębsza" in r for r in reasons)

    def test_cup_without_a_handle_is_a_risky_setup_not_a_rejected_one(self):
        # O'Neil: z rączką szansa powodzenia jest większa. Cup bez rączki zostaje bazą (pivot = lewy szczyt), ale ma `risky` i notatkę o ryzyku
        weekly = make_cup(handle=())
        last = weekly.iloc[-1]
        extra = pd.DataFrame({"Open": [last["Close"]], "High": [110.0], "Low": [last["Close"]], "Close": [108.0], "Volume": [3000.0]}, index=[weekly.index[-1] + pd.Timedelta(days=7)])
        for frame in (pd.concat([weekly, extra]), weekly):                       # zamknięty (cena nad lewym szczytem) i formujący się
            cups = [b for b in watchlist.detect_bases(frame) if b["type"] == "cup"]
            assert len(cups) == 1 and cups[0]["cup"]["no_handle"] is True and cups[0]["risky"] is True
            assert cups[0]["pivot"] == pytest.approx(cups[0]["peak"], abs=0.01)  # pivot = lewy szczyt
            assert any("ryzykowny" in n for n in cups[0]["notes"])
        with_handle = [b for b in watchlist.detect_bases(make_cup()) if b["type"] == "cup"][0]
        assert "risky" not in with_handle and with_handle["pivot"] == with_handle["cup"]["rim"]

    def test_handle_depth_up_to_30_percent_only_at_a_bear_market_bottom(self):
        weekly = make_cup(depth=0.45, handle=(0.95, 0.88, 0.9))                                              # miseczka 45 % i rączka ~13 %
        bench = pd.Series(100.0, index=weekly.index)
        bench.iloc[45:60] = np.linspace(100, 80, 15)                                                         # S&P −20 % w trakcie miseczki
        cups = [b for b in watchlist.detect_bases(weekly, bench) if b["type"] == "cup"]
        assert len(cups) == 1 and cups[0]["cup"]["handle"]["depth_pct"] > watchlist.CUP_HANDLE_MAX_DEPTH_PCT   # przy dnie bessy rączka do 30 %
        calm = watchlist.detect_bases(weekly, pd.Series(100.0, index=weekly.index))
        assert [b for b in calm if b["type"] == "cup"] == []                                                 # w spokojnym rynku ani miseczka 45 %, ani rączka > 12 %

    def test_status_buy_zone_and_stop_for_an_open_cup(self):
        b = [x for x in watchlist.detect_bases(make_cup()) if x["type"] == "cup"][0]
        assert b["status"] == "WATCHLIST" and b["rejection_reasons"] == []
        assert b["buy_zone_max"] == pytest.approx(b["pivot"] * 1.05, abs=0.02) and b["stop_loss_8pct"] == pytest.approx(b["pivot"] * 0.92, abs=0.02)
        assert b["prior_uptrend_pct"] >= 30

    def test_breakout_volume_is_checked_on_closed_bases(self):
        weekly = make_cup()
        def with_breakout(vol):
            nxt = pd.DataFrame({"Open": [97.0], "High": [104.0], "Low": [96.0], "Close": [103.0], "Volume": [vol]}, index=[weekly.index[-1] + pd.Timedelta(days=7)])
            return [x for x in watchlist.detect_bases(pd.concat([weekly, nxt])) if x["type"] == "cup"][0]
        strong, weak = with_breakout(3000.0), with_breakout(1000.0)
        assert strong["status"] == "VALID_BREAKOUT" and strong["breakout_vol_ratio"] >= 1.4
        assert weak["status"] == "FAULTY_REJECTED" and any("wolumenie" in r for r in weak["rejection_reasons"])

    def test_market_context_flag_and_drawdown(self):
        weekly = make_cup()
        bench = pd.Series(100.0, index=weekly.index)
        bench.iloc[50:56] = 92.0                                                                              # S&P −8 % w trakcie miseczki
        c = [b for b in watchlist.detect_bases(weekly, bench) if b["type"] == "cup"][0]["cup"]
        assert c["mkt_dd_pct"] == 8.0 and c["mkt_ctx"] is True
        calm = [b for b in watchlist.detect_bases(weekly, pd.Series(100.0, index=weekly.index)) if b["type"] == "cup"][0]["cup"]
        assert calm["mkt_dd_pct"] == 0.0 and calm["mkt_ctx"] is False
        assert watchlist.mkt_drawdown(None, "2025-01-01", "2025-06-01") is None


class TestMarketAndLeaders:
    @staticmethod
    def index_df(closes, vols=None, high_pad=1.01):
        idx = pd.bdate_range(end="2026-09-30", periods=len(closes))
        c = pd.Series(closes, index=idx, dtype=float)
        v = pd.Series(vols if vols is not None else [1_000_000] * len(closes), index=idx, dtype=float)
        return pd.DataFrame({"Open": c, "High": c * high_pad, "Low": c * 0.99, "Close": c, "Volume": v})

    def test_distribution_days_need_a_drop_on_higher_volume(self):
        closes = [100.0] * 30
        vols = [1_000_000] * 30
        closes[-3], vols[-3] = 99.0, 1_200_000       # -1 % na wyższym wolumenie -> dzień dystrybucji
        closes[-2], vols[-2] = 98.0, 900_000         # spadek na niższym wolumenie -> nie
        closes[-1], vols[-1] = 98.0, 950_000         # bez spadku -> nie
        assert watchlist.distribution_days(self.index_df(closes, vols)) == 1
        old = [100.0] * 60
        old[10] = 99.0
        v = [1_000_000] * 60
        v[10] = 2_000_000
        assert watchlist.distribution_days(self.index_df(old, v)) == 0          # starsze niż 25 sesji nie liczą się

    def test_index_state_regime_is_weekly_ema10_vs_ema20(self):
        up = watchlist.index_state(self.index_df([100 + 0.3 * i for i in range(260)]))
        assert up["regime"] == "uptrend" and up["ema10w"] > up["ema20w"] and up["ema_gap_pct"] > 0
        assert up["pct_vs_sma50"] > 0 and up["sma50_rising"] is True
        down = watchlist.index_state(self.index_df([200 - 0.3 * i for i in range(260)]))
        assert down["regime"] == "correction" and down["ema10w"] < down["ema20w"]
        # wzrost, potem spadek: reżim przełącza się, gdy EMA10 tygodniowa schodzi pod EMA20 tygodniową
        closes = [100 + 0.3 * i for i in range(220)] + [166 - 0.8 * i for i in range(40)]
        crash = watchlist.index_state(self.index_df(closes))
        assert crash["regime"] == "correction" and crash["ema_gap_pct"] < 0
        mild = watchlist.index_state(self.index_df([100 + 0.3 * i for i in range(220)] + [166 - 0.4 * i for i in range(40)]))
        assert mild["regime"] == "uptrend"
        assert watchlist.index_state(self.index_df([100.0] * 50)) is None

    def test_market_state_takes_the_more_severe_index(self):
        up = self.index_df([100 + 0.3 * i for i in range(260)])
        down = self.index_df([200 - 0.3 * i for i in range(260)])
        assert watchlist.market_state(up, up)["regime"] == "uptrend"
        assert watchlist.market_state(up, down)["regime"] == "correction"
        assert watchlist.market_state(up, None)["regime"] == "uptrend" and watchlist.market_state(None, None) is None

    def test_group_strength_and_leaders(self):
        def st(t, ind, rs, below=-5.0):
            return {"ticker": t, "industry": ind, "rs_rating": rs, "pct_from_high_52w": below}
        stocks = [st("A1", "Chips", 95), st("A2", "Chips", 90), st("A3", "Chips", 85), st("B1", "Banks", 30), st("B2", "Banks", 40), st("B3", "Banks", 20),
                  st("C1", "Tiny", 99), st("C2", "Tiny", 99), st("A4", "Chips", 90, below=-40.0), st("A5", "Chips", 60)]
        watchlist.add_group_strength(stocks)
        by = {s["ticker"]: s for s in stocks}
        assert by["A1"]["industry_rating"] > by["B1"]["industry_rating"]
        assert by["C1"]["industry_rating"] is None and by["C1"]["leader"] is False        # za mała grupa
        assert by["A1"]["leader"] is True
        assert by["A4"]["leader"] is False                                                # za daleko od szczytu
        assert by["A5"]["leader"] is False                                                # RS < 80
        assert by["B1"]["leader"] is False                                                # słaba grupa i słaby RS


def _climax_weekly(last_bar, n=80):
    """Spokojny tygodniowy trend 50 -> 60, potem tygodnie 62, 64 i ostatnia świeca `last_bar` = (open, high, low, close, volume)."""
    idx = pd.date_range("2025-01-03", periods=n, freq="W-FRI")
    close = np.concatenate([np.linspace(50, 60, n - 3), [62.0, 64.0, 70.0]])
    df = pd.DataFrame({"Open": close * 0.998, "High": close * 1.015, "Low": close * 0.985, "Close": close, "Volume": 1_000_000.0}, index=idx)
    df.iloc[-1] = last_bar
    return df


def test_detect_climax_top_weekly_core_and_confirmations():
    df = _climax_weekly((70.0, 92.0, 66.0, 80.0, 6_000_000.0))
    bases = [{"type": "cup", "start": "2025-06-06"}, {"type": "flat", "start": "2025-09-05"}, {"type": "cup", "start": "2025-11-07"}, {"type": "correction", "start": "2025-12-05"}]
    c = watchlist.detect_climax_top(df, bases)
    assert c is not None and c["date"] == df.index[-1].strftime("%Y-%m-%d")
    assert c["runup_pct"] >= 25 and c["week_gain_pct"] >= 8 and c["vol_ratio"] >= 5
    assert c["gap"] is True and c["reversal"] is False and c["stage"] == 3 and c["late"] is True
    assert 30 < c["ext200_pct"] < 70 and c["conf"] == 2    # luka + późny etap; brak rozciągnięcia >= 70 % nad SMA 40 tyg. i zamknięcia w dolnej połowie
    assert watchlist.detect_climax_top(df)["stage"] is None   # bez listy baz: etap nieznany


def test_detect_climax_top_weekly_requires_biggest_gain_spread_and_volume():
    assert watchlist.detect_climax_top(_climax_weekly((70.0, 92.0, 66.0, 80.0, 1_200_000.0))) is None       # zakres i zysk bez rekordowego wolumenu
    assert watchlist.detect_climax_top(_climax_weekly((65.0, 68.0, 64.0, 67.0, 6_000_000.0))) is None       # rekordowy wolumen, ale bez wzrostu 25 % / dużego zysku tygodniowego
    older = _climax_weekly((70.0, 92.0, 66.0, 80.0, 6_000_000.0))
    older.iloc[20, older.columns.get_loc("Close")] = 80.0                                                    # wcześniej w trendzie był większy tygodniowy skok
    assert watchlist.detect_climax_top(older) is None


class TestQullamaggieProfile:
    def stocks(self):
        def st(t, vol, adr, r1, r3, r6):
            return {"ticker": t, "dollar_volume_avg": vol, "adr_pct": adr, "low_ratio_1m": r1, "low_ratio_3m": r3, "low_ratio_6m": r6}
        return [st("A", 50e6, 6, 2.0, 1.5, 1.2), st("B", 50e6, 6, 1.1, 3.0, 1.2), st("C", 50e6, 6, 1.0, 1.0, 2.5),
                st("D", 50e6, 6, 1.0, 1.0, 1.0), st("ILLIQ", 1e6, 6, 9, 9, 9), st("CALM", 50e6, 1, 9, 9, 9)]

    def test_select_is_union_of_top_per_window(self):
        picked = {s["ticker"] for s in watchlist.qullamaggie_select(self.stocks(), 20, 4, 25)}
        assert picked == {"A", "B", "C"}   # 4 płynne spółki, top 25 % = 1 na okno; ILLIQ i CALM odpadają na płynności / ADR

    def test_select_zero_top_pct_is_empty(self):
        assert watchlist.qullamaggie_select(self.stocks(), 20, 4, 0) == []

    def test_load_config_profiles(self, tmp_path):
        p = tmp_path / "qm.json"
        p.write_text(json.dumps({"filters": "x", "max_tickers": 7, "min_adr_pct": 3, "_instructions": "tekst"}), encoding="utf-8")
        cfg = finviz.load_config(p)
        assert cfg == {"min_adr_pct": 3, "filters": "x", "max_tickers": 7}
        missing = finviz.load_config(tmp_path / "none.json", finviz.DEFAULT_QM_FILTERS, finviz.DEFAULT_QM_MAX_TICKERS)
        assert missing == {"filters": finviz.DEFAULT_QM_FILTERS, "max_tickers": finviz.DEFAULT_QM_MAX_TICKERS}
        assert "cap_midover" in finviz.DEFAULT_QM_FILTERS and "fa_" not in finviz.DEFAULT_QM_FILTERS   # Qullamaggie: pre-screen techniczny + kapitalizacja, bez fundamentów


class TestRsUniverse:
    def test_rs_rating_against_wide_universe(self):
        universe = sorted(i / 100 for i in range(200))   # szeroki rynek: wyniki 0.00 … 1.99
        stocks = [{"ticker": "LOW", "rs_score": -5.0}, {"ticker": "MID", "rs_score": 1.0}, {"ticker": "TOP", "rs_score": 9.0}, {"ticker": "NA", "rs_score": None}]
        watchlist.add_rs_rating(stocks, universe)
        r = {s["ticker"]: s["rs_rating"] for s in stocks}
        assert r["LOW"] == 1 and r["TOP"] == 99 and r["NA"] is None
        assert 49 <= r["MID"] <= 51   # medianę rynku nie przesuwa to, że lista ma tylko 3 spółki
        # bez rozkładu rynku nadal percentyl wśród listy
        watchlist.add_rs_rating(stocks)
        assert {s["ticker"]: s["rs_rating"] for s in stocks}["LOW"] == 1

    def test_load_rs_universe(self, tmp_path):
        p = tmp_path / "rs_universe.json"
        assert watchlist.load_rs_universe(p) is None
        p.write_text(json.dumps({"as_of": "2026-10-05", "n": 3, "scores": [0.1, 0.2, 0.3]}), encoding="utf-8")
        assert watchlist.load_rs_universe(p) is None   # za mały rozkład = nie ufamy
        p.write_text(json.dumps({"as_of": "2026-10-05", "n": 150, "scores": [i / 100 for i in range(150)]}), encoding="utf-8")
        assert watchlist.load_rs_universe(p)["n"] == 150


class TestWeeklyMovingAverages:
    def test_weekly_sma_distances_are_computed_from_weekly_closes(self):
        df = make_prices(n=400, daily=0.002)
        m = watchlist.compute_metrics(df)
        assert m["pct_above_sma10w"] is not None and m["pct_above_sma40w"] is not None
        assert m["pct_above_sma40w"] > m["pct_above_sma10w"] > 0   # trend wzrostowy: cena nad obiema, dalej od wolniejszej


class TestOneilPatterns:
    """Wzorce z „How to Make Money in Stocks”: double bottom, flat, ascending base, high tight flag — na wykresie tygodniowym (k=1) i dziennym (k=5)."""

    @staticmethod
    def frame(weekly_closes, per_week=1, end="2026-09-30"):
        pts = np.asarray(weekly_closes, dtype=float)
        if per_week > 1:   # dzienny: każdy tydzień rozbijamy liniowo na per_week świec
            xs = np.arange(len(pts))
            pts = np.interp(np.linspace(0, len(pts) - 1, (len(pts) - 1) * per_week + 1), xs, pts)
        idx = pd.bdate_range(end=end, periods=len(pts)) if per_week > 1 else pd.date_range(end=end, periods=len(pts), freq="W-FRI")
        return pd.DataFrame({"Open": pts, "High": pts * 1.005, "Low": pts * 0.995, "Close": pts, "Volume": 1_000_000.0}, index=idx)

    RAMP = list(np.linspace(60, 99, 14))                      # A: wcześniejszy wzrost >= +30 % (14 tygodni przed bazą)
    DOUBLE_BOTTOM = RAMP + [100, 96, 90, 85, 82, 80, 84, 88, 92, 88, 84, 80, 77, 80, 84, 88, 90]
    FLAT = list(np.linspace(70, 99, 14)) + [100] + [97, 95, 98, 96, 99, 94, 98, 97, 99]
    ASC = RAMP + [100, 96, 88, 96, 104, 98, 92, 100, 108, 102, 96, 104, 111, 112]
    HTF = [10] * 12 + [12, 14, 16, 18, 20, 22] + [21, 20, 19.5, 19.2]

    def frame_dry(self, weekly, k, after_peak=4e5):
        """Jak frame(), ale wolumen po szczycie (flaga) spada — zanik wolumenu wymagany w HTF."""
        df = self.frame(weekly, k)
        ip = int(np.argmax(df["High"].values))
        df.iloc[ip + 1:, df.columns.get_loc("Volume")] = after_peak
        return df

    def last(self, weekly, k):
        return watchlist.detect_bases(self.frame(weekly, k), None, k)[-1]

    @pytest.mark.parametrize("k", [1, 5])
    def test_double_bottom_pivot_is_the_middle_peak(self, k):
        b = self.last(self.DOUBLE_BOTTOM, k)
        assert b["type"] == "double_bottom" and b["open"]
        assert b["pivot"] == pytest.approx(92 * 1.005, rel=0.01)       # pivot = środkowy szczyt, a nie szczyt całej bazy (100)
        assert b["double_bottom"]["low2"] < b["double_bottom"]["low1"]   # drugie dno podcina pierwsze

    def test_base_is_found_even_when_the_stock_is_far_under_its_old_record(self):
        crashed = list(np.linspace(300, 60, 30)) + self.FLAT                    # rekord sprzed krachu −80 %: dawny szczyt nie może zasłaniać nowych baz
        assert self.last(crashed, 1)["type"] == "flat"
        slow = list(np.linspace(110, 62, 90)) + self.FLAT                       # wolna zniżka −44 % przez 90 tygodni: szczyt starszy niż okno baz
        assert self.last(slow, 1)["type"] == "flat"

    def test_double_bottom_needs_an_undercut(self):
        no_undercut = self.RAMP + [100, 96, 90, 85, 82, 80, 84, 88, 92, 88, 84, 82, 83, 85, 87, 89, 90]   # drugie dno NAD pierwszym
        b = self.last(no_undercut, 1)
        assert b["type"] != "double_bottom"
        assert any("podcięcia" in r for r in b.get("rejection_reasons", []))          # wadliwe „W” jest nazwane, nie tylko pominięte

    def test_double_bottom_needs_a_prior_uptrend_and_depth_15_to_33(self):
        assert self.last([100] * 14 + self.DOUBLE_BOTTOM[14:], 1)["type"] != "double_bottom"                   # brak wzrostu przed bazą
        shallow = self.RAMP + [100, 97, 94, 92, 90, 89, 92, 94, 96, 94, 92, 90, 88.5, 90, 92, 94, 96]          # ~11 % głębokości
        assert self.last(shallow, 1)["type"] != "double_bottom"

    @pytest.mark.parametrize("k", [1, 5])
    def test_flat_base(self, k):
        b = self.last(self.FLAT, k)
        assert b["type"] == "flat" and b["depth_pct"] <= 15

    def test_square_box_is_4_to_7_weeks_and_10_to_15_percent_deep(self):
        box = self.RAMP + [100, 94, 91, 92, 90, 93]
        b = self.last(box, 1)
        assert b["type"] == "square_box" and 10 <= b["depth_pct"] <= 15 and 4 <= b["weeks"] <= 7 and b["open"]
        assert b["status"] == "WATCHLIST" and b["buy_zone_max"] == pytest.approx(b["pivot"] * 1.05, abs=0.02)

    def test_ipo_base_uses_the_high_since_the_debut_as_pivot(self):
        ipo = [20, 24, 28, 30, 29, 28, 27, 28, 27.5, 28.2, 27.8]
        b = watchlist.detect_bases(self.frame(ipo, 1), None, 1, ipo=True)[-1]
        assert b["type"] == "ipo" and b["pivot"] == pytest.approx(30 * 1.005, rel=0.01) and b["open"]
        assert all(x["type"] != "ipo" for x in watchlist.detect_bases(self.frame(ipo, 1), None, 1))         # bez flagi IPO (stara spółka) brak bazy IPO

    def test_double_bottom_with_a_handle_on_the_right_uses_the_handle_high(self):
        with_handle = self.RAMP + [100, 96, 90, 85, 82, 80, 84, 88, 92, 88, 84, 80, 77, 80, 84, 88, 93, 91, 90.5]
        b = self.last(with_handle, 1)
        assert b["type"] == "double_bottom" and b["double_bottom"]["handle"] is True
        assert b["pivot"] == pytest.approx(93 * 1.005, rel=0.01)                                            # uszko po prawej (punkt E), nie środkowy szczyt

    def test_flat_base_needs_a_prior_gain_of_20_percent(self):
        weak = list(np.linspace(92, 99, 14)) + [100] + [97, 95, 98, 96, 99, 94, 98, 97, 99]
        b = self.last(weak, 1)
        assert b["type"] == "correction" and any("flat base" in r for r in b["rejection_reasons"])

    @pytest.mark.parametrize("k", [1, 5])
    def test_ascending_base_three_pullbacks_with_higher_lows(self, k):
        b = self.last(self.ASC, k)
        assert b["type"] == "ascending" and len(b["contractions"]) == 3
        assert all(8 <= d <= 22 for d in b["contractions"])

    def test_ascending_base_rejects_falling_lows(self):
        falling = [100, 96, 90, 96, 104, 98, 88, 100, 108, 102, 84, 104, 111, 112]
        bases = watchlist.detect_bases(self.frame(falling, 1), None, 1)
        assert all(b["type"] != "ascending" for b in bases)

    @pytest.mark.parametrize("k", [1, 5])
    def test_high_tight_flag(self, k):
        b = watchlist.detect_bases(self.frame_dry(self.HTF, k), None, k)[-1]
        assert b["type"] == "htf" and b["rise_pct"] >= 100 and 10 <= b["depth_pct"] <= 25

    def test_htf_needs_volume_dry_up_in_the_flag(self):
        assert self.last(self.HTF, 1)["type"] != "htf"                       # stały wolumen = brak zaniku

    def test_htf_needs_a_doubling(self):
        weak = [10] * 12 + [10.5, 11, 11.5, 12, 12.5, 13] + [12.5, 12, 11.8, 11.6]
        assert self.last(weak, 1)["type"] != "htf"

    def test_compute_metrics_exposes_weekly_pattern_fields_only(self):
        m = watchlist.compute_metrics(make_prices(n=400, daily=0.002))
        for key in ("base_type", "pct_to_pivot", "pivot_state", "tlw_state"):
            assert key in m
        assert "dpivot" not in m and "dbase_type" not in m


class TestBaseOnBase:
    @staticmethod
    def base(start, end, peak, low, pivot, kind="flat"):
        return {"start": start, "end": end, "peak": peak, "low": low, "pivot": pivot, "type": kind}

    def test_second_base_right_above_the_first_is_base_on_base(self):
        bs = [self.base("2026-01-02", "2026-03-06", 100, 88, 100), self.base("2026-03-20", "2026-05-01", 112, 101, 112)]
        watchlist.mark_base_on_base(bs)
        assert [b["base_on_base"] for b in bs] == [False, True] and [b["stage"] for b in bs] == [1, 2]

    def test_chain_counts_stages(self):
        bs = [self.base("2026-01-02", "2026-03-06", 100, 90, 100), self.base("2026-03-20", "2026-05-01", 110, 101, 110),
              self.base("2026-05-15", "2026-07-01", 120, 111, 120)]
        watchlist.mark_base_on_base(bs)
        assert [b["stage"] for b in bs] == [1, 2, 3]

    @pytest.mark.parametrize("second", [
        ("2026-09-04", "2026-10-01", 112, 101, 112, "flat"),    # za długo po poprzedniej bazie
        ("2026-03-20", "2026-05-01", 140, 125, 140, "flat"),    # cena uciekła o > 20 % — nowy etap
        ("2026-03-20", "2026-05-01", 112, 80, 112, "flat"),     # dołek głęboko pod pivotem poprzedniej
        ("2026-03-20", "2026-05-01", 112, 101, 112, "correction"),  # korekta to nie baza
    ])
    def test_not_base_on_base(self, second):
        bs = [self.base("2026-01-02", "2026-03-06", 100, 88, 100), self.base(*second[:5], kind=second[5])]
        watchlist.mark_base_on_base(bs)
        assert bs[1]["base_on_base"] is False and bs[1]["stage"] == 1

    def test_metrics_expose_stage_fields(self):
        m = watchlist.compute_metrics(make_prices(n=400, daily=0.002))
        assert "base_on_base" in m and "base_stage" in m


class TestSplits:
    def test_extract_frames_keeps_splits_in_attrs_and_build_charts_exports_them(self):
        df = make_prices(n=400)
        raw = df.copy()
        raw["Dividends"] = 0.0
        raw["Stock Splits"] = 0.0
        raw.iloc[300, raw.columns.get_loc("Stock Splits")] = 2.0
        data = pd.concat({"AAA": raw}, axis=1)
        frames = watchlist._extract_frames(data, ["AAA"])
        assert frames["AAA"].attrs["splits"] == [[raw.index[300].strftime("%Y-%m-%d"), 2.0]]
        charts = watchlist.build_charts(["AAA"], frames, None, {})
        assert charts["stocks"]["AAA"]["splits"] == [{"d": raw.index[300].strftime("%Y-%m-%d"), "r": 2.0}]

    def test_no_splits_column_is_fine(self):
        data = pd.concat({"AAA": make_prices(n=60)}, axis=1)
        frames = watchlist._extract_frames(data, ["AAA"])
        assert "splits" not in frames["AAA"].attrs
        assert watchlist.build_charts(["AAA"], frames, None, {})["stocks"]["AAA"]["splits"] == []


class TestFx:
    def test_fetch_usdpln_returns_last_close(self, monkeypatch):
        df = make_prices(n=5, start=3.7, daily=0.0, end="2026-10-02")
        monkeypatch.setattr(watchlist, "download_prices", lambda tickers, period="10d": {"PLN=X": df})
        fx = watchlist.fetch_usdpln()
        assert fx == {"usdpln": 3.7, "as_of": "2026-10-02"}

    def test_fetch_usdpln_rejects_nonsense_and_errors(self, monkeypatch):
        monkeypatch.setattr(watchlist, "download_prices", lambda tickers, period="10d": {"PLN=X": make_prices(n=3, start=0.2, daily=0.0)})
        assert watchlist.fetch_usdpln() is None
        monkeypatch.setattr(watchlist, "download_prices", lambda tickers, period="10d": (_ for _ in ()).throw(RuntimeError("net")))
        assert watchlist.fetch_usdpln() is None
        monkeypatch.setattr(watchlist, "download_prices", lambda tickers, period="10d": {})
        assert watchlist.fetch_usdpln() is None


class TestWeeklyDistributionAndEps:
    @staticmethod
    def weekly(closes, vols, highs=None, lows=None):
        idx = pd.date_range("2024-01-05", periods=len(closes), freq="W-FRI")
        c = pd.Series(closes, index=idx, dtype=float)
        return pd.DataFrame({"Open": c.shift(1).fillna(c.iloc[0]), "High": highs if highs is not None else c * 1.01,
                             "Low": lows if lows is not None else c * 0.99, "Close": c, "Volume": vols}, index=idx)

    def rally(self, last_close, last_vol, last_low=None, last_high=None):
        closes = [10 + 0.25 * i for i in range(60)]          # stały rajd, +150 %
        vols = [100.0] * 60
        closes.append(last_close)
        vols.append(last_vol)
        w = self.weekly(closes, vols)
        if last_low is not None:
            w.iloc[-1, w.columns.get_loc("Low")] = last_low
        if last_high is not None:
            w.iloc[-1, w.columns.get_loc("High")] = last_high
        return w

    def test_distribution_needs_record_volume_with_flat_close(self):
        flat = self.rally(25.0, 400)                          # zamknięcie 25,0 vs 24,75 (+1,0 %), wolumen 4x
        d = watchlist.detect_distribution_week(flat)
        assert d and d["vol_ratio"] == pytest.approx(4.0) and d["change_pct"] <= watchlist.DISTR_FLAT_PCT
        assert watchlist.detect_distribution_week(self.rally(25.0, 120)) is None        # wolumen za mały (1,2x)
        assert watchlist.detect_distribution_week(self.rally(27.0, 400, last_low=24.9, last_high=27.1)) is None   # mocny tydzień w górę przy górze zakresu = popyt

    def test_distribution_lower_half_close_counts_even_after_a_rise(self):
        w = self.rally(25.6, 400, last_low=24.5, last_high=27.0)   # +3,4 %, ale zamknięcie w dolnej połowie zakresu
        assert watchlist.detect_distribution_week(w)["close_pos"] < 0.5

    def test_distribution_ignores_big_up_weeks_even_with_a_weak_close(self):
        w = self.rally(27.0, 400, last_low=24.7, last_high=30.0)   # +9 % w tygodniu, zamknięcie w dolnej połowie = wybicie / climax, nie dystrybucja
        assert watchlist.detect_distribution_week(w) is None

    def test_distribution_ignores_stock_far_below_its_high(self):
        closes = [10 + 0.25 * i for i in range(60)] + [14.0]     # 14 vs szczyt ~24,75 (>15 % pod)
        w = self.weekly(closes, [100.0] * 60 + [400.0])
        assert watchlist.detect_distribution_week(w) is None

    def test_eps_annual_growth_uses_ttm_of_each_of_last_3_years(self):
        q = [{"t": None}] * 3 + [{"t": float(t)} for t in (4, 4, 4, 4, 5, 5, 5, 6, 7.5, 7.5, 8, 9, 10, 10, 11, 12)][:]
        assert watchlist.eps_annual_growth(q) == [33.3, 50.0, 50.0]   # TTM 12 vs 9, 9 vs 6, 6 vs 4
        assert watchlist.eps_annual_growth([{"t": 5.0}] * 4) == [None, None, None]                   # za mało historii
        assert watchlist.eps_annual_growth([{"t": -1.0}] * 4 + [{"t": 2.0}] * 4)[0] is None         # ujemna baza = brak procentu

    def test_add_eps_rating_sets_acceleration_annual_growth_and_shares(self):
        rows = []
        eps = [1.0, 1.0, 1.0, 1.0, 1.3, 1.3, 1.4, 1.5, 1.8, 1.9, 2.1, 2.4]
        for i, e in enumerate(eps):
            rows.append({"date": (pd.Timestamp("2023-03-01") + pd.DateOffset(months=3 * i)).strftime("%Y-%m-%d"), "eps": e, "est": None})
        stocks = [{"ticker": "AAA", "eps_this_y": 30.0, "eps_past_5y": 20.0}]
        watchlist.add_eps_rating(stocks, {"AAA": {"rows": rows, "shares_chg_pct": -6.2}})
        s = stocks[0]
        assert s["eps_accel"] is True and s["eps_q0_yoy"] > s["eps_q1_yoy"]
        assert s["eps_yr0"] is not None and s["eps_yr1"] is not None and s["eps_yr2"] is None
        assert s["shares_chg_pct"] == -6.2

    def test_shares_change_pct_compares_with_a_year_ago(self):
        idx = pd.to_datetime(["2025-01-10", "2025-10-01", "2026-01-12", "2026-10-01"])
        assert watchlist.shares_change_pct(pd.Series([100.0, 98.0, 95.0, 92.0], index=idx)) == pytest.approx(-6.1, abs=0.1)
        assert watchlist.shares_change_pct(pd.Series([100.0, 98.0], index=pd.to_datetime(["2026-09-01", "2026-10-01"]))) is None   # historia za krótka
        assert watchlist.shares_change_pct(None) is None

    def test_update_eps_cache_keeps_extra_fields_from_dict_fetch(self, tmp_path):
        out = watchlist.update_eps_cache(["AAA"], cache_path=tmp_path / "e.json", now="2026-10-10",
                                         fetch=lambda t: {"rows": [{"date": "2026-08-01", "eps": 1.0, "est": None}], "shares_chg_pct": -7.0})
        assert out["AAA"]["shares_chg_pct"] == -7.0 and out["AAA"]["rows"][0]["eps"] == 1.0
        out2 = watchlist.update_eps_cache(["BBB"], cache_path=tmp_path / "e2.json", now="2026-10-10", fetch=lambda t: [])
        assert out2["BBB"]["rows"] == []


class TestBoxBaseThirdsAndBreakout:
    """Bazy-pudełka (flat, square_box): podział na 3 części, stop z dołu środkowej części i jakość świecy wybicia (blueprint); fresh_breakout_base."""

    FLAT = TestOneilPatterns.FLAT

    def frame_breakout(self, close=102.0, high=110.0, low=100.0, open_=100.5, vol=1_500_000.0):
        df = TestOneilPatterns.frame(self.FLAT + [100.0])
        last = df.index[-1]
        df.loc[last, ["Open", "High", "Low", "Close", "Volume"]] = [open_, high, low, close, vol]
        return df

    def test_open_flat_base_gets_thirds_and_a_stop_at_the_bottom_of_the_middle_third(self):
        b = watchlist.detect_bases(TestOneilPatterns.frame(self.FLAT), None, 1)[-1]
        assert b["type"] == "flat" and b["open"]
        third = (b["pivot"] - b["low"]) / 3
        assert b["box_thirds"] == [pytest.approx(b["low"] + third, abs=0.02), pytest.approx(b["low"] + 2 * third, abs=0.02)]
        assert b["box_stop"] == b["box_thirds"][0]
        assert b["box_stop_pct"] == pytest.approx((b["pivot"] - b["box_stop"]) / b["pivot"] * 100, abs=0.1)
        assert 0 < b["box_stop_pct"] < 20

    def test_cup_and_double_bottom_have_no_thirds(self):
        for series in (TestOneilPatterns.DOUBLE_BOTTOM,):
            assert "box_stop" not in watchlist.detect_bases(TestOneilPatterns.frame(series), None, 1)[-1]

    def test_breakout_candle_quality_wick_volume_and_ten_week_high(self):
        bases = watchlist.detect_bases(self.frame_breakout(), None, 1)
        b = next(x for x in reversed(bases) if x["type"] == "flat" and not x["open"])
        assert b["breakout_wick_pct"] == 80          # (110 − max(open, close = 102)) / (110 − 100)
        assert b["breakout_vol_wow_pct"] == 50       # 1,5 mln vs 1,0 mln
        assert b["breakout_hi10"] is True
        strong = watchlist.detect_bases(self.frame_breakout(close=109.5, high=110.0, open_=100.5, vol=1_400_000.0), None, 1)
        assert next(x for x in reversed(strong) if not x["open"])["breakout_wick_pct"] <= 10

    def test_fresh_breakout_base_replaces_the_missing_open_base(self):
        df = self.frame_breakout()
        wk = df
        bases = watchlist.detect_bases(wk, None, 1)
        assert not any(x["open"] and x["type"] in watchlist.BASE_TYPES_BUYABLE for x in bases)
        fresh = watchlist.fresh_breakout_base(bases, wk.index)
        assert fresh and fresh["type"] == "flat" and fresh["pivot"] < 102
        m = watchlist.compute_metrics(TestOneilPatterns.frame([*self.FLAT, 103.0], per_week=5))
        assert m is not None   # dzienny wiersz wejściowy; ścieżka tygodniowa nie może się wywrócić
        # stara baza (wybicie > 2 tygodnie temu) nie jest „świeża”
        old = TestOneilPatterns.frame(self.FLAT + [103, 104, 105, 106, 107])
        assert watchlist.fresh_breakout_base(watchlist.detect_bases(old, None, 1), old.index) is None


class TestCorridorBase:
    def _frame(self, highs_creep=True):
        # 40 tygodni wzrostu 50 -> 150, potem 6 tygodni korytarza 130–150 (górna krawędź lekko rośnie), na końcu tydzień wybicia
        n_up, closes, hi, lo = 34, [], [], []
        for i in range(n_up):
            c = 50 + i * 3.0
            closes.append(c)
            hi.append(c * 1.01)
            lo.append(c * 0.98)
        box = [(148, 135), (150, 133), (149, 132), (151, 134), (150, 131), (152, 138)] if highs_creep else [(150, 135)] * 6
        for top, bot in box:
            hi.append(top)
            lo.append(bot)
            closes.append((top + bot) / 2 + 3)
        hi.append(158)                                                  # tydzień wybicia nad szczytem korytarza (152)
        lo.append(150)
        closes.append(157)
        idx = pd.date_range("2025-01-03", periods=len(closes), freq="W-FRI")
        return pd.DataFrame({"Open": closes, "High": hi, "Low": lo, "Close": closes, "Volume": [1e6] * len(closes)}, index=idx)

    def test_detects_corridor_with_creeping_highs(self):
        df = self._frame()
        bases = watchlist.detect_bases(df)
        cor = [b for b in bases if b.get("corridor")]
        assert len(cor) == 1
        b = cor[0]
        assert b["type"] in ("flat", "square_box") and b["weeks"] >= 6
        assert 5 <= b["depth_pct"] <= 20 and b["pivot"] == 152.0
        assert watchlist.fresh_breakout_base(bases, df.index) is b

    def test_too_deep_or_no_prior_run_is_not_a_corridor(self):
        df = self._frame()
        df.loc[df.index[-5], "Low"] = 90.0                              # dołek 40 % pod szczytem: to już nie korytarz
        assert not any(b.get("corridor") for b in watchlist.detect_bases(df))
        flat = pd.DataFrame({"Open": 100.0, "High": 105.0, "Low": 95.0, "Close": 100.0, "Volume": 1e6}, index=pd.date_range("2025-01-03", periods=60, freq="W-FRI"))
        assert not any(b.get("corridor") for b in watchlist.detect_bases(flat))   # bez wcześniejszego wzrostu
