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
    wl = {k: (s_, st) for k, _, s_, st in O.lynch(dict(spadek_2l=["przychody"], div=0.02, dyw_rosnie_5=True), "Wolno rosnąca")["lista"]}
    assert wl["Sprzedaż nie spada 2 lata z rzędu (utrata rynku)"] == (False, "potwierdzony") and wl["Dywidenda rośnie 5 lat z rzędu"] == (True, "potwierdzony")
    st = {k: (s_, x) for k, _, s_, x in O.lynch(dict(nm=0.3, nm_gorna_tercyla_stab=True), "Stabilnie rosnąca")["lista"]}
    assert st["Wysoka marża netto (górna 1/3 stabilnie rosnących)"] == (True, "potwierdzony")
    assert abs(O.lynch(dict(eps_next5=0.15, div=0.02, pe=17.0), "Wolno rosnąca")["wskaznik"] - 1.0) < 1e-9
    h = dict(q=[[f"2025-{mm:02d}-28", 0, 10, 0, 0, 0] for mm in range(1, 13)])
    assert abs(O.pe_mediana(h, (["2024-01-01"], [100.0]), 4) - 10.0) < 1e-9    # 100 × 4 ÷ 40


def test_pierwszy_kwartal_z_polrocza():
    rows = [["2026-01-01", "2026-06-30", 500.0, "2026-08-01"], ["2026-04-01", "2026-06-30", 230.0, "2026-08-01"],
            ["2026-01-01", "2026-09-30", 850.0, "2026-11-01"], ["2026-07-01", "2026-09-30", 350.0, "2026-11-01"]]
    q = F.kwartalne(rows)
    assert q == {"2026-03-31": 270.0, "2026-06-30": 230.0, "2026-09-30": 350.0}     # I kw. = 6 mies. − II kw.


def test_gpw_metryki_i_progi():
    import gpw
    d = dict(info=dict(marketCap=1e9, currentPrice=10.0, trailingPE=10.0),
             rev={"2022-12-31": 100.0, "2023-12-31": 110.0, "2024-12-31": 121.0, "2025-12-31": 133.1},
             ni={"2022-12-31": 10.0, "2023-12-31": 12.0, "2024-12-31": 14.0, "2025-12-31": 20.0},
             eq={"2022-12-31": 80.0, "2025-12-31": 100.0}, assets={"2025-12-31": 150.0}, lc={"2025-12-31": 30.0}, op={"2025-12-31": 25.0},
             debt={"2025-12-31": 20.0}, fcf={"2025-12-31": 15.0}, cash={"2025-12-31": 30.0})
    m = gpw.metryki(d)
    assert abs(m["rev_cagr3"] - 0.10) < 1e-9 and m["lata_wzrostu"] == 3 and abs(m["roe"] - 0.2) < 1e-9
    assert abs(m["peg"] - 10 / (100 * ((20 / 10) ** (1 / 3) - 1))) < 1e-9 and m["spadek_2l"] is None
    st = gpw.strategie(m)
    assert st["Jakość (7 kryteriów, GPW)"][0][2] is True          # przychody 10 %/rok > próg GPW 5 %
    assert gpw.etykieta(0.4) == "Bardzo tania" and gpw.etykieta(None) is None


def test_dcf_fcff_dodaje_odsetki_po_podatku():
    """FCFF: marża = FCF − SBC + odsetki × (1 − podatek); dług odejmowany od wartości, więc koszt długu nie jest liczony dwa razy."""
    m = dict(rev_cagr3=0.05, eps_next5=0.08, fcf_margin=0.20, sbc_przych=0.02, odsetki_ttm=50.0, rev_ttm=1000.0, stopa_pod=0.20)
    g, mz = O.dcf_domyslne(m, None)
    assert abs(g - 0.05) < 1e-12
    assert abs(m["odsetki_przych"] - 0.04) < 1e-12          # 50 × 0,8 ÷ 1000
    assert abs(mz - (0.20 - 0.02 + 0.04)) < 1e-12
    m2 = dict(rev_cagr3=0.05, fcf_margin=0.20, rev_ttm=1000.0)   # bez odsetek → bez zmian
    assert abs(O.dcf_domyslne(m2, None)[1] - 0.20) < 1e-12


