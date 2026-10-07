"""Powiadomienia o alertach na liniach (opcjonalny krok dziennego workflow).

Alerty (linia + kierunek "nad/pod") żyją w przeglądarce i są synchronizowane do prywatnego Gista (docs/js/sync.js). Strona sama
nie wyśle powiadomienia, więc po codziennym odświeżeniu danych ten skrypt:
  1. czyta z Gista linie z alertem (plik momentum-annotations.json) — wymaga sekretu GIST_TOKEN (token z uprawnieniem "gist"),
  2. liczy wartość każdej linii na dzień ostatniej sesji (ta sama matematyka co lineValueAt w annotate.js) i porównuje z ceną
     z docs/data/watchlist.json,
  3. dla NOWYCH przebić (jeszcze nie zatwierdzonych w aplikacji przyciskiem OK i niezgłoszonych wcześniej) dopisuje komentarz
     w Issue "🔔 Alerty Watchlist" z wzmianką właściciela repo — GitHub wysyła wtedy e-mail i powiadomienie push
     (aplikacja GitHub Mobile). Stan "co już zgłoszono" trzyma ukryty komentarz HTML w treści Issue.
Bez GIST_TOKEN skrypt nic nie robi (kod wyjścia 0). Informacja pomocnicza, nie rekomendacja.
"""
import json
import os
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone

WATCHLIST_PATH = os.path.join("docs", "data", "watchlist.json")
WATCHLIST_QM_PATH = os.path.join("docs", "data", "watchlist_qm.json")   # lista Qullamaggiego (ręczna) — spółki spoza listy CANSLIM
GIST_FILE = "momentum-annotations.json"
ISSUE_TITLE = "🔔 Alerty Watchlist"
STATE_RE = re.compile(r"<!-- alert-state: ([^>]*) -->")
KIND_LABELS = {"res": "opór", "sup": "wsparcie", "free": "linia", "stop": "STOP", "target": "CEL"}


# ---------- matematyka linii (port z docs/js/annotate.js) ----------

