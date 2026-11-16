"""Testy wyceny bez sieci: wzory z arkusza (PEG, wartość, potencjał), filtr tanich i build z podmienionymi danymi."""
import datetime as dt

import wycena as script
from momentum import wycena


def test_value_row_like_sheet():
    r = wycena.value_row("NVDA", "NVIDIA", 162.85, 7.91, 0.6982, 0.9553, 52, 15.84, sp=True, nq=True)
    assert r["pe"] == round(162.85 / 7.91, 2)
    assert r["peg"] == round(162.85 / 7.91 / 69.82, 3)
    assert r["iv"] == round(7.91 * 69.82, 2)
    assert abs(r["pot"] - (7.91 * 69.82 / 162.85 - 1)) < 1e-4
    assert abs(r["pot"] - (1 / (162.85 / 7.91 / 69.82) - 1)) < 1e-3          # potencjał = 1 / PEG - 1
    assert r["fpeg"] == round(162.85 / (7.91 * 1.6982) / 69.82, 3) and r["sp"] and r["nq"]


def test_value_row_without_positive_eps_or_growth():
    for eps, g in ((-1.0, 0.2), (2.0, -0.1), (2.0, None), (None, 0.2), (2.0, float("nan"))):
        r = wycena.value_row("X", "X", 100, eps, g)
        assert r["peg"] is None and r["iv"] is None and r["pot"] is None


def test_cheap_filter_and_order():
    rows = [wycena.value_row("A", "A", 100, 5, 0.30, analysts=10),     # P/E 20, PEG 0,67, wartość 150
            wycena.value_row("B", "B", 100, 5, 0.15, analysts=10),     # PEG 1,33 -> odpada
            wycena.value_row("C", "C", 100, 4, 0.50, analysts=10),     # PEG 0,5, wartość 200
            wycena.value_row("D", "D", 100, 4, 0.50, analysts=1)]      # za mało analityków
    assert [r["t"] for r in wycena.cheap(rows)] == ["C", "A"]


def test_build_with_fake_data():
    mem = {"A": {"n": "Alfa", "sp": True, "nq": False}, "B": {"n": "Beta", "sp": False, "nq": True}}
    data = {"A": dict(price=50, eps=2.5, fwd_eps=3, g=0.4, g0=0.2, na=8)}
    out = script.build(mem, data, dt.date(2026, 12, 1))
    assert out["generated_at"] == "2026-12-01" and out["missing"] == ["B"] and len(out["rows"]) == 1
    assert out["rows"][0]["iv"] == 100.0 and out["rows"][0]["pot"] == 1.0
