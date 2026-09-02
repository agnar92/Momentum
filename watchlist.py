"""
watchlist.py
============
Wspólny, ręcznie utrzymywany plik watchlisty (WATCHLIST_FILE) do CODZIENNEGO
śledzenia RLC (Red Line Count, dr Eric Wish — patrz run_query.py::RLC_EMA_DAYS)
dla małej listy spółek, które faktycznie trzymasz. Backend NIE MA wglądu w
Twoje realne holdingi z rebalance.html — ta strona trzyma je WYŁĄCZNIE w
localStorage przeglądarki, nic nie wraca do repo (patrz CLAUDE.md) — więc tę
listę synchronizujesz ręcznie, dokładnie tak jak WIG20_holdings.json/
MWIG40_holdings.json, gdy zmieniasz pozycje.

Dlaczego osobny, dzielony moduł zamiast trzymać to w jednym z dwóch skryptów:
fetch_data.py potrzebuje samych tickerów (+ ewentualne mapowanie na symbol
yfinance), run_query.py dodatkowo waluty do formatowania cen w eksporcie —
oba czytają ten sam plik. To czysty parser configu (bez sieci, bez liczenia),
więc dzielenie go między "fetch_data.py = tylko pobieranie" i "run_query.py =
tylko liczenie" nie łamie tego podziału ról udokumentowanego w CLAUDE.md.

Format WATCHLIST_FILE (wzorowany na WIG20_holdings.json): obiekt z kluczem
"tickers" — lista, każdy element albo sam ticker jako string (np. "AAPL"),
albo obiekt {"ticker": "PKN", "yf_symbol": "PKN.WA", "currency": "PLN"}.
- "ticker" (wymagany) — pod tą nazwą pozycja trafia do `prices.Ticker` i jest
  widoczna wszędzie w kodzie/eksporcie.
- "yf_symbol" (opcjonalny) — symbol, pod jakim yfinance faktycznie zna tę
  spółkę, gdy różni się od "ticker" (np. spółki GPW wymagają sufiksu ".WA",
  tak jak WIG20/mWIG40 — patrz fetch_data.py::GPW_TICKERS). Bez tego pola
  używany jest sam "ticker".
- "currency" (opcjonalny, domyślnie "USD") — do formatowania ceny w eksporcie
  (analogicznie do PLN_UNIVERSES we frontendzie dla WIG20/mWIG40).

Akceptowana jest też goła lista JSON zamiast obiektu z kluczem "tickers"
(tak jak w _load_json_constituents w fetch_data.py).
"""
import json

WATCHLIST_FILE = "watchlist.json"


def load_watchlist_entries():
    """Zwraca listę znormalizowanych wpisów [{"ticker", "yf_symbol", "currency"}, ...],
    zduplikowane tickery odfiltrowane (pierwsze wystąpienie wygrywa). Brakujący,
    pusty albo źle sformatowany plik → pusta lista — watchlista jest w pełni
    opcjonalną funkcją, jej brak nie może wywalać żadnego z dwóch pipeline'ów."""
    try:
        with open(WATCHLIST_FILE, encoding="utf-8") as f:
            data = json.load(f)
    except FileNotFoundError:
        return []
    except Exception as e:
        print(f"❌ Błąd podczas odczytu {WATCHLIST_FILE}: {e}")
        return []

    raw_entries = data.get("tickers", []) if isinstance(data, dict) else data
    entries = []
    seen = set()
    for entry in raw_entries:
        if isinstance(entry, str):
            ticker, yf_symbol, currency = entry.strip(), "", "USD"
        elif isinstance(entry, dict):
            ticker = str(entry.get("ticker", "")).strip()
            yf_symbol = str(entry.get("yf_symbol") or "").strip()
            currency = str(entry.get("currency") or "USD").strip().upper()
        else:
            continue
        if not ticker or ticker in seen:
            continue
        seen.add(ticker)
        entries.append({"ticker": ticker, "yf_symbol": yf_symbol or ticker, "currency": currency})
    return entries
