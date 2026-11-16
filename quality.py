"""Ranking jakości (długoterminowy, raz w roku) -> docs/data/quality.json. Uruchamiany ręcznie albo raz w roku przez workflow „Quality Yearly”.

Sito: Finviz (filtry z finviz_screen.json `quality_filters` albo momentum.quality.QUALITY_FILTERS), widoki 111 (sektor), 121 (wycena),
161 (finanse). Historia roczna: SEC companyfacts (10 lat 10-K). Ranking i top 10: momentum/quality.py."""
import argparse
import datetime as dt
import json
import os
import re
import sys
import time

from momentum import quality, sec
from momentum.finviz import HEADERS, PAGE, URL

OUT = os.path.join("docs", "data", "quality.json")
CONFIG = "finviz_screen.json"
VIEWS = ("111", "121", "161")
MAX_PAGES = 50


def ssr_rows(page):
    """Strona screenera Finviz (układ JSON) -> ([{ticker, text..., liczby...}], łączna liczba)."""
    m = re.search(r'<script type="application/json" data-ssr-props="[^"]*">(.*?)</script>', page, re.S)
    if not m:
        return [], None
    data = json.loads(m.group(1)).get("data") or {}
    rows = [{**(r.get("text") or {}), **(r.get("numbers") or {})} for r in data.get("rows") or []]
    return [r for r in rows if r.get("ticker")], data.get("totalCount")


def finviz_screen(filters, log=print, get=None, pause=0.7):
    """Wszystkie strony sita w widokach 111 / 121 / 161, złączone po tickerze -> ({ticker: wiersz}, łączna liczba)."""
    import requests
    get = get or requests.Session().get
    out, total = {}, None
    for v in VIEWS:
        offset = 1
        for _ in range(MAX_PAGES):
            r = get(URL, params={"v": v, "f": filters, "r": offset}, headers=HEADERS, timeout=30)
            r.raise_for_status()
            rows, t = ssr_rows(r.text)
            total = t if t is not None else total
            for x in rows:
                out.setdefault(x["ticker"], {}).update({k: val for k, val in x.items() if val is not None})
            offset += PAGE
            if not rows or (total is not None and offset > total):
                break
            time.sleep(pause)
        log(f"Finviz widok {v}: {len(out)} spółek (wg Finviz {total})")
    return out, total


def build(fv, hists, filters, total, today):
    rows, skipped = [], []
    for t, x in sorted(fv.items()):
        base = dict(t=t, n=(x.get("company") or "")[:48], sector=x.get("sector"), industry=x.get("industry"))
        if x.get("sector") in quality.EXCLUDED_SECTORS:
            skipped.append(dict(base, why="sektor finansowy / REIT"))
            continue
        h = hists.get(t) or []
        s = quality.summary(h, today)
        if s is None:
            why = ("brak danych SEC" if not h else f"stare dane SEC (ostatni rok {h[-1]['y']})" if not quality.fresh(h, today)
                   else f"za mało danych SEC ({len(h)} lat)")
            skipped.append(dict(base, why=why))
            continue
        hist = [{k: (round(v, 4) if isinstance(v, float) and k not in ("rev", "fcf", "ni", "sh") else v)
                 for k, v in y.items() if k != "end"} for y in h]
        row = dict(base, **quality.finviz_metrics(x), **s, hist=hist)
        row["auto"] = quality.auto_checks(row)
        row["exp_ret"] = row["auto"]["q4"]["er"]
        rows.append(row)
    quality.score(rows)
    top = quality.pick_top(rows)
    weights = [dict(k=k, b=b, w=w, d=d) for k, b, w, d in quality.WEIGHTS]
    return dict(generated_at=today.isoformat(), filters=filters, finviz_total=total, n=len(rows), top=top, weights=weights,
                blocks=quality.BLOCKS, rules=dict(years=quality.YEARS, min_years=quality.MIN_YEARS, roic_hit=quality.ROIC_HIT,
                                                   top=quality.TOP, sector_cap=quality.SECTOR_CAP),
                rows=rows, skipped=skipped)


GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent"
GEMINI_MODEL = "gemini-2.5-flash"
AI_TOP = 30           # podpowiedź AI dla pierwszych N spółek rankingu (darmowy limit Gemini to kilkaset zapytań dziennie)
AI_FRESH_DAYS = 300   # starszą podpowiedź pytamy od nowa (ranking jest roczny)


