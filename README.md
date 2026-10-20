# Momentum

Statyczna strona (GitHub Pages, `docs/`) z **jedną strategią** — ta sama aplikacja co [Momentum Desktop](https://github.com/agnar92/MomentumDesktop), tylko w przeglądarce.
Strategię wybrano w backteście na płynnym rynku USA w latach 2015–2026:

| Etap | Reguła |
|---|---|
| Lista do pobrania | **Finviz**, bezpieczny filtr wstępny `ind_stocksonly,sh_price_o10,sh_avgvol_o300,fa_salesqoq_o15` (tylko akcje, cena > 10 $, śr. wolumen > 300 tys., przychody kw. > 15 % r/r); zmienisz go w `finviz_screen.json` |
| Warunki | obrót dzienny **≥ 50 mln $**, przychody kw. **≥ +15 % r/r**, marża operacyjna **≥ +3 pp r/r** (fundamenty z SEC EDGAR) |
| Kolejność | od największej zmiany marży operacyjnej r/r |
| Wejście | **Green Line**: rekord wszech czasów na zamknięciach **miesięcznych**, który stoi **≥ 3 zamknięte miesiące** (po nowym rekordzie obowiązuje stara linia, dopóki nowy nie przestoi 3 miesięcy); kupno, gdy tydzień zamknie się **0–10 % nad linią** |
| Wyjście | **tygodniowy MACD (12, 26, 9)**: po przecięciu sygnału w dół stop pod Low tego tygodnia; do tego stop **10 %** pod wejściem |

Heurystyka z backtestu (spółki z dzisiejszej listy, bez spółek wycofanych z obrotu), nie porada inwestycyjna.

## Strona

- **Lista**: ticker, spółka, sektor, cena, Green Line, odległość od linii, stan GLB (*WYBICIE* = ten tydzień zamknął się nad linią, poprzedni nie; *SYGNAŁ* = 0–10 % nad linią;
  *NAD* = dalej; *POD*), MACD (nad / pod sygnałem) i stop z ostatniego przecięcia, zmiana marży operacyjnej i brutto r/r, przychody r/r, kwartał danych, obrót.
  Zielone wiersze = warunki spełnione i sygnał GLB. Domyślnie widać tylko spółki spełniające warunki. Klik w nagłówek sortuje (drugi klik odwraca, trzeci wraca do kolejności domyślnej).
- **Wykres** (jeden, tygodniowy, 3 lata): słupki High–Low z kreską zamknięcia, SMA 10 i 40 tyg., **Green Line** (z ceną i górną granicą kupna +10 %), stop z MACD (czerwona przerywana),
  wolumen ze średnią 10 tyg., MACD z ▼ w tygodniach przecięcia w dół. Klik w wiersz otwiera, ↑ / ↓ = następna / poprzednia spółka, ruch kursora = dane tygodnia.
  Na szerokim ekranie wykres jest obok listy, na telefonie na pełnym ekranie (✕ / Esc zamyka).
- **Ctrl+K**: dowolny symbol z danych — spółki z listy i symbole z `symbols` w `finviz_screen.json` (domyślnie SPY, QQQ, ^GSPC), liczone tak samo.
  Strona jest statyczna, więc nowy symbol trzeba dopisać do `symbols`; pojawi się po następnym odświeżeniu.

## Dane (darmowe źródła, jak najmniej zapytań)

`python watchlist.py` (w CI: workflow **Weekly Refresh**, sobota 03:17 UTC, i ręcznie przyciskiem „⟳ Odśwież dane”):
Finviz (lista) → yfinance **tygodniowe 3 lata** (wykres, średnie, MACD, obrót) → dla spółek z obrotem ≥ 50 mln $: yfinance **miesięczne z całej historii**
(Green Line; zamknięte miesiące są w `data/monthly.json` i pobierane ponownie dopiero po zamknięciu kolejnego miesiąca) i **SEC** (fundamenty, `data/sec.json`, odświeżane co 7 dni).
Bez danych dziennych. Wynik: `docs/data/watchlist.json` (lista) i `docs/data/weekly/<ticker>.json` (świece). Gdy Finviz nie odpowie, zostaje poprzednia lista.
SEC prosi o User-Agent z kontaktem — wpisz swój w `finviz_screen.json` (`sec_ua`) albo w sekrecie repozytorium `SEC_UA`.

## Uruchomienie lokalnie

```bash
pip install -r requirements.txt -r requirements-dev.txt
python watchlist.py                      # odświeżenie danych
cd docs && python3 -m http.server        # strona: http://localhost:8000
python -m pytest -q && ruff check .      # testy Pythona
npm ci && npm test && npm run lint       # testy i lint JS
```
