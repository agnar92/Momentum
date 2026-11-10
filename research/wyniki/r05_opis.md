# Etap 3: opis statystyczny ruchów (próba ucząca, wybicia 1998-2012)

## Próg trailing stopu / końca ruchu Y = 25 %

Świeżych wybić (płynnych): 69,379; zakończonych w próbie: 60,781; uciętych na 2013-06-30: 8,598; niezależnych miesięcy: 180.

### (a) Wszystkie świeże wybicia: zysk i czas do szczytu (zakończone)

| miara                               |               | wartość (95 %)      |
|:------------------------------------|:--------------|:--------------------|
| zysk wybicie->szczyt [%]            | 10. percentyl | 0.0 (0.0-0.2)       |
| zysk wybicie->szczyt [%]            | 25. percentyl | 6.6 (5.3-7.8)       |
| zysk wybicie->szczyt [%]            | 50. percentyl | 23.7 (20.9-26.8)    |
| zysk wybicie->szczyt [%]            | 75. percentyl | 61.0 (54.9-67.3)    |
| zysk wybicie->szczyt [%]            | 90. percentyl | 127.3 (116.1-138.0) |
| tygodnie wybicie->szczyt            | 10. percentyl | 0.0 (0.0-1.0)       |
| tygodnie wybicie->szczyt            | 25. percentyl | 4.0 (3.0-5.0)       |
| tygodnie wybicie->szczyt            | 50. percentyl | 19.0 (16.0-22.0)    |
| tygodnie wybicie->szczyt            | 75. percentyl | 55.0 (48.0-64.0)    |
| tygodnie wybicie->szczyt            | 90. percentyl | 121.0 (105.0-140.0) |
| zysk wybicie->szczyt [%]            | średnia       | 68.0 (58.3-79.2)    |
| odsetek wybić ze szczytem >= +30 %  |               | 43.9 (40.7-46.9)    |
| odsetek wybić ze szczytem >= +50 %  |               | 30.1 (27.4-32.9)    |
| odsetek wybić ze szczytem >= +100 % |               | 14.0 (12.4-15.7)    |

Zysk do szczytu to górna granica zysku; po szczycie cena spada o Y, zanim ruch uznamy za zakończony.

### Czas życia ruchu (trzymanie z trailing stopem 25 %), Kaplan-Meier z ucięciem

|   tygodnie od wybicia | odsetek ruchów wciąż żywych (95 %)   |
|----------------------:|:-------------------------------------|
|                     4 | 96.5 (95.5-97.3)                     |
|                     8 | 90.3 (88.4-91.9)                     |
|                    13 | 82.2 (79.5-84.1)                     |
|                    26 | 64.4 (61.0-67.5)                     |
|                    52 | 43.5 (40.0-46.4)                     |
|                   104 | 24.6 (21.7-27.6)                     |

Mediana czasu życia: 42 tyg.

Hazard końca ruchu (szansa końca na tydzień, jeśli ruch dotrwał do początku przedziału):

| przedział tygodni   |   w ryzyku |   końców |   hazard na tydzień |
|:--------------------|-----------:|---------:|--------------------:|
| 0-4                 |      69379 |     2436 |              0.0088 |
| 4-8                 |      66943 |     4275 |              0.016  |
| 8-13                |      62668 |     5666 |              0.0181 |
| 13-26               |      57002 |    12341 |              0.0167 |
| 26-52               |      44275 |    13981 |              0.0121 |
| 52-104              |      28087 |    11445 |              0.0078 |
| 104-...             |      13930 |    10637 |              0.0049 |

Weibull: kształt k = 0.933 (95 % blokowo: 0.897-0.971), skala = 73.8 tyg.; LR vs wykładniczy = 526.1. k < 1: im dłużej ruch trwa, tym mniejsza szansa końca w kolejnym tygodniu.

### Po latach (Y = 25 %, zakończone)

