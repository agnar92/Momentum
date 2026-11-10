# Etap 1: audyt danych

## A. Czyszczenie

| krok                                                                                                  |   wiersze |   tickery |
|:------------------------------------------------------------------------------------------------------|----------:|----------:|
| wszystkie wiersze akcji zwykłych (prices_valid, bez adj = 999999,9999)                                | 100777906 |     50589 |
| adj skacze > 50 % bez ruchu close (błąd korekty)                                                      |      5469 |      2157 |
| filtr Hampela: cena > 3x od mediany 21 sesji                                                          |    224200 |     15028 |
| lata spółek z niemożliwymi obrotami (> 150 mld USD/dzień lub > 10 % rynku; tickery = pary ticker-rok) |    204204 |      1007 |
| duplikaty tickerów (ta sama data, close i wolumen w >= 20 dniach próbki)                              |   4819965 |      1411 |
| po czyszczeniu (widok dc)                                                                             |  95310406 |     48313 |
| po filtrze głównym: close >= 1, mediana obrotów 20 dni >= 1 mln USD, dni bez zmiany ceny <= 20 %      |  26099604 |     21102 |

Obroty liczone z ceny skorygowanej tylko o splity (ps): wolumen w EODHD jest skorygowany o splity, a close nie (AAPL 2019-06-03: 161,6 mln akcji w bazie, ok. 40 mln faktycznie). Splity rozpoznane po skoku adj/close >= 20 % z przeciwnym skokiem close i ciągłą adj; ps ograniczone do [adj, 20·adj].

## B. Pokrycie po filtrze głównym

Liczba spółek w roku (co najmniej jeden dzień po filtrze) i suma obrotów.

|   rok |   gielda |   otc |   wycofane_pozniej |   obroty_bln_usd |
|------:|---------:|------:|-------------------:|-----------------:|
|  1985 |      297 |    21 |                 60 |              0.5 |
|  1986 |      382 |    31 |                 79 |              0.8 |
|  1987 |      408 |    42 |                 92 |              1.3 |
|  1988 |      355 |    30 |                 69 |              1   |
|  1989 |      402 |    33 |                 79 |              0.9 |
|  1990 |      396 |    34 |                 84 |              0.9 |
|  1991 |      480 |    44 |                110 |              1.3 |
|  1992 |      564 |    63 |                143 |              1.5 |
|  1993 |      680 |    96 |                182 |              2.2 |
|  1994 |      703 |   104 |                204 |              2.7 |
|  1995 |      794 |   132 |                235 |              4.8 |
|  1996 |      953 |   192 |                320 |              7.1 |
|  1997 |     1085 |   199 |                365 |             13   |
|  1998 |     2997 |   285 |               2297 |             24.5 |
|  1999 |     3871 |   379 |               3179 |             50.8 |
|  2000 |     4153 |   500 |               3469 |            107.7 |
|  2001 |     3288 |   341 |               2515 |             52.8 |
|  2002 |     3025 |   283 |               2165 |             36.5 |
|  2003 |     3335 |   371 |               2442 |             44.6 |
|  2004 |     3825 |   536 |               2852 |             56.6 |
|  2005 |     3934 |   560 |               2892 |             60.8 |
|  2006 |     4139 |   656 |               3002 |             84.4 |
|  2007 |     4290 |   745 |               3118 |             75.7 |
|  2008 |     3802 |   605 |               2580 |             77.3 |
|  2009 |     3454 |   505 |               2184 |             72.8 |
|  2010 |     3773 |   573 |               2431 |             77.4 |
|  2011 |     3768 |   589 |               2384 |             79.1 |
|  2012 |     3696 |   495 |               2247 |             79.1 |
|  2013 |     4034 |   552 |               2427 |             81.3 |
|  2014 |     4436 |   660 |               2691 |             89.2 |
|  2015 |     4396 |   595 |               2560 |             95.4 |
|  2016 |     4421 |   581 |               2513 |             98.7 |
|  2017 |     4591 |   647 |               2517 |            113.2 |
|  2018 |     4659 |   785 |               2457 |            129   |
|  2019 |     4482 |   714 |               2139 |            104.9 |
|  2020 |     5435 |   874 |               2666 |            127.1 |
|  2021 |     6915 |  1222 |               3710 |            143.2 |
|  2022 |     5132 |   882 |               1862 |            108.5 |
|  2023 |     4495 |   605 |               1179 |             92.2 |
|  2024 |     4500 |   600 |                821 |            113   |
|  2025 |     4875 |   659 |                686 |            147.7 |