def test_gpw_biznesradar_tabela_i_dywidendy():
    """Parser tabeli raportu biznesradar.pl (tys. zł, kolumna „O4K” = 12 mies.) i dywidendy w metrykach GPW."""
    import gpw
    lata = [2019, 2020, 2021, 2022, 2023, 2024]
    th = "".join(f'<th class="thq h">{r} <span>(gru {r % 100:02d})</span></th>' for r in lata) + '<th class="thq h newest">O4K <span>(cze 25)</span>*</th>'
    td = lambda vals: "".join(f'<td class="h"><span class="value"><span class="pv"><span>{v}</span></span></span></td>' for v in vals)  # noqa: E731
    h = (f'<table class="report-table"><tr>{th}</tr>'
         f'<tr data-field="IncomeRevenues"><td class="f">x</td>{td(["1 000", "1 100", "1 210", "1 331", "1 464", "1 611", "1 700"])}</tr>'
         f'<tr data-field="IncomeShareholderNetProfit"><td class="f">x</td>{td(["100", "110", "121", "133", "146", "161", "170"])}</tr>'
         f'<tr data-field="CashflowDividend"><td class="f">x</td>{td(["-40", "-44", "-48", "-50", "-55", "-60", "-62"])}</tr></table>')
    br = gpw.br_tabela(h, ("IncomeRevenues", "IncomeShareholderNetProfit", "CashflowDividend"))
    assert br["IncomeRevenues"]["2024-12-31"] == 1_611_000 and br["IncomeRevenues"]["ttm:2025-06-30"] == 1_700_000
    d = gpw.scal_br(dict(info=dict(marketCap=10e6, currentPrice=10.0, trailingPE=None)), br)
    m = gpw.metryki(d)
    assert m["rev_ttm"] == 1_700_000 and abs(m["rev_cagr5"] - 0.10) < 1e-3
    assert m["dywidenda_lata"] == 5 and m["dywidenda_stabilna"] is True and m["dyw_rosnie_5"] is True
    assert abs(m["pe"] - 10e6 / 170_000) < 1e-6                 # P/E z kapitalizacji ÷ zysk 12 mies., gdy yfinance nie podaje


def test_buffett_reguly():
    """Etap 111: reguły Buffetta z lat obrotowych; zysk brutto z przychodów − kosztu, gdy brak GrossProfit."""
    lata = [f"{r}-12-31" for r in range(2019, 2026)]
    yr = {"rev": {e: 100.0 + 10 * i for i, e in enumerate(lata)}, "ni": {e: 25.0 + 2 * i for i, e in enumerate(lata)},
          "koszt": {e: 40.0 for e in lata}, "sga": {e: 15.0 for e in lata}, "capex": {e: 4.0 for e in lata},
          "op": {e: 40.0 for e in lata}, "odsetki": {e: 2.0 for e in lata}}
    ch = {"eq": {lata[-1]: 100.0}, "zob": {lata[-1]: 70.0}, "skarb": {lata[-1]: -20.0}, "dlug_dl": {lata[-1]: 50.0}}
    y = [[e, yr["rev"][e], yr["ni"][e], 0, 0, 0, 0, 0, 10.0] for e in lata]
    m = O.buffett(yr, ch, y)
    assert abs(m["bf_gm"] - (150 - 40) / 150) < 1e-3 and m["bf_eps_lata"] == 6 and m["bf_eps_n"] == 6 and m["bf_eps_zysk"]
    assert abs(m["bf_de"] - 70 / 120) < 1e-3 and abs(m["bf_dlug_lat"] - 50 / 37) < 1e-3
    assert abs(m["bf_ods"] - 0.05) < 1e-6
    lst = O.buffett_lista(m)
    assert len(lst) == 8 and all(ok for _, _, ok in lst) and O.buffett3(m)
    m2 = O.buffett(dict(yr, ni={e: -1.0 for e in lata}), ch, y)
    assert m2["bf_dlug_lat"] == O.BRAK_BF and not O.buffett3(m2)


