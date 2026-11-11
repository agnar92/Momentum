# Etap 3: opis statystyczny ruchów (próba ucząca, wybicia 1998-2012)

## Próg trailing stopu / końca ruchu Y = 25 %

Świeżych wybić (płynnych): 69,020; zakończonych w próbie: 60,619; uciętych na 2013-06-30: 8,401; niezależnych miesięcy: 180.

### (a) Wszystkie świeże wybicia: zysk i czas do szczytu (zakończone)

| miara                               |                              | wartość (95 %)      |
|:------------------------------------|:-----------------------------|:--------------------|
| zysk wybicie->szczyt [%]            | 10. percentyl                | 0.0 (0.0-0.2)       |
| zysk wybicie->szczyt [%]            | 25. percentyl                | 6.6 (5.4-7.8)       |
| zysk wybicie->szczyt [%]            | 50. percentyl                | 23.6 (20.9-26.7)    |
| zysk wybicie->szczyt [%]            | 75. percentyl                | 60.8 (54.7-67.0)    |
| zysk wybicie->szczyt [%]            | 90. percentyl                | 126.2 (115.0-137.0) |
| tygodnie wybicie->szczyt            | 10. percentyl                | 0.0 (0.0-1.0)       |
| tygodnie wybicie->szczyt            | 25. percentyl                | 4.0 (3.0-5.0)       |
| tygodnie wybicie->szczyt            | 50. percentyl                | 19.0 (16.0-22.0)    |
| tygodnie wybicie->szczyt            | 75. percentyl                | 55.0 (49.0-64.0)    |
| tygodnie wybicie->szczyt            | 90. percentyl                | 121.0 (105.0-140.0) |
| zysk wybicie->szczyt [%]            | średnia winsoryzowana 1/99 % | 49.8 (45.4-54.4)    |
| odsetek wybić ze szczytem >= +30 %  |                              | 43.9 (40.6-46.8)    |
| odsetek wybić ze szczytem >= +50 %  |                              | 30.0 (27.3-32.9)    |
| odsetek wybić ze szczytem >= +100 % |                              | 13.9 (12.2-15.6)    |

Zysk do szczytu to górna granica zysku; po szczycie cena spada o Y, zanim ruch uznamy za zakończony.

### Czas życia ruchu (trzymanie z trailing stopem 25 %), Kaplan-Meier z ucięciem

|   tygodnie od wybicia | odsetek ruchów wciąż żywych (95 %)   |
|----------------------:|:-------------------------------------|
|                     4 | 96.5 (95.4-97.2)                     |
|                     8 | 90.3 (88.3-91.9)                     |
|                    13 | 82.1 (79.4-84.0)                     |
|                    26 | 64.2 (60.8-67.3)                     |
|                    52 | 43.2 (39.7-46.1)                     |
|                   104 | 24.2 (21.2-27.2)                     |

Mediana czasu życia: 42 tyg.

Hazard końca ruchu (szansa końca na tydzień, jeśli ruch dotrwał do początku przedziału):

| przedział tygodni   |   w ryzyku |   końców |   hazard na tydzień |
|:--------------------|-----------:|---------:|--------------------:|
| 0-4                 |      69020 |     2442 |              0.0088 |
| 4-8                 |      66578 |     4265 |              0.016  |
| 8-13                |      62313 |     5670 |              0.0182 |
| 13-26               |      56643 |    12351 |              0.0168 |
| 26-52               |      43907 |    13984 |              0.0122 |
| 52-104              |      27729 |    11454 |              0.0079 |
| 104-...             |      13578 |    10453 |              0.0049 |

Weibull: kształt k = 0.948 (95 % blokowo: 0.911-0.987), skala = 72.4 tyg.; LR vs wykładniczy = 303.8. k < 1: im dłużej ruch trwa, tym mniejsza szansa końca w kolejnym tygodniu.

### Po latach (Y = 25 %, zakończone)

