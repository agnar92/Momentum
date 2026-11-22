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
    assert O.etykieta(0.5, 3.3) == "Bardzo droga" and O.etykieta(-0.5, 0.4) == "Bardzo tania"   # PEG przed DCF


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
    assert rows[0]["kompletnosc"]["niepelne"] and rows[0]["kompletnosc"]["wszystkie"] == 29


def test_strategie_i_typy():
    m = dict(rev_5y=0.8, rev_1y=0.2, ni_1y=0.3, roe=0.3, de=0.2, fcf_ttm=1e9, peg=0.8, rev_cagr5=0.13, roa=0.15, roe_sec=0.3, roe_wcz=0.2, roe_wcz_lat=3, roce=0.25,
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
    assert abs(o - round(10 * (pr + 7 * O.BRAK) / 9, 1)) < 1e-9     # brakujące wskaźniki liczone jako 50 pkt
    assert rows[0]["med500"]["pe"] == 14.5


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


def test_tylko_spolki_notowane_5_lat():
    import spolki
    dzis = dt.date(2026, 11, 20)
    assert spolki.notowana_5_lat((["2021-11-22"], [1.0]), dzis)
    assert not spolki.notowana_5_lat((["2025-02-24"], [1.0]), dzis)        # np. SNDK (wydzielenie 2025)
    assert not spolki.notowana_5_lat(None, dzis)

def test_zmiana_liczby_akcji_ze_splitem():
    sh = {"2022-06-30": 100.0, "2025-06-30": 900.0}
    # split 10:1 w 2024 -> 100 akcji = 1000 dzisiejszych; 900 = skup 10 %
    assert abs(O.zmiana_akcji(sh, [("2024-06-10", 10.0)]) - (-0.1)) < 1e-9
    assert O.zmiana_akcji(sh, []) is None          # bez splitu 9x więcej = poza zakresem (błąd danych)
    assert O.zmiana_akcji({"2025-06-30": 5.0}, []) is None


def test_spadek_dwa_lata_z_rzedu():
    def fy(y, v):
        return {"start": f"{y}-01-01", "end": f"{y}-12-31", "val": v, "filed": f"{y + 1}-03-01"}
    rev = [100, 110, 120, 115, 105]          # dwa ostatnie lata spadek
    facts = {"us-gaap": {"Revenues": {"units": {"USD": [fy(2021 + i, v) for i, v in enumerate(rev)]}},
                         "NetIncomeLoss": {"units": {"USD": [fy(2021 + i, v) for i, v in enumerate([10, 11, 12, 13, 14])]}}}}
    m, _ = O.metryki(F.wyciag(facts), {}, dzis=dt.date(2026, 6, 1))
    assert m["spadek_2l"] == ["przychody"]


def test_dcf_wejscie_kontrola_z_finviz():
    m = dict(mcap=100e9, ps=5.0, pfcf=20.0, rev_ttm=10e9, fcf_ttm=30e9, fcf_margin=3.0, rev_cagr3=0.10, eps_next5=0.12)
    rev, g, mz, uw = O.dcf_wejscie(m)
    assert rev == 20e9                      # przychody SEC 2 × za małe -> Finviz
    assert abs(mz - 5e9 / 20e9) < 1e-12     # FCF SEC 6 × większy niż Finviz -> marża z Finviz
    assert len(uw) == 2
    ok = dict(mcap=100e9, ps=5.0, pfcf=20.0, rev_ttm=21e9, fcf_ttm=5.5e9, fcf_margin=5.5 / 21, rev_cagr3=0.10, eps_next5=0.12)
    assert O.dcf_wejscie(ok)[3] == []


def test_dcf_ostroznie_sbc_i_leasing():
    m = dict(fcf_margin=0.30, sbc_przych=0.10, rev_ttm=100.0, rev_cagr3=0.10, eps_next5=0.10)
    g, mz = O.dcf_domyslne(m, dict(y=[["2025-12-31", 100.0, 20.0, 30.0, 10.0]]))
    assert abs(mz - 0.20) < 1e-12               # (FCF − SBC) / przychody
    m2 = dict(m, mcap=1000.0, ps=10.0, shares=10.0, cash=0.0, debt=50.0, leasing=25.0)
    O.dcf_scenariusze(m2, dict(y=[]))
    assert m2["dcf_dlug"] == 75.0


def test_przeplywy_zyskownosc_i_ostrzezenia():
    m = dict(roe=0.30, roa=0.15, roe_sec=0.30, roe_wcz=0.20, roe_wcz_lat=3, roce=0.35, ocf_dlug=0.8, capex_ocf=0.07, skup_netto_mc=0.031, fcf_aktywa=0.19)
    s = O.strategie(m, "Technology")
    assert all(ok for _, _, ok in s["Zyskowność (4 kryteria)"]) and all(ok for _, _, ok in s["Przepływy pieniężne (4 kryteria)"])
    o = O.ostrzezenia(dict(eps_next5=0.17, rev_cagr5=0.03, rev_lata=[0.02, -0.15, 0.30], ni_1y=1.5, rev_1y=0.05), rank=10)
    assert len(o) == 2          # prognoza vs przychody, jednorazowy zysk (cykliczna wymaga prognozy > 25 %)
    assert O.ostrzezenia(dict(eps_next5=0.40, rev_cagr5=0.30, rev_lata=[0.5, -0.2, 0.6]), rank=5)   # cykliczna + duża spółka


def test_duzy_zwyciezca():
    m = dict(mcap=3e12, przych_lata_wzrostu_10=10, przych_10l=3.5, roe=0.3, fcf_ttm=7e10, de=0.2)
    assert all(ok for _, _, ok in O.strategie(m, "Technology")["Duży zwycięzca (10+ lat)"])
    m["przych_lata_wzrostu_10"] = 7
    assert not all(ok for _, _, ok in O.strategie(m, "Technology")["Duży zwycięzca (10+ lat)"])


def test_zysk_znormalizowany_i_peg():
    def kw(v):      # 4 kwartały 2026 o tej samej wartości
        return {"X": [[f"2026-{a}", f"2026-{b}", v, f"2026-{b[:2]}-28"] for a, b in
                      (("01-01", "03-31"), ("04-01", "06-30"), ("07-01", "09-30"), ("10-01", "12-31"))]}
    ex = {k: kw(v) for k, v in dict(rev=100.0, ni=40.0, op=30.0, odsetki=5.0, przed_pod=50.0, podatek=10.0).items()}
    fv = dict(price=100.0, PE=25.0, estLTGrowth=20.0, marketCap=1000.0)
    m, _ = O.metryki(ex, fv, dzis=dt.date(2027, 3, 1))
    assert abs(m["ni_norm"] - 4 * 25 * 0.8) < 1e-9          # (op − odsetki) × (1 − 20 %)
    assert abs(m["eps_norm"] - 4.0 * 80 / 160) < 1e-9 and abs(m["peg_gaap"] - 1.25) < 1e-9
    assert m["peg_norm_uzyte"] and abs(m["peg"] - 2.5) < 1e-9
    assert any("zawyżony" in x for x in O.ostrzezenia(m))


def test_zdarzenia_8k():
    from momentum import zdarzenia as Z
    d = {"filings": {"recent": {"form": ["8-K", "8-K", "NT 10-Q", "8-K"], "filingDate": ["2026-11-12", "2026-10-01", "2026-08-01", "2025-01-01"],
                                "items": ["5.02,9.01", "2.02,9.01", "", "4.02"], "accessionNumber": ["0001-26-1", "0001-26-2", "0001-26-3", "0001-25-4"],
                                "primaryDocument": ["a.htm", "b.htm", "c.htm", "d.htm"]}}}
    zd = Z.z_submissions(d, 1045810, dzis=dt.date(2026, 11, 22))
    assert [z["f"] for z in zd] == ["8-K", "NT 10-Q"]       # wyniki kwartalne (2.02) pominięte, zdarzenie sprzed roku też
    assert zd[0]["poz"] == 1 and zd[1]["poz"] == 2 and zd[0]["u"].endswith("/1045810/0001261/a.htm")
    assert len(Z.ostrzezenia(zd)) == 1


def test_lynch_fazy_i_sygnaly():
    m = dict(rev_1y=0.30, rev_cagr3=0.25, rev_cagr5=0.25, przysp=0.01, rev_q_yoy3=[0.35, 0.30, 0.25], peg=2.5, zapasy_1y=0.50, zapasy_przych=0.10, dlug_rosnie_kw=5)
    assert O.faza(m)[0] == "Szybka ekspansja"
    lis = O.lynch(m, "Szybko rosnąca")["lista"]
    stany = {k: s for k, _, s, _ in lis}
    assert stany["Sprzedaż nie hamuje 2 kwartały z rzędu"] is False and stany["P/E nie jest absurdalnie wysokie względem wzrostu (PEG < 2)"] is False
    assert stany["Zapasy nie rosną szybciej niż sprzedaż"] is False and stany["Dług nie rośnie 5 kwartałów z rzędu"] is False
    assert O.faza(dict(rev_1y=0.05, rev_cagr3=0.15, rev_cagr5=0.25))[0] == "Dojrzewanie"
    s = dict(pe=30.0, pe_med5=20.0, rev_1y=0.08, rev_cagr5=0.10)
    assert {k: v for k, _, v, _ in O.lynch(s, "Stabilnie rosnąca")["lista"]}["P/E nie odbiegło wysoko od normalnego (≤ 1,3 × mediana z 5 lat)"] is False
    assert all(st == "niepotwierdzony" for *_, st in lis[:4]) and lis[-1][3] == "nietestowany"
    assert O.lynch(dict(spadek_2l=["przychody"]), "Wolno rosnąca")["lista"][2][3] == "potwierdzony"
    assert abs(O.lynch(dict(eps_next5=0.15, div=0.02, pe=17.0), "Wolno rosnąca")["wskaznik"] - 1.0) < 1e-9
    h = dict(q=[[f"2025-{mm:02d}-28", 0, 10, 0, 0, 0] for mm in range(1, 13)])
    assert abs(O.pe_mediana(h, (["2024-01-01"], [100.0]), 4) - 10.0) < 1e-9    # 100 × 4 ÷ 40
