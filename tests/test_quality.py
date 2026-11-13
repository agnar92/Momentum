"""Testy rankingu jakości bez sieci: historia roczna z faktów SEC, splity, cechy trwałości, percentyle, wynik, top 10 z limitem sektora, plik."""
import datetime as dt

import quality as script
from momentum import quality


def _d(tag, vals, unit="USD"):
    return {tag: {"units": {unit: vals}}}


def _facts(years=range(2016, 2026), split=None):
    """Spółka z rokiem obrotowym = kalendarzowym: przychody rosną o 10 %, marża op. 30 %, kapitał 1000, dług 200, gotówka 200."""
    g, rev = {}, 1000.0
    rows = {k: [] for k in ("Revenues", "GrossProfit", "OperatingIncomeLoss", "NetIncomeLoss", "NetCashProvidedByUsedInOperatingActivities",
                            "PaymentsToAcquirePropertyPlantAndEquipment", "StockholdersEquity", "LongTermDebt",
                            "CashAndCashEquivalentsAtCarryingValue", "WeightedAverageNumberOfDilutedSharesOutstanding")}
    for y in years:
        p = dict(start=f"{y}-01-01", end=f"{y}-12-31", filed=f"{y + 1}-02-15")
        b = dict(end=f"{y}-12-31", filed=f"{y + 1}-02-15")
        rows["Revenues"].append(dict(p, val=rev))
        rows["GrossProfit"].append(dict(p, val=rev * 0.6))
        rows["OperatingIncomeLoss"].append(dict(p, val=rev * 0.3))
        rows["NetIncomeLoss"].append(dict(p, val=rev * 0.2))
        rows["NetCashProvidedByUsedInOperatingActivities"].append(dict(p, val=rev * 0.25))
        rows["PaymentsToAcquirePropertyPlantAndEquipment"].append(dict(p, val=rev * 0.05))
        rows["StockholdersEquity"].append(dict(b, val=1000.0))
        rows["LongTermDebt"].append(dict(b, val=200.0))
        rows["CashAndCashEquivalentsAtCarryingValue"].append(dict(b, val=200.0))
        sh = 100.0 * (0.98 ** (y - 2016)) * (4 if split and y >= split else 1)
        rows["WeightedAverageNumberOfDilutedSharesOutstanding"].append(dict(p, val=sh))
        rev *= 1.1
    for k, v in rows.items():
        g.update(_d(k, v, "shares" if k.startswith("Weighted") else "USD"))
    # korekta: późniejszy raport zmienia przychody 2016 -> wygrywa najpóźniej złożony
    if 2016 in years:
        g["Revenues"]["units"]["USD"].insert(0, dict(start="2016-01-01", end="2016-12-31", filed="2018-02-15", val=1000.0))
        g["Revenues"]["units"]["USD"][1]["val"] = 900.0
    # kwartał nie jest rokiem obrotowym
    g["Revenues"]["units"]["USD"].append(dict(start="2025-10-01", end="2025-12-31", filed="2026-02-15", val=5.0))
    return {"us-gaap": g}


def test_history_roic_margins_and_split():
    h = quality.history(_facts(split=2021))
    assert len(h) == 10 and h[0]["y"] == 2016 and h[-1]["y"] == 2025
    assert abs(h[0]["roic"] - 300 * 0.79 / 1000) < 1e-9          # podatek domyślny 21 %, kapitał = 1000 + 200 − 200
    assert abs(h[0]["gm"] - 0.6) < 1e-9 and abs(h[0]["fcfm"] - 0.2) < 1e-9
    sh = [x["sh"] for x in h]
    assert all(b < a for a, b in zip(sh, sh[1:]))                  # split 4:1 w 2021 wyrównany, został skup 2 % rocznie


def test_split_adjust():
    assert quality.split_adjust([100, 99, 576, 570]) == [600, 594, 576, 570]
    assert quality.split_adjust([1000, 1000, 100]) == [100, 100, 100]
    assert quality.split_adjust([100, 187, 190]) == [100, 187, 190]   # emisja (IPO), nie split


def test_summary_and_young_or_stale_company():
    today = dt.date(2026, 11, 13)
    s = quality.summary(quality.history(_facts()), today)
    assert s["years"] == 10 and s["roic_hits"] == 10 and abs(s["rev_cagr"] - 0.1) < 1e-4 and abs(s["sh_cagr"] + 0.02) < 1e-4
    assert s["gm_sd"] == 0 and abs(s["fcf_conv"] - 1.0) < 1e-4
    assert quality.summary(quality.history(_facts(range(2022, 2026))), today) is None          # 4 lata < MIN_YEARS
    assert quality.summary(quality.history(_facts(range(2014, 2024))), today) is None          # ostatni raport za stary
    young = quality.summary(quality.history(_facts(range(2020, 2026))), today)
    assert young["roic_hits"] == 6                                                              # licznik na 10 -> mniej punktów


def test_finviz_metrics():
    m = quality.finviz_metrics({"PFCF": 20, "forwardPE": -5, "PE": 25, "estLTGrowth": 12, "debtEq": 0.4, "curRatio": 2})
    assert m["fcf_yield"] == 0.05 and m["fwd_ey"] is None and m["ey"] == 0.04 and m["est_lt"] == 0.12


def test_percentiles_score_and_top():
    assert quality.percentiles([3, None, 1, 3]) == [75.0, None, 0.0, 75.0]
    assert quality.percentiles([5]) == [50.0]
    w = [("a", "q", 10, 1), ("c", "q", 10, -1), ("b", "v", 10, 1)]
    rows = [dict(t="X", a=1, c=5, b=1, sector="T"), dict(t="Y", a=3, c=1, b=None, sector="T"), dict(t="Z", a=2, c=3, b=2, sector="H")]
    quality.score(rows, w)
    assert [r["t"] for r in rows] == ["Y", "Z", "X"]
    assert rows[0]["pts"] == {"q": 100.0} and rows[0]["score"] == 100.0       # brak bloku v -> wynik z pozostałych
    assert rows[2]["score"] == 0.0 and rows[0]["rank"] == 1
    assert quality.pick_top(rows, top=2, cap=1) == ["Y", "Z"]
    assert [r["top"] for r in rows] == [True, True, False]


def test_build_file():
    today = dt.date(2026, 11, 13)
    fv = {"AAA": dict(company="A Inc", sector="Technology", PFCF=15, forwardPE=20, PE=22),
          "BBB": dict(company="B Bank", sector="Financial", PFCF=8),
          "CCC": dict(company="C Co", sector="Industrials", PFCF=30)}
    hists = {"AAA": quality.history(_facts()), "CCC": quality.history(_facts(range(2023, 2026)))}
    out = script.build(fv, hists, "f", 3, today)
    assert out["top"] == ["AAA"] and out["n"] == 1
    assert {s["t"]: s["why"] for s in out["skipped"]} == {"BBB": "sektor finansowy / REIT", "CCC": "za mało danych SEC (3 lat)"}
    assert len(out["rows"][0]["hist"]) == 10 and "end" not in out["rows"][0]["hist"][0]


def test_ssr_rows():
    page = ('<script type="application/json" data-ssr-props="x">{"data":{"totalCount":2,"rows":[{"text":{"ticker":"A","sector":"T"},'
            '"numbers":{"PFCF":10}},{"text":{"ticker":""}}]}}</script>')
    assert script.ssr_rows(page) == ([{"ticker": "A", "sector": "T", "PFCF": 10}], 2)
