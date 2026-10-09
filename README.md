# Momentum — dzienny watchlist

Prosta lista obserwowana do przeglądania (strona statyczna na GitHub Pages):

- **Finviz** filtruje spółki: cena > 1 $, cena nad SMA50 i SMA200 (bez filtra kapitalizacji), stabilny wzrost EPS i dodatnie
  prognozy EPS (filtry w `finviz_screen.json`).
- **yfinance** dostarcza ceny; `watchlist.py` liczy RS Rating (jak IBD), dane do filtra Qullamaggiego
  (obrót, ADR%, top % wzrostu z okien 1/3/6M).
- Dane odświeżają się **raz w tygodniu, w sobotę rano** (workflow `Weekly Watchlist Refresh`); ręcznie: Actions → *Run workflow*
  albo lokalnie `python watchlist.py`.

Szczegóły techniczne: `CLAUDE.md`. Informacja do przeglądania, nie rekomendacja inwestycyjna.
