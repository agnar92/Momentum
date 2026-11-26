# Protokół badania ruchów ceny (etap 0, preregistracja)

Data zamrożenia: 2026-11-10. Każda późniejsza zmiana trafia do sekcji "Odstępstwa" z datą i powodem.
Pełny plan z uzasadnieniem: dokument "Plan badania ruchów ceny" (claude.ai).

## Zasada nadrzędna
Wnioski wynikają z danych. Tam, gdzie wybór progu nie może wynikać z danych bez podglądania wyniku
(definicja ruchu, podział czasu), wariant główny jest ustalony tutaj z góry, a wszystkie inne warianty
są raportowane obok (siatka wrażliwości). Wniosek uznajemy, gdy ma ten sam znak w ≥ 75 % wariantów.

## Pytania
P1 wzorce przed ruchem · P2 parametry początkowe · P3 ślad katalizatora · P4 wolumen ·
P5 czas trwania · P6 wygasanie · P7 czas trzymania / wyjście · P8 przewidywania psychologii tłumu.

## Dane
- Źródło: EODHD, `eodhd.duckdb` (skrypty `01_symbols.py` … `05_finalize.py`), widok `prices_valid`.
- Uniwersum: akcje zwykłe USA (`type = 'Common Stock'`), w tym wycofane. Giełdy: rozstrzyga audyt (etap 1).
- Filtr dnia (wariant główny): close ≥ 1 USD, mediana obrotów 20 dni ≥ 1 mln USD, dni bez zmiany ceny w 20 sesjach ≤ 20 %,
  dane po czyszczeniu z `r01_baza.py` (widok `dc`).
  Warianty: obroty ≥ 0,2 / 5 / 20 mln USD.
- Ceny: kształt i zwroty z `adjusted_close`; OHLC skalowane współczynnikiem adjusted_close / close.

## Podział czasu (nie zmieniany)
- Uczenie 1998-01-01 … 2012-12-31 (pierwotnie 1995, odstępstwo 1); walidacja 2013-07-01 … 2018-12-31 (pół roku embarga);
  test nietknięty 2019-07-01 … koniec danych. Test otwierany raz, po zamrożeniu kodu (tag git `test-freeze`).
- Lata < 1995: tylko test odporności.
- Do etapu 10 żaden skrypt nie czyta dat ≥ 2013-07-01, z wyjątkiem walidacji oznaczonej w rejestrze.

## Definicja ruchu (wariant główny + siatka)
- Wzrost: tygodniowe zamknięcia; od dołka do szczytu ≥ +50 %, bez obsunięcia > 25 % od bieżącego szczytu.
  Siatka: wzrost {30, 50, 100} % × obsunięcie {15, 25, 35} %.
- Spadek (symetria): ≥ −40 % od szczytu bez odbicia > 25 % od bieżącego dołka.
- Wybicie: pierwsze zamknięcie tygodnia > max zamknięć z 26 tyg. przed tym tygodniem.
- Koniec: obsunięcie o próg od szczytu; ruch trwający na końcu danych = ucięty (cenzurowanie).

## Statystyka
- Przedziały 95 %: błędy grupowane po dacie i spółce lub bootstrap blokowy (bloki 12 mies., 2000 losowań).
- Wielokrotne testy: rejestr `rejestr.csv`, FDR Benjaminiego-Hochberga q < 0,05; główne hipotezy t > 3.
- Efekt praktyczny: lift ≥ 1,2; przewaga ≥ 2 pp/rok netto; ΔAUC ≥ 0,02.
- Koszty: 0,1 % na stronę (obroty ≥ 20 mln), 0,25 % (5–20 mln), 0,5 % (< 5 mln).
- Model bazowy dla każdego predyktora: samo momentum 6M.
- Ziarno losowości: 20261110.

## Odstępstwa
1. 2026-11-10, etap 1 (dane): próba ucząca zaczyna się 1998-01-01, nie 1995-01-01. Powód: EODHD ma spółki
   wycofane dopiero od 1998 r. (spółek wycofanych później, obecnych w danym roku: 1997 = 339, 1998 = 2 267,
   `wyniki/r02_audyt.md`, sekcja B), więc lata 1995-1997 mają silny błąd przeżywalności. Lata 1985-1997 = tylko
   test odporności.
2. 2026-11-10, etap 1: filtr dnia uzupełniony o "odsetek dni bez zmiany zamknięcia w 20 sesjach <= 20 %".
   Powód: obroty w USD są w części szeregów EODHD w niespójnych jednostkach (cena skorygowana o odwrócone splity,
   wolumen nie); miara bez jednostek odcina śmieciowe spółki, które dzięki temu błędowi przechodzą filtr obrotów.
   Spread Corwina-Schultza sprawdzony i odrzucony (w starych danych high = low = close, spread = 0).
3. 2026-11-10, etap 1: obroty liczone z ceny skorygowanej tylko o splity (`ps`), bo wolumen EODHD jest
   skorygowany o splity, a close nie. Reguły czyszczenia w `r01_baza.py` (błędy adj, filtr Hampela, tickery
   z niemożliwymi obrotami, duplikaty, skoki-błędy).
4. 2026-11-10, etap 1/2: KM i Weibull w bootstrapie liczone na 500 / 300 losowaniach (zamiast 2000) z powodu czasu
   obliczeń; pozostałe przedziały 2000 losowań.
5. 2026-11-10, etap 3: pierwsza wersja opisu liczyła "wszystkie wybicia" z ruchów potwierdzonych zygzakiem; zygzak
   potwierdza ruch dopiero po wzroście o 33 % od dołka, więc próba była warunkowa na sukcesie (błąd selekcji).
   Poprawka: perspektywa bezwarunkowa liczona ze wszystkich świeżych wybić (tabela zdarzenia), koniec ruchu =
   spadek o Y od maksimum po wybiciu; opis ruchów zygzaka zostaje jako jawnie warunkowy.
6. 2026-11-10, etap 5: szeregi dzielone na serie przy przerwie w notowaniach > 30 dni kalendarzowych (ponowne użycie
   tickera, np. TCT: 2006-03-31 = 40,59 USD, 2014-12-04 = 79 000 USD; 0,1 % zdarzeń dawało 74 % sumy zwrotów 52 tyg.).
   Koniec serii = wyjście po ostatniej cenie. Średnie zwrotów raportowane jako winsoryzowane 1/99 % obok median.
   Przeliczone etapy 2-5.
7. 2026-11-11, etap 6b: nowa seria także po dziennym wzroście adj > +400 % (zmiana jednostek bez przerwy w notowaniach,
   np. SPM 2012-06: 40 -> 35 600 USD przy wolumenie spadającym 1000x; 395 obserwacji panelu ze zwrotem 52 tyg. > +500 %).
   Duże jednodniowe spadki zostają (bankructwa są realne; ich wycięcie zawyżałoby wyniki). Przeliczone etapy 2-7 i 6b.

## Walidacja 2013-07 ... 2018-12 (zapisane 2026-11-11 PRZED uruchomieniem, jedno spojrzenie)
Kandydaci wybrani na próbie uczącej (dane po poprawce 7):
- V1 "spokojny trend": ranking s_B1 z r12_model.py (średnia rang: -zmienność dzienna, -maks. dzienny wzrost,
  +odsetek dni wzrostowych, +bliskość szczytu 12 mies., +sezonowość własna), 500 spółek o największych obrotach,
  top 10 i top 50, równe wagi, rebalancing co miesiąc, koszty jak w r12. Odniesienie: równe wagi 500 największych.
  Sukces, jeśli: (a) zmienność portfela top 50 <= 70 % zmienności odniesienia ORAZ (b) dolna granica 95 % różnicy
  miesięcznego zwrotu netto top 50 vs odniesienie >= -0,25 pp/mies. (nie gorzej o więcej niż ok. 3 % rocznie).
  Dodatkowo raportowane: CAGR, Sharpe, maks. obsunięcie, top 10.
- V2 "trailing stop": wejście = świeże wybicie (r06), wyjście "stop 15 + trailing 25" i "trailing 25" vs
  "czas 52"; wejścia 2013-07 ... 2017-06 (ścieżka do 2018-12-31). Sukces, jeśli zwrot na tydzień trzymania
  "trailing 25" > "czas 52" z dolną granicą 95 % (bootstrap blokowy po miesiącach) > 0.
Wynik raportowany niezależnie od tego, jaki będzie; żadnych zmian parametrów po spojrzeniu.
8. 2026-11-11, PO pierwszym spojrzeniu na walidację: odkryte błędy jednostek w dół (26 miesięcy z f1 < -80 % w walidacji,
   ceny > 1000 USD spadające do 1 USD). Nowa seria także przy spadku > 80 % w jeden dzień, gdy cena przed > 500 USD lub
   wolumen < 3x średniej 20 dni (prawdziwy krach ma wybuch wolumenu). To poprawka danych, nie zmiana parametrów strategii;
   kryteria walidacji bez zmian. Raportowane są oba wyniki walidacji (przed i po poprawce danych), a druga ocena jest
   jawnie oznaczona jako drugie spojrzenie. Uwaga projektowa: odniesienie "500 spółek o największych obrotach" przegrywa
   z RSP także w próbie uczącej (5,8 % vs ok. 10 % rocznie), więc nie jest dobrym przybliżeniem rynku dużych spółek;
   w raportach dodane SPY i RSP jako odniesienia opisowe.

## Wynik walidacji (2026-11-11)
Żaden kandydat nie spełnił kryteriów (szczegóły: wyniki/r16_walidacja_spojrzenie1.md i _spojrzenie2.md, rejestr R022-R023).
Zgodnie z protokołem test nietknięty 2019-07 ... nie jest otwierany: nie ma strategii, która przeszła walidację.
Okres testowy zostaje zachowany dla przyszłych hipotez.
9. 2026-11-11, etap 12 (CEM10): kolejne błędy danych wykryte na transakcjach CEM10: (a) nowa seria, gdy adj i close
   rozjeżdżają się > 1,5x w jeden dzień bez rozpoznanego splitu (TWX 1999: close +11 %, adj +100 %; 511 takich dni
   w płynnych spółkach >= 5 USD); (b) dopasowanie składu indeksu do serii tylko przy obrotach >= 50 mln USD w miesiącu
   (CBE.US w 2003 = spółka groszowa zamiast Cooper Industries; TEK_old z wolumenem 70 akcji). Przeliczone etapy 2-7,
   6b, 11, 12. Walidacja (r16) NIE jest uruchamiana ponownie: obowiązuje wynik spojrzenia 2 (uniknięcie kolejnych
   spojrzeń na lata 2013-2018); wynik mógłby się nieznacznie zmienić po poprawce (a).

## Etap 13: warianty CEM10 łapiące wcześniej / oddające mniej (zapisane 2026-11-11 PRZED uruchomieniem)
Pytanie użytkownika: czy CEM10 może łapać większą część ruchu niż ok. 30 % (wejście przy ok. 78 % ruchu w log).
Zamknięta lista wariantów (skład S&P 500 point-in-time, 10 pozycji, filtr SPY < SMA 12 i koszty jak w r19):
 M0 baza CEM10 (6M > 30 %, > SMA 10 mies., ranking 6M, wyjście < SMA 10 mies.);
 M1 próg 6M > 15 %; M2 3M > 15 % i > SMA 10, ranking 3M; M3 6M w przedziale 15-60 % (bez przegrzanych), ranking 6M;
 M4 początek trendu: pierwszy miesiąc nad SMA 10 po >= 3 miesiącach pod nią i 3M > 0, ranking 6M;
 M5 baza, wyjście trailing -20 % od maks. zamknięcia miesiąca; M6 baza, wyjście < SMA 10 lub trailing -25 %;
 W1 tygodniowy CEM10: 26 tyg. > 30 %, > SMA 40 tyg., ranking 26 tyg., wyjście < SMA 40 tyg.;
 W2 tygodniowy wczesny: 13 tyg. > 15 %, > SMA 40 tyg., ranking 13 tyg., wyjście < SMA 40 tyg.
Miary: CAGR, maks. obsunięcie, faza wejścia (mediana części ruchu zygzaka już za nami), część złapanego ruchu
wśród złapanych dużych wzrostów, różnica miesięcznego zwrotu vs M0 (bootstrap blokowy 12 mies.).
Wariant "lepszy", jeśli: niższa faza wejścia lub większa część złapanego ruchu ORAZ wyższy CAGR w obu połowach
(1998-2012 i 2013-2026) ORAZ dolna granica 95 % różnicy vs M0 > 0. Charakter rozpoznawczy (CEM10 dobierany na tych latach).

## Etap 14: Minervini Trend Template + VCP (zapisane 2026-11-12 PRZED uruchomieniem)
Hipoteza zewnętrzna (nie z naszych danych), więc oceniana na 1998-2018 ORAZ jednorazowo na nietkniętym 2019-07 ... 2026.
Dane dzienne po czyszczeniu (dc), serie dzielone jak w r03; uniwersum: filtr główny + cena >= 5 USD.
Trend Template (dzień t, wszystkie 10 warunków): RP > 70, close > SMA 50, > SMA 150, > SMA 200, SMA 50 > SMA 150,
SMA 50 > SMA 200, SMA 150 > SMA 200, close >= 1,3 x min 252 dni, close >= 0,75 x max 252 dni, SMA 200 > SMA 200 sprzed
22 sesji. RP = percentyl (0-100) wśród spółek uniwersum w dniu t wskaźnika 0,4 r63 + 0,2 r126 + 0,2 r189 + 0,2 r252
(przybliżenie IBD RS).
VCP (przybliżenie opisu Minerviniego, sprawdzane w dniu t z TT): baza = od najwyższego zamknięcia z ostatnich 120 sesji
(bez 5 ostatnich) do t-1, długość >= 15 sesji; zygzak 5 % na zamknięciach w bazie daje kolejne cofnięcia (szczyt -> dołek);
>= 2 cofnięcia, każde płytsze niż poprzednie, pierwsze <= 35 %, ostatnie <= 12 %; wolumen 10 sesji przed t < średniej 50;
punkt zwrotny (pivot) = najwyższe zamknięcie od ostatniego szczytu cofnięcia; sygnał: close_t > pivot i wolumen_t >= 1,4 x średniej 50.
Transakcje: wejście po otwarciu następnej sesji; stop początkowy = max(dołek ostatniego cofnięcia, wejście x 0,92) w trakcie
sesji (wykonanie po stopie lub po otwarciu przy luce); wyjście: zamknięcie < SMA 50 (sprzedaż po następnym otwarciu); koszt 0,1 %/stronę.
Porównanie "TT bez VCP": wejście w pierwszym dniu spełnienia TT (po >= 20 sesjach bez TT), stop = wejście x 0,92, te same wyjścia.
Portfel: maks. 10 pozycji, równe kwoty, kolejność sygnałów wg RP; odniesienie SPY.
Kryteria: H1 selekcja: spółki z TT na koniec miesiąca mają dodatni średni zwrot nadwyżkowy (vs równe wagi uniwersum) za 1/3/6/12 mies.,
t Neweya-Westa > 2 w 1998-2018 i ten sam znak w 2019-2026. H2 wejście VCP: oczekiwany zwrot na transakcję (śr. winsoryzowana)
TT+VCP > TT bez VCP z dolną granicą 95 % (bootstrap blokowy po miesiącach) > 0 w 1998-2018 i ten sam znak w 2019-2026;
portfel TT+VCP: CAGR > SPY w obu okresach.
Wynik etapu 14 (2026-11-12): H1 nie spełniona (nadwyżka TT dodatnia w obu okresach, ok. +2..+5 % rocznie, ale t < 2);
H2 nie spełniona (VCP nie poprawia transakcji, w okresie B istotnie gorszy; portfele TT i TT+VCP poniżej SPY).
Uwaga: do pierwszej wersji raportu H1 grupowała miesiące po dacie ostatniej sesji spółki (błąd, poprawione na miesiąc kalendarzowy).

## Etap 15: CEM10 + filtr przyspieszenia EPS (zapisane 2026-11-12 PRZED uruchomieniem)
Dane: kwartalny EPS rozwodniony z SEC companyfacts (/home/user/ndx/sec_q, 710 spółek; Q4 = rok - Q1..Q3), znany od daty
złożenia raportu (filed). Pokrycie składu S&P 500: 64 % (2010) ... 96 % (2026), braki głównie spółek usuniętych później,
dlatego WSZYSTKIE warianty liczone na tym samym uniwersum: członkowie S&P 500 z danymi SEC. Okres 2011-01 ... 2026-09.
g_k = EPS kwartału k / EPS tego samego kwartału rok wcześniej - 1 (tylko gdy EPS rok wcześniej > 0); g0 = ostatni znany kwartał.
 E0 baza CEM10 na tym uniwersum (6M > 30 %, > SMA 10, ranking 6M, wyjście < SMA 10, SPY < SMA 12, 10 pozycji);
 E1 + g0 > 0 i g0 > g1 (przyspieszenie 1 kwartał); E2 + g0 > g1 > g2 i g0 > 0 (2 kwartały); E3 + g0 >= 25 % (CANSLIM "C").
Filtr działa tylko przy wejściu. Kryterium "lepszy": CAGR > E0 w obu połowach (2011-2018, 2019-2026) i dolna granica 95 %
różnicy miesięcznej vs E0 (bootstrap blokowy 12 mies.) > 0. Charakter rozpoznawczy (CEM10 dobierany na tych latach).
Wynik etapu 15 (2026-11-12): żaden filtr EPS nie spełnia kryteriów; wszystkie obniżają CAGR (E3 istotnie).

## Etap 16: linie trendu w stylu Tori Trades na wykresach miesięcznych (zapisane 2026-11-12 PRZED uruchomieniem)
Tylko strona długa (IKE). Świece miesięczne OHLC skorygowane (tabela m). Log ceny.
Szczyt / dołek lokalny w miesiącu i: high (low) jest najwyższy (najniższy) w oknie i-2 ... i+2; potwierdzony w miesiącu i+2
(linia w miesiącu t używa tylko punktów i <= t-2). Okno szukania: 60 miesięcy.
Czerwona linia: przez 2 szczyty lokalne, nachylenie <= 0, co najmniej 3 szczyty w odległości <= 3 % od linii, rozpiętość >= 6 mies.,
żadne zamknięcie miesiąca nad linią od pierwszego dotknięcia do t-1. Zielona linia: analogicznie dołki, nachylenie >= 0, żadne
zamknięcie pod linią. Przy kilku liniach: najwięcej dotknięć, potem najświeższe ostatnie dotknięcie. Trójkąt: obie linie
istnieją i zielona(t) < czerwona(t).
Przebicie: zamknięcie_t > czerwona(t) przy zamknięciu_{t-1} <= czerwona(t-1). Retest: w miesiącach t+1..t+3 low <= czerwona x 1,03
i zamknięcie >= czerwona x 0,97 -> wejście na zamknięciu miesiąca retestu (bez retestu w 3 mies. lub zamknięcie pod zieloną = brak transakcji).
Wariant bez retestu: wejście na zamknięciu miesiąca przebicia.
Stop: zielona linia przedłużona (low miesiąca < zielona -> wyjście po zielonej albo po otwarciu przy luce). Wyjście A: cel =
cena przebicia x wysokość trójkąta w momencie przebicia (exp(log czerwona - log zielona)), high >= cel -> wyjście po celu.
Wyjście B: sam stop (maks. 60 mies.). Koszt 0,1 %/stronę.
Uniwersa: U1 (prośba użytkownika) = 10 największych spółek S&P 500 po kapitalizacji w miesiącu przebicia (kapitalizacja z
pit_cap2.npy; klasy akcji jednej spółki liczone raz), 2010-2026; U2 (moc statystyczna) = wszyscy członkowie S&P 500, 1998-2026.
Miary: liczba transakcji, trafione, średni / mediana zwrot, R (zysk / ryzyko początkowe), czas trzymania, zwrot nadwyżkowy vs SPY
w tym samym okresie trzymania (średnia, 95 % z bootstrapu po miesiącach wejścia). Strategię uznaję za działającą, jeśli w U2
średni zwrot nadwyżkowy na transakcję ma dolną granicę 95 % > 0 dla co najmniej jednego wariantu (z retestem / bez; A / B) z
korektą Bonferroniego na 4 warianty (granice 98,75 %). U1 raportowane opisowo (mała liczba transakcji).
Wynik etapu 16 (2026-11-12): kryterium niespełnione (U2: żaden wariant nie ma dolnej granicy 98,75 % > 0); U1 tylko 7-10 transakcji.

## Etap 17: filtry dla linii trendu (zapisane 2026-11-12 PRZED uruchomieniem)
Transakcje z etapu 16, uniwersum U2 (S&P 500), wyjście B (sam stop), z retestem i bez (raportowane osobno).
Zamknięta lista filtrów (znane w miesiącu przebicia): F1 SPY > SMA 10 mies.; F2 zwrot 6 mies. > 0; F3 zwrot 6 mies. > 30 %;
F4 zamknięcie > SMA 10 mies.; F5 zamknięcie >= 0,85 x max 12 mies.; F6 zmienność 12 mies. poniżej mediany członków S&P 500
w tym miesiącu; F7 wysokość trójkąta >= 15 %; F8 wysokość trójkąta < 15 %; F9 wolumen miesiąca przebicia >= 1,5 x średniej
12 mies.; F10 obroty powyżej mediany członków; F11 zwrot 12 mies. spółki > zwrot SPY; F12 czerwona linia trwa >= 24 mies.
Procedura: krok 1 (szukanie) na wejściach 1998-2012: dla każdego filtra średnia nadwyżka vs SPY na transakcję i 95 % z bootstrapu
po miesiącach; wybrane = dolna granica 95 % > 0 (jeśli żaden: 2 najlepsze wg dolnej granicy) oraz kombinacja 2 najlepszych.
Krok 2 (sprawdzian, jedno spojrzenie) na wejściach 2013-2026: filtr działa, jeśli dolna granica 95 % nadwyżki > 0
z korektą Bonferroniego na liczbę wybranych filtrów. Wszystkie filtry raportowane w obu okresach dla przejrzystości.
Wynik etapu 17 (2026-11-12): w sprawdzianie 2013-2026 żaden filtr wybrany w 1998-2012 nie działa; sam sygnał też traci przewagę (-3 % vs SPY na transakcję).

## Etap 18: szukanie strategii 50-100 % rocznie (zapisane 2026-11-12 PRZED uruchomieniem)
Rodzina prostych reguł miesięcznych (zamknięta lista, 320 wariantów): uniwersum {S&P 500 point-in-time; 1000 spółek
o największych obrotach 3 mies. z ceną >= 5 USD i filtrem płynności} x ranking {zwrot 1M, 3M, 6M, 12-1} x liczba pozycji
{1, 2, 3, 5, 10} x próg {brak, 6M > 30 %} x wyjście {zamknięcie < SMA 10; rotacja: sprzedaż, gdy spółka wypada poza
2 x N najlepszych lub zamyka < SMA 10} x filtr rynku {brak, brak zakupów przy SPY < SMA 12}. Wejście: zamknięcie > SMA 10.
Równe kwoty przy wejściu, koszt 0,1 % (S&P 500) / 0,25 % (1000 płynnych) na stronę, koniec serii = ostatnia cena.
Procedura: CAGR w okresie wyboru 1998-2012 i w okresie sprawdzianu 2013-2026 (osobne symulacje). Raport: ile wariantów
>= 50 % rocznie w każdym okresie, 10 najlepszych z okresu wyboru i ich wynik w sprawdzianie, korelacja rang między okresami.
Charakter rozpoznawczy: żaden okres nie jest już nietknięty; 2026 (do września) zawiera wyjątkowo silne ruchy.
Wynik etapu 18 (2026-11-12): żaden z 320 wariantów nie daje >= 50 % (ani >= 30 %) rocznie w obu okresach; najlepsze z 1998-2012 dały w 2013-2026 21-35 %.

## Etap 19: spółki napędzające indeks (zapisane 2026-11-15 PRZED uruchomieniem)
Pomysł użytkownika: inwestować w spółki, które napędzają wzrost S&P 500. Wkład spółki i w okresie k miesięcy:
w_i(t-k) x r_i(t-k, t), gdzie w_i = kapitalizacja spółki / suma kapitalizacji członków S&P 500 w miesiącu t-k (pit_cap2.npy,
klasy akcji jednej spółki raz), r_i = zwrot w okresie. Ranking po wkładzie, k = 1, 3, 6, 12. Zasady jak CEM10: skład indeksu
w miesiącu t, wejście: zamknięcie > SMA 10 i wkład > 0; wyjście < SMA 10; brak zakupów przy SPY < SMA 12; N = 5 i 10; koszt 0,1 %.
Okres 2010-01 ... 2026-09 (kapitalizacja wiarygodna od 2010), połowy 2010-2017 i 2018-2026. Porównanie: CEM10 (ranking 6M,
6M > 30 %) na tym samym okresie, SPY, QQQ, losowy wybór (20 prób). Wariant "lepszy od CEM10", jeśli wyższy CAGR w obu połowach
i dolna granica 95 % różnicy miesięcznej (bootstrap blokowy 12 mies.) > 0. Rozpoznawcze (8 wariantów, okres znany).
Wynik etapu 19 (2026-11-15): ranking po wkładzie w indeks bije SPY i losowy wybór, ale żaden wariant nie jest lepszy od CEM10 (gorszy w 2018-2026).

## Etap 20: siła względna vs RSP i SPY (zapisane 2026-11-15 PRZED uruchomieniem, rozpoznawcze)
Ranking po RS 12 mies. (spółka / indeks) = ranking po zwrocie 12 mies. (ten sam mianownik dla wszystkich), więc testowane są filtry.
S&P 500 PIT, zasady CEM10 (6M > 30 %, > SMA 10, ranking 6M, wyjście < SMA 10, SPY < SMA 12), N = 5 i 10, 2005-01 ... 2026-09.
Filtry przy wejściu, osobno dla RSP i SPY: (a) zwrot 12M spółki > zwrot 12M indeksu; (b) linia RS (cena spółki / indeks) > SMA 10 mies.
linii RS; (c) linia RS na maksimum 12 mies. Dodatkowo ranking po RS 12M vs RSP (dla potwierdzenia równoważności z rankingiem 12M).
"Lepszy", jeśli wyższy CAGR w obu połowach (2005-2015, 2016-2026) i dolna granica 95 % różnicy vs CEM10 > 0.
Wynik etapu 20 (2026-11-15): żaden filtr RS (vs RSP ani SPY) nie poprawia CEM10; ranking RS 12M = ranking 12M, gorszy od 6M.
Etap 20b (2026-11-15): RS 6M - ranking = CEM10; filtry zwrot 6M > indeks i RS > SMA 6 nic nie zmieniają; RS na max 6M: +0,05..+0,18 pp/mies. (wszystkie przedziały obejmują 0).

## Etap 21: ranking łączony 1M + 6M (zapisane 2026-11-15 PRZED uruchomieniem)
Wynik spółki = w x ranga percentylowa zwrotu 1M + (1 - w) x ranga percentylowa zwrotu 6M (rangi wśród członków indeksu
w danym miesiącu), w = 0,5 i 1/3. Zasady CEM10: wejście > SMA 10 i 6M > 30 % (oraz wariant bez progu), wyjście < SMA 10,
filtr SPY < SMA 12, koszt 0,1 %. S&P 500 1998-2026 (połowy 1998-2012 / 2013-2026), NDX 2008-2026 (połowy 2008-2016 / 2017-2026),
N = 5 i 10. Porównanie z rankingiem 6M (CEM10) przy tych samych ustawieniach. "Lepszy": wyższy CAGR w obu połowach i dolna
granica 95 % różnicy miesięcznej (bootstrap blokowy 12 mies.) > 0. Rozpoznawcze (okresy znane, 16 porównań).
Wynik etapu 21 (2026-11-15): ranking łączony 1M + 6M gorszy od 6M we wszystkich 16 porównaniach; żaden nie spełnia kryteriów.

## Etap 22: filtr beta 0,9-1,1 (zapisane 2026-11-16 PRZED uruchomieniem)
Pomysł użytkownika: kupować tylko spółki o becie 0,9-1,1. Beta = cov(r_spółki, r_SPY) / var(r_SPY) z TYGODNIOWYCH zwrotów
(tabela w, SPY z rynek_w), liczona na koniec każdego miesiąca z okien 52, 156 i 260 tygodni (1, 3, 5 lat); wymagane >= 80 %
tygodni z danymi. Filtr przy wejściu: 0,9 <= beta <= 1,1; reszta zasad CEM10 (wejście > SMA 10, 6M > 30 % oraz wariant bez progu,
ranking 6M, wyjście < SMA 10, brak zakupów przy SPY < SMA 12, koszt 0,1 %). S&P 500 1998-2026 (połowy 1998-2012 / 2013-2026),
NDX 2008-2026 (połowy 2008-2016 / 2017-2026), N = 5 i 10. Porównanie z CEM10 bez filtra. "Lepszy": wyższy CAGR w obu połowach
i dolna granica 95 % różnicy miesięcznej (bootstrap blokowy 12 mies.) > 0. Dodatkowo opis: rozkład bety spółek kupowanych przez
CEM10 i odsetek kandydatów z betą 0,9-1,1. Rozpoznawcze (24 porównania, okresy znane).
Wynik etapu 22 (2026-11-16): filtr beta 0,9-1,1 obniża CAGR we wszystkich 24 wariantach (S&P ~10-11 %, NDX 4-13 %), w 16 istotnie; mediana bety kupowanych przez CEM10 1,2-1,3, w przedziale 0,9-1,1 tylko 9-18 % zakupów.

## Etap 22b: filtr beta > 1,5 (zapisane 2026-11-16 PRZED uruchomieniem)
Jak etap 22 (te same bety 1 / 3 / 5 lat, zasady, okresy, N, kryterium "lepszy"), ale filtr przy wejściu: beta > 1,5. 24 porównania, rozpoznawcze.
Wynik etapu 22b (2026-11-16): beta > 1,5 - przy N = 5 częściej wyżej, przy N = 10 częściej niżej niż CEM10; wszystkie 24 przedziały różnicy obejmują 0; żaden wariant nie spełnia kryteriów.

## Etap 23: "wzrost w rozsądnej cenie" - P/E względem wzrostu zysku (zapisane 2026-11-16 PRZED uruchomieniem)
Pomysł z filmu (inwestor wartościowy: nie niskie P/E, tylko P/E uczciwe względem tempa wzrostu zysku; forward P/E dla spółek
rosnących). Mechaniczna wersja; elementy uznaniowe (fosa, zarząd, przekonanie) są nietestowalne.
Dane: EPS kwartalny z SEC (/home/user/ndx/sec_q, 710 spółek, pierwsza publikacja, znany od daty złożenia; Q4 = rok - Q1..Q3),
przeliczony na bazę ceny skorygowanej: EPS x adj / close z dnia złożenia (splity). TTM = suma 4 kolejnych kwartałów.
P/E = cena skorygowana na koniec miesiąca / TTM (tylko TTM > 0, P/E <= 100). g1 = TTM / TTM sprzed 4 kwartałów - 1,
g3 = CAGR TTM z 3 lat. PEG = P/E / (100 x g), tylko 10 % <= g <= 100 %.
Uniwersum: członkowie S&P 500 point-in-time z danymi SEC; okres 2011-01 ... 2026-09; połowy 2011-2018 / 2019-2026.
Decyzje co kwartał (koniec lutego, maja, sierpnia, listopada), N = 20 równych kwot, bez rebalancingu; pozycja trzymana, dopóki
spółka jest w top 2N według swojego wskaźnika i spełnia warunki (sprzedaż = "lepsza okazja / za drogo"); koszt 0,1 %/stronę.
Warianty: S1 najniższe P/E (błąd "tanie = niskie P/E"); S2 najniższy PEG z g1; S3 najniższy PEG z g3;
S4 forward PEG z WIEDZĄ O PRZYSZŁOŚCI (faktyczny EPS następnych 4 kwartałów; nie do zrealizowania, górna granica wartości
dobrych prognoz). Odniesienia: równe wagi całego uniwersum (miesięcznie), SPY, CEM10 na tym samym uniwersum (N = 10).
"Lepszy od równych wag": wyższy CAGR w obu połowach i dolna granica 95 % różnicy miesięcznej (bootstrap blokowy) > 0.
Ograniczenie: lista 710 spółek SEC to w dużej części obecni członkowie indeksów (przeżywalność) - porównania tylko wewnątrz uniwersum.
Wynik etapu 23 (2026-11-16): niskie P/E i PEG (1 i 3 lata) ~10,2 % rocznie, poniżej równych wag uniwersum (12,8 %) i SPY (14,1 %); forward PEG z faktycznym przyszłym zyskiem 22,8 % (nierealne); CEM10 na tym samym uniwersum 21,9 %.

## Etap 24: CEM10 z limitem udziału pozycji (zapisane 2026-11-16 PRZED uruchomieniem)
Pomysł z filmu: przycinanie pozycji, która urosła za bardzo. Na koniec każdego miesiąca (po wyjściach, przed zakupami) pozycja
większa niż L kapitału jest sprzedawana do L. L = 10 % (wskazane przez użytkownika), dodatkowo 15 % i 20 %. Nadwyżka:
(a) czeka w gotówce (0 %) i jest używana do zakupów nowych pozycji przy wolnych miejscach (nowa = kapitał / N, jak w CEM10);
(b) gotówka ponad potrzeby zakupów trzymana w SPY. Odniesienia: CEM10 bez limitu, CEM10 z miesięcznym rebalancingiem do równych wag.
N = 10 i 20 (przy N = 10 równa waga = 10 %, więc limit 10 % przycina każdego zwycięzcę). Zasady CEM10 (6M > 30 %, > SMA 10, ranking 6M,
wyjście < SMA 10, SPY < SMA 12), koszt 0,1 %/stronę od każdej transakcji (także przycięć). S&P 500 1998-2026 (połowy 1998-2012 /
2013-2026), NDX 2008-2026 (połowy 2008-2016 / 2017-2026). "Lepszy": wyższy CAGR w obu połowach i dolna granica 95 % różnicy > 0. Rozpoznawcze.
Wynik etapu 24 (2026-11-16): limit 10 % obniża CAGR CEM10 (S&P N=10 18,1 vs 19,0 %, NDX N=10 21,1 vs 23,6 %, istotnie), lekko spłyca spadki; limity 15-20 % bez istotnej zmiany; nadwyżka w SPY pogłębia DD; żaden wariant nie spełnia kryteriów.

## Etap 24b: rebalancing raz w roku (zapisane 2026-11-16 PRZED uruchomieniem)
Jak etap 24, ale wyrównanie wszystkich pozycji do kapitał / N raz w roku (koniec grudnia); dla porównania co kwartał
(marzec, czerwiec, wrzesień, grudzień) i co miesiąc. Pozostałe zasady, okresy, N i kryterium bez zmian. Rozpoznawcze.
Wynik etapu 24b (2026-11-16): rebalancing (rocznie, kwartalnie, miesięcznie) nie poprawia CEM10; żaden wariant nie spełnia kryteriów (szczegóły w wyniki/r41_rebal_rok.md).

## Etap 25: arkusz użytkownika - PEG i wartość wewnętrzna Lyncha (zapisane 2026-11-16 PRZED uruchomieniem)
Arkusz: P/E = cena / EPS (TTM); g = oczekiwany wzrost EPS w % (użytkownik: średni wzrost rok do roku z poprzednich lat);
PEG = P/E / g; wartość wewnętrzna = g x EPS (P/E "uczciwe" = tempo wzrostu, Peter Lynch); potencjał = wartość / cena - 1.
Uwaga: potencjał = 1 / PEG - 1, więc oba wskaźniki dają ten sam ranking; "wartość > cena" = PEG < 1.
Odtworzenie historyczne: EPS TTM z SEC (jak etap 23, baza ceny skorygowanej), g = średnia arytmetyczna K ostatnich zmian r/r
EPS TTM (co 12 mies.), K = 3 i 5; wszystkie EPS w łańcuchu > 0, g > 0, bez górnego limitu g i P/E (jak w arkuszu).
Warianty: A_K top 20 najniższy PEG, decyzje kwartalne, trzymaj dopóki w top 40 (jak etap 23); B_K wszystkie spółki z PEG < 1
(wartość > cena), równe wagi, przebudowa co kwartał; C CEM10 (N = 10) tylko spółki z PEG_3 < 1 przy wejściu.
Uniwersum, okres, koszty, odniesienia i kryterium "lepszy" jak etap 23 (równe wagi uniwersum, SPY, CEM10 na tym uniwersum).

## Etap 25b: wartość z arkusza jako prognoza ceny za rok (zapisane 2026-11-16 PRZED uruchomieniem)
Doprecyzowanie użytkownika: wartość wewnętrzna (g x EPS) = cena, jakiej można się spodziewać za rok. Sprawdzian prognozy:
dla par (spółka, koniec lutego / maja / sierpnia / listopada) 2011-2025 z uniwersum etapu 25: prognoza = g x EPS / cena - 1,
faktycznie = cena skorygowana za 12 mies. / cena - 1 (bez dywidend poza korektą ceny). Miary: mediana i średnia faktycznej
zmiany w decylach prognozy; odsetek przypadków, gdy cena za rok >= wartość; mediana błędu (faktyczna - prognoza); średnia
korelacja rang (IC) prognozy z faktyczną zmianą per data z t-statystyką Newey-West (lag 4). K = 3 i 5. Opisowe.

## Etap 26: jak szacować wzrost zysku i ile akcja rośnie w rok (zapisane 2026-11-16 PRZED uruchomieniem)
Pytanie użytkownika: jak poprawnie "interpolować" wzrost i ile akcja może urosnąć w rok. Opisowe.
(a) Trafność prognoz wzrostu EPS TTM na następny rok (spółki z danymi SEC, końce kwartałów 2012-2025, TTM bieżący > 0):
E1 średnia arytmetyczna 3 zmian r/r (arkusz), E2 średnia 5 zmian r/r, E3 CAGR 3 lata, E4 CAGR 5 lat, E5 mediana 5 zmian r/r,
E6 nachylenie regresji log(TTM) z 5 lat (20 kwartałów, wymagane wszystkie TTM > 0), E7 ostatnia zmiana r/r, E8 zero (brak wzrostu),
E9 CAGR 3 lata obcięty do 0-30 %, E10 CAGR 3 lata przychodów (TTM). Cel: faktyczna zmiana EPS TTM za 4 kwartały.
Miary: średnia korelacja rang per kwartał (IC), mediana błędu bezwzględnego, odsetek błędów <= 10 pp, nachylenie regresji
faktycznej zmiany na prognozę (odporna: regresja kwantylowa mediany) = trwałość wzrostu.
(b) Rozkład 12-mies. zmiany ceny (skorygowanej) członków S&P 500 point-in-time 1998-2025: percentyle 5/25/50/75/95, odsetek
> +50 % i > +100 %, w podziale na kwintyle faktycznego (z wiedzą o przyszłości) wzrostu EPS w tym samym roku (2012-2025).
Wynik etapu 25 (2026-11-16): portfele z arkusza 8,7-11,5 % rocznie, poniżej równych wag (12,8 %) i SPY (14,1 %); CEM10 z filtrem PEG < 1 10,6 % vs 21,9 %. Żaden lepszy.
Wynik etapu 25b (2026-11-16): wartość g x EPS nie przewiduje ceny za rok (IC -0,001 i -0,011, decyle płaskie ~ +11 %).
Wynik etapu 26 (2026-11-16): wszystkie prognozy z przeszłego wzrostu EPS mają UJEMNE IC (-0,10..-0,19) - wzrost zysku wraca do średniej; najmniejszy błąd dają "zero" i obcięty CAGR (~25-27 pp); tylko wzrost przychodów ma słabo dodatnie IC. Roczna zmiana ceny S&P 500: mediana +9,5 %, 50 % w -9..+29 %, 90 % w -41..+69 %.

