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
    lo = {"dv_natr": 5.0, "macd_w_above": True}
    stocks = {
        "RDY": {"dv_state": "READY", "dv_n": 2, "dv_top": 50.0, "dv_dist": 3.1, **lo},
        "RD2": {"dv_state": "READY", "dv_n": 2, "dv_top": 8.0, "dv_dist": 1.0, **lo},
        "BUY": {"dv_state": "BUY", "dv_n": 3, "dv_top": 20.0, "price": 21.0, **lo},
        "WID": {"dv_state": "READY", "dv_n": 2, "dv_top": 30.0, "dv_natr": 12.0, "macd_w_above": True},   # szeroki box (NATR ≥ 8): bez sygnału
        "NAN": {"dv_state": "READY", "dv_n": 2, "dv_top": 30.0, "macd_w_above": True},                    # NATR nieznany: bez sygnału
        "ONE": {"dv_state": "BUY", "dv_n": 1, "dv_top": 10.0, "price": 10.5, **lo},    # pierwszy box: bez sygnału
        "MCD": {"dv_state": "READY", "dv_n": 2, "dv_top": 5.0, "dv_natr": 5.0, "macd_w_above": False},   # MACD pod sygnałem: bez kupna
        "RAI": {"price": 40.0, "macd_w_above": False, "macd_w_cross_low": 37.5},   # pozycja: podnieś stop 36 → 37,5
        "SEL": {"price": 30.0, "macd_w_above": False, "macd_w_cross_low": 31.0},   # pozycja: zamknięcie pod dołkiem świecy sygnału
        "STP": {"price": 9.0, "macd_w_above": True},                                 # pozycja: pod stopem
        "HLD": {"price": 50.0, "macd_w_above": True},                                # pozycja z MACD nad sygnałem: nic
        "HI": {"price": 50.0, "macd_w_above": False, "macd_w_cross_low": 44.0},     # stop już wyżej niż dołek: nic
    }
    sig = dn.signals(stocks, positions={"RAI": 36.0, "SEL": 28.0, "STP": 9.5, "HLD": 45.0, "HI": 46.0})
    assert [(s["ticker"], s["kind"]) for s in sig] == [("SEL", "sell"), ("STP", "sell"), ("RAI", "raise"), ("BUY", "buy"), ("RD2", "ready"), ("RDY", "ready")]
    assert sig[2]["stop"] == 37.5 and sig[5]["stop"] == 45.0 and sig[3]["stop"] == 18.9
    msg = dn.format_message(sig, "kamil", "2026-10-16")
    assert "@kamil" in msg and "kup stop 50.00, stop loss 45.00" in msg and "stop → 37.50 (był 36.00)" in msg and "NATR 5.0 %" in msg


def test_state_roundtrip_and_positions_from_prefs():
    body = "opis\n\n" + dn.render_state({"A:READY:5.0", "B:BUY:2.0"})
    assert dn.parse_state(body) == {"A:READY:5.0", "B:BUY:2.0"}
    prefs = {"pos": {"A": {"v": {"entry": 10, "stop": 9}, "t": 1}, "B": {"v": None, "t": 2}}}
    assert dn.open_positions(prefs) == {"A": 9.0}
