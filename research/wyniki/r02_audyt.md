# Etap 1: audyt danych

## A. Czyszczenie

| krok                                                                                             |   wiersze |   tickery |
|:-------------------------------------------------------------------------------------------------|----------:|----------:|
| wszystkie wiersze akcji zwykłych (prices_valid, bez adj = 999999,9999)                           | 100777906 |     50589 |
| adj skacze > 50 % bez ruchu close (błąd korekty)                                                 |      5469 |      2157 |
| filtr Hampela: cena > 3x od mediany 21 sesji                                                     |    224200 |     15028 |
| tickery z niemożliwymi obrotami (> 150 mld USD/dzień lub > 6 % rynku w roku)                     |   1964804 |       377 |
| duplikaty tickerów (ta sama data, close i wolumen w >= 20 dniach próbki)                         |   4819965 |      1411 |
| po czyszczeniu (widok dc)                                                                        |  93597542 |     47960 |
| po filtrze głównym: close >= 1, mediana obrotów 20 dni >= 1 mln USD, dni bez zmiany ceny <= 20 % |  25063494 |     20837 |

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
|  2004 |     3731 |   518 |               2809 |             32.6 |
|  2005 |     3836 |   544 |               2845 |             34.5 |
|  2006 |     4039 |   638 |               2953 |             44.6 |
|  2007 |     4192 |   728 |               3074 |             58.1 |
|  2008 |     3706 |   589 |               2537 |             60.3 |
|  2009 |     3361 |   491 |               2146 |             44.8 |
|  2010 |     3672 |   555 |               2382 |             51.7 |
|  2011 |     3666 |   575 |               2337 |             52.5 |
|  2012 |     3590 |   477 |               2192 |             47.4 |
|  2013 |     3927 |   535 |               2373 |             52   |
|  2014 |     4325 |   643 |               2636 |             63.4 |
|  2015 |     4273 |   576 |               2492 |             66.8 |
|  2016 |     4290 |   562 |               2435 |             63.2 |
|  2017 |     4460 |   630 |               2444 |             63.1 |
|  2018 |     4522 |   766 |               2380 |             73.1 |
|  2019 |     4349 |   700 |               2068 |             62.8 |
|  2020 |     5311 |   859 |               2600 |             90   |
|  2021 |     6819 |  1210 |               3677 |            118   |
|  2022 |     5018 |   872 |               1818 |             86.1 |
|  2023 |     4409 |   598 |               1162 |             72.1 |
|  2024 |     4414 |   590 |                806 |             88.7 |
|  2025 |     4794 |   648 |                678 |            120.1 |

Klasy giełd w próbie uczącej 1995-2012 (giełda = ostatnia giełda notowań; spółki wycofane często kończą na OTC):

| klasa    |      dni |   udzial_obrotow |
|:---------|---------:|-----------------:|
| gielda   | 10230863 |           0.9228 |
| OTC      |   922543 |           0.0653 |
| nieznana |    47774 |           0.0118 |

## C. Skrajne zmiany dzienne po czyszczeniu (1995-2012, filtr główny)

Dni po filtrze: 11,201,180. "Wraca" = w 5 kolejnych sesjach cena wraca do 75-133 % ceny sprzed skoku. Dla porównania odsetek powrotów wśród ruchów o +-50..100 % pokazuje, jak często wracają ruchy prawdziwe.

| typ         |   n |   wraca | udzial_wraca (95 %)   |
|:------------|----:|--------:|:----------------------|
| +100..300 % | 285 |     108 | 0.379 (0.325-0.437)   |
| -50..-80 %  | 830 |     128 | 0.154 (0.131-0.180)   |
| < -80 %     | 187 |       3 | 0.016 (0.005-0.046)   |
| > +300 %    |  81 |       6 | 0.074 (0.034-0.152)   |

## D. Porównanie z Yahoo (300 losowych par spółka-rok z 1995-2012, ziarno 20261110)

| status       |   n |
|:-------------|----:|
| brak w Yahoo | 185 |
| ok           | 115 |

Wśród 115 porównanych: dzienne zwroty zgodne (różnica < 0,5 pp) w >= 95 % dni: 0.991 (0.952-0.998); mediana obrotów EODHD w przedziale 0,5-2x Yahoo: 0.948 (0.891-0.976).

Rozkład (kwantyle 5 / 25 / 50 / 75 / 95 %):

|   kwantyl |   zgodne_zwroty |   korelacja |   obroty_eodhd_do_yahoo |
|----------:|----------------:|------------:|------------------------:|
|      0.05 |           0.996 |           1 |                   0.721 |
|      0.25 |           1     |           1 |                   1     |
|      0.5  |           1     |           1 |                   1     |
|      0.75 |           1     |           1 |                   1     |
|      0.95 |           1     |           1 |                   1.139 |

Najgorsze przypadki:

| ticker    |   rok | status   |   zgodne_zwroty |   korelacja |   obroty_eodhd_do_yahoo |
|:----------|------:|:---------|----------------:|------------:|------------------------:|
| EP_old.US |  2008 | ok       |           0.091 |      -0.005 |             2.07012e+06 |
| LEN-B.US  |  2003 | ok       |           0.989 |       1     |             0.974       |
| RINO.US   |  2010 | ok       |           0.992 |       0.997 |             1.001       |
| UL.US     |  2001 | ok       |           0.996 |       0.999 |             0.889       |
| TTE.US    |  2006 | ok       |           0.996 |       0.996 |             1           |
| FHN.US    |  1995 | ok       |           0.996 |       0.957 |             1.047       |
| SNT.US    |  2004 | ok       |           0.996 |       0.999 |             0.799       |
| ABM.US    |  2009 | ok       |           1     |       1     |             1           |
| MYGN.US   |  2007 | ok       |           1     |       1     |             1           |
| HUBG.US   |  2012 | ok       |           1     |       1     |             1           |
