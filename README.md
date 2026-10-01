# Momentum — dzienny watchlist

Prosta lista obserwowana do przeglądania (strona statyczna na GitHub Pages):

- **Finviz** filtruje spółki: kapitalizacja ≥ 2 mld $, cena nad SMA50 i SMA200, stabilny wzrost EPS i dodatnie
  prognozy EPS (filtry w `finviz_screen.json`).
- **yfinance** dostarcza ceny; `watchlist.py` liczy RS Rating (jak IBD), dane do filtra Qullamaggiego
  (obrót, ADR%, top % wzrostu z okien 1/3/6M) i osobny filtr trendu EMA34.
- Dane odświeżają się **codziennie rano** (workflow `Daily Watchlist Refresh`); ręcznie: Actions → *Run workflow*
  albo lokalnie `python watchlist.py`.

Szczegóły techniczne: `CLAUDE.md`. Informacja do przeglądania, nie rekomendacja inwestycyjna.
