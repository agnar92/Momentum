# Etap 47: parametry Finviz a zwroty (S&P 500 z danymi SEC, starty 2012-2025)

## Każdy parametr osobno (IC = korelacja rang z nadwyżką)

| parametr                      |   pokrycie |   IC_12 |    t_12 |   IC_60 |    t_60 |   spread_60 |   monotonia_60 |
|:------------------------------|-----------:|--------:|--------:|--------:|--------:|------------:|---------------:|
| quick ratio                   |      0.817 |   0.008 |   0.28  |   0.088 |   5.23  |       0.556 |            0.9 |
| EPS 5 lat (CAGR)              |      0.633 |   0.004 |   0.172 |   0.052 |   3.782 |       0.208 |            0.9 |
| zwrot 3 mies.                 |      0.999 |   0.009 |   0.523 |   0.046 |   3.361 |       0.129 |            1   |
| marża operacyjna              |      0.652 |   0.006 |   0.216 |   0.055 |   2.838 |      -0.001 |           -0.1 |
| zwrot 6 mies.                 |      0.998 |   0.005 |   0.204 |   0.054 |   2.662 |       0.137 |            1   |
| wypłata dywidendy / zysk      |      0.792 |   0.018 |   1.712 |   0.081 |   2.644 |       0.043 |            0.6 |
| odległość od SMA 10 mies.     |      0.996 |   0.004 |   0.158 |   0.057 |   2.575 |       0.139 |            1   |
| marża brutto                  |      0.427 |   0.045 |   1.21  |   0.122 |   2.486 |       0.283 |            0.9 |
| dług / kapitał                |      0.889 |   0.003 |   0.171 |  -0.022 |  -2.322 |      -0.128 |           -1   |
| stopa dywidendy               |      0.998 |   0.017 |   1.515 |   0.068 |   2.284 |      -0.069 |           -0.1 |
| current ratio                 |      0.817 |  -0.008 |  -0.267 |   0.047 |   2.245 |       0.443 |            0.6 |
| marża netto                   |      0.748 |  -0.008 |  -0.409 |   0.041 |   2.117 |       0.121 |            0.6 |
| log kapitalizacji             |      0.853 |   0     |   0.01  |   0.047 |   2.051 |       0.022 |            0   |
| P/B                           |      0.756 |   0.036 |   0.82  |   0.099 |   1.988 |       0.377 |            1   |
| odległość od maks. 12 mies.   |      0.995 |   0.002 |   0.073 |   0.063 |   1.887 |       0.061 |            0.7 |
| zwrot 12 mies.                |      0.995 |  -0.005 |  -0.164 |   0.057 |   1.887 |       0.122 |            1   |
| EPS 3 lata (CAGR)             |      0.667 |   0.016 |   0.714 |   0.064 |   1.808 |       0.217 |            1   |
| przychody 3 lata (CAGR)       |      0.771 |   0.012 |   0.476 |   0.056 |   1.768 |       0.271 |            0.9 |
| ROE                           |      0.769 |   0.023 |   1.055 |   0.067 |   1.657 |       0.171 |            0.9 |
| ROA                           |      0.843 |   0.001 |   0.04  |   0.075 |   1.629 |       0.226 |            0.9 |
| przychody kwartał r/r         |      0.839 |  -0.017 |  -0.69  |   0.063 |   1.332 |       0.175 |            0.9 |
| EV/EBITDA                     |      0.594 |   0.016 |   0.445 |   0.056 |   1.287 |       0.367 |            1   |
| przychody (estymata ważona)   |      0.839 |  -0.02  |  -0.785 |   0.057 |   1.048 |       0.143 |            0.8 |
| zmienność 12 mies.            |      0.996 |   0.008 |   0.193 |  -0.043 |  -1.015 |       0.215 |            0.9 |
| przychody 5 lat (CAGR)        |      0.653 |  -0.006 |  -0.167 |   0.042 |   1.009 |       0.243 |            0.9 |
| przychody TTM r/r             |      0.851 |  -0.015 |  -0.592 |   0.048 |   0.882 |       0.132 |            0.8 |
| cena / gotówka                |      0.768 |  -0.02  |  -0.466 |  -0.023 |  -0.875 |      -0.121 |           -0.6 |
| dług długoterminowy / kapitał |      0.546 |   0.033 |   1.714 |   0.025 |   0.845 |       0.149 |            0.4 |
| P/S                           |      0.731 |  -0.007 |  -0.188 |   0.035 |   0.728 |       0.144 |            0.7 |
| ROIC (przybliżenie)           |      0.625 |   0.005 |   0.203 |   0.033 |   0.66  |       0.112 |            0.3 |
| EV/Sales                      |      0.731 |  -0.007 |  -0.19  |   0.025 |   0.573 |       0.085 |            0.9 |
| FCF yield                     |      0.66  |  -0.003 |  -0.109 |   0.02  |   0.501 |       0.039 |            0   |
| P/FCF                         |      0.601 |   0.023 |   0.589 |   0.023 |   0.367 |       0.125 |            0.9 |
| PEG (EPS 5 lat)               |      0.529 |   0.028 |   0.941 |  -0.016 |  -0.276 |      -0.16  |           -0.6 |
| forward P/E (estymata)        |      0.752 |  -0.001 |  -0.019 |   0.01  |   0.204 |       0.08  |            0.4 |
| PEG (estymata)                |      0.573 |   0.021 |   0.821 |  -0.011 |  -0.201 |      -0.096 |           -0.6 |
| E/P                           |      0.722 |  -0.005 |  -0.165 |  -0.007 |  -0.191 |      -0.139 |           -0.3 |
| EPS TTM r/r                   |      0.822 |  -0.026 |  -1.299 |   0.003 |   0.12  |      -0.032 |           -0.2 |
| P/E                           |      0.863 |  -0.009 |  -0.251 |   0.003 |   0.064 |       0.088 |            0.3 |
| wzrost dywidendy r/r          |      0.034 | nan     | nan     | nan     | nan     |     nan     |          nan   |

