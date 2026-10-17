import json

import darvas_notify as dn


def _write(tmp_path, name, stocks):
    p = tmp_path / name
    p.write_text(json.dumps({"stocks": stocks}), encoding="utf-8")
    return str(p)


def test_load_stocks_keeps_newer_session(tmp_path):
    a = _write(tmp_path, "a.json", [{"ticker": "X", "as_of": "2026-10-15", "dv_state": "READY"}])
    b = _write(tmp_path, "b.json", [{"ticker": "X", "as_of": "2026-10-16", "dv_state": "BUY"}, {"ticker": "Y", "as_of": "2026-10-16"}])
    got = dn.load_stocks([a, b, str(tmp_path / "brak.json")])
    assert got["X"]["dv_state"] == "BUY" and set(got) == {"X", "Y"}


def test_signals_book_rules_and_positions():
    stocks = {
        "RDY": {"dv_state": "READY", "dv_n": 2, "dv_top": 50.0, "dv_dist": 3.1, "dv_stop": 45.0},
        "RD2": {"dv_state": "READY", "dv_n": 2, "dv_top": 8.0, "dv_dist": 1.0, "dv_stop": 7.2},
        "BUY": {"dv_state": "BUY", "dv_n": 3, "dv_top": 20.0, "price": 21.0},
        "ONE": {"dv_state": "BUY", "dv_n": 1, "dv_top": 10.0, "price": 10.5},    # pierwszy box: bez sygnału
        "SEL": {"dv_state": "SELL", "dv_n": 0, "dv_top": 30.0, "dv_bottom": 27.0},
        "OUT": {"dv_state": "OUT", "dv_n": 0, "dv_top": 9.0},
    }
    sig = dn.signals(stocks, positions={"SEL"})
    assert [(s["ticker"], s["kind"]) for s in sig] == [("BUY", "buy"), ("RD2", "ready"), ("RDY", "ready"), ("SEL", "sell")]   # GOTOWE od najbliższego punktu kupna
    assert sig[2]["stop"] == 45.0 and sig[0]["stop"] == 18.9
    msg = dn.format_message(sig, "kamil", "2026-10-16")
    assert "@kamil" in msg and "kup stop 50.00, stop loss 45.00" in msg and "SEL" in msg


def test_state_roundtrip_and_positions_from_prefs():
    body = "opis\n\n" + dn.render_state({"A:READY:5.0", "B:BUY:2.0"})
    assert dn.parse_state(body) == {"A:READY:5.0", "B:BUY:2.0"}
    prefs = {"pos": {"A": {"v": {"entry": 10, "stop": 9}, "t": 1}, "B": {"v": None, "t": 2}}}
    assert dn.open_positions(prefs) == {"A"}
