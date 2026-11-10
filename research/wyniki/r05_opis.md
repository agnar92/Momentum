# Etap 3: opis statystyczny ruchów (próba ucząca, wybicia 1998-2012)

## Próg odwrócenia Y = 25 %

Wybić w ruchach w górę (płynnych w tygodniu wybicia): 22,673; zakończonych w próbie: 20,926; uciętych: 1,747; niezależnych miesięcy wybicia: 180.

### (a) Wszystkie wybicia (zakończone ruchy)

| miara                                                    |               | wartość (95 %)      |
|:---------------------------------------------------------|:--------------|:--------------------|
| zysk wybicie->szczyt [%]                                 | 10. percentyl | 0.0 (0.0-0.0)       |
| zysk wybicie->szczyt [%]                                 | 25. percentyl | 6.7 (5.1-8.2)       |
| zysk wybicie->szczyt [%]                                 | 50. percentyl | 24.1 (20.5-28.6)    |
| zysk wybicie->szczyt [%]                                 | 75. percentyl | 63.9 (55.1-72.5)    |
| zysk wybicie->szczyt [%]                                 | 90. percentyl | 136.8 (122.1-152.2) |
| tygodnie wybicie->szczyt                                 | 10. percentyl | 0.0 (0.0-0.0)       |
| tygodnie wybicie->szczyt                                 | 25. percentyl | 3.0 (2.0-3.0)       |
| tygodnie wybicie->szczyt                                 | 50. percentyl | 12.0 (10.0-15.0)    |
| tygodnie wybicie->szczyt                                 | 75. percentyl | 38.0 (32.0-44.0)    |
| tygodnie wybicie->szczyt                                 | 90. percentyl | 88.0 (73.0-101.0)   |
| zysk wybicie->szczyt [%]                                 | średnia       | 75.0 (61.1-94.9)    |
| odsetek wybić kończących się zyskiem >= 30 % do szczytu  |               | 44.6 (40.6-48.5)    |
| odsetek wybić kończących się zyskiem >= 50 % do szczytu  |               | 31.1 (27.3-34.9)    |
| odsetek wybić kończących się zyskiem >= 100 % do szczytu |               | 15.2 (13.0-17.5)    |

Zysk do szczytu to górna granica: realne wyjście jest zawsze po spadku od szczytu.

### Jak długo wybicie "żyje" (Kaplan-Meier, z ucięciem)

|   tygodnie od wybicia | odsetek ruchów jeszcze przed szczytem   |
|----------------------:|:----------------------------------------|
|                     4 | 71.0 (67.8-73.8)                        |
|                     8 | 60.9 (56.9-64.2)                        |
|                    13 | 52.5 (48.2-56.3)                        |
|                    26 | 38.3 (33.1-42.4)                        |
|                    52 | 23.5 (19.7-27.6)                        |
|                   104 | 12.3 (9.5-15.1)                         |

Mediana czasu do szczytu: 15 tyg.

Hazard (szansa, że szczyt przypada w danym tygodniu, jeśli ruch dotrwał do początku przedziału):

| przedział tygodni   |   w ryzyku |   szczytów |   hazard na tydzień |
|:--------------------|-----------:|-----------:|--------------------:|
| 0-4                 |      22673 |       5876 |              0.0648 |
| 4-8                 |      16790 |       2501 |              0.0372 |
| 8-13                |      14280 |       2089 |              0.0293 |
| 13-26               |      12187 |       3310 |              0.0209 |
| 26-52               |       8851 |       3315 |              0.0144 |
| 52-104              |       5073 |       2221 |              0.0084 |
| 104-...             |       2128 |       1614 |              0.0049 |

Weibull: kształt k = 0.608, skala = 30.0 tyg. (95 % blokowo: 0.583-0.632); test ilorazu wiarygodności vs wykładniczy: LR = 10891.0 (1 st. swobody). k < 1: hazard maleje z wiekiem ruchu.

### (b) Tylko ruchy, które okazały się duże (dołek->szczyt)

| ruch     |     n |   miesięcy | mediana tygodni wybicie->szczyt (95 %)   | mediana zysku wybicie->szczyt (95 %)   |   mediana tygodni dołek->wybicie |
|:---------|------:|-----------:|:-----------------------------------------|:---------------------------------------|---------------------------------:|
| >= 30 %  | 20926 |        180 | 12 (10-15)                               | 24.1 (20.4-28.2)                       |                               14 |
| >= 50 %  | 18029 |        180 | 16 (13-19)                               | 31.8 (27.8-36.1)                       |                               14 |
| >= 100 % | 10267 |        180 | 26 (21-32)                               | 64.8 (60.2-69.5)                       |                               13 |

### Po latach (Y = 25 %, zakończone)

