# Etap 3: opis statystyczny ruchów (próba ucząca, wybicia 1998-2012)

## Próg trailing stopu / końca ruchu Y = 25 %

Świeżych wybić (płynnych): 68,843; zakończonych w próbie: 60,451; uciętych na 2013-06-30: 8,392; niezależnych miesięcy: 180.

### (a) Wszystkie świeże wybicia: zysk i czas do szczytu (zakończone)

| miara                               |                              | wartość (95 %)      |
|:------------------------------------|:-----------------------------|:--------------------|
| zysk wybicie->szczyt [%]            | 10. percentyl                | 0.0 (0.0-0.3)       |
| zysk wybicie->szczyt [%]            | 25. percentyl                | 6.6 (5.4-7.8)       |
| zysk wybicie->szczyt [%]            | 50. percentyl                | 23.6 (20.9-26.7)    |
| zysk wybicie->szczyt [%]            | 75. percentyl                | 60.7 (54.7-66.7)    |
| zysk wybicie->szczyt [%]            | 90. percentyl                | 125.8 (114.7-136.6) |
| tygodnie wybicie->szczyt            | 10. percentyl                | 0.0 (0.0-1.0)       |
| tygodnie wybicie->szczyt            | 25. percentyl                | 4.0 (3.0-5.0)       |
| tygodnie wybicie->szczyt            | 50. percentyl                | 19.0 (16.0-22.0)    |
| tygodnie wybicie->szczyt            | 75. percentyl                | 55.5 (49.0-64.0)    |
| tygodnie wybicie->szczyt            | 90. percentyl                | 122.0 (105.0-140.0) |
| zysk wybicie->szczyt [%]            | średnia winsoryzowana 1/99 % | 49.6 (45.2-54.2)    |
| odsetek wybić ze szczytem >= +30 %  |                              | 43.8 (40.6-46.8)    |
| odsetek wybić ze szczytem >= +50 %  |                              | 30.0 (27.3-32.8)    |
| odsetek wybić ze szczytem >= +100 % |                              | 13.8 (12.2-15.5)    |

Zysk do szczytu to górna granica zysku; po szczycie cena spada o Y, zanim ruch uznamy za zakończony.

### Czas życia ruchu (trzymanie z trailing stopem 25 %), Kaplan-Meier z ucięciem

|   tygodnie od wybicia | odsetek ruchów wciąż żywych (95 %)   |
|----------------------:|:-------------------------------------|
|                     4 | 96.5 (95.4-97.2)                     |
|                     8 | 90.3 (88.3-91.9)                     |
|                    13 | 82.1 (79.5-84.1)                     |
|                    26 | 64.2 (60.8-67.3)                     |
|                    52 | 43.2 (39.7-46.1)                     |
|                   104 | 24.2 (21.2-27.2)                     |

Mediana czasu życia: 42 tyg.

Hazard końca ruchu (szansa końca na tydzień, jeśli ruch dotrwał do początku przedziału):

| przedział tygodni   |   w ryzyku |   końców |   hazard na tydzień |
|:--------------------|-----------:|---------:|--------------------:|
| 0-4                 |      68843 |     2426 |              0.0088 |
| 4-8                 |      66417 |     4246 |              0.016  |
| 8-13                |      62171 |     5645 |              0.0182 |
| 13-26               |      56526 |    12325 |              0.0168 |
| 26-52               |      43815 |    13954 |              0.0122 |
| 52-104              |      27671 |    11423 |              0.0079 |
| 104-...             |      13553 |    10432 |              0.0049 |

Weibull: kształt k = 0.948 (95 % blokowo: 0.912-0.988), skala = 72.4 tyg.; LR vs wykładniczy = 297.2. k < 1: im dłużej ruch trwa, tym mniejsza szansa końca w kolejnym tygodniu.

### Po latach (Y = 25 %, zakończone)