## Progi Finviz (nadwyżka 5 lat)

| parametr               | prog   |   roznica |      t |   nadwyzka_przechodzacych |   sr_spolek |
|:-----------------------|:-------|----------:|-------:|--------------------------:|------------:|
| PEG (EPS 5 lat)        | < 1    |     0.029 |  0.277 |                     0.013 |      67.632 |
| PEG (EPS 5 lat)        | < 2    |     0.195 |  3.587 |                     0.147 |     124.565 |
| PEG (EPS 5 lat)        | < 3    |     0.157 |  4.649 |                     0.103 |     157.109 |
| PEG (estymata)         | < 1    |     0.002 |  0.013 |                    -0     |      23.299 |
| PEG (estymata)         | < 2    |     0.075 |  1.286 |                     0.064 |      57.009 |
| przychody 5 lat (CAGR) | > 10 % |     0.208 |  7.034 |                     0.178 |      54.989 |
| przychody 5 lat (CAGR) | > 20 % |     0.327 |  5.893 |                     0.314 |      17.59  |
| przychody 5 lat (CAGR) | > 30 % |    -0.352 | -3.707 |                    -0.346 |       6.4   |
| ROE                    | > 10 % |     0.067 |  1.62  |                     0.03  |     193.231 |
| ROE                    | > 15 % |     0.076 |  0.906 |                     0.046 |     137.051 |
| ROE                    | > 20 % |     0.105 |  1.197 |                     0.074 |      98.077 |
| dług / kapitał         | < 0,5  |     0.09  |  4.263 |                     0.038 |     216.077 |
| dług / kapitał         | < 1    |     0.008 |  0.635 |                     0.002 |     270.205 |
| P/E                    | < 15   |    -0.125 | -2.081 |                    -0.104 |      75.991 |
| P/E                    | < 25   |    -0.059 | -1.639 |                    -0.027 |     196.274 |
| marża operacyjna       | > 15 % |     0.073 |  1.764 |                     0.05  |     116.436 |
| marża operacyjna       | > 25 % |     0.114 |  4.641 |                     0.101 |      44.795 |
| EPS 5 lat (CAGR)       | > 10 % |     0.185 |  8.075 |                     0.124 |     145.922 |
| EPS 5 lat (CAGR)       | > 20 % |     0.186 |  1.689 |                     0.147 |      65.64  |

## Składniki strategii