|   rok |   wybic |   szczyt50 |   mediana_zysku |   mediana_zycia |
|------:|--------:|-----------:|----------------:|----------------:|
|  1998 |    1346 |      0.199 |           0.164 |              27 |
|  1999 |    3061 |      0.361 |           0.25  |              22 |
|  2000 |    3648 |      0.289 |           0.233 |              20 |
|  2001 |    3208 |      0.251 |           0.187 |              28 |
|  2002 |    2717 |      0.293 |           0.145 |              23 |
|  2003 |    5446 |      0.579 |           0.634 |              78 |
|  2004 |    5497 |      0.431 |           0.393 |              79 |
|  2005 |    5467 |      0.407 |           0.373 |              62 |
|  2006 |    6232 |      0.253 |           0.252 |              57 |
|  2007 |    6118 |      0.143 |           0.134 |              31 |
|  2008 |    2974 |      0.043 |           0.059 |              14 |
|  2009 |    5106 |      0.438 |           0.421 |              47 |
|  2010 |    5019 |      0.247 |           0.246 |              39 |
|  2011 |    3076 |      0.089 |           0.08  |              20 |
|  2012 |    1866 |      0.101 |           0.08  |              17 |

## Próg trailing stopu / końca ruchu Y = 15 %

Świeżych wybić (płynnych): 69,379; zakończonych w próbie: 65,497; uciętych na 2013-06-30: 3,882; niezależnych miesięcy: 180.

### (a) Wszystkie świeże wybicia: zysk i czas do szczytu (zakończone)

| miara                               |               | wartość (95 %)   |
|:------------------------------------|:--------------|:-----------------|
| zysk wybicie->szczyt [%]            | 10. percentyl | 0.0 (0.0-0.0)    |
| zysk wybicie->szczyt [%]            | 25. percentyl | 3.6 (2.8-4.4)    |
| zysk wybicie->szczyt [%]            | 50. percentyl | 14.6 (13.0-16.3) |
| zysk wybicie->szczyt [%]            | 75. percentyl | 36.0 (33.2-38.9) |
| zysk wybicie->szczyt [%]            | 90. percentyl | 70.9 (65.7-76.5) |
| tygodnie wybicie->szczyt            | 10. percentyl | 0.0 (0.0-0.0)    |
| tygodnie wybicie->szczyt            | 25. percentyl | 2.0 (2.0-3.0)    |
| tygodnie wybicie->szczyt            | 50. percentyl | 9.0 (8.0-11.0)   |
| tygodnie wybicie->szczyt            | 75. percentyl | 26.0 (23.0-29.0) |
| tygodnie wybicie->szczyt            | 90. percentyl | 55.0 (50.0-61.0) |
| zysk wybicie->szczyt [%]            | średnia       | 38.9 (31.9-47.7) |
| odsetek wybić ze szczytem >= +30 %  |               | 30.1 (27.7-32.6) |
| odsetek wybić ze szczytem >= +50 %  |               | 16.7 (15.0-18.6) |
| odsetek wybić ze szczytem >= +100 % |               | 5.3 (4.6-6.1)    |

Zysk do szczytu to górna granica zysku; po szczycie cena spada o Y, zanim ruch uznamy za zakończony.

### Czas życia ruchu (trzymanie z trailing stopem 15 %), Kaplan-Meier z ucięciem

|   tygodnie od wybicia |   odsetek ruchów wciąż żywych (95 %) |
|----------------------:|-------------------------------------:|
|                     4 |                                 89   |
|                     8 |                                 75.3 |
|                    13 |                                 61.1 |
|                    26 |                                 38.2 |
|                    52 |                                 18.6 |
|                   104 |                                  7.5 |

Mediana czasu życia: 19 tyg.

Hazard końca ruchu (szansa końca na tydzień, jeśli ruch dotrwał do początku przedziału):

| przedział tygodni   |   w ryzyku |   końców |   hazard na tydzień |
|:--------------------|-----------:|---------:|--------------------:|
| 0-4                 |      69379 |     7649 |              0.0276 |
| 4-8                 |      61730 |     9516 |              0.0385 |
| 8-13                |      52214 |     9839 |              0.0377 |
| 13-26               |      42375 |    15884 |              0.0288 |
| 26-52               |      26199 |    13021 |              0.0191 |
| 52-104              |      11735 |     6489 |              0.0106 |
| 104-...             |       3951 |     3099 |              0.005  |

Weibull: kształt k = 0.902, skala = 32.9 tyg.; LR vs wykładniczy = 1372.4. k < 1: im dłużej ruch trwa, tym mniejsza szansa końca w kolejnym tygodniu.

## Próg trailing stopu / końca ruchu Y = 35 %