|   rok |   wybic |   szczyt50 |   mediana_zysku |   mediana_zycia |
|------:|--------:|-----------:|----------------:|----------------:|
|  1998 |    1319 |      0.2   |           0.167 |              27 |
|  1999 |    3045 |      0.356 |           0.248 |              22 |
|  2000 |    3606 |      0.288 |           0.235 |              20 |
|  2001 |    3190 |      0.249 |           0.185 |              28 |
|  2002 |    2698 |      0.292 |           0.145 |              23 |
|  2003 |    5434 |      0.579 |           0.634 |              78 |
|  2004 |    5480 |      0.43  |           0.391 |              78 |
|  2005 |    5447 |      0.404 |           0.372 |              61 |
|  2006 |    6195 |      0.25  |           0.25  |              57 |
|  2007 |    6086 |      0.142 |           0.133 |              31 |
|  2008 |    2954 |      0.042 |           0.059 |              14 |
|  2009 |    5080 |      0.438 |           0.421 |              47 |
|  2010 |    4991 |      0.246 |           0.246 |              39 |
|  2011 |    3072 |      0.088 |           0.08  |              20 |
|  2012 |    1854 |      0.101 |           0.081 |              17 |

## Próg trailing stopu / końca ruchu Y = 15 %

Świeżych wybić (płynnych): 68,843; zakończonych w próbie: 65,082; uciętych na 2013-06-30: 3,761; niezależnych miesięcy: 180.

### (a) Wszystkie świeże wybicia: zysk i czas do szczytu (zakończone)

| miara                               |                              | wartość (95 %)   |
|:------------------------------------|:-----------------------------|:-----------------|
| zysk wybicie->szczyt [%]            | 10. percentyl                | 0.0 (0.0-0.0)    |
| zysk wybicie->szczyt [%]            | 25. percentyl                | 3.6 (2.8-4.4)    |
| zysk wybicie->szczyt [%]            | 50. percentyl                | 14.6 (13.0-16.3) |
| zysk wybicie->szczyt [%]            | 75. percentyl                | 35.9 (33.1-38.8) |
| zysk wybicie->szczyt [%]            | 90. percentyl                | 70.4 (65.1-75.9) |
| tygodnie wybicie->szczyt            | 10. percentyl                | 0.0 (0.0-0.0)    |
| tygodnie wybicie->szczyt            | 25. percentyl                | 2.0 (2.0-3.0)    |
| tygodnie wybicie->szczyt            | 50. percentyl                | 9.0 (8.0-11.0)   |
| tygodnie wybicie->szczyt            | 75. percentyl                | 26.0 (23.0-29.0) |
| tygodnie wybicie->szczyt            | 90. percentyl                | 56.0 (50.0-61.0) |
| zysk wybicie->szczyt [%]            | średnia winsoryzowana 1/99 % | 27.5 (25.2-29.6) |
| odsetek wybić ze szczytem >= +30 %  |                              | 30.0 (27.6-32.5) |
| odsetek wybić ze szczytem >= +50 %  |                              | 16.7 (15.0-18.5) |
| odsetek wybić ze szczytem >= +100 % |                              | 5.2 (4.5-5.9)    |

Zysk do szczytu to górna granica zysku; po szczycie cena spada o Y, zanim ruch uznamy za zakończony.

### Czas życia ruchu (trzymanie z trailing stopem 15 %), Kaplan-Meier z ucięciem

|   tygodnie od wybicia |   odsetek ruchów wciąż żywych (95 %) |
|----------------------:|-------------------------------------:|
|                     4 |                                 89   |
|                     8 |                                 75.3 |
|                    13 |                                 61   |
|                    26 |                                 38   |
|                    52 |                                 18.3 |
|                   104 |                                  7.2 |

Mediana czasu życia: 19 tyg.

Hazard końca ruchu (szansa końca na tydzień, jeśli ruch dotrwał do początku przedziału):

| przedział tygodni   |   w ryzyku |   końców |   hazard na tydzień |
|:--------------------|-----------:|---------:|--------------------:|
| 0-4                 |      68843 |     7567 |              0.0275 |
| 4-8                 |      61276 |     9452 |              0.0386 |
| 8-13                |      51824 |     9803 |              0.0378 |
| 13-26               |      42021 |    15847 |              0.029  |
| 26-52               |      25883 |    12992 |              0.0193 |
| 52-104              |      11456 |     6451 |              0.0108 |
| 104-...             |       3721 |     2970 |              0.0051 |

Weibull: kształt k = 0.927, skala = 32.4 tyg.; LR vs wykładniczy = 703.4. k < 1: im dłużej ruch trwa, tym mniejsza szansa końca w kolejnym tygodniu.

## Próg trailing stopu / końca ruchu Y = 35 %

Świeżych wybić (płynnych): 68,843; zakończonych w próbie: 55,159; uciętych na 2013-06-30: 13,684; niezależnych miesięcy: 180.

