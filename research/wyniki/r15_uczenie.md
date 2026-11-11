# Etap 6b: uczenie z surowych danych (decyzje co 4 tyg., prognozy krokowe 2003-2012, próba ucząca)

Obserwacji spółka-data: 521,033; dat decyzji: 196. Wejść: 108 (surowe zwroty, wolumen, rynek).

## A. Czy model przewiduje, które spółki wypadną lepiej od rynku

IC = korelacja rang prognozy i zwrotu nadwyżkowego za H; D10 / D1 = średni zwrot nadwyżkowy najwyżej / najniżej ocenionego decyla za cały horyzont H.

|   H_tyg |     IC |   t_NW |   IC_dodatnie |   D10_zwrot_nadw |   D1_zwrot_nadw |   spread_D10_D1 |   t_spread_niezal | lata_IC_dodatnie   |
|--------:|-------:|-------:|--------------:|-----------------:|----------------:|----------------:|------------------:|:-------------------|
|       1 | 0.0184 | 2.1442 |        0.626  |           0.0011 |         -0.0016 |          0.0027 |            1.5407 | 7/10               |
|       4 | 0.0373 | 4.5089 |        0.6947 |           0.0042 |         -0.009  |          0.0132 |            3.8756 | 9/10               |
|      13 | 0.041  | 2.5395 |        0.7176 |           0.0045 |         -0.0229 |          0.0274 |            2.4587 | 8/10               |
|      26 | 0.0636 | 2.492  |        0.7786 |           0.002  |         -0.0453 |          0.0474 |            1.8553 | 8/10               |
|      52 | 0.1056 | 3.758  |        0.8226 |           0.0134 |         -0.1096 |          0.123  |            1.5013 | 9/10               |

## Portfele top 50 (rebalancing co 4 tygodnie, netto kosztów) 2003-2012

| portfel                         |   CAGR |   zmiennosc |   Sharpe |   maxDD |   nadwyzka_na_4tyg | ci95         |
|:--------------------------------|-------:|------------:|---------:|--------:|-------------------:|:-------------|
| rynek (równe wagi, bez kosztów) | 0.0979 |      0.2253 |   0.5344 | -0.5703 |             0      | 0.00…0.00 %  |
| top 50 wg modelu H=1 tyg.       | 0.1096 |      0.2634 |   0.5322 | -0.6517 |             0.0015 | -0.38…0.50 % |
| top 50 wg modelu H=4 tyg.       | 0.0554 |      0.2729 |   0.3425 | -0.6798 |            -0.0021 | -0.77…0.18 % |
| top 50 wg modelu H=13 tyg.      | 0.0823 |      0.2325 |   0.4625 | -0.5731 |            -0.001  | -0.42…0.30 % |
| top 50 wg modelu H=26 tyg.      | 0.0625 |      0.205  |   0.4062 | -0.5592 |            -0.0029 | -0.82…0.28 % |
| top 50 wg modelu H=52 tyg.      | 0.0923 |      0.2013 |   0.5418 | -0.509  |            -0.0009 | -0.71…0.71 % |

Zwroty roczne:

|   rok |    H=1 |    H=4 |   H=13 |   H=26 |   H=52 |   rynek |
|------:|-------:|-------:|-------:|-------:|-------:|--------:|
|  2003 |  0.783 |  0.675 |  0.412 |  0.321 |  0.329 |   0.52  |
|  2004 |  0.103 |  0.009 |  0.08  |  0.014 | -0.023 |   0.075 |
|  2005 |  0.206 |  0.225 |  0.146 |  0.195 |  0.123 |   0.165 |
|  2006 |  0.079 | -0.062 |  0.142 |  0.156 |  0.131 |   0.109 |
|  2007 | -0.028 | -0.105 |  0.062 |  0.031 |  0.238 |  -0.037 |
|  2008 | -0.47  | -0.488 | -0.415 | -0.447 | -0.387 |  -0.439 |
|  2009 |  0.446 |  0.218 |  0.39  |  0.205 |  0.23  |   0.567 |
|  2010 |  0.119 |  0.331 |  0.192 |  0.22  |  0.173 |   0.299 |
|  2011 |  0.166 |  0.029 | -0.042 |  0.069 |  0.18  |  -0.018 |
|  2012 |  0.146 |  0.162 |  0.127 |  0.111 |  0.143 |   0.123 |

## B. Czego model się nauczył

Udział bloków wejść w całkowitym |SHAP| (suma = 1):

|   H_tyg |   ostatnie 4 tyg. (w1-w4) |   tyg. 5-13 |   tyg. 14-26 |   tyg. 27-52 |   rok 2-3 wstecz (b) |   wolumen (v) |   obroty, zmienność, maks. dzień |   rynek (m, spy_sma) |
|--------:|--------------------------:|------------:|-------------:|-------------:|---------------------:|--------------:|---------------------------------:|---------------------:|
|       1 |                     0.065 |       0.097 |        0.127 |        0.228 |                0.192 |         0.054 |                            0.038 |                0.199 |
|       4 |                     0.054 |       0.078 |        0.13  |        0.223 |                0.232 |         0.058 |                            0.046 |                0.179 |
|      13 |                     0.028 |       0.072 |        0.16  |        0.195 |                0.229 |         0.053 |                            0.08  |                0.183 |
|      26 |                     0.039 |       0.111 |        0.157 |        0.171 |                0.206 |         0.054 |                            0.088 |                0.173 |
|      52 |                     0.045 |       0.107 |        0.123 |        0.149 |                0.199 |         0.065 |                            0.116 |                0.195 |