## Etap 27: forward PEG i wartość wewnętrzna z CAGR "od początku" z korektą (zapisane 2026-11-16 PRZED uruchomieniem)
Metoda użytkownika: g = CAGR EPS TTM od pierwszego dodatniego TTM w danych SEC (ok. 2008-2010) do bieżącego (okno rosnące,
min. 3 lata, oba > 0); co kwartał liczone na nowo z nowymi danymi. EPS za rok = EPS x (1 + g). Forward P/E = cena / EPS za rok;
forward PEG = forward P/E / (100 g); wartość wewnętrzna IV = EPS x 100 g (arkusz); potencjał = IV / cena - 1.
Korekta (wariant K): co kwartał regresja mediany faktycznego wzrostu TTM za rok na prognozę g ze WSZYSTKICH wcześniejszych par
(spółka, data), których wynik był już znany (min. 500 par); g_kor = a + b g; IV_kor = EPS x 100 g_kor.
Sprawdziany: (1) trafność g i g_kor dla wzrostu EPS (IC, mediana błędu) i IV/cena dla zmiany ceny za rok (IC, decyle);
(2) portfele jak etap 25: top 20 najwyższy potencjał IV (= najniższy PEG trailing), top 20 najniższy forward PEG,
wszystkie z IV > cena, wszystkie z forward PEG < 1, top 20 najwyższy potencjał IV_kor; równe wagi, decyzje kwartalne.
Uniwersum, okres (2011-2026, połowy 2011-2018 / 2019-2026), koszty, odniesienia i kryterium "lepszy" jak etap 25.
Wynik etapu 27 (2026-11-16): żaden portfel nie lepszy od równych wag (najlepszy: wszystkie z forward PEG < 1, 12,6 % vs 12,8 %); korekta uczy się ujemnego nachylenia (-0,07..-0,13); IV nie przewiduje ceny za rok (IC -0,008 i 0,000).

## Etap 27b: przeszły CAGR EPS a przyszły wzrost EPS w przedziałach (zapisane 2026-11-16 PRZED uruchomieniem, opisowe)
Dla końców kwartałów 2012-2025 (spółki z danymi SEC, TTM > 0): przeszły CAGR EPS TTM (3 lata, 5 lat, od początku danych, min. 3 lata)
w przedziałach < 0, 0-10, 10-20, 20-30, 30-50, > 50 %; w każdym: mediana i kwartyle faktycznej zmiany EPS za 1 rok, odsetek
przypadków, gdy faktyczny wzrost >= przeszły CAGR, oraz faktyczny CAGR za kolejne 3 lata (gdy dostępny, oba końce > 0).
Wynik etapu 27b (2026-11-16): im wyższy przeszły CAGR EPS, tym niższy przyszły wzrost (CAGR 3 l. > 50 %: mediana za rok -5 %, za 3 lata 5 %/rok; < 0 %: +28 % / 23 %/rok); kolejne lata zbiegają do ~10 %.

## Etap 28: wartość wewnętrzna z prognozą jakości analityków (zapisane 2026-11-16 PRZED uruchomieniem)
Historii konsensusu analityków brak (EODHD fundamentals niedostępne w tym planie: 403). Symulacja: g_hat = faktyczny wzrost
EPS TTM za 4 kwartały (wiedza o przyszłości) + błąd; błąd ~ N(b, s): (s, b) = (0, 0) idealna prognoza, (10 pp, +5 pp),
(20 pp, +5 pp), (35 pp, +5 pp) (analitycy są przeciętnie zbyt optymistyczni); ziarno 20261116. Odniesienie: g = 10 % dla wszystkich.
IV = EPS TTM x 100 g_hat (arkusz, tylko g_hat > 0); potencjał = IV / cena - 1. Sprawdziany (decyzje kwartalne 2011-2025):
(1) IC potencjału z faktyczną zmianą ceny za rok i kwintyle; (2) portfele: top 20 najwyższy potencjał (trzymaj w top 40) i
wszystkie z IV > cena, jak etap 27. Uniwersum, okres, koszty, odniesienia jak etap 27. Opisowe (wiedza o przyszłości - nierealne).
Wynik etapu 28 (2026-11-16): z wiedzą o przyszłym wzroście (nawet z błędem 35 pp) top 20 IV daje 24-27 % rocznie; bez prognozy (g = 10 %) 10 %. IV porządkuje spółki (IC 0,08-0,14), ale jako cena docelowa myli się o ~70 pp. Symulowany błąd jest niezależny od informacji rynku - zawyża wynik względem konsensusu, który jest już w cenie.

## Etap 29: strategia użytkownika - PEG <= 1, top N po potencjale IV, roczna przebudowa, kwartalne przycinanie (zapisane 2026-11-16 PRZED uruchomieniem)
Kandydaci: forward PEG <= 1 (PEG = cena / (EPS x (1 + g)) / (100 g), g > 0) i IV > cena (IV = EPS x 100 g), ranking malejąco po
potencjale IV / cena - 1; N = 10 i 20. Przebudowa raz w roku (koniec lutego): (R1) trzymaj pozycję, dopóki ma potencjał
(IV > cena i PEG <= 1), (R2) trzymaj tylko, jeśli nadal w top N; wolne miejsca = kolejni z rankingu, kwota = kapitał / N
(z dostępnej gotówki). Co kwartał (luty, maj, sierpień, listopad) pozycja > L kapitału przycinana do L, L = 7 % i 10 %
(oraz bez przycinania); gotówka czeka (0 %) do następnej przebudowy rocznej. Wzrost g: (A) CAGR EPS od początku danych
(metoda z etapu 27, realna), (B) faktyczny wzrost + błąd N(+5 pp, 10 pp) (symulacja jakości analityka, wiedza o przyszłości,
nierealne, górna granica). Koszt 0,1 %/stronę (także przycięcia). Uniwersum, okres, połowy, odniesienia, kryterium jak etap 27.
Wynik etapu 29 (2026-11-16): wersja realna (CAGR od początku) 7,1-11,7 %, żadna nie lepsza od równych wag; z prognozą jakości analityka (nierealne) 15-20 %, 10 z 12 lepszych; przycinanie 7 % kosztuje 4-5 pp przy N = 10.

## Etap 29b: rozkład różnicy etap 28 (26 %) vs etap 29 (18-20 %) (diagnostyka, 2026-11-16)
Wariant B (prognoza jak analityk), N = 20 i 10, bez przycinania: częstotliwość decyzji (kwartalnie, trzymaj w top 2N jak etap 28 /
raz w roku jak etap 29 R1) x filtr PEG <= 1 (bez / z).
Wynik etapu 29b: różnica wynika z częstotliwości decyzji (kwartalnie 26,4 % vs raz w roku 16-20 %); filtr PEG <= 1 nie szkodzi (przy rocznych decyzjach pomaga +1,3..+4 pp). Kwartalne decyzje z prognozą opartą na przyszłości korzystają z niej częściej - to część przewagi nierealnej.

## Etap 29c: sprawdzanie PEG i wartości (fair value) co miesiąc (zapisane 2026-11-16 PRZED uruchomieniem)
Jak etap 29 (PEG <= 1 i IV > cena = akcja "tania", ranking po potencjale IV), bez przycinania, ale decyzje: co miesiąc / co kwartał /
raz w roku. Trzymanie: (R1) dopóki tania (IV > cena i PEG <= 1), (R3) dopóki w top 2N. Wolne miejsca = kolejni z rankingu, kwota =
kapitał / N z gotówki. Wzrost A (CAGR EPS od początku, realne) i B (jak analityk, nierealne). N = 10 i 20. Reszta jak etap 29.
Wynik etapu 29c (2026-11-16): realne (CAGR EPS) 8,7-12,5 %, żaden lepszy; z prognozą jak analityk co miesiąc 26-27 % (DD -21..-28 %), co kwartał podobnie, raz w roku 18-20 %.

## Etap 30: wzrost z ważonej średniej kwartalnych zmian przychodów r/r (metoda użytkownika) (zapisane 2026-11-16 PRZED uruchomieniem)
Metoda użytkownika: g = 0,1 x gQ(t-3) + 0,2 x gQ(t-2) + 0,3 x gQ(t-1) + 0,4 x gQ(t), gdzie gQ = zmiana r/r przychodów kwartału
(4 ostatnie znane kwartały, kolejne, odstępy 75-110 dni; kwartał rok wcześniej > 0; znany od późniejszej daty złożenia z obu).
Wariant: średnia arytmetyczna tych 4 zmian. g używane jako prognoza wzrostu EPS na następny rok: IV = EPS TTM x 100 g, PEG = P/E / (100 g),
forward PEG jak etap 29. Sprawdziany: (1) IC g z faktyczną zmianą EPS TTM za 4 kwartały i potencjału IV z ceną za rok (decyzje kwartalne);
(2) portfele jak etap 29c: kandydaci PEG <= 1 i IV > cena, ranking po potencjale, N = 10 i 20, decyzje co miesiąc / kwartał / rok,
trzymanie dopóki tania (R1) albo w top 2N (R3), bez przycinania. Uniwersum, okres 2011-2026, koszty, odniesienia, kryterium jak etap 29c.
Wynik etapu 30 (2026-11-16): ważony wzrost przychodów najlepiej z historycznych prognoz przewiduje wzrost EPS (IC 0,133, t 11,8), ale potencjał IV z nim nie przewiduje ceny (IC -0,04); portfele 10,8-15,8 % (najlepszy N=10 co miesiąc 14,6 % ważona / 15,8 % arytm.), żaden nie spełnia kryteriów; wynik w całości z 2019-2026 (2011-18: 2,7-6,4 %).

## Etap 31: EPS 5 lat > 15 % i niskie forward P/E (zapisane 2026-11-16 PRZED uruchomieniem)
Strategia użytkownika: kandydaci = CAGR EPS TTM z 5 lat > 15 % (oba końce > 0, znane na datę decyzji); ranking rosnąco po forward P/E =
cena / (EPS TTM x (1 + g)), tylko forward EPS > 0. g (estymata wzrostu EPS): (A) ważona średnia kwartalnych zmian przychodów r/r (etap 30,
metoda użytkownika), (B) g = 0 (zwykłe trailing P/E, kontrola: czy estymata coś dodaje), (C) faktyczny wzrost + błąd 10 pp (jak analityk, nierealne).
N = 10 i 20; decyzje co miesiąc / kwartał / rok; trzymanie (R1) dopóki spełnia warunek EPS 5 lat > 15 %, (R3) dopóki w top 2N.
Uniwersum, okres 2011-2026, koszty, odniesienia, kryterium "lepszy" jak etap 29c. 36 wariantów, rozpoznawcze.
Poprawka etapu 31 (2026-11-16, PRZED wynikami; pierwsze uruchomienie przerwane bez wyników): użytkownik doprecyzował regułę: zamiast progu
EPS 5 lat > 15 % -> co decyzję 40 spółek z najwyższym CAGR EPS z 5 lat (wśród członków S&P 500 z dodatnim EPS), z nich 10 z najniższym
forward P/E. N = 10 (dodatkowo 20 dla porównania). Trzymanie: (R1) dopóki spółka jest w top 40 po EPS 5 lat, (R3) dopóki w top 2N rankingu forward P/E
wśród tej czterdziestki. Reszta bez zmian.
Wynik etapu 31 (2026-11-16): top 40 po EPS 5 lat + najniższe forward P/E: 5,9-10,9 % rocznie, wszystkie poniżej równych wag (12,8 %); 2011-2018 ok. 0 %; estymata z przychodów dodaje ok. +1 pp względem trailing P/E.

## Etap 32: GARP (wzrost w rozsądnej cenie, wersja Lyncha) (zapisane 2026-11-16 PRZED uruchomieniem)
Reguły (z literatury, bez dopasowania do wyników): (1) umiarkowany wzrost: CAGR EPS TTM z 5 lat w przedziale 10-30 % (wyklucza odbicia
z niskiej bazy i spółki cykliczne na szczycie), (2) stabilność: EPS TTM > 0 w każdym z 6 punktów rocznych i wzrost r/r w co najmniej 4 z 5 lat,
(3) wzrost trwa: ważona średnia kwartalnych zmian przychodów r/r (etap 30) > 5 %, (4) cena: PEG = P/E / (100 g) <= 1, gdzie g = mniejsza z
(CAGR EPS 5 lat, ważony wzrost przychodów) - konserwatywnie. Ranking rosnąco po PEG, N = 10 i 20, decyzje co miesiąc i co kwartał,
trzymanie dopóki spełnia warunki (R1). Warianty: G1 pełny GARP; G2 bez warunku stabilności; G3 pełny GARP + zamknięcie miesiąca nad SMA 10
(trend, jak w CEM10). Uniwersum, okres 2011-2026, koszty, odniesienia i kryterium "lepszy" jak etap 29c. Rozpoznawcze (12 wariantów).
Wynik etapu 32 (2026-11-16): reguły zbyt ostre - kandydatów w miesiącu mediana 1-4,5, portfel głównie w gotówce, CAGR 0,1-4,2 %; test nieinformacyjny.
Odstępstwo 10 / etap 32b (zapisane PO wyniku etapu 32, PRZED uruchomieniem 32b; wynik 32 znany tylko co do liczby kandydatów i zwrotu):
g = CAGR EPS z 5 lat (jak u Lyncha, bez minimum z przychodami), filtry (1) EPS 5 lat 10-30 %, (2) stabilność >= 4 z 5 lat, (3) ważony wzrost przychodów > 5 %;
ranking rosnąco po PEG = P/E / (100 g); warianty progu: bez progu (zawsze top N) i PEG <= 1,5; G3 jak wyżej + nad SMA 10. Reszta jak etap 32.
Diagnostyka etapów 31 i 32b (2026-11-16): CAGR EPS 5 lat wymaga TTM sprzed 5 lat, a dane SEC zaczynają się ok. 2009-2010 -> w 2011-2014 mogło brakować kandydatów (portfel w gotówce). Ponowne uruchomienie z liczbą kandydatów wg lat i CAGR od 2015-03 (porównanie z równymi wagami od tej samej daty).
Wynik etapu 32b (2026-11-16): dane EPS 5 lat dostępne od 2015 (2011-2014 bez kandydatów). Od 2015-03: GARP 4,2-11,9 % vs równe wagi 11,4 %; etap 31 od 2015-03: metoda użytkownika 9,8-12,6 %, trailing P/E 8,4-13,1 %, jak analityk 11,4-15,5 %.

## Etap 33: strategia użytkownika - szybki wzrost EPS i przychodów, PEG z estymaty, przycinanie, cena docelowa (zapisane 2026-11-16 PRZED uruchomieniem)
Decyzje co miesiąc, 10 miejsc (nowa pozycja = kapitał / 10). g = ważona średnia kwartalnych zmian przychodów r/r (etap 30, estymata użytkownika).
Kandydaci: EPS TTM > 0, wzrost EPS TTM r/r >= 25 % i g >= 25 %; ranking malejąco po wzroście EPS TTM r/r (najszybciej rosnące);
kupno tylko przy PEG = P/E / (100 g) <= 1. Trzymane pozycje: PEG > 1 i udział > 7 % -> przycięcie do 7 % (gotówka czeka na kolejne zakupy).
Sprzedaż całości, gdy: (a) pogorszenie: wzrost EPS TTM r/r albo g niższe niż 3 miesiące wcześniej (wariant P) / spadek: EPS TTM r/r < 0 albo
ostatni kwartał przychodów r/r < 0 (wariant S); (b) cena docelowa = mediana P/E z ostatnich 36 mies. (tylko P/E > 0, min. 12 mies.) x EPS TTM x (1 + g)
niższa niż 3 miesiące wcześniej. Warianty: P i S, każdy z regułą (b) i bez niej, z przycinaniem i bez (8 wariantów). Koszt 0,1 %/stronę.
Uniwersum: członkowie S&P 500 z danymi SEC, 2011-2026 (połowy 2011-2018 / 2019-2026) i od 2015-03. Odniesienia: równe wagi, SPY, CEM10 (etap 27).
"Lepszy": wyższy CAGR w obu połowach i dolna granica 95 % różnicy vs równe wagi > 0. Rozpoznawcze.
Wynik etapu 33 (2026-11-16): 6,7-11,4 % rocznie (od 2015: 6,4-12,8 % vs równe wagi 11,4 %, CEM10 25,9 %); najlepsze: sprzedaż tylko przy spadku r/r, bez ceny docelowej i bez przycinania (11,4 %); wariant 'pogorszenie' istotnie gorszy od równych wag.

## Etap 34: screener użytkownika (Scrab) - mały indeks top 10 po potencjale ceny docelowej (zapisane 2026-11-16 PRZED uruchomieniem)
Kryteria ze screenshotu i ich odtworzenie z danych dostępnych na datę decyzji (prognoz analityków i ich cen docelowych brak w historii):
forward PEG <= 1,5 (cena / (EPS TTM x (1 + g)) / (100 g)); wzrost EPS na 2 lata >= 10 % -> g >= 10 % (g = ważona średnia kwartalnych zmian
przychodów r/r, estymata użytkownika); P/E (TTM) <= 40 i > 0; ROE >= 15 % (zysk netto TTM / ostatni kapitał własny > 0, SEC); dług / kapitał <= 1
(dług = LongTermDebt albo część długoterminowa + bieżąca, + krótkoterminowe pożyczki i commercial paper; brak tagów długu = 0);
potencjał ceny docelowej >= 50 %, cena docelowa = mediana P/E z 36 mies. x EPS TTM x (1 + g) (definicja użytkownika z etapu 33).
Co miesiąc ranking malejąco po potencjale, portfel = top 10 (równe kwoty dla nowych; wypadnięcie z top 10 = sprzedaż, wolne miejsce = kolejna
z rankingu). Warianty: Z1 pełny screener; Z2 bez progu potencjału 50 % (sam ranking); Z3 jak Z1, decyzje co kwartał; Z4 jak Z1 z g jak analityk
(faktyczny wzrost EPS + błąd 10 pp, nierealne). Uniwersum S&P 500 PIT z danymi SEC, 2011-2026 i od 2015-03; koszty, odniesienia, kryterium jak etap 33.
Wynik etapu 34 (2026-11-16): z estymatą użytkownika (przychody ważone) 6,7-12,8 % (równe wagi 12,8 %, od 2015 9,7-12,9 % vs 11,4 %); z prognozą jak analityk (nierealne) 25,2 % (od 2015 30,3 %, CEM10 25,9 %). Ograniczenia: cena docelowa = formuła użytkownika, nie analityków; brak tagów długu w SEC = D/E 0.

## Etap 35: co w fundamentach 5 lat wcześniej wskazywało największych wygranych (zapisane 2026-11-17 PRZED uruchomieniem, opisowe)
Kohorty: koniec marca 2011 ... 2021 (11 lat); spółki = członkowie S&P 500 point-in-time z danymi SEC. Wynik: maksymalny zwrot w 5 lat =
max(zamknięcie miesiąca w t+1 ... t+60) / zamknięcie w t - 1 (ceny skorygowane), dodatkowo zwrot po 5 latach. "Wielki wygrany" = górne 10 % maks. zwrotu w kohorcie.
Cechy (znane na t, wg dat złożenia raportów): EPS TTM (baza ceny skorygowanej): wzrost r/r 1 rok, CAGR 2 / 3 / 5 lat, przyspieszenie (wzrost 1 r. teraz - rok
wcześniej), liczba lat wzrostu z 5; przychody TTM: wzrost 1 rok, CAGR 2 / 3 / 5 lat, ostatni kwartał r/r, ważona średnia kwartałów (estymata użytkownika),
przyspieszenie; marża operacyjna TTM, zmiana 1 i 3 lata; wycena: E/P (zysk netto TTM / kapitalizacja), P/E (dodatnie), S/P (przychody / kapitalizacja),
PEG (P/E / CAGR EPS 3 lata), forward P/E i potencjał ceny docelowej użytkownika (mediana P/E 36 mies. x EPS x (1 + estymata)); jakość: ROE, dług / kapitał;
wielkość: log kapitalizacji; kontrole cenowe: zwrot 6 i 12 mies.
Miary: korelacja rang (Spearman) cechy z maks. zwrotem w każdej kohorcie, średnia i t (kohorty jako niezależne obserwacje, n = 11, dla cech 5-letnich mniej);
zgodność znaku w kohortach 2011-2015 i 2016-2021; odsetek wielkich wygranych w kwintylach cechy; mediany cech wielkich wygranych vs reszty.
Wielokrotne testy: ~30 cech -> próg Bonferroniego |t| > 3,3 (5 % / 30). Ograniczenia: lista spółek SEC to głównie obecni członkowie indeksów (przeżywalność),
kohorty nakładają się w czasie (okna 5-letnie).
Wynik etapu 35 (2026-11-17): próg Bonferroniego przechodzą tylko CAGR przychodów 5 lat i liczba lat wzrostu EPS (oba tylko 7 kohort 2015-2021); żadna miara wyceny nie wskazywała przyszłych wielkich wygranych; korelacje <= 0,10.

## Etap 36: wybór po wzroście przychodów 5 lat (vs EPS 5 lat), dług / kapitał < 1, PEG tylko jako moment wejścia (zapisane 2026-11-17 PRZED uruchomieniem)
Pomysł użytkownika po etapie 35. Co roku na koniec marca lista docelowa = top N członków S&P 500 (z danymi SEC) po rankingu: (R) CAGR przychodów TTM z 5 lat
albo (E) CAGR EPS TTM z 5 lat; filtr dług / kapitał < 1 (wariant z filtrem i bez). Sprzedaż w marcu, gdy spółka wypadła z top 2N listy.
Wejście (sprawdzane co miesiąc dla spółek z listy, których nie mamy, przy wolnym miejscu): (W0) od razu; (W1) PEG <= 1; (W2) PEG <= 1,5;
PEG = P/E TTM / (100 x CAGR EPS 5 lat) (EPS > 0, CAGR > 0); niespełnione = gotówka (0 %) czeka. N = 10 i 20; kwota = kapitał / N. Koszt 0,1 %/stronę.
Okres 2015-03 ... 2026-09 (dane 5-letnie od 2015). Odniesienia od 2015-03: równe wagi uniwersum, SPY, CEM10 na tym samym uniwersum.
"Lepszy": wyższy CAGR w obu połowach (2015-03 ... 2020-12, 2021-01 ... 2026-09) i dolna granica 95 % różnicy vs równe wagi > 0. Rozpoznawcze (24 warianty).
Wynik etapu 36 (2026-11-17): ranking po przychodach 5 lat + dług < 1, kupno od razu, N = 20: 18,9 % rocznie (równe wagi 11,4 %, SPY 13,9 %, CEM10 25,9 %), lepszy w obu połowach, przedział różnicy obejmuje 0; PEG jako moment wejścia obniża wynik; EPS 5 lat zamiast przychodów ~ rynek.

## Etap 37: przychody 5 lat > +50 %, FCF > 0, PEG z wykładniczej projekcji EPS (zapisane 2026-11-17 PRZED uruchomieniem)
Doprecyzowanie użytkownika po etapie 36. Filtry na koniec marca: łączny wzrost przychodów TTM w 5 lat > +50 % (CAGR > 8,45 %); FCF z ostatniego
rocznego raportu (przepływy operacyjne - capex, SEC, znane na datę) > 0; dług / kapitał < 1 (jak etap 36). PEG = P/E TTM / (100 g), g = CAGR EPS z 5 lat
(projekcja wykładnicza EPS x (1 + g)^n na kolejne 5 lat ma to samo roczne tempo). Warianty (N = 10 i 20, lista co marzec, sprzedaż po wypadnięciu z top 2N):
F1 ranking po CAGR przychodów, kupno od razu; F2 jak F1, wejście przy PEG <= 1; F3 jak F1, wejście przy PEG <= 1,5; F4 ranking rosnąco po PEG (PEG jako wybór),
kupno od razu; F5 jak F1 bez filtra długu; F6 CAGR przychodów > 50 % rocznie (dosłowne odczytanie), FCF > 0, dług < 1, od razu.
Okres, koszty, odniesienia i kryterium jak etap 36. Rozpoznawcze (12 wariantów).
Wynik etapu 37 (2026-11-17): F1 (przychody 5 l. > +50 %, FCF > 0, dług < 1, ranking po przychodach, od razu) N = 20: 19,1 % rocznie, N = 10: 16,8 %; filtr FCF ~ bez zmian vs etap 36; PEG jako wejście i jako ranking obniża wynik; >50 % rocznie - za mało spółek.

## Etap 38: Lynch PEG = P/E / PRZYSZŁY wzrost EPS, PEG < 2, ROE > 15 %, dług < 1, przychody 5 lat > +50 %, 10 spółek co rok (zapisane 2026-11-17 PRZED uruchomieniem)
Uwaga użytkownika: PEG Lyncha używa przyszłego wzrostu EPS (w etapach 36-37 g = przeszły CAGR EPS 5 lat). Historii prognoz brak, więc g (przyszły wzrost EPS)
w trzech wersjach: (A) estymata użytkownika - ważona średnia kwartalnych zmian przychodów r/r; (B) przeszły CAGR EPS 5 lat (projekcja); (C) faktyczny wzrost
EPS TTM za 4 kwartały + błąd N(+5 pp, 10 pp) (jak analityk, nierealne). PEG = P/E TTM / (100 g), tylko EPS > 0 i g > 0.
Na koniec marca: filtry łączny wzrost przychodów 5 lat > +50 %, ROE > 15 %, dług / kapitał < 1, PEG < 2; z przechodzących 10 spółek wg rankingu
(R) CAGR przychodów 5 lat malejąco albo (P) PEG rosnąco; portfel = dokładnie ta dziesiątka do następnego marca (wymiana spółek spoza nowej dziesiątki).
Wariant kontrolny bez filtra PEG (ranking R). Okres 2015-03 ... 2026-09, koszty, odniesienia i kryterium jak etap 36. Rozpoznawcze (7 wariantów).
Technicznie: macierze wskaźników zapisywane do /home/user/ndx/wskazniki_cache.npz (kolejne etapy bez ponownego liczenia).
Uzupełnienie etapu 38 (2026-11-17, PRZED wynikami): użytkownik dodał filtr kapitalizacji > 10 mld USD (large cap; kapitalizacja point-in-time
/home/user/ndx/pit_cap2.npy na koniec marca). Warianty etapu 38 liczone dodatkowo z tym filtrem (skrypt r59b z cache wskaźników); wyniki obu wersji raportowane.
Wynik etapu 38/38b (2026-11-17): filtr > 10 mld podnosi wynik (kontrola bez PEG: 16,1 -> 20,9 %); PEG < 2 z realną estymatą obniża (> 10 mld: 15,2-16,8 %); tylko PEG z wiedzą o przyszłości (C) daje istotną przewagę (18,1-20,1 %).

## Etap 39: przychody rosną co roku o >= 10 % przez 5 lat ("słupki rosną") + ROE, dług, > 10 mld, PEG < 2; miary ryzyka (zapisane 2026-11-17 PRZED uruchomieniem)
Doprecyzowanie użytkownika: zamiast łącznego wzrostu przychodów 5 lat > +50 % - każda z 5 zmian rocznych przychodów TTM (t vs t-1 rok, ..., t-4 vs t-5)
>= +10 % (łącznie wtedy >= +61 %). Reszta jak etap 38b z filtrem > 10 mld: ROE > 15 %, dług / kapitał < 1; warianty: bez PEG (ranking po CAGR przychodów 5 lat),
PEG Lyncha < 2 z estymatą użytkownika (ranking po przychodach / po najniższym PEG), PEG < 2 z przeszłym CAGR EPS 5 lat (ranking po przychodach);
dla porównania te same warianty z warunkiem łącznym (etap 38b). Dodatkowe miary: maks. spadek, Sharpe (miesięczny, bez stopy wolnej), Calmar = CAGR / |maxDD|,
średni udział w akcjach. 10 spółek co marzec, 2015-03 ... 2026-09. Rozpoznawcze.
Wynik etapu 39 (2026-11-17): warunek "co roku >= +10 %" przy > 10 mld daje 0-13 kandydatów w marcu (portfel 27-60 % w akcjach), CAGR 4,5-6,8 % - test nieinformacyjny.
Etap 39b (zapisane PO wyniku 39, PRZED uruchomieniem, odstępstwo 11): łagodniejsze wersje "słupków": (S2) >= +10 % w co najmniej 4 z 5 lat i łącznie > +50 %;
(S3) przychody nie spadają w żadnym roku (każda zmiana roczna > 0 %) i łącznie > +50 %. Reszta jak etap 39.
Wynik etapu 39b (2026-11-17): ostrzejsze warunki stabilności przychodów zmniejszają liczbę spółek i wynik (S1 4,5-6,8 %, S2 11-16 %, S3 8,8-12,4 % vs łącznie > +50 %: 15,2-20,9 %); PEG < 2 obniża maks. spadek o 7-20 pp kosztem 4-5 pp CAGR, Calmar podobny lub nieco lepszy.

## Etap 40: po prostu top 10 po CAGR przychodów 5 lat (zapisane 2026-11-17 PRZED uruchomieniem)
Ranking malejąco po CAGR przychodów TTM z 5 lat wśród członków S&P 500 z danymi SEC; 10 równych pozycji; dokładnie top 10 (wymiana spoza dziesiątki).
Warianty filtrów: (a) bez filtrów, (b) kapitalizacja > 10 mld, (c) > 10 mld + dług / kapitał < 1, (d) > 10 mld + dług < 1 + ROE > 15 % (= kontrola etapu 38b).
Przebudowa: raz w roku (marzec) i co miesiąc. Okres 2015-03 ... 2026-09; miary: CAGR, połowy, maxDD, Sharpe, Calmar, różnica vs równe wagi spółek > 10 mld. 8 wariantów.
Wynik etapu 40 (2026-11-17): sam ranking po przychodach 5 lat bez filtrów 3,4-8,2 % (poniżej rynku); każdy filtr jakości dodaje (> 10 mld, dług < 1, ROE > 15 %) - pełny zestaw roczny 20,9 %.

## Etap 41: kiedy sprzedać - które pogorszenie fundamentów zapowiada koniec wzrostu ceny (zapisane 2026-11-18 PRZED uruchomieniem, opisowe)
Obserwacje: spółka x koniec miesiąca, członkowie S&P 500 z danymi SEC, 2012-01 ... 2025-09 (12 mies. naprzód). Podzbiór "liderzy" = zwrot 6 mies. > +30 %
i zamknięcie nad SMA 10 (spółki, które się trzyma). Wyniki: nadwyżka zwrotu 6 i 12 mies. nad równymi wagami uniwersum; P(spadek >= 25 % od ceny w t
w ciągu 6 mies.); P(zwrot 12 mies. < 0).
Sygnały (znane na t): przychody - ostatni kwartał r/r < 0; spadek wzrostu r/r o >= 10 pp vs 3 mies. wcześniej (hamowanie); ważona estymata użytkownika
niższa niż 3 mies. wcześniej; EPS TTM r/r < 0; spadek wzrostu EPS r/r o >= 10 pp vs 3 mies.; marża operacyjna TTM niższa o >= 2 pp r/r; ROE niższe o
>= 5 pp r/r; dług / kapitał wyższy o >= 0,2 r/r; FCF niższy niż rok wcześniej; FCF < 0; P/E > 1,5 x mediana P/E z 36 mies.; technicznie: zamknięcie pod SMA 10.
Miary: średnia nadwyżka przy sygnale vs bez, różnica z 95 % bootstrapem blokowym po miesiącach; korelacja rang wielkości ciągłych (zmiany) z nadwyżką 12 mies.
(średnia po miesiącach, t Newey-West, lag 12); macierz korelacji rang sygnałów ciągłych między sobą. Wielokrotne testy: ~13 sygnałów x 2 grupy -> |t| > 3.
Wynik etapu 41 (2026-11-18): pogorszenie fundamentów nie przewiduje słabszego zwrotu (cena już to wyceniła); hamowanie przychodów, FCF < 0 i cena pod SMA 10 ok. podwajają ryzyko spadku >= 25 % w 6 mies.; najlepszy moment wyjścia nadal cenowy.

## Etap 42: ROE jako warunek trzymania / sygnał sprzedaży (zapisane 2026-11-18 PRZED uruchomieniem)
Pomysł użytkownika: trzymaj, dopóki ROE >= 10 % i nie spada r/r. Sygnały (ROE = zysk netto TTM / kapitał, znane na t): R1 ROE < 10 %; R2 przejście poniżej 10 %
(rok wcześniej >= 10 %); R3 ROE niższe niż rok wcześniej (o > 1 pp); R4 = R1 lub R3 (warunek trzymania niespełniony); R5 ROE niższe r/r o > 1 pp i < 15 %.
(a) Opis jak etap 41 (nadwyżka 12 mies., P(spadek >= 25 % w 6 mies.), wszyscy i liderzy). (b) Reguła wyjścia w strategii etapu 38b (d): co marzec 10 spółek > 10 mld,
dług < 1, ROE > 15 %, ranking po CAGR przychodów 5 lat; wyjście co miesiąc: brak (trzymaj do marca) / sygnał R1..R5 / zamknięcie pod SMA 10 / R4 lub SMA 10;
sprzedane miejsce czeka w gotówce do marca. 2015-03 ... 2026-09; CAGR, maxDD, Sharpe, Calmar. Rozpoznawcze.
Wynik etapu 42 (2026-11-18): wyjście przy ROE spadającym r/r i < 15 % (R5) lub ROE < 10 % (R1) lekko poprawia strategię (21,4-21,9 % vs 20,9 %, DD -35..-38 % vs -41 %, Sharpe 1,03-1,04 vs 0,96); wyjście przy każdym spadku ROE r/r (R3) za częste (6,1 %); u liderów R5 -4,6 pp/12 mies. (95 %, nie Bonferroni).

## Etap 43: inwestowanie długoterminowe - trzymaj, dopóki fundamenty się zgadzają; sprzedaż przy załamaniu fundamentów lub przewartościowaniu (zapisane 2026-11-18 PRZED uruchomieniem)
Podejście użytkownika: kupno spółek dobrych fundamentalnie i trzymanie latami (bez patrzenia na wykres), sprzedaż tylko, gdy fundamenty się łamią albo spółka jest przewartościowana.
Wybór i kupno: jak etap 38b (d) - > 10 mld, dług / kapitał < 1, ROE > 15 %, ranking po CAGR przychodów 5 lat; maks. 10 pozycji; wolne miejsca uzupełniane
w terminach kontroli kolejnymi z bieżącego rankingu (których nie mamy i które nie mają aktywnego sygnału sprzedaży). BRAK corocznej wymiany - pozycja trwa do sygnału.
Kontrola sygnałów raz na kwartał po sezonie raportów (luty, maj, sierpień, listopad). Sygnały sprzedaży (wszystkie znane na datę kontroli):
X1 P/E > 1,5 x mediana P/E z 5 lat (60 mies., min. 36); X2 P/E > 2 x mediana P/E z 5 lat; X3 PEG z mediany wzrostu = P/E / (100 x mediana 5 rocznych zmian EPS TTM r/r) > 2
(lub mediana <= 0); X4 PEG bieżący = P/E / (100 x wzrost EPS TTM r/r) > 2 (wzrost <= 0 -> sygnał X5); X5 EPS TTM r/r < 0; X6 dług / kapitał > 1;
X7 przychody (ostatni kwartał r/r) < 0 przy medianie 5 rocznych zmian > 0 (spadek wbrew normie); X8 załamanie = X5 lub X6 lub X7; X9 załamanie lub przewartościowanie = X8 lub X2;
X10 X5 przez 2 kolejne kontrole (potwierdzony spadek EPS). Odniesienia: kupno bez sprzedaży (trzymaj zawsze, wolne miejsca tylko po zniknięciu spółki),
coroczna wymiana (etap 38b), równe wagi spółek > 10 mld, SPY. 2015-03 ... 2026-09; CAGR, połowy, maxDD, Sharpe, Calmar, średni czas trzymania, liczba sprzedaży.
Ograniczenie: 11,5 roku danych - kilka pełnych 5-letnich cykli trzymania. Rozpoznawcze.
Etap 43 - dodatek rozpoznawczy PO wynikach (nie rejestrowany wcześniej): X5 lub X6 (EPS r/r < 0 lub dług / kapitał > 1) - kombinacja dwóch najlepszych pojedynczych reguł; wynik traktować jako dopasowany do danych.
Wynik dodatku (po wynikach): X5 lub X6 -> 18,9 % rocznie, DD -29 %, Sharpe 0,99, Calmar 0,65, mediana trzymania 1 rok, 61 sprzedaży.

## Etap 44: CEM10 z filtrem zadłużenia (zapisane 2026-11-18 PRZED uruchomieniem)
CEM10 (co miesiąc: zamknięcie > SMA 10 i zwrot 6M > +30 %, ranking po 6M, 10 pozycji, wyjście < SMA 10, brak zakupów przy SPY < SMA 12, koszt 0,1 %)
na członkach S&P 500 z danymi SEC (cache r59). Warianty: bez filtra; przy zakupie dług / kapitał < 1; < 0,5 (brak danych o długu = odrzucona);
dodatkowo wariant "< 0,5 lub brak danych" (brak danych przepuszczony) i wyjście także przy dług / kapitał > 1. Okres 2011-01 ... 2026-09 i od 2015-03;
CAGR, połowy (2011-2018 / 2019-2026), maxDD, Sharpe, Calmar, różnica vs CEM10 bez filtra (bootstrap blokowy). Rozpoznawcze.
Wynik etapu 44 (2026-11-18): filtr długu w CEM10 obniża maks. spadek o 2-5 pp; CAGR 2011-26 lekko niższy (< 1: 20,5 vs 21,7 %), 2015-26 wyższy (25,7 vs 22,8 %); wariant przepuszczający brak danych najlepszy (24,1 / 29,4 %), ale to po części efekt doboru spółek bez danych SEC.
Etap 44b (2026-11-18, po wynikach 44, kontrola): CEM10 tylko na spółkach z danymi dług / kapitał, bez progu - rozdziela efekt dostępności danych od progu.
Wynik etapu 44b: CEM10 tylko na spółkach z danymi o długu, bez progu: 2011-26 21,2 % / DD -30 %, 2015-26 28,4 % / -30 %; próg < 1 przy tych samych spółkach obniża do 20,5 / 25,7 %, < 0,5 do 19,8 / 24,1 % - sam próg długu nie pomaga, poprawa w 44 wynikała z doboru spółek z danymi.

