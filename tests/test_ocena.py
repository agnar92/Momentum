"""Testy obliczeń strony: kwartały z wartości narastających, TTM, dług, oceny, strategie, PEG i DCF."""
from momentum import fundamenty as F, ocena as O


def test_kwartalne_z_narastajacych_i_q4():
    rows = [["2025-01-01", "2025-03-31", 10, "2025-05-01"], ["2025-01-01", "2025-06-30", 25, "2025-08-01"],
            ["2025-01-01", "2025-09-30", 45, "2025-11-01"], ["2025-01-01", "2025-12-31", 70, "2026-02-01"],
            ["2025-04-01", "2025-06-30", 15, "2025-08-01"]]
    q = F.kwartalne(rows)
    assert q == {"2025-03-31": 10, "2025-06-30": 15, "2025-09-30": 20, "2025-12-31": 25}
    assert F.ttm(q) == [("2025-12-31", 70)]


def test_pierwsze_zlozenie_i_polacz():
    rows = [["2025-01-01", "2025-03-31", 10, "2025-05-01"], ["2025-01-01", "2025-03-31", 99, "2026-05-01"]]
    assert F.kwartalne(rows) == {"2025-03-31": 10}
    d = {"A": [["2024-12-31", 1, "2025-02-01"]], "B": [["2024-12-31", 5, "2025-02-01"], ["2025-12-31", 7, "2026-02-01"]]}
    assert F.polacz(d, F.chwilowe) == {"2024-12-31": 1, "2025-12-31": 7}


def test_dlug_bez_podwojnego_liczenia():
    d = {"LongTermDebtNoncurrent": [["2025-12-31", 100, "2026-02-01"]], "LongTermDebtCurrent": [["2025-12-31", 10, "2026-02-01"]],
         "LongTermDebt": [["2025-12-31", 110, "2026-02-01"]], "CommercialPaper": [["2025-12-31", 5, "2026-02-01"]]}
    assert F.dlug(d, "2025-12-31") == 115


def test_dcf_i_peg():
    v = O.dcf(100.0, 0.2, 0.1, 10.0, gotowka=50, dlug=20, r=0.10, tg=0.03, lata=5, wygaszanie=5)
    assert round(v, 4) == round(_dcf_reczny(), 4)
    assert O.dcf(100.0, -0.1, 0.1, 10.0) is None
    s = O.peg_scenariusze(30.0, 0.25)
    assert round(s["base"]["peg"], 3) == 1.2 and s["bear"]["peg"] > s["base"]["peg"] > s["bull"]["peg"]
    assert O.etykieta(0.5) == "Bardzo tania" and O.etykieta(0.0) == "Wyceniona uczciwie" and O.etykieta(None, 2.5) == "Droga"


def _dcf_reczny():
    pv, rev = 0.0, 100.0
    for t in range(1, 11):
        g = 0.1 if t <= 5 else 0.1 + (0.03 - 0.1) * (t - 5) / 5
        rev *= 1 + g
        pv += rev * 0.2 / 1.1 ** t
    pv += rev * 0.2 * 1.03 / 0.07 / 1.1 ** 10
    return (pv + 50 - 20) / 10


def test_oceny_percentyle_w_sektorze():
    rows = [dict(sector="T", m=dict(rev_1y=0.1 * i, pe=10.0 + i, mcap=1e9)) for i in range(10)]
    O.oceny(rows)
    assert rows[9]["pct"]["rev_1y"] > rows[0]["pct"]["rev_1y"]
    assert rows[0]["pct"]["pe"] > rows[9]["pct"]["pe"]          # niższe P/E = lepiej
    assert rows[0]["oceny"]["ogolna"] is None                     # za mało wskaźników


def test_strategie_i_typy():
    m = dict(rev_5y=0.8, rev_1y=0.2, ni_1y=0.3, roe=0.3, de=0.2, fcf_ttm=1e9, peg=0.8, rev_cagr5=0.13, roa=0.15, roe_sec=0.3, roe_5l=0.2, roce=0.25,
             rev_lata_10=4, mcap=100e9, rev_lata=[0.12, 0.13, 0.12, 0.14, 0.13])
    s = O.strategie(m, "Technology")
    assert all(ok for _, _, ok in s["7/7 (niskie ryzyko)"]) and all(ok for _, _, ok in s["Jakość (7 kryteriów)"])
    assert "7/7 (niskie ryzyko)" not in O.strategie(m, "Financial")
    assert O.typy(m, "Technology")[0][0] == "Stabilnie rosnąca"