Kierunek: średni wkład SHAP (w jednostkach rangi przyszłego zwrotu) w kwintylach wartości 8 najważniejszych wejść; K1 = najniższe wartości. Dodatni = model podnosi ocenę spółki.

H = 4 tyg.:

- w1 (ważność 0.0046): K1 (mediana -0.065): +0.0076, K2 (mediana -0.020): +0.0026, K3 (mediana +0.002): -0.0001, K4 (mediana +0.025): -0.0041, K5 (mediana +0.071): -0.0070
- w23 (ważność 0.0042): K1 (mediana -0.072): -0.0074, K2 (mediana -0.024): -0.0038, K3 (mediana -0.000): +0.0004, K4 (mediana +0.021): +0.0024, K5 (mediana +0.064): +0.0064
- v1 (ważność 0.0034): K1 (mediana -0.465): -0.0070, K2 (mediana -0.193): -0.0017, K3 (mediana -0.010): -0.0004, K4 (mediana +0.189): +0.0016, K5 (mediana +0.541): +0.0061
- w10 (ważność 0.0032): K1 (mediana -0.064): -0.0036, K2 (mediana -0.019): -0.0027, K3 (mediana +0.002): -0.0005, K4 (mediana +0.024): +0.0030, K5 (mediana +0.069): +0.0047
- rvd (ważność 0.0031): K1 (mediana +0.011): +0.0015, K2 (mediana +0.016): +0.0016, K3 (mediana +0.022): +0.0018, K4 (mediana +0.030): +0.0020, K5 (mediana +0.048): -0.0011
- ldv (ważność 0.0030): K1 (mediana +16.077): +0.0039, K2 (mediana +16.950): +0.0023, K3 (mediana +17.808): +0.0002, K4 (mediana +18.788): -0.0017, K5 (mediana +20.230): -0.0059
- m12 (ważność 0.0030): K1 (mediana -0.079): -0.0011, K2 (mediana -0.015): -0.0014, K3 (mediana +0.017): -0.0020, K4 (mediana +0.040): -0.0005, K5 (mediana +0.077): +0.0040
- w50 (ważność 0.0030): K1 (mediana -0.068): -0.0034, K2 (mediana -0.020): -0.0028, K3 (mediana +0.002): -0.0008, K4 (mediana +0.025): +0.0012, K5 (mediana +0.070): +0.0060

H = 26 tyg.:

- ldv (ważność 0.0082): K1 (mediana +16.077): +0.0106, K2 (mediana +16.950): +0.0062, K3 (mediana +17.808): +0.0008, K4 (mediana +18.788): -0.0027, K5 (mediana +20.230): -0.0191
- rvd (ważność 0.0073): K1 (mediana +0.011): +0.0061, K2 (mediana +0.016): +0.0047, K3 (mediana +0.022): +0.0048, K4 (mediana +0.030): +0.0016, K5 (mediana +0.048): -0.0104
- spy_sma (ważność 0.0047): K1 (mediana -0.081): +0.0068, K2 (mediana +0.005): -0.0001, K3 (mediana +0.038): -0.0002, K4 (mediana +0.073): -0.0028, K5 (mediana +0.113): -0.0044
- w15 (ważność 0.0042): K1 (mediana -0.071): -0.0073, K2 (mediana -0.024): -0.0041, K3 (mediana -0.001): +0.0014, K4 (mediana +0.021): +0.0035, K5 (mediana +0.064): +0.0045
- w23 (ważność 0.0042): K1 (mediana -0.072): -0.0085, K2 (mediana -0.024): -0.0023, K3 (mediana -0.000): +0.0014, K4 (mediana +0.021): +0.0034, K5 (mediana +0.064): +0.0046
- w19 (ważność 0.0040): K1 (mediana -0.072): -0.0075, K2 (mediana -0.024): -0.0034, K3 (mediana -0.001): +0.0010, K4 (mediana +0.021): +0.0030, K5 (mediana +0.064): +0.0048
- w12 (ważność 0.0040): K1 (mediana -0.060): -0.0060, K2 (mediana -0.017): -0.0019, K3 (mediana +0.005): +0.0009, K4 (mediana +0.027): +0.0044, K5 (mediana +0.072): +0.0055
- w16 (ważność 0.0039): K1 (mediana -0.061): -0.0064, K2 (mediana -0.016): -0.0018, K3 (mediana +0.005): -0.0000, K4 (mediana +0.027): +0.0037, K5 (mediana +0.071): +0.0064

## C. Czy da się przewidzieć cały rynek (indeks równoważony)

| cel                 |   n_dat |   korelacja_rang |      p |   zwrot_gdy_prognoza_dodatnia |   zwrot_gdy_ujemna |   udzial_dodatnich |
|:--------------------|--------:|-----------------:|-------:|------------------------------:|-------------------:|-------------------:|
| zwrot rynku 4 tyg.  |     131 |          -0.0739 | 0.4015 |                        0.0102 |             0.0074 |             0.6641 |
| zwrot rynku 13 tyg. |     131 |          -0.1094 | 0.2136 |                        0.031  |             0.0442 |             0.6718 |

| strategia                                   |   CAGR |   maxDD |
|:--------------------------------------------|-------:|--------:|
| kup i trzymaj rynek                         | 0.0979 | -0.5703 |
| w rynku, gdy model przewiduje wzrost 4 tyg. | 0.0768 | -0.33   |

Uwaga: tylko ok. 130 dat decyzji w ocenie; przedziały szerokie, wynik orientacyjny.