Klasy giełd w próbie uczącej 1995-2012 (giełda = ostatnia giełda notowań; spółki wycofane często kończą na OTC):

| klasa    |      dni |   udzial_obrotow |
|:---------|---------:|-----------------:|
| gielda   | 10601860 |           0.8697 |
| OTC      |   960970 |           0.1213 |
| nieznana |    48237 |           0.009  |

## C. Skrajne zmiany dzienne po czyszczeniu (1995-2012, filtr główny)

Dni po filtrze: 11,611,067. "Wraca" = w 5 kolejnych sesjach cena wraca do 75-133 % ceny sprzed skoku. Dla porównania odsetek powrotów wśród ruchów o +-50..100 % pokazuje, jak często wracają ruchy prawdziwe.

| typ         |   n |   wraca | udzial_wraca (95 %)   |
|:------------|----:|--------:|:----------------------|
| +100..300 % | 306 |     115 | 0.376 (0.323-0.431)   |
| -50..-80 %  | 849 |     130 | 0.153 (0.130-0.179)   |
| < -80 %     | 201 |       3 | 0.015 (0.005-0.043)   |
| > +300 %    |  87 |       6 | 0.069 (0.032-0.142)   |

## D. Porównanie z Yahoo (300 losowych par spółka-rok z 1995-2012, ziarno 20261110)

| status       |   n |
|:-------------|----:|
| brak w Yahoo | 174 |
| ok           | 126 |

Wśród 126 porównanych: dzienne zwroty zgodne (różnica < 0,5 pp) w >= 95 % dni: 0.976 (0.932-0.992); mediana obrotów EODHD w przedziale 0,5-2x Yahoo: 0.976 (0.932-0.992).

Rozkład (kwantyle 5 / 25 / 50 / 75 / 95 %):

|   kwantyl |   zgodne_zwroty |   korelacja |   obroty_eodhd_do_yahoo |
|----------:|----------------:|------------:|------------------------:|
|      0.05 |               1 |           1 |                   0.82  |
|      0.25 |               1 |           1 |                   1     |
|      0.5  |               1 |           1 |                   1     |
|      0.75 |               1 |           1 |                   1     |
|      0.95 |               1 |           1 |                   1.022 |

Najgorsze przypadki:

| ticker      |   rok | status   |   zgodne_zwroty |   korelacja |   obroty_eodhd_do_yahoo |
|:------------|------:|:---------|----------------:|------------:|------------------------:|
| ACRU.US     |  1999 | ok       |           0.057 |      -0.135 |                 nan     |
| ENDO_old.US |  2002 | ok       |           0.108 |       0.031 |               49417.4   |
| HTHIY.US    |  2012 | ok       |           0.607 |       0.725 |                   0.999 |
| ADBE.US     |  2001 | ok       |           0.992 |       1     |                   1     |
| IX.US       |  2009 | ok       |           0.992 |       0.992 |                   1     |
| TRP.US      |  2003 | ok       |           0.996 |       0.999 |                   1     |
| BA.US       |  2001 | ok       |           1     |       1     |                   1     |
| CHD.US      |  2010 | ok       |           1     |       1     |                   1     |
| AZZ.US      |  2008 | ok       |           1     |       1     |                   1     |
| PRXIQ.US    |  2007 | ok       |           1     |       1     |                   1     |
