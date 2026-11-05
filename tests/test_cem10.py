"""Testy CEM10 bez sieci: zamknięcia miesięcy, zwroty, SMA, indeks koszyka, kandydaci USA / GPW i cały plik z podmienionymi cenami."""
import datetime as dt

import cem10 as script
from momentum import cem10


def test_month_closes_last_session_and_only_closed_months():
    d = ["2026-09-29", "2026-09-30", "2026-10-30", "2026-11-02"]
    assert cem10.month_closes(d, [1, 2, 3, 4], "2026-10") == {"2026-09": 2.0, "2026-10": 3.0}
    assert cem10.month_closes(d, [1, float("nan"), 3, None], "2026-11") == {"2026-09": 1.0, "2026-10": 3.0}


def test_returns_sma_and_basket_level():
    c = [100, 110, 120, 130, 140, 150, 200]
    assert abs(cem10.ret(c, 6) - 1.0) < 1e-9 and cem10.ret(c, 7) is None
    assert cem10.sma([1, 2, 3, 4], 2) == 3.5 and cem10.sma([1], 2) is None
    lv = cem10.ew_level({"A": {"m1": 10, "m2": 11}, "B": {"m1": 10, "m2": 9}, "C": {"m1": 1, "m2": 100}}, ["m1", "m2"])
    assert lv == [1.0, 1.0]                     # +10 % i -10 %; skok C (+9900 %) pominięty jako błąd danych


def test_stock_row_and_candidates():
    adj = [10] * 6 + [12, 13, 14, 15, 16, 17, 20]
    r = cem10.stock_row("X", "Spółka X", adj, [a * 2 for a in adj], sp=True, nq=False)
    assert r["c"] == 40 and r["r6"] == round(20 / 12 - 1, 4) and r["dist"] > 0 and r["sma"] == round(sum(adj[-10:]) / 10 * 2, 2)
    rows = [dict(r), dict(r, t="Y", r6=0.25), dict(r, t="Z", dist=-0.01), dict(r, t="Q", sp=False, nq=True, r6=2.0)]
    assert [x["t"] for x in cem10.usa_candidates(rows, "SP")] == ["X"]
    assert [x["t"] for x in cem10.usa_candidates(rows, "NDX")] == ["Q"]
    g = [dict(r, r3=0.1, r12=0.5, r6=0.4), dict(r, t="G2", r3=-0.1, r12=0.5), dict(r, t="G3", r3=0.1, r12=0.5, r6=0.9)]
    assert [x["t"] for x in cem10.gpw_candidates(g)] == ["G3", "X"]


def _px(series, start=dt.date(2024, 11, 28)):
    """Miesięczne wartości -> dzienne świece (jedna sesja na miesiąc, adj = raw)."""
    d, y, m = [], start.year, start.month
    for _ in series:
        d.append(f"{y}-{m:02d}-28")
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    return d, list(series), list(series)


def test_build_leader_market_filter_and_rows():
    n = 24
    up = [100 * 1.03 ** i for i in range(n)]
    px = {"SPY": _px(up), "QQQ": _px([100] * n), "AAA": _px([50] * 12 + [50 * 1.1 ** i for i in range(12)]), "BBB": _px([50] * n),
          "PKO.WA": _px([10] * 12 + [10 * 1.06 ** i for i in range(12)]), "ALE.WA": _px([10] * n)}
    mem = {"sp": {"AAA": "A Inc", "BBB": "B Inc"}, "nq": {"AAA": "A Inc"}}
    gpw = {"rewizja": "2026-09-18", "WIG20": {"PKO": "PKO BP"}, "mWIG40": {"ALE": "Allegro"}}
    upto = _px(up)[0][-1][:7]
    out = script.build(mem, gpw, px, upto, dt.date(2026, 11, 2))
    u, g = out["usa"], out["gpw"]
    assert out["month"] == upto and u["lead"] == "SP" and not u["bear"] and u["n"] == 10 and g["n"] == 5
    assert [r["t"] for r in cem10.usa_candidates(u["rows"], u["lead"])] == ["AAA"]
    assert [r["t"] for r in cem10.gpw_candidates(g["rows"])] == ["PKO"] and g["missing"] == []
    assert not g["bear"]


