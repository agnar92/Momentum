# Etap 11 D: co odróżnia wzrost, który trwa dalej (zdarzenia 1998-2018)

Zdarzeń (cena po raz pierwszy +30 % nad dołkiem 52 tyg.): 39,327; dojście do +100 % od dołka przed spadkiem o 25 % od szczytu: 28.4 %.

Trafność modelu poza blokiem lat: AUC = 0.537; AUC w latach: od 0.472 do 0.630, mediana 0.553.

Odsetek sukcesu i mediana zwrotu 52 tyg. w kwintylach prognozy modelu (0 = najniższa):

|   kwintyl |   sukces |   zwrot52_mediana |    n |
|----------:|---------:|------------------:|-----:|
|         0 |    0.237 |             0.052 | 7866 |
|         1 |    0.278 |             0.052 | 7865 |
|         2 |    0.29  |             0.055 | 7865 |
|         3 |    0.303 |             0.056 | 7865 |
|         4 |    0.314 |             0.057 | 7866 |

## Czego model się nauczył: cechy od najważniejszej

Dla każdej cechy: ważność (średnie |SHAP|), kierunek wpływu na prognozę w kwintylach cechy (średni SHAP, log-szanse) oraz surowy odsetek sukcesu w kwintylach cechy z 95 % z bootstrapu blokowego po miesiącach.

### log ceny (ważność 0.187)

Wpływ w modelu (K1 → K5): +0.339, +0.096, -0.053, -0.184, -0.237

Odsetek sukcesu: K1 (mediana 1.74): 36.4 % (33.1…39.5); K2 (mediana 2.49): 30.8 % (28.0…34.1); K3 (mediana 2.98): 27.4 % (25.2…29.6); K4 (mediana 3.47): 24.2 % (22.2…26.0); K5 (mediana 4.39): 23.4 % (21.7…25.1)

### SPY / SMA 40 - 1 (ważność 0.170)

Wpływ w modelu (K1 → K5): -0.029, +0.149, +0.093, -0.012, -0.235

Odsetek sukcesu: K1 (mediana -0.0729): 29.6 % (23.3…36.9); K2 (mediana 0.0125): 31.9 % (27.6…36.1); K3 (mediana 0.0459): 28.1 % (25.0…30.8); K4 (mediana 0.0688): 27.3 % (24.2…30.9); K5 (mediana 0.0978): 25.3 % (22.3…28.6)

### tempo od dołka (% / tydz.) (ważność 0.144)

Wpływ w modelu (K1 → K5): -0.254, -0.102, +0.043, +0.095, +0.218

Odsetek sukcesu: K1 (mediana 0.00564): 25.7 % (23.7…27.9); K2 (mediana 0.00677): 28.0 % (25.9…30.2); K3 (mediana 0.00963): 29.7 % (27.3…32.6); K4 (mediana 0.0214): 27.8 % (24.6…31.1); K5 (mediana 0.0714): 30.9 % (26.3…37.0)

### zwrot rynku 13 tyg. (ważność 0.142)

Wpływ w modelu (K1 → K5): +0.036, -0.111, -0.101, -0.058, +0.256

Odsetek sukcesu: K1 (mediana -0.105): 30.8 % (26.4…35.5); K2 (mediana -0.0188): 29.5 % (24.1…34.7); K3 (mediana 0.0327): 25.0 % (22.3…27.6); K4 (mediana 0.0685): 24.7 % (22.1…27.3); K5 (mediana 0.138): 32.2 % (28.4…36.3)

### najgłębsza korekta od dołka (ważność 0.114)

Wpływ w modelu (K1 → K5): +0.167, +0.096, -0.028, -0.124, -0.135

Odsetek sukcesu: K1 (mediana -0.296): 31.8 % (29.3…34.3); K2 (mediana -0.168): 29.7 % (27.5…32.0); K3 (mediana -0.108): 26.5 % (24.1…28.6); K4 (mediana -0.0644): 25.0 % (22.5…27.1); K5 (mediana -0.00283): 29.2 % (25.3…34.1)

### tygodnie od dołka do +30 % (ważność 0.062)

Wpływ w modelu (K1 → K5): -0.082, -0.043, +0.011, +0.053, +0.106

Odsetek sukcesu: K1 (mediana 5): 30.5 % (25.5…36.3); K2 (mediana 14): 27.7 % (24.3…30.7); K3 (mediana 31): 28.8 % (26.2…31.7); K4 (mediana 44): 27.4 % (25.1…29.7); K5 (mediana 50): 27.8 % (25.4…30.4)

### spadek przed dołkiem (od max 3 lat) (ważność 0.054)

Wpływ w modelu (K1 → K5): +0.059, -0.046, -0.046, -0.013, +0.011

Odsetek sukcesu: K1 (mediana -0.77): 32.5 % (28.3…37.2); K2 (mediana -0.56): 29.1 % (26.4…32.1); K3 (mediana -0.396): 27.7 % (25.3…29.8); K4 (mediana -0.25): 27.5 % (25.5…29.4); K5 (mediana -0.101): 25.4 % (23.5…27.5)

