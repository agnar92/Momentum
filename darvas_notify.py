"""Powiadomienia o sygnałach karty Darvasa (krok dziennego workflow i workflow „Watchlisty”).

Stan karty liczy watchlist.py (pola dv_* w docs/data/watchlist.json i watchlists.json — ten sam algorytm co karta w aplikacji). Ten skrypt:
  1. zbiera spółki z obu plików (gdy spółka jest w obu, liczy się nowsza sesja `as_of`),
  2. wybiera sygnały wg książki: 🟢 KUP (dzisiejsze zamknięcie nad górą najwyższego boxa po ≥ 2 rosnących boxach),
     🔵 GOTOWE (≥ 2 rosnące boxy, cena w najwyższym — zlecenie kupna stop nad górą + stop loss 10 %) oraz,
     gdy jest GIST_TOKEN, 🔴 SPRZEDAJ / poza boxem dla Twoich pozycji (💼 Pozycje z synchronizacji),
  3. dla NOWYCH sygnałów (wcześniej niezgłoszonych) dopisuje komentarz w Issue "📦 Darvas — sygnały" z wzmianką właściciela repo
     (GitHub wysyła e-mail i powiadomienie push w aplikacji GitHub Mobile). Stan „co już zgłoszono” trzyma ukryty komentarz w treści Issue.
Wymaga tylko GITHUB_TOKEN (bez niego wypisuje sygnały na ekran). Informacja pomocnicza, nie rekomendacja.
"""
import datetime
import json
import os
import re
import sys
import urllib.error

from alerts_notify import api, read_gist

DATA_FILES = [os.path.join("docs", "data", "watchlist.json"), os.path.join("docs", "data", "watchlists.json")]
ISSUE_TITLE = "📦 Darvas — sygnały"
STATE_RE = re.compile(r"<!-- darvas-state: ([^>]*) -->")
STOP_PCT = 10
MAX_LINES = 60


def load_stocks(paths=DATA_FILES):
    """Spółki z plików danych; przy powtórce tickera zostaje wpis z nowszą sesją (as_of)."""
    out = {}
    for p in paths:
        try:
            with open(p, encoding="utf-8") as f:
                stocks = json.load(f).get("stocks") or []
        except (OSError, ValueError):
            continue
        for s in stocks:
            t = s.get("ticker")
            if t and (t not in out or (s.get("as_of") or "") > (out[t].get("as_of") or "")):
                out[t] = s
    return out


def open_positions(prefs):
    """Tickery z otwartą pozycją z prefs.pos synchronizacji ({T: {v: {entry, stop, shares} | null, t}})."""
    pos = (prefs or {}).get("pos") or {}
    return {t for t, rec in pos.items() if isinstance(rec, dict) and isinstance(rec.get("v"), dict) and rec["v"].get("entry")}


def signals(stocks, positions=()):
    """Bieżące sygnały jak w 📋 Planie na tydzień: [{key, ticker, kind: buy|ready|sell, ...}].
    Kupno (KUP / GOTOWE, ≥ 2 rosnące boxy) tylko przy tygodniowym MACD nad sygnałem i bez otwartej pozycji;
    sprzedaż = Twoja pozycja z tygodniowym MACD pod sygnałem (wyjście z backtestu). Klucz kupna zawiera górę boxa, więc wyższy box zgłasza się ponownie."""
    out = []
    for t, s in sorted(stocks.items()):
        st, n, top = s.get("dv_state"), s.get("dv_n") or 0, s.get("dv_top")
        if t in positions:
            if s.get("macd_w_above") is False:
                out.append({"key": f"{t}:MACD", "ticker": t, "kind": "sell", "price": s.get("price")})
            continue
        if top is None or s.get("macd_w_above") is False:
            continue
        if st == "BUY" and n >= 2:
            entry = s.get("price") or top
            out.append({"key": f"{t}:BUY:{top}", "ticker": t, "kind": "buy", "entry": entry, "stop": round(entry * (1 - STOP_PCT / 100), 2), "n": n, "top": top})
        elif st == "READY" and n >= 2:
            out.append({"key": f"{t}:READY:{top}", "ticker": t, "kind": "ready", "entry": top, "stop": round(top * (1 - STOP_PCT / 100), 2), "n": n, "top": top, "dist": s.get("dv_dist")})
    order = {"buy": 0, "ready": 1, "sell": 2}
    return sorted(out, key=lambda x: (order[x["kind"]], x.get("dist") if x.get("dist") is not None else 999, x["ticker"]))


def parse_state(body):
    m = STATE_RE.search(body or "")
    return {x for x in (m.group(1).split(",") if m else []) if x}


def render_state(keys):
    return "<!-- darvas-state: " + ",".join(sorted(keys)) + " -->"


