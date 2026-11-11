# Etap 6b: uczenie z surowych danych (decyzje co 4 tyg., prognozy krokowe 2003-2012, próba ucząca)

Obserwacji spółka-data: 520,533; dat decyzji: 196. Wejść: 108 (surowe zwroty, wolumen, rynek).

## A. Czy model przewiduje, które spółki wypadną lepiej od rynku

IC = korelacja rang prognozy i zwrotu nadwyżkowego za H; D10 / D1 = średni zwrot nadwyżkowy najwyżej / najniżej ocenionego decyla za cały horyzont H.

|   H_tyg |     IC |   t_NW |   IC_dodatnie |   D10_zwrot_nadw |   D1_zwrot_nadw |   spread_D10_D1 |   t_spread_niezal | lata_IC_dodatnie   |
|--------:|-------:|-------:|--------------:|-----------------:|----------------:|----------------:|------------------:|:-------------------|
|       1 | 0.0198 | 2.469  |        0.6489 |           0.0007 |         -0.0015 |          0.0021 |            1.2697 | 8/10               |
|       4 | 0.0337 | 4.0091 |        0.7023 |           0.0041 |         -0.0085 |          0.0126 |            3.5025 | 9/10               |
|      13 | 0.0425 | 2.6223 |        0.7176 |           0.0041 |         -0.0225 |          0.0266 |            2.3275 | 8/10               |
|      26 | 0.0618 | 2.4472 |        0.771  |           0.0032 |         -0.0399 |          0.0431 |            1.3984 | 8/10               |
|      52 | 0.1016 | 3.6178 |        0.8145 |           0.0132 |         -0.1056 |          0.1188 |            1.4921 | 9/10               |

## Portfele top 50 (rebalancing co 4 tygodnie, netto kosztów) 2003-2012

| portfel                         |   CAGR |   zmiennosc |   Sharpe |   maxDD |   nadwyzka_na_4tyg | ci95         |
|:--------------------------------|-------:|------------:|---------:|--------:|-------------------:|:-------------|
| rynek (równe wagi, bez kosztów) | 0.1    |      0.2253 |   0.5426 | -0.5695 |             0      | 0.00…0.00 %  |
| top 50 wg modelu H=1 tyg.       | 0.056  |      0.2596 |   0.3473 | -0.7323 |            -0.0025 | -0.89…0.20 % |
| top 50 wg modelu H=4 tyg.       | 0.0872 |      0.2667 |   0.4521 | -0.6547 |            -0.0001 | -0.59…0.41 % |
| top 50 wg modelu H=13 tyg.      | 0.0544 |      0.2423 |   0.3497 | -0.6303 |            -0.0029 | -0.65…0.05 % |
| top 50 wg modelu H=26 tyg.      | 0.0899 |      0.1979 |   0.5416 | -0.5166 |            -0.0012 | -0.55…0.37 % |
| top 50 wg modelu H=52 tyg.      | 0.0668 |      0.2028 |   0.4298 | -0.5806 |            -0.0027 | -0.88…0.46 % |

Zwroty roczne:

|   rok |    H=1 |    H=4 |   H=13 |   H=26 |   H=52 |   rynek |
|------:|-------:|-------:|-------:|-------:|-------:|--------:|
|  2003 |  0.693 |  0.715 |  0.54  |  0.359 |  0.248 |   0.526 |
|  2004 |  0.127 |  0.005 |  0.041 |  0.043 |  0.022 |   0.077 |
|  2005 | -0.003 |  0.387 |  0.15  |  0.121 |  0.152 |   0.167 |
|  2006 |  0.071 | -0.022 | -0     |  0.107 |  0.131 |   0.112 |
|  2007 | -0.076 |  0.021 | -0.005 |  0.124 |  0.158 |  -0.034 |
|  2008 | -0.566 | -0.504 | -0.495 | -0.4   | -0.43  |  -0.438 |
|  2009 |  0.399 |  0.3   |  0.356 |  0.334 |  0.163 |   0.57  |
|  2010 |  0.249 |  0.229 |  0.302 |  0.267 |  0.162 |   0.3   |
|  2011 |  0.137 |  0.039 | -0.045 |  0.044 |  0.098 |  -0.018 |
|  2012 |  0.066 |  0.182 |  0.094 |  0.136 |  0.18  |   0.126 |

## B. Czego model się nauczył

Udział bloków wejść w całkowitym |SHAP| (suma = 1):

|   H_tyg |   ostatnie 4 tyg. (w1-w4) |   tyg. 5-13 |   tyg. 14-26 |   tyg. 27-52 |   rok 2-3 wstecz (b) |   wolumen (v) |   obroty, zmienność, maks. dzień |   rynek (m, spy_sma) |
|--------:|--------------------------:|------------:|-------------:|-------------:|---------------------:|--------------:|---------------------------------:|---------------------:|
|       1 |                     0.066 |       0.097 |        0.127 |        0.225 |                0.193 |         0.055 |                            0.038 |                0.198 |
|       4 |                     0.052 |       0.077 |        0.13  |        0.227 |                0.23  |         0.059 |                            0.045 |                0.181 |
|      13 |                     0.029 |       0.074 |        0.161 |        0.195 |                0.227 |         0.053 |                            0.081 |                0.181 |
|      26 |                     0.04  |       0.111 |        0.16  |        0.169 |                0.206 |         0.053 |                            0.088 |                0.174 |
|      52 |                     0.046 |       0.108 |        0.123 |        0.148 |                0.201 |         0.062 |                            0.113 |                0.197 |

