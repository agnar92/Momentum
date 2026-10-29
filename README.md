# Momentum

Statyczna strona (GitHub Pages, `docs/`) z **jedną strategią** — ta sama aplikacja co [Momentum Desktop](https://github.com/agnar92/MomentumDesktop), tylko w przeglądarce.
Strategię wybrano w backteście na płynnym rynku USA w latach 2015–2026:

| Etap | Reguła |
|---|---|
| Lista do pobrania | **Jeden skaner — CEM10**: `Weekly Refresh` robi po jednym zapytaniu Finviz na indeks (`idx_sp500`, `idx_ndx`) + `ta_perf_13wup,ta_perf2_52w30o,ta_sma200_pa` (kwartał w górę, rok > +30 %, cena nad SMA 200 = wstępne cięcie). C-8 (zwrot 13 tyg. > 0 i 52 tyg. > +30 %) liczy potem strona z tygodniowych cen; lista pokazuje wszystkie spółki z C-8 posortowane po momentum 12-1 (`CEM #`), a pierwsze 20 jest na zielono (do zakupu). Przełącznik „Ranking” na pasku: momentum 12-1 (domyślnie) albo 6 mies. (kolumna `Momentum 6 mies. %`). Wyjście i reszta bez zmian. Skaner sektorowy (RS sektorów) zostaje w kodzie, ale nie jest domyślny |
| Warunki | przychody kw. **≥ +15 % r/r**, marża operacyjna **≥ +3 pp r/r** (SEC EDGAR), **P/S < 20**, siła względna 52 tyg. **≥ +50 pp nad S&P 500** |
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
- **Wykres** (jeden, tygodniowy; domyślnie ostatnie 52 tygodnie, suwak pozwala wybrać całą dostępną historię): słupki High–Low z kreską zamknięcia, SMA 10 i 30 tyg., **Green Line** (z ceną i górną granicą kupna +10 %), stop z MACD (czerwona przerywana),
  wolumen ze średnią 10 tyg., MACD z ▼ w tygodniach przecięcia w dół. Klik w wiersz otwiera, ↑ / ↓ = następna / poprzednia spółka, ruch kursora = dane tygodnia.
  **Suwak** nad wykresem (minimapa całej historii): przeciągnij ramkę = przesuń okno, krawędzie = zmień długość, klik obok = skok, kółko / + − = zoom, ← / → = przesuń.
- **Linie trendu**: myszą przeciągnij po wykresie ceny; na telefonie przytrzymaj palec ~0,4 s i prowadź (szybki ruch palcem = dane tygodnia). Koniec linii
  przyciąga się do High / Low tygodnia. Chwyć koniec = zmień punkt, chwyć środek = przesuń linię, klik / dotknięcie = zaznacz (🗑 usuwa, Delete też).
- **Alerty** (🔔 Alerty na pasku): zamknięcie tygodnia przecięło linię trendu (🔔 alert linii) oraz dla obserwowanych spółek (🔕 Obserwuj na wykresie):
  sygnał GLB, przecięcie MACD w dół, zamknięcie pod stopem MACD, spełnione warunki. Sprawdzane przy otwarciu strony po nowych danych; linie i alerty
  zapisują się w przeglądarce (każde urządzenie ma swoje). Opcjonalnie powiadomienie systemowe.
- **T / M / Z** (przyciski na wykresie, klawisze W / M / Z): prosty wykres jak w desktopie — szare słupki, niebieska SMA 10, RS Line u góry, zielone tło, gdy SPY jest nad SMA 10 tego samego interwału,
  Green Line kropkowana od świecy rekordu ze strefą kupna 0–10 % (przerywana na +5 %), wolumen i MACD. **M** = pełna historia miesięczna (`docs/data/monthly`), bieżący miesiąc dobudowany z tygodniowych.
  **RWB** (przycisk / R, T i M): pasek RWB u dołu ceny, ● Blue Dot i żółta strzałka ▲ pod Low świecy, na której RWB wraca po cofnięciu (= dokup); kolumna **RWB tyg.** sortuje najświeższe starty na górę.
  **⇥ N** = puste świece po prawej (linie w przyszłość); skala ceny: kółko nad osią albo Shift+kółko, przeciągnięcie osi, środkowy przycisk, dwuklik na osi = auto; widok zapamiętany (osobno T i M).
  **🛑 Stop** = ręczna linia do przeciągania (dwuklik na wykresie = stop tu), **💰 Wielkość** = kapitał w PLN, kurs USD/PLN (NBP), ryzyko % → liczba akcji (ułamkowych). Linie T / Z i M widać wzajemnie (blade).
- **☁ Gist**: dane wysłane z desktopa (☁ Web (gist)) do tajnego gista; strona bierze nowsze: gist albo repo (Weekly Refresh działa osobno, więc strona ma dane także bez dostępu do PC). ID gista wpisujesz raz w przeglądarce.
- **Warunki** (tylko te o największym wpływie w backteście; bez progu obrotu — płynność ustawiasz filtrem w Finviz): przychody kw. ≥ +15 % r/r, marża oper. ≥ +3 pp r/r, P/S < 20 i siła
  względna (kolumna RS): zmiana ceny z 52 tyg. ≥ 50 pp lepsza od S&P 500. Backtest 2015–2026: +15,6 % na transakcję, portfel wszystkich sygnałów 36,6 % rocznie
  (S&P 500 13,6 %), ale mało sygnałów naraz i spadek portfela do −55 %. **Hamuje ⚠**: tempo przychodów spadło o ≥ 10 pp (⚠⚠ z marżą brutto w dół). Liczby w 📖 Poradniku.
- **Linia siły relatywnej (RS) jak w IBD** na wykresie tygodniowym: cena / S&P 500 na dole panelu ceny, na końcu linii liczba „+x pp” (RS 52 tyg.), ● gdy RS jest na szczycie 52 tyg.
- **Wejście:** WYBICIE = tydzień przebicia Green Line przy dowolnej wysokości (mocne wybicie), SYGNAŁ = 0–10 % nad linią, **BLUE DOT** = kolejny tydzień
  > 10 % nad linią i Blue Dot na tygodniowym w ostatnich 2 tygodniach (wejście; bez kropki stan NAD = czekaj).
- **Niespodzianki EPS** (warunek „2× nad konsensus”: 2 ostatnie raporty powyżej konsensusu EPS; kolumny Niesp. EPS % i Rewizja EPS 90 dni %, z yfinance,
  co 7 dni). W backteście warunek podniósł wynik z 36,6 do 42,4 % rocznie. Rewizja prognozy na przyszły rok (dziś vs 90 dni temu) to podgląd — bez historii do testu.
- **Wolumen relatywny** (kolumna RVol tyg. i opis panelu wolumenu): wolumen ostatniego tygodnia / średnia 10 poprzednich tygodni — 2,0 = dwa razy więcej niż zwykle;
  gotowy filtr „Aktywne: RVol tyg. ≥ 1,5 + nad GLB”. W filtrach listy każda kolumna liczbowa (też EPS Rating, RWB tyg., RVol, P/S, PEG) ma pola „od – do”.
- **📌 Pozycje** (pasek narzędzi): pozycje z planem wyjścia i kolumną „Co teraz” (trzymaj / stop −10 % / wyjście / sprzedaj ½ / hamuje) oraz obserwowane spółki;
  klik = wykres, usuwanie pozycji i obserwowanych.
- **🚪 Wyjście** (przycisk na wykresie, zapamiętany): **MACD** (stop pod Low tygodnia przecięcia w dół) albo **pod GLB** (zamknięcie tygodnia pod Green Line,
  jak u Dr Wisha — trzyma największe ruchy, np. SNDK, MU, NVDA 2023). Zawsze: stop 10 % pod kupnem i **spadek 20 % od szczytu = sprzedaj połowę**. Przy 📌 pozycji
  wykres pokazuje „stop −10 %” i „½ przy”, panel / lista kontrolna plan wyjścia, a alerty: zamknięcie pod Green Line i spadek 20 % od szczytu. Liczby w 📖 Poradniku.
- **Pasek ładowania** na dole przy wczytywaniu listy i wykresu (pobrane MB, procent, czas).
  Na szerokim ekranie wykres jest obok listy, na telefonie na pełnym ekranie (✕ / Esc zamyka).
- **Ctrl+K**: dowolny symbol z danych — spółki z listy i symbole z `symbols` w `finviz_screen.json` (domyślnie SPY, QQQ, ^GSPC), liczone tak samo.
  Strona jest statyczna, więc nowy symbol trzeba dopisać do `symbols`; pojawi się po następnym odświeżeniu.

## Dane (darmowe źródła, jak najmniej zapytań)

`python watchlist.py --fetch-only` (w CI: workflow **Weekly Refresh**, sobota 03:17 UTC, i ręcznie przyciskiem „⟳ Odśwież dane”) pobiera tylko dane źródłowe i cache. Następnie **Deploy Pages** uruchamia `python watchlist.py --build-only`, przelicza wskaźniki z zapisanych plików i publikuje `docs/` bez pobierania danych rynkowych:
jeden skaner Finviz → yfinance **tygodniowe 3 lata** dla sumy spółek (wykres, średnie, MACD, obrót i pełne 52-tygodniowe C/C oraz RS) → dla wszystkich spółek ze skanera: yfinance **miesięczne High z całej historii**
(Green Line, `data/monthly.json`) i **SEC** (fundamenty, `data/sec.json`, odświeżane co 7 dni). **Tylko nowe dane**: spółka już zapisana w `docs/data/weekly/` dostaje tylko ostatnie tygodnie,
a historia miesięczna tylko nowe zamknięte miesiące; całość tylko dla nowej spółki, po długiej przerwie albo gdy ceny wstecz się zmieniły (split). Ceny są **nieskorygowane o dywidendy** (tylko o splity), jak na TradingView — inaczej dawne szczyty spółek z dużymi wypłatami (np. CLMT) wychodziły za nisko.
Bez danych dziennych. Wynik: `docs/data/watchlist.json` (lista) i `docs/data/weekly/<ticker>.json` (świece). Gdy Finviz nie odpowie dla skanera, zostaje jego poprzednia lista.
SEC prosi o User-Agent z kontaktem — wpisz swój w `finviz_screen.json` (`sec_ua`) albo w sekrecie repozytorium `SEC_UA`.

## Uruchomienie lokalnie

```bash
pip install -r requirements.txt -r requirements-dev.txt
python watchlist.py --fetch-only         # pobierz/uzupełnij dane źródłowe
python watchlist.py --build-only          # przelicz stronę bez pobierania danych
cd docs && python3 -m http.server        # strona: http://localhost:8000
python -m pytest -q && ruff check .      # testy Pythona
npm ci && npm test && npm run lint       # testy i lint JS
```


## Growth Score — TOP 10 fundamentalny

Osobny ranking spółek z bieżącego skanera Finviz, niezależny od GLB i wykresu ceny. Wagi: przyspieszenie wzrostu 30 pkt (przychody, przyspieszenie sprzedaży, wzrost EPS), zaskoczenia wynikowe 20 (EPS Surprise i Revenue Surprise), przyszły wzrost 20 (prognoza EPS +1y i rewizje EPS 90 dni), jakość biznesu 20 (marża operacyjna, jej zmiana, ROI/ROIC jeśli dostępne), trwałość wzrostu 10 (spójność wielokwartałowa i jawne katalizatory). Brakujące dane są pomijane, score jest normalizowany do dostępnych wag i wymaga pokrycia co najmniej 70/100. Katalizatory nie są zgadywane; Revenue Surprise i ROI/ROIC mogą być niedostępne w źródle.
