# Etap 6b: uczenie z surowych danych (decyzje co 4 tyg., prognozy krokowe 2003-2012, próba ucząca)

Obserwacji spółka-data: 522,035; dat decyzji: 196. Wejść: 108 (surowe zwroty, wolumen, rynek).

## A. Czy model przewiduje, które spółki wypadną lepiej od rynku

IC = korelacja rang prognozy i zwrotu nadwyżkowego za H; D10 / D1 = średni zwrot nadwyżkowy najwyżej / najniżej ocenionego decyla za cały horyzont H.

|   H_tyg |     IC |   t_NW |   IC_dodatnie |   D10_zwrot_nadw |   D1_zwrot_nadw |   spread_D10_D1 |   t_spread_niezal | lata_IC_dodatnie   |
|--------:|-------:|-------:|--------------:|-----------------:|----------------:|----------------:|------------------:|:-------------------|
|       1 | 0.0192 | 2.2825 |        0.6031 |           0.0012 |         -0.0012 |          0.0025 |            1.389  | 8/10               |
|       4 | 0.0315 | 3.717  |        0.6947 |           0.0039 |         -0.008  |          0.012  |            3.2823 | 9/10               |
|      13 | 0.0443 | 2.7339 |        0.7176 |           0.0054 |         -0.0223 |          0.0277 |            2.1597 | 8/10               |
|      26 | 0.0645 | 2.4668 |        0.7786 |           0.0021 |         -0.0445 |          0.0466 |            1.7355 | 8/10               |
|      52 | 0.1058 | 3.9336 |        0.871  |           0.0171 |         -0.1074 |          0.1245 |            1.4241 | 9/10               |

## Portfele top 50 (rebalancing co 4 tygodnie, netto kosztów) 2003-2012

| portfel                         |   CAGR |   zmiennosc |   Sharpe |   maxDD |   nadwyzka_na_4tyg | ci95         |
|:--------------------------------|-------:|------------:|---------:|--------:|-------------------:|:-------------|
| rynek (równe wagi, bez kosztów) | 0.1647 |      0.2512 |   0.7378 | -0.5663 |             0      | 0.00…0.00 %  |
| top 50 wg modelu H=1 tyg.       | 0.1231 |      0.2677 |   0.5728 | -0.6412 |            -0.0025 | -0.83…0.28 % |
| top 50 wg modelu H=4 tyg.       | 0.1085 |      0.2639 |   0.5289 | -0.6265 |            -0.0035 | -1.07…0.29 % |
| top 50 wg modelu H=13 tyg.      | 0.0771 |      0.2457 |   0.4299 | -0.5642 |            -0.0061 | -1.11…0.00 % |
| top 50 wg modelu H=26 tyg.      | 0.1193 |      0.1978 |   0.675  | -0.4815 |            -0.004  | -0.96…0.36 % |
| top 50 wg modelu H=52 tyg.      | 0.0769 |      0.1949 |   0.484  | -0.5668 |            -0.007  | -1.25…0.19 % |

Zwroty roczne:

|   rok |    H=1 |    H=4 |   H=13 |   H=26 |   H=52 |   rynek |
|------:|-------:|-------:|-------:|-------:|-------:|--------:|
|  2003 |  0.807 |  0.876 |  0.636 |  0.395 |  0.231 |   0.533 |
|  2004 |  0.127 |  0.088 |  0.051 |  0.115 |  0.006 |   0.087 |
|  2005 |  0.152 |  0.265 |  0.058 |  0.152 |  0.102 |   0.318 |
|  2006 |  0.216 |  0.072 |  0.093 |  0.134 |  0.156 |   0.112 |
|  2007 | -0.11  | -0.059 |  0.053 |  0.163 |  0.124 |  -0.019 |
|  2008 | -0.42  | -0.443 | -0.415 | -0.382 | -0.431 |  -0.434 |
|  2009 |  0.381 |  0.139 |  0.357 |  0.283 |  0.308 |   0.678 |
|  2010 |  0.254 |  0.288 |  0.153 |  0.344 |  0.204 |   0.306 |
|  2011 |  0.129 |  0.137 | -0.073 |  0.05  |  0.205 |   0.059 |
|  2012 |  0.119 |  0.166 |  0.19  |  0.178 |  0.101 |   0.476 |

## B. Czego model się nauczył

Udział bloków wejść w całkowitym |SHAP| (suma = 1):

|   H_tyg |   ostatnie 4 tyg. (w1-w4) |   tyg. 5-13 |   tyg. 14-26 |   tyg. 27-52 |   rok 2-3 wstecz (b) |   wolumen (v) |   obroty, zmienność, maks. dzień |   rynek (m, spy_sma) |
|--------:|--------------------------:|------------:|-------------:|-------------:|---------------------:|--------------:|---------------------------------:|---------------------:|
|       1 |                     0.065 |       0.097 |        0.129 |        0.226 |                0.193 |         0.055 |                            0.038 |                0.197 |
|       4 |                     0.053 |       0.077 |        0.132 |        0.227 |                0.231 |         0.057 |                            0.046 |                0.177 |
|      13 |                     0.029 |       0.074 |        0.159 |        0.192 |                0.229 |         0.053 |                            0.083 |                0.181 |
|      26 |                     0.04  |       0.109 |        0.157 |        0.171 |                0.204 |         0.056 |                            0.088 |                0.175 |
|      52 |                     0.046 |       0.106 |        0.122 |        0.147 |                0.203 |         0.066 |                            0.117 |                0.193 |