## Etap 45: screener "low risk, high reward" ze zrzutu użytkownika (zapisane 2026-11-18 PRZED uruchomieniem)
Kupno (wszystkie warunki, znane na datę): łączny wzrost przychodów TTM 5 lat > +50 %; przychody TTM r/r > +5 %; EPS TTM r/r > +5 %; ROE > 15 %; 0 <= dług / kapitał < 1;
FCF (ostatni rok) > 0; PEG (5Y exp-base) = P/E / (100 x CAGR EPS 5 lat) w (0, 1); bez sektorów Financials, Materials, Energy, Utilities, Real Estate
(GICS z /home/user/eodhd-data/gics.csv dla obecnych członków, dla pozostałych SIC z SEC submissions: 6000-6799, 1000-1499, 2900-2999, 4900-4949, 4960-4999,
2600-2699, 2800-2829, 2840-2899, 3300-3399, 2400-2499, 3200-3299). Ranking po najniższym PEG, maks. N = 10 (dodatkowo 20) pozycji, kontrola co miesiąc
(wariant: co kwartał luty/maj/sierpień/listopad), wolne miejsca uzupełniane kolejnymi przechodzącymi screener.
Sprzedaż (użytkownik): gdy co najmniej 2 z 3: PEG > 3 (lub CAGR EPS 5 lat <= 0), wzrost przychodów 5 lat < +50 %, dług / kapitał > 1. Warianty sprzedaży: (S2) 2 z 3;
(Sb) PEG > 3 i przychody 5 lat < 50 % (oba najważniejsze); (S1) którykolwiek z 3; (S0) nigdy. Kontrola: bez wykluczenia sektorów.
Okres 2015-03 ... 2026-09; CAGR, połowy, maxDD, Sharpe, Calmar, średni udział w akcjach, mediana czasu trzymania, liczba kandydatów. Rozpoznawcze.
Wynik etapu 45 (2026-11-18): screener przepuszcza zwykle 6 spółek; reguła 2 z 3 daje 9-15 %, sprzedaż przy którymkolwiek z 3 13,8-15,7 % (najlepszy Calmar 0,69 bez wykluczania sektorów); trzymanie bez sprzedaży 6-12 %.
Etap 45b (2026-11-18, po wynikach 45, prośba użytkownika): ten sam screener i reguły sprzedaży z maks. 5 pozycjami (kontrola co miesiąc), z i bez wykluczenia sektorów.
Wynik etapu 45b: maks. 5 spółek - sprzedaż 2 z 3: 12,6 % (co miesiąc, DD -29 %), którykolwiek z 3: 15,9 % (DD -28 %, Calmar 0,57), nigdy 5,6 %.
Etap 45c (2026-11-18, PRZED uruchomieniem, prośba użytkownika): jak 45b (maks. 5, kontrola co miesiąc, wykluczenie sektorów) + wymiana pojedyncza: jeśli spółka nr 1 rankingu
(najniższy PEG wśród przechodzących screener) nie jest w portfelu, a portfel jest pełny, sprzedaj JEDNĄ posiadaną spółkę, która nie jest w top 5 bieżącego rankingu
(najgorszą: nieprzechodzącą screenera albo z najwyższym PEG) i kup nr 1; jeśli wszystkie posiadane są w top 5 - bez zmian. Reguły sprzedaży: S2 (2 z 3), S1 (którykolwiek), S0 (nigdy).
Wynik etapu 45c: wymiana pojedyncza na nr 1 - z regułą 2 z 3: 9,4 % (bez wymiany 12,6 %); z którymkolwiek z 3: 14,9 % (bez 15,9 %); bez reguły sprzedaży: 10,7 % (bez wymiany 5,6 %); maks. spadek głębszy o 5-6 pp.

## Etap 46: usprawnienie screenera low risk / high reward - przegląd czynnikowy z próbą wyboru i sprawdzianem (zapisane 2026-11-18 PRZED uruchomieniem)
Baza: etap 45b (screener, wykluczenie sektorów, sprzedaż przy którymkolwiek z 3: PEG > 3 / przychody 5 l. < 50 % / dług > 1, kontrola co miesiąc).
Czynniki (pełna siatka 2 x 3 x 2 x 2 x 2 x 2 = 96 wariantów): ranking {najniższy PEG, najwyższy CAGR przychodów 5 l.}; próg PEG przy zakupie {< 1, < 1,5, < 2};
trend przy zakupie {brak, zamknięcie nad SMA 10}; kapitalizacja {brak, > 10 mld}; filtr rynku {brak, bez zakupów przy SPY < SMA 12}; N {5, 10}.
Procedura: symulacje osobno od zera w okresie wyboru 2015-03 ... 2020-12 i w sprawdzianie 2021-01 ... 2026-09; wybór 5 najlepszych wariantów wg Calmar
(CAGR / |maxDD|) w okresie wyboru; raport ich wyniku w sprawdzianie, korelacja rang Calmar między okresami, średni efekt każdego czynnika (różnica średnich CAGR
po wariantach z / bez) w obu okresach osobno. Wnioski tylko z czynników o zgodnym kierunku w obu okresach. Rozpoznawcze; dane od 2015 (krótka historia).
Wynik etapu 46 (2026-11-18): ranking wariantów niestabilny między okresami (rho ~0), ale wszystkie 5 wybranych w 2015-2020 bije SPY w 2021-2026 (19,7-22,9 % vs 15,2 %); zgodne usprawnienia: kapitalizacja > 10 mld, PEG < 2 zamiast < 1, 10 spółek zamiast 5.

## Etap 47: parametry Finviz a zwroty długoterminowe - pełne badanie (zapisane 2026-11-18 PRZED uruchomieniem)
Panel: członkowie S&P 500 z danymi SEC, koniec każdego miesiąca 2012-01 ... 2026-09, parametry znane na datę (SEC wg dat złożenia, ceny skorygowane, kapitalizacja PIT).
Parametry (odpowiedniki Finviz możliwe do odtworzenia): wycena - P/E, E/P, forward P/E (estymata użytkownika: EPS x (1 + ważony wzrost przychodów)), PEG (EPS 5 lat),
PEG (estymata), P/S, P/B, cena / gotówka, P/FCF, FCF yield, EV/Sales, EV/EBITDA, stopa dywidendy; wzrost - EPS TTM r/r, EPS 3 i 5 lat (CAGR), przychody kwartał r/r, TTM r/r,
3 i 5 lat (CAGR), estymata użytkownika, wzrost dywidendy r/r; rentowność - ROA, ROE, ROIC (przybliżenie: zysk oper. x 0,79 / (kapitał + dług - gotówka)), marża brutto,
operacyjna, netto, wypłata dywidendy / zysk; kondycja - current ratio, quick ratio, dług / kapitał, dług długoterminowy / kapitał; cenowe - zwrot 3 / 6 / 12 mies.,
odległość od maks. 12 mies., od SMA 10 mies., zmienność 12 mies., log kapitalizacji. Niedostępne historycznie (pominięte): prognozy analityków (forward P/E, EPS next Y / 5Y),
niespodzianki wyników, własność insiderów i instytucji, transakcje.
Wyniki: zwrot (skorygowany) po 1, 3, 6, 12, 24, 36, 60 mies. minus średnia uniwersum (nadwyżka); dodatkowo maks. zwrot w 60 mies.
Analizy: (1) każdy parametr osobno na całym przekroju (nie tylko top N): korelacja rang z nadwyżką dla każdego horyzontu (średnia po miesiącach startu, t Newey-West
z lagiem = horyzont), spread kwintyli Q5 - Q1 (roczny), monotoniczność; próg istotności Bonferroniego dla ~40 parametrów x horyzont 60 mies.: |t| > 3,2;
(2) progi Finviz dla parametrów strategii (PEG < 1 / 2 / 3, sprzedaż 5 lat > 10 / 20 / 30 %, ROE > 10 / 15 / 20 %, dług / kapitał < 0,5 / 1) - średnia nadwyżka 5-letnia
przechodzących vs reszty; (3) pary i komplet składników strategii (PEG < 2, sprzedaż 5 lat > 30 %, ROE > 15 %, dług / kapitał < 0,5): nadwyżka par, interakcja = efekt pary - suma
efektów pojedynczych; (4) częstotliwość przebudowy: portfel 20 % najlepszych wg wyniku modelu i wg kompletu strategii, przebudowa co 1 / 3 / 6 / 12 / 24 / 60 mies.;
(5) model: rangi parametrów w przekroju, (a) regresja Fama-MacBeth na nadwyżce 12 i 60 mies., (b) LightGBM z treningiem kroczącym (trening do roku Y-1 z wynikiem znanym
przed startem testu, test w roku Y) na nadwyżce 12 mies.; ocena poza próbą: IC i nadwyżka górnego kwintyla; ważność SHAP. Strona-raport z wynikami.
Ograniczenia: lista spółek SEC to głównie obecni członkowie indeksów (przeżywalność); 5-letnie okna od startów 2012-2021 nakładają się (efektywnie ~2 niezależne okresy).
Wynik etapu 47 (2026-11-18): patrz R071; dywidendy (stopa, wzrost) i EV/EBITDA niewiarygodne (kwartalne przepływy SEC są narastające - TTM rzadko z kompletu).

## Etap 48: kombinacje parametrów (pary, trójki, czwórki) a nadwyżka 5 lat (zapisane 2026-11-18 PRZED uruchomieniem)
Filtry z etapu 47, które pojedynczo działały lub są w strategii użytkownika: A przychody 5 l. łącznie > +50 % (CAGR > 8,45 %); B przychody 5 l. CAGR > 20 %;
C EPS 5 l. CAGR > 10 %; D dług / kapitał 0-0,5; E marża operacyjna > 25 %; F quick ratio > 1,5; G ROE > 15 %; H PEG (EPS 5 l.) 0-2; I zwrot 3 mies. > 0; J current ratio > 1,5.
Dla każdej pary (45) i trójki (120) oraz czwórek budowanych z 10 najlepszych trójek: średnia nadwyżka 5 lat spółek spełniających kombinację (vs średnia wszystkich spółek),
t Newey-West (lag 60), średnia liczba spółek w miesiącu; osobno w dwóch połowach startów (2012-01 ... 2016-09 i 2016-10 ... 2021-09). Kombinacja "stabilna", jeśli
nadwyżka > 0 w obu połowach i średnio >= 10 spółek. Próg Bonferroniego dla ~175 kombinacji: |t| > 3,6. Dodatkowo interakcja pary = nadwyżka pary - max(nadwyżki składników).
Ograniczenia jak etap 47; wybór najlepszych kombinacji po fakcie zawyża ich wynik (stąd raport obu połów).
Wynik etapu 48 (2026-11-18): najlepsze stabilne kombinacje łączą quick ratio > 1,5 z PEG < 2 / EPS 5 l. > 10 % / dług < 0,5 (+53..+69 pp nadwyżki w 5 lat, 14-28 spółek, zgodnie w obu połowach); przychody 5 l. > +50 % + dług < 0,5: +31 pp (35 spółek).

## Etap 49: czy wzrost przychodów z 5 lat przewiduje wzrost EPS w kolejnych 5 latach (łańcuch przychody -> EPS -> cena) (zapisane 2026-11-18 PRZED uruchomieniem, opisowe)
Pytanie użytkownika: sprzedaż z 5 lat napędza przyszły EPS. Panel etapu 47: dla startu t i spółki - przyszły CAGR EPS 5 lat = wartość "EPS 5 lat (CAGR)" w t + 60,
przyszły CAGR przychodów 5 lat = "przychody 5 lat (CAGR)" w t + 60 (ta sama seria). Predyktory w t: CAGR przychodów 5 / 3 lata, CAGR EPS 5 / 3 lata, EPS TTM r/r,
estymata ważona, marża operacyjna, ROE, quick ratio, dług / kapitał. Miary: korelacja rang w każdym miesiącu startu (2012-2021), średnia i t NW (lag 60);
kwintyle predyktora -> mediana przyszłego CAGR EPS. Druga część: korelacja przyszłego CAGR EPS 5 lat z nadwyżką ceny w tych samych 5 latach (czy EPS napędza cenę)
oraz korelacja z nadwyżką po kontroli P/E na starcie (czy wzrost był już w cenie).
Wynik etapu 49 (2026-11-18): przychody 5 l. przewidują przyszły EPS 5 l. (IC +0,08) i przyszłe przychody (+0,31), przeszły EPS - odwrotnie (-0,22); przyszły EPS mocno napędza cenę (+0,42), ale najlepszym 'predyktorem' przyszłego EPS jest P/E (+0,37), więc rynek już go wycenia; efekt przychodów skupiony w górnym kwintylu.

## Etap 50: teza użytkownika - jak często pobijamy rynek (zapisane 2026-11-18 PRZED uruchomieniem)
Miara: nie wielkość zysku, lecz częstość pobicia rynku. Filtry (znane na start t, co miesiąc 2012-01 ... 2025-09): R przychody TTM rosną w KAŻDYM z ostatnich 5 lat o >= 8 %;
D dług / kapitał 0-1; F FCF > 0; O ROE > 15 %; S ROE nie spada r/r (ROE_t >= ROE_t-12 - 1 pp); P PEG z przychodów = P/E / (100 x CAGR przychodów 5 lat) < 2 (i < 1);
dla porównania PE PEG z EPS 5 lat < 2. Zestawy: S0 wszystkie spółki; S1 R; S2 R+D+F; S3 S2+O; S4 S3+S; S5 S4+P<2; S6 S4+P<1; S7 S4+PE<2; S8 R+D+F+P<2 (bez ROE).
Wyniki dla każdego zestawu: (a) portfel równych wag spółek zestawu ze startu t: czy pobił (i) równe wagi wszystkich spółek, (ii) SPY, po 12 i po 60 mies.
- odsetek startów, w których pobił, średnia przewaga; (b) pojedyncza spółka: odsetek spółek zestawu, które pobiły SPY po 60 mies.; (c) lata kalendarzowe 2012-2025:
portfel ze stycznia trzymany rok - w ilu latach pobił SPY. Średnia liczba spółek w zestawie. Ograniczenia jak etap 47 (przeżywalność, nakładające się okna).
Wynik etapu 50 (2026-11-18): przychody +8 % co rok + dług < 1 + FCF > 0 pobijają SPY w 54 % 5-letnich okresów (wszystkie spółki 31 %); warunki ROE nie pomagają; PEG z przychodów < 1 podnosi do 72 %, ale zestaw ma średnio 2 spółki; na rok częstość pobicia 35-59 %.

## Etap 51: wejście PEG z przychodów < 1 (< 2) przy przychodach +8 % co rok, dług < 1, FCF > 0 - które WYJŚCIE i jaka przebudowa (zapisane 2026-11-18 PRZED uruchomieniem)
Portfel maks. N = 10 równych miejsc (kwota = kapitał / N), wolna gotówka w SPY (wariant: gotówka 0 %), kontrola co miesiąc, koszt 0,1 %/stronę.
Kupno: spółka spełnia rdzeń (przychody TTM +8 % w każdym z 5 lat, dług / kapitał 0-1, FCF > 0) i PEG_przych = P/E / (100 x CAGR przychodów 5 lat) < 1 (wariant < 2);
kolejność po najniższym PEG_przych. Wyjścia: W0 trzymaj 60 mies.; W1 załamanie: przychody TTM r/r < 0 albo dług / kapitał > 1 albo FCF < 0; W2 przewartościowanie PEG_przych > 2;
W3 PEG_przych > 3; W4 W1 lub W3; W5 coroczna przebudowa (styczeń: sprzedaj spółki niespełniające warunków kupna); W6 W1 lub W2; W7 nigdy (do zniknięcia z danych).
Okres 2015-01 ... 2026-09 (warunek 5-letni). Miary: CAGR, maks. spadek, odsetek kroczących okien 12 i 60 mies. z wynikiem lepszym od SPY, średni udział spółek, mediana czasu trzymania.

Wynik etapu 51 (2026-11-18): najlepsze wyjście = coroczna przebudowa w styczniu (sprzedaj, jeśli spółka nie spełnia już warunków wejścia): PEG < 1 15,9 %/rok vs SPY 14,1 %, DD −18,7 %, 86 % okien 5-letnich lepszych od SPY, ale średnio tylko 49 % kapitału w spółkach (mediana 4 kandydatów). Trzymanie 5 lat 11,0 %, bez sprzedaży 8,1 %.

## Etap 52: portfel narastający do 30 spółek, pozycja max 10 % / 5 % / 1/30 konta (zapisane 2026-11-18 PRZED uruchomieniem)

Użytkownik: „sprawdzaj co miesiąc i kupuj kolejne, nie przekraczaj max 30 spółek, zawsze inwestuję max 10 % konta na spółkę”.
Co miesiąc dokupujemy nowe spółki spełniające rdzeń (przychody +8 % co rok 5 lat, dług/kapitał 0–1, FCF > 0) i PEG z przychodów < 1 (oraz < 2),
od najniższego PEG, dopóki portfel ma < 30 spółek; kwota = min(s × wartość konta, wolna gotówka), s ∈ {10 %, 5 %, 1/30}; wolna gotówka w SPY.
Wyjścia: W5 przebudowa w styczniu, W3 PEG > 3, W0 trzymaj 5 lat, W1 załamanie. Koszt 0,1 %/stronę, 2015-01..2026-09.
Miary: CAGR, max DD, odsetek okien 12 / 60 mies. lepszych od SPY, średni udział w spółkach, średnia liczba spółek, mediana trzymania.
Hipoteza: więcej miejsc nie zmieni wyniku istotnie, bo kandydatów jest mało (mediana 4 przy PEG < 1); różnice CAGR < 2 pp = szum.
Dodatkowo: lista spółek kupionych w wariancie PEG < 1 + W5, s = 10 %, z wynikiem każdej pozycji.

Wynik etapu 52 (2026-11-18): limit 30 spółek się nie zapełnia — przy PEG < 1 portfel ma średnio 5–11 spółek (max 17), bo co miesiąc warunki spełnia mediana 4 spółek. Wyniki w granicach szumu względem etapu 51 (14–16 %/rok vs SPY 14,1 %). Mniejsza pozycja (5 %) zostawia więcej w SPY i daje podobny CAGR. Hipoteza potwierdzona.

## Etap 53: powtórka etapów 50–52 na pełnym składzie S&P 500 (ze spółkami usuniętymi z indeksu) (zapisane 2026-11-18 PRZED uruchomieniem)

Użytkownik: „dlaczego masz tylko akcje, które są w indeksie, przecież mieliśmy dane pełne”. Sprawdzenie: ceny były pełne (1084 spółki kiedykolwiek w S&P 500,
w tym usunięte), ale dane SEC pobrano tylko dla tickerów z dzisiejszej listy SEC (company_tickers.json) — 271 z 865 spółek z indeksu od 2008 r. nie miało
fundamentów, więc nigdy nie mogły zostać wybrane (błąd przeżywalności w etapach 31–52). Naprawa (/home/user/ndx/delisted): nazwy usuniętych spółek z listy
EODHD (delisted), CIK z SEC cik-lookup-data.txt (dopasowanie nazwy + sprawdzenie, że raporty CIK pokrywają okres notowań; kilka CIK ręcznie), pobrane
companyfacts dla 238 spółek (216 nowych, 22 dopisane do ponownie użytych tickerów tylko do daty końca starej spółki); kapitalizacja spółek bez dzisiejszej
liczby akcji = P/E × zysk netto TTM. Pokrycie członków S&P 500 danymi SEC 2015: 95 %. Panel: 728 spółek, 82 712 obserwacji (było 567 / 70 655).
Plan: bez zmian reguł ponownie r72 (etap 50), r73 (51), r74 (52); poprzednie wyniki zachowane jako *_bez_usunietych.md.
Hipoteza: wyniki spadną (usunięte spółki to częściej przegrane); jeśli przewaga nad SPY zniknie, poprzednie wnioski były skutkiem błędu przeżywalności.

Wynik etapu 53 (2026-11-18): z usuniętymi spółkami średnia spółka wypada gorzej (pobija SPY w 5 lat w 19 % zamiast 31 % okresów), przewaga rdzenia (przychody + dług + FCF) maleje (41 % zamiast 54 %). Wariant PEG z przychodów < 1 + przebudowa w styczniu się utrzymał (16,4 %/rok vs SPY 14,1 %, DD −16 %, 94 % okien 5-letnich), bo nowe spółki w wyborze to głównie przejęte z premią (ABMD, ALXN, AGN). Warianty PEG < 2 i trzymanie 5 lat spadły o 1–2 pp i są poniżej SPY. Hipoteza częściowo potwierdzona.

## Etap 54: nowa strategia użytkownika — przychody 5 lat > +50 %, dług/kapitał < 1, ROE > 15 %, FCF > 0, wagi wg PEG (max 10 %), przebudowa co rok / kwartał / miesiąc (zapisane 2026-11-18 PRZED uruchomieniem)

Użytkownik: „weź przychody z 5 lat powyżej 50 %, debt/equity < 1, ROE > 15 %, FCF > 0 i rebalansuj raz w roku lub sprawdzaj co miesiąc czy fundamenty się
zgadzają, pewnie najlepiej kwartalnie, ale dobieraj wagi do PEG — im mniejszy PEG, tym większy udział, ale nie przekraczaj 10 % konta”.
Warunki (dane znane na koniec miesiąca, panel z etapu 53, ze spółkami usuniętymi): przychody TTM / przychody TTM 5 lat wcześniej > 1,5 (CAGR > 8,45 %/rok),
0 ≤ dług/kapitał < 1, ROE > 15 %, FCF TTM > 0 (FCF yield > 0); PEG = P/E ÷ (100 × CAGR przychodów 5 lat), wymagany P/E > 0.
Wagi: w ∝ 1/PEG, limit 10 % (nadwyżka rozdzielana na resztę proporcjonalnie do 1/PEG, iteracyjnie); gdy spółek < 10, reszta w SPY. Porównanie: równe wagi (limit 10 %).
Przebudowa do wag docelowych: co 12 mies. (styczeń), co 3 mies. (sty/kwi/lip/paź), co miesiąc; między przebudowami opcjonalnie miesięczna kontrola:
spółka, która nie spełnia już czterech warunków, sprzedana, pieniądze w SPY do następnej przebudowy. Koszt 0,1 % od obrotu. 2015-01..2026-09.
Miary: CAGR, max DD, odsetek okien 12 / 60 mies. lepszych od SPY, średnia liczba spółek, średni udział w spółkach, obrót roczny; skład na 2026-09.
Hipoteza: wagi wg PEG ≈ równe wagi (różnica < 2 pp = szum); częstsza przebudowa nie poprawia wyniku (koszty, powrót do średniej), a kontrola miesięczna zmniejsza DD.

Wynik etapu 54 (2026-11-18): co miesiąc warunki spełnia mediana 39 spółek. Najlepszy wariant (wagi 1/PEG, przebudowa w styczniu, kontrola miesięczna) 14,1 %/rok = SPY 14,1 %, DD −24,5 % vs −23,9 %, 83 % okien 5-letnich lepszych od SPY. Przebudowa co kwartał gorsza (11,0–12,4 %), co miesiąc 13,1 %. Wagi wg PEG lepsze od równych o 0–1,4 pp i mniejszy DD o 3–5 pp. Hipoteza: wagi ≈ równe — potwierdzona co do CAGR; częstsza przebudowa nie pomaga — potwierdzona; kontrola miesięczna pomaga (+1,4–1,9 pp). Uwaga: wzrost przychodów 5 lat od dna COVID daje skrajnie niski PEG (RCL 0,09, UAL, DAL).

## Etap 55: etap 54 + zastępowanie sprzedanej spółki (zapisane 2026-11-18 PRZED uruchomieniem)

Użytkownik: „jeżeli sprzedam spółkę, to sprawdź aktualnie top 1 spółkę, którą mogę ją zastąpić, z tym kapitałem, nie w SP500”. Reguły etapu 54
(przychody 5 lat > +50 %, dług/kapitał < 1, ROE > 15 %, FCF > 0, wagi 1/PEG lub równe, limit 10 %, przebudowa w styczniu / co kwartał, kontrola miesięczna);
zmiana: przy sprzedaży w kontroli miesięcznej cały kapitał ze sprzedaży (max 10 % konta, nadwyżka w SPY) idzie od razu w spółkę spełniającą warunki
z najniższym PEG, której nie mamy; brak takiej = SPY. Porównanie z etapem 54 (kapitał do SPY). Miary jak w etapie 54.
Hipoteza: różnica < 1 pp (sprzedaży między przebudowami jest mało, a spółka z najniższym PEG nie jest lepsza od SPY).

Wynik etapu 55 (2026-11-18): zastępowanie sprzedanej spółki tą z najniższym PEG nie zmienia wyniku (wagi PEG, styczeń: 14,1 % → 14,1 %, DD −24,5 → −25,7 %; co kwartał +0,3 pp; równe wagi −1,0 pp), ok. 19 zamian rocznie. Hipoteza potwierdzona.

## Etap 56: sprzedaż dopiero, gdy padną 2 kryteria; PEG liczy się tylko przy P/E > 50 (zapisane 2026-11-18 PRZED uruchomieniem)

