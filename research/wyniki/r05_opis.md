# Etap 3: opis statystyczny ruchów (próba ucząca, wybicia 1998-2012)

## Próg trailing stopu / końca ruchu Y = 25 %

Świeżych wybić (płynnych): 69,179; zakończonych w próbie: 60,774; uciętych na 2013-06-30: 8,405; niezależnych miesięcy: 180.

### (a) Wszystkie świeże wybicia: zysk i czas do szczytu (zakończone)

| miara                               |                              | wartość (95 %)      |
|:------------------------------------|:-----------------------------|:--------------------|
| zysk wybicie->szczyt [%]            | 10. percentyl                | 0.0 (0.0-0.2)       |
| zysk wybicie->szczyt [%]            | 25. percentyl                | 6.6 (5.3-7.8)       |
| zysk wybicie->szczyt [%]            | 50. percentyl                | 23.6 (20.9-26.7)    |
| zysk wybicie->szczyt [%]            | 75. percentyl                | 60.8 (54.7-67.0)    |
| zysk wybicie->szczyt [%]            | 90. percentyl                | 126.5 (115.2-137.1) |
| tygodnie wybicie->szczyt            | 10. percentyl                | 0.0 (0.0-1.0)       |
| tygodnie wybicie->szczyt            | 25. percentyl                | 4.0 (3.0-5.0)       |
| tygodnie wybicie->szczyt            | 50. percentyl                | 19.0 (16.0-22.0)    |
| tygodnie wybicie->szczyt            | 75. percentyl                | 55.0 (48.0-64.0)    |
| tygodnie wybicie->szczyt            | 90. percentyl                | 121.0 (105.0-140.0) |
| zysk wybicie->szczyt [%]            | średnia winsoryzowana 1/99 % | 49.9 (45.6-54.5)    |
| odsetek wybić ze szczytem >= +30 %  |                              | 43.9 (40.6-46.8)    |
| odsetek wybić ze szczytem >= +50 %  |                              | 30.0 (27.3-32.9)    |
| odsetek wybić ze szczytem >= +100 % |                              | 13.9 (12.2-15.6)    |

Zysk do szczytu to górna granica zysku; po szczycie cena spada o Y, zanim ruch uznamy za zakończony.

### Czas życia ruchu (trzymanie z trailing stopem 25 %), Kaplan-Meier z ucięciem

|   tygodnie od wybicia | odsetek ruchów wciąż żywych (95 %)   |
|----------------------:|:-------------------------------------|
|                     4 | 96.4 (95.4-97.2)                     |
|                     8 | 90.3 (88.3-91.9)                     |
|                    13 | 82.0 (79.4-84.0)                     |
|                    26 | 64.1 (60.7-67.2)                     |
|                    52 | 43.1 (39.6-46.0)                     |
|                   104 | 24.1 (21.2-27.1)                     |

Mediana czasu życia: 42 tyg.

Hazard końca ruchu (szansa końca na tydzień, jeśli ruch dotrwał do początku przedziału):

| przedział tygodni   |   w ryzyku |   końców |   hazard na tydzień |
|:--------------------|-----------:|---------:|--------------------:|
| 0-4                 |      69179 |     2458 |              0.0089 |
| 4-8                 |      66721 |     4285 |              0.0161 |
| 8-13                |      62436 |     5691 |              0.0182 |
| 13-26               |      56745 |    12383 |              0.0168 |
| 26-52               |      43977 |    14022 |              0.0123 |
| 52-104              |      27759 |    11474 |              0.0079 |
| 104-...             |      13586 |    10461 |              0.0049 |

Weibull: kształt k = 0.947 (95 % blokowo: 0.911-0.987), skala = 72.2 tyg.; LR vs wykładniczy = 309.6. k < 1: im dłużej ruch trwa, tym mniejsza szansa końca w kolejnym tygodniu.

### Po latach (Y = 25 %, zakończone)

