"""Pobieranie wstępnej listy spółek z darmowego screenera Finviz.

Finviz robi tu tylko WSTĘPNĄ filtrację (kapitalizacja, cena nad SMA200, wzrost EPS...),
żeby nie pobierać z Yahoo cen całego Nasdaq Composite — resztę (RS Rating, filtr w stylu
Qullamaggie) liczy już nasz pipeline na tej krótszej liście. Wynik trafia do
FINVIZ_holdings.json (ten sam format co WIG20_holdings.json: lista tickerów + sektor),
który fetch_data.py wczytuje jako uniwersum "FINVIZ".

Konfiguracja: finviz_screen.json (pole "filters" = kody filtrów z adresu screenera, np.
"cap_midover,ta_sma200_pa"). UWAGA: Finviz po cichu IGNORUJE nieznany kod filtra (zamiast
zwrócić błąd), więc literówka daje szerszą listę — sprawdź liczbę wyników po zmianie.

Gdy Finviz jest niedostępny/blokuje zapytanie (np. adresy IP CI), zostaje poprzedni
FINVIZ_holdings.json — pipeline nigdy nie przerywa się przez ten krok.
"""
import json
import re
import time
from datetime import date
from pathlib import Path

import requests
from lxml import html as lxml_html

ROOT = Path(__file__).resolve().parent
CONFIG_PATH = ROOT / "finviz_screen.json"
HOLDINGS_PATH = ROOT / "FINVIZ_holdings.json"

DEFAULT_FILTERS = "cap_midover,ta_sma200_pa,fa_eps5years_pos,fa_epsyoy_pos"
DEFAULT_MAX_TICKERS = 1500
MIN_TICKERS = 30  # poniżej tego uznajemy odpowiedź za błędną (blokada/zmiana układu strony)
PAGE_SIZE = 20    # darmowy Finviz zwraca 20 wierszy na stronę
BASE_URL = "https://finviz.com/screener.ashx"
HEADERS = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
                         "Chrome/124.0 Safari/537.36"}


def parse_screener_page(page_html):
    """-> (lista {"ticker","sector"}, łączna liczba wyników wg strony lub None)."""
    total_match = re.search(r"#\d+\s*/\s*(\d+)\s*Total", page_html)
    total = int(total_match.group(1)) if total_match else None
    tree = lxml_html.fromstring(page_html)
    rows = []
    for tr in tree.xpath('//tr[contains(@class, "styled-row")]'):
        tds = tr.xpath("./td")
        if len(tds) < 4:
            continue
        ticker = (tds[1].get("data-boxover-ticker") or "").strip()
        if not ticker:
            continue
        rows.append({"ticker": ticker, "sector": tds[3].text_content().strip() or "Unknown"})
    return rows, total


def fetch_screener(filters, max_tickers=DEFAULT_MAX_TICKERS, pause_s=1.0, session=None):
    """Pobiera kolejne strony screenera (po 20 wierszy) aż do końca listy albo max_tickers."""
    session = session or requests.Session()
    out, seen = [], set()
    offset = 1
    total = None
    while len(out) < max_tickers:
        resp = session.get(BASE_URL, params={"v": "111", "f": filters, "r": offset},
                           headers=HEADERS, timeout=30)
        resp.raise_for_status()
        rows, page_total = parse_screener_page(resp.text)
        total = page_total if page_total is not None else total
        new = [r for r in rows if r["ticker"] not in seen]
        if not new:
            break
        for r in new:
            seen.add(r["ticker"])
            out.append(r)
        offset += PAGE_SIZE
        if total is not None and offset > total:
            break
        time.sleep(pause_s)
    return out[:max_tickers], total


def load_config(path=CONFIG_PATH):
    try:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
    except (FileNotFoundError, ValueError):
        data = {}
    return {
        "filters": str(data.get("filters") or DEFAULT_FILTERS).strip(),
        "max_tickers": int(data.get("max_tickers") or DEFAULT_MAX_TICKERS),
    }


def refresh_holdings(config_path=CONFIG_PATH, holdings_path=HOLDINGS_PATH):
    """Odświeża FINVIZ_holdings.json ze screenera. Zwraca True, gdy zapisano świeżą listę;
    False (bez rzucania wyjątku), gdy zostaje poprzednia."""
    cfg = load_config(config_path)
    try:
        rows, total = fetch_screener(cfg["filters"], cfg["max_tickers"])
    except Exception as e:
        print(f"⚠️  Finviz niedostępny ({e}) — zostaje poprzedni {Path(holdings_path).name}.")
        return False
    if len(rows) < MIN_TICKERS:
        print(f"⚠️  Finviz zwrócił tylko {len(rows)} spółek (<{MIN_TICKERS}) — wygląda na blokadę/"
              f"zmianę układu strony, zostaje poprzedni {Path(holdings_path).name}.")
        return False
    payload = {
        "_instructions": "Generowane automatycznie przez finviz.py (fetch_data.py) wg finviz_screen.json "
                         "— nie edytuj ręcznie, zmieniaj filtry w finviz_screen.json.",
        "as_of": date.today().isoformat(),
        "filters": cfg["filters"],
        "finviz_total": total,
        "tickers": rows,
    }
    Path(holdings_path).write_text(json.dumps(payload, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"✅ Finviz ({cfg['filters']}): {len(rows)} spółek zapisano do {Path(holdings_path).name}.")
    return True
