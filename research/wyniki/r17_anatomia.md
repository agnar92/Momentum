# Etap 11: anatomia dużych wzrostów (ruchy +50 % i więcej, dołek 1998-2018, Y = 25 %)

Ruchów: 30,564 (płynnych w chwili osiągnięcia +30 % nad dołkiem). Liczebność klas: +50-100 %: 15,545, +100-200 %: 9,223, +200-500 %: 4,627, > +500 %: 1,169.
Wartości: mediana (95 % z bootstrapu blokowego po miesiącach dołka). Procenty tam, gdzie miara jest udziałem lub zmianą.

## A. Jak wyglądają wzrosty różnej wielkości

| miara                                                  | +50-100 %           | +100-200 %          | +200-500 %          | > +500 %              |
|:-------------------------------------------------------|:--------------------|:--------------------|:--------------------|:----------------------|
| tygodnie dołek->szczyt                                 | 17.00 (15.00…19.00) | 34.00 (29.00…41.00) | 66.00 (56.00…78.01) | 123.00 (88.97…159.00) |
| tempo (% na tydzień)                                   | 3.1 (2.7…3.5)       | 2.5 (2.1…2.9)       | 2.0 (1.7…2.5)       | 1.7 (1.3…2.5)         |
| liczba korekt >= 10 %                                  | 1.00 (1.00…1.00)    | 1.00 (1.00…1.00)    | 3.00 (2.00…3.00)    | 4.00 (4.00…5.00)      |
| najgłębsza korekta w trakcie                           | -11.2 (-11.6…-10.8) | -15.4 (-15.9…-14.9) | -18.6 (-18.9…-18.2) | -20.9 (-21.2…-20.4)   |
| odsetek tygodni wzrostowych                            | 66.7 (65.0…66.7)    | 63.2 (62.5…64.0)    | 61.4 (60.8…62.2)    | 60.5 (59.6…61.9)      |
| część wzrostu (log) w 1. połowie czasu                 | 53.1 (51.9…54.3)    | 54.3 (52.6…55.9)    | 54.9 (51.8…57.5)    | 53.6 (50.1…57.2)      |
| log wolumen: ostatnia / pierwsza ćwiartka              | -0.03 (-0.06…-0.01) | 0.09 (0.04…0.14)    | 0.17 (0.07…0.28)    | 0.14 (0.02…0.36)      |
| log zmienność: ostatnia / pierwsza ćwiartka            | -0.23 (-0.26…-0.20) | -0.23 (-0.28…-0.17) | -0.24 (-0.34…-0.15) | -0.21 (-0.34…-0.08)   |
| zmiana ceny 13 tyg. po szczycie                        | -24.1 (-25.1…-23.1) | -23.0 (-24.7…-21.3) | -22.2 (-24.2…-20.6) | -21.8 (-24.7…-20.4)   |
| zmiana ceny 26 tyg. po szczycie                        | -27.9 (-30.3…-25.8) | -25.5 (-27.9…-23.4) | -24.4 (-27.7…-22.1) | -23.8 (-28.6…-21.1)   |
| zmiana ceny 52 tyg. po szczycie                        | -30.1 (-33.3…-26.7) | -27.9 (-32.5…-24.3) | -28.2 (-33.8…-23.4) | -29.4 (-40.4…-23.4)   |
| część wzrostu (log), która zostaje 52 tyg. po szczycie | 32.3 (22.6…41.3)    | 61.8 (54.3…68.2)    | 75.4 (69.5…81.0)    | 84.2 (76.5…88.1)      |
| tygodnie od szczytu do spadku o 25 %                   | 8.00 (8.00…9.00)    | 8.00 (7.00…9.00)    | 9.00 (7.00…10.00)   | 8.00 (6.00…9.00)      |

## B. Typy przebiegów znalezione przez grupowanie (bez definicji z góry)

Wybór k: k=2: sylwetka 0.288, ARI 0.99, k=3: sylwetka 0.210, ARI 0.97, k=4: sylwetka 0.193, ARI 0.77, k=5: sylwetka 0.173, ARI 0.92, k=6: sylwetka 0.145, ARI 0.78, k=7: sylwetka 0.142, ARI 0.91, k=8: sylwetka 0.137, ARI 0.85. Wybrane k = 2.

Ścieżka (0 = dołek, 1 = szczyt, w logarytmie) w 20 punktach czasu ruchu:

|   % czasu ruchu |   typ 0 |   typ 1 |
|----------------:|--------:|--------:|
|               0 |   0     |   0     |
|               5 |   0.185 |   0.124 |
|              11 |   0.288 |   0.184 |
|              16 |   0.363 |   0.219 |
|              21 |   0.425 |   0.244 |
|              26 |   0.481 |   0.268 |
|              32 |   0.528 |   0.291 |
|              37 |   0.571 |   0.314 |
|              42 |   0.608 |   0.34  |
|              47 |   0.643 |   0.371 |
|              53 |   0.674 |   0.408 |
|              58 |   0.698 |   0.449 |
|              63 |   0.72  |   0.492 |
|              68 |   0.74  |   0.538 |
|              74 |   0.762 |   0.59  |
|              79 |   0.786 |   0.645 |
|              84 |   0.813 |   0.706 |
|              89 |   0.851 |   0.777 |
|              95 |   0.904 |   0.865 |
|             100 |   1     |   1     |

|   typ |     n |   mediana_wzrostu |   udzial |   udzial_wsrod_>200% |
|------:|------:|------------------:|---------:|---------------------:|
|     0 | 16808 |             0.998 |     0.55 |                0.551 |
|     1 | 13756 |             0.97  |     0.45 |                0.449 |

| miara                                                  | typ 0               | typ 1               |
|:-------------------------------------------------------|:--------------------|:--------------------|
| tygodnie dołek->szczyt                                 | 28.00 (24.00…33.00) | 24.00 (22.00…27.00) |
| tempo (% na tydzień)                                   | 2.5 (2.2…2.9)       | 2.9 (2.6…3.2)       |
| liczba korekt >= 10 %                                  | 1.00 (1.00…1.00)    | 1.00 (1.00…1.00)    |
| najgłębsza korekta w trakcie                           | -14.2 (-15.0…-13.4) | -14.1 (-14.6…-13.6) |
| odsetek tygodni wzrostowych                            | 63.5 (62.5…64.3)    | 64.0 (63.5…64.7)    |
| część wzrostu (log) w 1. połowie czasu                 | 64.9 (64.2…65.6)    | 38.9 (38.2…39.5)    |
| log wolumen: ostatnia / pierwsza ćwiartka              | -0.11 (-0.15…-0.08) | 0.25 (0.22…0.28)    |
| log zmienność: ostatnia / pierwsza ćwiartka            | -0.36 (-0.41…-0.31) | -0.06 (-0.09…-0.02) |
| zmiana ceny 13 tyg. po szczycie                        | -22.5 (-24.1…-21.0) | -24.5 (-25.4…-23.5) |
| zmiana ceny 26 tyg. po szczycie                        | -24.7 (-27.5…-22.4) | -29.0 (-30.9…-27.2) |
| zmiana ceny 52 tyg. po szczycie                        | -26.0 (-30.6…-21.7) | -33.6 (-36.7…-30.9) |
| część wzrostu (log), która zostaje 52 tyg. po szczycie | 61.4 (49.4…71.5)    | 45.7 (38.5…51.8)    |
| tygodnie od szczytu do spadku o 25 %                   | 9.00 (8.00…10.00)   | 8.00 (7.00…8.00)    |

## C. Jak wygląda szczyt dużego ruchu (+100 % i więcej): mediany od 26 tyg. przed do 26 tyg. po szczycie

Ruchów z pełnym oknem: 14,278. Wolumen = krotność średniej z tygodni -78..-26 przed szczytem.

|   tyg |   wolumen |   cena_%_szczytu |   zmiennosc_dzienna_% |
|------:|----------:|-----------------:|----------------------:|
|   -26 |      0.92 |             68.5 |                  2.36 |
|   -13 |      0.98 |             76.6 |                  2.3  |
|    -8 |      1.01 |             81.3 |                  2.31 |
|    -4 |      1.04 |             87.4 |                  2.26 |
|    -2 |      1.04 |             91.7 |                  2.2  |
|    -1 |      1.08 |             95.1 |                  2.3  |
|     0 |      1.22 |            100   |                  2.37 |
|     1 |      1.23 |             94.7 |                  2.53 |
|     2 |      1.22 |             90.7 |                  2.65 |
|     4 |      1.19 |             85.7 |                  2.7  |
|     8 |      1.12 |             81.3 |                  2.6  |
|    13 |      1.15 |             77.8 |                  2.63 |
|    26 |      1.11 |             75.5 |                  2.41 |