|   rok |   wybic |   szczyt50 |   mediana_zysku |   mediana_zycia |
|------:|--------:|-----------:|----------------:|----------------:|
|  1998 |    1329 |      0.201 |           0.166 |              27 |
|  1999 |    3061 |      0.359 |           0.249 |              22 |
|  2000 |    3658 |      0.286 |           0.232 |              20 |
|  2001 |    3216 |      0.249 |           0.185 |              28 |
|  2002 |    2716 |      0.292 |           0.145 |              23 |
|  2003 |    5461 |      0.579 |           0.635 |              78 |
|  2004 |    5504 |      0.431 |           0.391 |              78 |
|  2005 |    5467 |      0.404 |           0.372 |              61 |
|  2006 |    6222 |      0.251 |           0.25  |              57 |
|  2007 |    6109 |      0.142 |           0.133 |              31 |
|  2008 |    2971 |      0.042 |           0.059 |              14 |
|  2009 |    5104 |      0.439 |           0.422 |              47 |
|  2010 |    5012 |      0.247 |           0.246 |              39 |
|  2011 |    3080 |      0.089 |           0.081 |              20 |
|  2012 |    1864 |      0.101 |           0.081 |              17 |

## Próg trailing stopu / końca ruchu Y = 15 %

Świeżych wybić (płynnych): 69,179; zakończonych w próbie: 65,417; uciętych na 2013-06-30: 3,762; niezależnych miesięcy: 180.

### (a) Wszystkie świeże wybicia: zysk i czas do szczytu (zakończone)

| miara                               |                              | wartość (95 %)   |
|:------------------------------------|:-----------------------------|:-----------------|
| zysk wybicie->szczyt [%]            | 10. percentyl                | 0.0 (0.0-0.0)    |
| zysk wybicie->szczyt [%]            | 25. percentyl                | 3.6 (2.8-4.4)    |
| zysk wybicie->szczyt [%]            | 50. percentyl                | 14.6 (13.0-16.3) |
| zysk wybicie->szczyt [%]            | 75. percentyl                | 36.0 (33.2-38.9) |
| zysk wybicie->szczyt [%]            | 90. percentyl                | 70.7 (65.4-76.2) |
| tygodnie wybicie->szczyt            | 10. percentyl                | 0.0 (0.0-0.0)    |
| tygodnie wybicie->szczyt            | 25. percentyl                | 2.0 (2.0-3.0)    |
| tygodnie wybicie->szczyt            | 50. percentyl                | 9.0 (8.0-11.0)   |
| tygodnie wybicie->szczyt            | 75. percentyl                | 26.0 (23.0-29.0) |
| tygodnie wybicie->szczyt            | 90. percentyl                | 55.0 (50.0-61.0) |
| zysk wybicie->szczyt [%]            | średnia winsoryzowana 1/99 % | 27.6 (25.3-29.7) |
| odsetek wybić ze szczytem >= +30 %  |                              | 30.1 (27.6-32.6) |
| odsetek wybić ze szczytem >= +50 %  |                              | 16.7 (15.0-18.5) |
| odsetek wybić ze szczytem >= +100 % |                              | 5.2 (4.5-6.0)    |

Zysk do szczytu to górna granica zysku; po szczycie cena spada o Y, zanim ruch uznamy za zakończony.

### Czas życia ruchu (trzymanie z trailing stopem 15 %), Kaplan-Meier z ucięciem

|   tygodnie od wybicia |   odsetek ruchów wciąż żywych (95 %) |
|----------------------:|-------------------------------------:|
|                     4 |                                 88.9 |
|                     8 |                                 75.2 |
|                    13 |                                 60.9 |
|                    26 |                                 37.9 |
|                    52 |                                 18.3 |
|                   104 |                                  7.2 |

Mediana czasu życia: 19 tyg.

Hazard końca ruchu (szansa końca na tydzień, jeśli ruch dotrwał do początku przedziału):

| przedział tygodni   |   w ryzyku |   końców |   hazard na tydzień |
|:--------------------|-----------:|---------:|--------------------:|
| 0-4                 |      69179 |     7652 |              0.0277 |
| 4-8                 |      61527 |     9515 |              0.0387 |
| 8-13                |      52012 |     9852 |              0.0379 |
| 13-26               |      42160 |    15907 |              0.029  |
| 26-52               |      25962 |    13036 |              0.0193 |
| 52-104              |      11490 |     6472 |              0.0108 |
| 104-...             |       3734 |     2983 |              0.0051 |

Weibull: kształt k = 0.926, skala = 32.3 tyg.; LR vs wykładniczy = 722.2. k < 1: im dłużej ruch trwa, tym mniejsza szansa końca w kolejnym tygodniu.

## Próg trailing stopu / końca ruchu Y = 35 %