def test_finviz_ponawia_po_odmowie(monkeypatch):
    """Finviz 403 / 429: czekamy i ponawiamy zamiast kończyć cały przebieg błędem."""
    import spolki
    monkeypatch.setattr(spolki.time, "sleep", lambda s: None)
    strona = '<script type="application/json" data-ssr-props="x">{"data": {"rows": [{"text": {"ticker": "AAA"}, "numbers": {"marketCap": 1}}], "totalCount": 1}}</script>'

    class R:
        def __init__(self, kod):
            self.status_code, self.text = kod, strona if kod == 200 else ""

        def raise_for_status(self):
            if self.status_code != 200:
                raise RuntimeError(self.status_code)
    kody = iter([403, 429, 200] + [200] * 10)
    out = spolki.finviz(log=lambda *a: None, get=lambda *a, **k: R(next(kody)), pause=0)
    assert "AAA" in out


def test_finviz_zapas_z_kart(tmp_path):
    """Finviz blokuje: wiersze odtworzone z kart, wskaźniki cena / X przeliczone z nowej ceny."""
    import json as js
    import spolki
    d = tmp_path / "spolki"
    d.mkdir()
    m = dict(price=100.0, mcap=1e9, pe=20.0, ps=5.0, pfcf=25.0, div=0.02, eps_next5=0.1, gm=0.5, de=0.3)
    (d / "AAA.json").write_text(js.dumps(dict(t="AAA", n="Aaa Inc", sector="Technology", m=m, generated_at="2026-11-20")))
    fv = spolki.finviz_z_kart(str(tmp_path))
    r = fv["AAA"]
    assert r["marketCap"] == 1000 and r["estLTGrowth"] == 10 and r["grossMargin"] == 50 and r["fv_data"] == "2026-11-20"
    spolki.aktualizuj_ceny(fv, {"AAA": (["2026-11-27"], [110.0], [])})
    assert abs(r["PE"] - 22) < 1e-9 and abs(r["marketCap"] - 1100) < 1e-9 and abs(r["dividendYield"] - 2 / 1.1) < 1e-9 and r["price"] == 110
    mm, _ = O.metryki({}, r)
    assert abs(mm["pe"] - 22) < 1e-9 and abs(mm["peg"] - 2.2) < 1e-9


def test_lynch_listy():
    """Rozdz. 8, 9, 13, 15: listy liczą się z danych; punkty jakościowe zostają do oceny własnej (None)."""
    m = dict(pe=15.0, pe_med5=20.0, peg=0.8, inst_proc=0.4, ins_kupujacy=2, ins_kupno_12m=2e6, akcje_3l=-0.05, zysk_lata=5, de=0.2, net_cash=1e9,
             rev_cagr5=0.12, rec_zysk=(2020, -0.1), rec_kurs_2020=-0.25, rec_spy_2020=-0.34, dyworsyfikacja=False, wydzielona="2019-05-01",
             analitycy=8, emerytury_mc=-0.02, marza_przed=0.25, marza_przed_med=0.15, net_cash_mc=0.1, gotowka_na_akcje=5.0, mcap=1e10)
    L = O.lynch(m, "Stabilnie rosnąca")
    zak = {co: s for co, _, s in L["zakup"]}
    assert zak["Zarząd lub rada kupują akcje (12 mies.)"] is True and zak["Zysk przetrwał recesję (2009 / 2020: spadek ≤ 25 %)"] is True
    assert any(s is None and w == "oceń sam" for _, w, s in L["zakup"])
    assert len(L["cechy"]) == 13 and dict((c, s) for c, _, s in L["cechy"])["Wydzielona ze spółki matki"] is True
    assert all(s is not False for _, _, s in L["unikaj"])
    liczby = {c: s for c, _, s, _ in L["liczby"]}
    assert liczby["Marża przed opodatkowaniem na tle branży"] is True and liczby["Zobowiązania emerytalne (niedofinansowanie)"] is True


