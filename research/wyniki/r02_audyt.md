# Etap 1: audyt danych

## A. Czyszczenie

| krok                                                                                             |   wiersze |   tickery |
|:-------------------------------------------------------------------------------------------------|----------:|----------:|
| wszystkie wiersze akcji zwykłych (prices_valid, bez adj = 999999,9999)                           | 100777906 |     50589 |
| adj skacze > 50 % bez ruchu close (błąd korekty)                                                 |      5469 |      2157 |
| filtr Hampela: cena > 3x od mediany 21 sesji                                                     |    224200 |     15028 |
| tickery z niemożliwymi obrotami (> 150 mld USD/dzień lub > 6 % rynku w roku)                     |   1964804 |       377 |
| duplikaty tickerów (ta sama data, close i wolumen w >= 20 dniach próbki)                         |   4819965 |      1411 |
| po czyszczeniu (widok dc)                                                                        |  93781225 |     47962 |
| po filtrze głównym: close >= 1, mediana obrotów 20 dni >= 1 mln USD, dni bez zmiany ceny <= 20 % |  25068817 |     20841 |

Obroty liczone z ceny skorygowanej tylko o splity (ps): wolumen w EODHD jest skorygowany o splity, a close nie (AAPL 2019-06-03: 161,6 mln akcji w bazie, ok. 40 mln faktycznie). Splity rozpoznane po skoku adj/close >= 20 % z przeciwnym skokiem close i ciągłą adj; ps ograniczone do [adj, 20·adj].

## B. Pokrycie po filtrze głównym

Liczba spółek w roku (co najmniej jeden dzień po filtrze) i suma obrotów.

|   rok |   gielda |   otc |   wycofane_pozniej |   obroty_bln_usd |
|------:|---------:|------:|-------------------:|-----------------:|
|  1985 |      235 |    17 |                 51 |              0.2 |
|  1986 |      322 |    25 |                 69 |              0.3 |
|  1987 |      347 |    34 |                 81 |              0.4 |
|  1988 |      291 |    20 |                 56 |              0.3 |
|  1989 |      338 |    23 |                 67 |              0.3 |
|  1990 |      332 |    26 |                 73 |              0.4 |
|  1991 |      416 |    35 |                 96 |              0.5 |
|  1992 |      500 |    52 |                127 |              0.7 |
|  1993 |      616 |    85 |                165 |              1   |
|  1994 |      637 |    91 |                184 |              1.2 |
|  1995 |      724 |   119 |                212 |              1.8 |
|  1996 |      882 |   176 |                297 |              2.9 |
|  1997 |     1013 |   183 |                339 |              4.7 |
|  1998 |     2920 |   268 |               2267 |             13.2 |
|  1999 |     3780 |   366 |               3140 |             30.9 |
|  2000 |     4068 |   484 |               3433 |             73.3 |
|  2001 |     3199 |   326 |               2478 |             33.3 |
|  2002 |     2936 |   270 |               2129 |             20.2 |
|  2003 |     3242 |   355 |               2400 |             24.7 |
|  2004 |     3732 |   518 |               2810 |             32.7 |
|  2005 |     3837 |   544 |               2846 |             34.6 |
|  2006 |     4040 |   639 |               2954 |             44.6 |
|  2007 |     4192 |   728 |               3074 |             58.1 |
|  2008 |     3706 |   589 |               2538 |             60.3 |
|  2009 |     3363 |   491 |               2148 |             44.8 |
|  2010 |     3673 |   555 |               2383 |             52.5 |
|  2011 |     3666 |   576 |               2338 |             52.6 |
|  2012 |     3590 |   477 |               2192 |             47.6 |
|  2013 |     3928 |   536 |               2374 |             52   |
|  2014 |     4327 |   643 |               2638 |             63.4 |
|  2015 |     4274 |   576 |               2494 |             66.8 |
|  2016 |     4292 |   562 |               2439 |             63.2 |
|  2017 |     4464 |   630 |               2448 |             63.1 |
|  2018 |     4522 |   766 |               2381 |             73.1 |
|  2019 |     4349 |   700 |               2069 |             62.9 |
|  2020 |     5311 |   860 |               2601 |             90   |
|  2021 |     6819 |  1210 |               3677 |            118.1 |
|  2022 |     5018 |   872 |               1818 |             86.1 |
|  2023 |     4409 |   598 |               1162 |             72.1 |
|  2024 |     4414 |   590 |                806 |             88.7 |
|  2025 |     4794 |   648 |                678 |            120.1 |

