"""Testy obliczeń strony: kwartały z wartości narastających, TTM, dług, oceny, strategie, PEG i DCF."""
import datetime as dt
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
    assert rows[0]["kompletnosc"]["niepelne"] and rows[0]["kompletnosc"]["wszystkie"] == 23


def test_strategie_i_typy():
    m = dict(rev_5y=0.8, rev_1y=0.2, ni_1y=0.3, roe=0.3, de=0.2, fcf_ttm=1e9, peg=0.8, rev_cagr5=0.13, roa=0.15, roe_sec=0.3, roe_5l=0.2, roce=0.25,
             rev_lata_10=4, mcap=100e9, rev_lata=[0.12, 0.13, 0.12, 0.14, 0.13])
    s = O.strategie(m, "Technology")
    assert all(ok for _, _, ok in s["7/7 (niskie ryzyko)"]) and all(ok for _, _, ok in s["Jakość (7 kryteriów)"])
    assert "7/7 (niskie ryzyko)" not in O.strategie(m, "Financial")
    assert O.typy(m, "Technology")[0][0] == "Stabilnie rosnąca"


def test_wybor_bez_wykluczonych_sektorow():
    import spolki
    fv = {f"T{i}": dict(ticker=f"T{i}", marketCap=1000 - i, sector="Energy" if i % 2 else "Technology") for i in range(10)}
    w = spolki.wybierz(fv, 3)
    assert [r["ticker"] for r in w] == ["T0", "T2", "T4"]


def test_kwartaly_52_tygodniowe_z_16_tygodniowym_q4():
    rows = [["2025-09-01", "2025-11-23", 100, "2025-12-20"], ["2025-09-01", "2026-02-15", 200, "2026-03-10"],
            ["2025-09-01", "2026-05-10", 300, "2026-06-01"], ["2025-09-01", "2026-08-30", 440, "2026-10-01"]]
    q = F.kwartalne(rows)
    assert q["2026-08-30"] == 140 and F.ttm(q) == [("2026-08-30", 440)]


def test_brak_danych_neutralnie_i_mediany():
    rows = [dict(sector="T", m=dict(rev_1y=0.1 * i, rev_cagr3=0.05 * i, ni_1y=0.02 * i, pe=10.0 + i, mcap=1e9)) for i in range(10)]
    rows[9]["m"]["rev_cagr3"] = None          # najlepsza spółka bez jednego wskaźnika
    O.oceny(rows)
    o = rows[9]["oceny"]["wzrost"]
    pr = rows[9]["pct"]["rev_1y"] + rows[9]["pct"]["ni_1y"]
    assert abs(o - round(10 * (pr + 5 * O.BRAK) / 7, 1)) < 1e-9     # brakujące wskaźniki liczone jako 50 pkt
    assert rows[0]["sektor_med"]["pe"] == 14.5


def test_mssf_i_przeliczenie_walut():
    def fy(y, v):
        return {"start": f"{y}-01-01", "end": f"{y}-12-31", "val": v, "filed": f"{y + 1}-03-01", "form": "20-F", "fp": "FY"}
    facts = {"ifrs-full": {"Revenue": {"units": {"TWD": [fy(2019 + i, 1000 * 1.2 ** i) for i in range(7)]}},
                           "ProfitLoss": {"units": {"TWD": [fy(2019 + i, 300 * 1.2 ** i) for i in range(7)]}}}}
    ex = F.wyciag(facts)
    assert ex["waluta"] == "TWD" and "rev" in ex
    usd = F.przelicz(ex, 0.03)
    assert usd["waluta"] == "USD" and usd["waluta_zrodlo"] == "TWD"
    m, _ = O.metryki(usd, {}, dzis=dt.date(2026, 6, 1))
    assert abs(m["rev_ttm"] - 30 * 1.2 ** 6) < 1e-6
    assert abs(m["rev_cagr3"] - 0.2) < 1e-9 and m["rev_lata_10"] == 5
    stare, _ = O.metryki(usd, {}, dzis=dt.date(2028, 1, 1))   # raporty sprzed > 550 dni -> pomijane
    assert stare.get("rev_ttm") is None


def test_mloda_spolka_wzrost_z_dostepnych_lat():
    def fy(y, v):
        return {"start": f"{y}-01-01", "end": f"{y}-12-31", "val": v, "filed": f"{y + 1}-03-01"}
    facts = {"us-gaap": {"Revenues": {"units": {"USD": [fy(2022 + i, 100 * 1.5 ** i) for i in range(4)]}},
                         "NetIncomeLoss": {"units": {"USD": [fy(2022 + i, 10 * 1.5 ** i) for i in range(4)]}}}}
    m, _ = O.metryki(F.wyciag(facts), {}, dzis=dt.date(2026, 6, 1))
    assert m["hist_lat"] == 3.0
    assert abs(m["rev_cagr5"] - 0.5) < 1e-3 and abs(m["rev_5y"] - (1.5 ** 3 - 1)) < 1e-9
    assert m["rev_lata_10"] == 5 and m["rev_lata_n"] == 3
    assert abs(m["ni_5y"] - (1.5 ** 5 - 1)) < 1e-2
    s = O.strategie(m, "Technology")
    assert s["7/7 (niskie ryzyko)"][0][0].endswith("(z 3,0 lat)")