def format_message(sigs, owner=None, as_of=None):
    groups = [
        ("buy", "🟢 **Kup** — dzisiejsze zamknięcie nad górą najwyższego boxa (po ≥ 2 rosnących boxach):",
         lambda s: f"- **{s['ticker']}** wejście ~{s['entry']:.2f}, stop loss {s['stop']:.2f} ({s['n']} boxy ↑)"),
        ("ready", "🔵 **Gotowe do kupna** — zlecenie kupna stop nad górą boxa + stop loss 10 %:",
         lambda s: f"- **{s['ticker']}** kup stop {s['entry']:.2f}, stop loss {s['stop']:.2f}" + (f" (+{s['dist']:.1f} %)" if s.get("dist") is not None else "") + f", {s['n']} boxy ↑"),
        ("sell", "🔴 **Sprzedaj** — tygodniowy MACD Twojej pozycji spadł pod linię sygnału (zlecenie sprzedaży na poniedziałek):",
         lambda s: f"- **{s['ticker']}**" + (f" (cena {s['price']:.2f})" if s.get("price") is not None else "")),
    ]
    parts, n = [], 0
    for kind, head, fmt in groups:
        items = [s for s in sigs if s["kind"] == kind]
        if not items:
            continue
        lines = [fmt(s) for s in items[: max(0, MAX_LINES - n)]]
        n += len(lines)
        more = f"\n- … i {len(items) - len(lines)} więcej (zobacz 📋 Plan w aplikacji)" if len(lines) < len(items) else ""
        parts.append(head + "\n" + "\n".join(lines) + more)
    head = (f"@{owner} " if owner else "") + f"nowe sygnały Dar-Card{f' (sesja {as_of})' if as_of else ''}:"
    return head + "\n\n" + "\n\n".join(parts)


def find_or_create_issue(repo, gh_token):
    issues = api("GET", f"https://api.github.com/repos/{repo}/issues?state=open&per_page=100", gh_token)
    for it in issues:
        if "pull_request" not in it and it.get("title") == ISSUE_TITLE:
            return it
    body = ("Ten wątek prowadzi skrypt `darvas_notify.py` (dzienny workflow i „Watchlisty”). Każdy nowy komentarz = nowe sygnały karty Darvasa: "
            "KUP, GOTOWE (zlecenie kupna stop) i SPRZEDAJ dla Twoich pozycji. Zamknij ten Issue, żeby przestać dostawać powiadomienia — skrypt założy nowy przy następnym sygnale.\n\n"
            + render_state(set()))
    return api("POST", f"https://api.github.com/repos/{repo}/issues", gh_token, {"title": ISSUE_TITLE, "body": body})


def main():
    stocks = load_stocks()
    as_of = max((s.get("as_of") or "" for s in stocks.values()), default="") or None
    # Rytm tygodniowy (📋 Plan na tydzień): z harmonogramu powiadamiamy tylko po sesji piątkowej; ręczne uruchomienie zawsze.
    if os.environ.get("DARVAS_WEEKLY") == "1" and as_of and datetime.date.fromisoformat(as_of[:10]).weekday() != 4:
        print(f"Sesja {as_of} to nie piątek — powiadomienia Darvasa tylko raz w tygodniu (po piątkowej sesji).")
        return 0
    positions = set()
    gist_token = os.environ.get("GIST_TOKEN", "").strip()
    if gist_token:
        try:
            positions = open_positions((read_gist(gist_token) or {}).get("prefs"))
        except (urllib.error.URLError, OSError, ValueError) as e:
            print(f"⚠️  Pozycje z Gista niedostępne ({e}) — bez sygnałów sprzedaży.")
    current = signals(stocks, positions)
    print(f"Sygnały Darvasa: {len(current)} (KUP {sum(s['kind'] == 'buy' for s in current)}, GOTOWE {sum(s['kind'] == 'ready' for s in current)}, SPRZEDAJ {sum(s['kind'] == 'sell' for s in current)})")
    repo, gh_token = os.environ.get("GITHUB_REPOSITORY", ""), os.environ.get("GITHUB_TOKEN", "")
    if not repo or not gh_token:
        print(format_message(current, None, as_of) if current else "Brak sygnałów.")
        return 0
    issue = find_or_create_issue(repo, gh_token)
    known = parse_state(issue.get("body"))
    fresh = [s for s in current if s["key"] not in known]
    keys = {s["key"] for s in current}   # sygnał, który zniknął, wypada ze stanu i może zadzwonić ponownie
    if fresh:
        api("POST", f"https://api.github.com/repos/{repo}/issues/{issue['number']}/comments", gh_token,
            {"body": format_message(fresh, repo.split("/")[0], as_of)})
        print(f"Zgłoszono {len(fresh)} nowych sygnałów w Issue #{issue['number']}.")
    if keys != known:
        body = issue.get("body") or ""
        body = STATE_RE.sub(render_state(keys), body) if STATE_RE.search(body) else body + "\n\n" + render_state(keys)
        api("PATCH", f"https://api.github.com/repos/{repo}/issues/{issue['number']}", gh_token, {"body": body})
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (urllib.error.URLError, OSError, ValueError) as e:   # powiadomienia nie mogą psuć odświeżenia danych
        print(f"⚠️  Powiadomienia Darvasa nie powiodły się: {e}")
        sys.exit(0)
