# Etap 11: anatomia dużych wzrostów (ruchy +50 % i więcej, dołek 1998-2018, Y = 25 %)

Ruchów: 30,611 (płynnych w chwili osiągnięcia +30 % nad dołkiem). Liczebność klas: +50-100 %: 15,544, +100-200 %: 9,236, +200-500 %: 4,648, > +500 %: 1,183.
Wartości: mediana (95 % z bootstrapu blokowego po miesiącach dołka). Procenty tam, gdzie miara jest udziałem lub zmianą.

## A. Jak wyglądają wzrosty różnej wielkości

| miara                                                  | +50-100 %           | +100-200 %          | +200-500 %          | > +500 %              |
|:-------------------------------------------------------|:--------------------|:--------------------|:--------------------|:----------------------|
| tygodnie dołek->szczyt                                 | 17.00 (15.00…19.00) | 34.00 (29.00…41.00) | 66.00 (56.00…78.00) | 123.00 (86.94…160.51) |
| tempo (% na tydzień)                                   | 3.1 (2.7…3.5)       | 2.5 (2.1…2.9)       | 2.0 (1.7…2.5)       | 1.7 (1.4…2.5)         |
| liczba korekt >= 10 %                                  | 1.00 (1.00…1.00)    | 1.00 (1.00…1.00)    | 3.00 (2.00…3.00)    | 4.00 (4.00…5.00)      |
| najgłębsza korekta w trakcie                           | -11.2 (-11.6…-10.7) | -15.4 (-15.9…-14.9) | -18.6 (-18.9…-18.2) | -20.9 (-21.2…-20.4)   |
| odsetek tygodni wzrostowych                            | 66.2 (65.0…66.7)    | 63.2 (62.5…64.0)    | 61.4 (60.8…62.2)    | 60.5 (59.6…62.0)      |
| część wzrostu (log) w 1. połowie czasu                 | 53.1 (51.9…54.3)    | 54.3 (52.6…55.9)    | 54.9 (51.8…57.5)    | 53.6 (49.8…57.4)      |
| log wolumen: ostatnia / pierwsza ćwiartka              | -0.03 (-0.06…-0.01) | 0.09 (0.04…0.14)    | 0.17 (0.07…0.28)    | 0.14 (0.02…0.36)      |
| log zmienność: ostatnia / pierwsza ćwiartka            | -0.23 (-0.26…-0.20) | -0.23 (-0.28…-0.17) | -0.24 (-0.34…-0.15) | -0.20 (-0.34…-0.08)   |
| zmiana ceny 13 tyg. po szczycie                        | -24.1 (-25.1…-23.1) | -23.0 (-24.7…-21.3) | -22.2 (-24.2…-20.6) | -21.8 (-24.8…-20.4)   |
| zmiana ceny 26 tyg. po szczycie                        | -27.9 (-30.3…-25.9) | -25.5 (-27.9…-23.5) | -24.4 (-27.8…-22.1) | -23.8 (-28.5…-21.0)   |
| zmiana ceny 52 tyg. po szczycie                        | -30.1 (-33.3…-26.7) | -27.9 (-32.5…-24.3) | -28.3 (-34.2…-23.3) | -29.8 (-41.0…-23.5)   |
| część wzrostu (log), która zostaje 52 tyg. po szczycie | 32.2 (22.4…41.2)    | 61.8 (54.5…68.2)    | 75.3 (69.3…80.7)    | 84.1 (76.4…88.0)      |
| tygodnie od szczytu do spadku o 25 %                   | 8.00 (8.00…9.00)    | 8.00 (7.00…9.00)    | 9.00 (7.00…10.00)   | 8.00 (6.00…9.00)      |

## B. Typy przebiegów znalezione przez grupowanie (bez definicji z góry)

Wybór k: k=2: sylwetka 0.283, ARI 0.99, k=3: sylwetka 0.210, ARI 0.97, k=4: sylwetka 0.195, ARI 0.77, k=5: sylwetka 0.174, ARI 0.91, k=6: sylwetka 0.145, ARI 0.93, k=7: sylwetka 0.142, ARI 0.92, k=8: sylwetka 0.136, ARI 0.94. Wybrane k = 2.

Ścieżka (0 = dołek, 1 = szczyt, w logarytmie) w 20 punktach czasu ruchu:

|   % czasu ruchu |   typ 0 |   typ 1 |
|----------------:|--------:|--------:|
|               0 |   0     |   0     |
|               5 |   0.124 |   0.185 |
|              11 |   0.184 |   0.287 |
|              16 |   0.219 |   0.363 |
|              21 |   0.244 |   0.425 |
|              26 |   0.268 |   0.48  |
|              32 |   0.291 |   0.528 |
|              37 |   0.314 |   0.571 |
|              42 |   0.34  |   0.608 |
|              47 |   0.371 |   0.643 |
|              53 |   0.408 |   0.674 |
|              58 |   0.449 |   0.698 |
|              63 |   0.492 |   0.72  |
|              68 |   0.538 |   0.74  |
|              74 |   0.59  |   0.762 |
|              79 |   0.645 |   0.786 |
|              84 |   0.706 |   0.814 |
|              89 |   0.777 |   0.851 |
|              95 |   0.865 |   0.904 |
|             100 |   1     |   1     |

|   typ |     n |   mediana_wzrostu |   udzial |   udzial_wsrod_>200% |
|------:|------:|------------------:|---------:|---------------------:|
|     0 | 13771 |             0.97  |     0.45 |                0.449 |
|     1 | 16840 |             0.999 |     0.55 |                0.551 |

| miara                                                  | typ 0               | typ 1               |
|:-------------------------------------------------------|:--------------------|:--------------------|
| tygodnie dołek->szczyt                                 | 24.00 (22.00…28.00) | 28.00 (24.00…33.00) |
| tempo (% na tydzień)                                   | 2.9 (2.6…3.2)       | 2.5 (2.2…2.9)       |
| liczba korekt >= 10 %                                  | 1.00 (1.00…1.00)    | 1.00 (1.00…1.00)    |
| najgłębsza korekta w trakcie                           | -14.1 (-14.6…-13.6) | -14.2 (-15.1…-13.4) |
| odsetek tygodni wzrostowych                            | 64.0 (63.5…64.7)    | 63.5 (62.5…64.3)    |
| część wzrostu (log) w 1. połowie czasu                 | 38.9 (38.2…39.4)    | 64.9 (64.2…65.5)    |
| log wolumen: ostatnia / pierwsza ćwiartka              | 0.25 (0.22…0.28)    | -0.11 (-0.14…-0.07) |
| log zmienność: ostatnia / pierwsza ćwiartka            | -0.06 (-0.09…-0.02) | -0.36 (-0.42…-0.31) |
| zmiana ceny 13 tyg. po szczycie                        | -24.5 (-25.5…-23.5) | -22.5 (-24.2…-21.1) |
| zmiana ceny 26 tyg. po szczycie                        | -29.0 (-30.9…-27.2) | -24.7 (-27.5…-22.6) |
| zmiana ceny 52 tyg. po szczycie                        | -33.6 (-36.7…-30.8) | -26.0 (-31.0…-22.0) |
| część wzrostu (log), która zostaje 52 tyg. po szczycie | 45.7 (38.2…51.5)    | 61.4 (49.5…70.2)    |
| tygodnie od szczytu do spadku o 25 %                   | 8.00 (7.00…8.00)    | 9.00 (8.00…10.00)   |

## C. Jak wygląda szczyt dużego ruchu (+100 % i więcej): mediany od 26 tyg. przed do 26 tyg. po szczycie

Ruchów z pełnym oknem: 14,385. Wolumen = krotność średniej z tygodni -78..-26 przed szczytem.

|   tyg |   wolumen |   cena_%_szczytu |   zmiennosc_dzienna_% |
|------:|----------:|-----------------:|----------------------:|
|   -26 |      0.92 |             68.4 |                  2.37 |
|   -13 |      0.98 |             76.6 |                  2.31 |
|    -8 |      1.01 |             81.2 |                  2.32 |
|    -4 |      1.04 |             87.3 |                  2.27 |
|    -2 |      1.05 |             91.7 |                  2.22 |
|    -1 |      1.08 |             95   |                  2.31 |
|     0 |      1.22 |            100   |                  2.38 |
|     1 |      1.23 |             94.7 |                  2.54 |
|     2 |      1.22 |             90.7 |                  2.65 |
|     4 |      1.19 |             85.7 |                  2.71 |
|     8 |      1.12 |             81.2 |                  2.61 |
|    13 |      1.15 |             77.7 |                  2.63 |
|    26 |      1.11 |             75.4 |                  2.41 |
