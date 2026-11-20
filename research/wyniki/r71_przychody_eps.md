# Etap 49: przeszłe przychody -> przyszły EPS 5 lat -> cena (S&P 500 z danymi SEC, starty 2012-2021)

IC = średnia korelacja rang (po miesiącach startu). EPS_przyszly_5l = CAGR EPS TTM w kolejnych 5 latach (znany w t + 60). e60 = nadwyżka ceny 5 lat.

| cel                   | predyktor                   |     IC |       t |   miesiecy |
|:----------------------|:----------------------------|-------:|--------:|-----------:|
| EPS_przyszly_5l       | przychody 5 lat (CAGR)      |  0.08  |   2.68  |         81 |
| EPS_przyszly_5l       | przychody 3 lata (CAGR)     |  0.079 |   2.159 |        106 |
| EPS_przyszly_5l       | EPS 5 lat (CAGR)            | -0.22  |  -9.893 |         80 |
| EPS_przyszly_5l       | EPS 3 lata (CAGR)           | -0.193 | -12.482 |         94 |
| EPS_przyszly_5l       | EPS TTM r/r                 | -0.219 |  -9.4   |        117 |
| EPS_przyszly_5l       | przychody (estymata ważona) |  0.12  |   3.677 |        117 |
| EPS_przyszly_5l       | marża operacyjna            | -0.135 | -13.544 |        117 |
| EPS_przyszly_5l       | ROE                         | -0.223 | -10.64  |        117 |
| EPS_przyszly_5l       | quick ratio                 |  0.043 |   0.832 |        117 |
| EPS_przyszly_5l       | dług / kapitał              | -0.056 |  -4.535 |        117 |
| EPS_przyszly_5l       | P/E                         |  0.368 |  30.06  |        117 |
| przychody_przyszle_5l | przychody 5 lat (CAGR)      |  0.307 |  12.621 |         81 |
| przychody_przyszle_5l | przychody 3 lata (CAGR)     |  0.284 |   7.037 |        104 |
| przychody_przyszle_5l | EPS 5 lat (CAGR)            |  0.142 |   3.406 |         80 |
| przychody_przyszle_5l | EPS 3 lata (CAGR)           |  0.159 |  10.073 |         92 |
| przychody_przyszle_5l | EPS TTM r/r                 |  0.063 |   4.653 |        117 |
| przychody_przyszle_5l | przychody (estymata ważona) |  0.318 |   6.629 |        117 |
| przychody_przyszle_5l | marża operacyjna            |  0.004 |   0.344 |        117 |
| przychody_przyszle_5l | ROE                         | -0.026 |  -1.583 |        117 |
| przychody_przyszle_5l | quick ratio                 |  0.216 |  13.469 |        117 |
| przychody_przyszle_5l | dług / kapitał              | -0.079 |  -4.78  |        117 |
| przychody_przyszle_5l | P/E                         |  0.3   |  36.181 |        117 |
| e60                   | przychody 5 lat (CAGR)      |  0.041 |   1.291 |         82 |
| e60                   | przychody 3 lata (CAGR)     |  0.049 |   1.459 |        106 |
| e60                   | EPS 5 lat (CAGR)            |  0.026 |   1.205 |         80 |
| e60                   | EPS 3 lata (CAGR)           |  0.041 |   1.053 |         94 |
| e60                   | EPS TTM r/r                 | -0.011 |  -0.462 |        117 |
| e60                   | przychody (estymata ważona) |  0.038 |   0.661 |        117 |
| e60                   | marża operacyjna            |  0.008 |   0.391 |        117 |
| e60                   | ROE                         |  0.044 |   1.146 |        117 |
| e60                   | quick ratio                 |  0.108 |   4.072 |        117 |
| e60                   | dług / kapitał              | -0.026 |  -4.257 |        117 |
| e60                   | P/E                         |  0.001 |   0.022 |        117 |

## Kwintyle wzrostu przychodów z 5 lat (K1 najwolniej, K5 najszybciej)

|   q |   przychody_5l_mediana |   EPS_przyszly_mediana |   przychody_przyszle_mediana |   nadwyzka_ceny_5l_srednia |    n |
|----:|-----------------------:|-----------------------:|-----------------------------:|---------------------------:|-----:|
|   1 |                 -0.036 |                  0.118 |                        0.04  |                      0.055 | 4056 |
|   2 |                  0.013 |                  0.094 |                        0.039 |                     -0.035 | 4008 |
|   3 |                  0.047 |                  0.114 |                        0.056 |                      0.061 | 4015 |
|   4 |                  0.081 |                  0.118 |                        0.068 |                      0.124 | 4008 |
|   5 |                  0.167 |                  0.155 |                        0.095 |                      0.295 | 4041 |

Korelacja rang przyszłego CAGR EPS 5 lat z nadwyżką ceny w tych samych 5 latach: 0.422 (t 25.6). Przy tym samym przyszłym wzroście EPS wyższe P/E na starcie -> nadwyżka: beta rang -0.187 (t -3.0).
