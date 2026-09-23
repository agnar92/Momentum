import datetime
import json

import pandas as pd

import refresh_daily


def _constituent(ticker, stage="2B", score=1.5, rs=(1.0, 2.0)):
    return {
        "ticker": ticker,
        "momentum_score": score,
        "weekly_chart": {"current_stage": stage},
        "mansfield_chart": {"rsm_medium": list(rs) + [None]},
    }


def _write_universe(tmp_path, universe, constituents):
    (tmp_path / f"{universe.lower()}.json").write_text(
        json.dumps({"universe": universe, "all_constituents": constituents}), encoding="utf-8")


def test_weekly_winners_applies_stage_momentum_and_rs_gate(tmp_path):
    _write_universe(tmp_path, "SP500", [
        _constituent("AAA"),
        _constituent("BBB", stage="3"),
        _constituent("CCC", score=0),
        _constituent("DDD", rs=(2.0, -0.5)),
        _constituent("EEE", stage="2A"),
    ])
    assert refresh_daily.weekly_winners(str(tmp_path)) == [("AAA", "SP500"), ("EEE", "SP500")]


def test_weekly_winners_dedupes_across_universes_in_universe_order(tmp_path):
    _write_universe(tmp_path, "SP500", [_constituent("AAA")])
    _write_universe(tmp_path, "NASDAQ100", [_constituent("AAA"), _constituent("QQQ")])
    assert refresh_daily.weekly_winners(str(tmp_path)) == [("AAA", "SP500"), ("QQQ", "NASDAQ100")]


def _daily_rows(ticker, n=120):
    days = pd.bdate_range("2026-03-02", periods=n)
    closes = [100.0 + i * 0.8 for i in range(n)]
    return [(d.strftime("%Y-%m-%d"), ticker, c, c, 1000, c + 0.5, c - 0.5) for d, c in zip(days, closes)], days


def test_build_payload_computes_daily_squeeze_and_lists_missing():
    rows, days = _daily_rows("AAA")
    now = datetime.datetime(2026, 9, 23, 20, 0, tzinfo=datetime.timezone.utc)
    payload = refresh_daily.build_payload([("AAA", "SP500"), ("NOPE", "SP500")], rows, now)
    assert payload["ref_date"] == days[-1].strftime("%Y-%m-%d")
    assert payload["n_candidates"] == 2
    assert payload["missing"] == ["NOPE"]
    aaa = payload["tickers"]["AAA"]
    assert aaa["universe"] == "SP500"
    assert aaa["date"] == payload["ref_date"]
    assert aaa["close"] == round(rows[-1][2], 2)
    assert len(aaa["spark"]["closes"]) == 60
    assert len(aaa["spark"]["squeeze"]) == 60


def test_main_writes_continuation_json_with_injected_downloader(tmp_path):
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    _write_universe(data_dir, "SP500", [_constituent("AAA")])
    rows, _ = _daily_rows("AAA")
    calls = []

    def fake_download(tickers, start, end, include_ohlc=False):
        calls.append((tickers, include_ohlc))
        return rows, {"AAA"}, []

    assert refresh_daily.main(["--docs-dir", str(tmp_path)], download_fn=fake_download) == 0
    assert calls == [(["AAA"], True)]
    out = json.loads((data_dir / "continuation.json").read_text(encoding="utf-8"))
    assert list(out["tickers"]) == ["AAA"]


def test_main_fails_without_candidates(tmp_path):
    (tmp_path / "data").mkdir()
    assert refresh_daily.main(["--docs-dir", str(tmp_path)], download_fn=lambda *a, **k: ([], set(), [])) == 1
