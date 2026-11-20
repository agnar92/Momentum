# Etap 71: własna prognoza wzrostu EPS 5 lat w PEG (top 500 USA, P/E bieżące)

Model F5: przyszły CAGR EPS 5 l. = 0.154 + -0.369·EPS 5 l. + 0.137·przychody 5 l. + 0.109·przychody ważone + -0.053·EPS r/r (dopasowany na 4547 obserwacjach 2012-2016)

## Trafność prognozy (vs faktyczny CAGR EPS 5 lat)

| prognoza                         | starty    |   IC_z_faktycznym |   mediana_bledu_pp |
|:---------------------------------|:----------|------------------:|-------------------:|
| F1 historyczny EPS 5 l.          | 2012-2016 |            -0.269 |             11.922 |
| F1 historyczny EPS 5 l.          | 2017-2021 |            -0.206 |             12.151 |
| F2 przychody 5 l.                | 2012-2016 |             0.007 |             10.562 |
| F2 przychody 5 l.                | 2017-2021 |             0.116 |             10.056 |
| F3 przychody ważone (4 kw.)      | 2012-2016 |             0.094 |             10.296 |
| F3 przychody ważone (4 kw.)      | 2017-2021 |             0.154 |             10.61  |
| F4 średnia EPS i przychodów 5 l. | 2012-2016 |            -0.204 |             10.722 |
| F4 średnia EPS i przychodów 5 l. | 2017-2021 |            -0.134 |             10.883 |
| F5 model (dopasowany 2012-16)    | 2012-2016 |             0.284 |              7.329 |
| F5 model (dopasowany 2012-16)    | 2017-2021 |             0.248 |              7.677 |

## Zwrot 3 / 5 lat wg PEG (nadwyżka nad średnią spółek top 500)