def gemini(prompt, key, model=GEMINI_MODEL, post=None, tries=4, wait=20):
    """Jedno zapytanie do Gemini API (klucz z Google AI Studio, darmowy limit) -> tekst odpowiedzi. 429 / 5xx -> ponowienie po przerwie."""
    import requests
    post = post or requests.post
    body = {"contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"temperature": 0.2, "responseMimeType": "application/json"}}
    for n in range(tries):
        r = post(GEMINI_URL.format(model), headers={"x-goog-api-key": key}, json=body, timeout=90)
        if r.status_code in (429, 500, 503) and n + 1 < tries:
            time.sleep(wait * (n + 1))
            continue
        r.raise_for_status()
        return r.json()["candidates"][0]["content"]["parts"][0]["text"]


def annotate_ai(out, key, old=None, top=AI_TOP, model=GEMINI_MODEL, ask=None, log=print, pause=7, today=None):
    """Dopisuje `ai` (parse_ai + at, model) do pierwszych `top` wierszy rankingu. Świeżą podpowiedź z poprzedniego pliku przepisuje
    bez pytania. Błąd jednej spółki nie przerywa. -> liczba nowych odpowiedzi."""
    today = today or dt.date.today()
    prev = {r["t"]: r["ai"] for r in (old or {}).get("rows", []) if r.get("ai")}
    ask = ask or (lambda p: gemini(p, key, model))
    n = 0
    for r in out["rows"][:top]:
        p = prev.get(r["t"])
        if p and (today - dt.date.fromisoformat(p["at"])).days < AI_FRESH_DAYS:
            r["ai"] = p
            continue
        try:
            r["ai"] = dict(quality.parse_ai(ask(quality.ai_prompt(r))), at=today.isoformat(), model=model)
            n += 1
            log(f"AI: {r['t']} — fosa {r['ai']['fosa']}, zarząd {r['ai']['zarzad']}")
        except Exception as e:      # brak podpowiedzi to nie błąd rankingu
            log(f"AI: {r['t']} — {e}")
        time.sleep(pause)
    out["ai_model"] = model
    return n


def sec_histories(tickers, ua, log=print, pause=0.15):
    ciks = sec.cik_map(ua)
    out = {}
    for n, t in enumerate(tickers, 1):
        cik = ciks.get(t.upper()) or ciks.get(t.upper().replace("-", "."))
        if cik is None:
            log(f"SEC: {t} — brak CIK")
            continue
        try:
            out[t] = quality.history(sec._get(sec.FACTS_URL.format(cik), ua)["facts"])
        except Exception as e:      # jedna spółka bez danych nie przerywa
            log(f"SEC: {t} — {e}")
        if n % 25 == 0 or n == len(tickers):
            log(f"SEC (historia 10 lat): {n}/{len(tickers)}")
        time.sleep(pause)
    return out


def _write(path, out):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--out", default=OUT)
    ap.add_argument("--filters", help="filtry Finviz (domyślnie z finviz_screen.json `quality_filters`)")
    ap.add_argument("--ai", type=int, default=AI_TOP, help="podpowiedź AI dla N pierwszych spółek (wymaga GEMINI_API_KEY; 0 = bez AI)")
    ap.add_argument("--ai-only", action="store_true", help="tylko dopisz podpowiedzi AI do istniejącego pliku, bez Finviz i SEC")
    a = ap.parse_args(argv)
    key, model = os.environ.get("GEMINI_API_KEY"), os.environ.get("GEMINI_MODEL") or GEMINI_MODEL
    old = json.load(open(a.out, encoding="utf-8")) if os.path.exists(a.out) else None
    if a.ai_only:
        if not key or not old:
            print("--ai-only wymaga GEMINI_API_KEY i istniejącego pliku rankingu.")
            return 1
        print(f"AI: {annotate_ai(old, key, old, a.ai, model)} nowych podpowiedzi")
        _write(a.out, old)
        return 0
    cfg = json.load(open(CONFIG, encoding="utf-8")) if os.path.exists(CONFIG) else {}
    filters = a.filters or cfg.get("quality_filters") or quality.QUALITY_FILTERS
    ua = os.environ.get("SEC_UA") or cfg.get("sec_ua") or sec.UA
    fv, total = finviz_screen(filters)
    if not fv or (total and len(fv) < 0.9 * total):
        print(f"Finviz zwrócił {len(fv)} z {total} spółek — nic nie zapisuję.")
        return 1
    todo = [t for t, x in fv.items() if x.get("sector") not in quality.EXCLUDED_SECTORS]
    hists = sec_histories(todo, ua)
    if len(hists) < 0.7 * len(todo):
        print(f"Za mało danych SEC: {len(hists)}/{len(todo)} — nic nie zapisuję.")
        return 1
    out = build(fv, hists, filters, total, dt.date.today())
    if key and a.ai > 0:
        print(f"AI: {annotate_ai(out, key, old, a.ai, model)} nowych podpowiedzi ({model})")
    else:
        print("AI: brak GEMINI_API_KEY — ranking bez podpowiedzi AI.")
    _write(a.out, out)
    print(f"Ranking: {out['n']} spółek z oceną, {len(out['skipped'])} pominiętych; top {len(out['top'])}: {', '.join(out['top'])}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
