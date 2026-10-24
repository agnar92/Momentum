"""Regression tests for Blue Line (BLB) confirmation timing."""

from momentum.calc import blue_line


def test_blb_confirms_ath_after_three_closed_weeks() -> None:
    # The record needs three subsequent closed weekly candles with no new high.
    assert blue_line([100.0, 99.0, 98.0]) == (None, None)
    assert blue_line([100.0, 99.0, 98.0, 97.0]) == (100.0, 0)


def test_blb_keeps_old_level_until_new_ath_is_confirmed() -> None:
    highs = [100.0, 99.0, 98.0, 97.0, 105.0, 104.0, 103.0, 102.0]
    # The old ATH is active as soon as it has aged three full weeks.
    assert blue_line(highs[:4]) == (100.0, 0)
    # The later ATH is not confirmed until three further weekly closes have passed.
    assert blue_line(highs[:7]) == (100.0, 0)
    assert blue_line(highs) == (105.0, 4)