def biz_index(date_str):
    """Numer dnia handlowego: pn-pt = kolejne liczby, weekend leży ułamkowo między piątkiem a poniedziałkiem."""
    d = datetime.strptime(date_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    m = int(d.timestamp() // 86400) - 4          # dni od poniedziałku 1970-01-05
    w, r = divmod(m, 7)
    return w * 5 + (r if r <= 4 else 4 + (r - 4) / 3)


def line_value_at(line, date_str):
    t0, t1, t = biz_index(line["x0"]), biz_index(line["x1"]), biz_index(date_str)
    if not t1 > t0:
        return line["y0"]
    f = (t - t0) / (t1 - t0)
    y0, y1 = line["y0"], line["y1"]
    if line.get("log") and y0 > 0 and y1 > 0:
        import math
        return math.exp(math.log(y0) + (math.log(y1) - math.log(y0)) * f)
    return y0 + (y1 - y0) * f


def alert_state(line, price, as_of):
    """{value, dist, triggered} — triggered: cena po "złej" stronie linii (nad dla "above", pod dla "below")."""
    if price is None:
        return None
    value = line_value_at(line, as_of)
    if not value or value <= 0:
        return None
    direction = line.get("alert")
    triggered = price > value if direction == "above" else price < value if direction == "below" else False
    return {"value": value, "dist": (price / value - 1) * 100, "triggered": triggered}


def triggered_alerts(annotations, stocks):
    """Przebite i niezatwierdzone alerty: lista słowników (ticker, id, kind, direction, value, price, dist, as_of)."""
    by_ticker = {s["ticker"]: s for s in stocks}
    out = []
    for ticker, rec in sorted((annotations or {}).items()):
        stock = by_ticker.get(ticker)
        if not stock or not isinstance(rec, dict):
            continue
        for line in rec.get("lines") or []:
            if line.get("alert") not in ("above", "below") or line.get("ack"):
                continue
            try:
                st = alert_state(line, stock.get("price"), stock.get("as_of"))
            except (KeyError, ValueError, TypeError):
                continue
            if st and st["triggered"]:
                out.append({"ticker": ticker, "id": line["id"], "kind": line.get("kind", "free"), "direction": line["alert"],
                            "value": st["value"], "price": stock["price"], "dist": st["dist"], "as_of": stock.get("as_of")})
    return out


# ---------- stan "co już zgłoszono" i treść wiadomości ----------

def parse_state(body):
    m = STATE_RE.search(body or "")
    return {x for x in (m.group(1).split(",") if m else []) if x}


def render_state(ids):
    return "<!-- alert-state: " + ",".join(sorted(ids)) + " -->"


def new_alerts(current, known_ids):
    return [a for a in current if a["id"] not in known_ids]


def format_message(alerts, owner=None):
    lines = []
    for a in alerts:
        label = KIND_LABELS.get(a["kind"], "linia")
        icon = "🛑" if a["kind"] == "stop" else "🎯" if a["kind"] == "target" else "🔔"
        side = "nad" if a["direction"] == "above" else "pod"
        lines.append(f"- {icon} **{a['ticker']}**: cena {a['price']:.2f} {side} linią ({label}) {a['value']:.2f} ({a['dist']:+.1f}%), sesja {a['as_of']}")
    head = (f"@{owner} " if owner else "") + "nowe przebicia na Twoich liniach:"
    return head + "\n\n" + "\n".join(lines) + "\n\nOtwórz stronę → zakładka 🔔 Alerty, kliknij OK, gdy przeczytasz."


# ---------- GitHub API (urllib; bez zależności) ----------

def api(method, url, token, body=None):
    req = urllib.request.Request(url, method=method, data=json.dumps(body).encode() if body is not None else None, headers={
        "Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json", "User-Agent": "momentum-alerts",
        **({"Content-Type": "application/json"} if body is not None else {})})
    with urllib.request.urlopen(req, timeout=30) as resp:
        raw = resp.read()
    return json.loads(raw) if raw else None


def read_annotations(gist_token):
    for page in range(1, 6):
        gists = api("GET", f"https://api.github.com/gists?per_page=100&page={page}", gist_token)
        for g in gists:
            f = (g.get("files") or {}).get(GIST_FILE)
            if f:
                if f.get("truncated"):
                    with urllib.request.urlopen(f["raw_url"], timeout=30) as r:
                        text = r.read().decode()
                else:
                    text = f.get("content") or "{}"
                data = json.loads(text or "{}")
                return data.get("annotations") or {}
        if len(gists) < 100:
            break
    return None


def find_or_create_issue(repo, gh_token):
    issues = api("GET", f"https://api.github.com/repos/{repo}/issues?state=open&per_page=100", gh_token)
    for it in issues:
        if "pull_request" not in it and it.get("title") == ISSUE_TITLE:
            return it
    body = ("Ten wątek prowadzi skrypt `alerts_notify.py` (dzienny workflow). Każdy nowy komentarz = nowe przebicie Twojej linii z alertem. "
            "Aby wyłączyć, usuń sekret `GIST_TOKEN` z ustawień repozytorium.\n\n" + render_state(set()))
    return api("POST", f"https://api.github.com/repos/{repo}/issues", gh_token, {"title": ISSUE_TITLE, "body": body})


def main():
    gist_token = os.environ.get("GIST_TOKEN", "").strip()
    if not gist_token:
        print("ℹ️  Brak sekretu GIST_TOKEN — powiadomienia o alertach pominięte.")
        return 0
    with open(WATCHLIST_PATH, encoding="utf-8") as f:
        stocks = json.load(f).get("stocks", [])
    try:
        with open(WATCHLIST_QM_PATH, encoding="utf-8") as f:
            known = {s["ticker"] for s in stocks}
            stocks += [s for s in json.load(f).get("stocks", []) if s["ticker"] not in known]
    except (OSError, ValueError):
        pass
    annotations = read_annotations(gist_token)
    if annotations is None:
        print("⚠️  Nie znaleziono Gista z adnotacjami (plik " + GIST_FILE + ") — włącz synchronizację w aplikacji.")
        return 0
    current = triggered_alerts(annotations, stocks)
    print(f"Przebite, niezatwierdzone alerty: {len(current)}")
    repo, gh_token = os.environ.get("GITHUB_REPOSITORY", ""), os.environ.get("GITHUB_TOKEN", "")
    if not repo or not gh_token:
        print(format_message(current, None) if current else "Brak alertów.")
        return 0
    issue = find_or_create_issue(repo, gh_token)
    known = parse_state(issue.get("body"))
    fresh = new_alerts(current, known)
    state_ids = {a["id"] for a in current}   # alert, który przestał być przebity, wypada ze stanu i może zadzwonić ponownie
    if fresh:
        api("POST", f"https://api.github.com/repos/{repo}/issues/{issue['number']}/comments", gh_token,
            {"body": format_message(fresh, repo.split("/")[0])})
        print(f"Zgłoszono {len(fresh)} nowych alertów w Issue #{issue['number']}.")
    if state_ids != known:
        body = STATE_RE.sub(render_state(state_ids), issue.get("body") or "") if STATE_RE.search(issue.get("body") or "") else (issue.get("body") or "") + "\n\n" + render_state(state_ids)
        api("PATCH", f"https://api.github.com/repos/{repo}/issues/{issue['number']}", gh_token, {"body": body})
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (urllib.error.URLError, OSError, ValueError) as e:   # powiadomienia nie mogą psuć dziennego odświeżenia
        print(f"⚠️  Powiadomienia o alertach nie powiodły się: {e}")
        sys.exit(0)
