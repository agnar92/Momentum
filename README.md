# Momentum — dzienny watchlist

Prosta lista obserwowana do przeglądania (strona statyczna na GitHub Pages):

- **Finviz** filtruje spółki pod CANSLIM (EPS i sprzedaż kwartalna ≥ 25 %, EPS roczny ≥ 25 %, ROE ≥ 15 %, kapitalizacja od 300 mln,
  średni wolumen > 300 tys., cena > 10 $; filtry w `finviz_screen.json`). To jedyna lista — resztę liczy aplikacja.
- **yfinance** dostarcza ceny; `watchlist.py` liczy RS Rating (jak IBD), bazy, dane do zakładki Qullamaggie
  (obrót, ADR %, top % wzrostu z okien 1/3/6M).
- Dane odświeżają się **raz w tygodniu, w sobotę rano** (workflow `Weekly Watchlist Refresh`); ręcznie: Actions → *Run workflow*
  albo lokalnie `python watchlist.py`.

Szczegóły techniczne: `CLAUDE.md`. Informacja do przeglądania, nie rekomendacja inwestycyjna.