Użytkownik: „do sprzedaży liczy się, jeżeli dwa kryteria upadają z fundamentów; PEG tylko z wysokim P/E powyżej 50”.
Kryteria sprzedaży (miesięcznie): K1 przychody 5 lat ≤ +50 %, K2 dług/kapitał ≥ 1 lub < 0, K3 ROE ≤ 15 %, K4 FCF ≤ 0, K5 P/E > 50 i PEG > 3
(wariant K5' = samo P/E > 50); brak danych = kryterium nie pada. Sprzedaż, gdy padną ≥ 2 z 5. Wejście jak w etapie 54 (wszystkie 4 warunki), wagi 1/PEG
lub równe, limit 10 %. Przebudowa (styczeń / co kwartał): spółki spełniające 4 warunki + trzymane, którym padło < 2 kryteria; wagi 1/PEG (trzymana bez PEG
= najmniejsza waga z listy). Po sprzedaży: SPY albo spółka z najniższym PEG (etap 55). Porównanie z etapami 54–55 (sprzedaż przy 1 kryterium).
Hipoteza: łagodniejsza sprzedaż = mniej transakcji, wynik w granicach ±1 pp.

Wynik etapu 56 (2026-11-18): sprzedaż przy 2 z 5 kryteriów jest gorsza o 1–2 pp/rok od sprzedaży przy jednym (wagi PEG, styczeń: 12,2–12,4 % vs 14,1 %; SPY 14,1 %), DD mniejszy o ok. 1 pp, portfel puchnie do 51–60 spółek. K5 z PEG > 3 czy samo P/E > 50 — prawie bez różnicy (P/E > 50 ma 16 % spełniających warunki, ale K5 rzadko pada razem z innym kryterium). Hipoteza (±1 pp) odrzucona: łagodniejsza sprzedaż szkodzi.

## Etap 57: etapy 54–56 tylko dla spółek > 10 mld USD (zapisane 2026-11-18 PRZED uruchomieniem)

Użytkownik: „ogranicz kapitalizację do 10b” (jak wcześniej: tylko spółki powyżej 10 mld). Warunek wejścia (i wyboru przy przebudowie oraz przy zastępowaniu):
kapitalizacja na koniec miesiąca > 10 mld USD, plus 4 warunki z etapu 54. Spadek kapitalizacji poniżej 10 mld NIE jest kryterium sprzedaży.
Warianty jak w etapie 56 (sprzedaż 1 z 4 / 2 z 5, SPY / najniższy PEG, styczeń / kwartał, wagi PEG / równe). Hipoteza: mniej spółek, wynik w granicach ±2 pp
(w etapie 46 filtr > 10 mld pomagał: +0,4 / +6,0 pp w dwóch okresach).

Wynik etapu 57 (2026-11-18): w S&P 500 filtr > 10 mld prawie nic nie zmienia w składzie (mediana 38 zamiast 39 spółek), wynik niższy o ok. 1 pp (najlepszy wariant 13,2 % vs 14,1 % bez filtra, SPY 14,1 %). Hipoteza potwierdzona (w granicach ±2 pp).

## Etap 58: które fundamenty wskazują spółki, które przez lata poprawiają wyniki i rosną (zapisane 2026-11-18 PRZED uruchomieniem)

Użytkownik: „jakie fundamenty wskazują na przyszłe wzrosty … spółki świetne w wynikach, które poprawiają swoje wyniki rok do roku i dzięki temu cena rośnie;
w długim terminie; dokupuję, gdy PEG < 2; sprzedaż dopiero, gdy fundamenty pogarszają się rok do roku”.
Dane: panel z etapu 53 (S&P 500 PIT ze spółkami usuniętymi, 728 spółek), starty 2012-01..2021-09 dla 60 mies.
Cechy (znane na t): (a) poziomy z panelu (wzrost, rentowność, wycena, dług, płynność); (b) poprawa r/r: Δ ROE, Δ ROIC, Δ marży oper. / brutto / netto,
przyspieszenie przychodów TTM r/r i EPS TTM r/r (teraz minus rok wcześniej); (c) konsekwencja w 5 latach (punkty co 12 mies.): liczba lat z przychodami r/r > 0,
> 10 %, z EPS r/r > 0, z rosnącą marżą oper., z ROE > 15 %, z ROIC > 15 %; zmienność wzrostu przychodów (odch. std 5 punktów).
Cele: (1) nadwyżka ceny 36 i 60 mies. (względem średniej spółek); (2) PRZYSZŁY wzrost fundamentów: CAGR przychodów i EPS w kolejnych 5 latach (czy cecha
przewiduje dalszą poprawę wyników). Miary: miesięczny IC Spearmana, t Neweya-Westa (lag = horyzont), znak w obu połowach startów (2012–16 / 2017–21),
istotność po Bonferronim |t| > 3,2; kwintyle (K5 − K1). Wynik złożony: średnia rang cech wybranych w 1. połowie (|t| > 2, ten sam znak dla ceny 60 mies.),
sprawdzony w 2. połowie (poza próbą). Hipoteza: konsekwencja wzrostu przychodów i ROIC przewiduje przyszły wzrost wyników; cena — słabiej, bo część jest w cenie.

Wynik etapu 58 (2026-11-18): najmocniejsza i stabilna cecha = liczba lat (z 5) ze wzrostem przychodów > 10 % r/r: przewiduje nadwyżkę ceny 60 mies. (IC 0,12, t 7,5, obie połowy), przyszły wzrost przychodów (0,30) i jako jedyna z cech wzrostu także przyszły wzrost EPS (0,18, t 8,5). Dalej: lata z EPS r/r > 0, quick ratio, trwały ROIC > 15 %, niski dług. Chwilowa poprawa r/r (marże, ROIC, przyspieszenie) i wycena (P/E, PEG) ≈ 0. Wynik złożony poza próbą działa tylko w górnym kwintylu (+23 pp w 5 lat). Hipoteza potwierdzona dla przychodów; dla ROIC — cena tak, przyszły wzrost wyników nie.

## Etap 59: portfel „świetnych spółek” — wybór po konsekwencji wzrostu, dokupowanie i kolejność kupna po PEG (zapisane 2026-11-18 PRZED uruchomieniem)

Użytkownik: „przetestuj to, dokupowanie za pomocą PEG i hierarchia kupna też po PEG, bo to pokazuje fair value”.
Spółka „świetna” (na koniec miesiąca, dane PIT): przychody TTM r/r > 10 % w ≥ 3 z ostatnich 5 lat (warianty ≥ 4, 5 z 5), 0 ≤ dług/kapitał < 1,
ROIC > 15 % w ≥ 3 z 5 lat (wariant bez ROIC; wariant + quick ratio > 1). PEG = P/E ÷ (100 × CAGR przychodów 5 lat).
Kupno co miesiąc: kandydaci = świetne z PEG < 2 (nowe i trzymane poniżej 10 % konta), kolejność od najniższego PEG; transza 2,5 % konta (wariant 5 %), najwyżej
4 transze w miesiącu (wariant: bez limitu), pozycja max 10 % konta; pieniądze z rezerwy w SPY (start: 100 % w SPY), brak rezerwy = brak kupna.
Sprzedaż (warianty): S1 przychody r/r < 10 % dwa lata z rzędu (TTM teraz i 12 mies. wcześniej), S2 spółka przestaje być świetna (< 3 lat z 5 z przychodami > 10 %),
S3 przychody TTM r/r < 0, S4 nigdy. Pieniądze ze sprzedaży do SPY. Koszt 0,1 %. 2015-01..2026-09.
Porównanie: te same świetne spółki, równe wagi, przebudowa w styczniu (bez PEG); SPY.
Miary: CAGR, max DD, okna 12 / 60 mies. vs SPY, średnia liczba spółek, udział w spółkach, mediana trzymania.
Hipoteza: wybór po konsekwencji wzrostu bije SPY o 1–3 pp; PEG jako kolejność/dokupowanie ≈ bez PEG (wycena miała IC ~0); S1 najlepsze z wyjść.
Poprawka etapu 59 przed odczytem wniosków (2026-11-18): w 1. przebiegu kandydat do kupna mógł już spełniać warunek sprzedaży (np. S1: przychody < 10 % dwa lata z rzędu przy ≥ 3 z 5 lat > 10 %), co dawało kupno i sprzedaż w kolejnym miesiącu (mediana trzymania 2–7 mies.). Poprawione: kandydat nie może spełniać warunku sprzedaży danego wariantu. Dodane kontrole: bez progu PEG z kolejnością losową (z ROIC i bez). Wynik 1. przebiegu zachowany w wyniki/r81_swietne_peg_v1_blad_wejscia.md.

Wynik etapu 59 (2026-11-18, po poprawce wejścia): świetne spółki kupowane bez progu PEG (kolejność od najniższego PEG, transze 2,5 %, wyjście S1) 19,4 %/rok vs SPY 14,1 %, DD −27 %, 100 % okien 5-letnich lepszych od SPY; kolejność losowa 20,0 % (12 losowań 18,6–21,1 %), DD −33 %. Próg kupna PEG < 2 obniża wynik do 13,4 % (kapitał czeka w SPY), PEG < 1 15,5 % z DD −18 %. Wyjścia: S2 (seria wzrostu przerwana) ≥ S1 > S4 > S3. Hipoteza: bije SPY — tak (o 5 pp bez progu PEG); PEG jako kolejność ≈ bez PEG dla zwrotu — tak, ale niższy DD. Uwaga: wiele wariantów na jednym okresie, ranking wariantów niepewny.
Kontrola etapu 59 (2026-11-18): wynik 19,4 % zależy od NVDA (na koniec ok. 4,1 z kapitału startowego 1 w jednej spółce, bo limit 10 % dotyczy tylko kupna). Bez NVDA 12,4 % (< SPY 14,1 %), bez 5 największych pozycji 11,1 %. Wniosek z etapu 59 („bije SPY o 5 pp”) jest kruchy: to głównie jedna trafiona spółka.

## Etap 60: kategorie Lyncha — stalwarts (przychody +8…+15 % r/r) i fast growers (≥ +20 % r/r), ROE stabilnie > 15 %, dług < 1, FCF > 0 (zapisane 2026-11-18 PRZED uruchomieniem)

Użytkownik: „daj ROE zamiast ROIC; stalwart: sprzedaż +8…+15 % r/r, stabilne spółki wzrostowe; fast growers: +20 % r/r; na tych dwóch grupach chcemy się skupić;
dług/kapitał < 1, ROE > 15 % stabilnie rok do roku, FCF > 0”.
Definicje (5 punktów rocznych TTM r/r: teraz, −12, −24, −36, −48 mies.): STALWART = przychody r/r w [8 %, 15 %] w ≥ 4 z 5 lat i wszystkie 5 > 0;
FAST = przychody r/r ≥ 20 % w ≥ 3 z 5 lat i CAGR 5 lat ≥ 20 %; wspólne: 0 ≤ dług/kapitał < 1, ROE > 15 % we wszystkich 5 punktach, FCF yield > 0.
Kupno jak w etapie 59 (kolejność od najniższego PEG, bez progu; wariant PEG < 2; transze 2,5 %, max 4 / mies., max 10 % przy kupnie, rezerwa w SPY).
Sprzedaż: WA = przychody r/r < 8 % dwa lata z rzędu; WB = spółka nie należy już do żadnej grupy ani nie spełnia warunków wspólnych; WC = nigdy.
Dodatkowo: przycinanie raz w roku (styczeń) pozycji > 15 % konta do 15 %; kontrola bez najlepszej spółki (wyłączona z wyboru).
Grupy osobno i razem. Miary jak w etapie 59. Hipoteza: fast growers > SPY głównie dzięki pojedynczym spółkom (bez najlepszej przewaga znika); stalwarts ≈ SPY z mniejszym DD.

Wynik etapu 60 (2026-11-18): definicje są bardzo rzadkie w S&P 500 — stalwarts mediana 0 spółek w miesiącu (0–6), fast growers 1 (0–4); portfel ma średnio 1–5 spółek, reszta w SPY. Fast growers (WA) 20,8 % (SPY 14,1 %), ale NVDA 43 % portfela na koniec; bez NVDA 15,5 %. Obie grupy 20,2 %, bez NVDA 13,9 %. Stalwarts 10,2–13,0 % (< SPY). Hipoteza potwierdzona: przewaga fast growers to głównie NVDA; stalwarts ≈/< SPY.

## Etap 61: łagodniejsze definicje grup (średni wzrost 5 lat) (zapisane 2026-11-18 PRZED uruchomieniem)
Powód: w etapie 60 za mało spółek (warunek „8–15 % w ≥ 4 z 5 lat” prawie nigdy nie jest spełniony: 2 spółki przed innymi filtrami).
STALWART2 = CAGR przychodów 5 lat w [8 %, 15 %] i przychody r/r > 0 w każdym z 5 lat; FAST2 = CAGR 5 lat ≥ 20 % i r/r > 0 w każdym roku;
wspólne: dług/kapitał 0–1, FCF > 0, ROE > 15 % w ≥ 4 z 5 lat (wariant 5 z 5). Reszta jak w etapie 60 (WA, WB, WC, PEG < 2, przycinanie, bez NVDA).
Liczebność (mediana w miesiącu, przed uruchomieniem strategii): STALWART2 + warunki 5 (ROE 4/5) / 3 (ROE 5/5), FAST2 2 / 1.

Wynik etapu 61 (2026-11-18): z łagodniejszymi definicjami (ROE 4 z 5): obie grupy, wyjście WA 14,0 %/rok = SPY 14,1 %, ale max DD −17 % vs −24 % i 84 % okien 5-letnich lepszych od SPY; stalwarts 14,1 % (DD −20 %), fast growers 15,1 % (DD −22 %, bez ANET 13,9 %). Próg PEG < 2 i wyjście WB / WC gorsze. ROE 5 z 5: 12,7–15,2 %. NVDA nie spełnia „każdy rok > 0” (spadek przychodów 2023), więc wynik nie zależy od NVDA. Wniosek: grupy Lyncha dają zwrot jak rynek przy mniejszym obsunięciu; przewagi zwrotu nie wykazano.

## Etap 62: przychody 5 lat > +50 % i maks. obsunięcie przychodów w 5 lat ≥ −20 % (stabilny wzrost) + warunki z etapu 61 (zapisane 2026-11-18 PRZED uruchomieniem)

Użytkownik: „weź tylko ten pierwszy warunek: sprzedaż powyżej 50 % z 5 lat i maksymalne obsunięcie w ciągu 5 lat max −20 % z tych sprzedaży — będzie wiadomo,
że rosły stabilnie; reszta bez zmian”. Wybór: przychody TTM / przychody TTM 5 lat wcześniej > 1,5 i największy spadek przychodów TTM od szczytu w ostatnich 60 mies.
≥ −20 % (przychody TTM = kapitalizacja / P/S z panelu, wymagane ≥ 48 z 60 mies.); dług/kapitał 0–1, FCF > 0, ROE > 15 % w ≥ 4 z 5 lat; kupno co miesiąc
od najniższego PEG (bez progu; wariant PEG < 2), transze 2,5 %, max 4 / mies., max 10 % przy kupnie, rezerwa w SPY; sprzedaż WA (przychody r/r < 8 % dwa lata),
warianty WB (wypada z warunków), WC (nigdy). Dodatkowo (gdyby „obsunięcie” dotyczyło ceny): maks. obsunięcie ceny w 5 lat ≥ −20 % / ≥ −30 % zamiast przychodów.
Kontrola: bez najlepszej spółki i bez NVDA. Miary jak w etapie 61. Hipoteza: więcej spółek niż w etapie 61, zwrot ≈ SPY ± 2 pp.

Wynik etapu 62 (2026-11-18): mediana 4 spółki; 20,0 %/rok (SPY 14,1 %), ale NVDA = 63 % portfela na koniec; bez NVDA 12,2 %; z przycinaniem pozycji do 15 % w styczniu 16,9 % (DD −27 %). Obsunięcie ceny zamiast przychodów 8,4–10,5 %. Hipoteza (≈ SPY ± 2 pp) — z NVDA odrzucona, bez NVDA potwierdzona (−1,9 pp).

## Etap 63: etap 62 + przycinanie do 10 % (raz w roku lub gdy PEG > 3) i dokupowanie po 2 % przy PEG < 2 (zapisane 2026-11-18 PRZED uruchomieniem)

Użytkownik: „rebalansowanie raz do roku lub gdy PEG przekroczy 3 — wtedy ucinamy do 10 % konta; jak spadnie PEG znowu poniżej 2, dokupujemy o 2 % itd.”
Wybór jak w etapie 62 (przychody 5 lat > +50 %, obsunięcie przychodów ≥ −20 %, dług < 1, FCF > 0, ROE > 15 % w ≥ 4 z 5), sprzedaż WA.
Zmiany: transza 2 % konta (max 4 / mies.); nowa spółka — kolejność od najniższego PEG, bez progu (wariant: tylko PEG < 2); dokupienie trzymanej — tylko gdy PEG < 2,
do 10 % konta; przycinanie do 10 %: (a) w styczniu, (b) gdy PEG > 3 (sprawdzane co miesiąc), (c) oba [wariant główny]; nadwyżka do SPY. Warianty: limit 15 %,
bez NVDA. Hipoteza: z przycinaniem wynik bliżej SPY niż 20 % z etapu 62, ok. 15–17 %; bez NVDA < SPY.

Wynik etapu 63 (2026-11-18): przycinanie do 10 % (styczeń / PEG > 3) + dokup 2 % przy PEG < 2: 15,2 %/rok vs SPY 14,1 %, DD −23 %, wszystkie okna 5-letnie lepsze od SPY, ale średnio tylko 41 % kapitału w spółkach (6 spółek). Bez NVDA 13,2 %. Rodzaj przycinania prawie bez znaczenia (15,2–15,6 %). Hipoteza potwierdzona (15–17 %; bez NVDA < SPY).

## Etap 64: dlaczego „jakościowe” spółki dają mało + proste rankingi: top 10 po najniższym PEG / najniższym długu, przebudowa co miesiąc (zapisane 2026-11-18 PRZED uruchomieniem)

Użytkownik: „czemu tak słabo? wybieramy jakościowe spółki z S&P 500 … nie dajemy im rosnąć? Sprawdź coś prostszego: ranking po PEG co miesiąc, kup top 10;
potem to samo dla najmniejszego długu/kapitału, przebudowa co miesiąc”.
Diagnoza (2015-01..2026-09): (a) SPY vs równe wagi wszystkich członków S&P 500 (miesięcznie, PIT); (b) równe wagi wszystkich spółek spełniających warunki etapu 63
(przebudowa co miesiąc, 100 % w spółkach) — czy same spółki są lepsze od rynku; (c) udział SPY w etapie 63 i zwrot części „spółkowej”.
Rankingi (co miesiąc, równe wagi, 10 spółek, koszt 0,1 % od obrotu): R1 najniższy PEG z przychodów (P/E ÷ 100 × CAGR przychodów 5 lat, tylko PEG > 0),
R2 najniższy PEG z EPS 5 lat (jak Finviz „PEG” historyczny), R3 najniższy dług/kapitał (≥ 0), R3b najniższy dług przy ROE > 15 %; dodatkowo top 20 i przebudowa
co kwartał. Miary: CAGR, DD, okna 12 / 60 mies. vs SPY i vs równe wagi S&P 500. Hipoteza: R1–R3 ≈ równe wagi S&P 500 (~11 %), poniżej SPY; „jakość” nie przegrywa
z rynkiem przez złe spółki, tylko przez to, że SPY (ważony kapitalizacją) w tym okresie wygrywał dzięki największym spółkom.

Wynik etapu 64 (2026-11-18): równe wagi S&P 500 11,1 %/rok vs SPY 14,1 % — w tym okresie największe spółki dały rynkowi 3 pp/rok przewagi, więc każdy portfel równych wag startuje z handicapem. Spółki z etapu 63 w równych wagach (100 % w spółkach) 15,9 %, ale bez NVDA 12,0 %. Proste rankingi: najniższy PEG z przychodów 11–12 % (≈ równe wagi), PEG z EPS 8–10 %, najniższy dług 9–12 %, najniższy dług przy ROE > 15 % 13,7–15,2 % (odporny na NVDA). Hipoteza potwierdzona (rankingi ≈ równe wagi, poniżej SPY), z wyjątkiem R3b (≈ SPY+1 pp; wiele wariantów — możliwy przypadek).

## Etap 65: dług/kapitał < 1 vs ≥ 1 oraz portfel spółek o stabilnym lub parabolicznym wzroście z wagami 1/PEG (max 10 %) (zapisane 2026-11-18 PRZED uruchomieniem)

Użytkownik: „według badań biorąc tylko spółki z debt/equity < 1 zwiększamy znacznie przychody z S&P 500 na rzecz tych odwrotnych; PEG to ranking, ale też dobór wag —
im niższy PEG, tym większa pozycja, max 10 % konta; fundamenty muszą być spełnione: stabilny wzrost lub paraboliczny”.
(A) Równe wagi co miesiąc: członkowie S&P 500 z dług/kapitał w [0, 1) vs ≥ 1 (lub ujemny kapitał) vs wszyscy; także kwintyle dług/kapitał (nadwyżka 60 mies., etap 58 dane).
(B) Wszechświat: (STALWART2: CAGR przychodów 5 lat 8–15 %, każdy rok > 0) LUB (FAST2: CAGR ≥ 20 %, każdy rok > 0) LUB (przychody 5 lat > +50 % i obsunięcie
przychodów ≥ −20 %); oraz dług/kapitał 0–1, FCF > 0, ROE > 15 % w ≥ 4 z 5 lat. Wagi ∝ 1/PEG (PEG z przychodów), limit 10 % (nadwyżka rozdzielana iteracyjnie),
brakujące do 100 % w SPY (gdy < 10 spółek). Przebudowa co miesiąc / kwartał / rok (styczeń); porównanie: równe wagi; kontrola bez NVDA.
Hipoteza: (A) dług < 1 > dług ≥ 1 o 1–3 pp/rok; (B) wagi 1/PEG ≈ równe wagi, wynik ≈ SPY ± 2 pp.

Wynik etapu 65 (2026-11-18): (A) w kwintylach 5-letnich niski dług wygrywa (K1 +9,0 %, K5 −7,7 % nadwyżki), ale w portfelach równych wag przebudowywanych co miesiąc 2015–2026 dług 0–1 (10,6 %) ≈ dług ≥ 1 (11,3 %) — różnica wynika z miary (średnia 5-letnich zwrotów pojedynczych spółek vs składany zwrot portfela) i z innego okresu; hipoteza (A) potwierdzona tylko dla kwintyli. (B) wagi 1/PEG co miesiąc 15,5 % vs równe 14,3 % vs SPY 14,1 %; bez NVDA 14,1 %; limit 20 % 17,5 %. Hipoteza (B) potwierdzona (≈ SPY ± 2 pp).

## Etap 66: bez przebudowy — kupno raz z wielkością wg PEG, sprzedaż przy wysokim P/E i PEG (zapisane 2026-11-18 PRZED uruchomieniem)

Użytkownik: „nie rebalansuj, bo to zabija zyski; jeżeli akcja ma wysokie P/E i PEG — sprzedaj”.
Wszechświat jak w etapie 65 (B). Co miesiąc spółka z wszechświata, której nie mamy, jest kupowana (kolejność od najniższego PEG) za min(5 % / PEG, 10 %) konta
(min 1 %), z rezerwy w SPY (brak rezerwy = brak kupna). Bez przycinania, bez przebudowy, bez dokupowania. Sprzedaż (warianty): X1 P/E > 50 i PEG > 3;
X2 P/E > 40 i PEG > 3; X3 P/E > 30 i PEG > 2; X4 = X1 lub przychody r/r < 8 % dwa lata z rzędu; X0 nigdy. Pieniądze ze sprzedaży do SPY. Ponowny zakup dozwolony.
Kontrola: bez NVDA; wielkość stała 5 % zamiast 5 %/PEG. Hipoteza: bez przebudowy wynik zależy od 1–2 spółek; sprzedaż przy wysokim P/E i PEG ≈ trzymanie (wycena IC ~0).
Poprawka etapu 66 przed odczytem wniosków (2026-11-18): w 1. przebiegu kupowano spółki, które już spełniały warunek sprzedaży (np. NVDA 2019-11..2020-02 kupiona i sprzedana co miesiąc przy P/E ~60, PEG ~3,5). Poprawione: nie kupujemy spółki z aktywnym sygnałem sprzedaży. Wynik 1. przebiegu: wyniki/r88_bez_przebudowy_v1_blad_wejscia.md.

Wynik etapu 66 (2026-11-18, po poprawce): bez przebudowy 11,1–14,4 %/rok (SPY 14,1 %), gorzej niż wagi 1/PEG z przebudową co miesiąc (15,5 %, etap 65). Rezerwa wydana głównie w 2016 (17 kupień), później brak pieniędzy na nowe spółki. Sprzedaż przy P/E > 50 i PEG > 3 obniża wynik (11,1 % vs 13,5 % bez sprzedaży); łagodniejszy próg P/E > 30 i PEG > 2 13,9 %; z warunkiem przychodów 14,4 %. Hipoteza: wycena jako wyjście ≈ trzymanie — odrzucona (X1 szkodzi, X3 ≈).

## Etap 66b: jak etap 66, ale kupno tylko przy PEG < 2 (zapisane 2026-11-18 PRZED uruchomieniem)
Użytkownik: „jak NVDA mogła wejść z 3,3 — to za drogo, poniżej 2 to cena godziwa”. W etapie 66 nowe spółki nie miały progu PEG (wniosek z etapów 59–63).
Teraz: kupno tylko przy PEG < 2 (warianty < 1,5 i < 1); reszta bez zmian (wielkość 5 %/PEG, bez przebudowy, wyjścia X0–X4, kontrola bez NVDA).
Hipoteza: niższy wynik niż bez progu (więcej kapitału w SPY), mniejszy DD.

Wynik etapu 66b (2026-11-18): z progiem PEG przy kupnie i wyjściem X4 (P/E > 50 i PEG > 3 lub przychody < 8 % dwa lata): PEG < 2 14,5 %, PEG < 1,5 15,1 %, PEG < 1 15,1 % (SPY 14,1 %); bez NVDA praktycznie bez zmian (14,2 / 15,0 / 14,9 %) — po raz pierwszy wynik nie zależy od NVDA. Większość kapitału w SPY (58–70 %). Bez sprzedaży lub sprzedaż tylko po wycenie gorsze (10,8–13,3 %). Hipoteza (niższy wynik niż bez progu) odrzucona: próg przy braku przebudowy pomaga.

## Etap 67: strategia „Lower Risk (Hello Stocks)” — 7 kryteriów, kupno 7/7, trzymanie 6/7, sprzedaż ≤ 5/7 (zapisane 2026-11-19 PRZED uruchomieniem)

Użytkownik (PDF z zestawieniem): „wyszukuje i kupuje spółki z 7/7, trzyma, gdy mają 6/7, a gdy 5/7 — sprzedaje; autor twierdzi, że od 2025 ma 140 % zysku.
Nielimitowany kapitał … trzymamy wszystkie i mierzymy zysk procentowy; sprawdź na inne lata; sprawdź też portfel 15–30 spółek”.
Kryteria (na koniec miesiąca, PIT): K1 przychody 5 lat > +50 %, K2 przychody TTM r/r > 5 %, K3 EPS TTM r/r > 5 %, K4 ROE > 15 %, K5 0 ≤ dług/kapitał < 1, K6 FCF TTM > 0,
K7 0 < PEG < 1, gdzie PEG = P/E ÷ (100 × wzrost EPS 5 lat). Autor używa PEG z PROGNOZY 5-letniej („5Y Exp-Based”), której historycznie nie mamy — przybliżenie:
(a) historyczny CAGR EPS 5 lat [główne], (b) CAGR przychodów 5 lat. Wykluczone sektory: finanse, materiały, energia, użyteczność publiczna, nieruchomości (GICS / SIC).
Wszechświat: członkowie S&P 500 PIT ze spółkami usuniętymi (autor ma szerszy rynek USA — ograniczenie). Brak danych dla kryterium = niespełnione.
(1) Nielimitowany kapitał: każda spółka, która osiąga 7/7 i nie jest trzymana, kupowana za 1 jednostkę; trzymana dopóki ma ≥ 6/7; sprzedaż przy ≤ 5/7
(albo koniec notowań); ponowne wejście dozwolone. Wynik okresu startującego w miesiącu S i kończącego się w E: zysk % = (wartość pozycji otwartych + wpływy ze sprzedaży)
/ suma zainwestowana − 1 (start z pustym portfelem: w S kupowane wszystkie 7/7); porównanie: te same przepływy w SPY (każda jednostka w SPY od kupna do sprzedaży lub E).
Okresy: S = 2025-01, E = 2026-09 (ostatni miesiąc z fundamentami; poprawione przed odczytem: w 2026-10 brak danych przychodów -> wszystko sprzedawane) — weryfikacja tezy „+140 % od 2025”; oraz S = styczeń każdego roku 2015–2024 z E = S + 21 mies.
(taka sama długość) i E = 2026-10. Także roczna stopa (IRR) strategii i SPY przy tych samych przepływach.
(2) Portfel ograniczony: N ∈ {15, 20, 30} równych miejsc (1/N konta przy kupnie), kupno 7/7 od najniższego PEG gdy jest wolne miejsce, trzymanie ≥ 6/7, sprzedaż ≤ 5/7,
wolna gotówka w SPY, bez przebudowy; 2015-01..2026-10, CAGR, DD, okna vs SPY; także wyniki od 2025-01.
Hipoteza: +140 % w ~21 mies. na S&P 500 nie do odtworzenia (spodziewane rzędu +20–60 %); inne lata zmienne; portfel ograniczony ≈ SPY ± 3 pp.

Wynik etapu 67 (2026-11-19): (1) nielimitowany kapitał od 2025-01 do 2026-09: +30,8 % (PEG z EPS) / +10,4 % (PEG z przychodów) vs SPY przy tych samych przepływach +12,2 / +8,3 % — teza „+140 %” nie potwierdzona na S&P 500 (autor: szerszy rynek USA i PEG z prognozy). Okna 21-mies. od stycznia 2015–2024: −4 % … +30 %. (2) Portfel 15–30 miejsc 2015–2026: 18,5–20,8 %/rok vs SPY 14,1 %, DD −22 … −34 %; bez FIX 17,3–17,7 %, bez 5 najlepszych spółek 16,1–17,0 %. Hipoteza: +140 % nie do odtworzenia — potwierdzona; portfel ograniczony ≈ SPY ± 3 pp — odrzucona (lepszy o 2–7 pp).

## Etap 68: strategia Hello Stocks na „top 500 spółek USA wg kapitalizacji” (zapisane 2026-11-19 PRZED uruchomieniem)

Użytkownik: autor robi „screening of the top 500 US stocks by market cap” (nie S&P 500; 13 z 60 spółek jego listy jest poza S&P 500).
Dane: kandydaci = kody z szerokiego zbioru EODHD (14 300) ze średnimi obrotami 12 mies. w top 600 w dowolnym miesiącu od 2009 (bez warrantów / preferowanych / OTC),
CIK: dotychczasowe mapy + lista SEC + nazwy EODHD (aktywne i wycofane) dopasowane do cik-lookup-data i sprawdzone pokryciem okresu raportów;
companyfacts dla wszystkich kandydatów: te same pozycje co dotąd + liczba akcji (dei:EntityCommonStockSharesOutstanding, zapas us-gaap CommonStockSharesOutstanding)
-> /home/user/ndx/szer/. Kapitalizacja = cena (niekorygowana, koniec miesiąca) × ostatnia znana liczba akcji (≤ 400 dni). Skład = 500 największych w danym miesiącu
spośród spółek z danymi SEC (spółki raportujące w IFRS / 20-F bez us-gaap odpadają — ograniczenie). Ten skład zastępuje S&P 500 w łańcuchu r19 → r25 → r59 → r66 → r90
(ścieżki przez zmienne środowiskowe, osobny cache); reguły etapu 67 bez zmian (7 kryteriów, 5 sektorów wykluczonych, 7/7 / 6/7 / ≤ 5/7, nielimitowany kapitał
i portfel 15 / 20 / 30). Porównanie z etapem 67 (S&P 500). Hipoteza: szerszy wszechświat podnosi wynik od 2025 (więcej mniejszych zwycięzców), ale nie do +140 %.

Wynik etapu 68 (2026-11-19): top 500 USA (91 spółek spoza S&P 500 w 2026-10; z 13 spółek autora spoza S&P 9 w naszym składzie — HEI, ONC, TOST, UI wypadły przez brak liczby akcji / 20-F / obroty). Od 2025-01 nielimitowany kapitał: +35,5 % (PEG z EPS) vs SPY +12,9 % przy tych samych przepływach (S&P 500: +30,8 %); portfel 15–30: od 2025 +65…+71 %, 2015–2026 17,8–19,1 %/rok (S&P 500: 18,5–19,6 %). Hipoteza potwierdzona: szerszy rynek podnosi wynik o kilka pp, nie do +140 %.

## Poprawka danych (2026-11-19): EPS przy splicie w trakcie roku finansowego
Wykryte przy sprawdzaniu PEG dla NVDA: 4. kwartał = EPS roczny − Q1..Q3 liczony z wartości sprzed korekty o splity; przy splicie w trakcie roku (NVDA 10:1 w 06.2024)
Q4 wychodził ujemny (−4,49 USD), EPS TTM i wzrost EPS r/r w 2025–26 = brak → kryterium K3 niespełnione (NVDA 6/7 zamiast 7/7). Członek z EPS TTM > 0 bez wzrostu
r/r: 5,9 % obserwacji. Poprawka w r59: korekta każdego wiersza EPS (współczynnik adj/close w dniu złożenia) PRZED wyliczeniem Q4. Przeliczenie: cache top 500 i S&P 500,
etapy 67 i 68 (wyniki przed poprawką zachowane). Etapy 31–66 korzystały z tego samego cache (EPS, P/E, PEG z EPS) — do ewentualnego przeliczenia.
Wynik po poprawce EPS (2026-11-19): top 500 od 2025-01 +35,9 % (PEG z EPS) / +18,1 % (PEG z przychodów), NVDA kupiona w 2025 (+91 %); S&P 500 +31,3 % / +14,6 %; portfele 15–30: 17,7–21,3 %/rok 2015–2026. Wnioski etapów 67–68 bez zmian.

## Etap 69: dwa wzorce wzrostu sprzedaży i zysków — „paraboliczny” (jak NVIDIA) i „stabilny, znaczny” (jak Microsoft); czy się powtarzają w innych spółkach (zapisane 2026-11-19 PRZED uruchomieniem)

Użytkownik: „szukamy dwóch typów wzrostowych sprzedaży: jeden jak NVIDIA — paraboliczna sprzedaż rok do roku; drugi jak Microsoft — wzrost stabilny, ale znaczny;
przeanalizuj wykresy sprzedaży i zarobków i szukaj podobnych wzorców w innych, sprawdź, czy się powtarzają”.
Dane: top 500 USA (etap 68), przychody i zysk netto kwartalnie z SEC → TTM znane od daty złożenia; ceny miesięczne (skorygowane). Okres: 2012-01..2026-09.
Cechy (na koniec miesiąca, z kwartałów znanych do t): g_k = wzrost przychodów TTM r/r dla kolejnych kwartałów; g0 = ostatni, g4 = 4 kwartały wcześniej.
PARABOLA (typ NVIDIA): g0 ≥ 30 %, przyspieszenie g0 − g4 ≥ 15 pp, zysk netto TTM > 0 i wzrost zysku TTM r/r ≥ 50 %.
STABILNY (typ Microsoft): wszystkie g z ostatnich 12 kwartałów w [8 %, 30 %], odch. std ≤ 5 pp, zysk TTM r/r > 0 teraz, rok i dwa lata temu, marża operacyjna
teraz ≥ marża 3 lata temu − 2 pp. Sprawdzenie kalibracji: miesiące NVDA i MSFT oznaczone wzorcem (wykres przychodów i zysku obu spółek).
Wyniki: (a) zwrot 12 / 36 mies. naprzód spółek we wzorcu vs średnia spółek top 500 (równe wagi) i vs SPY — średnia, mediana, odsetek pobić, osobno starty 2012–2017
i 2018–2023; (b) portfel równych wag spółek we wzorcu przebudowywany co miesiąc vs SPY, QQQ, równe wagi top 500; (c) trwałość wzorca: P(wzorzec za 12 mies. | wzorzec teraz);
(d) lista spółek we wzorcu dziś. Hipoteza: STABILNY bije średnią spółkę o kilka pp/rok (konsekwencja wzrostu, etap 58), PARABOLA ma wysoki średni, ale niski medianowy wynik
(kilka wielkich zwycięzców, wiele odwróceń), wzorzec PARABOLA mało trwały.

Wynik etapu 69 (2026-11-19): PARABOLA (typ NVIDIA) po wykryciu daje w 36 mies. średnio −9 pp względem średniej spółki (mediana −21 pp, 35 % pobić); wzorzec prawie nie trwa (5,5 % po roku), najczęściej łapie szczyty cyklu (fundusze, półprzewodniki pamięci, surowce). STABILNY (typ Microsoft): +6 pp średnio w 36 mies., ale tylko w 2018–2023 (+10 pp), w 2012–2017 −1 pp, mediana −2 pp. Portfele: 13,7 % i 9,9 %/rok vs SPY 14,7 %, QQQ 19,6 %. Hipoteza: PARABOLA wysoka średnia / niska mediana — częściowo (średnia też ujemna); STABILNY bije średnią o kilka pp — tylko w drugiej połowie.

## Etap 70: kupno tylko przy PEG < 2 i trzymanie do 5 lat — MSFT, NVDA i spółki z wzorców (zapisane 2026-11-19 PRZED uruchomieniem)

Użytkownik: „takie spółki zaczynają zarabiać po kilku latach, np. 5, bo dopiero rynek je wycenia; dlatego ważne jest PEG i kupowanie po rozsądnej cenie;
sprawdź, kiedy Microsoft miał PEG poniżej 2 — kupuj; tak samo NVIDIA”.
PEG = P/E (TTM) ÷ (100 × CAGR EPS 5 lat), dane top 500 USA po poprawce EPS (etap 68); wariant z CAGR przychodów 5 lat. Dla każdego miesiąca 2012-01..2025-09:
zwrot ceny 12 / 36 / 60 mies. naprzód (60 mies. tylko starty do 2021-09). (a) MSFT i NVDA: miesiące z PEG < 1, 1–2, ≥ 2 (lub brak PEG) — średni zwrot i nadwyżka
nad SPY; (b) spółki we wzorcach STABILNY / PARABOLA (etap 69) oraz wszystkie spółki top 500: to samo w koszykach PEG; nadwyżka nad średnią spółek i nad SPY,
mediana, odsetek pobić, połowy startów 2012–2016 / 2017–2021. Hipoteza: dla pojedynczych spółek (MSFT, NVDA) kupno przy PEG < 2 daje lepszy zwrot 5-letni;
w przekroju PEG < 2 w spółkach STABILNY daje kilka pp więcej niż PEG ≥ 2, ale efekt słaby (etap 47: PEG ~ 0 dla 5 lat).

Wynik etapu 70 (2026-11-19): spółki o stabilnym wzroście (typ Microsoft) kupione przy PEG < 1 dały w 5 lat średnio +54 pp ponad średnią spółkę (mediana +53 pp, 64 % pobić SPY), przy PEG 1–2 i ≥ 2 — od −32 do −37 pp; efekt w obu połowach, ale tylko 13 różnych spółek. Dla wzorca PARABOLA i dla wszystkich spółek PEG działa słabo. MSFT: najlepsze lata zakupu (2015–2018) miały PEG ≥ 2 lub brak PEG (spadek EPS po odpisach). Hipoteza: dla pojedynczych spółek — nie (MSFT odwrotnie); w przekroju STABILNY + PEG < 2 — efekt dużo silniejszy niż zakładano, ale tylko przy PEG < 1.

## Etap 71: własna prognoza wzrostu EPS na 5 lat (z historii EPS i przychodów) w PEG (zapisane 2026-11-19 PRZED uruchomieniem)

Użytkownik: „weź przykładowe szacowanie po wzroście EPS i sprzedaży, sam oszacuj i dodaj do PEG, sprawdź wtedy”.
Prognoza wzrostu EPS (CAGR 5 lat naprzód), dane top 500 USA po poprawce EPS: F1 historyczny CAGR EPS 5 lat; F2 CAGR przychodów 5 lat; F3 estymata ważona przychodów
(ostatnie 4 kwartały r/r, wagi 0,1/0,2/0,3/0,4 — wzór użytkownika); F4 średnia F1 i F2; F5 model: regresja (najmniejsze kwadraty, zmienne przycięte do [−50 %, 100 %])
przyszłego CAGR EPS 5 lat na F1, F2, F3 i wzrost EPS r/r, dopasowana na startach 2012–2016 i stosowana do wszystkich (2017+ = poza próbą); prognozy przycięte do [0, 60 %].
Odniesienie (nieosiągalne): F* = faktyczny przyszły CAGR EPS 5 lat. PEG_k = P/E ÷ (100 × F_k).
Miary: (a) trafność: IC Spearmana prognozy z faktycznym CAGR EPS 5 lat i średni błąd bezwzględny (starty 2012–2021); (b) jak w etapie 70: zwrot 3 i 5 lat
wg koszyków PEG < 1 / 1–2 / ≥ 2 dla spółek STABILNY i wszystkich, nadwyżka nad średnią spółek, pobicie SPY, połowy 2012–2016 / 2017+; liczba różnych spółek.
Hipoteza: F5 ≥ F1 w trafności, ale IC prognozy ≤ 0,3; PEG z F5 daje wyraźniejszy podział niż z F1 tylko poza próbą o kilka pp.

Wynik etapu 71 (2026-11-19): najlepsza własna prognoza (model F5: wzrost przychodów + mean reversion historycznego EPS) ma IC 0,25 poza próbą (historyczny EPS −0,21). W całym top 500 PEG z każdą prognozą słabo dzieli zwroty (mediany nadwyżki ok. −15…−22 pp w każdym koszyku), tylko z faktycznym przyszłym EPS (nieosiągalne) PEG < 1 daje +94 pp. W spółkach STABILNY niski PEG pomaga przy każdej prognozie (+51…+164 pp), ale to 1–12 spółek. Hipoteza potwierdzona (F5 trafniejszy, IC ≤ 0,3; zysk zwrotu z lepszej prognozy mały w przekroju).

## Etap 72: PEG z własną prognozą (model F5 i estymata przychodów F3) — MSFT, NVDA i portfel spółek stabilnych (zapisane 2026-11-19 PRZED uruchomieniem)
Użytkownik: „jaki zysk z NVIDIA i MSFT przy takim estymowanym EPS i PEG; sprawdź też portfel spółek stabilnych z tym szacowaniem EPS do PEG”.
(a) MSFT, NVDA: koszyki PEG (< 1, 1–2, ≥ 2) wg F5 i F3, zwrot 1 / 3 / 5 lat i nadwyżka nad SPY (jak etap 70). (b) Portfel: co roku w styczniu kupno spółek STABILNY
(etap 69) z PEG < 1 (wariant < 2, < 1,5) wg F5 / F3 / F1, każda za 1/10 konta (max 10 pozycji, kolejność od najniższego PEG), trzymanie 5 lat (wariant: sprzedaż,
gdy przestaje być STABILNY i PEG ≥ 3), wolna gotówka w SPY, koszt 0,1 %; 2013-01..2026-09; CAGR, DD, vs SPY / QQQ; kontrola bez najlepszej spółki.
Hipoteza: portfel ≈ SPY ± 3 pp (mało spółek, większość w SPY).

Wynik etapu 72 (2026-11-19): z prognozą F5 NVDA nigdy nie ma PEG < 2 (model przewiduje spowolnienie po szybkim wzroście EPS), MSFT tylko w 2014–2016. Portfele spółek stabilnych z PEG z własną prognozą: 12,6–15,5 %/rok vs SPY 14,6 % (QQQ 20,2 %), średnio 1–6 spółek, reszta w SPY. Hipoteza (≈ SPY ± 3 pp) potwierdzona.

## Etap 73: inwestor długoterminowy — spółki stabilne (przychody 10–18 % r/r) i paraboliczne; czy fundamenty liczą się dopiero po 5–10 latach; portfel z dokupowaniem przy niskim PEG (zapisane 2026-11-20 PRZED uruchomieniem)

Użytkownik: „autor twierdzi, że w długim terminie (5–10 lat) dopiero stabilne przychody mają znaczenie, a rok–dwa to sentyment; chcę mieć spółkę nawet 10 lat i kupować,
gdy jest tania (PEG < 2, stabilne często ~1,5 to świetne okno; wzrostowe często < 1); 70 % spółek to stabilnie rosnące ze sprzedażą 10–18 % r/r; jedna paraboliczna da więcej”.
Dane top 500 USA (etap 68). STABILNA = przychody TTM r/r w [10 %, 18 %] teraz, 12 i 24 mies. temu, 0 ≤ dług/kapitał < 1, FCF > 0. PARABOLICZNA = wzorzec PARABOLA (etap 69).
(A) Horyzont: nadwyżka zwrotu nad średnią spółek top 500 po 12 / 36 / 60 / 120 mies. dla STABILNEJ, PARABOLICZNEJ i reszty (120 mies.: starty 2012–2016); mediana, odsetek pobić.
(B) Portfel 2013-01..2026-09: co miesiąc kupno transzą 2 % konta (max 4 transze / mies., max 10 % na spółkę przy kupnie, kolejność od najniższego PEG): STABILNA przy PEG < 2,
PARABOLICZNA przy PEG < 1 (część paraboliczna max 30 % konta); dokupowanie trzymanych przy tych samych progach; trzymanie bez limitu czasu; sprzedaż tylko przy załamaniu:
przychody r/r < 5 % teraz i rok temu albo dług/kapitał > 1; wolna gotówka w SPY. PEG = P/E ÷ (100 × CAGR EPS 5 lat) [wariant: ÷ CAGR przychodów 5 lat].
Warianty: tylko STABILNE; tylko PARABOLICZNE; obie; bez NVDA. CAGR, DD, vs SPY / QQQ / równe wagi top 500. Hipoteza: (A) przewaga STABILNEJ rośnie z horyzontem; (B) obie ≈ SPY + 0–3 pp.

Wynik etapu 73 (2026-11-20): (A) przewaga spółek o stabilnym wzroście 10–18 % nie rośnie wyraźnie z horyzontem (1 rok −4,8 pp, 3 lata −1,9, 5 lat +2,4 pp; 10 lat — 7 spółek, niewiarygodne); paraboliczne: wysoka średnia, ujemna mediana. Takie spółki to 1,2 % top 500 (3 lata z rzędu 10–18 %). (B) Portfele 10,5–13,2 %/rok vs SPY 14,6 %. Hipoteza (A) odrzucona, (B) — wynik poniżej SPY (gorzej niż zakładano).

## Etap 74: wzrost przychodów 5 lat > 8 %/rok, dług < 1, FCF > 0, ROE > 15 %, ROA > 10 %, ROE dziś > ROE 5 lat temu — portfel długoterminowy (zapisane 2026-11-20 PRZED uruchomieniem)
Użytkownik: „CAGR 5 lat sprzedaży powyżej 8 % plus reszta (dług itd.); podobno ROE > 15 %, ROA > 10 % i ROE dziś większe niż 5 lat temu”.
Dane top 500 USA (etap 68) + aktywa ogółem z SEC (nowe pobranie). Warunki na koniec miesiąca: K1 CAGR przychodów 5 lat > 8 %, K2 0 ≤ dług/kapitał < 1, K3 FCF > 0,
K4 ROE > 15 %, K5 ROA (zysk netto TTM / aktywa) > 10 %, K6 ROE teraz > ROE 60 mies. temu (wariant: 36 mies.). Zestawy: Z1 = K1–K3; Z2 = Z1 + K4; Z3 = Z2 + K5; Z4 = Z3 + K6.
(A) nadwyżka nad średnią spółek po 1 / 3 / 5 lat (mediana, pobicia, liczba spółek), połowy 2012–2016 / 2017+. (B) portfel w stylu użytkownika: co miesiąc transze 2 % konta
(max 4 / mies.), max 10 % na spółkę przy kupnie, kolejność od najniższego PEG (P/E ÷ CAGR przychodów 5 lat), warianty: bez progu PEG / PEG < 2; dokupowanie przy tych samych
warunkach; sprzedaż przy załamaniu (przychody r/r < 5 % teraz i rok temu lub dług/kapitał > 1); gotówka w SPY; 2013-01..2026-09; wariant z przycinaniem do 15 % w styczniu;
bez NVDA. Hipoteza: Z3 / Z4 dają kilka pp nad średnią spółek w 5 lat; portfel ≈ SPY + 0–3 pp; K6 (ROE rośnie) bez efektu (etap 58: Δ ROE słabe).

Wynik etapu 74 (2026-11-20): warunki jakości działają narastająco: mediana nadwyżki 5 lat nad średnią spółkę: Z1 −21 pp, Z2 −12, Z3 +1, Z4 (ROE rośnie vs 5 lat temu) +13 pp, w obu połowach (+15 / +13 pp), 77 spółek. Hipoteza: Z3/Z4 kilka pp — potwierdzona (więcej niż zakładano); K6 bez efektu — odrzucona (rosnące ROE dodaje najwięcej). Portfel Z4 20,5–22,8 %/rok, ale NVDA = 69–73 % portfela; bez NVDA 12,3 %, z przycinaniem do 15 % 16,0 % (SPY 14,6 %).

## Etap 75: + ROCE > 15 % (Z5) (zapisane 2026-11-20 PRZED uruchomieniem)
Użytkownik: „podobno używa jeszcze ROCE, też powyżej 15 %, jako Z5”. ROCE = zysk operacyjny TTM ÷ kapitał zaangażowany, kapitał zaangażowany = aktywa ogółem − zobowiązania bieżące
(ostatnie znane, ≤ 400 dni; zobowiązania bieżące — nowe pobranie z SEC; brak zobowiązań bieżących (np. banki) = brak ROCE). Z5 = Z4 + ROCE > 15 %; dodatkowo Z3 + ROCE > 15 %
(bez warunku rosnącego ROE). Analiza i portfel jak w etapie 74 (bez progu PEG / PEG < 2, przycinanie do 15 %, bez NVDA). Hipoteza: ROCE w dużej mierze pokrywa się z ROE i ROA
(mało spółek odpada), zmiana wyniku w granicach szumu.

Wynik etapu 75 (2026-11-20): ROCE jest silnie powiązane z ROE (0,83) i ROA (0,88). Z5 (Z4 + ROCE > 15 %): mediana nadwyżki 5 lat +22 pp (Z4 +13), ale tylko w 2017+ (+26 pp); w 2012–2016 +0,7 pp (10 spółek). Portfel z przycinaniem 17,7 % vs 16,0 % (Z4), bez NVDA 13,0 % vs 12,3 %. Hipoteza (zmiana w granicach szumu) potwierdzona — poprawa niestabilna między połowami.

## Etap 76: czy ocena ze strony wybiera dobre spółki, jakie wagi kategorii, nowe cechy jakości (zapisane 2026-11-20 PRZED uruchomieniem)

Użytkownik: „czy możemy coś jeszcze określić lub dodać, żeby wyznaczyć dobrą spółkę? … sprawdzałeś korelację różnych parametrów?” + „do etapu 76 dodaj
4 pierwsze punkty z «czego jeszcze nie badaliśmy»” (rozwodnienie / skup akcji, jakość zysku FCF ÷ zysk netto, stabilność marży brutto, momentum ceny).
Dane: top 500 USA (etap 68, ze spółkami usuniętymi), koniec miesiąca 2012-01..2026-09, dane SEC znane w danym dniu (data złożenia); sektor: GICS (gics.csv),
brak — z kodu SIC (zakresy jak w etapie 45, przypisane do sektorów GICS). Nowe pobranie z SEC: zysk brutto (GrossProfit, zapas: przychody − CostOfRevenue /
CostOfGoodsAndServicesSold), aktywa bieżące, zapasy, gotówka + inwestycje krótkoterminowe.
Wynik = nadwyżka zwrotu nad średnią spółek top 500 po 12 / 36 / 60 mies. (60 mies.: starty do 2021-09).

(A) Ocena ze strony odtworzona historycznie (percentyle w sektorze, ≥ 5 spółek, brak = 50 pkt, ≥ 2 wskaźniki w grupie): Wzrost = przychody 1 r., CAGR 3 i 5 l.,
EPS 1 r., EPS 5 l. (łącznie), lata z przychodami > 10 % (z 5); Siła = marża brutto / operacyjna / netto, ROE, ROA, ROCE, marża FCF, dług/kapitał (mniej
lepiej), quick ratio, gotówka netto / kapitalizacja; Wycena = P/E, PEG (P/E ÷ CAGR EPS 5 l.), P/S, P/FCF (mniej lepiej), stopa FCF. Pominięte (brak historii):
prognoza EPS analityków, potencjał DCF. Ogólna = 0,4 / 0,35 / 0,25. Miary: IC Spearmana (średnia miesięczna, t Neweya-Westa z opóźnieniem h − 1), nadwyżka
kwintyli (K5 − K1), mediana nadwyżki K5, połowy 2012–2016 / 2017+.
(B) Wagi: siatka wag (wzrost, siła, wycena) co 0,05, suma 1; wybór najlepszego IC 36 mies. na startach 2012–2018, sprawdzian na startach 2019–2023-09
(36 mies.) i 2019–2021-09 (60 mies.); porównanie z 0,4 / 0,35 / 0,25 i z każdą grupą osobno.
(C) Nowe cechy: C1 lata z EPS r/r > 0 (z 5), C2 lata z ROIC > 15 % (z 5; ROIC ≈ zysk operacyjny × 0,79 ÷ (kapitał + dług − gotówka)), C3 zmiana liczby
akcji 3 lata (mniej = lepiej; skup), C4 FCF ÷ zysk netto (3 lata łącznie; zysk ≤ 0 = brak), C5 marża brutto (poziom) i C5b zmienność marży brutto
(odch. std. rocznej marży z 5 lat, mniej = lepiej), C6 momentum: zwrot 3 mies., 6 mies., 12 mies. bez ostatniego (12-1). Dla każdej: IC 12 / 36 / 60 mies.,
K5 − K1, połowy; IC częściowy po odjęciu oceny ogólnej (reszta rang z regresji na ranga oceny). Reguła przyjęcia do strony (ustalona teraz): IC 36 lub 60
mies. o tym samym znaku w obu połowach, |t| ≥ 2 w całości i IC częściowy > 0 (po uwzględnieniu kierunku).
Hipoteza: (A) ocena ogólna ma dodatni, ale słaby IC 60 mies. (0,03–0,08), siła i wzrost mocniejsze niż wycena; (B) najlepsze wagi przesuwają się od wyceny
do wzrostu / siły, ale zysk poza próbą ≤ 0,02 IC; (C) C1 i C2 przechodzą regułę (etap 58), C3 słaby dodatni, C4 słaby, C5b dodatni, momentum 12-1 dodatni
na 12 mies., ~0 na 60 mies.

Wynik etapu 76 (2026-11-20): (A) ocena ogólna ze strony prawie nie przewiduje nadwyżki: IC 5 lat 0,02 (t 2,0), top 10 % spółek wg oceny — średnio +24 pp
w 5 lat, ale mediana −17 pp (bije średnią 43 %). Siła finansowa działa (IC 5 lat 0,077, t 3,3, obie połowy), wycena ~0, wzrost liczony w sektorze ujemny
(−0,04). (B) najlepsze wagi w próbie 0,05 / 0,95 / 0 (prawie sama siła): poza próbą IC 3 lata 0,054 vs 0,029 przy wagach strony (5 lat 0,057 vs 0,054);
sama wycena: w próbie −0,06, poza próbą +0,14 — niestabilna. (C) regułę przechodzą: C1 lata z rosnącym zyskiem netto (IC 5 lat 0,051, t 3,2; częściowy 0,03)
i C3 zmiana liczby akcji 3 lata — mniej akcji (skup) lepiej (IC 5 lat 0,093, t 4,9, obie połowy 0,08 / 0,10; częściowy 0,083, t 3,8; K5 − K1 +12 pp).
Nie przechodzą: C2 lata z ROIC > 15 % (połowy z różnym znakiem), C4 FCF ÷ zysk (t 1,9), C5 marża brutto (t 1,4), C5b zmienność marży (~0), momentum 3 / 6 /
12-1 mies. (~0). Diagnoza po wyniku (poza regułą): te same cechy rankowane w całym zbiorze zamiast w sektorze działają lepiej — lata z przychodami > 10 %
IC 5 lat 0,058 (t 2,9) vs 0,001 w sektorze, gotówka netto / kapitalizacja 0,123 vs 0,072, marża netto 0,10 vs 0,056, quick ratio 0,084 vs −0,01; sektor
technologiczny +66 pp nadwyżki 5 lat (pozostałe −36…−3 pp) — porównanie tylko w sektorze usuwa znaczną część sygnału. Hipoteza: (A) słabiej niż zakładano,
siła > wycena — tak, wzrost > wycena — nie; (B) przesunięcie do siły — tak, zysk poza próbą 0,003–0,025 IC; (C) C1 tak, C2 nie, C3 silniej niż zakładano,
C4 słaby — tak, C5b i momentum — nie.

## Etap 77: ocena z odniesieniem do wszystkich spółek zbioru (decyzja użytkownika) i reguła „fundamenty spadają 2 lata z rzędu” (zapisane 2026-11-20 PRZED uruchomieniem)

Użytkownik: „zamień odniesienie do wszystkich tych 500 spółek, nie zmieniaj reszty … jeżeli fundamenty zaczynają upadać dwa lata z rzędu, to coś jest nie tak
i trzeba sprzedać … silnie stabilne firmy rosnące rok do roku w perspektywie 5 lat dadzą duże zyski”. Zmiana na stronie jest decyzją użytkownika (nie zależy od wyniku);
test tylko opisuje skutek. Dane i miary jak w etapie 76 (cechy z r101). (A) Ocena z percentylami w całym zbiorze (zamiast w sektorze), z cechami dodanymi w etapie 76
(lata ze wzrostem zysku — wzrost, zmiana liczby akcji — siła), wagi strony 0,4 / 0,35 / 0,25; porównanie z tą samą oceną w sektorze: IC 1 / 3 / 5 lat, połowy,
top 10 % (średnia, mediana, odsetek pobić). (B) Flaga SPADEK = przychody TTM r/r < 0 teraz i 12 mies. temu ALBO zysk netto TTM r/r < 0 teraz i 12 mies. temu:
nadwyżka 1 / 3 / 5 lat spółek z flagą vs bez (średnia, mediana, pobicia), połowy; (C) spółki „silne i stabilne”: przychody > 10 % r/r w ≥ 4 z 5 lat i zysk
rósł w ≥ 4 z 5 lat, bez flagi SPADEK: nadwyżka 3 / 5 lat (średnia, mediana, pobicia), połowy.
Hipoteza: (A) IC 5 lat wyższy niż w sektorze (0,02) — ok. 0,05; (B) SPADEK: nadwyżka 3–5 lat ujemna (−5…−15 pp); (C) dodatnia średnia i mediana w 5 lat (+5…+20 pp).

Wynik etapu 77 (2026-11-20): (A) ocena na tle całego zbioru przewiduje wyraźnie lepiej niż w sektorze: IC 5 lat 0,066 (t 5,5; połowy 0,055 / 0,076) vs 0,039;
top 10 % wg oceny: średnio +33 pp w 5 lat (2012–2016 +16, 2017+ +49 pp), w sektorze +23 pp; siła na tle całego zbioru IC 5 lat 0,135 (t 6,2) — najsilniejsza;
wzrost ~0, wycena ~0. (B) flaga SPADEK (przychody lub zysk r/r < 0 dwa lata z rzędu; mediana 36 spółek): nadwyżka średnio −4,1 pp w 3 lata i −4,3 pp w 5 lat
(bez flagi +1,3 / +1,9 pp), odsetek pobić średniej 38 % vs 40 % (5 lat); efekt stały w połowach dla 5 lat, słaby. (C) spółki silne i stabilne (przychody > 10 %
w ≥ 4 z 5 lat, zysk rósł w ≥ 4 z 5, bez SPADKU; mediana 18): średnio +17 pp w 5 lat (2017+ +24 pp, 2012–2016 −5 pp), mediana −27 pp (jak cały zbiór −24) —
wynik średni ciągną najlepsze spółki. Hipoteza: (A) tak (0,066); (B) słabiej niż zakładano (−4 pp); (C) średnia tak, mediana nie, w 2012–2016 ujemna.

## Etap 78: każdy parametr osobno — 5 grup (kwintyle) i zwrot w 3 / 5 lat (zapisane 2026-11-20 PRZED uruchomieniem)

Użytkownik: „dlaczego nie analizujesz pojedynczo jeden parametr, czy wpływał na wzrost”. Analiza opisowa jednego parametru naraz, dane i cechy jak w etapie 76
(top 500 USA PIT bez wykluczonych sektorów, starty co miesiąc 2012-01..2021-09 dla 5 lat, 2012-01..2023-09 dla 3 lat). Dla każdego parametru w każdym miesiącu
spółki z wartością dzielone na 5 równych grup (G1 najniższa … G5 najwyższa wartość, bez odwracania kierunku); dla każdej grupy: średni zwrot spółki w 3 / 5 lat,
nadwyżka nad średnią wszystkich spółek (pp), odsetek spółek bijących średnią; G5 − G1; zgodność znaku G5 − G1 w połowach 2012–2016 / 2017+. Parametry: wszystkie
wskaźniki oceny (przychody 1 r., CAGR 3 / 5 l., lata z przychodami > 10 %, zysk 1 r. / 5 l., lata ze wzrostem zysku, marże, ROE, ROA, ROCE, marża FCF, dług/kapitał,
quick ratio, gotówka netto / kapitalizacja, zmiana liczby akcji, P/E, PEG, P/S, P/FCF, stopa FCF) + FCF ÷ zysk, marża brutto, momentum 12-1.
Hipoteza: rosnące G1 → G5 (lub malejące) z różnicą ≥ 10 pp w 5 lat dla: lata z przychodami > 10 %, marże, ROE / ROA, gotówka netto, zmiana liczby akcji (malejąca);
brak wyraźnego schodka dla P/E, P/S, przychodów 1 r., momentum.

Wynik etapu 78 (2026-11-20): 5 lat, G5 − G1 (nadwyżka nad średnią, pp), zgodne w obu połowach: gotówka − dług / kapitalizacja +55, quick ratio +53, marża FCF +51,
FCF ÷ zysk +39, lata z przychodami > 10 % +34 (+35 / +33 — najrówniejszy schodek), P/S +26 (droższe lepiej), CAGR przychodów 5 l. +25, marża netto +24, CAGR
przychodów 3 l. +19, P/E +17, skup akcji +15 (G5: 46 % bije średnią vs 35 % w G1), przychody 1 r. −9, zysk 1 r. −16 (najszybszy wzrost w ostatnim roku gorzej).
Niezgodne połowy: zysk 5 l., ROA, ROE, ROCE, marża operacyjna i brutto, dług, lata ze wzrostem zysku, PEG (2012–2016 wysoki PEG lepiej, 2017+ gorzej), momentum.
Średnie ciągną najlepsze spółki: odsetek spółek bijących średnią w G5 to 38–49 %. Hipoteza: schodki dla lat z przychodami, marż (FCF, netto), gotówki, skupu — tak;
ROE / ROA — nie (niestabilne); brak schodka dla P/E i P/S — nie (wyższa wycena była lepsza), dla przychodów 1 r. i momentum — tak.

## Etap 79: szukanie bez założeń — ok. 50 cech z raportów i cen, wybór na 2012–2016, sprawdzian na 2017+ (zapisane 2026-11-20 PRZED uruchomieniem)

Użytkownik: „nadal robisz podsumowanie moich, zamiast sprawdzić, co tak naprawdę ma znaczenie”. Zbiór jak w etapie 76 (top 500 USA PIT bez wykluczonych sektorów).
Cechy: wszystkie z etapów 76–78 + nowe: log kapitalizacji; wzrost aktywów 1 r.; wzrost kapitału własnego 3 l.; zysk brutto / aktywa; narosty (zysk − przepływy
operacyjne) / aktywa; capex / przychody; zapasy r/r − przychody r/r; gotówka / aktywa; current ratio; książkowa / rynkowa (kapitał / kapitalizacja); EV / przychody;
stopa zysku (zysk / kapitalizacja); zmiana marży operacyjnej 1 r. i 3 l.; zmiana marży brutto 3 l.; zmiana ROE 3 l.; przyspieszenie przychodów (1 r. − CAGR 3 l.);
przyspieszenie zysku; najgorszy rok przychodów z 5; zmienność rocznego wzrostu przychodów (5 l.); maks. spadek przychodów TTM w 5 l.; zmienność zysku (5 l.);
dźwignia operacyjna (wzrost zysku operacyjnego − wzrost przychodów, 3 l.); wzrost zysku 3 l.; przychody ostatni kwartał r/r i jego przyspieszenie (kwartał r/r −
ten sam 4 kwartały wcześniej); zmiana liczby akcji 1 r.; zwrot ceny 3 l. i 5 l. (odwrócenie długoterminowe); zmienność ceny 12 mies.; odległość od maks. 12 mies.
Metoda: (1) każda cecha osobno: IC Spearmana i G5 − G1 (kwintyle) dla nadwyżki 3 i 5 lat; okres WYBORU = starty 2012-01..2016-12, SPRAWDZIAN = starty 2017-01..
(2021-09 dla 5 l., 2023-09 dla 3 l.). „Odkrycie” = |t NW| ≥ 2 w wyborze i ten sam znak w sprawdzianie z |IC| ≥ połowa IC z wyboru. (2) Model LightGBM (płytkie
drzewa, 200 drzew, uczenie 0,03, liście ≥ 200 obs.) na rangach cech (w miesiącu) → ranga nadwyżki 5 l.; uczenie na wyborze, ocena na sprawdzianie: IC, nadwyżka
najlepszej piątki (G5) i porównanie z oceną ogólną strony (wersja z etapu 77) na tych samych startach; ważność cech = spadek IC po przemieszaniu cechy (sprawdzian).
Uwaga: zwroty okresu wyboru (do 2021) częściowo nakładają się w czasie na zwroty sprawdzianu (od 2017).
Hipoteza: odkrycia ≤ 10 cech, w tym gotówka netto / płynność, marża FCF, konsekwencja przychodów, zysk brutto / aktywa (znany czynnik), wzrost aktywów (ujemny);
model poza próbą IC 0,05–0,10, lepszy od oceny strony o ≤ 0,03.

Wynik etapu 79 (2026-11-20): odkrycia (5 lat; |t| ≥ 2 w 2012–2016 i ten sam znak w 2017+): skup akcji 3 l. (IC 0,082 / 0,104) i 1 r., marża FCF (0,115 / 0,070;
G5 − G1 +47 / +56 pp), marża netto i operacyjna, lata z przychodami > 10 % (0,074 / 0,052), CAGR przychodów 5 l., lata ze wzrostem zysku, wielkość (0,052 / 0,145),
niska zmienność kursu, oraz ujemne: szybki wzrost kapitału własnego 3 l. (−0,078 / −0,100) i zapasy rosnące szybciej niż sprzedaż; dla 3 lat dodatkowo capex /
przychody ujemnie (−0,029 / −0,106; w 5 l. sprawdzian −0,130, G5 − G1 −59 pp). Zmieniły znak między okresami: ROE, ROA, ROCE, zmiana ROE (2012–2016 ujemne, 2017+
mocno dodatnie), wskaźnik księgowa / rynkowa (2017+ −0,164: tanie „value” przegrywały), zwrot 3–5 l., zmienność zysku; gotówka netto i quick ratio silne w 2012–2016,
słabsze w 2017+. Model LightGBM poza próbą (2017–2021): IC 0,126 (t 2,3) vs ocena strony 0,076 (t 4,3), ale najlepsza piątka modelu +14,6 pp vs strony +27,3 pp;
najważniejsze w modelu: wielkość, księgowa / rynkowa, gotówka / aktywa, capex / przychody, maks. spadek przychodów 5 l., skup akcji, marża operacyjna. Hipoteza:
≤ 10 odkryć — 12 (5 l.); gotówka / płynność — tylko w 2012–2016; zysk brutto / aktywa — nie; wzrost aktywów — nie; model lepszy o ≤ 0,03 — o 0,05 IC, ale gorsza piątka.

## Etap 80: strategia ze strony — kupno spółek z najwyższą oceną przy uczciwej wycenie i reguły sprzedaży (zapisane 2026-11-20 PRZED uruchomieniem)

Użytkownik: „jak byś wybierał akcje o najwyższym score i uczciwej wycenie, czy ta strategia zarabia i kiedy sprzedać? To jest teraz najważniejsze”.
Zbiór: top 500 USA PIT bez wykluczonych sektorów (etap 76), tylko spółki z kursem sprzed ≥ 60 mies. (≥ 5 lat na giełdzie). Ocena ogólna jak na stronie
(percentyle w całym zbiorze; wzrost: przychody 1 r., CAGR 3 / 5 l., zysk 1 r. / 5 l., lata z przychodami > 10 %, lata ze wzrostem zysku; siła: marże brutto /
operacyjna / netto, ROE, ROA, ROCE, marża FCF, dług/kapitał, quick ratio, gotówka netto / kapitalizacja, zmiana liczby akcji 3 l., capex / przychody, wzrost
kapitału 3 l.; wycena: P/E, PEG, P/S, P/FCF, stopa FCF; wagi 0,4 / 0,35 / 0,25). PEG historyczny = P/E ÷ (100 × CAGR zysku netto 5 l.) — prognozy analityków
(używane na stronie) nie mają historii. Portfel co miesiąc, 2013-01..2026-09, koszt 0,1 % przy transakcji, równe wagi przy kupnie (1 / N konta), wolne miejsca
uzupełniane spółkami z najwyższą oceną spełniającymi warunek kupna, gotówka w SPY.
Kupno (K): ocena ogólna w top 10 % zbioru i PEG 0–2 (warianty: PEG 0–1; bez progu PEG; top 20 %). N = 20 (warianty 10, 30).
Sprzedaż (S): S0 nigdy (tylko wycofanie z obrotu); S1 ocena spada poza top 30 %; S2 fundamenty słabną 2 lata z rzędu (przychody lub zysk r/r < 0 teraz i rok
wcześniej); S3 PEG > 3 lub ujemny zysk; S4 = S2 lub S3; S5 co rok w styczniu sprzedaż spółek niespełniających warunku kupna.
Miary: CAGR, maks. obsunięcie, średni czas trzymania, średnia liczba spółek, odsetek kapitału w spółkach; vs SPY, QQQ, równe wagi zbioru; połowy 2013–2019 /
2020–2026; kontrola bez najlepszej spółki (NVDA). Hipoteza: K + S0/S2 ≈ SPY + 0–4 pp/rok; S1 (sprzedaż po spadku oceny) gorzej niż S0 przez koszty i wcześniejszą
sprzedaż zwycięzców; S3 (PEG > 3) obcina zwycięzców — gorzej niż S0; S2 ≈ S0 ± 1 pp.

Wynik etapu 80 (2026-11-20): kupno top 10 % oceny + PEG 0–2, N = 20, 2013-01..2026-09 (SPY 14,6 %/rok, QQQ 20,2 %, równe wagi 13,8 %): S0 nigdy 16,0 %
(DD −29 %; tylko 24 zakupy — portfel z 2013 r.), S1 spadek oceny 16,7 %, S2 fundamenty słabną 2 lata 20,1 % (DD −36 %, mediana trzymania 24 mies.), S3 PEG > 3
16,1 %, S4 (S2 lub S3) 16,9 %, S5 roczna przebudowa 16,3 %. Bez NVDA: S0 16,0 %, S2 16,4 %. Połowy: 2013–2019 S0 14,5 %, S2 13,2 %, S4 13,4 % (SPY 14,0 %);
2020–2026 S0 14,9 %, S2 17,7 %, S3 22,1 %, S4 24,3 % (SPY 15,5 %, QQQ 20,8 %). PEG 0–1 + S0 30,9 % i N = 30 + S0 29,3 % to efekt NVDA (63–78 % portfela).
Hipoteza: K + S0/S2 ≈ SPY + 0–4 pp — tak (+1,4 / +5,5 pp, bez NVDA +1,4 / +1,8 pp); S1 gorzej niż S0 — nie (podobnie); S3 obcina zwycięzców — w całości ≈ S0,
w 2020–2026 lepiej; S2 ≈ S0 ± 1 pp — nie, S2 +4 pp (głównie NVDA i 2020–2026; w 2013–2019 −1,3 pp).

## Etap 81: strategia użytkownika — trzymaj dobre firmy, dokupuj przy korzystnym PEG, sprzedaj, gdy fundamenty się psują (zapisane 2026-11-20 PRZED uruchomieniem)

Użytkownik: „jak firma rośnie, to trzymasz i dokupujesz, kiedy PEG pokaże korzystną cenę … trzymasz, aż wszystko się zgadza, ale jak zaczyna się psuć
i pogarszać, to rozważamy sprzedaż”. Zbiór, ocena, PEG (historyczny) jak w etapie 80; 2013-01..2026-09, koszt 0,1 %, wolna gotówka w SPY.
Wejście: ocena w top 10 % i PEG 0–2 → pierwsza transza 4 % konta (max 4 nowe spółki / mies., kolejność od najwyższej oceny).
Dokupowanie (D): trzymana spółka z PEG 0–1 („korzystna cena”) i bez pogorszenia → transza 2 % konta, max 1 transza / spółkę / mies., limit pozycji 15 %
konta przy dokupowaniu (warianty: bez dokupowania; PEG 0–1,5; limit 10 % / 20 %). Sprzedaż (P = pogorszenie): P1 fundamenty słabną 2 lata z rzędu
(przychody lub zysk r/r < 0 teraz i rok wcześniej); P2 = P1 lub ocena spada poniżej mediany zbioru (pogorszenie jakości); P3 = P1 lub 2 z 3: przychody r/r < 0,
zysk r/r < 0, ocena siły finansowej spadła o ≥ 2 pkt w 12 mies. Bez sprzedaży z powodu samej wysokiej wyceny.
Miary: CAGR, maks. obsunięcie, średnia liczba spółek, odsetek w spółkach, największe pozycje; vs SPY, QQQ, etap 80 (S2: 20,1 %); połowy 2013–2019 / 2020–2026
(start od zera); bez NVDA. Hipoteza: dokupowanie przy PEG 0–1 dodaje 0–2 pp/rok vs bez dokupowania; P1 ≈ P3, P2 gorzej (sprzedaje za wcześnie);
całość ≈ etap 80 S2 ± 2 pp; bez NVDA SPY + 0–3 pp.

Wynik etapu 81 (2026-11-20): 2013-01..2026-09 (SPY 14,6 %, QQQ 20,2 %): P1 (sprzedaż, gdy fundamenty słabną 2 lata) z dokupowaniem przy PEG 0–1 18,2 %/rok
(DD −37 %, średnio 10 spółek), bez dokupowania 18,4 % (DD −34 %, 23 spółki); dokupowanie przy PEG 0–1,5 20,4 %, limit 10 % 19,8 %, 20 % 19,3 %; P2 (P1 lub ocena
poniżej mediany) 17,2–17,3 %; P3 (P1 lub 2 z 3 pogorszeń) 13,5–15,0 %. Bez NVDA: P1 z dokupowaniem 16,2 %, bez dokupowania 17,0 %. Połowy: 2013–2019 P1 bez
dokupowania 15,0 % (SPY 14,0 %), z dokupowaniem 11,4 % (dokupowanie tanich SBUX, LUV); 2020–2026 bez 21,4 %, z 22,6 % (SPY 15,5 %, QQQ 20,8 %).
Hipoteza: dokupowanie +0–2 pp — nie (≈ 0 w całości, −3,6 pp w 2013–2019, +1,2 pp w 2020–2026; koncentruje portfel); P1 ≈ P3 — nie (P3 −3…−5 pp, sprzedaje
za wcześnie); P2 gorzej — tak (−1 pp); ≈ etap 80 S2 ± 2 pp — tak; bez NVDA SPY + 0–3 pp — tak (+1,6…+2,4 pp).

## Etap 82: sygnały ostrzegawcze — co wyprzedza załamanie kursu dobrych spółek i czy sprzedaż na sygnale poprawia portfel (zapisane 2026-11-20 PRZED uruchomieniem)

Użytkownik: „sprawdź, jakie parametry sprawiają pogorszenie ceny, żeby spodziewać się załamania i sprzedać spółkę”. Zbiór jak w etapie 80 (≥ 5 lat na giełdzie).
Próba: spółki „dobre” — ocena ogólna w top 30 % zbioru w danym miesiącu (to, co mogłoby być w portfelu). Wynik: nadwyżka zwrotu nad średnią zbioru w 12 mies.
i „załamanie” = nadwyżka 12 mies. ≤ −30 pp. Sygnały (stan na koniec miesiąca): Z1 przychody ostatniego kwartału r/r < 0; Z2 wzrost przychodów 12 mies. spadł
o ≥ 10 pp vs rok wcześniej; Z3 marża operacyjna spadła o ≥ 3 pp r/r; Z4 zysk netto r/r < 0; Z5 ocena ogólna spadła o ≥ 1,5 pkt w 12 mies.; Z6 ocena siły spadła
o ≥ 2 pkt w 12 mies.; Z7 kurs ≥ 30 % poniżej maks. 12 mies.; Z8 kurs poniżej średniej 10 mies.; Z9 zwrot 6 mies. ≤ −20 %; Z10 PEG > 3; Z11 P/E > 1,5 × mediana
własnego P/E z 36 mies.; Z12 liczba akcji +3 % r/r (emisja); Z13 zapasy rosną o ≥ 10 pp szybciej niż przychody; Z14 FCF < 0; Z15 (odniesienie) fundamenty słabną
2 lata z rzędu. Miary: dla każdego sygnału — średnia nadwyżka 12 mies. z sygnałem vs bez, odsetek załamań z sygnałem vs bez (krotność), liczba obserwacji;
okres WYBORU starty 2013–2018, SPRAWDZIAN 2019–2025-09. Sygnał „ostrzegawczy” = w wyborze nadwyżka z sygnałem niższa o ≥ 5 pp (t ≥ 2, błąd grupowany po miesiącach)
i ten sam znak w sprawdzianie. Portfel: strategia z etapu 81 bez dokupowania (sprzedaż P1) + dodatkowa sprzedaż przy każdym sygnale ostrzegawczym osobno
i przy dwóch najlepszych łącznie; CAGR, DD, połowy 2013–2019 / 2020–2026, bez NVDA.
Hipoteza: sygnały cenowe (Z7–Z9) i spadek oceny (Z5, Z6) wskazują gorszą przyszłość o kilka pp, ale jako reguła sprzedaży nie poprawiają portfela (sprzedają
zwycięzców w korektach); wycena (Z10, Z11) — słaby sygnał; Z1 / Z3 — ostrzegawcze, poprawa portfela ≤ 1 pp.

Wynik etapu 82 (2026-11-20): żaden sygnał nie przeszedł reguły ostrzegawczej. Dla dobrych spółek (ocena top 30 %) nadwyżka 12 mies. z sygnałem vs bez: w wyborze
od −6 pp (emisja akcji, t −1,0) do +41 pp (P/E > 1,5 × własna mediana), w sprawdzianie od −43 pp (spadek oceny siły, 3 obs.) do +14 pp; odsetek załamań (≤ −30 pp)
z sygnałem 6–24 % vs bez 10–17 % — sygnały cenowe (kurs −30 % od szczytu, zwrot 6 mies. ≤ −20 %) nieco częściej poprzedzają dalsze spadki (14–21 % vs 10–15 %),
ale średnio bez gorszego zwrotu (odbicia). Portfel (P1 18,4 %/rok): każdy dodatkowy sygnał sprzedaży poza dwoma obniżył wynik — przychody kwartału r/r < 0: 13,4 %,
spadek wzrostu przychodów: 13,2 %, spadek oceny: 14,3 %, kurs −30 % od szczytu: 14,4 %, kurs poniżej średniej 10 mies.: 15,3 % (DD −30 %), PEG > 3: 16,9 %;
emisja akcji > 3 % r/r 19,5 % i FCF < 0 19,0 % (poprawa po fakcie, bez sprawdzenia w połowach). Hipoteza: sygnały cenowe nie poprawiają portfela — tak; Z1 / Z3
ostrzegawcze — nie (Z1 −5 pp w portfelu); wycena słaba — tak (w wyborze wysokie P/E wręcz lepiej).

## Etap 83: sprzedaż, gdy 2 z 7 kryteriów listy kontrolnej przestają być spełnione (zapisane 2026-11-20 PRZED uruchomieniem)

Użytkownik: „tam jest ta ocena przez 7 parametrów — jak dwa będą niespełnione, to sprzedaj; sprawdź takie coś”. Zbiór, portfel i PEG (historyczny) jak w etapach 80–81
(transza 4 % konta, bez dokupowania, gotówka w SPY, koszt 0,1 %, 2013-01..2026-09). Listy: L7 „7/7 niskie ryzyko” — przychody 5 l. > +50 %, przychody 1 r. > 5 %,
zysk 1 r. > 5 %, ROE > 15 %, dług/kapitał 0–1, FCF > 0, PEG 0–1; J7 „Jakość” — CAGR przychodów 5 l. > 8 %, dług/kapitał 0–1, FCF > 0, ROE > 15 %, ROA > 10 %,
ROE wyższe niż 3 lata temu, ROCE > 15 %. Przy sprzedaży brak danych = kryterium spełnione (nie sprzedajemy przez lukę w danych); przy kupnie brak = niespełnione.
Warianty: wejście E1 = ocena top 10 % + PEG 0–2 (jak etap 81); E2 = 7/7 danej listy (kolejność od najwyższej oceny). Sprzedaż: ≤ 5/7 (2 niespełnione) danej listy;
≤ 4/7 (3 niespełnione); ≤ 5/7 lub P1 (fundamenty słabną 2 lata); odniesienie P1. Miary: CAGR, DD, liczba spółek, mediana trzymania, połowy 2013–2019 / 2020–2026,
bez NVDA. Hipoteza: E1 + sprzedaż ≤ 5/7 L7 gorzej niż P1 (kryterium PEG 0–1 i przychody 1 r. sprzedają zwycięzców przy przejściowych wahaniach), J7 ≈ P1 ± 2 pp;
E2 L7 ≈ etap 68 (18–21 %).

Wynik etapu 83 (2026-11-20): 2013-01..2026-09 (SPY 14,6 %, QQQ 20,2 %; odniesienie E1 + P1 18,4 %): wejście E1 (ocena + PEG) i sprzedaż ≤ 5/7: lista 7/7 16,6 %,
Jakość 16,3 % (≤ 5/7 lub P1: 16,5 / 15,6 %); ≤ 4/7: 16,5 / 19,9 %. Wejście 7/7: lista 7/7 — sprzedaż ≤ 5/7 14,4 % (średnio 49 % kapitału w spółkach, mało
spółek spełnia 7/7), P1 16,4 %; Jakość 7/7 — ≤ 5/7 16,9 % (DD −30 %), ≤ 4/7 21,0 %, P1 20,7 % (NVDA 43–45 % portfela). Połowy: 2013–2019 wszystkie warianty
≤ 5/7 12,3–13,6 % (SPY 14,0 %, E1 + P1 15,0 %); 2020–2026 17,1–22,2 % (SPY 15,5 %, E1 + P1 21,4 %). Bez NVDA: E1 + P1 17,0 %, Jakość 7/7 + ≤ 5/7 16,6 %,
E1 + ≤ 5/7 7/7 16,0 %, 7/7 + ≤ 5/7 14,4 %. Hipoteza: lista 7/7 ≤ 5/7 gorzej niż P1 — tak (−1,8 pp); Jakość ≈ P1 ± 2 pp — tak (−2,1 pp z E1, −1,5 pp z
wejściem 7/7); wejście 7/7 ≈ etap 68 (18–21 %) — nie (14,4 %; tu PEG historyczny zamiast prognoz analityków, transza 4 %, inny zbiór).

## Etap 84: portfel pół na pół — CEM10 i strategia fundamentalna (zapisane 2026-11-21 PRZED uruchomieniem)

Użytkownik: „tak, sprawdź pół na pół CEM10 i fundamentalną”. Okres 2013-01..2026-09 (wspólny; dane SEC od 2011). CEM10 jak w etapie 12 (S&P 500 PIT, N = 10,
zwrot 6 mies. > 30 % i kurs > SMA 10, ranking po zwrocie 6 mies., wyjście pod SMA 10, brak zakupów, gdy SPY < SMA 12, gotówka nieoprocentowana, koszt 0,1 %).
Fundamentalna F1 = etap 81 bez dokupowania (ocena top 10 % + PEG 0–2, transza 4 %, sprzedaż, gdy przychody lub zysk spadają 2 lata z rzędu, gotówka w SPY);
F2 = wejście 7/7 Jakość + ta sama sprzedaż (etap 83). Połączenia: 50/50 z wyrównaniem do 50/50 co rok w styczniu; 50/50 bez wyrównywania; 50/50 z wyrównaniem
co miesiąc. Miary: CAGR, maks. obsunięcie, zmienność, Sharpe (bez stopy wolnej), korelacja miesięcznych zwrotów CEM10 i F, zwroty rok po roku, najgorszy rok,
lata lepsze od SPY; połowy 2013–2019 / 2020–2026 (start od zera); bez NVDA w obu częściach. Hipoteza: korelacja 0,6–0,85; 50/50 CAGR między składnikami,
obsunięcie mniejsze od gorszego składnika o 2–5 pp, Sharpe ≥ lepszego składnika.

Wynik etapu 84 (2026-11-21): 2013–2026: CEM10 23,6 %/rok (DD −33 %, zmienność 27 %), F1 18,4 % (DD −34 %), F2 20,7 % (DD −34 %), SPY 14,6 %, QQQ 20,2 %;
korelacja miesięcznych zwrotów CEM10–F 0,61–0,63. 50/50 z wyrównaniem co rok: CEM10 + F1 21,7 % (DD −23 %, Sharpe 1,04), CEM10 + F2 22,9 % (DD −23 %, Sharpe 1,07);
bez wyrównywania 21,4 / 22,3 %, co miesiąc 21,6 / 22,8 % (DD −23 %). Połowy: 2013–2019 CEM10 10,8 %, F1 15,0 %, 50/50 13,1 % (SPY 14,0 %); 2020–2026 CEM10 37,2 %,
F1 21,4 %, 50/50 30,3 % (SPY 15,5 %). Najgorszy rok: CEM10 −16 % (2018), F1 −25 % (2022), 50/50 −14 % (2018) / −11 % (2022). Bez NVDA: CEM10 21,3 %, F1 17,0 %,
50/50 19,8 % (DD −22 %). Hipoteza: korelacja 0,6–0,85 — tak; CAGR między składnikami — tak; obsunięcie mniejsze o 2–5 pp — więcej: o ok. 10 pp (−23 % vs −33/−34 %);
Sharpe ≥ lepszego składnika — tak (≈ F2, wyżej niż CEM10). CEM10 i F wygrywają w różnych latach (2014, 2019, 2022, 2023 vs 2024, 2026).

## Etap 85: pół na pół z ograniczoną liczbą spółek — po 5 lub po 10 na strategię (zapisane 2026-11-21 PRZED uruchomieniem)

Użytkownik: „ile akcji wziąłeś? nie chcę 50, tylko po 5 max na strategię albo po 10, żeby mieć 20 akcji”. Jak etap 84, ale: CEM10 N = 5 lub 10; część fundamentalna
ma N miejsc po 1/N swojej części (kupno w wolne miejsca od najwyższej oceny, bez dokupowania, sprzedaż, gdy przychody lub zysk spadają 2 lata z rzędu, gotówka
w SPY): F1 = ocena top 10 % + PEG 0–2, F2 = 7/7 Jakość. Warianty: 5 + 5 i 10 + 10, 50/50 z wyrównaniem co rok. Miary jak w etapie 84 (CAGR, DD, zmienność, Sharpe,
połowy, rok po roku, bez NVDA). Hipoteza: 10 + 10 ≈ etap 84 (±2 pp); 5 + 5 — wyższa zmienność i obsunięcie o kilka pp, CAGR ±4 pp (większa zależność od kilku spółek).

Wynik etapu 85 (2026-11-21): 2013–2026 (SPY 14,6 %, QQQ 20,2 %): 10 + 10 — CEM10 + F1 24,2 %/rok (DD −24 %, Sharpe 1,10), CEM10 + F2 23,2 % (DD −24 %);
5 + 5 — CEM10 + F1 25,7 % (DD −30 %), CEM10 + F2 29,4 % (DD −30 %). Składniki: CEM10 N=5 28,0 % (DD −41 %), N=10 23,6 %; F1 N=5 19,8 %, N=10 22,9 %; F2 N=5 26,2 %
(DD −43 %), N=10 21,1 %. Połowy: 2013–2019 — 10 + 10 F1 13,5 %, F2 10,9 %; 5 + 5 10,3–10,7 % (SPY 14,0 %, CEM10 N=5 6,8 %); 2020–2026 — 10 + 10 27,2–30,2 %, 5 + 5
37–38 % (CEM10 N=5 54,9 %, w 2026 +229 %). Bez NVDA: 10 + 10 19,1–21,1 % (DD −21 %), 5 + 5 25,2–26,5 %. Hipoteza: 10 + 10 ≈ etap 84 ± 2 pp — tak (+1,5 / +0,3 pp);
5 + 5 większe obsunięcie — tak (−30 % vs −24 %), CAGR ± 4 pp — wyższy o 4–6 pp, ale cała przewaga z 2020–2026 (w 2013–2019 o 3–4 pp poniżej SPY).

## Etap 86: test wszystkich tez z 4 filmów autora (rentowność, przepływy, typy Lyncha, przewidywanie wzrostu zysku) (zapisane 2026-11-21 PRZED uruchomieniem)

Użytkownik: „przetestuj wszystko z tych filmów, nie pomijaj niczego”. Dane: top 500 USA PIT ze spółkami usuniętymi (etap 68), dane SEC znane w dniu startu;
starty: styczeń każdego roku 2012–2021 (5 lat naprzód) i 2012–2023 (3 lata); miara jak u autora: MEDIANA zwrotu ceny spółek w grupie w 5 (3) lat, liczba
obserwacji, odsetek bijących medianę wszystkich, połowy startów 2012–2016 / 2017–2021. Filmy 1–3: bez sektorów wykluczonych (jak u autora); film 4: wszystkie sektory.
Przepływy i bilans: ostatni znany rok obrotowy (autor: 12 mies.) — przybliżenie; skup / emisja / dywidendy — nowe pobranie z SEC (PaymentsForRepurchaseOfCommonStock,
ProceedsFromIssuanceOfCommonStock + ProceedsFromStockOptionsExercised, PaymentsOfDividends[CommonStock]).
F1 (rentowność, filtry narastająco): R1 ROE ≥ 15 %; R2 + ROA ≥ 10 %; R3 + ROE wyższe niż 3 lata temu; R4 + ROCE (zysk operacyjny ÷ (aktywa − zobowiązania bieżące))
≥ 30 %; wariant R4' ROCE ≥ 25 %; dla każdego kroku: mediana spółek, które przeszły, i tych, które przeszły poprzednie, ale odpadły na tym kroku; to samo bez sektora
technologicznego. Teza autora: 63 → 68 → 78 → 82 → 91 % (ROCE ≥ 25 %: 88 %), bez technologii 61 → 83 %.
F2 (przepływy, narastająco): P1 przepływy operacyjne ≥ 30 % długu (brak długu = spełnione); P2 + capex < 35 % przepływów operacyjnych; P3 + skup netto (skup − emisje)
> 2 % kapitalizacji; P4 + FCF > 12 % aktywów; bez technologii. Teza: 51 / 77 → 80 → 82 → 86 % (wszystkie 66 %). Rampy capex: capex ≥ 2 × capex sprzed 2 lat i ≥ 5 %
przychodów; podział: „bogate w gotówkę przed rampą” (przepływy operacyjne sprzed 2 lat ≥ 3 × ówczesny capex); wśród bogatych: zwrot z nowych aktywów (Δ przepływów
operacyjnych ÷ Δ aktywów, 2 lata) ≥ 0,20 vs < 0,10; odsetek spełniających P1–P4 po 3 latach. Teza: rampy 56 % vs reszta 67 %; bogate 82 % vs reszta 28 %; bogate
z wysokim zwrotem 149 % vs niskim 20 %; 3 × częściej spełniają P1–P4 później.
F3 (typy Lyncha, na starcie; spółka może mieć kilka): stabilnie rosnąca — CAGR przychodów 5 l. 8–18 % i kapitalizacja ≥ 20 mld; szybko rosnąca — CAGR przychodów lub
zysku 5 l. ≥ 20 %; wolno rosnąca — CAGR przychodów < 8 % i dywidenda; cykliczna — w którymś z 5 lat przychody −10 % lub gorzej; wychodząca z kłopotów — zysk 12 mies.
> 0, a rok wcześniej < 0. Miary: mediana 3 / 5 lat; stabilnie rosnące: odsetek z ≥ +50 % w 3 lata; PEG (historyczny, P/E ÷ CAGR zysku 5 l.) ≤ 1,5 vs > 1,5
(stabilne), < 1 / 1–1,6 / > 1,6 (szybkie); cykliczne: P/E w dolnej vs górnej tercyli (teza: niskie P/E u cyklicznych = pułapka); wolno rosnące: P/E ≤ 18 vs > 25;
wychodzące z kłopotów: mediana i odsetek spadków > 50 %.
F4 (przewidywanie wzrostu zysku; wszystkie sektory): pasma przeszłego wzrostu przychodów 5 l. (łącznie < 0, 0–25, 25–50, 50–100, > 100 %) → mediana przyszłego wzrostu
przychodów i zysku netto w 5 lat (starty 2012–2021, gdy jest 5 lat danych); stabilność dla spółek cyklicznych (korelacja rang przeszłego i przyszłego wzrostu: cykliczne
vs pozostałe); wielkość: 100 największych vs pozostałe — mediana przyszłego CAGR zysku 5 l. (teza: 5,7 vs 8,4 % dla 10 lat); stopa bazowa: rozkład CAGR zysku 5 l.
(teza: ~50 % w 0–20 %, ~25 % spadek, 13 % ≥ 30 %); jednorazowe zyski: zysk r/r > +100 % przy przychodach < +30 % — mediana zwrotu 1 / 3 lata vs reszta; skup a EPS:
różnica wzrostu EPS i zysku netto 5 l. (udział skupu) i czy wzrost EPS „ze skupu” (EPS − zysk ≥ 5 pp/rok) daje gorszy zwrot; migawka dziś: odsetek spółek z prognozą
EPS ≥ 15 % i wzrostem przychodów < 5 %/rok (teza: 1 na 7). Nietestowalne (brak danych historycznych): trafność prognoz analityków, wartość aktywów (asset play).
Hipoteza: kierunki z F1 i F2 potwierdzą się (rosnąca mediana z filtrami), ale słabiej niż u autora i nie we wszystkich połowach; ROCE ≥ 30 % i skup > 2 % — mała różnica;
rampy bogate z wysokim zwrotem — lepiej, ale mało obserwacji; typy: niski PEG pomaga stabilnym (etap 70), cykliczne z niskim P/E gorzej; F4: przeszły wzrost przychodów
monotonicznie przewiduje przyszły (etap 49), duże spółki rosną wolniej, jednorazowe zyski — gorszy zwrot.

Wynik etapu 86 (2026-11-21), mediana zwrotu ceny w 5 lat, starty w styczniu 2012–2021:
F1 rentowność (bez wykluczonych sektorów): wszystkie 69 %, R1 ROE ≥ 15 % 70 %, R2 + ROA ≥ 10 % 79 % (odpadłe 63 %), R3 + ROE rośnie 86 % (odpadłe 71 %), R4 + ROCE ≥ 30 % 103 %
(odpadłe 78 %), ROCE ≥ 25 % 99 % — jak u autora (63 → 91 %), ale tylko dla startów 2017+ (R4 113 % vs 59 %); w 2012–2016 filtry nie pomagały (R4 75 % vs 81 %).
Bez technologii: 64 → 62 → 66 → 73 → 86 %. F2 przepływy: P1 OCF ≥ 30 % długu 73 % vs odpadłe 54 % (obie połowy), P2 capex < 35 % OCF 76 % vs 63 %, P3 skup > 2 % 79 % vs 72 %
(bez technologii 72 vs 56 %), P4 FCF > 12 % aktywów 77 % vs odpadłe 79 % — bez efektu; wynik końcowy 77 % (autor 86 %). Rampy capex: 35 % vs 68 % bez rampy; bogate w gotówkę
77 % vs niebogate 0 %; bogate z wysokim zwrotem z nowych aktywów 108 % (n 11) vs niskim 63 % (n 15); spełniają P1–P4 po 3 latach 20 % vs 4–6 % — kierunki jak u autora.
F3 typy: stabilnie rosnące 83 % (najlepiej; 2012–2016 80 %, 2017+ 84 %), szybko rosnące 56 %, wolno rosnące 63 %, cykliczne 78 %, wychodzące z kłopotów 58 %; stabilne z ≥ +50 % w 3 lata
39 % (wszystkie 40 %). Stabilne PEG ≤ 1,5 93 % vs > 1,5 86 % (połowy przeciwne: 62 / 121 % i 117 / 84 %); szybkie PEG < 1 57 %, 1–1,6 43 %, > 1,6 56 % — bez wzoru; cykliczne
z niskim P/E 79 % = wysokie P/E 79 % (pułapka nie potwierdzona); wolno rosnące P/E ≤ 18 43 % vs > 25 65 % (odwrotnie niż teza); wychodzące z kłopotów: spadek > 50 % 11 % vs 5 %.
F4: przeszły wzrost przychodów 5 l. → przyszłe przychody 20 / 20 / 35 / 51 / 96 % i zysk 21 / 16 / 47 / 65 / 103 % (rośnie od pasma 25–50 %); korelacja przeszłego i przyszłego wzrostu:
cykliczne 0,11 vs pozostałe 0,50; 100 największych: przyszły CAGR zysku 6,7 % vs 8,0 %; stopa bazowa zysku 5 l.: spadek 32 %, 0–20 %/rok 51 %, 20–30 % 8 %, ≥ 30 % 9 %; skok zysku
przy słabych przychodach: 3 lata 28 % vs 38 %; EPS „ze skupu” 68 % vs 63 % (bez kary); dziś 20 % spółek z prognozą ≥ 15 % ma przychody < 5 %/rok (autor 14 %).
Hipoteza: F1 i F2 kierunkowo tak, słabiej i nie w obu połowach (F1 tylko 2017+); ROCE ≥ 30 % — więcej niż zakładano; skup > 2 % — mała różnica (tak); P4 — bez efektu; rampy — tak
(mało obserwacji); typy: niski PEG u stabilnych — niestabilny, cykliczne z niskim P/E — nie gorzej (teza nie potwierdzona); F4 — tak (monotonicznie od 25 %, duże wolniej,
jednorazowe zyski gorzej).

Uwaga do etapów 70–72, 80–83 i 86 (2026-11-21, po uwadze użytkownika): wszystkie testy z PEG używały PEG historycznego (P/E ÷ przeszły CAGR zysku 5 l.) albo własnej prognozy,
bo nie mamy historii prognoz analityków. Teza autora dotyczy PEG z prognozą analityków (P/E ÷ oczekiwany wzrost EPS 3–5 lat) — tych testów NIE należy traktować jako
potwierdzenia ani obalenia. Etap 86 „progi PEG w typach niestabilne” = niesprawdzone, nie „niepotwierdzone”. Dane autora (szerszy zbiór, prognozy, normalizacja zysków) są lepsze.

## Etap 87: test tez z kolejnych 4 filmów autora (przyspieszenie przychodów, ROIC, pułapki wartości, spadki po dobrych wynikach) (zapisane 2026-11-21 PRZED uruchomieniem)

Użytkownik wkleił transkrypcje 4 kolejnych filmów (wcześniej: „przetestuj wszystko z tych filmów, nie pomijaj niczego”). Dane jak w etapie 86 (top 500 USA PIT ze spółkami usuniętymi,
starty w styczniu, MEDIANA zwrotu ceny, połowy), wszystkie sektory (jak u autora: S&P 500) i wariant bez wykluczonych sektorów.
F5 przyspieszenie: 5 rocznych wzrostów przychodów (TTM rok do roku) z ostatnich 5 lat; „przyspiesza” = nachylenie prostej dopasowanej do nich > 0. Mediana zwrotu 1 i 5 lat:
przyspieszające vs wszystkie; przyspieszające + przychody 5 l. ≥ +50 % vs wszystkie; także średnia; w podziale na sektory (ile sektorów lepiej); starty 2016–2021 (jak autor)
i 2012–2021. Teza: 11 vs 9 % (1 r.), 64 vs 53 % (5 l.); z ≥ +50 %: 12,4 vs 8,9 % i 72,6 vs 53 %; 9 z 11 sektorów. Dodatkowo: pasma przeszłego wzrostu przychodów 5 l. →
wzrost przychodów w następnym roku (teza: liniowo).
F6 ROIC (≈ zysk operacyjny × 0,79 ÷ (kapitał + dług − gotówka)): kwintyle w każdym styczniu 2012–2021; mediana zwrotu 1 / 3 / 5 lat i 10 lat (starty 2012–2016); CAGR zysku netto
10 l. (bez kwintyla najniższego w interpretacji); odsetek z zyskiem w każdym roku przez 10 lat; zmienność zysku (odch. std. rocznego zysku ÷ średni zysk); odsetek z przychodami
rosnącymi w każdym roku przez 10 lat; mediana zmiany liczby akcji w 10 lat. Teza: najwyższe kwintyle najlepiej (+59 pp w 10 lat), wzrost EPS podobny, zysk co rok 74 vs 59 %,
stabilniejsze zyski, 1 na 6 z przychodami rosnącymi co rok, akcje −17 %.
F7 pułapki wartości: (a) cykliczne (spadek przychodów ≥ 10 % w którymś z 5 lat): przychody nadal rosną, ale wzrost zwolnił o ≥ 10 pp r/r vs pozostałe cykliczne — mediana zwrotu
1 rok (teza: kurs spada, zanim spadną przychody); (b) P/B < 1 (kapitał > kapitalizacja) vs reszta — 1 / 5 lat; (c) kurs ≥ 40 % poniżej maks. 12 mies.: P/E w górnej tercyli vs
dolnej (zamiast PEG z prognozą — niedostępnej) — 1 / 3 lata. Teza: (a) gorzej, (b) bez przewagi, (c) drogie po spadku gorzej.
F8 spadki po dobrych wynikach: zdarzenie = pierwsza publikacja raportu kwartalnego w SEC (data złożenia), „dobre wyniki” = przychody kwartału r/r ≥ +15 %; (a) kurs +20 % lub więcej
w 3 mies. przed publikacją vs bez wzrostu — nadwyżka nad SPY 1 i 3 mies. po (teza: dobre wyniki „wycenione wcześniej” → spadek po); (b) dobre wyniki przy rynku w strachu
(SPY ≥ 10 % poniżej maks. 12 mies.) vs spokojnym — nadwyżka 3 i 12 mies. (teza: w strachu kurs najpierw nie reaguje, potem odrabia). Nietestowalne: prognozy spółek (guidance),
wyniki vs oczekiwania analityków, korekty jednorazowe (poza przybliżeniem z etapu 86).
Hipoteza: F5 kierunkowo tak, ale słabiej (etap 58: przyspieszenie ~0 przy innej definicji); F6 wyższy ROIC lepiej (etap 79: ROIC lata niestabilne), stabilność zysków tak;
F7 (a) tak, (b) bez przewagi, (c) słabo; F8 (a) mały efekt na 1 mies., (b) dobre wyniki w strachu lepiej w 12 mies.

Wynik etapu 87 (2026-11-21). Uwaga metodyczna (dotyczy też etapu 86, F4): cechy z raportów liczone są tylko dla spółek bez wykluczonych sektorów, więc „wszystkie sektory”
w F4 etapu 86 to w praktyce ten sam zbiór bez finansów, surowców, energii, użyteczności i nieruchomości (wnioski bez zmian, poprawiona etykieta). Etap 87 — ten zbiór, mediana zwrotu.
F5: przychody przyspieszają (nachylenie 5 rocznych wzrostów > 0) — 1 rok 17,3 % vs nie przyspieszają 15,2 % (wszystkie 14,3 %), 5 lat 75 % vs 66 % (wszystkie 69 %), średnia 100 %;
przyspieszają + przychody 5 l. ≥ +50 % — 15,0 % i 71 % (średnia 115 %) — słabiej niż samo przyspieszenie (autor: 72,6 vs 53 %); sektory: lepiej w 2 z 3 z ≥ 10 obs. (Health Care gorzej).
Przeszły wzrost przychodów → przychody w następnym roku: 3,5 / 2,5 / 7,1 / 8,0 / 17,2 % (rośnie od 25 %). F6 ROIC: zwroty bez wzoru (5 lat 61–67 %, 10 lat K1 228 % vs K5 176 %; połowy:
2012–2016 K1 najlepszy, 2017+ K5 najlepszy); ale stabilność jak u autora: zysk co rok 10 lat K1 39 % vs K4–K5 67–74 %, zmienność zysku 0,86 vs 0,40–0,46, liczba akcji 10 lat
−5 % vs −20 %; przychody rosnące co rok bez wzoru (12–26 %). F7: cykliczne z hamującym wzrostem 18 % vs 11 % (1 rok, n 20) — teza nie potwierdzona; P/B < 1 1 rok 12 % = 12 %,
5 lat 86 % vs 68 % (n 37; 2017+ 4 %) — bez stałej przewagi; kurs −40 % od szczytu i nadal drogo (P/E górna tercyla): 1 rok −7 % vs tanie +8 %, 3 lata −40 % vs +19 % (n 10 / 14) —
kierunek jak u autora, bardzo mało obserwacji. F8: dobre wyniki po wzroście kursu +20 % — 1 mies. po −0,0 pp vs +0,2 pp (średnio +1,1) — „spadek po wycenionych wynikach” nie widać
w danych miesięcznych; dobre wyniki w strachu rynku +1,5 pp w 1 i 3 mies. vs ~0, w 12 mies. jak w spokoju (−4,4 vs −4,2 pp). Hipoteza: F5 tak, słabiej (z warunkiem ≥ 50 % — nie
wzmacnia); F6 zwroty nie, stabilność tak; F7 (a) nie, (b) tak (bez przewagi), (c) kierunek tak; F8 (a) brak efektu, (b) mały efekt krótkoterminowy.

## Etap 88: bootstrap dla spornych tez autora (zapisane 2026-11-21 PRZED uruchomieniem)

Użytkownik: „zrób ten bootstrap dla spornych”. Dane i grupy jak w etapach 86–87 (zbiór bez wykluczonych sektorów, starty w styczniu, mediana zwrotu ceny 5 lat; ROIC także 10 lat).
Statystyka: różnica median (grupa A − grupa B) z puli obserwacji. Bootstrap blokowy po latach startowych: losowanie lat ze zwracaniem (B = 2000), w wylosowanym roku wszystkie
spółki; 95 % przedział (percentyle 2,5–97,5). Porównania sporne: (1) ROIC K5 vs K1 — 5 i 10 lat (autor: +59 pp w 10 lat); (2) FCF > 12 % aktywów: przeszły P1–P4 vs przeszły P1–P3,
odpadły na P4 (autor: +4 pp na tym kroku, 86 vs 82); (3) cykliczne: P/E dolna vs górna tercyla (autor: niskie P/E = pułapka, czyli różnica < 0); (4) wolno rosnące: P/E ≤ 18 vs > 25
(autor: kupuj w okolicach kilkunastu → > 0); (5) ROCE ≥ 30 %: przeszły R1–R4 vs przeszły R1–R3, odpadły na R4 (autor: 91 vs 77 → +14 pp). Kontrolnie (potwierdzone): (6) R2 vs
odpadłe na R2 (autor +16 pp), (7) P1 vs odpadłe na P1 (autor +26 pp), (8) przyspieszające przychody vs nieprzyspieszające (autor: 64 vs 53 vs wszystkie). Werdykt dla każdej tezy:
„zgodne z autorem” (przedział zawiera wartość autora i nie zawiera 0 albo ma jego znak), „nasze dane nie rozstrzygają” (przedział zawiera 0 i wartość autora), „sprzeczne” (przedział
nie zawiera wartości autora i ma znak przeciwny lub 0 poza nim). Hipoteza: większość spornych (1–4) — „nie rozstrzygają” (szerokie przedziały przy 10 startach).

Wynik etapu 88 (2026-11-21), różnica median 5 lat [95 % przedział z bootstrapu po latach]: ROIC K5 − K1 +2 pp [−22; +31] — nie rozstrzyga; 10 lat −52 pp [−96; −2] — sprzeczne
z autorem (+59), ale tylko 5 nakładających się startów 2012–2016; FCF > 12 % aktywów −2 [−20; +13] — nie rozstrzyga (autor +4); cykliczne niskie − wysokie P/E −0 [−51; +39] —
nie rozstrzyga; wolno rosnące P/E ≤ 18 − > 25: −22 [−46; −6] — sprzeczne z autorem; ROCE ≥ 30 %: +25 [−9; +50] — nie rozstrzyga (autor +14 w przedziale); kontrolne: ROA ≥ 10 %
+16 [+10; +25] i OCF ≥ 30 % długu +19 [+4; +34] — zgodne z autorem; przyspieszające przychody +9 [−9; +22] — nie rozstrzyga. Hipoteza (sporne głównie „nie rozstrzygają”) — tak
dla 4 z 6; sprzeczne 2 (ROIC 10 lat — słaba podstawa, wolno rosnące z niskim P/E). Wniosek: przy 10 latach startowych większość różnic rzędu ±10–20 pp mieści się w szumie;
nawet przyspieszenie przychodów (dodane do oceny w etapie 87 na prośbę użytkownika) nie jest statystycznie pewne.

## Etap 89: jak budować pozycję — wpłaty co miesiąc, dokupowanie wg wyceny a stałe kwoty (zapisane 2026-11-22 PRZED uruchomieniem)

Użytkownik: „metoda budowania pozycji w portfelu, sugestie dokupu po PEG, jak robić average costing, żeby nie próbować wyczuć rynku”. Badamy SAM sposób kupowania, przy tym
samym wyborze spółek. Dane i zbiór jak w etapach 80–85 (top 500 USA PIT, bez wykluczonych sektorów, spółki ≥ 5 lat na giełdzie, ceny miesięczne, koszt 0,1 %).
Lista do dokupowania w miesiącu = spółki spełniające Jakość 7/7 (bez kryterium wyceny; J7 z etapu 83, braki = niespełnione). Spółek nie sprzedajemy (raz kupione zostają);
spółka, która wypadła z listy, nie dostaje nowych wpłat. Limit pozycji: wpłata nie trafia do spółki, która ma > 15 % portfela (jeśli wszystkie powyżej — równo).
Inwestor wpłaca 1 jednostkę co miesiąc. Sposoby podziału wpłaty (wszystkie wydają całą wpłatę w miesiącu, chyba że zaznaczono):
- M0 równe kwoty (klasyczne uśrednianie): wpłata po równo na spółki z listy;
- M1 przechył wg PEG (historyczny PEG = P/E ÷ przeszły wzrost EPS, prognoz analityków w danych nie mamy): waga × 2 przy PEG 0–1, × 1 przy 1–2, × 0,5 przy 2–3, × 0 przy > 3 lub braku;
  gdy wszystkie wagi 0 — równo;
- M2 przechył wg spadku: waga × 2, gdy kurs ≥ 15 % poniżej maksimum z 12 mies., inaczej × 1;
- M3 przechył wg P/E względem własnej mediany z 5 lat: × 2 gdy P/E < 0,8 × mediana, × 0,5 gdy > 1,2 ×, inaczej × 1;
- M4 czekanie na okazję (próba wyczucia rynku): kupujemy tylko spółki z listy z PEG 0–1; jeśli żadnej nie ma — gotówka (0 %) czeka i trafia do pierwszej okazji;
- M5 czekanie w SPY: jak M4, ale czekająca gotówka w SPY.
Okresy: cały 2013-01..2026-09 oraz okna 5-letnie startujące w styczniu 2013..2021 (od zera, osobno). Miary: wartość końcowa ÷ suma wpłat, roczna stopa zwrotu ważona
kapitałem (IRR), maxDD wartości portfela, średni koszt zakupu względem średniej ceny (w %, dla M0–M3), bez NVDA (kontrola koncentracji). Drugie pytanie (jednorazowa kwota):
na starcie każdego stycznia 2013..2021 kwota 12 jednostek w spółki z listy (równo) — od razu (L) vs 12 równych miesięcznych transz (D12, czekająca gotówka 0 %); wynik po 5 latach.
Statystyka: różnica (Mk − M0) w IRR okien 5-letnich, bootstrap po latach startowych (B = 2000), 95 % przedział.
Hipotezy: (1) przechyły M1–M3 zmieniają IRR o < 1 pp rocznie względem M0 (przedział zawiera 0); (2) czekanie M4 jest gorsze od M0 (gotówka czeka, a dobre spółki rosną),
M5 bliżej M0; (3) jednorazowo od razu (L) daje więcej niż D12 w ≥ 2/3 startów, D12 ma mniejsze najgorsze wyniki. Reguła dla strony: przechył wg wyceny dodajemy jako sugestię
tylko, jeśli dolna granica przedziału > 0 albo różnica ≥ 0 przy mniejszym maxDD; inaczej strona zaleca stałe kwoty, a PEG służy tylko do wyboru spółek i ostrzeżenia „drogo”.

Wynik etapu 89 (2026-11-22). Lista Jakość 7/7 jest mała na początku (0 spółek w 2013–2014, 1–10 w 2015–2019, 15–24 od 2020), więc okna 2013–2015 są słabo
obsadzone. Cały okres 2013–2026 (IRR wpłat): M0 równe kwoty 20,1 %, M1 PEG 21,9 %, M2 spadek 20,3 %, M3 P/E vs mediana 17,4 %, M4 czekanie 22,5 % (maxDD −44 % vs −33 %),
M5 22,9 % (−45 %); bez NVDA M0 12,5 %, M1 13,8 %, M2 13,0 %. Okna 5 lat (9 startów), różnica IRR vs M0: M1 +0,51 pp [−0,84; +1,92] (5/9), M2 +0,80 [+0,37; +1,30] (9/9),
M3 +0,09 [−0,34; +0,58], M4 +0,02 [−3,19; +3,31] (najgorsze okno −1,4 % vs +4,7 %), M5 +0,54 [−2,62; +3,52]. Kontrolnie (poza protokołem, top 10 % oceny ogólnej, ok. 40 spółek):
M1 +0,11 [−0,28; +0,47], M2 +0,25 [−0,04; +0,58] (5/9), M3 −0,52 [−0,86; −0,26], M4 −2,08 [−5,15; +0,05] (2/9), M5 −1,87. Jednorazowa kwota: od razu lepiej niż 12 transz w 5/7 startów
(najgorszy wynik po 5 latach 1,63× vs 1,52×). Hipotezy: (1) przechyły < 1 pp — tak; M2 jako jedyny ma przedział > 0 na liście z protokołu (na szerszej liście na granicy);
(2) czekanie na okazję — nie lepsze, większe obsunięcia, na szerszej liście −2 pp rocznie — tak; (3) od razu częściej lepiej — tak (5/7, nie 2/3 z 9, bo 2 starty bez listy).
Wniosek dla strony (wg reguły zapisanej przed testem): stałe kwoty co miesiąc w spółki z listy; dodatkowo × 2 dla spółki ≥ 15 % poniżej maksimum z 12 mies. (M2, mały efekt
+0,3–0,8 pp/rok); bez czekania na okazję; PEG tylko do wyboru spółek i ostrzeżenia „drogo” (przechył wg PEG nie przeszedł); limit 15 % na spółkę; wolne środki jednorazowo — od razu.

Dopisek do etapu 89 (2026-11-22, PO teście — reguły użytkownika, nie były zapisane przed uruchomieniem, więc to wynik eksploracyjny): użytkownik: „dokupować, kiedy PEG
między 0–2, im niższy, tym większa waga, ale nie więcej niż 10 % portfela”, potem „włóż w to score i market cap”. M6: waga 2 − PEG przy PEG 0–2, limit 10 %, brak okazji → gotówka
czeka w SPY: 24,1 % (M0 20,1 %), maxDD −39 % (−33 %), bez NVDA 17,5 % (12,5 %); okna 5 lat +1,56 pp [+0,37; +2,73] 6/9; szersza lista +0,55 [−0,32; +1,51]. M7 (strona):
waga (2 − PEG) × ocena ogólna ÷ 6 (0,5–1,5) × (1 + 0,25 log10(kapit. ÷ 100 mld)) (0,5–1,5): 24,4 %, maxDD −40 %, bez NVDA 17,8 %; okna +1,92 pp [+0,61; +3,09] 7/9;
szersza lista +0,62 [−0,13; +1,41] 6/9. Wniosek: na liście Jakość 7/7 reguła użytkownika wypada lepiej niż równe kwoty, ale za cenę większych obsunięć, a na szerszej
liście przewaga jest w granicach szumu; parametry (próg 2, wzór wag) wybrane po obejrzeniu wyników etapu 89 — ryzyko dopasowania.

## Etap 90: kanał odchylenia standardowego (10 lat) — kupno przy −3σ / −4σ, sprzedaż na linii regresji (zapisane 2026-11-22 PRZED uruchomieniem)

Użytkownik: „sprawdź, czy to w ogóle ma sens na danych” (film: spółki > 50 mld USD, kanał regresji liniowej z 2500 dni sesyjnych na wykresie dziennym,
kupno, gdy kurs spadnie poniżej −3σ (spółki z top 10 wg kapitalizacji) albo −4σ (pozostałe); warunki: ≥ 10 lat historii, kanał rosnący, linia −3σ/−4σ > 0;
realizacja zysku przy dotknięciu linii regresji; 5–10 % portfela na spółkę, gotówka, gdy nic nie ma; autor: „od 2016 bije S&P 500 i Nasdaq”, 10 tys. → 99,9 tys. USD).
Dane: dzienne ceny skorygowane (eodhd, `prices_valid`), kapitalizacja miesięczna (cap.pkl, USD, z poprzedniego miesiąca — bez zaglądania w przyszłość),
wszystkie spółki z USA w danych ze spółkami usuniętymi z giełdy (bez listy dzisiejszych zwycięzców). Kanał liczony każdego dnia na ostatnich 2500 dniach:
regresja liniowa kursu względem czasu, σ = odchylenie standardowe reszt, linia = wartość regresji w bieżącym dniu (tak jak rysuje TradingView; dokładny wzór
wskaźnika autora nie jest znany — założenie). Sygnał: pierwsze zamknięcie poniżej linii −kσ (k = 3 dla top 10, k = 4 dla reszty spółek ≥ 50 mld USD), nachylenie > 0,
linia −kσ > 0; kolejny sygnał tej samej spółki dopiero po powrocie kursu do linii regresji. Okres sygnałów 2012-01..2025-10.
Pytania i miary: (A) zdarzenia — zwrot do wyjścia na linii regresji (najdłużej 36 mies.; inaczej sprzedaż po 36 mies. lub na końcu danych), odsetek wyjść z zyskiem
(„trafność”), czas do wyjścia, najgłębszy spadek od zakupu; zwrot 12 i 24 mies. od sygnału i nadwyżka nad SPY; (B) porównanie z kupnem przy spadku ≥ 30 % od
szczytu (ta sama grupa spółek, ta sama reguła wyjścia) i z losowym dniem w tej grupie (zwrot 12/24 mies.); (C) portfel 2013-01..2026-10: 10 % konta na pozycję
(najwyżej 10 pozycji), gotówka 0 %, wyjście na linii regresji — roczna stopa, maxDD, roczne zwroty, porównanie z SPY i QQQ (z dywidendami w cenach skorygowanych);
wariant „po dotknięciu linii regresji zatrzymaj połowę” pominięty (prosta reguła). Analiza fundamentalna z AI z filmu — nietestowalna (pominięta; zaznaczamy).
Hipotezy: (1) trafność wyjść ≥ 70 %, ale średni zwrot 12/24 mies. bliski SPY (nadwyżka w granicach ±3 pp); (2) sygnałów jest mało (kilka–kilkanaście rocznie), więc
portfel większość czasu w gotówce i przegrywa z SPY w stopie rocznej, ma za to mniejsze obsunięcie; (3) kupno przy −30 % od szczytu nie gorsze niż −3σ/−4σ.

Wynik etapu 90 (2026-11-22). 359 spółek kiedykolwiek ≥ 50 mld USD, 314 z ≥ 10 lat cen. Sygnałów 63 w 14 lat (54 spółki; 33 w marcu 2020, 11 w 2022, 7 w 2025;
w latach 2013–2014, 2016–2017 żadnego), top 10 (−3σ) tylko 5. Wyjście na linii regresji w 79 %, z zyskiem 89 %, średnio +33,5 % (mediana +35 %, mediana 205 dni),
najgłębszy spadek po zakupie mediana −12 %, najgorszy wynik −60 %. Zwrot 12 mies. od sygnału +44 %, ale SPY w tym samym czasie prawie tyle samo: nadwyżka +0,7 pp,
lepiej niż SPY w 46 % sygnałów; 24 mies. −1,8 pp (top 10: +7,6 pp i +25 pp, ale 5 zdarzeń). Losowy miesiąc w tej grupie: 12 mies. nad SPY −1,0 pp, lepiej w 43 %.
Spadek ≥ 30 % od szczytu: 12 mies. +19,5 %, nad SPY +4,9 pp, lepiej w 46 % (wyjście na linii regresji nie ma tu sensu — kurs często jest już nad linią, porównujemy
tylko 12/24 mies.). Portfel (10 % na pozycję, gotówka 0 %): 2013–2026 5,4 % rocznie (SPY 14,5 %, QQQ 19,3 %), maxDD −28 % (SPY −34 %), średnio zainwestowane 34 %
konta, 26 % dni bez żadnej pozycji; 2016–2026 6,7 % (SPY 14,8 %); 10 tys. USD od 2016 → 20 tys. (autor: 99,9 tys.; SPY 44,7 tys.). Hipotezy: (1) trafność ≥ 70 % przy
nadwyżce ±3 pp — tak (89 %, +0,7 pp); (2) mało sygnałów, portfel w gotówce przegrywa z SPY, mniejsze obsunięcie — tak; (3) −30 % od szczytu nie gorsze — tak.
Wrażliwość (poza protokołem, r115b): niższe progi (−2σ/−3σ) i kanał na log-cenie — 81–159 sygnałów, trafność 85–89 %, nadwyżka 12 mies. −2,1 … +1,1 pp, portfel
5,9–8,2 % (gotówka 0 %) albo 13,2–14,2 % (gotówka w SPY; SPY 14,5 %). Wniosek: sygnał „często ma rację” (sprzedaż z zyskiem w ~9 na 10 przypadków), ale nie dlatego,
że trafia w spółki lepsze od rynku — kupuje w ogólnych krachach (marzec 2020, 2022), po których rośnie cały rynek; wynik autora nie odtwarza się na regułach z filmu
(różnice: jego decyzje uznaniowe, częściowe trzymanie po linii regresji, analiza z AI, nieznany wzór wskaźnika).

## Etap 91: kanał odchylenia standardowego na wykresie miesięcznym — siatka wariantów (zapisane 2026-11-22 PRZED uruchomieniem)

Użytkownik: „potestuj te odchylenia na miesięcznym wykresie, może coś można zmienić”. Dane i grupa jak w etapie 90 (spółki ≥ 50 mld USD, ceny skorygowane, ze spółkami
usuniętymi). Zamknięcia miesięczne (ostatnia sesja miesiąca); kanał z ostatnich L miesięcy, sygnał i wyjście sprawdzane tylko na zamknięciu miesiąca; wejście po cenie
zamknięcia miesiąca sygnału; wyjście: pierwsze zamknięcie miesiąca ≥ linia regresji, najdłużej 36 mies. Siatka (12 wariantów): L ∈ {60, 120} mies. × skala ∈ {cena,
log-cena} × progi (top 10 / reszta) ∈ {−2σ/−2σ, −2σ/−3σ, −3σ/−4σ}. Warunki jak w filmie: kanał rosnący, (dla skali cena) dolna linia > 0. Portfel: 10 % konta na pozycję,
najwyżej 10, gotówka 0 % albo w SPY; 2013-01..2026-10 oraz połowy 2013–2019 i 2020–2026 (każda od zera). Miary: liczba sygnałów, odsetek z zyskiem, nadwyżka 12 mies.
nad SPY (średnia i odsetek > 0), stopa roczna portfela i maxDD, średnie zaangażowanie. Reguła oceny (wiele wariantów = ryzyko dopasowania): wariant uznajemy za lepszy
od SPY tylko, jeśli z gotówką 0 % bije SPY w obu połowach; jeśli żaden — wniosek „zmiana parametrów nie pomaga”; nadwyżkę 12 mies. uznajemy, gdy jest > 0 w obu połowach.
Hipotezy: (1) żaden wariant z gotówką 0 % nie bije SPY w obu połowach; (2) z gotówką w SPY warianty w granicach SPY ±2 pp rocznie; (3) trafność (z zyskiem) 80–90 %
we wszystkich wariantach.

Wynik etapu 91 (2026-11-22). SPY 2013–2026 14,3 % rocznie (2013–2019 13,8 %, 2020–2026 14,9 %), QQQ 19,4 %. Z gotówką 0 % żaden z 12 wariantów nie bije SPY
w obu połowach (najlepszy: 120 mies., log-cena, −2σ/−2σ — 12,2 % rocznie, maxDD −18 % vs SPY −34 %; 2013–2019 9,2 % < 13,8 %, 2020–2026 21,1 % > 14,9 %; 208 sygnałów,
zaangażowanie 74 %). Z gotówką w SPY: 11,0–16,1 % (6 wariantów ponad SPY, najwięcej 120 mies. log −3σ/−4σ 16,1 % i log −2σ 15,0–15,1 %). Trafność 73–85 %. Nadwyżka 12 mies.
nad SPY > 0 w obu połowach tylko w 3 wariantach: 120 mies. cena −2σ/−3σ (+3,3 / +2,7 pp; 82 sygnały), 120 mies. log −2σ/−2σ (+0,8 / +2,4 pp; 208), 120 mies. log −3σ/−4σ
(+31 / +0,7 pp; 33 — pierwsza połowa z kilku zdarzeń); kanał 60 mies. — gorzej (prawie wszystkie ujemne). Hipotezy: (1) żaden wariant nie bije SPY w obu połowach
z gotówką 0 % — tak; (2) z gotówką w SPY w granicach ±2 pp — częściowo (kanał 60 mies. 11–12 %, czyli −2 … −3 pp); (3) trafność 80–90 % — prawie (73–85 %).
Wniosek: 10-letni kanał (120 mies.) działa lepiej niż 5-letni; na log-cenie z progiem −2σ sygnałów jest dużo (ok. 15 rocznie), portfel jest w ok. 3/4 zainwestowany
i ma o połowę mniejsze obsunięcie niż SPY (−18 % vs −34 %), ale w 2013–2019 przegrał z SPY o 4,6 pp rocznie; przewaga tylko w latach 2020–2026. 12 wariantów =
duże ryzyko dopasowania; żadna zmiana parametrów nie spełnia reguły zapisanej przed testem.

## Etap 92: test sygnałów Lyncha z karty spółki (zapisane 2026-11-22 PRZED uruchomieniem)

Użytkownik: „to są reguły Lyncha, czemu dodałeś to bez backtestu?” — słusznie: lista kontrolna Lyncha (karta spółki, sekcja „Peter Lynch”) trafiła na stronę
bez testu. Sprawdzamy każdy sygnał ostrzegawczy (⚠), który da się odtworzyć historycznie. Dane i zbiór jak w etapach 86–88: top 500 USA PIT bez wykluczonych sektorów,
starty w styczniu 2012–2023 (12 mies.) i 2012–2023 do 2023-09 (36 mies.), cechy z raportów dostępnych na dany dzień. Typ (przybliżenie strony bez prognozy EPS, której
historycznie nie mamy): cykliczna — najgorszy rok przychodów w 5 lat ≤ −10 %; szybko rosnąca — przychody 5 lat ≥ 20 % rocznie; stabilnie rosnąca — 8–20 %; wolno — < 8 %
(trzy ostatnie tylko spoza cyklicznych). Sygnały (jak na stronie): szybko rosnąca — dojrzewanie (przychody 1 rok < 0,6 × średnia 5 lat), hamowanie sprzedaży
kwartalnej 2 kwartały z rzędu (zmiana wzrostu r/r < 0 teraz i 3 mies. wcześniej), PEG ≥ 2 (historyczny), zapasy r/r > sprzedaż r/r + 10 pp; stabilnie rosnąca —
P/E > 1,3 × mediana własnego P/E z 60 mies., przychody 1 rok < średnia 5 lat − 5 pp, fundamenty słabną 2 lata (⬇); wolno rosnąca — ⬇; cykliczna — zapasy (jw.),
rampa capex, sprzedaż kwartalna r/r < 0, „pułapka” (zysk +50 % r/r i P/E poniżej własnej mediany). Nietestowane (brak historii): dług rosnący 5 kwartałów, cięcie
i pokrycie dywidendy, zmiany w zarządzie, ukryte aktywa, wychodzące z kłopotów, wskaźnik Lyncha z prognozą. Miara: zwrot ceny 12 i 36 mies. minus mediana zbioru
w tym samym starcie; różnica median (⚠ − ✓) w danym typie, bootstrap blokowy po latach startowych (B = 2000), 95 % przedział. Reguła dla strony: sygnał zostaje jako
ostrzeżenie, jeśli różnica dla 36 mies. jest ujemna, a górna granica przedziału < 0 (albo tak samo dla 12 mies. przy 36 mies. ≤ 0); w przeciwnym razie na stronie
oznaczamy go „niepotwierdzony w teście” (szary, nie ⚠). Hipoteza: większość sygnałów nie rozstrzyga (szerokie przedziały), potwierdzą się ⬇ (etap 77) i ewentualnie
P/E wysoko ponad własną normą u stabilnych.

Wynik etapu 92 (2026-11-22). Różnica median nadwyżki (⚠ − ✓), 36 mies. [95 % przedział]: szybko rosnące — dojrzewanie +4,5 [−19,8; +33,0], hamowanie sprzedaży
kwartalnej −8,9 [−31,2; +10,1], PEG ≥ 2 +8,1 [−26,0; +64,2], zapasy +22,5 [−33,4; +68,1]; stabilnie rosnące — P/E > 1,3 × własna mediana +6,9 [−24,6; +22,9],
wzrost hamuje +2,1 [−15,6; +20,8], ⬇ −0,9 [−34,3; +31,7]; wolno rosnące ⬇ −10,9 [−21,3; −1,9] (12 mies. +0,3) — jedyny potwierdzony; cykliczne — zapasy +11,1
[−12,3; +28,3], rampa capex (4 przypadki), sprzedaż kwartalna < 0 −11,4 [−31,9; +5,6], „pułapka” +0,8 [−12,9; +21,4]. Łącznie (co najmniej jeden sygnał vs żaden):
szybko +3,3, stabilne +0,1, cykliczne −3,6 pp (wszystkie przedziały obejmują 0). Hipoteza (większość nie rozstrzyga, potwierdzi się ⬇) — tak, ale ⬇ tylko u wolno
rosnących; P/E ponad własną normą u stabilnych — nie. Strona: ⚠ tylko dla potwierdzonego sygnału, pozostałe szare ○ „niepotwierdzony w teście”, sygnały bez historii
— „nietestowany”.

## Etap 93: pozostałe reguły Lyncha z „One Up on Wall Street” (zapisane 2026-11-22 PRZED uruchomieniem)

Użytkownik: „nie masz wszystkich reguł Petera Lyncha z jego książki”. Spis reguł (rozdz. 7–10, 13, 15, 17) i to, co da się odtworzyć historycznie (dane, zbiór, starty,
miara i bootstrap jak w etapie 92; porównanie grupa A vs grupa B, różnica median nadwyżki nad medianą zbioru, 12 i 36 mies.):
L1 gotówka netto ≥ 10 % kapitalizacji vs dług netto (gotówka netto < 0) — „poduszka gotówkowa”, rozdz. 13; L2 dług / kapitał ≤ 0,33 vs > 1 — „normalnie 75 % kapitału,
25 % długu”; L3 wskaźnik Lyncha z dywidendą (wzrost zysku 5 lat rocznie % + stopa dywidendy %) ÷ P/E ≥ 2 vs < 1 — historyczny wzrost zamiast prognozy; L4 szybko
rosnące: wzrost zysku 20–25 % rocznie (5 lat) vs > 50 % („za gorące”); L5 „najgorętsza spółka”: zwrot 12 mies. i P/E w górnych 10 % zbioru vs reszta; L6 P/E poniżej
własnej mediany z 5 lat vs > 1,3 × (wszystkie typy; rozdz. 10); L7 stabilnie rosnące: marża netto w górnej vs dolnej tercyli; L8 wolno rosnące płacące dywidendę:
dywidenda (suma wypłat) wyższa niż rok wcześniej w każdym z 5 lat vs nie; L9 skup akcji (liczba akcji 3 lata ≤ −2 %) vs rozwadnianie (> +5 %) — „idealna spółka” cecha 13;
L10 P/FCF ≤ 15 vs > 30 (rozdz. 13: przepływy). Nietestowalne (brak danych historycznych lub reguła jakościowa): udział produktu w sprzedaży, nudna nazwa / branża,
wydzielenie, nisza, odbiorcy > 25 % sprzedaży, plotki, zakupy insiderów, udział instytucji i liczba analityków, zobowiązania emerytalne, ukryte aktywa (nieruchomości,
patenty, straty podatkowe), struktura długu (bankowy vs obligacje), przejęcia („diworsyfikacja”), okładki gazet, „następny IBM”.
Reguła dla strony jak w etapie 92: potwierdzony, jeśli różnica 36 mies. ma kierunek Lyncha i przedział go wyklucza 0 (albo 12 mies. przy tym samym znaku 36 mies.).
Hipoteza: potwierdzą się co najwyżej 2–3 reguły (najpewniej L9 skup akcji i L2 niski dług), reszta nie rozstrzyga.

Wynik etapu 93 (2026-11-22). A − B, 36 mies. [95 % przedział]: L1 gotówka netto +5,8 [−4,5; +15,6]; L2 mały dług −0,5 [−6,0; +7,2]; L3 wskaźnik z dywidendą −12,7
[−20,4; +3,8] (raczej wbrew Lynchowi); L4 za mało spółek (7 vs 30); L5 „najgorętsze” −8,1 [−58; +31] (najgorętsze nie gorsze); L6 P/E poniżej własnej normy −6,7
[−18,1; +6,1]; L7 stabilnie rosnące z wysoką marżą netto +28,0 [+7,1; +53,3] — potwierdzona; L8 wolno rosnące z dywidendą rosnącą 5 lat +10,8 [+2,1; +20,9]
(12 mies. +3,6) — potwierdzona; L9 skup akcji vs rozwadnianie −12,1 [−17,7; −8,8] — SPRZECZNA z Lynchem (rozwadniające spółki, głównie technologiczne z wynagrodzeniami
w akcjach, wypadały lepiej w 2012–2026; uwaga: w ocenie „Siła” liczba akcji 3 lata liczy się „mniej = lepiej” na podstawie etapu 76 — inna miara, IC całego zbioru);
L10 P/FCF ≤ 15 −3,5 [−14,9; +6,9]. Hipoteza (2–3 potwierdzone, w tym skup i mały dług) — liczba tak (2), ale potwierdziły się marża u stabilnych i rosnąca dywidenda
u wolno rosnących, a skup wyszedł odwrotnie. Strona: dwie nowe pozycje listy kontrolnej (potwierdzone), reszta opisana w metodzie jako niepotwierdzona / nietestowana.

## Etap 94: „nie trzymaj stabilnie rosnącej po podwojeniu” i podział portfela wg typów (zapisane 2026-11-22 PRZED uruchomieniem)

Użytkownik przysłał streszczenie Lyncha: kategoryzuj najpierw wg wielkości, potem „historii”; nie trzymaj stabilnie rosnącej po 2× licząc na 10×; podział portfela
inwestora indywidualnego (10 spółek): stabilnie rosnące 20 %, szybko rosnące 40 %, wychodzące z kłopotów 40 %, wolno rosnące i ukryte aktywa 0. Test (dane, zbiór,
starty, miara i bootstrap jak w etapach 92–93): stabilnie rosnące (typ jak w etapie 92), których kurs wzrósł ≥ 100 % w 3 lata, vs stabilnie rosnące z wzrostem < 100 %
(oraz vs < 50 %); kierunek Lyncha: po podwojeniu gorzej (różnica < 0). Podział portfela: wyniki typów są już w etapie 86 (mediana 5 lat: stabilnie +83 %, cykliczne +78 %,
wolno rosnące +63 %, wychodzące z kłopotów +58 %, szybko rosnące +56 %, wszystkie +69 %) — nie liczymy ponownie; na stronie Portfel pokażemy tylko informacyjnie skład
portfela użytkownika wg typów obok podziału Lyncha i wyników etapu 86 (bez zmian w regułach dokupu). Hipoteza: po podwojeniu nie gorzej (różnica w granicach szumu).

Wynik etapu 94 (2026-11-22). Stabilnie rosnące po wzroście kursu ≥ 100 % w 3 lata vs < 100 %: 12 mies. +1,4 pp [−5,9; +10,9], 36 mies. +8,7 [−15,5; +29,9]
(vs < 50 %: +1,8 / +9,9). Hipoteza (nie gorzej) — tak; reguła Lyncha „sprzedaj stabilnie rosnącą po 2×” niepotwierdzona (raczej odwrotnie). Strona Portfel:
informacyjna tabela składu wg typów (udział użytkownika, podział Lyncha 20/40/40, mediana 5 lat z etapu 86), bez zmian w regułach dokupu.

## Etap 95: „Prosty wybór” — licznik potwierdzonych cech dobrej spółki (zapisane 2026-11-23 PRZED uruchomieniem)

Użytkownik: „prosty algorytm oceniający, co zwiększa prawdopodobieństwo dobrej spółki, bo mamy ich za dużo do decyzji”. Licznik 0–6 punktów z cech, które
wcześniejsze etapy potwierdziły (bez nowych progów): P1 Jakość 7/7 (etap 83), P2 ocena Siła finansowa ≥ 7 (etap 76: najsilniejsza grupa), P3 przychody > 10 %
w ≥ 3 z 5 lat (etap 58), P4 ROA ≥ 10 % (etap 88), P5 przepływy operacyjne ≥ 30 % długu (etap 88), P6 brak ⬇ — przychody i zysk nie spadają 2 lata z rzędu (etap 77).
Wycena (PEG) celowo poza licznikiem — o cenie decyduje reguła dokupu użytkownika. Dane i zbiór jak w etapach 92–94 (top 500 USA PIT bez wykluczonych sektorów,
starty w styczniu 2012–2023), brak danych = punkt niezaliczony. Miary dla grup 0–2 / 3–4 / 5–6 punktów: mediana nadwyżki zwrotu 12 i 36 mies. nad medianą zbioru,
odsetek spółek lepszych od mediany („prawdopodobieństwo”), odsetek ze stratą po 36 mies.; różnica 5–6 vs 0–2 z bootstrapem po latach (B = 2000), połowy 2012–2017
i 2018–2023. Uwaga: wszystkie cechy wybrano na tych samych danych — wynik będzie optymistyczny (ryzyko dopasowania). Reguła dla strony: pokazujemy licznik,
jeśli 5–6 pkt ma wyższą medianę 36 mies. niż 0–2 pkt z przedziałem > 0 i odsetek lepszych od mediany > 50 % w obu połowach.
Hipoteza: 5–6 pkt — ok. 60 % spółek lepszych od mediany w 3 lata (vs ok. 45 % dla 0–2), różnica kilka–kilkanaście pp.

Wynik etapu 95 (2026-11-23). 36 mies.: 5–6 pkt — 81 obserwacji, mediana nadwyżki +17,3 pp, lepsze od mediany 63 %, ze stratą 17 % (wszystkie: 50 % / 23 %); 3–4 pkt
+1,6 pp / 51 %; 0–2 pkt −0,5 pp / 49 %. Połowy: 2012–2017 5–6 pkt tylko 14 obserwacji, −21,3 pp, 29 % lepszych (gorzej); 2018–2023 67 obserwacji, +24,0 pp, 70 %.
5–6 vs 0–2: 36 mies. +17,8 pp [−1,1; +40,0], 12 mies. +9,0 [−11,3; +24,4]. Pojedynczo (36 mies.): Siła ≥ 7 +16,2 [+2,5; +26,8] — jedyna z przedziałem > 0; Jakość 7/7
+13,5 [−2,1; +32,2]; przychody > 10 % w 3/5 lat +6,6 [−0,4; +12,1]; ROA ≥ 10 % +3,7; OCF/dług +0,6; brak ⬇ +3,6. Reguła dla strony NIE spełniona (przedział obejmuje 0,
w 2012–2017 grupa 5–6 pkt gorsza). Hipoteza (ok. 60 % vs 45 %) — liczbowo tak w całości (63 % vs 49 %), ale wynik niestabilny w czasie i oparty na małej grupie.

## Etap 96: dywidenda 5 lat z rzędu a jakość; PEGY vs PEG (zapisane 2026-11-23 PRZED uruchomieniem)

Użytkownik: „sprawdź, co daje 5 lat wypłacanej dywidendy, czy do parametrów jakości coś daje; czy PEGY jest lepszy czy gorszy niż PEG”. Dane, zbiór, starty, miara
(nadwyżka nad medianą zbioru 12 / 36 mies.) i bootstrap po latach jak w etapach 92–95. (A) D5 = dywidenda (suma wypłat z przepływów, SEC) wypłacona w każdym z 5 ostatnich
lat obrotowych. Porównania: D5 vs spółki bez dywidendy w ostatnim roku — wszystkie spółki; w Jakość 7/7; w Siła ≥ 7; w Jakość 7/7 lub Siła ≥ 7; dodatkowo odsetek ze stratą
po 36 mies. i najgorszy decyl (miara stabilności — użytkownik woli stabilność). (B) PEG = P/E ÷ (100 × CAGR zysku 5 lat), PEGY = P/E ÷ (100 × CAGR zysku 5 lat + 100 ×
stopa dywidendy) — oba z tego samego przeszłego wzrostu (prognoz historycznych nie mamy); spółki z P/E > 0 i wzrostem > 0. Dla każdego: korelacja rang ze zwrotem
(średnia z startów, znak ujemny = niższy wskaźnik → lepiej) oraz dolna tercyla − górna tercyla (36 mies.) z bootstrapem; także różnica PEGY − PEG w tercylach.
Hipotezy: (A) D5 zmniejsza odsetek strat i dolny ogon, ale nie podnosi mediany; w grupach jakości różnica w granicach szumu; (B) PEGY ≈ PEG (różnica rzędu 1–2 pp,
w granicach szumu), bo stopy dywidendy w tym zbiorze są małe względem wzrostu.

Wynik etapu 96 (2026-11-23). (A) D5 − bez dywidendy, 36 mies.: wszystkie +5,8 pp [+0,9; +13,1]; Jakość 7/7 +15,5 [−0,6; +43,1]; Siła ≥ 7 +6,3 [−10,1; +27,8];
Jakość lub Siła +7,9 [−3,9; +21,8]. Stabilność (36 mies.): strata — wszystkie 20 % vs 27 %, Jakość 7/7 13 % vs 27 %, Siła ≥ 7 7 % vs 20 %, Jakość lub Siła 10 % vs 23 %;
najgorsze 10 % nadwyżki: −54 vs −70 pp, −26 vs −52, −15 vs −50, −25 vs −52. Hipoteza (A) — tak: dywidenda przez 5 lat wyraźnie zmniejsza ryzyko straty i dolny ogon
(w grupach jakości o połowę), mediana tylko lekko wyżej (we wszystkich spółkach +5,8 pp, przedział > 0; w grupach jakości w granicach szumu). (B) PEG i PEGY z przeszłego
wzrostu: korelacja rang z 36 mies. +0,077 i +0,084 (dodatnia = niski wskaźnik → GORZEJ), tania minus droga tercyla −10,3 [−18,0; −1,7] i −9,3 [−16,8; +2,1] pp; tanie
tercyle pokrywają się w 59 %; tanie tylko wg PEGY vs tylko wg PEG +6,2 [−26,7; +21,2] (n 18/21). Hipoteza (B) — tak: PEGY ≈ PEG; oba liczone z przeszłego wzrostu
zysku nie wskazują lepszych spółek (raczej odwrotnie). PEG na stronie liczony z prognozy analityków — niesprawdzalny (brak historii prognoz).

## Etap 97: P/FCF wśród spółek z długiem / kapitałem < 1 — warianty progów (zapisane 2026-11-23 PRZED uruchomieniem)

Użytkownik: „sprawdź, jaki wpływ ma P/FCF na akcje z debt/equity below 1, przetestuj różne warianty P/FCF”. Dane, zbiór (top 500 USA PIT bez wykluczonych sektorów),
starty w styczniu 2012–2023, miara (nadwyżka nad medianą zbioru 12 / 36 mies.), bootstrap po latach jak w etapach 92–96. Grupa bazowa: D/E 0–1 (jak w Jakość 7/7).
P/FCF = kapitalizacja ÷ FCF 12 mies. (FCF ≤ 0 osobno). Warianty: (1) progi P/FCF ≤ 10 / ≤ 15 / ≤ 20 / ≤ 25 / ≤ 30 vs reszta grupy z FCF > 0; (2) kwintyle P/FCF;
(3) FCF ≤ 0 vs FCF > 0; (4) to samo wewnątrz D/E < 1 i Siła ≥ 7. Miary: mediana nadwyżki, odsetek lepszych od mediany, odsetek ze stratą po 36 mies., połowy
2012–2017 / 2018–2023. Etap 93 (wszystkie spółki): P/FCF ≤ 15 vs > 30 −3,5 pp [−14,9; +6,9]. Hipoteza: tanie P/FCF nie daje wyższej mediany (raczej najdroższy
kwintyl też nie gorszy), ale FCF ≤ 0 wyraźnie gorzej; najtańszy kwintyl może mieć mniejsze straty. Reguła: wariant „działa”, jeśli przedział 36 mies. wyklucza 0 i znak
jest taki sam w obu połowach.

Wynik etapu 97 (2026-11-23). D/E < 1 (wszystkie z FCF > 0): progi P/FCF ≤ 10 / 15 / 20 / 25 / 30 vs wyżej — 36 mies. −4,5 / −4,4 / −0,7 / −0,8 / −0,1 pp, wszystkie przedziały
obejmują 0, znaki różne w połowach; kwintyle: K1 (mediana P/FCF 11) −3,3 pp, K2–K4 (18–32) ok. 0, K5 (59) −5,8 pp; strata po 36 mies. K1 25 %, K2 18 %, K3 20 %, K4 24 %,
K5 28 %; K1 − K5 +2,4 [−11,2; +16,5]. FCF ≤ 0: −9,0 pp, strata 35 % (vs FCF > 0: 12 mies. +8,2 [+1,6; +18,9]). D/E < 1 i Siła ≥ 7: TANIE P/FCF GORZEJ — ≤ 15 vs > 15
−34,0 pp [−47,7; −15,7] (obie połowy ujemne: −19,6 / −31,8; n 33 / 91), ≤ 20 vs > 20 −19,1 [−32,9; −7,8] (−9,9 / −12,9), ≤ 30 −18,5 [−32,4; −3,8]; lepsze od mediany: tanie 39–57 %
vs drogie 69–72 %. Hipoteza — tak w części (tanie P/FCF nie pomaga, FCF ≤ 0 gorzej), ale najmniejsze straty ma środek (P/FCF ok. 15–35), a wśród silnych spółek niskie
P/FCF to sygnał ostrzegawczy (najpewniej szczyt cyklu / jednorazowo wysoki FCF), nie okazja. Małe grupy — wynik do potwierdzenia.

## Etap 98: spółki z ujemnym kapitałem własnym (bez ROE) — czy skup akcji albo ROA / ROCE coś mówią (zapisane 2026-11-23 PRZED uruchomieniem)

Użytkownik: „jak nie ma ROE, to sprawdzaj skup akcji, bo odkup zawsze ruszy cenę do góry?”. Dane, zbiór, starty, miara i bootstrap jak w etapach 92–97. Grupa: kapitał
własny < 0 (wartość księgowa / kapitalizacja < 0). Porównania wewnątrz grupy: (1) skup netto 12 mies. > 2 % kapitalizacji vs reszta; (2) liczba akcji 3 lata ≤ −2 %
vs reszta; (3) ROA ≥ 10 % vs < 10 %; (4) ROCE ≥ 15 % vs < 15 %; (5) cała grupa vs wszystkie spółki (czy ujemny kapitał sam w sobie szkodzi). Miary: mediana nadwyżki
12 / 36 mies., odsetek lepszych od mediany, strata po 36 mies. Hipoteza: grupa mała (kilkadziesiąt spółek rocznie), więc przedziały szerokie; skup nie daje pewnej przewagi
(etap 93: skup wbrew Lynchowi), ROA / ROCE też w granicach szumu; ujemny kapitał sam w sobie nie szkodzi (to często dojrzałe firmy ze skupem).

Wynik etapu 98 (2026-11-23). Spółek z ujemnym kapitałem w zbiorze: 7–31 rocznie (rośnie z czasem). Ujemny vs dodatni kapitał, 36 mies.: +10,7 pp [+4,5; +20,6], lepsze
od mediany 61 % vs 49 %, strata 15 % vs 23 % (12 mies. +3,9 [−0,0; +11,1]). Wewnątrz ujemnego kapitału: skup netto > 2 % +4,0 [−16,6; +27,4] (62 vs 56 % lepszych),
akcje 3 lata ≤ −2 % +9,3 [−33,5; +32,2] — w granicach szumu; ROA ≥ 10 % −22,3 [−46,4; −15,4] (54 vs 72 %), ROCE ≥ 15 % −15,0 [−42,8; +6,7]. Hipoteza: skup nie daje pewnej
przewagi — tak; ROA / ROCE w granicach szumu — nie (wyższe ROA raczej gorzej; mała grupa, ok. 75 vs 75 obserwacji); ujemny kapitał nie szkodzi — tak, a nawet lepiej
(to głównie dojrzałe, rentowne firmy oddające gotówkę akcjonariuszom). Wniosek: brak ROE przy ujemnym kapitale nie jest sygnałem ostrzegawczym; skupu nie dodajemy jako
zamiennika ROE.

## Etap 99: propozycja portfela do 10 spółek wg typów Lyncha — 6 stabilnie / 2 szybko / 1 wolno rosnąca (zapisane 2026-11-23 PRZED uruchomieniem)

Użytkownik: „zrób sugestie budowania portfela max do 10 spółek z różnych typów akcji Lyncha” (jego cel: 6 stabilnie, 2 szybko, 1 wolno rosnąca). Reguła doboru tylko
z cech potwierdzonych wcześniej (bez nowych progów): wszędzie bez ⬇ (etapy 77, 92) i FCF > 0 (etap 97); stabilnie rosnące — Siła ≥ 7 lub Jakość 7/7 (etapy 83, 95),
kolejność wg marży netto (etap 93), 6 spółek; szybko rosnące — Siła ≥ 7 lub Jakość 7/7, kolejność wg oceny Siła, 2 spółki; wolno rosnące — dywidenda rośnie 5 lat
(etap 93), kolejność wg Siła, 1 spółka. Typy jak w etapie 92 (przybliżenie bez prognoz). Test: co roku w styczniu 2012–2023 wybór, równe wagi, trzymanie 12 mies.
(i osobno 36 mies.), bez kosztów; porównanie ze średnią i medianą zbioru (równe wagi wszystkich spółek) w tym samym okresie. Miary: średni roczny zwrot portfela vs zbioru,
lata lepsze od zbioru (z 12), najgorszy rok, odsetek spółek portfela ze stratą; połowy 2012–2017 / 2018–2023; bootstrap po latach dla różnicy średnich. Hipoteza: portfel
lepszy od zbioru o kilka pp rocznie, w większości lat, z mniejszym odsetkiem strat; wynik niepewny (9 spółek, 12 startów). Reguła dla strony: propozycje pokazujemy
(jako podpowiedź, użytkownik wybiera), jeśli portfel nie jest gorszy od zbioru w obu połowach; w przeciwnym razie — nie.

**Wynik etapu 99** (`r124_etap99.py`, `wyniki/r124_etap99.md`): 12 mies., 10 startów 2012–2023: portfel +18,0 % vs zbiór +11,8 % (+6,2 pp [−0,7; +13,6]), lepiej w 6/10 lat,
spółek ze stratą 24 vs 34 %; połowy: 2012–2017 −3,1 pp (1/4, średnio 4,8 spółki — w 2014 r. tylko 1, w 2015 r. 2), 2018–2023 +12,5 pp (5/6). 36 mies.: +76,1 vs +44,2 %
(+32,0 pp [+6,6; +67,3]), 2012–2017 +8,0 pp, 2018–2023 +47,9 pp, strata 14 vs 24 %. **Reguła z protokołu NIE spełniona** (12 mies. w pierwszej połowie gorzej niż zbiór),
przedział dla 12 mies. obejmuje 0 → propozycji nie dodajemy na stronę. Na plus (nie zmienia decyzji): mniej spółek ze stratą w obu horyzontach i lepszy wynik 36 mies.
w obu połowach; w latach 2012–2017 reguła wybierała za mało spółek, żeby ocenić.

## Etap 100: ta sama propozycja przy celu 6 / 2 / 2 (zapisane 2026-11-23 PRZED uruchomieniem)

Użytkownik zmienił cel na 6 stabilnie / 2 szybko / 2 wolno rosnące. Reguła doboru i test bez zmian względem etapu 99 (tylko 2 zamiast 1 wolno rosnącej, kolejność wg Siła).
Ta sama reguła dla strony: pokazujemy, jeśli portfel nie jest gorszy od zbioru w obu połowach (12 mies.). Spodziewamy się wyniku bardzo podobnego do etapu 99 (1 spółka różnicy).

**Wynik etapu 100** (`r125_etap100.py`, `wyniki/r125_etap100.md`): 12 mies. +5,5 pp [−0,4; +11,5] (6/10 lat), 2012–2017 −2,7 pp (1/4, ~5,5 spółki), 2018–2023 +11,0 pp;
36 mies. +30,2 pp [+8,1; +58,6], obie połowy dodatnie; spółek ze stratą 24 vs 34 % (12 m), 16 vs 24 % (36 m). Jak w etapie 99 — **reguła niespełniona** (pierwsza połowa
12 mies. gorsza), propozycji nie dodajemy. Cel 6 / 2 / 2 w tabeli portfela ustawiony (decyzja użytkownika, nie z testu).

## Etap 101: faza spółki (cykl życia 1–5) a zwrot (zapisane 2026-11-23 PRZED uruchomieniem)

Użytkownik (zrzuty z innego serwisu, model 5 faz: start, hiperwzrost, dźwignia operacyjna, zwrot kapitału, schyłek): „wykres fazy … mówi czy mamy szanse na zarobek”.
Faza z trzech pytań, nasze reguły (bez dopasowania progów): **5 Schyłek** — przychody 3 lata CAGR < 0; inaczej, gdy marża operacyjna TTM ≤ 0: **1 Start** (zysk netto TTM
nie lepszy niż rok wcześniej) albo **2 Hiperwzrost** (strata się zmniejsza); gdy marża operacyjna > 0: **4 Zwrot kapitału** (dywidenda wypłacona w ostatnim roku obrotowym
lub skup netto > 0), w przeciwnym razie **3 Dźwignia operacyjna**. Zbiór, starty i miary jak w etapach 92–98 (top 500 USA PIT bez wykluczonych sektorów, styczeń 2012–2023;
nadwyżka nad medianą zbioru 12 / 36 mies., odsetek lepszych od mediany, odsetek ze stratą, połowy 2012–17 / 2018–23, bootstrap po latach). Porównania: każda faza vs
pozostałe; fazy 3–4 vs 1, 2, 5. Hipoteza z filmu: fazy 3–4 lepsze, 5 gorsza. Reguła dla strony: fazę pokazujemy zawsze jako opis faktów (trzy pytania), a obok wynik
testu; twierdzenie „faza X daje większą szansę” oznaczamy jako potwierdzone tylko, gdy różnica 36 mies. ma przedział bez zera i ten sam znak w obu połowach.

**Wynik etapu 101** (`r126_etap101.py`, `wyniki/r126_etap101.md`): żadna faza nie różni się od pozostałych istotnie (wszystkie przedziały 36 mies. obejmują 0, znaki zmieniają się
między połowami). 3–4 vs 1, 2, 5: 36 mies. −1,5 pp [−6,5; +3,0]. Schyłek (przychody 3 lata w dół) NIE gorszy: +2,4 pp [−3,5; +10,2], strata 19 % (najniższa). Start: więcej
spółek ze stratą (40 % / 12 m, 46 % / 36 m vs 30 / 23 %), ale mediana bez pewności (n = 68). W top 500 ~60 % spółek jest w fazie 4. **Twierdzenie „faza mówi o szansie na
zarobek” niepotwierdzone** → na stronie faza tylko jako opis faktów z dopiskiem o wyniku testu.

## Etap 102: fazy rynkowe Weinsteina (kurs vs średnia 30-tygodniowa) a zwrot (zapisane 2026-11-23 PRZED uruchomieniem)

Użytkownik: „może możemy lepiej określić te fazy? … dużo traderów o tym mówi”. Traderzy mówią o fazach kursu (Stan Weinstein, „Secrets for Profiting in Bull and Bear
Markets”, 1988; podobnie Wyckoff): 1 Baza, 2 Wzrost (kupuj), 3 Szczyt, 4 Spadek (unikaj). Reguła (miesięczne zamknięcia z badania jako przybliżenie tygodniowych:
średnia 7 mies. ≈ 30 tyg.): nachylenie = średnia teraz ÷ średnia miesiąc wcześniej − 1; płaska, gdy |nachylenie| < 1 %. Rosnąca: kurs ≥ średniej → 2, poniżej → 3.
Malejąca: kurs < średniej → 4, powyżej → 1. Płaska: średnia wyższa niż 6 mies. wcześniej → 3, inaczej → 1. Zbiór, starty (styczeń 2012–2023) i miary jak w etapie 101.
Porównania: A) faza 2 vs 4 (wszystkie); B) każda faza vs pozostałe; C) wśród spółek jakościowych (Jakość 7/7 lub Siła ≥ 7) faza 4 vs pozostałe i faza 2 vs pozostałe;
D) faza spółki z etapu 101 (4 Zwrot kapitału) × faza kursu 2. Hipoteza Weinsteina: 2 lepsza, 4 gorsza (głównie 12 mies.; z literatury o momentum możliwe odwrócenie
w 36 mies.). Reguła dla strony: twierdzenie oznaczamy jako potwierdzone, gdy różnica 12 mies. (horyzont traderów) ma przedział bez zera i ten sam znak w obu połowach;
fazę kursu pokazujemy na karcie jako opis (z wynikiem testu), a do kryteriów / zasad dokupu NIE dodajemy bez potwierdzenia.

