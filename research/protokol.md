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