|   rok |   wybic |   szczyt50 |   mediana_zysku |   mediana_zycia |
|------:|--------:|-----------:|----------------:|----------------:|
|  1998 |    1327 |      0.201 |           0.166 |              27 |
|  1999 |    3058 |      0.36  |           0.249 |              22 |
|  2000 |    3649 |      0.287 |           0.233 |              20 |
|  2001 |    3210 |      0.249 |           0.185 |              28 |
|  2002 |    2703 |      0.293 |           0.145 |              23 |
|  2003 |    5440 |      0.579 |           0.634 |              78 |
|  2004 |    5488 |      0.431 |           0.392 |              78 |
|  2005 |    5456 |      0.404 |           0.372 |              61 |
|  2006 |    6214 |      0.251 |           0.25  |              57 |
|  2007 |    6099 |      0.142 |           0.132 |              31 |
|  2008 |    2958 |      0.042 |           0.059 |              14 |
|  2009 |    5089 |      0.439 |           0.422 |              47 |
|  2010 |    4998 |      0.245 |           0.246 |              39 |
|  2011 |    3072 |      0.089 |           0.081 |              20 |
|  2012 |    1858 |      0.101 |           0.08  |              17 |

## Próg trailing stopu / końca ruchu Y = 15 %

Świeżych wybić (płynnych): 69,020; zakończonych w próbie: 65,259; uciętych na 2013-06-30: 3,761; niezależnych miesięcy: 180.

### (a) Wszystkie świeże wybicia: zysk i czas do szczytu (zakończone)

| miara                               |                              | wartość (95 %)   |
|:------------------------------------|:-----------------------------|:-----------------|
| zysk wybicie->szczyt [%]            | 10. percentyl                | 0.0 (0.0-0.0)    |
| zysk wybicie->szczyt [%]            | 25. percentyl                | 3.6 (2.8-4.4)    |
| zysk wybicie->szczyt [%]            | 50. percentyl                | 14.6 (13.0-16.3) |
| zysk wybicie->szczyt [%]            | 75. percentyl                | 35.9 (33.2-38.8) |
| zysk wybicie->szczyt [%]            | 90. percentyl                | 70.6 (65.2-76.0) |
| tygodnie wybicie->szczyt            | 10. percentyl                | 0.0 (0.0-0.0)    |
| tygodnie wybicie->szczyt            | 25. percentyl                | 2.0 (2.0-3.0)    |
| tygodnie wybicie->szczyt            | 50. percentyl                | 9.0 (8.0-11.0)   |
| tygodnie wybicie->szczyt            | 75. percentyl                | 26.0 (23.0-29.0) |
| tygodnie wybicie->szczyt            | 90. percentyl                | 55.0 (50.0-61.0) |
| zysk wybicie->szczyt [%]            | średnia winsoryzowana 1/99 % | 27.5 (25.3-29.7) |
| odsetek wybić ze szczytem >= +30 %  |                              | 30.1 (27.6-32.5) |
| odsetek wybić ze szczytem >= +50 %  |                              | 16.7 (15.0-18.5) |
| odsetek wybić ze szczytem >= +100 % |                              | 5.2 (4.5-6.0)    |

Zysk do szczytu to górna granica zysku; po szczycie cena spada o Y, zanim ruch uznamy za zakończony.

### Czas życia ruchu (trzymanie z trailing stopem 15 %), Kaplan-Meier z ucięciem

|   tygodnie od wybicia |   odsetek ruchów wciąż żywych (95 %) |
|----------------------:|-------------------------------------:|
|                     4 |                                 89   |
|                     8 |                                 75.2 |
|                    13 |                                 61   |
|                    26 |                                 38   |
|                    52 |                                 18.3 |
|                   104 |                                  7.2 |

Mediana czasu życia: 19 tyg.

Hazard końca ruchu (szansa końca na tydzień, jeśli ruch dotrwał do początku przedziału):

| przedział tygodni   |   w ryzyku |   końców |   hazard na tydzień |
|:--------------------|-----------:|---------:|--------------------:|
| 0-4                 |      69020 |     7616 |              0.0276 |
| 4-8                 |      61404 |     9484 |              0.0386 |
| 8-13                |      51920 |     9830 |              0.0379 |
| 13-26               |      42090 |    15876 |              0.029  |
| 26-52               |      25923 |    13015 |              0.0193 |
| 52-104              |      11473 |     6463 |              0.0108 |
| 104-...             |       3726 |     2975 |              0.0051 |

Weibull: kształt k = 0.927, skala = 32.4 tyg.; LR vs wykładniczy = 712.9. k < 1: im dłużej ruch trwa, tym mniejsza szansa końca w kolejnym tygodniu.

## Próg trailing stopu / końca ruchu Y = 35 %

