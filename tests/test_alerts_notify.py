"""Testy czystej logiki alerts_notify.py (bez sieci) — m.in. zgodność matematyki linii z docs/js/annotate.js."""
import math

import alerts_notify as an

LINE = {"id": "a1", "kind": "res", "x0": "2026-01-05", "y0": 100, "x1": "2026-01-12", "y1": 110, "alert": "above"}


def test_biz_index_matches_js():
    assert an.biz_index("2026-01-12") - an.biz_index("2026-01-05") == 5
    assert an.biz_index("2026-01-09") + 1 == an.biz_index("2026-01-12")
    assert an.biz_index("2026-01-09") < an.biz_index("2026-01-10") < an.biz_index("2026-01-12")


def test_line_value_at_matches_js_expectations():
    assert an.line_value_at(LINE, "2026-01-05") == 100
    assert an.line_value_at(LINE, "2026-01-07") == 104
    assert an.line_value_at(LINE, "2026-01-12") == 110
    assert an.line_value_at(LINE, "2026-01-19") == 120          # ekstrapolacja za prawy koniec
    log_line = {**LINE, "log": True, "y1": 121}
    assert math.isclose(an.line_value_at(log_line, "2026-01-08"), 100 * 1.21 ** (3 / 5), rel_tol=1e-9)


def test_alert_state_above_and_below():
    assert an.alert_state(LINE, 111, "2026-01-12")["triggered"] is True
    assert an.alert_state(LINE, 109, "2026-01-12")["triggered"] is False
    assert an.alert_state({**LINE, "alert": "below"}, 99, "2026-01-05")["triggered"] is True
    assert an.alert_state(LINE, None, "2026-01-12") is None


def test_triggered_alerts_skips_acked_unknown_and_untriggered():
    stocks = [{"ticker": "AAA", "price": 111, "as_of": "2026-01-12"}, {"ticker": "BBB", "price": 50, "as_of": "2026-01-12"}]
    ann = {
        "AAA": {"lines": [LINE, {**LINE, "id": "a2", "ack": True}, {**LINE, "id": "a3", "alert": None}]},
        "BBB": {"lines": [{**LINE, "id": "b1"}]},      # cena 50 < linia 110, alert "nad" nie przebity
        "ZZZ": {"lines": [{**LINE, "id": "z1"}]},      # spółka spoza listy
    }
    got = an.triggered_alerts(ann, stocks)
    assert [a["id"] for a in got] == ["a1"]
    assert got[0]["ticker"] == "AAA" and got[0]["value"] == 110


def test_state_roundtrip_and_new_alerts():
    body = "opis\n\n" + an.render_state({"b", "a"})
    assert an.parse_state(body) == {"a", "b"}
    assert an.parse_state("brak stanu") == set()
    current = [{"id": "a"}, {"id": "c"}]
    assert [x["id"] for x in an.new_alerts(current, {"a", "b"})] == ["c"]


def test_format_message_mentions_owner_and_labels_stop():
    msg = an.format_message([
        {"ticker": "AAA", "kind": "res", "direction": "above", "value": 110.0, "price": 111.5, "dist": 1.36, "as_of": "2026-01-12"},
        {"ticker": "BBB", "kind": "stop", "direction": "below", "value": 95.0, "price": 94.0, "dist": -1.05, "as_of": "2026-01-12"},
    ], "agnar92")
    assert msg.startswith("@agnar92 ")
    assert "**AAA**" in msg and "nad linią (opór) 110.00" in msg
    assert "🛑 **BBB**" in msg and "pod linią (STOP)" in msg