| prognoza                                 | grupa     | horyzont   | starty    | koszyk            |   obs |   spolek |   nadwyzka_srednia |   nadwyzka_mediana |   bije_SPY |
|:-----------------------------------------|:----------|:-----------|:----------|:------------------|------:|---------:|-------------------:|-------------------:|-----------:|
| F1 historyczny EPS 5 l.                  | STABILNY  | 36 m       | całość    | PEG >= 2 lub brak |   254 |       29 |             -0.145 |             -0.214 |      0.319 |
| F1 historyczny EPS 5 l.                  | STABILNY  | 36 m       | całość    | PEG 1-2           |   200 |       21 |             -0.051 |             -0.139 |      0.355 |
| F1 historyczny EPS 5 l.                  | STABILNY  | 36 m       | całość    | PEG < 1           |   156 |       15 |              0.536 |              0.463 |      0.788 |
| F1 historyczny EPS 5 l.                  | STABILNY  | 36 m       | 2012-2016 | PEG >= 2 lub brak |   133 |       15 |             -0.073 |             -0.131 |      0.398 |
| F1 historyczny EPS 5 l.                  | STABILNY  | 36 m       | 2012-2016 | PEG 1-2           |    40 |        6 |             -0.202 |             -0.205 |      0.2   |
| F1 historyczny EPS 5 l.                  | STABILNY  | 36 m       | 2012-2016 | PEG < 1           |     9 |        2 |              0.904 |              0.993 |      1     |
| F1 historyczny EPS 5 l.                  | STABILNY  | 36 m       | 2017+     | PEG 1-2           |   160 |       18 |             -0.013 |             -0.127 |      0.394 |
| F1 historyczny EPS 5 l.                  | STABILNY  | 36 m       | 2017+     | PEG < 1           |   147 |       14 |              0.514 |              0.436 |      0.776 |
| F1 historyczny EPS 5 l.                  | STABILNY  | 36 m       | 2017+     | PEG >= 2 lub brak |   121 |       15 |             -0.224 |             -0.28  |      0.231 |
| F1 historyczny EPS 5 l.                  | STABILNY  | 60 m       | całość    | PEG >= 2 lub brak |   220 |       24 |             -0.373 |             -0.259 |      0.15  |
| F1 historyczny EPS 5 l.                  | STABILNY  | 60 m       | całość    | PEG 1-2           |   146 |       13 |             -0.211 |             -0.475 |      0.301 |
| F1 historyczny EPS 5 l.                  | STABILNY  | 60 m       | całość    | PEG < 1           |   137 |       12 |              0.509 |              0.521 |      0.62  |
| F1 historyczny EPS 5 l.                  | STABILNY  | 60 m       | 2012-2016 | PEG >= 2 lub brak |   121 |       14 |             -0.214 |             -0.13  |      0.19  |
| F1 historyczny EPS 5 l.                  | STABILNY  | 60 m       | 2012-2016 | PEG 1-2           |    40 |        6 |             -0.533 |             -0.551 |      0     |
| F1 historyczny EPS 5 l.                  | STABILNY  | 60 m       | 2012-2016 | PEG < 1           |     9 |        2 |              0.882 |              0.848 |      0.889 |
| F1 historyczny EPS 5 l.                  | STABILNY  | 60 m       | 2017+     | PEG 1-2           |   106 |       10 |             -0.09  |             -0.222 |      0.415 |
| F1 historyczny EPS 5 l.                  | STABILNY  | 60 m       | 2017+     | PEG < 1           |   128 |       11 |              0.483 |              0.495 |      0.602 |
| F1 historyczny EPS 5 l.                  | STABILNY  | 60 m       | 2017+     | PEG >= 2 lub brak |    99 |       11 |             -0.567 |             -0.458 |      0.101 |
| F1 historyczny EPS 5 l.                  | wszystkie | 36 m       | całość    | PEG >= 2 lub brak | 47174 |      869 |             -0.007 |             -0.076 |      0.398 |
| F1 historyczny EPS 5 l.                  | wszystkie | 36 m       | całość    | PEG 1-2           |  8178 |      470 |              0.025 |             -0.052 |      0.391 |
| F1 historyczny EPS 5 l.                  | wszystkie | 36 m       | całość    | PEG < 1           |  8988 |      445 |              0.011 |             -0.076 |      0.373 |
| F1 historyczny EPS 5 l.                  | wszystkie | 36 m       | 2012-2016 | PEG >= 2 lub brak | 23621 |      660 |             -0.007 |             -0.036 |      0.452 |
| F1 historyczny EPS 5 l.                  | wszystkie | 36 m       | 2012-2016 | PEG 1-2           |  1812 |      243 |              0.096 |              0.055 |      0.51  |
| F1 historyczny EPS 5 l.                  | wszystkie | 36 m       | 2012-2016 | PEG < 1           |  1474 |      173 |             -0     |             -0.031 |      0.425 |
| F1 historyczny EPS 5 l.                  | wszystkie | 36 m       | 2017+     | PEG >= 2 lub brak | 23553 |      701 |             -0.006 |             -0.122 |      0.344 |
| F1 historyczny EPS 5 l.                  | wszystkie | 36 m       | 2017+     | PEG < 1           |  7514 |      413 |              0.013 |             -0.087 |      0.362 |
| F1 historyczny EPS 5 l.                  | wszystkie | 36 m       | 2017+     | PEG 1-2           |  6366 |      437 |              0.005 |             -0.086 |      0.357 |
| F1 historyczny EPS 5 l.                  | wszystkie | 60 m       | całość    | PEG >= 2 lub brak | 38901 |      792 |             -0.027 |             -0.203 |      0.366 |
| F1 historyczny EPS 5 l.                  | wszystkie | 60 m       | całość    | PEG 1-2           |  6022 |      419 |              0.093 |             -0.142 |      0.364 |
| F1 historyczny EPS 5 l.                  | wszystkie | 60 m       | całość    | PEG < 1           |  6127 |      362 |              0.077 |             -0.182 |      0.357 |
| F1 historyczny EPS 5 l.                  | wszystkie | 60 m       | 2012-2016 | PEG >= 2 lub brak | 22554 |      631 |             -0.006 |             -0.163 |      0.403 |
| F1 historyczny EPS 5 l.                  | wszystkie | 60 m       | 2012-2016 | PEG 1-2           |  1741 |      234 |              0.151 |             -0.048 |      0.422 |
| F1 historyczny EPS 5 l.                  | wszystkie | 60 m       | 2012-2016 | PEG < 1           |  1421 |      165 |             -0.089 |             -0.278 |      0.327 |
| F1 historyczny EPS 5 l.                  | wszystkie | 60 m       | 2017+     | PEG >= 2 lub brak | 16347 |      626 |             -0.055 |             -0.253 |      0.316 |
| F1 historyczny EPS 5 l.                  | wszystkie | 60 m       | 2017+     | PEG < 1           |  4706 |      315 |              0.128 |             -0.146 |      0.365 |
| F1 historyczny EPS 5 l.                  | wszystkie | 60 m       | 2017+     | PEG 1-2           |  4281 |      379 |              0.069 |             -0.169 |      0.341 |
| F2 przychody 5 l.                        | STABILNY  | 36 m       | całość    | PEG >= 2 lub brak |   424 |       39 |             -0.071 |             -0.145 |      0.363 |
| F2 przychody 5 l.                        | STABILNY  | 36 m       | całość    | PEG 1-2           |   136 |       15 |              0.133 |              0.146 |      0.529 |
| F2 przychody 5 l.                        | STABILNY  | 36 m       | całość    | PEG < 1           |    50 |        6 |              0.974 |              0.699 |      0.98  |
| F2 przychody 5 l.                        | STABILNY  | 36 m       | 2012-2016 | PEG >= 2 lub brak |   146 |       17 |             -0.088 |             -0.131 |      0.404 |
| F2 przychody 5 l.                        | STABILNY  | 36 m       | 2012-2016 | PEG 1-2           |    33 |        4 |              0.073 |             -0.139 |      0.273 |
| F2 przychody 5 l.                        | STABILNY  | 36 m       | 2012-2016 | PEG < 1           |     3 |        2 |              0.249 |              0.098 |      0.667 |
| F2 przychody 5 l.                        | STABILNY  | 36 m       | 2017+     | PEG >= 2 lub brak |   278 |       26 |             -0.063 |             -0.157 |      0.342 |
| F2 przychody 5 l.                        | STABILNY  | 36 m       | 2017+     | PEG < 1           |    47 |        5 |              1.02  |              0.725 |      1     |
| F2 przychody 5 l.                        | STABILNY  | 36 m       | 2017+     | PEG 1-2           |   103 |       13 |              0.152 |              0.328 |      0.612 |
| F2 przychody 5 l.                        | STABILNY  | 60 m       | całość    | PEG >= 2 lub brak |   348 |       31 |             -0.255 |             -0.234 |      0.23  |
| F2 przychody 5 l.                        | STABILNY  | 60 m       | całość    | PEG 1-2           |   109 |       11 |              0.025 |             -0.117 |      0.376 |
| F2 przychody 5 l.                        | STABILNY  | 60 m       | całość    | PEG < 1           |    46 |        5 |              0.929 |              0.85  |      0.891 |
| F2 przychody 5 l.                        | STABILNY  | 60 m       | 2012-2016 | PEG >= 2 lub brak |   134 |       16 |             -0.257 |             -0.152 |      0.164 |
| F2 przychody 5 l.                        | STABILNY  | 60 m       | 2012-2016 | PEG 1-2           |    33 |        4 |             -0.162 |             -0.487 |      0.242 |
| F2 przychody 5 l.                        | STABILNY  | 60 m       | 2012-2016 | PEG < 1           |     3 |        2 |              0.153 |             -0.347 |      0.333 |
| F2 przychody 5 l.                        | STABILNY  | 60 m       | 2017+     | PEG >= 2 lub brak |   214 |       19 |             -0.253 |             -0.303 |      0.271 |
| F2 przychody 5 l.                        | STABILNY  | 60 m       | 2017+     | PEG < 1           |    43 |        4 |              0.983 |              0.862 |      0.93  |
| F2 przychody 5 l.                        | STABILNY  | 60 m       | 2017+     | PEG 1-2           |    76 |        9 |              0.106 |             -0.008 |      0.434 |
| F2 przychody 5 l.                        | wszystkie | 36 m       | całość    | PEG >= 2 lub brak | 58431 |      885 |             -0.004 |             -0.072 |      0.395 |
| F2 przychody 5 l.                        | wszystkie | 36 m       | całość    | PEG 1-2           |  3961 |      302 |              0.014 |             -0.088 |      0.37  |
| F2 przychody 5 l.                        | wszystkie | 36 m       | całość    | PEG < 1           |  1948 |      164 |              0.08  |             -0.065 |      0.401 |
| F2 przychody 5 l.                        | wszystkie | 36 m       | 2012-2016 | PEG >= 2 lub brak | 25705 |      664 |              0.003 |             -0.027 |      0.458 |
| F2 przychody 5 l.                        | wszystkie | 36 m       | 2012-2016 | PEG 1-2           |   855 |      111 |             -0.015 |             -0.045 |      0.412 |
| F2 przychody 5 l.                        | wszystkie | 36 m       | 2012-2016 | PEG < 1           |   347 |       52 |             -0.149 |             -0.198 |      0.317 |
| F2 przychody 5 l.                        | wszystkie | 36 m       | 2017+     | PEG >= 2 lub brak | 32726 |      730 |             -0.008 |             -0.112 |      0.345 |
| F2 przychody 5 l.                        | wszystkie | 36 m       | 2017+     | PEG < 1           |  1601 |      141 |              0.13  |             -0.03  |      0.42  |
| F2 przychody 5 l.                        | wszystkie | 36 m       | 2017+     | PEG 1-2           |  3106 |      257 |              0.022 |             -0.109 |      0.359 |
| F2 przychody 5 l.                        | wszystkie | 60 m       | całość    | PEG >= 2 lub brak | 47485 |      802 |             -0.015 |             -0.197 |      0.362 |
| F2 przychody 5 l.                        | wszystkie | 60 m       | całość    | PEG 1-2           |  2458 |      217 |              0.171 |             -0.139 |      0.387 |
| F2 przychody 5 l.                        | wszystkie | 60 m       | całość    | PEG < 1           |  1107 |      110 |              0.248 |             -0.061 |      0.433 |
| F2 przychody 5 l.                        | wszystkie | 60 m       | 2012-2016 | PEG >= 2 lub brak | 24558 |      635 |              0.003 |             -0.155 |      0.404 |
| F2 przychody 5 l.                        | wszystkie | 60 m       | 2012-2016 | PEG 1-2           |   829 |      106 |             -0.083 |             -0.354 |      0.318 |
| F2 przychody 5 l.                        | wszystkie | 60 m       | 2012-2016 | PEG < 1           |   329 |       49 |             -0.017 |             -0.458 |      0.319 |
| F2 przychody 5 l.                        | wszystkie | 60 m       | 2017+     | PEG >= 2 lub brak | 22927 |      653 |             -0.034 |             -0.234 |      0.318 |
| F2 przychody 5 l.                        | wszystkie | 60 m       | 2017+     | PEG < 1           |   778 |       83 |              0.36  |              0.075 |      0.481 |
| F2 przychody 5 l.                        | wszystkie | 60 m       | 2017+     | PEG 1-2           |  1629 |      165 |              0.301 |             -0.058 |      0.422 |
| F3 przychody ważone (4 kw.)              | STABILNY  | 36 m       | całość    | PEG >= 2 lub brak |   373 |       37 |             -0.032 |             -0.129 |      0.386 |
| F3 przychody ważone (4 kw.)              | STABILNY  | 36 m       | całość    | PEG 1-2           |   193 |       24 |              0.107 |              0.044 |      0.456 |
| F3 przychody ważone (4 kw.)              | STABILNY  | 36 m       | całość    | PEG < 1           |    44 |        3 |              0.63  |              0.564 |      0.977 |
| F3 przychody ważone (4 kw.)              | STABILNY  | 36 m       | 2012-2016 | PEG >= 2 lub brak |    93 |       13 |             -0.037 |             -0.096 |      0.43  |
| F3 przychody ważone (4 kw.)              | STABILNY  | 36 m       | 2012-2016 | PEG 1-2           |    89 |       12 |             -0.07  |             -0.177 |      0.337 |
| F3 przychody ważone (4 kw.)              | STABILNY  | 36 m       | 2017+     | PEG 1-2           |   104 |       15 |              0.26  |              0.248 |      0.558 |
| F3 przychody ważone (4 kw.)              | STABILNY  | 36 m       | 2017+     | PEG >= 2 lub brak |   280 |       27 |             -0.03  |             -0.133 |      0.371 |
| F3 przychody ważone (4 kw.)              | STABILNY  | 36 m       | 2017+     | PEG < 1           |    44 |        3 |              0.63  |              0.564 |      0.977 |
| F3 przychody ważone (4 kw.)              | STABILNY  | 60 m       | całość    | PEG >= 2 lub brak |   312 |       30 |             -0.255 |             -0.259 |      0.24  |
| F3 przychody ważone (4 kw.)              | STABILNY  | 60 m       | całość    | PEG 1-2           |   148 |       19 |             -0.062 |             -0.136 |      0.324 |
| F3 przychody ważone (4 kw.)              | STABILNY  | 60 m       | całość    | PEG < 1           |    43 |        3 |              1.057 |              0.96  |      0.907 |
| F3 przychody ważone (4 kw.)              | STABILNY  | 60 m       | 2012-2016 | PEG >= 2 lub brak |    83 |       13 |             -0.279 |             -0.166 |      0.12  |
| F3 przychody ważone (4 kw.)              | STABILNY  | 60 m       | 2012-2016 | PEG 1-2           |    87 |       11 |             -0.185 |             -0.187 |      0.241 |
| F3 przychody ważone (4 kw.)              | STABILNY  | 60 m       | 2017+     | PEG 1-2           |    61 |       11 |              0.115 |              0.053 |      0.443 |
| F3 przychody ważone (4 kw.)              | STABILNY  | 60 m       | 2017+     | PEG >= 2 lub brak |   229 |       20 |             -0.246 |             -0.301 |      0.284 |
| F3 przychody ważone (4 kw.)              | STABILNY  | 60 m       | 2017+     | PEG < 1           |    43 |        3 |              1.057 |              0.96  |      0.907 |
| F3 przychody ważone (4 kw.)              | wszystkie | 36 m       | całość    | PEG < 1           |  5341 |      404 |             -0.024 |             -0.089 |      0.373 |
| F3 przychody ważone (4 kw.)              | wszystkie | 36 m       | całość    | PEG >= 2 lub brak | 52070 |      871 |              0.002 |             -0.069 |      0.397 |
| F3 przychody ważone (4 kw.)              | wszystkie | 36 m       | całość    | PEG 1-2           |  6929 |      535 |              0.005 |             -0.095 |      0.382 |
| F3 przychody ważone (4 kw.)              | wszystkie | 36 m       | 2012-2016 | PEG < 1           |  1807 |      211 |             -0.117 |             -0.138 |      0.367 |
| F3 przychody ważone (4 kw.)              | wszystkie | 36 m       | 2012-2016 | PEG >= 2 lub brak | 22104 |      653 |              0.005 |             -0.019 |      0.463 |
| F3 przychody ważone (4 kw.)              | wszystkie | 36 m       | 2012-2016 | PEG 1-2           |  2996 |      336 |              0.037 |             -0.054 |      0.447 |
| F3 przychody ważone (4 kw.)              | wszystkie | 36 m       | 2017+     | PEG >= 2 lub brak | 29966 |      726 |             -0     |             -0.112 |      0.349 |
| F3 przychody ważone (4 kw.)              | wszystkie | 36 m       | 2017+     | PEG 1-2           |  3933 |      405 |             -0.02  |             -0.123 |      0.333 |
| F3 przychody ważone (4 kw.)              | wszystkie | 36 m       | 2017+     | PEG < 1           |  3534 |      308 |              0.024 |             -0.055 |      0.376 |
| F3 przychody ważone (4 kw.)              | wszystkie | 60 m       | całość    | PEG < 1           |  3317 |      320 |              0.028 |             -0.165 |      0.38  |
| F3 przychody ważone (4 kw.)              | wszystkie | 60 m       | całość    | PEG >= 2 lub brak | 42812 |      790 |             -0.006 |             -0.196 |      0.362 |
| F3 przychody ważone (4 kw.)              | wszystkie | 60 m       | całość    | PEG 1-2           |  4921 |      450 |              0.034 |             -0.18  |      0.38  |
| F3 przychody ważone (4 kw.)              | wszystkie | 60 m       | 2012-2016 | PEG < 1           |  1730 |      198 |             -0.192 |             -0.275 |      0.323 |
| F3 przychody ważone (4 kw.)              | wszystkie | 60 m       | 2012-2016 | PEG >= 2 lub brak | 21113 |      625 |              0.013 |             -0.147 |      0.407 |
| F3 przychody ważone (4 kw.)              | wszystkie | 60 m       | 2012-2016 | PEG 1-2           |  2873 |      316 |              0.023 |             -0.189 |      0.392 |
| F3 przychody ważone (4 kw.)              | wszystkie | 60 m       | 2017+     | PEG >= 2 lub brak | 21699 |      654 |             -0.024 |             -0.235 |      0.318 |
| F3 przychody ważone (4 kw.)              | wszystkie | 60 m       | 2017+     | PEG 1-2           |  2048 |      295 |              0.049 |             -0.162 |      0.362 |
| F3 przychody ważone (4 kw.)              | wszystkie | 60 m       | 2017+     | PEG < 1           |  1587 |      210 |              0.269 |             -0.019 |      0.442 |
| F4 średnia EPS i przychodów 5 l.         | STABILNY  | 36 m       | całość    | PEG >= 2 lub brak |   287 |       33 |             -0.14  |             -0.218 |      0.321 |
| F4 średnia EPS i przychodów 5 l.         | STABILNY  | 36 m       | całość    | PEG 1-2           |   227 |       22 |              0.019 |             -0.04  |      0.41  |
| F4 średnia EPS i przychodów 5 l.         | STABILNY  | 36 m       | całość    | PEG < 1           |    96 |       10 |              0.752 |              0.551 |      0.938 |
| F4 średnia EPS i przychodów 5 l.         | STABILNY  | 36 m       | 2012-2016 | PEG >= 2 lub brak |   130 |       15 |             -0.079 |             -0.144 |      0.408 |
| F4 średnia EPS i przychodów 5 l.         | STABILNY  | 36 m       | 2012-2016 | PEG 1-2           |    46 |        8 |             -0.107 |             -0.164 |      0.239 |
| F4 średnia EPS i przychodów 5 l.         | STABILNY  | 36 m       | 2012-2016 | PEG < 1           |     6 |        2 |              0.918 |              1.031 |      1     |
| F4 średnia EPS i przychodów 5 l.         | STABILNY  | 36 m       | 2017+     | PEG 1-2           |   181 |       18 |              0.052 |              0.048 |      0.453 |
| F4 średnia EPS i przychodów 5 l.         | STABILNY  | 36 m       | 2017+     | PEG < 1           |    90 |        9 |              0.741 |              0.524 |      0.933 |
| F4 średnia EPS i przychodów 5 l.         | STABILNY  | 36 m       | 2017+     | PEG >= 2 lub brak |   157 |       19 |             -0.19  |             -0.264 |      0.248 |
| F4 średnia EPS i przychodów 5 l.         | STABILNY  | 60 m       | całość    | PEG >= 2 lub brak |   245 |       27 |             -0.374 |             -0.28  |      0.171 |
| F4 średnia EPS i przychodów 5 l.         | STABILNY  | 60 m       | całość    | PEG 1-2           |   166 |       16 |             -0.136 |             -0.256 |      0.301 |
| F4 średnia EPS i przychodów 5 l.         | STABILNY  | 60 m       | całość    | PEG < 1           |    92 |        9 |              0.772 |              0.822 |      0.761 |
| F4 średnia EPS i przychodów 5 l.         | STABILNY  | 60 m       | 2012-2016 | PEG >= 2 lub brak |   118 |       14 |             -0.235 |             -0.146 |      0.186 |
| F4 średnia EPS i przychodów 5 l.         | STABILNY  | 60 m       | 2012-2016 | PEG 1-2           |    46 |        8 |             -0.375 |             -0.512 |      0.087 |
| F4 średnia EPS i przychodów 5 l.         | STABILNY  | 60 m       | 2012-2016 | PEG < 1           |     6 |        2 |              0.959 |              1.216 |      0.833 |
| F4 średnia EPS i przychodów 5 l.         | STABILNY  | 60 m       | 2017+     | PEG 1-2           |   120 |       12 |             -0.045 |             -0.025 |      0.383 |
| F4 średnia EPS i przychodów 5 l.         | STABILNY  | 60 m       | 2017+     | PEG < 1           |    86 |        8 |              0.759 |              0.8   |      0.756 |
| F4 średnia EPS i przychodów 5 l.         | STABILNY  | 60 m       | 2017+     | PEG >= 2 lub brak |   127 |       14 |             -0.502 |             -0.463 |      0.157 |
| F4 średnia EPS i przychodów 5 l.         | wszystkie | 36 m       | całość    | PEG >= 2 lub brak | 49906 |      873 |             -0.003 |             -0.072 |      0.399 |
| F4 średnia EPS i przychodów 5 l.         | wszystkie | 36 m       | całość    | PEG 1-2           |  8034 |      499 |              0.014 |             -0.066 |      0.383 |
| F4 średnia EPS i przychodów 5 l.         | wszystkie | 36 m       | całość    | PEG < 1           |  6400 |      401 |              0.005 |             -0.091 |      0.366 |
| F4 średnia EPS i przychodów 5 l.         | wszystkie | 36 m       | 2012-2016 | PEG >= 2 lub brak | 24267 |      662 |             -0.003 |             -0.032 |      0.455 |
| F4 średnia EPS i przychodów 5 l.         | wszystkie | 36 m       | 2012-2016 | PEG 1-2           |  1599 |      220 |              0.092 |              0.046 |      0.504 |
| F4 średnia EPS i przychodów 5 l.         | wszystkie | 36 m       | 2012-2016 | PEG < 1           |  1041 |      137 |             -0.08  |             -0.086 |      0.368 |
| F4 średnia EPS i przychodów 5 l.         | wszystkie | 36 m       | 2017+     | PEG >= 2 lub brak | 25639 |      709 |             -0.003 |             -0.114 |      0.345 |
| F4 średnia EPS i przychodów 5 l.         | wszystkie | 36 m       | 2017+     | PEG < 1           |  5359 |      364 |              0.021 |             -0.092 |      0.365 |
| F4 średnia EPS i przychodów 5 l.         | wszystkie | 36 m       | 2017+     | PEG 1-2           |  6435 |      463 |             -0.005 |             -0.099 |      0.354 |
| F4 średnia EPS i przychodów 5 l.         | wszystkie | 60 m       | całość    | PEG >= 2 lub brak | 41085 |      795 |             -0.017 |             -0.197 |      0.366 |
| F4 średnia EPS i przychodów 5 l.         | wszystkie | 60 m       | całość    | PEG 1-2           |  5641 |      420 |              0.087 |             -0.129 |      0.375 |
| F4 średnia EPS i przychodów 5 l.         | wszystkie | 60 m       | całość    | PEG < 1           |  4324 |      316 |              0.051 |             -0.221 |      0.346 |
| F4 średnia EPS i przychodów 5 l.         | wszystkie | 60 m       | 2012-2016 | PEG >= 2 lub brak | 23182 |      633 |              0.002 |             -0.159 |      0.405 |
| F4 średnia EPS i przychodów 5 l.         | wszystkie | 60 m       | 2012-2016 | PEG 1-2           |  1533 |      210 |              0.117 |             -0.059 |      0.418 |
| F4 średnia EPS i przychodów 5 l.         | wszystkie | 60 m       | 2012-2016 | PEG < 1           |  1001 |      131 |             -0.234 |             -0.398 |      0.258 |
| F4 średnia EPS i przychodów 5 l.         | wszystkie | 60 m       | 2017+     | PEG >= 2 lub brak | 17903 |      636 |             -0.043 |             -0.241 |      0.315 |
| F4 średnia EPS i przychodów 5 l.         | wszystkie | 60 m       | 2017+     | PEG < 1           |  3323 |      265 |              0.137 |             -0.157 |      0.373 |
| F4 średnia EPS i przychodów 5 l.         | wszystkie | 60 m       | 2017+     | PEG 1-2           |  4108 |      371 |              0.076 |             -0.152 |      0.359 |
| F5 model (dopasowany 2012-16)            | STABILNY  | 36 m       | całość    | PEG >= 2 lub brak |   560 |       46 |              0.04  |             -0.044 |      0.43  |
| F5 model (dopasowany 2012-16)            | STABILNY  | 36 m       | całość    | PEG 1-2           |    49 |        7 |              0.264 |              0.363 |      0.673 |
| F5 model (dopasowany 2012-16)            | STABILNY  | 36 m       | całość    | PEG < 1           |     1 |        1 |              1.218 |              1.218 |      1     |
| F5 model (dopasowany 2012-16)            | STABILNY  | 36 m       | 2012-2016 | PEG >= 2 lub brak |   171 |       19 |             -0.04  |             -0.09  |      0.409 |
| F5 model (dopasowany 2012-16)            | STABILNY  | 36 m       | 2012-2016 | PEG 1-2           |    11 |        1 |             -0.26  |             -0.259 |      0     |
| F5 model (dopasowany 2012-16)            | STABILNY  | 36 m       | 2017+     | PEG >= 2 lub brak |   389 |       32 |              0.075 |             -0.024 |      0.44  |
| F5 model (dopasowany 2012-16)            | STABILNY  | 36 m       | 2017+     | PEG 1-2           |    38 |        6 |              0.416 |              0.505 |      0.868 |
| F5 model (dopasowany 2012-16)            | STABILNY  | 36 m       | 2017+     | PEG < 1           |     1 |        1 |              1.218 |              1.218 |      1     |
| F5 model (dopasowany 2012-16)            | STABILNY  | 60 m       | całość    | PEG >= 2 lub brak |   458 |       36 |             -0.15  |             -0.188 |      0.288 |
| F5 model (dopasowany 2012-16)            | STABILNY  | 60 m       | całość    | PEG 1-2           |    44 |        6 |              0.543 |              0.508 |      0.659 |
| F5 model (dopasowany 2012-16)            | STABILNY  | 60 m       | całość    | PEG < 1           |     1 |        1 |              1.641 |              1.641 |      1     |
| F5 model (dopasowany 2012-16)            | STABILNY  | 60 m       | 2012-2016 | PEG >= 2 lub brak |   159 |       18 |             -0.2   |             -0.153 |      0.195 |
| F5 model (dopasowany 2012-16)            | STABILNY  | 60 m       | 2012-2016 | PEG 1-2           |    11 |        1 |             -0.673 |             -0.684 |      0     |
| F5 model (dopasowany 2012-16)            | STABILNY  | 60 m       | 2017+     | PEG >= 2 lub brak |   299 |       23 |             -0.123 |             -0.233 |      0.338 |
| F5 model (dopasowany 2012-16)            | STABILNY  | 60 m       | 2017+     | PEG 1-2           |    33 |        5 |              0.949 |              0.689 |      0.879 |
| F5 model (dopasowany 2012-16)            | STABILNY  | 60 m       | 2017+     | PEG < 1           |     1 |        1 |              1.641 |              1.641 |      1     |
| F5 model (dopasowany 2012-16)            | wszystkie | 36 m       | całość    | PEG >= 2 lub brak | 54304 |      888 |             -0     |             -0.075 |      0.395 |
| F5 model (dopasowany 2012-16)            | wszystkie | 36 m       | całość    | PEG 1-2           |  8315 |      386 |             -0.013 |             -0.068 |      0.375 |
| F5 model (dopasowany 2012-16)            | wszystkie | 36 m       | całość    | PEG < 1           |  1721 |      160 |              0.075 |             -0.01  |      0.424 |
| F5 model (dopasowany 2012-16)            | wszystkie | 36 m       | 2012-2016 | PEG >= 2 lub brak | 24102 |      663 |             -0.004 |             -0.032 |      0.455 |
| F5 model (dopasowany 2012-16)            | wszystkie | 36 m       | 2012-2016 | PEG 1-2           |  2374 |      230 |              0.034 |              0.005 |      0.457 |
| F5 model (dopasowany 2012-16)            | wszystkie | 36 m       | 2012-2016 | PEG < 1           |   431 |       59 |              0.011 |             -0.043 |      0.404 |
| F5 model (dopasowany 2012-16)            | wszystkie | 36 m       | 2017+     | PEG >= 2 lub brak | 30202 |      729 |              0.002 |             -0.114 |      0.348 |
| F5 model (dopasowany 2012-16)            | wszystkie | 36 m       | 2017+     | PEG 1-2           |  5941 |      346 |             -0.032 |             -0.099 |      0.342 |
| F5 model (dopasowany 2012-16)            | wszystkie | 36 m       | 2017+     | PEG < 1           |  1290 |      142 |              0.097 |              0.004 |      0.431 |
| F5 model (dopasowany 2012-16)            | wszystkie | 60 m       | całość    | PEG >= 2 lub brak | 43634 |      802 |             -0.002 |             -0.2   |      0.367 |
| F5 model (dopasowany 2012-16)            | wszystkie | 60 m       | całość    | PEG 1-2           |  6166 |      321 |             -0.007 |             -0.149 |      0.352 |
| F5 model (dopasowany 2012-16)            | wszystkie | 60 m       | całość    | PEG < 1           |  1250 |      129 |              0.115 |             -0.183 |      0.356 |
| F5 model (dopasowany 2012-16)            | wszystkie | 60 m       | 2012-2016 | PEG >= 2 lub brak | 23008 |      634 |              0     |             -0.157 |      0.406 |
| F5 model (dopasowany 2012-16)            | wszystkie | 60 m       | 2012-2016 | PEG 1-2           |  2280 |      222 |              0.008 |             -0.162 |      0.371 |
| F5 model (dopasowany 2012-16)            | wszystkie | 60 m       | 2012-2016 | PEG < 1           |   428 |       57 |             -0.051 |             -0.343 |      0.25  |
| F5 model (dopasowany 2012-16)            | wszystkie | 60 m       | 2017+     | PEG >= 2 lub brak | 20626 |      645 |             -0.005 |             -0.241 |      0.324 |
| F5 model (dopasowany 2012-16)            | wszystkie | 60 m       | 2017+     | PEG 1-2           |  3886 |      277 |             -0.015 |             -0.141 |      0.34  |
| F5 model (dopasowany 2012-16)            | wszystkie | 60 m       | 2017+     | PEG < 1           |   822 |      111 |              0.201 |             -0.05  |      0.411 |
| F* faktyczny przyszły EPS (nieosiągalne) | STABILNY  | 36 m       | całość    | PEG 1-2           |    82 |       13 |              0.34  |              0.238 |      0.732 |
| F* faktyczny przyszły EPS (nieosiągalne) | STABILNY  | 36 m       | całość    | PEG >= 2 lub brak |   470 |       41 |             -0.045 |             -0.177 |      0.345 |
| F* faktyczny przyszły EPS (nieosiągalne) | STABILNY  | 36 m       | całość    | PEG < 1           |    58 |        5 |              0.514 |              0.407 |      0.914 |
| F* faktyczny przyszły EPS (nieosiągalne) | STABILNY  | 36 m       | 2012-2016 | PEG 1-2           |    25 |        7 |              0.083 |              0.115 |      0.52  |
| F* faktyczny przyszły EPS (nieosiągalne) | STABILNY  | 36 m       | 2012-2016 | PEG >= 2 lub brak |   153 |       16 |             -0.082 |             -0.191 |      0.346 |
| F* faktyczny przyszły EPS (nieosiągalne) | STABILNY  | 36 m       | 2012-2016 | PEG < 1           |     4 |        1 |              0.183 |              0.163 |      1     |
| F* faktyczny przyszły EPS (nieosiągalne) | STABILNY  | 36 m       | 2017+     | PEG >= 2 lub brak |   317 |       29 |             -0.027 |             -0.166 |      0.344 |
| F* faktyczny przyszły EPS (nieosiągalne) | STABILNY  | 36 m       | 2017+     | PEG 1-2           |    57 |        8 |              0.452 |              0.437 |      0.825 |
| F* faktyczny przyszły EPS (nieosiągalne) | STABILNY  | 36 m       | 2017+     | PEG < 1           |    54 |        4 |              0.539 |              0.455 |      0.907 |
| F* faktyczny przyszły EPS (nieosiągalne) | STABILNY  | 60 m       | całość    | PEG 1-2           |    82 |       13 |              0.302 |              0.206 |      0.512 |
| F* faktyczny przyszły EPS (nieosiągalne) | STABILNY  | 60 m       | całość    | PEG >= 2 lub brak |   363 |       30 |             -0.337 |             -0.379 |      0.176 |
| F* faktyczny przyszły EPS (nieosiągalne) | STABILNY  | 60 m       | całość    | PEG < 1           |    58 |        5 |              0.94  |              0.854 |      0.966 |
| F* faktyczny przyszły EPS (nieosiągalne) | STABILNY  | 60 m       | 2012-2016 | PEG 1-2           |    25 |        7 |              0.167 |              0.159 |      0.56  |
| F* faktyczny przyszły EPS (nieosiągalne) | STABILNY  | 60 m       | 2012-2016 | PEG >= 2 lub brak |   141 |       15 |             -0.312 |             -0.284 |      0.099 |
| F* faktyczny przyszły EPS (nieosiągalne) | STABILNY  | 60 m       | 2012-2016 | PEG < 1           |     4 |        1 |              0.132 |              0.167 |      0.75  |
| F* faktyczny przyszły EPS (nieosiągalne) | STABILNY  | 60 m       | 2017+     | PEG >= 2 lub brak |   222 |       19 |             -0.353 |             -0.396 |      0.225 |
| F* faktyczny przyszły EPS (nieosiągalne) | STABILNY  | 60 m       | 2017+     | PEG 1-2           |    57 |        8 |              0.361 |              0.277 |      0.491 |
| F* faktyczny przyszły EPS (nieosiągalne) | STABILNY  | 60 m       | 2017+     | PEG < 1           |    54 |        4 |              0.999 |              0.903 |      0.981 |
| F* faktyczny przyszły EPS (nieosiągalne) | wszystkie | 36 m       | całość    | PEG >= 2 lub brak | 47843 |      885 |             -0.082 |             -0.154 |      0.323 |
| F* faktyczny przyszły EPS (nieosiągalne) | wszystkie | 36 m       | całość    | PEG 1-2           | 10871 |      475 |              0.167 |              0.118 |      0.574 |
| F* faktyczny przyszły EPS (nieosiągalne) | wszystkie | 36 m       | całość    | PEG < 1           |  5626 |      277 |              0.373 |              0.208 |      0.646 |
| F* faktyczny przyszły EPS (nieosiągalne) | wszystkie | 36 m       | 2012-2016 | PEG >= 2 lub brak | 18056 |      637 |             -0.119 |             -0.133 |      0.363 |
| F* faktyczny przyszły EPS (nieosiągalne) | wszystkie | 36 m       | 2012-2016 | PEG 1-2           |  5916 |      379 |              0.158 |              0.121 |      0.609 |
| F* faktyczny przyszły EPS (nieosiągalne) | wszystkie | 36 m       | 2012-2016 | PEG < 1           |  2935 |      206 |              0.412 |              0.233 |      0.708 |
| F* faktyczny przyszły EPS (nieosiągalne) | wszystkie | 36 m       | 2017+     | PEG 1-2           |  4955 |      372 |              0.178 |              0.111 |      0.532 |
| F* faktyczny przyszły EPS (nieosiągalne) | wszystkie | 36 m       | 2017+     | PEG >= 2 lub brak | 29787 |      732 |             -0.06  |             -0.166 |      0.298 |
| F* faktyczny przyszły EPS (nieosiągalne) | wszystkie | 36 m       | 2017+     | PEG < 1           |  2691 |      190 |              0.331 |              0.179 |      0.579 |
| F* faktyczny przyszły EPS (nieosiągalne) | wszystkie | 60 m       | całość    | PEG >= 2 lub brak | 34553 |      782 |             -0.258 |             -0.386 |      0.255 |
| F* faktyczny przyszły EPS (nieosiągalne) | wszystkie | 60 m       | całość    | PEG 1-2           | 10871 |      475 |              0.336 |              0.173 |      0.548 |
| F* faktyczny przyszły EPS (nieosiągalne) | wszystkie | 60 m       | całość    | PEG < 1           |  5626 |      277 |              0.938 |              0.462 |      0.685 |
| F* faktyczny przyszły EPS (nieosiągalne) | wszystkie | 60 m       | 2012-2016 | PEG >= 2 lub brak | 16865 |      603 |             -0.256 |             -0.375 |      0.289 |
| F* faktyczny przyszły EPS (nieosiągalne) | wszystkie | 60 m       | 2012-2016 | PEG 1-2           |  5916 |      379 |              0.304 |              0.177 |      0.571 |
| F* faktyczny przyszły EPS (nieosiągalne) | wszystkie | 60 m       | 2012-2016 | PEG < 1           |  2935 |      206 |              0.857 |              0.417 |      0.69  |
| F* faktyczny przyszły EPS (nieosiągalne) | wszystkie | 60 m       | 2017+     | PEG 1-2           |  4955 |      372 |              0.375 |              0.165 |      0.521 |
| F* faktyczny przyszły EPS (nieosiągalne) | wszystkie | 60 m       | 2017+     | PEG >= 2 lub brak | 17688 |      629 |             -0.261 |             -0.394 |      0.223 |
| F* faktyczny przyszły EPS (nieosiągalne) | wszystkie | 60 m       | 2017+     | PEG < 1           |  2691 |      190 |              1.025 |              0.523 |      0.68  |