Świeżych wybić (płynnych): 69,020; zakończonych w próbie: 55,300; uciętych na 2013-06-30: 13,720; niezależnych miesięcy: 180.

### (a) Wszystkie świeże wybicia: zysk i czas do szczytu (zakończone)

| miara                               |                              | wartość (95 %)      |
|:------------------------------------|:-----------------------------|:--------------------|
| zysk wybicie->szczyt [%]            | 10. percentyl                | 0.5 (0.0-1.2)       |
| zysk wybicie->szczyt [%]            | 25. percentyl                | 9.1 (7.5-10.7)      |
| zysk wybicie->szczyt [%]            | 50. percentyl                | 31.8 (27.9-35.8)    |
| zysk wybicie->szczyt [%]            | 75. percentyl                | 82.6 (74.2-91.3)    |
| zysk wybicie->szczyt [%]            | 90. percentyl                | 175.4 (158.6-193.0) |
| tygodnie wybicie->szczyt            | 10. percentyl                | 1.0 (0.0-1.0)       |
| tygodnie wybicie->szczyt            | 25. percentyl                | 6.0 (5.0-8.0)       |
| tygodnie wybicie->szczyt            | 50. percentyl                | 29.0 (25.0-35.0)    |
| tygodnie wybicie->szczyt            | 75. percentyl                | 88.0 (76.0-101.0)   |
| tygodnie wybicie->szczyt            | 90. percentyl                | 181.0 (158.0-200.0) |
| zysk wybicie->szczyt [%]            | średnia winsoryzowana 1/99 % | 69.8 (63.4-76.6)    |
| odsetek wybić ze szczytem >= +30 %  |                              | 51.5 (48.2-54.8)    |
| odsetek wybić ze szczytem >= +50 %  |                              | 38.0 (34.9-40.9)    |
| odsetek wybić ze szczytem >= +100 % |                              | 20.4 (18.3-22.6)    |

Zysk do szczytu to górna granica zysku; po szczycie cena spada o Y, zanim ruch uznamy za zakończony.

### Czas życia ruchu (trzymanie z trailing stopem 35 %), Kaplan-Meier z ucięciem

|   tygodnie od wybicia |   odsetek ruchów wciąż żywych (95 %) |
|----------------------:|-------------------------------------:|
|                     4 |                                 98.4 |
|                     8 |                                 95.4 |
|                    13 |                                 90.8 |
|                    26 |                                 78.9 |
|                    52 |                                 61.9 |
|                   104 |                                 41.5 |

Mediana czasu życia: 79 tyg.

Hazard końca ruchu (szansa końca na tydzień, jeśli ruch dotrwał do początku przedziału):

| przedział tygodni   |   w ryzyku |   końców |   hazard na tydzień |
|:--------------------|-----------:|---------:|--------------------:|
| 0-4                 |      69020 |     1097 |              0.004  |
| 4-8                 |      67923 |     2069 |              0.0076 |
| 8-13                |      65854 |     3174 |              0.0096 |
| 13-26               |      62680 |     8249 |              0.0101 |
| 26-52               |      54021 |    11375 |              0.0081 |
| 52-104              |      40217 |    12564 |              0.006  |
| 104-...             |      24122 |    16772 |              0.0045 |

Weibull: kształt k = 0.996, skala = 123.0 tyg.; LR vs wykładniczy = 1.2. k < 1: im dłużej ruch trwa, tym mniejsza szansa końca w kolejnym tygodniu.

## (b) Warunkowo: ruchy potwierdzone zygzakiem (Y = 25 %), wybicie 1998-2012

Opis "jak wyglądają duże ruchy", które już się wydarzyły; nie jest to szansa sukcesu wybicia.

| ruch dołek->szczyt   |     n | mediana tyg. wybicie->szczyt (95 %)   | mediana zysku wybicie->szczyt (95 %)   |   mediana tyg. dołek->wybicie |   mediana tyg. dołek->szczyt |
|:---------------------|------:|:--------------------------------------|:---------------------------------------|------------------------------:|-----------------------------:|
| >= 50 %              | 17988 | 16 (13-19)                            | 31.8 (27.8-35.8)                       |                            14 |                           31 |
| >= 100 %             | 10198 | 27 (21-32)                            | 65.0 (60.2-69.7)                       |                            13 |                           42 |
| >= 200 %             |  4243 | 40 (33-48)                            | 133.7 (125.2-142.7)                    |                            13 |                           56 |