### (a) Wszystkie świeże wybicia: zysk i czas do szczytu (zakończone)

| miara                               |                              | wartość (95 %)      |
|:------------------------------------|:-----------------------------|:--------------------|
| zysk wybicie->szczyt [%]            | 10. percentyl                | 0.5 (0.0-1.2)       |
| zysk wybicie->szczyt [%]            | 25. percentyl                | 9.1 (7.5-10.7)      |
| zysk wybicie->szczyt [%]            | 50. percentyl                | 31.7 (27.9-35.8)    |
| zysk wybicie->szczyt [%]            | 75. percentyl                | 82.3 (74.0-91.0)    |
| zysk wybicie->szczyt [%]            | 90. percentyl                | 174.0 (157.7-191.9) |
| tygodnie wybicie->szczyt            | 10. percentyl                | 1.0 (0.0-1.0)       |
| tygodnie wybicie->szczyt            | 25. percentyl                | 6.0 (5.0-8.0)       |
| tygodnie wybicie->szczyt            | 50. percentyl                | 29.0 (25.0-35.0)    |
| tygodnie wybicie->szczyt            | 75. percentyl                | 88.0 (76.0-101.0)   |
| tygodnie wybicie->szczyt            | 90. percentyl                | 181.0 (158.0-200.0) |
| zysk wybicie->szczyt [%]            | średnia winsoryzowana 1/99 % | 69.3 (62.9-76.0)    |
| odsetek wybić ze szczytem >= +30 %  |                              | 51.4 (48.2-54.7)    |
| odsetek wybić ze szczytem >= +50 %  |                              | 37.9 (34.9-40.9)    |
| odsetek wybić ze szczytem >= +100 % |                              | 20.3 (18.2-22.5)    |

Zysk do szczytu to górna granica zysku; po szczycie cena spada o Y, zanim ruch uznamy za zakończony.

### Czas życia ruchu (trzymanie z trailing stopem 35 %), Kaplan-Meier z ucięciem

|   tygodnie od wybicia |   odsetek ruchów wciąż żywych (95 %) |
|----------------------:|-------------------------------------:|
|                     4 |                                 98.4 |
|                     8 |                                 95.4 |
|                    13 |                                 90.8 |
|                    26 |                                 78.9 |
|                    52 |                                 61.9 |
|                   104 |                                 41.4 |

Mediana czasu życia: 79 tyg.

Hazard końca ruchu (szansa końca na tydzień, jeśli ruch dotrwał do początku przedziału):

| przedział tygodni   |   w ryzyku |   końców |   hazard na tydzień |
|:--------------------|-----------:|---------:|--------------------:|
| 0-4                 |      68843 |     1097 |              0.004  |
| 4-8                 |      67746 |     2067 |              0.0076 |
| 8-13                |      65679 |     3157 |              0.0096 |
| 13-26               |      62522 |     8230 |              0.0101 |
| 26-52               |      53881 |    11348 |              0.0081 |
| 52-104              |      40111 |    12540 |              0.006  |
| 104-...             |      24046 |    16720 |              0.0045 |

Weibull: kształt k = 0.996, skala = 123.0 tyg.; LR vs wykładniczy = 1.3. k < 1: im dłużej ruch trwa, tym mniejsza szansa końca w kolejnym tygodniu.

## (b) Warunkowo: ruchy potwierdzone zygzakiem (Y = 25 %), wybicie 1998-2012

Opis "jak wyglądają duże ruchy", które już się wydarzyły; nie jest to szansa sukcesu wybicia.

| ruch dołek->szczyt   |     n | mediana tyg. wybicie->szczyt (95 %)   | mediana zysku wybicie->szczyt (95 %)   |   mediana tyg. dołek->wybicie |   mediana tyg. dołek->szczyt |
|:---------------------|------:|:--------------------------------------|:---------------------------------------|------------------------------:|-----------------------------:|
| >= 50 %              | 17963 | 16 (13-19)                            | 31.8 (27.8-35.8)                       |                            14 |                           31 |
| >= 100 %             | 10175 | 27 (21-32)                            | 65.0 (60.2-69.8)                       |                            13 |                           42 |
| >= 200 %             |  4225 | 40 (33-48)                            | 133.7 (125.4-142.6)                    |                            13 |                           56 |
