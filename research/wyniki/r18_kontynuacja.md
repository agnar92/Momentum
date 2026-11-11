# Etap 11 D: co odróżnia wzrost, który trwa dalej (zdarzenia 1998-2018)

Zdarzeń (cena po raz pierwszy +30 % nad dołkiem 52 tyg.): 39,706; dojście do +100 % od dołka przed spadkiem o 25 % od szczytu: 28.5 %.

Trafność modelu poza blokiem lat: AUC = 0.542; AUC w latach: od 0.480 do 0.654, mediana 0.554.

Odsetek sukcesu i mediana zwrotu 52 tyg. w kwintylach prognozy modelu (0 = najniższa):

|   kwintyl |   sukces |   zwrot52_mediana |    n |
|----------:|---------:|------------------:|-----:|
|         0 |    0.229 |             0.051 | 7942 |
|         1 |    0.276 |             0.048 | 7941 |
|         2 |    0.295 |             0.052 | 7941 |
|         3 |    0.304 |             0.058 | 7941 |
|         4 |    0.319 |             0.06  | 7941 |

## Czego model się nauczył: cechy od najważniejszej

Dla każdej cechy: ważność (średnie |SHAP|), kierunek wpływu na prognozę w kwintylach cechy (średni SHAP, log-szanse) oraz surowy odsetek sukcesu w kwintylach cechy z 95 % z bootstrapu blokowego po miesiącach.

### log ceny (ważność 0.187)

Wpływ w modelu (K1 → K5): +0.342, +0.094, -0.055, -0.189, -0.231

Odsetek sukcesu: K1 (mediana 1.74): 36.4 % (33.1…39.6); K2 (mediana 2.49): 30.8 % (28.0…34.1); K3 (mediana 2.98): 27.4 % (25.2…29.6); K4 (mediana 3.48): 24.2 % (22.1…25.9); K5 (mediana 4.4): 23.5 % (21.7…25.2)

### SPY / SMA 40 - 1 (ważność 0.171)

Wpływ w modelu (K1 → K5): -0.047, +0.149, +0.095, -0.017, -0.240

Odsetek sukcesu: K1 (mediana -0.0729): 29.6 % (23.4…36.8); K2 (mediana 0.0122): 31.8 % (27.5…36.0); K3 (mediana 0.0459): 28.2 % (25.1…31.0); K4 (mediana 0.0688): 27.3 % (24.3…30.9); K5 (mediana 0.0978): 25.3 % (22.3…28.5)

### tempo od dołka (% / tydz.) (ważność 0.147)

Wpływ w modelu (K1 → K5): -0.257, -0.104, +0.045, +0.097, +0.226

Odsetek sukcesu: K1 (mediana 0.00564): 25.8 % (23.8…28.0); K2 (mediana 0.00678): 27.9 % (25.8…30.1); K3 (mediana 0.00969): 29.7 % (27.3…32.5); K4 (mediana 0.0217): 28.0 % (24.8…31.2); K5 (mediana 0.072): 30.9 % (26.3…36.9)

### zwrot rynku 13 tyg. (ważność 0.138)

Wpływ w modelu (K1 → K5): +0.046, -0.114, -0.097, -0.052, +0.259

Odsetek sukcesu: K1 (mediana -0.105): 30.8 % (26.4…35.5); K2 (mediana -0.0188): 29.5 % (24.2…34.7); K3 (mediana 0.0328): 25.2 % (22.5…27.7); K4 (mediana 0.0684): 24.6 % (21.9…27.2); K5 (mediana 0.137): 32.1 % (28.3…36.3)

### najgłębsza korekta od dołka (ważność 0.113)

Wpływ w modelu (K1 → K5): +0.166, +0.098, -0.028, -0.120, -0.137

Odsetek sukcesu: K1 (mediana -0.297): 31.8 % (29.1…34.3); K2 (mediana -0.169): 29.6 % (27.5…31.9); K3 (mediana -0.108): 26.6 % (24.2…28.8); K4 (mediana -0.0641): 25.2 % (22.6…27.3); K5 (mediana -0.0019): 29.1 % (25.2…34.1)

### tygodnie od dołka do +30 % (ważność 0.062)

Wpływ w modelu (K1 → K5): -0.089, -0.044, +0.007, +0.052, +0.107

Odsetek sukcesu: K1 (mediana 4): 30.5 % (25.5…36.3); K2 (mediana 14): 27.8 % (24.4…30.8); K3 (mediana 31): 28.7 % (26.1…31.6); K4 (mediana 44): 27.4 % (25.1…29.7); K5 (mediana 50): 27.9 % (25.5…30.5)

### spadek przed dołkiem (od max 3 lat) (ważność 0.056)

Wpływ w modelu (K1 → K5): +0.052, -0.053, -0.047, -0.008, +0.020

