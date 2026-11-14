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


def test_expected_return_and_auto_checks():
    r = dict(fcf_yield=0.05, rev_cagr=0.12, est_lt=0.08, roic_recent=0.25, roic_med=0.28, sh_cagr=-0.01)
    assert quality.expected_return(r) == (0.13, 0.08)                       # ostrożniejsza z dwóch liczb
    assert quality.expected_return(dict(r, rev_cagr=0.4, est_lt=None)) == (0.2, 0.15)   # wzrost obcięty do 15 %
    assert quality.expected_return(dict(r, fcf_yield=None)) == (None, None)
    a = quality.auto_checks(r)
    assert a["q3"]["ok"] is True and "maleje" in a["q3"]["why"] and a["q4"]["ok"] is True
    b = quality.auto_checks(dict(r, roic_recent=0.12, sh_cagr=0.03, fcf_yield=0.02, rev_cagr=0.03, est_lt=0.05))
    assert b["q3"]["ok"] is False and "rozwodnienie" in b["q3"]["why"] and "< 15 %" in b["q3"]["why"]
    assert b["q4"]["ok"] is False and b["q4"]["er"] == 0.05
    assert quality.auto_checks({})["q3"]["ok"] is None and quality.auto_checks({})["q4"]["ok"] is None


def test_parse_ai_and_prompt():
    txt = '```json\n{"biznes": "Sprzedaje buty.", "fosa": "SILNA", "fosa_typ": ["marka"], "zarzad": "świetny", "ryzyka": ["moda"], "teza": "T"}\n```'
    a = quality.parse_ai(txt)
    assert a["fosa"] == "silna" and a["zarzad"] == "nie wiem" and a["fosa_typ"] == ["marka"] and a["ryzyka"] == ["moda"]
    for bad in ("nie json", "[]", '{"fosa": "silna"}'):
        try:
            quality.parse_ai(bad)
            raise AssertionError(bad)
        except ValueError:
            pass
    p = quality.ai_prompt(dict(t="X", n="X Inc", hist=[dict(y=2025, roic=0.2, gm=0.5, fcfm=None)], rev_cagr=0.1))
    assert "X Inc (X)" in p and "2025: ROIC 20%" in p and "JSON" in p


def test_annotate_ai_reuses_fresh_answers():
    today = dt.date(2026, 11, 14)
    ok = '{"biznes": "B", "fosa": "brak", "zarzad": "dobry", "teza": "T"}'
    asked = []

    def ask(prompt):
        asked.append(prompt)
        if "Y Inc" in prompt:
            raise RuntimeError("limit")
        return ok
    out = {"rows": [dict(t="X", n="X Inc"), dict(t="Y", n="Y Inc"), dict(t="Z", n="Z Inc"), dict(t="W", n="W Inc")]}
    old = {"rows": [dict(t="Z", ai=dict(biznes="stare", at="2026-06-01")), dict(t="X", ai=dict(biznes="b", at="2025-01-01"))]}
    n = script.annotate_ai(out, "k", old, top=3, ask=ask, log=lambda *_: None, pause=0, today=today)
    assert n == 1 and len(asked) == 2                                     # X (stara odpowiedź) i Y (błąd); Z świeże, W poza top 3
    assert out["rows"][0]["ai"]["fosa"] == "brak" and out["rows"][0]["ai"]["at"] == "2026-11-14"
    assert "ai" not in out["rows"][1] and out["rows"][2]["ai"]["biznes"] == "stare" and "ai" not in out["rows"][3]


def test_gemini_retries_on_limit():
    class R:
        def __init__(self, code):
            self.status_code = code

        def raise_for_status(self):
            if self.status_code >= 400:
                raise RuntimeError(self.status_code)

        def json(self):
            return {"candidates": [{"content": {"parts": [{"text": "{}"}]}}]}
    codes = [429, 200]
    sent = []

    def post(url, headers, json, timeout):
        sent.append((url, headers["x-goog-api-key"], json["generationConfig"]["responseMimeType"]))
        return R(codes.pop(0))
    assert script.gemini("p", "KEY", "m1", post=post, wait=0) == "{}"
    assert len(sent) == 2 and sent[0] == (script.GEMINI_URL.format("m1"), "KEY", "application/json")