**Wynik etapu 102** (`r127_etap102.py`, `wyniki/r127_etap102.md`): faza 4 Spadek gorsza od pozostałych w obu połowach: 12 mies. −4,3 pp [−12,7; +2,3] (strata 39 vs 29 %),
36 mies. −8,2 pp [−15,1; −0,6]; 2 Wzrost vs 4 Spadek: +4,5 pp [−1,7; +13,2] / 12 m, +8,6 [−0,3; +16,6] / 36 m. Faza 2 vs pozostałe ~+2 pp (szum), 3 Szczyt nie gorsza
(+3,8 pp / 36 m), 1 Baza lekko gorsza (−4,0 / 36 m, przedział do 0). Jakość: za mało spółek w fazie 4 (n = 34), wynik niepewny. D (faza spółki 4 × kurs 2) — brak różnicy.
Według reguły (12 mies., przedział bez zera) **niepotwierdzone**; kierunek zgodny z Weinsteinem dla fazy 4 i istotny na 36 mies. → na karcie faza kursu jako opis z wynikiem
testu (faza 4: więcej spółek ze stratą), bez zmian w kryteriach i zasadach dokupu.

## Etap 103: cykl życia spółki wg Lyncha (zapisane 2026-11-23 PRZED uruchomieniem)

Użytkownik: „nie o to mi chodziło, to jest analiza techniczna … chcę analizę Petera Lyncha cykli spółki” (faza kursu z etapu 102 zdjęta z karty). Lynch („One Up on
Wall Street”, rozdz. o szybko rosnących): spółka przechodzi fazę startu (dopracowanie modelu, największe ryzyko), szybkiej ekspansji (wchodzi na nowe rynki — tu się
najwięcej zarabia), dojrzewania / nasycenia (nie ma już łatwej drogi wzrostu — tu kończy się szybki wzrost akcji), potem staje się stabilnie lub wolno rosnącą, a na końcu
może tracić. Reguła (progi z typów Lyncha i naszego `ocena.faza`: 15 %): **5 Schyłek** — przychody 3 lata CAGR < 0; bez zysku operacyjnego: **2 Szybka ekspansja**, gdy
strata maleje i przychody 3 lata ≥ 15 % rocznie, inaczej **1 Start**; z zyskiem: **2 Szybka ekspansja** — przychody 3 lata ≥ 15 % i 1 rok ≥ 15 %; **3 Dojrzewanie** —
przychody 3 lub 5 lat ≥ 15 % rocznie, ale ostatni rok < 15 % (hamowanie); **4 Dojrzałość** — pozostałe (przychody 0–15 % rocznie). Zbiór, starty, miary jak w etapie 101.
Hipotezy Lyncha: 2 lepsza od pozostałych; 3 gorsza od 2; 5 i 1 najgorsze. Reguła dla strony: fazę pokazujemy jako opis (trzy pytania + schemat); twierdzenie
o fazie oznaczamy jako potwierdzone, gdy różnica 36 mies. ma przedział bez zera i ten sam znak w obu połowach.