Świeżych wybić (płynnych): 69,379; zakończonych w próbie: 55,373; uciętych na 2013-06-30: 14,006; niezależnych miesięcy: 180.

### (a) Wszystkie świeże wybicia: zysk i czas do szczytu (zakończone)

| miara                               |               | wartość (95 %)      |
|:------------------------------------|:--------------|:--------------------|
| zysk wybicie->szczyt [%]            | 10. percentyl | 0.4 (0.0-1.2)       |
| zysk wybicie->szczyt [%]            | 25. percentyl | 9.1 (7.5-10.8)      |
| zysk wybicie->szczyt [%]            | 50. percentyl | 31.9 (28.0-35.9)    |
| zysk wybicie->szczyt [%]            | 75. percentyl | 83.0 (74.5-91.5)    |
| zysk wybicie->szczyt [%]            | 90. percentyl | 177.0 (160.1-194.6) |
| tygodnie wybicie->szczyt            | 10. percentyl | 1.0 (0.0-1.0)       |
| tygodnie wybicie->szczyt            | 25. percentyl | 6.0 (5.0-8.0)       |
| tygodnie wybicie->szczyt            | 50. percentyl | 29.0 (25.0-35.0)    |
| tygodnie wybicie->szczyt            | 75. percentyl | 88.0 (76.0-100.0)   |
| tygodnie wybicie->szczyt            | 90. percentyl | 181.0 (158.0-200.0) |
| zysk wybicie->szczyt [%]            | średnia       | 92.6 (80.7-107.3)   |
| odsetek wybić ze szczytem >= +30 %  |               | 51.6 (48.3-54.8)    |
| odsetek wybić ze szczytem >= +50 %  |               | 38.0 (35.0-41.0)    |
| odsetek wybić ze szczytem >= +100 % |               | 20.5 (18.4-22.7)    |

Zysk do szczytu to górna granica zysku; po szczycie cena spada o Y, zanim ruch uznamy za zakończony.

### Czas życia ruchu (trzymanie z trailing stopem 35 %), Kaplan-Meier z ucięciem

|   tygodnie od wybicia |   odsetek ruchów wciąż żywych (95 %) |
|----------------------:|-------------------------------------:|
|                     4 |                                 98.5 |
|                     8 |                                 95.5 |
|                    13 |                                 90.9 |
|                    26 |                                 79.1 |
|                    52 |                                 62.2 |
|                   104 |                                 42   |

Mediana czasu życia: 80 tyg.

Hazard końca ruchu (szansa końca na tydzień, jeśli ruch dotrwał do początku przedziału):

| przedział tygodni   |   w ryzyku |   końców |   hazard na tydzień |
|:--------------------|-----------:|---------:|--------------------:|
| 0-4                 |      69379 |     1074 |              0.0039 |
| 4-8                 |      68305 |     2062 |              0.0075 |
| 8-13                |      66243 |     3162 |              0.0095 |
| 13-26               |      63081 |     8217 |              0.01   |
| 26-52               |      54453 |    11359 |              0.008  |
| 52-104              |      40652 |    12532 |              0.0059 |
| 104-...             |      24568 |    16967 |              0.0044 |

Weibull: kształt k = 0.986, skala = 125.8 tyg.; LR vs wykładniczy = 19.0. k < 1: im dłużej ruch trwa, tym mniejsza szansa końca w kolejnym tygodniu.

## (b) Warunkowo: ruchy potwierdzone zygzakiem (Y = 25 %), wybicie 1998-2012

Opis "jak wyglądają duże ruchy", które już się wydarzyły; nie jest to szansa sukcesu wybicia.

| ruch dołek->szczyt   |     n | mediana tyg. wybicie->szczyt (95 %)   | mediana zysku wybicie->szczyt (95 %)   |   mediana tyg. dołek->wybicie |   mediana tyg. dołek->szczyt |
|:---------------------|------:|:--------------------------------------|:---------------------------------------|------------------------------:|-----------------------------:|
| >= 50 %              | 18029 | 16 (13-19)                            | 31.8 (27.8-35.8)                       |                            14 |                           31 |
| >= 100 %             | 10267 | 26 (21-32)                            | 64.8 (60.0-69.6)                       |                            13 |                           42 |
| >= 200 %             |  4327 | 39 (32-48)                            | 133.3 (124.6-142.0)                    |                            13 |                           56 |
