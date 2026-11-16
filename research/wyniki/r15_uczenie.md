# Etap 6b: uczenie z surowych danych (decyzje co 4 tyg., prognozy krokowe 2003-2012, próba ucząca)

Obserwacji spółka-data: 518,697; dat decyzji: 196. Wejść: 108 (surowe zwroty, wolumen, rynek).

## A. Czy model przewiduje, które spółki wypadną lepiej od rynku

IC = korelacja rang prognozy i zwrotu nadwyżkowego za H; D10 / D1 = średni zwrot nadwyżkowy najwyżej / najniżej ocenionego decyla za cały horyzont H.

|   H_tyg |     IC |   t_NW |   IC_dodatnie |   D10_zwrot_nadw |   D1_zwrot_nadw |   spread_D10_D1 |   t_spread_niezal | lata_IC_dodatnie   |
|--------:|-------:|-------:|--------------:|-----------------:|----------------:|----------------:|------------------:|:-------------------|
|       1 | 0.0215 | 2.5159 |        0.626  |           0.0013 |         -0.0021 |          0.0034 |            1.9722 | 7/10               |
|       4 | 0.0319 | 3.8559 |        0.7023 |           0.0036 |         -0.0085 |          0.0121 |            3.5956 | 9/10               |
|      13 | 0.0422 | 2.7105 |        0.7023 |           0.0047 |         -0.0204 |          0.0251 |            2.3957 | 8/10               |
|      26 | 0.0617 | 2.4243 |        0.7863 |           0.0022 |         -0.0415 |          0.0438 |            1.6235 | 8/10               |
|      52 | 0.101  | 3.6182 |        0.8468 |           0.0138 |         -0.1019 |          0.1157 |            1.5565 | 9/10               |

## Portfele top 50 (rebalancing co 4 tygodnie, netto kosztów) 2003-2012

| portfel                         |   CAGR |   zmiennosc |   Sharpe |   maxDD |   nadwyzka_na_4tyg | ci95         |
|:--------------------------------|-------:|------------:|---------:|--------:|-------------------:|:-------------|
| rynek (równe wagi, bez kosztów) | 0.1002 |      0.2251 |   0.544  | -0.5684 |             0      | 0.00…0.00 %  |
| top 50 wg modelu H=1 tyg.       | 0.1014 |      0.2617 |   0.5073 | -0.6637 |             0.0008 | -0.35…0.41 % |
| top 50 wg modelu H=4 tyg.       | 0.0832 |      0.2639 |   0.4401 | -0.647  |            -0.0005 | -0.67…0.41 % |
| top 50 wg modelu H=13 tyg.      | 0.0703 |      0.2317 |   0.4148 | -0.6006 |            -0.002  | -0.48…0.01 % |
| top 50 wg modelu H=26 tyg.      | 0.0925 |      0.2077 |   0.5383 | -0.5526 |            -0.0008 | -0.62…0.45 % |
| top 50 wg modelu H=52 tyg.      | 0.0516 |      0.2026 |   0.3575 | -0.6343 |            -0.0038 | -0.94…0.34 % |

Zwroty roczne:

|   rok |    H=1 |    H=4 |   H=13 |   H=26 |   H=52 |   rynek |
|------:|-------:|-------:|-------:|-------:|-------:|--------:|
|  2003 |  0.728 |  0.844 |  0.531 |  0.438 |  0.242 |   0.526 |
|  2004 |  0.115 |  0.092 |  0.09  |  0.049 | -0.07  |   0.076 |
|  2005 |  0.083 |  0.306 |  0.111 |  0.171 |  0.134 |   0.167 |
|  2006 |  0.087 |  0.064 |  0.075 |  0.216 |  0.161 |   0.11  |
|  2007 |  0.008 | -0.011 | -0.056 |  0.123 |  0.13  |  -0.032 |
|  2008 | -0.452 | -0.471 | -0.462 | -0.452 | -0.49  |  -0.437 |
|  2009 |  0.42  |  0.265 |  0.457 |  0.31  |  0.267 |   0.57  |
|  2010 |  0.24  |  0.152 |  0.226 |  0.215 |  0.177 |   0.301 |
|  2011 |  0.104 | -0.023 | -0.036 |  0.021 |  0.136 |  -0.018 |
|  2012 |  0.086 |  0.075 |  0.137 |  0.135 |  0.118 |   0.127 |

## B. Czego model się nauczył

Udział bloków wejść w całkowitym |SHAP| (suma = 1):

|   H_tyg |   ostatnie 4 tyg. (w1-w4) |   tyg. 5-13 |   tyg. 14-26 |   tyg. 27-52 |   rok 2-3 wstecz (b) |   wolumen (v) |   obroty, zmienność, maks. dzień |   rynek (m, spy_sma) |
|--------:|--------------------------:|------------:|-------------:|-------------:|---------------------:|--------------:|---------------------------------:|---------------------:|
|       1 |                     0.065 |       0.096 |        0.125 |        0.225 |                0.194 |         0.055 |                            0.037 |                0.203 |
|       4 |                     0.053 |       0.077 |        0.128 |        0.228 |                0.229 |         0.059 |                            0.046 |                0.18  |
|      13 |                     0.028 |       0.073 |        0.161 |        0.196 |                0.226 |         0.052 |                            0.081 |                0.182 |
|      26 |                     0.04  |       0.113 |        0.161 |        0.17  |                0.206 |         0.052 |                            0.086 |                0.173 |
|      52 |                     0.045 |       0.109 |        0.124 |        0.15  |                0.199 |         0.059 |                            0.113 |                0.201 |

