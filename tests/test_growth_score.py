import pytest

from momentum import calc


def test_growth_score_has_five_categories_and_reports_missing_data():
    row = {
        "rev_rr": 35, "accel": 10, "eps_growth_q": 50, "surp": 20,
        "revenue_surprise": 20, "eps_growth_next_year": 50, "eps_rev": 20,
        "opm": 25, "dopm": 6, "roic": 20,
        "qs": [{"rev_rr": 10}, {"rev_rr": 20}, {"rev_rr": 30}],
        "eps_growth_history": [5, 10, 15], "growth_catalyst_score": 2,
    }
    result = calc.growth_score(row)
    assert result["score"] == 100.0
    assert result["coverage"] == 100.0
    assert result["groups"] == {
        "acceleration": pytest.approx(30),
        "surprises": pytest.approx(20),
        "future": pytest.approx(20),
        "quality": pytest.approx(20),
        "durability": pytest.approx(10),
    }


def test_growth_score_does_not_treat_missing_data_as_zero():
    result = calc.growth_score({"rev_rr": 25, "accel": 5, "eps_growth_q": 20, "surp": 5})
    assert result["coverage"] < 70
    assert result["score"] is None
    assert result["components"]["revenue_surprise"] is None
