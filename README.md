# Momentum

Statyczna strona (GitHub Pages, `docs/`) z **jedną strategią** — ta sama aplikacja co [Momentum Desktop](https://github.com/agnar92/MomentumDesktop), tylko w przeglądarce.
Strategię wybrano w backteście na płynnym rynku USA w latach 2015–2026:

| Etap | Reguła |
|---|---|
| Lista do pobrania | **Skaner Finviz** do wyboru na stronie; skanery (nazwa + filtr + limit) są w `finviz_screen.json`: Bezpieczny (backtest) `ind_stocksonly,sh_price_o10,sh_avgvol_o300,fa_salesqoq_o15` (tylko akcje, cena > 10 $, śr. wolumen > 300 tys., przychody kw. > 15 % r/r — nie odciął żadnego z dużych zwycięzców), Trend 50/200, Blisko rekordu (ATH), CANSLIM |
| Warunki | obrót dzienny **≥ 50 mln $**, przychody kw. **≥ +15 % r/r**, marża operacyjna **≥ +3 pp r/r** (fundamenty z SEC EDGAR) |
| Kolejność | od największej zmiany marży operacyjnej r/r |
| Wejście | **Green Line**: rekord wszech czasów **miesięcznego High** (jak w oryginale Dr. Wisha), który stoi **≥ 3 zamknięte miesiące** (po nowym rekordzie obowiązuje stara linia, dopóki nowy nie przestoi 3 miesięcy); kupno, gdy tydzień zamknie się **0–10 % nad linią** |
| Wyjście | **tygodniowy MACD (12, 26, 9)**: po przecięciu sygnału w dół stop pod Low tego tygodnia; do tego stop **10 %** pod wejściem |

Heurystyka z backtestu (spółki z dzisiejszej listy, bez spółek wycofanych z obrotu), nie porada inwestycyjna.

## Strona

- **Skaner** (lista rozwijana na pasku): jeden skaner albo wszystkie razem. Każdy liczy tę samą strategię.
- **Lista**: ticker, spółka, sektor, cena, Green Line, odległość od linii, stan GLB (*WYBICIE* = ten tydzień zamknął się nad linią, poprzedni nie; *SYGNAŁ* = 0–10 % nad linią;
  *NAD* = dalej; *POD*), MACD (nad / pod sygnałem) i stop z ostatniego przecięcia, zmiana marży operacyjnej i brutto r/r, przychody r/r, kwartał danych, obrót.
  Zielone wiersze = warunki spełnione i sygnał GLB. Domyślnie widać tylko spółki spełniające warunki. Klik w nagłówek sortuje (drugi klik odwraca, trzeci wraca do kolejności domyślnej).
- **Filtry** (przycisk na pasku): kilka warunków naraz po kolumnach — stan GLB, MACD, warunki, sektor (klik w wartość), a dla liczb od–do (np. do linii %, Δ marży,
  obrót w mln $). Gotowe zestawy, np. „Nad GLB + MACD dodatni”.
- **Wykres** (jeden, tygodniowy, 3 lata): słupki High–Low z kreską zamknięcia, SMA 10 i 30 tyg., **Green Line** (z ceną i górną granicą kupna +10 %), stop z MACD (czerwona przerywana),
  wolumen ze średnią 10 tyg., MACD z ▼ w tygodniach przecięcia w dół. Klik w wiersz otwiera, ↑ / ↓ = następna / poprzednia spółka, ruch kursora = dane tygodnia.
  **Suwak** nad wykresem (minimapa całej historii): przeciągnij ramkę = przesuń okno, krawędzie = zmień długość, klik obok = skok, kółko / + − = zoom, ← / → = przesuń.
- **Linie trendu**: myszą przeciągnij po wykresie ceny; na telefonie przytrzymaj palec ~0,4 s i prowadź (szybki ruch palcem = dane tygodnia). Koniec linii
  przyciąga się do High / Low tygodnia. Chwyć koniec = zmień punkt, chwyć środek = przesuń linię, klik / dotknięcie = zaznacz (🗑 usuwa, Delete też).
- **Alerty** (🔔 Alerty na pasku): zamknięcie tygodnia przecięło linię trendu (🔔 alert linii) oraz dla obserwowanych spółek (🔕 Obserwuj na wykresie):
  sygnał GLB, przecięcie MACD w dół, zamknięcie pod stopem MACD, spełnione warunki. Sprawdzane przy otwarciu strony po nowych danych; linie i alerty
  zapisują się w przeglądarce (każde urządzenie ma swoje). Opcjonalnie powiadomienie systemowe.
- **Mocne** (kolumna, ciemniejsza zieleń): spółki na górze listy — opis w punkcie „Warunki = blueprint”.
- **📅 Dzienny** (przycisk na wykresie, dla spółek nad Green Line): rok świec dziennych z RWB Guppy (6 szybkich EMA czerwonych / 6 wolnych niebieskich, jaśniejsze
  tło = RWB), ● Blue Dot (Stochastic 10,1 ↑ 20 przy RWB nad Green Line) ze stopem pod Low kropki, Stochastic zamiast MACD. Tylko do podglądu — w teście
  RWB + Blue Dot dawało +1 % na transakcję (GLB tygodniowy +2,9 %, z Mocne +5,1 %).
- **Warunki = blueprint**: obrót ≥ 50 mln $, przychody kw. ≥ +15 % r/r i ≥ 25 mln $, marża oper. ≥ +3 pp r/r i zysk oper. w $ lepszy niż rok wcześniej,
  wycena P/S < 20. **Mocne**: do tego marża oper. ↑ ≥ 10 pp i rozwodnienie akcji < 10 %. **Potencjał ★ (0–3)**: tylko cechy sprawdzone w strategii (marża oper.
  ↑ ≥ 10 pp, marża brutto ↑, rozwodnienie < 10 %). **Hamuje ⚠**: tempo przychodów spadło o ≥ 10 pp (⚠⚠ z marżą brutto w dół). Liczby w 📖 Poradniku.
- **Pasek ładowania** na dole przy wczytywaniu listy i wykresu (pobrane MB, procent, czas).
  Na szerokim ekranie wykres jest obok listy, na telefonie na pełnym ekranie (✕ / Esc zamyka).
- **Ctrl+K**: dowolny symbol z danych — spółki z listy i symbole z `symbols` w `finviz_screen.json` (domyślnie SPY, QQQ, ^GSPC), liczone tak samo.
  Strona jest statyczna, więc nowy symbol trzeba dopisać do `symbols`; pojawi się po następnym odświeżeniu.

## Dane (darmowe źródła, jak najmniej zapytań)

`python watchlist.py` (w CI: workflow **Weekly Refresh**, sobota 03:17 UTC, i ręcznie przyciskiem „⟳ Odśwież dane”):
każdy skaner w Finviz → yfinance **tygodniowe 3 lata** dla sumy spółek (wykres, średnie, MACD, obrót) → dla spółek z obrotem ≥ 50 mln $: yfinance **miesięczne High z całej historii**
(Green Line, `data/monthly.json`) i **SEC** (fundamenty, `data/sec.json`, odświeżane co 7 dni). **Tylko nowe dane**: spółka już zapisana w `docs/data/weekly/` dostaje tylko ostatnie tygodnie,
a historia miesięczna tylko nowe zamknięte miesiące; całość tylko dla nowej spółki, po długiej przerwie albo gdy ceny wstecz się zmieniły (split). Ceny są **nieskorygowane o dywidendy** (tylko o splity), jak na TradingView — inaczej dawne szczyty spółek z dużymi wypłatami (np. CLMT) wychodziły za nisko.
Bez danych dziennych. Wynik: `docs/data/watchlist.json` (lista) i `docs/data/weekly/<ticker>.json` (świece). Gdy Finviz nie odpowie dla skanera, zostaje jego poprzednia lista.
SEC prosi o User-Agent z kontaktem — wpisz swój w `finviz_screen.json` (`sec_ua`) albo w sekrecie repozytorium `SEC_UA`.

## Uruchomienie lokalnie

```bash
pip install -r requirements.txt -r requirements-dev.txt
python watchlist.py                      # odświeżenie danych
cd docs && python3 -m http.server        # strona: http://localhost:8000
python -m pytest -q && ruff check .      # testy Pythona
npm ci && npm test && npm run lint       # testy i lint JS
```