**Wynik etapu 103** (`r128_etap103.py`, `wyniki/r128_etap103.md`): **3 Dojrzewanie gorsze od pozostałych: 36 mies. −11,0 pp [−19,1; −0,8], obie połowy ujemne (−20,0 / −1,6)
→ potwierdzone** (12 mies. −2,8 [−10,6; +1,3]). 2 Szybka ekspansja wbrew Lynchowi nie lepsza: −2,7 pp [−14,5; +4,1] (2012–17 −20, 2018–23 +2). 1 Start −22,8 [−45,5; +15,5],
strata 43 vs 23 %. 4 Dojrzałość +2,8 (szum), 5 Schyłek +2,3 (szum). 3 vs 2: −7,8 [−17,2; +8,0]. Na karcie: faza wg Lyncha jako opis, ⚠ dla Dojrzewania (potwierdzone);
faza kursu Weinsteina (etap 102) zdjęta z karty na prośbę użytkownika.

## Etap 104: strategia „kup przy wejściu w fazę, sprzedaj przy schyłku” (zapisane 2026-11-24 PRZED uruchomieniem)

Użytkownik: „sprawdzasz, w której fazie zacząłeś kupować spółkę, i wychodzisz, kiedy jest schyłek”. Fazy dokładnie jak na stronie (`W.fazyLat`, wersja długoterminowa:
okno 3 lat, fazy 1 → 4 tylko do przodu, schyłek przy trwałym spadku 2 lata z rzędu, wyjście ze schyłku po przebiciu szczytu przychodów i typowego zysku, zmiana
struktury −30 % przy marży ≥ 80 % = nowa historia), liczone co roku w styczniu z danych znanych w tym dniu: lata obrotowe do 10 wstecz (przychody i zysk operacyjny
z sum 4 kwartałów na koniec roku obrotowego, zapas: zysk netto; dywidendy + skup akcji z rocznych przepływów). Wejście: styczeń, w którym faza bieżąca = X, a
poprzedni punkt serii ≠ X (wejście w fazę); wariant B: każdy styczeń w fazie X (bez warunku wejścia). Wyjście: pierwszy styczeń z fazą 5 albo koniec danych
(2026-09) albo koniec notowań. Zbiór: top 500 USA PIT bez wykluczonych sektorów; wejścia 2012–2023. Miary: roczna stopa zwrotu (CAGR) pozycji, nadwyżka nad
medianą CAGR wszystkich spółek zbioru w tym samym okresie (od wejścia do wyjścia), odsetek pozycji ze stratą, średni czas trzymania; połowy wg roku wejścia
(2012–17 / 2018–23); bootstrap po latach wejścia. Hipoteza (z logiki cyklu): wejście w 2 Hiperwzrost lub 3 Dźwignię operacyjną daje najwyższą nadwyżkę.
Reguła: fazę uznajemy za „najlepszy moment wejścia”, gdy mediana nadwyżki > 0, przedział bez zera i ten sam znak w obu połowach.