|   rok |   wybic |   duze50 |   mediana_zysku |   mediana_tyg |   udzial_duzych |
|------:|--------:|---------:|----------------:|--------------:|----------------:|
|  1998 |    1007 |      855 |           0.155 |             7 |           0.849 |
|  1999 |    1780 |     1622 |           0.3   |            11 |           0.911 |
|  2000 |    1853 |     1691 |           0.252 |             7 |           0.913 |
|  2001 |    1376 |     1202 |           0.153 |             8 |           0.874 |
|  2002 |    1056 |      889 |           0.139 |             8 |           0.842 |
|  2003 |    1790 |     1729 |           0.656 |            39 |           0.966 |
|  2004 |    1119 |      956 |           0.248 |            14 |           0.854 |
|  2005 |    1130 |      981 |           0.339 |            25 |           0.868 |
|  2006 |    1535 |     1272 |           0.272 |            25 |           0.829 |
|  2007 |    1017 |      746 |           0.173 |            12 |           0.734 |
|  2008 |    1353 |      901 |           0.081 |             4 |           0.666 |
|  2009 |    2620 |     2531 |           0.487 |            33 |           0.966 |
|  2010 |    1591 |     1341 |           0.245 |            14 |           0.843 |
|  2011 |     553 |      442 |           0.15  |             8 |           0.799 |
|  2012 |    1146 |      871 |           0.093 |             4 |           0.76  |

## Próg odwrócenia Y = 15 %

Wybić w ruchach w górę (płynnych w tygodniu wybicia): 37,824; zakończonych w próbie: 36,646; uciętych: 1,178; niezależnych miesięcy wybicia: 180.

### (a) Wszystkie wybicia (zakończone ruchy)

| miara                                                    |               | wartość (95 %)   |
|:---------------------------------------------------------|:--------------|:-----------------|
| zysk wybicie->szczyt [%]                                 | 10. percentyl | 0.0 (0.0-0.0)    |
| zysk wybicie->szczyt [%]                                 | 25. percentyl | 2.8 (2.1-3.7)    |
| zysk wybicie->szczyt [%]                                 | 50. percentyl | 14.2 (12.4-15.9) |
| zysk wybicie->szczyt [%]                                 | 75. percentyl | 36.6 (33.2-40.1) |
| zysk wybicie->szczyt [%]                                 | 90. percentyl | 74.1 (67.0-80.6) |
| tygodnie wybicie->szczyt                                 | 10. percentyl | 0.0 (0.0-0.0)    |
| tygodnie wybicie->szczyt                                 | 25. percentyl | 1.0 (1.0-2.0)    |
| tygodnie wybicie->szczyt                                 | 50. percentyl | 7.0 (6.0-8.0)    |
| tygodnie wybicie->szczyt                                 | 75. percentyl | 19.0 (17.0-22.0) |
| tygodnie wybicie->szczyt                                 | 90. percentyl | 40.0 (37.0-45.0) |
| zysk wybicie->szczyt [%]                                 | średnia       | 39.0 (30.7-51.0) |
| odsetek wybić kończących się zyskiem >= 30 % do szczytu  |               | 30.5 (27.7-33.2) |
| odsetek wybić kończących się zyskiem >= 50 % do szczytu  |               | 17.3 (15.2-19.4) |
| odsetek wybić kończących się zyskiem >= 100 % do szczytu |               | 5.9 (5.0-6.9)    |

Zysk do szczytu to górna granica: realne wyjście jest zawsze po spadku od szczytu.

### Jak długo wybicie "żyje" (Kaplan-Meier, z ucięciem)

|   tygodnie od wybicia |   odsetek ruchów jeszcze przed szczytem |
|----------------------:|----------------------------------------:|
|                     4 |                                    59.4 |
|                     8 |                                    45.9 |
|                    13 |                                    35.1 |
|                    26 |                                    20.5 |
|                    52 |                                     8.7 |
|                   104 |                                     3.3 |

Mediana czasu do szczytu: 7 tyg.

Hazard (szansa, że szczyt przypada w danym tygodniu, jeśli ruch dotrwał do początku przedziału):

| przedział tygodni   |   w ryzyku |   szczytów |   hazard na tydzień |
|:--------------------|-----------:|-----------:|--------------------:|
| 0-4                 |      37824 |      13707 |              0.0906 |
| 4-8                 |      24110 |       5672 |              0.0588 |
| 8-13                |      18435 |       4560 |              0.0495 |
| 13-26               |      13868 |       5788 |              0.0321 |
| 26-52               |       8050 |       4491 |              0.0215 |
| 52-104              |       3020 |       1695 |              0.0108 |
| 104-...             |        874 |        733 |              0.0054 |

Weibull: kształt k = 0.653, skala = 13.6 tyg.; test ilorazu wiarygodności vs wykładniczy: LR = 14574.5 (1 st. swobody). k < 1: hazard maleje z wiekiem ruchu.

### (b) Tylko ruchy, które okazały się duże (dołek->szczyt)