Kierunek: średni wkład SHAP (w jednostkach rangi przyszłego zwrotu) w kwintylach wartości 8 najważniejszych wejść; K1 = najniższe wartości. Dodatni = model podnosi ocenę spółki.

H = 4 tyg.:

- w1 (ważność 0.0046): K1 (mediana -0.065): +0.0078, K2 (mediana -0.019): +0.0024, K3 (mediana +0.003): -0.0002, K4 (mediana +0.025): -0.0040, K5 (mediana +0.071): -0.0068
- w23 (ważność 0.0041): K1 (mediana -0.073): -0.0071, K2 (mediana -0.024): -0.0037, K3 (mediana -0.001): +0.0003, K4 (mediana +0.021): +0.0023, K5 (mediana +0.064): +0.0061
- v1 (ważność 0.0035): K1 (mediana -0.461): -0.0072, K2 (mediana -0.191): -0.0018, K3 (mediana -0.009): -0.0002, K4 (mediana +0.189): +0.0018, K5 (mediana +0.539): +0.0061
- w10 (ważność 0.0031): K1 (mediana -0.064): -0.0036, K2 (mediana -0.019): -0.0027, K3 (mediana +0.003): -0.0004, K4 (mediana +0.025): +0.0030, K5 (mediana +0.069): +0.0046
- w36 (ważność 0.0031): K1 (mediana -0.063): -0.0031, K2 (mediana -0.018): -0.0025, K3 (mediana +0.004): -0.0018, K4 (mediana +0.026): +0.0009, K5 (mediana +0.072): +0.0065
- rvd (ważność 0.0030): K1 (mediana +0.011): +0.0013, K2 (mediana +0.016): +0.0017, K3 (mediana +0.022): +0.0017, K4 (mediana +0.030): +0.0020, K5 (mediana +0.048): -0.0013
- m12 (ważność 0.0030): K1 (mediana -0.079): +0.0002, K2 (mediana -0.015): -0.0012, K3 (mediana +0.020): -0.0020, K4 (mediana +0.040): -0.0005, K5 (mediana +0.077): +0.0033
- m5 (ważność 0.0030): K1 (mediana -0.077): +0.0028, K2 (mediana -0.005): -0.0016, K3 (mediana +0.020): -0.0034, K4 (mediana +0.040): -0.0019, K5 (mediana +0.077): +0.0003

H = 26 tyg.:

- ldv (ważność 0.0077): K1 (mediana +16.068): +0.0099, K2 (mediana +16.949): +0.0056, K3 (mediana +17.819): +0.0004, K4 (mediana +18.793): -0.0026, K5 (mediana +20.226): -0.0177
- rvd (ważność 0.0074): K1 (mediana +0.011): +0.0063, K2 (mediana +0.016): +0.0050, K3 (mediana +0.022): +0.0048, K4 (mediana +0.030): +0.0014, K5 (mediana +0.048): -0.0104
- spy_sma (ważność 0.0055): K1 (mediana -0.081): +0.0074, K2 (mediana +0.005): +0.0005, K3 (mediana +0.038): -0.0002, K4 (mediana +0.073): -0.0034, K5 (mediana +0.113): -0.0037
- w19 (ważność 0.0042): K1 (mediana -0.072): -0.0082, K2 (mediana -0.024): -0.0033, K3 (mediana -0.001): +0.0013, K4 (mediana +0.021): +0.0031, K5 (mediana +0.064): +0.0048
- w15 (ważność 0.0042): K1 (mediana -0.072): -0.0074, K2 (mediana -0.024): -0.0041, K3 (mediana -0.001): +0.0014, K4 (mediana +0.020): +0.0033, K5 (mediana +0.063): +0.0042
- w23 (ważność 0.0041): K1 (mediana -0.073): -0.0082, K2 (mediana -0.024): -0.0022, K3 (mediana -0.001): +0.0015, K4 (mediana +0.021): +0.0034, K5 (mediana +0.064): +0.0044
- w12 (ważność 0.0040): K1 (mediana -0.060): -0.0060, K2 (mediana -0.016): -0.0021, K3 (mediana +0.005): +0.0008, K4 (mediana +0.027): +0.0045, K5 (mediana +0.072): +0.0056
- w16 (ważność 0.0038): K1 (mediana -0.060): -0.0060, K2 (mediana -0.016): -0.0018, K3 (mediana +0.005): -0.0002, K4 (mediana +0.027): +0.0036, K5 (mediana +0.072): +0.0065

## C. Czy da się przewidzieć cały rynek (indeks równoważony)

| cel                 |   n_dat |   korelacja_rang |      p |   zwrot_gdy_prognoza_dodatnia |   zwrot_gdy_ujemna |   udzial_dodatnich |
|:--------------------|--------:|-----------------:|-------:|------------------------------:|-------------------:|-------------------:|
| zwrot rynku 4 tyg.  |     131 |          -0.0645 | 0.4642 |                        0.0066 |             0.0143 |             0.6336 |
| zwrot rynku 13 tyg. |     131 |          -0.1364 | 0.1202 |                        0.0338 |             0.0406 |             0.7023 |

| strategia                                   |   CAGR |   maxDD |
|:--------------------------------------------|-------:|--------:|
| kup i trzymaj rynek                         | 0.1002 | -0.5684 |
| w rynku, gdy model przewiduje wzrost 4 tyg. | 0.0417 | -0.3726 |

Uwaga: tylko ok. 130 dat decyzji w ocenie; przedziały szerokie, wynik orientacyjny.