**Wynik etapu 104** (`r129_etap104.py`, `wyniki/r129_etap104.md`): żadna faza wejścia nie daje nadwyżki. A (wejście w fazę; mało przejść w danych od 2012):
2 Hiperwzrost +1,9 pp/rok [−6,8; +9,4] (n = 24, połowy +4,3 / −2,4), 3 Dźwignia −1,1 [−13,7; +14,8] (n = 22), 4 Zwrot kapitału −0,9 [−3,5; +0,7] (n = 100).
B (każdy styczeń w fazie): 3 Dźwignia operacyjna **−3,2 pp/rok [−4,3; −1,4], obie połowy ujemne** (n = 289), 4 Zwrot kapitału −0,8 [−1,5; −0,1] (obie połowy
ujemne, ale ~1 pp), 1 i 2 — szum. Wyjście przez schyłek rzadkie (4–23 % pozycji; zwykle trzymanie do 2026). **Reguła niespełniona dla każdej fazy** — brak
„najlepszego momentu wejścia” według fazy; trzymanie spółek w fazie dźwigni operacyjnej wypadało gorzej od mediany. Strona bez zmian (faza tylko jako opis).

## Etap 105: faza rozwoju + korzystna cena (PEG / DCF) — kup, trzymaj do schyłku (zapisane 2026-11-24 PRZED uruchomieniem)

Użytkownik: „nie mówiłem, żebyś wchodził w każdym momencie, ale w momencie, kiedy PEG lub DCF mówi, że to dobry moment … faza to jedno, a cena spółki to drugie”.
Jak etap 104 (fazy ze strony, styczeń, wyjście przy pierwszym schyłku albo 2026-09, ta sama miara: CAGR pozycji − CAGR mediany zbioru w tym samym okresie), ale
wejście tylko w styczniu, gdy spółka jest w fazie X I cena jest korzystna. PEG historyczny = P/E ÷ (100 × wzrost zysku 5 lat rocznie) (prognoz z przeszłości nie ma);
DCF historyczny jak na stronie (wzrost przychodów 3 lata w [0; 25 %], 5 lat + 5 lat wygaszania do 3 %, stopa 10 %, marża FCF z 12 mies. w [0; 60 %], gotówka netto),
liczony względem kapitalizacji (przychody = kapitalizacja ÷ P/S): potencjał = wartość ÷ kapitalizacja − 1. Dwa progi „dobrego momentu”:
T1 (etykieta strony „Niedowartościowana / Bardzo tania”): PEG 0–1, a gdy PEG nie ma — DCF ≥ +15 %; T2 (reguła dokupu użytkownika): PEG 0–2 lub DCF ≥ +15 %.
Porównania w każdej fazie: tanio vs ta sama faza bez korzystnej ceny; oraz nadwyżka nad medianą zbioru. Hipoteza użytkownika: faza + korzystna cena > rynek.
Reguła: kombinację uznajemy za działającą, gdy mediana nadwyżki > 0, przedział bez zera i ten sam znak w obu połowach (2012–17 / 2018–23).