| skladnik               |   roznica |      t |   nadwyzka_przechodzacych |   sr_spolek |
|:-----------------------|----------:|-------:|--------------------------:|------------:|
| PEG < 2                |     0.195 |  3.587 |                     0.147 |     124.565 |
| przychody 5 lat > 30 % |    -0.352 | -3.707 |                    -0.346 |       6.4   |
| ROE > 15 %             |     0.076 |  0.906 |                     0.046 |     137.051 |
| dług / kapitał < 0,5   |     0.09  |  4.263 |                     0.038 |     216.077 |

| para                                          |   roznica |      t |   nadwyzka_przechodzacych |   sr_spolek |   interakcja |
|:----------------------------------------------|----------:|-------:|--------------------------:|------------:|-------------:|
| PEG < 2 + przychody 5 lat > 30 %              |    -0.225 | -2.936 |                    -0.223 |       3.296 |       -0.069 |
| PEG < 2 + ROE > 15 %                          |     0.213 |  4.231 |                     0.171 |      72.69  |       -0.058 |
| PEG < 2 + dług / kapitał < 0,5                |     0.189 |  4.835 |                     0.15  |      80.33  |       -0.096 |
| przychody 5 lat > 30 % + ROE > 15 %           |    -0.439 | -6.328 |                    -0.435 |       3.348 |       -0.163 |
| przychody 5 lat > 30 % + dług / kapitał < 0,5 |    -0.077 | -0.658 |                    -0.076 |       4.319 |        0.185 |
| ROE > 15 % + dług / kapitał < 0,5             |     0.095 |  1.377 |                     0.071 |      93.59  |       -0.071 |

Wszystkie 4: None

Bez jednego: {"PEG < 2": null, "przychody 5 lat > 30 %": {"roznica": 0.23559459903873248, "t": 7.341807915923946, "nadwyzka_przechodzacych": 0.20255266278419884, "sr_spolek": 50.3448275862069}, "ROE > 15 %": {"roznica": 0.15594418342916117, "t": 2.461575476985554, "nadwyzka_przechodzacych": 0.15480746381717195, "sr_spolek": 3.3076923076923075}, "dług / kapitał < 0,5": null}

## Model LightGBM (poza próbą 2016-2025): IC 0.049, t 2.31; nadwyżka 12 mies. w kwintylach [-0.007, -0.012, 0.001, 0.007, 0.01]

| parametr                      |   shap |
|:------------------------------|-------:|
| log kapitalizacji             |  0.055 |
| EPS TTM r/r                   |  0.047 |
| przychody 3 lata (CAGR)       |  0.044 |
| P/B                           |  0.044 |
| zwrot 12 mies.                |  0.043 |
| quick ratio                   |  0.042 |
| current ratio                 |  0.042 |
| dług długoterminowy / kapitał |  0.041 |
| ROIC (przybliżenie)           |  0.039 |
| P/E                           |  0.036 |
| marża operacyjna              |  0.036 |
| przychody TTM r/r             |  0.031 |
| EV/Sales                      |  0.03  |
| stopa dywidendy               |  0.03  |
| EV/EBITDA                     |  0.029 |
| FCF yield                     |  0.028 |
| zmienność 12 mies.            |  0.027 |
| cena / gotówka                |  0.027 |
| P/FCF                         |  0.027 |
| dług / kapitał                |  0.027 |
| przychody (estymata ważona)   |  0.022 |
| EPS 5 lat (CAGR)              |  0.02  |
| ROA                           |  0.019 |
| PEG (EPS 5 lat)               |  0.019 |
| EPS 3 lata (CAGR)             |  0.019 |
| odległość od maks. 12 mies.   |  0.018 |
| ROE                           |  0.018 |
| przychody 5 lat (CAGR)        |  0.017 |
| P/S                           |  0.017 |
| zwrot 6 mies.                 |  0.014 |
| marża netto                   |  0.014 |
| wypłata dywidendy / zysk      |  0.014 |
| forward P/E (estymata)        |  0.013 |
| przychody kwartał r/r         |  0.013 |
| odległość od SMA 10 mies.     |  0.013 |
| E/P                           |  0.012 |
| PEG (estymata)                |  0.008 |
| zwrot 3 mies.                 |  0.006 |

## Fama-MacBeth (60 mies.)

