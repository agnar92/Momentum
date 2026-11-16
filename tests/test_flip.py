"""Testy FLIP / TVOD bez sieci: litery F/L/I/P, wymagany wzrost, stan raportu, kolejność listy, plan transz i plik."""
import datetime as dt

import flip as script
from momentum import flip

CFG = {"industries": ["Semiconductors"], "include": {"TSLA": "energia"}, "founders": {"AAA": "Jan (założyciel)", "BBB": "nie"},
       "leaders": {"NICHE": "lider niszy"}}


def row(t="AAA", mcap=100_000, pc=10, pb=10, de=0.5, pfcf=25, ins=5, opm=20, ind="Semiconductors", **kw):
    return dict(ticker=t, marketCap=mcap, PC=pc, PB=pb, debtEq=de, PFCF=pfcf, insiderOwn=ins, operMargin=opm, industry=ind, **kw)


def test_required_growth():
    assert abs(flip.required_growth(25) - 0.125) < 0.002 and abs(flip.required_growth(100) - 0.292) < 0.002
    assert flip.required_growth(None) is None and flip.required_growth(-3) is None


def test_checks_letters():
    ok = flip.checks(row(), CFG, {"Semiconductors": 200e9})
    assert all(v[0] for v in ok.values()) and "Jan" in ok["L"][1]
    c = flip.checks(row(t="BBB", ins=3, pfcf=None, ind="Banks"), CFG, {"Banks": 100e9})
    assert not c["F"][0] and not c["L"][0] and not c["I"][0]
    assert flip.checks(row(t="CCC", ins=12), CFG, {})["L"][0]                       # insiderzy >= 10 % bez założyciela
    small = flip.checks(row(mcap=10_000), CFG, {"Semiconductors": 200e9})
    assert not small["P"][0] and "20×" in small["P"][1]
    assert flip.checks(row(t="NICHE", mcap=10_000), CFG, {"Semiconductors": 200e9})["P"] == (True, "lider niszy")
    assert flip.checks(row(t="TSLA", ind="Auto"), CFG, {})["I"] == (True, "energia")
    debt = flip.checks(row(pc=100, de=5, pfcf=50), CFG, {})       # gotówka 1 mld, dług 50 mld, FCF 2 mld
    assert not debt["F"][0] and "dług netto" in debt["F"][1]


def test_report_state_and_rank():
    assert flip.report_state({"rev_rr": 20, "dopm": 1})[0] == "dobre"
    assert flip.report_state({"rev_rr": 8, "dopm": 1})[0] == "słabnie" and flip.report_state({"rev_rr": 30, "dopm": -5})[0] == "słabnie"
    assert flip.report_state({"rev_rr": 12, "dopm": 0})[0] == "neutralne" and flip.report_state(None)[0] == "brak"
    rows = [dict(t="A", flip=True, margin=0.05, t_state="dobre"), dict(t="B", flip=True, margin=0.30, t_state="słabnie"),
            dict(t="C", flip=True, margin=0.20, t_state="neutralne"), dict(t="D", flip=False, margin=0.9, t_state="dobre")]
    flip.rank(rows, top=2)
    assert [r["rank"] for r in rows] == [2, 3, 1, None] and [r["pick"] for r in rows] == [True, False, True, False]


def test_ladder():
    p = flip.ladder([], 500)
    assert p["first"] == 200 and p["tranche"] == 30 and p["up"] is None
    p = flip.ladder([(100, 200), (93, 30)], 500)
    assert p["spent"] == 230 and abs(p["up"] - 107) < 1e-9 and abs(p["down"] - 93 * 0.93) < 1e-9
    assert flip.ladder([(100, 500)], 500)["up"] is None


def test_build_file():
    base = [dict(ticker="AAA", company="A Inc", industry="Semiconductors", marketCap=100_000, price=50.0, averageVolume=5),
            dict(ticker="AAAB", company="A Inc", industry="Semiconductors", marketCap=100_000, price=49.0, averageVolume=1),
            dict(ticker="ZZZ", company="Z Co", industry="Banks", marketCap=50_000, price=10.0)]
    det = {"AAA": row(), "AAAB": row(t="AAAB"), "ZZZ": row(t="ZZZ", ind="Banks")}
    out = script.build(base, det, CFG, {"AAA": {"rev_rr": 25, "dopm": 2, "quarter": "2026-09-30"}}, dt.date(2026, 11, 15))
    ts = [r["t"] for r in out["rows"]]
    assert ts == ["AAA", "ZZZ"] and out["rows"][0]["pick"] and out["rows"][0]["t_state"] == "dobre"      # AAAB = druga klasa akcji
    assert out["prices"] == {"AAA": 50.0, "AAAB": 49.0, "ZZZ": 10.0} and out["rules"]["top"] == 10


def test_thesis_broken():
    assert flip.thesis_broken({"rev_rr": -3, "rev_rr1": -1})[0] is True
    assert flip.thesis_broken({"rev_rr": -3, "rev_rr1": 5})[0] is False      # jeden słabszy kwartał to jeszcze nie T
    assert flip.thesis_broken({"rev_rr": 5})[0] is False and flip.thesis_broken(None)[0] is False