Kierunek: średni wkład SHAP (w jednostkach rangi przyszłego zwrotu) w kwintylach wartości 8 najważniejszych wejść; K1 = najniższe wartości. Dodatni = model podnosi ocenę spółki.

H = 4 tyg.:

- w1 (ważność 0.0046): K1 (mediana -0.066): +0.0078, K2 (mediana -0.020): +0.0026, K3 (mediana +0.002): -0.0003, K4 (mediana +0.025): -0.0042, K5 (mediana +0.071): -0.0067
- w23 (ważność 0.0042): K1 (mediana -0.072): -0.0073, K2 (mediana -0.024): -0.0037, K3 (mediana -0.000): +0.0005, K4 (mediana +0.021): +0.0023, K5 (mediana +0.065): +0.0062
- v1 (ważność 0.0034): K1 (mediana -0.466): -0.0069, K2 (mediana -0.193): -0.0017, K3 (mediana -0.009): -0.0003, K4 (mediana +0.192): +0.0017, K5 (mediana +0.543): +0.0059
- ldv (ważność 0.0031): K1 (mediana +16.075): +0.0042, K2 (mediana +16.949): +0.0024, K3 (mediana +17.818): +0.0000, K4 (mediana +18.800): -0.0019, K5 (mediana +20.237): -0.0060
- w10 (ważność 0.0031): K1 (mediana -0.065): -0.0037, K2 (mediana -0.019): -0.0027, K3 (mediana +0.002): -0.0006, K4 (mediana +0.024): +0.0029, K5 (mediana +0.069): +0.0044
- w36 (ważność 0.0031): K1 (mediana -0.064): -0.0031, K2 (mediana -0.018): -0.0026, K3 (mediana +0.004): -0.0018, K4 (mediana +0.026): +0.0009, K5 (mediana +0.072): +0.0064
- rvd (ważność 0.0029): K1 (mediana +0.011): +0.0017, K2 (mediana +0.016): +0.0016, K3 (mediana +0.022): +0.0016, K4 (mediana +0.030): +0.0018, K5 (mediana +0.048): -0.0013
- w50 (ważność 0.0029): K1 (mediana -0.069): -0.0033, K2 (mediana -0.020): -0.0028, K3 (mediana +0.002): -0.0009, K4 (mediana +0.025): +0.0012, K5 (mediana +0.071): +0.0056

H = 26 tyg.:

- ldv (ważność 0.0082): K1 (mediana +16.075): +0.0107, K2 (mediana +16.949): +0.0060, K3 (mediana +17.818): +0.0006, K4 (mediana +18.800): -0.0026, K5 (mediana +20.237): -0.0193
- rvd (ważność 0.0074): K1 (mediana +0.011): +0.0061, K2 (mediana +0.016): +0.0048, K3 (mediana +0.022): +0.0052, K4 (mediana +0.030): +0.0017, K5 (mediana +0.048): -0.0107
- spy_sma (ważność 0.0051): K1 (mediana -0.081): +0.0070, K2 (mediana +0.005): +0.0005, K3 (mediana +0.038): +0.0008, K4 (mediana +0.073): -0.0027, K5 (mediana +0.113): -0.0039
- w19 (ważność 0.0042): K1 (mediana -0.072): -0.0081, K2 (mediana -0.024): -0.0035, K3 (mediana -0.001): +0.0012, K4 (mediana +0.020): +0.0030, K5 (mediana +0.064): +0.0048
- w15 (ważność 0.0042): K1 (mediana -0.072): -0.0074, K2 (mediana -0.024): -0.0040, K3 (mediana -0.001): +0.0013, K4 (mediana +0.020): +0.0033, K5 (mediana +0.064): +0.0044
- w23 (ważność 0.0041): K1 (mediana -0.072): -0.0083, K2 (mediana -0.024): -0.0023, K3 (mediana -0.000): +0.0013, K4 (mediana +0.021): +0.0035, K5 (mediana +0.065): +0.0047
- w12 (ważność 0.0040): K1 (mediana -0.060): -0.0060, K2 (mediana -0.016): -0.0019, K3 (mediana +0.005): +0.0009, K4 (mediana +0.027): +0.0044, K5 (mediana +0.072): +0.0055
- w16 (ważność 0.0039): K1 (mediana -0.061): -0.0063, K2 (mediana -0.016): -0.0018, K3 (mediana +0.005): -0.0000, K4 (mediana +0.027): +0.0038, K5 (mediana +0.073): +0.0064

## C. Czy da się przewidzieć cały rynek (indeks równoważony)

| cel                 |   n_dat |   korelacja_rang |      p |   zwrot_gdy_prognoza_dodatnia |   zwrot_gdy_ujemna |   udzial_dodatnich |
|:--------------------|--------:|-----------------:|-------:|------------------------------:|-------------------:|-------------------:|
| zwrot rynku 4 tyg.  |     131 |          -0.0341 | 0.6994 |                        0.0141 |             0.0145 |             0.6565 |
| zwrot rynku 13 tyg. |     131 |          -0.0794 | 0.367  |                        0.0451 |             0.0689 |             0.7252 |

| strategia                                   |   CAGR |   maxDD |
|:--------------------------------------------|-------:|--------:|
| kup i trzymaj rynek                         | 0.1647 | -0.5663 |
| w rynku, gdy model przewiduje wzrost 4 tyg. | 0.099  | -0.5605 |

Uwaga: tylko ok. 130 dat decyzji w ocenie; przedziały szerokie, wynik orientacyjny.
