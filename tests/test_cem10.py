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