Odsetek sukcesu: K1 (mediana -0.775): 32.4 % (28.2…37.1); K2 (mediana -0.564): 29.0 % (26.3…32.1); K3 (mediana -0.399): 27.8 % (25.4…30.0); K4 (mediana -0.251): 27.5 % (25.5…29.5); K5 (mediana -0.101): 25.6 % (23.5…27.6)

### log zmienność od dołka / przed (ważność 0.053)

Wpływ w modelu (K1 → K5): +0.059, +0.042, +0.019, -0.013, -0.101

Odsetek sukcesu: K1 (mediana -0.585): 30.3 % (27.0…34.1); K2 (mediana -0.264): 28.6 % (26.5…30.8); K3 (mediana -0.0803): 28.5 % (26.3…30.6); K4 (mediana 0.105): 28.4 % (26.2…30.7); K5 (mediana 0.383): 26.4 % (24.1…28.7)

### log wolumen od dołka / 26 tyg. przed (ważność 0.045)

Wpływ w modelu (K1 → K5): +0.023, +0.052, +0.019, -0.048, -0.053

Odsetek sukcesu: K1 (mediana -0.366): 29.5 % (27.0…32.1); K2 (mediana -0.129): 29.2 % (26.9…31.7); K3 (mediana 0.0295): 28.9 % (26.3…31.6); K4 (mediana 0.208): 27.0 % (24.4…29.7); K5 (mediana 0.557): 27.8 % (25.2…30.7)

### odległość od rekordu (ważność 0.039)

Wpływ w modelu (K1 → K5): -0.054, +0.028, +0.008, +0.004, +0.001

Odsetek sukcesu: K1 (mediana -0.845): 30.8 % (27.7…34.1); K2 (mediana -0.565): 30.9 % (27.8…34.3); K3 (mediana -0.324): 28.1 % (25.7…30.5); K4 (mediana -0.129): 27.3 % (25.2…29.4); K5 (mediana 0): 25.1 % (23.1…27.2)

### odległość od szczytu 52 tyg. (ważność 0.038)

Wpływ w modelu (K1 → K5): -0.074, -0.008, +0.023, +0.035, -0.001

Odsetek sukcesu: K1 (mediana -0.491): 31.2 % (26.8…37.0); K2 (mediana -0.242): 29.8 % (27.2…32.7); K3 (mediana -0.118): 28.9 % (26.6…31.1); K4 (mediana -0.0313): 28.1 % (25.9…30.3); K5 (mediana 0): 24.2 % (22.4…26.2)

### odsetek tygodni wzrostowych od dołka (ważność 0.025)

Wpływ w modelu (K1 → K5): -0.008, +0.028, +0.014, -0.018, -0.018

Odsetek sukcesu: K1 (mediana 0.51): 29.2 % (27.0…31.6); K2 (mediana 0.564): 29.1 % (26.9…31.2); K3 (mediana 0.608): 28.2 % (26.2…30.4); K4 (mediana 0.667): 26.0 % (23.7…28.4); K5 (mediana 0.889): 29.7 % (25.3…34.6)

### log obrotów (wielkość) (ważność 0.020)

Wpływ w modelu (K1 → K5): +0.007, +0.008, -0.001, +0.001, -0.022

Odsetek sukcesu: K1 (mediana 16): 30.4 % (27.9…32.9); K2 (mediana 17): 29.8 % (27.0…32.3); K3 (mediana 17.9): 28.3 % (25.8…30.5); K4 (mediana 18.9): 27.9 % (25.4…30.4); K5 (mediana 20.3): 25.9 % (23.5…28.3)

### log wolumen 4 tyg. / od dołka (ważność 0.020)

Wpływ w modelu (K1 → K5): -0.001, +0.014, +0.003, -0.006, -0.015

Odsetek sukcesu: K1 (mediana -0.353): 27.7 % (25.6…30.1); K2 (mediana -0.134): 28.9 % (26.6…31.7); K3 (mediana -0.00452): 29.7 % (25.9…34.1); K4 (mediana 0.111): 27.8 % (25.6…29.9); K5 (mediana 0.383): 28.2 % (26.1…30.5)

### liczba korekt >= 10 % od dołka (ważność 0.016)

Wpływ w modelu (K1 → K5): -0.011, -0.015, -0.005, +0.004, +0.026

Odsetek sukcesu: K1 (mediana 0): 27.0 % (24.4…29.7); K2 (mediana 0): 26.8 % (24.1…29.8); K3 (mediana 1): 28.6 % (26.5…31.3); K4 (mediana 1): 28.8 % (26.7…31.1); K5 (mediana 2): 31.1 % (28.6…33.5)

### wybicie ponad max 26 tyg. (ważność 0.002)

Wpływ w modelu (K1 → K5): -0.002, -0.001, +0.000, +0.004, +0.000

Odsetek sukcesu: K1 (mediana 0): 30.2 % (27.6…32.9); K2 (mediana 0): 30.0 % (27.4…32.9); K3 (mediana 0): 29.3 % (26.4…32.3); K4 (mediana 1): 26.6 % (24.6…29.2); K5 (mediana 1): 26.1 % (23.7…28.1)