| ruch     |     n |   miesięcy | mediana tygodni wybicie->szczyt (95 %)   | mediana zysku wybicie->szczyt (95 %)   |   mediana tygodni dołek->wybicie |
|:---------|------:|-----------:|:-----------------------------------------|:---------------------------------------|---------------------------------:|
| >= 30 %  | 32693 |        180 | 8 (7-9)                                  | 17.5 (15.8-19.3)                       |                               10 |
| >= 50 %  | 23043 |        180 | 11 (9-12)                                | 28.7 (26.7-30.8)                       |                               10 |
| >= 100 % |  9270 |        180 | 16 (13-19)                               | 61.8 (58.1-65.9)                       |                                9 |

## Próg odwrócenia Y = 35 %

Wybić w ruchach w górę (płynnych w tygodniu wybicia): 14,503; zakończonych w próbie: 12,645; uciętych: 1,858; niezależnych miesięcy wybicia: 180.

### (a) Wszystkie wybicia (zakończone ruchy)

| miara                                                    |               | wartość (95 %)      |
|:---------------------------------------------------------|:--------------|:--------------------|
| zysk wybicie->szczyt [%]                                 | 10. percentyl | 0.0 (0.0-1.4)       |
| zysk wybicie->szczyt [%]                                 | 25. percentyl | 12.5 (10.2-15.1)    |
| zysk wybicie->szczyt [%]                                 | 50. percentyl | 39.8 (33.9-46.7)    |
| zysk wybicie->szczyt [%]                                 | 75. percentyl | 102.1 (90.1-114.0)  |
| zysk wybicie->szczyt [%]                                 | 90. percentyl | 219.2 (194.6-241.1) |
| tygodnie wybicie->szczyt                                 | 10. percentyl | 0.0 (0.0-1.0)       |
| tygodnie wybicie->szczyt                                 | 25. percentyl | 5.0 (3.0-6.0)       |
| tygodnie wybicie->szczyt                                 | 50. percentyl | 21.0 (16.0-27.0)    |
| tygodnie wybicie->szczyt                                 | 75. percentyl | 64.0 (54.0-77.0)    |
| tygodnie wybicie->szczyt                                 | 90. percentyl | 151.0 (119.0-184.0) |
| zysk wybicie->szczyt [%]                                 | średnia       | 165.9 (99.1-288.9)  |
| odsetek wybić kończących się zyskiem >= 30 % do szczytu  |               | 57.2 (53.0-61.1)    |
| odsetek wybić kończących się zyskiem >= 50 % do szczytu  |               | 43.6 (39.4-47.8)    |
| odsetek wybić kończących się zyskiem >= 100 % do szczytu |               | 25.4 (22.3-28.4)    |

Zysk do szczytu to górna granica: realne wyjście jest zawsze po spadku od szczytu.

### Jak długo wybicie "żyje" (Kaplan-Meier, z ucięciem)

|   tygodnie od wybicia |   odsetek ruchów jeszcze przed szczytem |
|----------------------:|----------------------------------------:|
|                     4 |                                    78.6 |
|                     8 |                                    71   |
|                    13 |                                    64.1 |
|                    26 |                                    52.1 |
|                    52 |                                    38.2 |
|                   104 |                                    23.4 |

Mediana czasu do szczytu: 30 tyg.

Hazard (szansa, że szczyt przypada w danym tygodniu, jeśli ruch dotrwał do początku przedziału):

| przedział tygodni   |   w ryzyku |   szczytów |   hazard na tydzień |
|:--------------------|-----------:|-----------:|--------------------:|
| 0-4                 |      14503 |       2779 |              0.0479 |
| 4-8                 |      11710 |       1168 |              0.0249 |
| 8-13                |      10535 |       1099 |              0.0209 |
| 13-26               |       9433 |       1772 |              0.0145 |
| 26-52               |       7645 |       2019 |              0.0102 |
| 52-104              |       5358 |       1928 |              0.0069 |
| 104-...             |       2840 |       1880 |              0.0042 |

Weibull: kształt k = 0.596, skala = 57.6 tyg.; test ilorazu wiarygodności vs wykładniczy: LR = 6699.6 (1 st. swobody). k < 1: hazard maleje z wiekiem ruchu.

### (b) Tylko ruchy, które okazały się duże (dołek->szczyt)

| ruch     |     n |   miesięcy | mediana tygodni wybicie->szczyt (95 %)   | mediana zysku wybicie->szczyt (95 %)   |   mediana tygodni dołek->wybicie |
|:---------|------:|-----------:|:-----------------------------------------|:---------------------------------------|---------------------------------:|
| >= 30 %  | 12645 |        180 | 21 (16-26)                               | 39.8 (33.8-45.8)                       |                               16 |
| >= 50 %  | 12645 |        180 | 21 (16-27)                               | 39.8 (33.8-45.6)                       |                               16 |
| >= 100 % |  8742 |        179 | 34 (27-40)                               | 69.9 (63.0-76.1)                       |                               16 |