Kierunek: średni wkład SHAP (w jednostkach rangi przyszłego zwrotu) w kwintylach wartości 8 najważniejszych wejść; K1 = najniższe wartości. Dodatni = model podnosi ocenę spółki.

H = 4 tyg.:

- w1 (ważność 0.0045): K1 (mediana -0.065): +0.0075, K2 (mediana -0.020): +0.0025, K3 (mediana +0.002): -0.0002, K4 (mediana +0.025): -0.0040, K5 (mediana +0.071): -0.0067
- w23 (ważność 0.0042): K1 (mediana -0.072): -0.0074, K2 (mediana -0.024): -0.0038, K3 (mediana -0.001): +0.0005, K4 (mediana +0.021): +0.0023, K5 (mediana +0.064): +0.0063
- v1 (ważność 0.0035): K1 (mediana -0.463): -0.0070, K2 (mediana -0.193): -0.0017, K3 (mediana -0.010): -0.0004, K4 (mediana +0.192): +0.0015, K5 (mediana +0.542): +0.0063
- w10 (ważność 0.0031): K1 (mediana -0.064): -0.0035, K2 (mediana -0.018): -0.0026, K3 (mediana +0.003): -0.0005, K4 (mediana +0.025): +0.0031, K5 (mediana +0.068): +0.0046
- w50 (ważność 0.0031): K1 (mediana -0.068): -0.0035, K2 (mediana -0.020): -0.0030, K3 (mediana +0.002): -0.0008, K4 (mediana +0.025): +0.0014, K5 (mediana +0.070): +0.0060
- m5 (ważność 0.0030): K1 (mediana -0.077): +0.0032, K2 (mediana -0.005): -0.0016, K3 (mediana +0.020): -0.0030, K4 (mediana +0.040): -0.0025, K5 (mediana +0.073): -0.0001
- rvd (ważność 0.0030): K1 (mediana +0.011): +0.0017, K2 (mediana +0.016): +0.0016, K3 (mediana +0.022): +0.0018, K4 (mediana +0.030): +0.0019, K5 (mediana +0.048): -0.0015
- w36 (ważność 0.0030): K1 (mediana -0.063): -0.0032, K2 (mediana -0.018): -0.0025, K3 (mediana +0.004): -0.0016, K4 (mediana +0.026): +0.0009, K5 (mediana +0.072): +0.0062

H = 26 tyg.:

- ldv (ważność 0.0079): K1 (mediana +16.077): +0.0102, K2 (mediana +16.953): +0.0059, K3 (mediana +17.829): +0.0005, K4 (mediana +18.794): -0.0028, K5 (mediana +20.217): -0.0181
- rvd (ważność 0.0076): K1 (mediana +0.011): +0.0062, K2 (mediana +0.016): +0.0050, K3 (mediana +0.022): +0.0051, K4 (mediana +0.030): +0.0012, K5 (mediana +0.048): -0.0109
- spy_sma (ważność 0.0049): K1 (mediana -0.081): +0.0065, K2 (mediana +0.004): +0.0005, K3 (mediana +0.038): -0.0002, K4 (mediana +0.073): -0.0032, K5 (mediana +0.113): -0.0042
- w15 (ważność 0.0043): K1 (mediana -0.072): -0.0075, K2 (mediana -0.024): -0.0043, K3 (mediana -0.001): +0.0014, K4 (mediana +0.020): +0.0035, K5 (mediana +0.062): +0.0043
- w23 (ważność 0.0042): K1 (mediana -0.072): -0.0086, K2 (mediana -0.024): -0.0024, K3 (mediana -0.001): +0.0015, K4 (mediana +0.021): +0.0036, K5 (mediana +0.064): +0.0045
- w19 (ważność 0.0042): K1 (mediana -0.072): -0.0080, K2 (mediana -0.024): -0.0034, K3 (mediana -0.001): +0.0011, K4 (mediana +0.021): +0.0030, K5 (mediana +0.063): +0.0049
- w16 (ważność 0.0041): K1 (mediana -0.061): -0.0063, K2 (mediana -0.016): -0.0021, K3 (mediana +0.005): -0.0001, K4 (mediana +0.027): +0.0039, K5 (mediana +0.072): +0.0067
- w12 (ważność 0.0041): K1 (mediana -0.060): -0.0060, K2 (mediana -0.017): -0.0020, K3 (mediana +0.005): +0.0007, K4 (mediana +0.027): +0.0046, K5 (mediana +0.071): +0.0055

## C. Czy da się przewidzieć cały rynek (indeks równoważony)

| cel                 |   n_dat |   korelacja_rang |      p |   zwrot_gdy_prognoza_dodatnia |   zwrot_gdy_ujemna |   udzial_dodatnich |
|:--------------------|--------:|-----------------:|-------:|------------------------------:|-------------------:|-------------------:|
| zwrot rynku 4 tyg.  |     131 |          -0.0638 | 0.4689 |                        0.0042 |             0.0179 |             0.6183 |
| zwrot rynku 13 tyg. |     131 |          -0.1109 | 0.2072 |                        0.0329 |             0.0431 |             0.7176 |

| strategia                                   |   CAGR |   maxDD |
|:--------------------------------------------|-------:|--------:|
| kup i trzymaj rynek                         | 0.1    | -0.5695 |
| w rynku, gdy model przewiduje wzrost 4 tyg. | 0.0142 | -0.593  |

Uwaga: tylko ok. 130 dat decyzji w ocenie; przedziały szerokie, wynik orientacyjny.