def test_insiderzy_z_pliku_sec(tmp_path, monkeypatch):
    """Zbiorcze dane SEC Form 4: liczą się zakupy na rynku (P) zarządu i rady, nie 10-procentowych akcjonariuszy."""
    import io
    import zipfile
    import spolki
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("SUBMISSION.tsv", "ACCESSION_NUMBER\tISSUERCIK\tDOCUMENT_TYPE\nA1\t0000000123\t4\nA2\t0000000123\t4\nA3\t0000000123\t4\n")
        z.writestr("REPORTINGOWNER.tsv", "ACCESSION_NUMBER\tRPTOWNERCIK\tRPTOWNER_RELATIONSHIP\nA1\t9\tDirector\nA2\t8\tTenPercentOwner\nA3\t7\tOfficer\n")
        z.writestr("NONDERIV_TRANS.tsv", "ACCESSION_NUMBER\tTRANS_DATE\tTRANS_CODE\tTRANS_SHARES\tTRANS_PRICEPERSHARE\n"
                   "A1\t01-NOV-2026\tP\t3000\t10\nA2\t01-NOV-2026\tP\t1000\t10\nA3\t02-NOV-2026\tS\t50\t10\n")
    (tmp_path / "form345_2026q4.zip").write_bytes(buf.getvalue())

    class R:
        text = '<a href="/files/x/2026q4_form345.zip">'
    monkeypatch.setattr(spolki.requests, "get", lambda *a, **k: R())
    out = spolki.insiderzy(str(tmp_path), log=lambda *a: None, dzis=dt.date(2026, 11, 25))
    assert out["123"] == {"kupno": 30000.0, "sprzedaz": 500.0, "kupujacy": 1}


def test_wydzielenie():
    from momentum import zdarzenia as Z
    d = {"filings": {"recent": {"form": ["10-K", "10-12B", "10-12B/A"], "filingDate": ["2024-02-01", "2019-03-01", "2019-04-01"]}}}
    assert Z.wydzielenie(d) == "2019-03-01" and Z.wydzielenie({}) is None


def test_cykliczna_peg_nie_dotyczy():
    y = [["2016", 100, 10], ["2017", 90, 5], ["2018", 120, 12], ["2019", 100, -1], ["2020", 130, 15], ["2021", 140, 14]]
    assert O.cykl_spadki(y) == 2
    m = {"cykliczna": 70, "cykl_spadki": 2, "peg": 0.2, "pe": 8, "pe_med5": 20, "ni_1y": 1.5}
    assert O.cykliczna(m) and not O.cykliczna({"cykliczna": 40, "cykl_spadki": 3}) and not O.cykliczna({"cykliczna": 100, "cykl_spadki": 1})
    ost = O.ostrzezenia(m)
    assert m.get("cykl_szczyt") and any("cykliczna" in x for x in ost)
    st = O.strategie(dict(m, rev_5y=1, rev_1y=0.2, ni_1y=0.2, roe=0.3, de=0.1, fcf=1), "Technology")
    peg = [k for k in next(v for n, v in st.items() if n.startswith("7/7")) if k[0].startswith("PEG")][0]
    assert "nie dotyczy" in peg[0] and peg[2] is False


def test_typy_cykl_na_pierwszym_miejscu():
    ty = [("Szybko rosnąca", 100.0, ""), ("Cykliczna", 90.0, "")]
    assert O.typy_cykl(ty, {"cykliczna": 90, "cykl_spadki": 3})[0][0] == "Cykliczna"
    assert O.typy_cykl(ty, {"cykliczna": 90, "cykl_spadki": 1})[0][0] == "Szybko rosnąca"