Klasy giełd w próbie uczącej 1995-2012 (giełda = ostatnia giełda notowań; spółki wycofane często kończą na OTC):

| klasa    |      dni |   udzial_obrotow |
|:---------|---------:|-----------------:|
| gielda   | 10232966 |           0.9218 |
| OTC      |   922733 |           0.0664 |
| nieznana |    47805 |           0.0118 |

## C. Skrajne zmiany dzienne po czyszczeniu (1995-2012, filtr główny)

Dni po filtrze: 11,203,504. "Wraca" = w 5 kolejnych sesjach cena wraca do 75-133 % ceny sprzed skoku. Dla porównania odsetek powrotów wśród ruchów o +-50..100 % pokazuje, jak często wracają ruchy prawdziwe.

| typ         |   n |   wraca | udzial_wraca (95 %)   |
|:------------|----:|--------:|:----------------------|
| +100..300 % | 288 |     110 | 0.382 (0.328-0.439)   |
| -50..-80 %  | 836 |     132 | 0.158 (0.135-0.184)   |
| < -80 %     | 382 |     154 | 0.403 (0.355-0.453)   |
| > +300 %    | 615 |     457 | 0.743 (0.707-0.776)   |

## D. Porównanie z Yahoo (300 losowych par spółka-rok z 1995-2012, ziarno 20261110)

| status       |   n |
|:-------------|----:|
| brak w Yahoo | 176 |
| ok           | 124 |

Wśród 124 porównanych: dzienne zwroty zgodne (różnica < 0,5 pp) w >= 95 % dni: 1.000 (0.970-1.000); mediana obrotów EODHD w przedziale 0,5-2x Yahoo: 0.960 (0.909-0.983).

Rozkład (kwantyle 5 / 25 / 50 / 75 / 95 %):

|   kwantyl |   zgodne_zwroty |   korelacja |   obroty_eodhd_do_yahoo |
|----------:|----------------:|------------:|------------------------:|
|      0.05 |           0.996 |           1 |                   0.802 |
|      0.25 |           1     |           1 |                   1     |
|      0.5  |           1     |           1 |                   1     |
|      0.75 |           1     |           1 |                   1     |
|      0.95 |           1     |           1 |                   1.004 |

Najgorsze przypadki:

| ticker   |   rok | status   |   zgodne_zwroty |   korelacja |   obroty_eodhd_do_yahoo |
|:---------|------:|:---------|----------------:|------------:|------------------------:|
| AGESY.US |  2007 | ok       |           0.992 |       0.999 |                  10.031 |
| FE.US    |  2000 | ok       |           0.992 |       0.999 |                   1     |
| AVTI.US  |  1999 | ok       |           0.992 |       0.988 |                  49.903 |
| PRAA.US  |  2003 | ok       |           0.992 |       0.999 |                   1.001 |
| MDRX.US  |  2008 | ok       |           0.992 |       0.22  |                   1     |
| ALL.US   |  1996 | ok       |           0.992 |       0.999 |                   1     |
| LYB.US   |  2012 | ok       |           0.996 |       1     |                   1     |
| NSIT.US  |  2002 | ok       |           0.996 |       1     |                   1     |
| LPL.US   |  2009 | ok       |           0.996 |       1     |                   1.047 |
| EQNR.US  |  2008 | ok       |           0.996 |       1     |                   1     |