Świeżych wybić (płynnych): 69,179; zakończonych w próbie: 55,450; uciętych na 2013-06-30: 13,729; niezależnych miesięcy: 180.

### (a) Wszystkie świeże wybicia: zysk i czas do szczytu (zakończone)

| miara                               |                              | wartość (95 %)      |
|:------------------------------------|:-----------------------------|:--------------------|
| zysk wybicie->szczyt [%]            | 10. percentyl                | 0.5 (0.0-1.2)       |
| zysk wybicie->szczyt [%]            | 25. percentyl                | 9.1 (7.5-10.7)      |
| zysk wybicie->szczyt [%]            | 50. percentyl                | 31.8 (27.9-35.8)    |
| zysk wybicie->szczyt [%]            | 75. percentyl                | 82.7 (74.3-91.4)    |
| zysk wybicie->szczyt [%]            | 90. percentyl                | 175.8 (158.9-193.5) |
| tygodnie wybicie->szczyt            | 10. percentyl                | 1.0 (0.0-1.0)       |
| tygodnie wybicie->szczyt            | 25. percentyl                | 6.0 (5.0-8.0)       |
| tygodnie wybicie->szczyt            | 50. percentyl                | 29.0 (25.0-35.0)    |
| tygodnie wybicie->szczyt            | 75. percentyl                | 88.0 (76.0-100.0)   |
| tygodnie wybicie->szczyt            | 90. percentyl                | 181.0 (158.0-200.0) |
| zysk wybicie->szczyt [%]            | średnia winsoryzowana 1/99 % | 70.1 (63.7-77.1)    |
| odsetek wybić ze szczytem >= +30 %  |                              | 51.5 (48.2-54.8)    |
| odsetek wybić ze szczytem >= +50 %  |                              | 38.0 (35.0-40.9)    |
| odsetek wybić ze szczytem >= +100 % |                              | 20.4 (18.3-22.6)    |

Zysk do szczytu to górna granica zysku; po szczycie cena spada o Y, zanim ruch uznamy za zakończony.

### Czas życia ruchu (trzymanie z trailing stopem 35 %), Kaplan-Meier z ucięciem

|   tygodnie od wybicia |   odsetek ruchów wciąż żywych (95 %) |
|----------------------:|-------------------------------------:|
|                     4 |                                 98.4 |
|                     8 |                                 95.4 |
|                    13 |                                 90.8 |
|                    26 |                                 78.8 |
|                    52 |                                 61.8 |
|                   104 |                                 41.4 |

Mediana czasu życia: 79 tyg.

Hazard końca ruchu (szansa końca na tydzień, jeśli ruch dotrwał do początku przedziału):

| przedział tygodni   |   w ryzyku |   końców |   hazard na tydzień |
|:--------------------|-----------:|---------:|--------------------:|
| 0-4                 |      69179 |     1107 |              0.004  |
| 4-8                 |      68072 |     2083 |              0.0076 |
| 8-13                |      65989 |     3187 |              0.0097 |
| 13-26               |      62802 |     8275 |              0.0101 |
| 26-52               |      54117 |    11413 |              0.0081 |
| 52-104              |      40273 |    12588 |              0.006  |
| 104-...             |      24148 |    16797 |              0.0045 |

Weibull: kształt k = 0.996, skala = 122.8 tyg.; LR vs wykładniczy = 1.7. k < 1: im dłużej ruch trwa, tym mniejsza szansa końca w kolejnym tygodniu.

## (b) Warunkowo: ruchy potwierdzone zygzakiem (Y = 25 %), wybicie 1998-2012

Opis "jak wyglądają duże ruchy", które już się wydarzyły; nie jest to szansa sukcesu wybicia.

| ruch dołek->szczyt   |     n | mediana tyg. wybicie->szczyt (95 %)   | mediana zysku wybicie->szczyt (95 %)   |   mediana tyg. dołek->wybicie |   mediana tyg. dołek->szczyt |
|:---------------------|------:|:--------------------------------------|:---------------------------------------|------------------------------:|-----------------------------:|
| >= 50 %              | 18015 | 16 (13-19)                            | 31.8 (27.8-35.7)                       |                            14 |                           31 |
| >= 100 %             | 10233 | 27 (21-32)                            | 64.9 (60.0-69.7)                       |                            13 |                           42 |
| >= 200 %             |  4285 | 39 (32-48)                            | 133.3 (124.6-142.0)                    |                            13 |                           55 |
