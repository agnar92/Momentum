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