def test_finviz_members(monkeypatch):
    from momentum import finviz
    calls = []

    class R:
        text = ""

        def raise_for_status(self):
            pass

    def get(url, params=None, **k):
        calls.append(params["f"])
        return R()
    monkeypatch.setattr(finviz, "parse_page", lambda text: ([{"ticker": "BRK.B", "company": "Berkshire"}, {"ticker": "MRNA", "company": "Moderna"}], 2))
    out = script.finviz_members("idx_sp500", get=get, pause=0)
    assert out == {"BRK-B": "Berkshire", "MRNA": "Moderna"} and calls == ["idx_sp500"]
    monkeypatch.setattr(finviz, "parse_page", lambda text: ([], None))
    try:
        script.finviz_members("x", get=get, pause=0)
        assert False
    except ValueError:
        pass
    assert script.INDEX_FILTERS == ("idx_sp500", "idx_ndx")


def test_index_members_only_for_leader_and_main_order(monkeypatch, tmp_path):
    import json
    calls = []
    sp = {f"S{i}": "x" for i in range(500)}
    nq = {f"N{i}": "x" for i in range(100)}
    monkeypatch.setattr(script, "finviz_members", lambda f, get=None, pause=0.7: calls.append(f) or (sp if f == "idx_sp500" else nq))
    assert script.index_members("SP", log=lambda *a: None) == {"sp": sp, "nq": {}} and calls == ["idx_sp500"]
    calls.clear()
    assert script.index_members("NDX", log=lambda *a: None) == {"sp": {}, "nq": nq} and calls == ["idx_ndx"]
    monkeypatch.setattr(script, "finviz_members", lambda f, get=None, pause=0.7: {"A": "a"})
    try:
        script.index_members("SP", log=lambda *a: None)
        assert False
    except ValueError:
        pass
    n, order = 24, []
    monkeypatch.setattr(script, "finviz_members", lambda f, get=None, pause=0.7: calls.append(f) or nq)

    def fake_download(tickers, log=print):
        order.append(list(tickers))
        mk = {"SPY": [100] * n, "QQQ": [100 * 1.03 ** i for i in range(n)], "N0": [50] * 12 + [50 * 1.1 ** i for i in range(12)]}
        return {t: _px(mk.get(t, [10] * n)) for t in tickers}
    monkeypatch.setattr(script, "download", fake_download)
    monkeypatch.setattr(script, "last_closed_month", lambda today: _px([1] * n)[0][-1][:7])
    calls.clear()
    out = tmp_path / "c.json"
    assert script.main(["--out", str(out)]) == 0
    assert order[0] == ["SPY", "QQQ"] and len([t for t in order[1] if not t.endswith(".WA")]) == 100 and calls == ["idx_ndx"]
    u = json.loads(out.read_text(encoding="utf-8"))["usa"]
    assert u["lead"] == "NDX" and u["index"] == {"lead": "NDX", "n": 100}
    assert [r["t"] for r in script.cem10.usa_candidates(u["rows"], "NDX")] == ["N0"]


def test_download_single_ticker_chunk_with_multiindex_columns(monkeypatch):
    import sys
    import types

    import pandas as pd
    idx = pd.to_datetime(["2026-09-01", "2026-10-01"])
    df = pd.DataFrame([[10.0, 9.0], [11.0, 10.0]], index=idx, columns=pd.MultiIndex.from_product([["AAA"], ["Close", "Adj Close"]]))
    monkeypatch.setitem(sys.modules, "yfinance", types.SimpleNamespace(download=lambda part, **k: df))
    out = script.download(["AAA"], log=lambda *a: None)
    assert out["AAA"] == (["2026-09-01", "2026-10-01"], [9.0, 10.0], [10.0, 11.0])