| parametr                      |    wsp |      t |
|:------------------------------|-------:|-------:|
| P/B                           |  0.488 |  5.745 |
| odległość od SMA 10 mies.     | -0.256 | -5.069 |
| ROA                           |  0.421 |  4.702 |
| zwrot 6 mies.                 |  0.145 |  4.638 |
| EV/EBITDA                     |  0.436 |  4.146 |
| odległość od maks. 12 mies.   |  0.15  |  3.935 |
| wypłata dywidendy / zysk      |  1.886 |  3.933 |
| quick ratio                   |  0.558 |  3.198 |
| FCF yield                     |  0.163 |  2.885 |
| dług długoterminowy / kapitał |  0.349 |  2.819 |
| EPS TTM r/r                   | -0.242 | -2.381 |
| zwrot 3 mies.                 |  0.1   |  2.378 |
| P/S                           | -0.25  | -2.316 |
| ROE                           | -0.299 | -2.272 |
| dług / kapitał                | -0.213 | -2.145 |
| ROIC (przybliżenie)           | -0.267 | -1.857 |
| zwrot 12 mies.                |  0.103 |  1.653 |
| marża netto                   |  0.098 |  1.57  |
| EPS 3 lata (CAGR)             |  0.188 |  1.309 |
| EPS 5 lat (CAGR)              |  0.169 |  1.27  |
| przychody (estymata ważona)   |  0.107 |  1.184 |
| przychody 3 lata (CAGR)       |  0.159 |  1.107 |
| current ratio                 | -0.261 | -1.027 |
| przychody TTM r/r             |  0.11  |  0.973 |
| cena / gotówka                | -0.092 | -0.848 |
| PEG (EPS 5 lat)               | -0.108 | -0.813 |
| przychody 5 lat (CAGR)        |  0.085 |  0.618 |
| zmienność 12 mies.            |  0.056 |  0.597 |
| PEG (estymata)                |  0.052 |  0.475 |
| przychody kwartał r/r         |  0.054 |  0.465 |
| P/FCF                         | -0.051 | -0.451 |
| marża operacyjna              | -0.089 | -0.419 |
| E/P                           |  0.02  |  0.362 |
| P/E                           | -0.115 | -0.333 |
| forward P/E (estymata)        |  0.093 |  0.315 |
| stopa dywidendy               |  0.091 |  0.276 |
| EV/Sales                      | -0.016 | -0.146 |
| log kapitalizacji             |  0.006 |  0.053 |

## Częstotliwość przebudowy

|   co_ile_mies |   model_gorny_kwintyl.CAGR |   model_gorny_kwintyl.maxDD |   model_gorny_kwintyl.obrot_sr |   strategia_4_skladniki.CAGR |   strategia_4_skladniki.maxDD |   strategia_4_skladniki.obrot_sr |   rowne_wagi_wszystkie.CAGR |   rowne_wagi_wszystkie.maxDD |   rowne_wagi_wszystkie.obrot_sr |
|--------------:|---------------------------:|----------------------------:|-------------------------------:|-----------------------------:|------------------------------:|---------------------------------:|----------------------------:|-----------------------------:|--------------------------------:|
|             1 |                      0.145 |                      -0.252 |                          0.352 |                        0.047 |                        -0.627 |                            0.187 |                       0.132 |                       -0.268 |                           0.013 |
|             3 |                      0.137 |                      -0.261 |                          0.535 |                        0.037 |                        -0.631 |                            0.527 |                       0.131 |                       -0.269 |                           0.039 |
|             6 |                      0.136 |                      -0.248 |                          0.651 |                        0.097 |                        -0.489 |                            0.667 |                       0.131 |                       -0.269 |                           0.076 |
|            12 |                      0.144 |                      -0.246 |                          0.763 |                        0.062 |                        -0.622 |                            0.9   |                       0.131 |                       -0.268 |                           0.148 |
|            24 |                      0.153 |                      -0.234 |                          0.88  |                        0.139 |                        -0.333 |                            1     |                       0.13  |                       -0.269 |                           0.266 |
|            60 |                      0.117 |                      -0.27  |                          0.951 |                        0.216 |                        -0.361 |                            1     |                       0.129 |                       -0.255 |                           0.507 |