### log zmienność od dołka / przed (ważność 0.053)

Wpływ w modelu (K1 → K5): +0.054, +0.042, +0.019, -0.013, -0.103

Odsetek sukcesu: K1 (mediana -0.58): 30.2 % (26.9…34.1); K2 (mediana -0.263): 28.7 % (26.5…30.9); K3 (mediana -0.0798): 28.5 % (26.3…30.6); K4 (mediana 0.105): 28.4 % (26.2…30.7); K5 (mediana 0.382): 26.3 % (24.0…28.6)

### log wolumen od dołka / 26 tyg. przed (ważność 0.047)

Wpływ w modelu (K1 → K5): +0.021, +0.052, +0.026, -0.048, -0.060

Odsetek sukcesu: K1 (mediana -0.363): 29.4 % (26.9…32.0); K2 (mediana -0.129): 29.3 % (27.0…31.8); K3 (mediana 0.0293): 28.9 % (26.4…31.7); K4 (mediana 0.207): 27.0 % (24.4…29.7); K5 (mediana 0.553): 27.6 % (25.0…30.4)

### odległość od rekordu (ważność 0.041)

Wpływ w modelu (K1 → K5): -0.071, +0.025, +0.010, +0.006, +0.009

Odsetek sukcesu: K1 (mediana -0.834): 30.8 % (27.7…34.3); K2 (mediana -0.557): 30.6 % (27.5…34.2); K3 (mediana -0.317): 28.5 % (26.0…30.7); K4 (mediana -0.126): 27.2 % (25.0…29.3); K5 (mediana 0): 25.0 % (23.0…27.1)

### odległość od szczytu 52 tyg. (ważność 0.036)

Wpływ w modelu (K1 → K5): -0.067, -0.005, +0.022, +0.037, -0.000

Odsetek sukcesu: K1 (mediana -0.487): 31.3 % (26.7…37.0); K2 (mediana -0.239): 29.8 % (27.2…32.7); K3 (mediana -0.116): 28.8 % (26.5…31.0); K4 (mediana -0.0306): 28.0 % (25.8…30.2); K5 (mediana 0): 24.2 % (22.3…26.3)

### odsetek tygodni wzrostowych od dołka (ważność 0.024)

Wpływ w modelu (K1 → K5): -0.009, +0.028, +0.013, -0.016, -0.016

Odsetek sukcesu: K1 (mediana 0.51): 29.2 % (27.0…31.5); K2 (mediana 0.564): 29.1 % (26.8…31.2); K3 (mediana 0.608): 28.2 % (26.3…30.5); K4 (mediana 0.667): 25.9 % (23.6…28.2); K5 (mediana 0.875): 29.8 % (25.4…34.7)

### log obrotów (wielkość) (ważność 0.021)

Wpływ w modelu (K1 → K5): +0.009, +0.010, -0.003, -0.003, -0.020

Odsetek sukcesu: K1 (mediana 16): 30.4 % (27.9…32.9); K2 (mediana 17): 29.8 % (27.0…32.3); K3 (mediana 17.9): 28.2 % (25.7…30.5); K4 (mediana 18.9): 27.8 % (25.4…30.2); K5 (mediana 20.3): 26.0 % (23.6…28.3)

### log wolumen 4 tyg. / od dołka (ważność 0.020)

Wpływ w modelu (K1 → K5): -0.002, +0.016, +0.007, -0.007, -0.018

Odsetek sukcesu: K1 (mediana -0.353): 27.7 % (25.6…30.0); K2 (mediana -0.135): 29.0 % (26.7…31.8); K3 (mediana -0.00483): 29.7 % (25.8…34.1); K4 (mediana 0.111): 27.7 % (25.6…29.8); K5 (mediana 0.383): 28.2 % (26.1…30.5)

### liczba korekt >= 10 % od dołka (ważność 0.015)

Wpływ w modelu (K1 → K5): -0.010, -0.017, -0.004, +0.004, +0.024

Odsetek sukcesu: K1 (mediana 0): 26.9 % (24.3…29.6); K2 (mediana 0): 26.8 % (24.1…29.8); K3 (mediana 1): 28.6 % (26.5…31.2); K4 (mediana 1): 28.8 % (26.8…31.2); K5 (mediana 2): 31.0 % (28.6…33.4)

### wybicie ponad max 26 tyg. (ważność 0.003)

Wpływ w modelu (K1 → K5): +0.000, -0.001, +0.000, +0.004, -0.001

Odsetek sukcesu: K1 (mediana 0): 30.2 % (27.7…33.0); K2 (mediana 0): 30.0 % (27.5…32.9); K3 (mediana 0): 29.4 % (26.4…32.4); K4 (mediana 1): 26.6 % (24.6…29.1); K5 (mediana 1): 26.0 % (23.6…28.1)