**Wynik etapu 105** (`r130_etap105.py`, `wyniki/r130_etap105.md`): żadna kombinacja faza + korzystna cena nie bije rynku. T1 (PEG 0–1 / DCF ≥ +15 %):
3 Dźwignia +0,8 pp/rok [−4,4; +4,4] (n = 38; połowy −6,5 / +3,2), 4 Zwrot kapitału −0,6 [−2,7; +0,9] (n = 358); tanio vs drożej w tej samej fazie: dźwignia
+4,3 [−0,7; +8,5], zwrot kapitału +0,2 [−2,0; +2,0]. T2 (PEG 0–2 / DCF ≥ +15 %): dźwignia −4,1 [−9,0; −1,3] (obie połowy ujemne, strata 44 %), zwrot kapitału
−0,7 [−2,5; +0,8]. Start i Hiperwzrost: 1–4 przypadki (prawie nigdy nie są tanie wg PEG / DCF). **Reguła niespełniona.** Ograniczenia: PEG historyczny z przeszłego
wzrostu zysku (strona używa prognoz analityków), dostępny tylko u 19 % ocen; DCF historyczny bez korekty o SBC i odsetki.

**Sprawdzenie metody etapów 104–105** (po fakcie, NIE przed-rejestrowane; użytkownik: „coś robisz źle … KO oddaje kapitał przez dekady”): ceny w `cache.npz` zawierają
dywidendy (KO ×4,0 vs ×3,9 z adjusted_close). Lata 2012-01–2026-09 (z dywidendami): KO 9,6 %/rok, PEP 7,7 %, PG 8,5 %, MCD 8,8 %, JNJ 13,0 %, COST 20,1 %, MSFT 24,3 %,
AAPL 25,1 %, NVDA 56,1 %; S&P 500 (SPY) 14,9 %, równoważone S&P 500 (RSP) 12,5 %. Pozycje z etapu 105 względem SPY w tym samym okresie: wszystkie spółki zbioru —
CAGR mediana 8,1 % / średnia 8,9 %, SPY 14,8 %, pobiło SPY 29 %; faza 4 tanio (T1) — 7,9 / 9,4 %, 28 % pobiło; faza 3 tanio — 6,0 / 12,7 %, 32 %; faza 3 lub 4 tanio —
7,7 / 9,7 %, 28 %; faza 2 lub 3 dowolna cena — 6,5 / 7,2 %, 25 %. Wniosek: metoda poprawna; przeciętna duża spółka przegrywała z SPY (indeks ważony kapitalizacją
ciągnęło kilka gigantów technologicznych), a faza rozwoju nie wyróżnia zwycięzców — spółki w fazie 3–4 zarabiały stabilnie (~8–10 %/rok, mniej strat), ale nie więcej
niż przeciętna duża spółka.

## Etap 106: top 10 / 25 / 50 największych spółek USA (zapisane 2026-11-24 PRZED uruchomieniem)

Użytkownik: „to co, kupowanie top 25 po market cap jest lepsze?”. Co roku w styczniu (2012–2026) N największych spółek USA wg kapitalizacji z poprzedniego
miesiąca (dane PIT, ze spółkami później zdjętymi z giełdy; wszystkie sektory oraz wariant bez sektorów wykluczonych na stronie), trzymanie 12 mies., ceny
z dywidendami, koszt 0,1 % na stronę przy zmianie składu. Wagi: równe albo wg kapitalizacji. N = 10, 25, 50. Porównanie: SPY (S&P 500) i RSP (równoważony S&P 500).
Miary: roczna stopa zwrotu, największe obsunięcie (miesięcznie), lata lepsze od SPY, połowy 2012–18 / 2019–26. Hipoteza: top 25 ważone kapitalizacją ≈ SPY
plus trochę (kilka gigantów ciągnęło indeks); równe wagi — wynik zależy od okresu. Bez reguły dla strony — odpowiedź na pytanie.
Dodatek (zapisany przed uruchomieniem): sprawdzenie dłuższego okresu — kapitalizacje w bazie są dopiero od 2009-04, więc najdłużej od 2010 r. (połowy 2010–2017 / 2018–2026); lat 2000–2009 tymi danymi nie da się sprawdzić.

**Wynik etapu 106** (`r131_etap106.py`, `wyniki/r131_etap106.md`; dodatek od 2010: `r131b_etap106_od2010.py`): 2012–2026 — SPY 15,0 %/rok (obsunięcie −24 %), RSP 12,6 %;
top 10 wg kapitalizacji 19,3 % (−38 %), top 25 wg kapitalizacji 18,0 % (−32 %, lepsze od SPY 12 z 15 lat), top 25 równe wagi 16,3 % (−28 %), top 50 wg kap. 17,0 %.
Połowy: 2012–18 top 25 13,3 % vs SPY 12,6 % (prawie równo), 2019–26 22,4 % vs 17,2 % — przewaga z ery gigantów technologicznych. Od 2010: top 25 wg kap. 16,6 % vs SPY
14,2 %; 2010–17 13,5 % vs 13,8 % (bez przewagi), 2018–26 19,6 % vs 14,5 %. Kapitalizacje w bazie od 2009-04 — lat wcześniejszych nie da się sprawdzić; literatura
(Arnott i in., Research Affiliates 2010–2018) na dłuższej historii: największe spółki zwykle przegrywały z rynkiem w kolejnej dekadzie — prognoza z 2018 r. dla gigantów
technologicznych się nie sprawdziła. Wariant bez sektorów wykluczonych nie policzony (brak mapy sektorów w danych badawczych). Wniosek: top 25 biło SPY tylko
w jednym okresie i z większymi obsunięciami; nie jest to trwała przewaga.

## Etap 107: „top po fundamentach” — wszystkie kryteria spełnione, najwyżej 10 spółek, przegląd raz w roku (zapisane 2026-11-24 PRZED uruchomieniem)

Użytkownik: „to kupuj top po fundamentach. Wszystko spełnione, max 10 spółek, rewizja raz do roku”. Co roku w styczniu 2012–2026 (zbiór: top 500 USA PIT bez
wykluczonych sektorów), wybór spółek spełniających kryteria, kolejność wg oceny Siła finansowa (jedyny czynnik z potwierdzoną przewagą, etap 95), najwyżej 10, równe wagi,
trzymanie 12 mies. (ceny z dywidendami, koszt 0,1 % na stronę dla zmienionej części); gdy żadna spółka nie spełnia — SPY na ten rok. Warianty kryteriów:
A — „wszystko”: Jakość 7/7 (przychody 5 lat > 8 %/rok, D/E 0–1, FCF > 0, ROE > 15 %, ROA > 10 %, ROE wyżej niż 3 lata temu, ROCE > 15 %) + 7/7 bez PEG
(przychody 5 lat > +50 %, przychody i zysk 1 rok > 5 %, ROE > 15 %, D/E 0–1, FCF > 0) + PEG historyczny 0–2 + brak ⬇;
B — jak A bez PEG (PEG historyczny dostępny rzadko: przeszły wzrost zysku 5 lat zamiast prognoz); C — B + Siła ≥ 7.
Porównanie: SPY, top 25 wg kapitalizacji (etap 106). Miary: stopa roczna, największe obsunięcie, lata lepsze od SPY, połowy 2012–18 / 2019–26, średnia liczba spółek.
Hipoteza: wariant B / C ≥ SPY (etapy 67–68: 7/7 18–21 %/rok przy 15–30 spółkach). Reguła: strategia „działa”, gdy biła SPY w obu połowach.

**Wynik etapu 107** (`r132_etap107.py`, `wyniki/r132_etap107.md`): 2012-01–2026-09 — SPY 14,7 %/rok (obsunięcie −24 %); A (wszystko z PEG) 9,9 % (−52 %), B (bez PEG)
13,1 % (−38 %), C (B + Siła ≥ 7) 14,9 % (−52 %). Połowy: 2012–18 A −1,1 %, B 5,0 %, C 4,0 % vs SPY 12,0 %; 2019–26 A 20,8 %, B 20,9 %, C 25,5 % vs SPY 17,2 %.
**Reguła niespełniona** (pierwsza połowa przegrana). Ważne ograniczenie: w 2012–2014 żadna spółka nie spełniała wszystkich kryteriów (w danych badawczych 5-letni
wzrost dostępny dopiero od ~2015 — SEC XBRL od 2009), a w 2015–2018 portfel miał 1–4 spółki (QCOM, GILD, BIIB, NVDA 2018 −50 %) — wynik pierwszej połowy to głównie
brak danych i koncentracja. Od 2019 (7–10 spółek): B 20,9 % vs SPY 17,2 % (6/8 lat lepiej). GOOGL i GOOG liczone osobno (dwie klasy akcji) — do poprawy przy wdrożeniu.

## Etap 108: PEG Lyncha z limitem wzrostu 25 % (zapisane 2026-11-24 PRZED uruchomieniem)

Użytkownik: „dodaj limit 25 %” (Lynch: wzrost > 20–25 % rocznie rzadko się utrzymuje; PEG z długoterminowego wzrostu). Historycznie mamy tylko PEG z przeszłego wzrostu
zysku 5 lat (prognoz z przeszłości brak): PEG = P/E ÷ (100 × wzrost), PEG25 = P/E ÷ (100 × min(wzrost, 25 %)). Zbiór top 500 USA PIT bez wykluczonych sektorów, starty
styczniowe 2012–2023, nadwyżka nad medianą 12 / 36 mies., bootstrap po latach, połowy. Porównania: (1) „tanie tylko dzięki wzrostowi > 25 %” (PEG < 1, ale PEG25 ≥ 1)
vs „tanie także z limitem” (PEG25 < 1); (2) to samo dla progu 2 (PEG < 2, PEG25 ≥ 2 vs PEG25 < 2); (3) PEG25 < 1 vs PEG < 1 (cała grupa). Hipoteza Lyncha: tanie tylko
dzięki > 25 % wypadają gorzej. Reguła dla strony: jeśli (1) lub (2) ma różnicę 36 mies. < 0 z przedziałem bez zera i tym samym znakiem w obu połowach — główny PEG na
stronie dostaje limit 25 % (etykiety, 7/7, dokup); w przeciwnym razie PEG z limitem pokazujemy tylko jako dodatkową informację („PEG Lyncha”).

**Wynik etapu 108** (`r133_etap108.py`, `wyniki/r133_etap108.md`): wzrost > 25 % miało ~20 % spółek z PEG. (1) PEG < 1 tylko dzięki wzrostowi > 25 % vs PEG25 < 1:
12 mies. +6,2 pp [−11,9; +22,2], 36 mies. −0,3 [−18,4; +32,6] (połowy +7,1 / −6,9); (2) próg 2: +5,3 / −4,0 pp, przedziały szerokie (n = 30); (3) PEG25 < 1 vs PEG < 1:
−1,0 / +0,0 pp. **Reguła niespełniona** — limit 25 % nie poprawia wyboru (z przeszłym wzrostem; prognoz historycznych brak). Główny PEG bez zmian; „PEG Lyncha
(wzrost max 25 %)” na karcie tylko jako informacja. Uboczne: PEG25 < 1 (z przeszłego wzrostu) vs reszta z PEG −6,4 pp / 12 m [−11,1; −0,8] — niski PEG z historii
nie wskazuje zwycięzców (jak etap 96).

## Etap 109: faworyzowanie stabilnego wzrostu przychodów i EPS z 5 lat (zapisane 2026-11-24 PRZED uruchomieniem)

Użytkownik: „faworyzuj spółki rosnące stabilnie przeszłe 5 lat revenue i EPS”. Definicja (w styczniu, dane znane w tym dniu; przychody i zysk netto z sum 4 kwartałów
w odstępach roku, EPS = zysk netto ÷ liczba akcji skorygowana o splity): S — przychody rosły w każdym z 5 lat (5/5) i EPS w ≥ 4 z 5; S55 — oba 5/5.
A) cecha: S vs reszta i S55 vs reszta (top 500 USA PIT bez wykluczonych sektorów, starty 2012–2023, nadwyżka nad medianą 12 / 36 mies., bootstrap, połowy).
B) portfel z etapu 107 (B: Jakość 7/7 + 7/7 bez PEG + bez ⬇, najwyżej 10, przegląd w styczniu): kolejność „najpierw S, potem Siła” vs „tylko Siła”; vs SPY.
Reguła dla strony: znacznik / filtr „stabilny wzrost 5 lat” i pierwszeństwo w kolejności, jeśli A (S vs reszta) ma różnicę 36 mies. > 0 z przedziałem bez zera
i dodatnią w obu połowach; w przeciwnym razie tylko informacja na karcie (bez wpływu na kolejność).

**Wynik etapu 109** (`r134_etap109.py`, `wyniki/r134_etap109.md`): A) S vs reszta 36 mies. +3,9 pp [−4,4; +11,2] (połowy +7,5 / +1,2), 12 mies. +0,6 [−5,2; +6,2];
S55 vs reszta 36 mies. +8,2 [−8,4; +22,8] (połowy −13,5 / +17,0). B) portfel top 10: tylko Siła 13,1 %/rok, najpierw S 12,9 %, najpierw S55 13,2 % (SPY 14,7 %) — pula
„wszystko spełnione” już w 60 % składa się ze spółek S. **Reguła niespełniona** (przedział obejmuje 0) — kierunek dodatni jak w etapie 58, ale bez pewności;
na stronie tylko informacja na karcie (krok „Wzrost”: lata wzrostu przychodów i EPS z 5), bez wpływu na kolejność.

## Etap 110 — przychody rosnące 5 lat z rzędu, horyzont 5–10 lat (protokół przed uruchomieniem, 2026-11-24)

Użytkownik: „revenue ma rosnąć stabilnie 5 lat z rzędu — to najważniejsze, EPS pójdzie za nią … zwrot jest najlepszy po 5–10 latach, rok to spekulacja,
wszystko poniżej 5 lat ma małe znaczenie”. Etap 109 mierzył 12 / 36 mies. i wymagał też EPS — tu sama sprzedaż i dłuższe horyzonty.
- Cecha P5: przychody roczne rosły w każdym z 5 ostatnich lat (5/5; dane jak w etapie 109, styczeń każdego roku, top 500 PIT bez wykluczonych sektorów).
  Porównania: P5 vs reszta z danymi; P5 vs ≤ 3/5 lat wzrostu.
- Miary: nadwyżka nad medianą zbioru (różnica median, bootstrap po latach startu) po 36, 60 i 120 mies.; odsetek spółek ze stratą; „EPS idzie za
  sprzedażą”: odsetek spółek, których zysk netto za 5 lat jest wyższy niż dziś (P5 vs reszta).
- Starty: 60 mies. — 2012–2021 (połowy 2012–16 / 2017–21); 120 mies. — 2012–2016 (tylko 5 startów: opisowo, bez reguły).
- Reguła: jeśli P5 vs reszta po 60 mies. ma przedział bez 0 i obie połowy dodatnie → znacznik „📈 5/5” na liście + filtr „Przychody rosną 5 lat”
  i pierwszeństwo w rankingu top 10 (najpierw P5, potem Siła). W przeciwnym razie zostaje tylko informacja na karcie (etap 109).

**Wynik etapu 110** (`r135_etap110.py`, `wyniki/r135_etap110.md`): P5 vs reszta po 5 latach +11,0 pp [−6,5; +26,8] (połowy +14,8 / +8,8; mediana zwrotu
+74 % vs +65 %, ze stratą 17 vs 18 %), po 3 latach +3,5 [−5,3; +9,0]; P5 vs ≤ 3/5 po 5 latach +13,5 [−5,6; +26,5]. 10 lat: tylko 75 spółek P5 (dane SEC od ~2009),
wynik nieczytelny (−22 pp [−68; +88]). Zysk idzie za sprzedażą: zysk netto za 5 lat wyższy niż dziś u 79 % spółek P5 vs 69 % reszty. Kierunek dodatni i rośnie
z horyzontem (3 l. +3,5 → 5 l. +11), ale przedział obejmuje 0 → **reguła niespełniona**: bez znacznika i pierwszeństwa; ramka na karcie liczy „stabilny” jako
przychody 5/5 (EPS pokazany obok).

**Uwaga do etapów 109–110** (użytkownik: „nie prosiłem, żebyś dodawał te rzeczy, chciałem, żebyś sprawdził tylko”): ramka „Stabilność wzrostu” usunięta z karty —
oba etapy to wyłącznie sprawdzenie, na stronie nic nie zostaje.

## Etap 111 — 8 reguł Buffetta z książki „Warren Buffett and the Interpretation of Financial Statements” (protokół przed uruchomieniem, 2026-11-24)

Użytkownik wkleił film (autor: „spółki spełniające regułę dały 93 % w 5 lat, niespełniające 65 % … wszystkie 8 reguł znalazło lepsze spółki”). Tylko
sprawdzenie — nic na stronę (użytkownik: „chciałem, żebyś sprawdził tylko”). Zbiór: top 500 USA PIT bez Financials / Materials / Energy / Utilities / Real
Estate (jak w filmie), starty styczeń 2012–2021 (5 lat) i 2012–2023 (3 lata), dane znane w dniu startu, ostatni rok obrotowy (FY).
Reguły (dane SEC; brak = poza porównaniem):
1. marża brutta > 40 % w 2 ostatnich FY; 2. EPS rósł w ≥ 9 z 10 lat i zawsze zysk (dane od ~2008 → starty 2019+; dodatkowo wariant 4 z 5 lat);
3. marża netto > 20 % w 2 ostatnich FY; 4. zobowiązania ÷ (kapitał + akcje własne) < 0,8; 5. odsetki < 15 % zysku operacyjnego (brak odsetek przy braku
długu = 0); 6. dług długoterminowy ≤ 4 × zysk netto (brak długu = spełnia, strata przy długu = nie); 7. capex ÷ zysk netto (suma 3 FY): < 25 / 25–50 / > 50 %;
8. SG&A ÷ zysk brutto: < 30 / 30–80 / > 80 %. Łącznie: reguły 3 + 6 + 8 wszystkie vs żadna.
Miary: mediana zwrotu 5 lat spełnia / nie (jak w filmie) i różnica median nadwyżki nad medianą zbioru z bootstrapem po latach startu, połowy 2012–16 / 2017–21; 3 lata.
Teza z filmu potwierdzona, gdy różnica 5 lat > 0, przedział bez 0 i obie połowy dodatnie.

## Etap 112 — trzy tezy z filmu „simple choices” (protokół przed uruchomieniem, 2026-11-24)

Tylko sprawdzenie, nic na stronę. Zbiór jak w etapie 111 (top 500 USA PIT bez wykluczonych sektorów), starty w styczniu.
1. Dług (Jag Capital: najniższy kwintyl 17,1 %/rok, najwyższy 7,5 %): kwintyle D/E w każdym starcie (ujemny kapitał osobno); średni zwrot 12 mies. równych
   wag, uśredniony po startach 2012–2025 (jak „roczny zwrot” w badaniu) + różnica nadwyżki Q1 vs Q5 po 5 latach (bootstrap, połowy).
2. „Ignoruj skrajne wyceny”: P/E 0–50 i PEG 0–3 (PEG z przeszłego wzrostu zysku 5 lat — prognoz historycznych nie mamy) vs P/E ≥ 50 lub PEG ≥ 3; straty osobno.
   Różnica nadwyżki po 3 i 5 latach.
3. BCG („po 10 latach 60 % wzrostu kursu ze sprzedaży”): rozkład log-zwrotu 5 lat na przychody na akcję, zmianę marży netto, zmianę P/E i resztę
   (dywidendy, różnice dat); dla górnych 25 % spółek i dla wszystkich (zysk dodatni na obu końcach). 10 lat — za mało danych, tylko starty 2012–2016 opisowo.
Teza potwierdzona, gdy kierunek jak w filmie, przedział bez 0 i obie połowy w tę samą stronę (1, 2); dla 3 — udział przychodów ≥ 50 % w górnym kwartylu.

**Wynik etapu 111** (`r136_etap111.py`, `wyniki/r136_etap111.md`; dane `r136a_sec_buffett.py`): potwierdzone 9 z 12 porównań (5 lat, przedział bez 0, obie
połowy dodatnie): marża brutto > 40 % +27 pp, EPS 4 z 5 lat +18, marża netto > 20 % +29, skorygowany D/E < 0,8 +9, dług ≤ 4 × zysk +17, capex < 25 % zysku vs > 50 %
+32, SG&A < 30 % zysku brutto +59 (mediana zwrotu 5 lat +124 % vs +61 %), łącznie 3 + 6 + 8 +66 (+122 % vs +40 %). Niepotwierdzone: odsetki < 15 % (pierwsza połowa
ujemna), EPS 9 z 10 lat (tylko 13 spółek — dane za krótkie). Kierunek wszystkich reguł jak w filmie; u nas różnice większe. Tylko sprawdzenie — nic na stronę.

**Wynik etapu 112** (`r137_etap112.py`, `wyniki/r137_etap112.md`): 1) kwintyle długu: średnio 15,0 / 16,3 / 12,5 / 13,8 / 12,5 %/rok (ujemny kapitał 17,1 %) —
różnica Q1 vs Q5 po 5 latach −1,3 pp [−8,7; +9,4] → teza Jag Capital (17,1 vs 7,5 %) **niepotwierdzona** w top 500; 2) P/E < 50 i PEG < 3 vs drożsi −1,0 pp / 5 lat
[−20,9; +18,8] → **niepotwierdzona** (PEG z przeszłego wzrostu); vs spółki ze stratą +15,4 [−36,5; +35,2] — kierunek zgodny, bez pewności; 3) rozkład zwrotu: 5 lat —
przychody 53 % (górne 25 %: 39 %), skup akcji 14 % (6 %), marża 12 % (28 %), P/E i dywidendy 22 % (26 %); 10 lat (starty 2012–16) przychody 44 %; 1 rok górne 25 %:
P/E 52 %. Kierunek BCG potwierdzony (rok = wycena, dłużej = sprzedaż), ale 60 % nie — u nas 40–53 %, dla najlepszych spółek ważna też marża.

## Etap 113 — portfel 10 spółek z najwyższym potencjałem DCF (protokół przed uruchomieniem, 2026-11-25)

Użytkownik: „sprawdź inwestowanie w spółki, które mają top 10 najwyższy potencjał DCF”. Tylko sprawdzenie.
- Potencjał DCF w styczniu każdego roku jak w etapie 105 (`dcf_wzgl`: przychody TTM, wzrost = przychody 3 lata 0–25 %, marża FCF 0–60 %, r 10 %, tg 3 %, 5 + 5 lat,
  gotówka netto; bez korekty o SBC i bez prognozy EPS — tych danych historycznie nie mamy) ÷ kapitalizacja − 1. Zbiór: top 500 USA PIT bez wykluczonych sektorów.
- Portfele (równe wagi, przegląd w styczniu, koszt 0,1 % obrotu, 2012-01 → 2026-09): A) top 10 po potencjale DCF; B) top 10 po DCF wśród spółek z dodatnim
  FCF i D/E < 1; C) top 10 po DCF wśród Jakość 7/7 + bez ⬇ (pula B z etapu 107). Porównanie: SPY, równe wagi całego zbioru; połowy 2012–18 / 2019–26, obsunięcie.
- Cecha: najwyższe 10 % potencjału DCF vs reszta, nadwyżka 12 / 36 / 60 mies. (bootstrap po latach startu, połowy).
- Teza „top 10 DCF bije rynek” potwierdzona, gdy portfel A lub B ma wyższy zwrot roczny niż SPY w obu połowach.

**Wynik etapu 113** (`r138_etap113.py`, `wyniki/r138_etap113.md`): A) top 10 po potencjale DCF 12,4 %/rok (2012–18 6,4 %, 2019–26 18,1 %, obsunięcie −30 %),
B) wśród FCF > 0 i D/E < 1 12,5 % (8,1 / 16,7 %), C) wśród Jakość 7/7 12,0 % (5,0 / 18,6 %, −39 %); SPY 14,7 % (12,0 / 17,2 %), równe wagi zbioru 13,7 %. Górne 10 %
potencjału DCF vs reszta: 12 mies. −1,6 pp, 36 mies. −3,5, 60 mies. +1,3 (wszystkie przedziały obejmują 0, pierwsza połowa zawsze ujemna). **Teza niepotwierdzona**:
najwyższy potencjał DCF częściej oznacza tanią spółkę z problemami (LUMN, WBD, CNC, LUV, GM) niż okazję. W 2012 tylko 3 spółki z danymi. Tylko sprawdzenie.

## Etap 114 — model dochodu rezydualnego (V/P) i EBIT/EV (protokół przed uruchomieniem, 2026-11-26)

Użytkownik: „który z modeli miał największą przewidywalność wycen w długim okresie? … przetestuj to”. Literatura: V/P z modelu dochodu rezydualnego
(Frankel i Lee 1998; Lee, Myers, Swaminathan 1999) i EBIT/EV (Gray i Carlisle 2012; Loughran i Wellman 2011). Tylko sprawdzenie — nic na stronę bez decyzji użytkownika.
- **V/P (dochód rezydualny)** w styczniu każdego roku: V/B = 1 + Σ_{t=1..10} (ROE_t − r) · B_{t−1}/B_0 ÷ (1 + r)^t + RI_10 ÷ (r · (1 + r)^10); r = 10 %;
  ROE_1 = bieżące ROE (zysk TTM ÷ kapitał, przycięte do −30…60 %), dalej liniowo do mediany ROE zbioru w tym miesiącu w roku 10; B_t = B_{t−1} · (1 + ROE_t · 0,6)
  (wypłata 40 % — brak historycznych prognoz analityków, więc bez nich); V/P = (kapitał ÷ kapitalizacja) · V/B. Kapitał ≤ 0 → brak (model nie działa).
- **EBIT/EV** = marża operacyjna TTM ÷ (EV ÷ przychody); EV = kapitalizacja + dług − gotówka. EV ≤ 0 → brak.
- **Łącznie z jakością**: Greenblatt — suma miejsc w rankingu EBIT/EV i ROCE; oraz oba wskaźniki wśród spółek z FCF > 0 i D/E < 1.
- Testy (top 500 USA PIT bez wykluczonych sektorów, starty 2012–2023): górne 10 % vs reszta i górne 20 % vs dolne 20 %, nadwyżka nad medianą 12 / 36 / 60 mies.,
  bootstrap po latach startu, połowy (12/36: 2012–17 / 2018–23; 60: 2012–16 / 2017–21). Portfele top 10 / top 30 (równe wagi, przegląd w styczniu, koszt 0,1 %,
  2012-01 → 2026-09) vs SPY i równe wagi zbioru; połowy 2012–18 / 2019–26.
- Model „przewiduje”, gdy górne 10 % lub kwintyl 5 vs 1 ma nadwyżkę > 0 po 36 lub 60 mies. z przedziałem bez 0 i dodatnią w obu połowach; portfel — gdy bije SPY w obu połowach.

**Wynik etapu 114** (`r139_etap114.py`, `wyniki/r139_etap114.md`): **żaden model nie przewidywał zwrotów** w top 500 w latach 2012–2026. V/P (dochód rezydualny):
górne 10 % vs reszta 36 mies. −2,7 pp [−17,5; +10,2], 60 mies. −11,2 [−35,1; +16,9] (pierwsza połowa dodatnia, druga ujemna); kwintyl 5 vs 1 też ujemny.
EBIT/EV: górne 10 % 60 mies. −19,0 [−42,8; +0,4], wśród FCF > 0 i D/E < 1 −15,1. Greenblatt (EBIT/EV + ROCE): najbliżej zera (kwintyl 5 vs 1 36 mies. +1,7
[−7,0; +11,8]). Portfele: top 10 Greenblatt 14,7 %/rok = SPY 14,7 % (2012–18 13,5 vs 12,0 %, 2019–26 15,7 vs 17,2 %), top 30 14,6 %; top 10 V/P 14,0 % (obsunięcie
−38 %), top 10 EBIT/EV 12,6 % (−42 %). Wzorzec jak w literaturze po 2007: „tanie” spółki przegrywały w 2019–26; w 2012–18 V/P i Greenblatt lekko lepsze od SPY.
Teza „model wyceny przewiduje zwroty” **niepotwierdzona** dla żadnego z trzech. Tylko sprawdzenie — nic na stronę.

## Etap 115 — kupno „tanio” wśród dobrych spółek: DCF vs PEG vs P/E na tle własnych 5 lat (protokół przed uruchomieniem, 2026-11-26)

Użytkownik: „jak się ma kupowanie po DCF, do PEG i do historycznego P/E (5 lat, jeżeli jest nisko — kupować); oczywiście fundamenty muszą być dobre”. Tylko sprawdzenie.
- Pule jakości (styczeń, PIT): **J** = przychody 5 lat > 8 %/rok, ROE > 15 %, FCF > 0, D/E 0–1 (rdzeń „Jakość 7”); **J77** = pula B z etapu 107 (Jakość 7/7 + 7/7 bez PEG + bez ⬇).
- Sygnały „tanio” (jak na stronie): **DCF** potencjał ≥ +15 % (etap 113, `dcf_wzgl`); **PEG 0–2** (reguła dokupu użytkownika) i **PEG < 1** (historyczny PEG, wzrost z przeszłości);
  **P/E w dolnej 1/3 własnych 5 lat** (dodatnie P/E z miesięcy t−60…t−1, ≥ 24 obserwacji; jak pasma na karcie); dodatkowo **P/E < 0,8 × mediana 5 lat**.
- Test: w puli — „tanio” vs reszta puli, nadwyżka nad medianą zbioru 12 / 36 / 60 mies., bootstrap po latach, połowy. Portfele (równe wagi, przegląd w styczniu,
  koszt 0,1 %, 2012-01 → 2026-09): cała pula J, pula J ∩ sygnał (dla każdego sygnału), vs SPY; połowy 2012–18 / 2019–26.
- Sygnał działa, gdy „tanio” vs reszta puli > 0 po 36 lub 60 mies. z przedziałem bez 0 i dodatnie w obu połowach; portfel — gdy bije i SPY, i całą pulę J w obu połowach.

**Wynik etapu 115** (`r140_etap115.py`, `wyniki/r140_etap115.md`): **żaden sygnał „tanio” nie działa** w pulach jakości (mało spółek: pula J średnio 26, J77 7; PEG
historyczny dopiero od ~2015, więc pierwsza połowa często pusta). Pula J, 36 mies.: DCF ≥ +15 % −2,5 pp [−33,5; +27,2] (połowy −27,9 / +15,4), PEG 0–2 −3,4, PEG < 1 +2,1,
**P/E w dolnej 1/3 własnych 5 lat −13,6 [−34,7; +7,1], obie połowy ujemne (−13,2 / −15,0)**, P/E < 0,8 × mediana −3,8. Portfele: cała pula J 13,6 %/rok (2012–18 9,1,
2019–26 17,9 %), J + DCF 12,3 %, J + PEG 0–2 12,7 %, J + P/E nisko 11,8 %; SPY 14,7 %. J77 + PEG < 1 15,7 % (3 spółki; 2012–18 8,1 vs SPY 12,0 %). Żaden portfel nie bije
SPY i całej puli w obu połowach. Wniosek: wśród dobrych spółek czekanie na „tanio” nie dodało zwrotu; niskie P/E względem własnej historii wręcz gorzej (dobre spółki
tanieją zwykle z powodu, a drożeją, gdy rosną). Zgodne z etapem 89 (czekanie na tanie ceny nie lepsze) i 97. Tylko sprawdzenie — nic na stronę.

## Etap 116 — reguła budowania pozycji użytkownika: start od razu przy bardzo dobrych fundamentach, dokup przy PEG 0–2 (protokół przed uruchomieniem, 2026-11-26)

Użytkownik: „przetestuj to: kupuj spółki początkowo za część kapitału, nie całość, dokupuj, kiedy PEG zejdzie poniżej 2, jeżeli nadal jakość i siła”. Tylko sprawdzenie.
Symulacja miesięczna, wpłata 1 jednostki na początku każdego miesiąca, koszt 0,1 %, bez sprzedaży (spółka znikająca z danych → gotówka).
- Bardzo dobre fundamenty (BD): Jakość 7/7 (7 kryteriów jak etap 95) albo Siła ≥ 7 (etap 95), wartości z ostatniego stycznia (przegląd raz w roku), w zbiorze top 500.
- Najwyżej 10 spółek naraz (cel = 10 % wartości konta na spółkę). Wolne miejsce → nowa spółka BD o najwyższej Sile (u użytkownika wybiera on sam).
- **A (nowa reguła)**: pierwszy zakup 20 % celu od razu; dokup 10 % celu najwyżej raz w miesiącu, gdy PEG 0–2, kurs ±7 % od ostatniego zakupu i spółka nadal BD.
- **B (stara reguła)**: jak A, ale także pierwszy zakup tylko przy PEG 0–2. **C (bez PEG)**: jak A, dokup bez warunku PEG (±7 % i raz w miesiącu zostają).
  **D (uśrednianie)**: cała wpłata co miesiąc równo do posiadanych spółek BD poniżej celu (pierwszy zakup od razu, bez PEG i ±7 %). **E**: wpłaty do SPY.
- Gotówka czekająca: wariant 0 % i wariant „w SPY”. Okresy: 2013-01 → 2026-09 oraz osobno 2013-01 → 2019-12 i 2019-01 → 2026-09.
- Miary: roczna stopa wpłat (IRR), wartość ÷ wpłaty, obsunięcie (TWR), średni udział gotówki.
- Reguła A „lepsza”, gdy IRR A ≥ B i A ≥ C w obu podokresach; „PEG przy dokupie pomaga”, gdy A > C w obu podokresach.

**Wynik etapu 116** (`r141_etap116.py`, `wyniki/r141_etap116.md`): reguła z protokołu **niespełniona** (A < B w 2013–19, A < C w obu podokresach). 2013–2026, gotówka
0 %: A 3,2 %/rok (średnio 81 % gotówki), B 5,4 %, C 8,2 %, D uśrednianie 15,3 % (4 % gotówki, obsunięcie −21 %), SPY 14,8 %; gotówka w SPY: A 14,1 %, B 14,0, C 15,0,
D 16,1, SPY 14,8. 2019–26: D 33–34 % (−37 %), A 18–25 %, SPY 16,5 %; 2013–19: D 12,6–13,2 % ≈ SPY 13,3 %. Główna przyczyna: warunki dokupu (PEG 0–2, ±7 %, raz
w miesiącu, krok 10 % celu) zostawiają większość wpłat w gotówce; PEG przy dokupie obniża wynik o ~1 pp (A vs C, gotówka w SPY). Ograniczenia: historyczny PEG
wśród BD brak w 2013–15 (0–1 spółek), mało spółek BD (7–32), dane PEG z przeszłego wzrostu. Tylko sprawdzenie — nic na stronę.

## Etap 117 — szukanie sposobu wyboru „dobra spółka w dobrej cenie” z podziałem na lata odkrywania i lata sprawdzające (protokół przed uruchomieniem, 2026-11-26)

Użytkownik: „przeprowadź badania, które wyłonią sposób wyceny spółki, który z dużym prawdopodobieństwem pokaże przyszły wzrost na podstawie fundamentów z lat
wcześniejszych; przetestuj wszystko, wszystkie kombinacje; zachowuj się jak inwestor na 10–20 lat”. Tylko sprawdzenie — nic na stronę bez decyzji użytkownika.
Ochrona przed przypadkiem (przy ~120 kombinacjach kilka „wygra” losowo): **odkrywanie** na startach 2012–2017, **sprawdzenie** tylko wybranych na startach
2018–2023 (36 mies.) / 2018–2021 (60 mies.), których przy wyborze nie oglądamy. Cel: nadwyżka zwrotu nad medianą zbioru (top 500 USA PIT bez wykluczonych sektorów).
- **Cechy** (styczeń, percentyl w zbiorze, kierunek ustalony z góry z teorii, brak = 0,5):
  jakość — Siła (etap 95), liczba kryteriów Jakość 7, ROE, ROA, ROCE, marże brutto / operacyjna / netto / FCF, D/E (−), zmiana liczby akcji (jak w Sile), przychody
  3 i 5 lat, lata z przychodami > 10 %, lata ze wzrostem zysku, lata z wysokim ROIC, zmiana ROE 3 lata, zmienność zysku (−), reguły Buffetta (marża brutto > 40 %,
  netto > 20 %, EPS 4/5, skoryg. D/E < 0,8, dług ≤ 4 × zysk, capex ÷ zysk (−), SG&A ÷ zysk brutto (−));
  wycena (wyżej = taniej) — V/P dochodu rezydualnego (etap 114), EBIT/EV, potencjał DCF (etap 113), 1/PEG, E/P, FCF/kapitalizacja, B/P, S/P, sprzedaż/EV,
  P/E względem własnej mediany 5 lat (−); moment — zwrot 12-1 mies. (+), zwrot 3 lata (−, odwrócenie długoterminowe).
- **Złożone z góry (teoria):** Q = średnia percentyli jakości, V = średnia percentyli wyceny, QV = (Q + V) / 2, QVM = (Q + V + zwrot 12-1) / 3;
  model liniowy (grzbietowy, λ = 10) na percentylach wszystkich cech, uczony tylko na latach odkrywania, cel = percentyl zwrotu 60 mies.
- **Kombinacje:** filtr jakości {wszystkie, Siła ≥ 7, Jakość 7/7, górne 30 % Q, Buffett 3 + 6 + 8} × wybór ceny {bez, górne 30 % każdej miary wyceny w filtrze, górne
  30 % V} × moment {bez, zwrot 12-1 w górnej połowie} = 120; miara w odkrywaniu: średnia po latach mediany nadwyżki 60 mies. (min. średnio 5 spółek).
- **Do sprawdzenia** idą: 5 najlepszych kombinacji z odkrywania + z góry: górne 20 % Q, V, QV, QVM i modelu. Sposób „działa”, gdy w latach sprawdzających
  nadwyżka 36 mies. > 0 z przedziałem bootstrap (po latach) bez 0 i nadwyżka 60 mies. > 0.
- Na końcu portfele top 20 (równe wagi, przegląd w styczniu, koszt 0,1 %) dla sposobów, które przeszły (albo najlepszych 3), 2012-01 → 2026-09 vs SPY, połowy.
