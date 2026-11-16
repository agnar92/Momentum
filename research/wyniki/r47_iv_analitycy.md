# Etap 28: wartość wewnętrzna (EPS x 100 g) z prognozą jakości analityków (symulacja, wiedza o przyszłości), 2011-2026

## Portfele

| prognoza                                   | portfel                    |   CAGR |   CAGR_2011_18 |   CAGR_2019_26 |   maxDD | roznica_vs_rowne   |   lepszy |
|:-------------------------------------------|:---------------------------|-------:|---------------:|---------------:|--------:|:-------------------|---------:|
| idealna prognoza (s 0)                     | top 20 najwyższy potencjał |  0.266 |          0.192 |          0.348 |  -0.271 | +1.03 (0.71…1.54)  |        1 |
| idealna prognoza (s 0)                     | wszystkie z IV > cena      |  0.205 |          0.178 |          0.234 |  -0.194 | +0.58 (0.45…0.88)  |        1 |
| jak analitycy: błąd 10 pp, +5 pp optymizmu | top 20 najwyższy potencjał |  0.264 |          0.193 |          0.341 |  -0.271 | +1.01 (0.71…1.50)  |        1 |
| jak analitycy: błąd 10 pp, +5 pp optymizmu | wszystkie z IV > cena      |  0.19  |          0.165 |          0.217 |  -0.199 | +0.47 (0.33…0.76)  |        1 |
| błąd 20 pp, +5 pp                          | top 20 najwyższy potencjał |  0.261 |          0.197 |          0.331 |  -0.278 | +0.99 (0.72…1.45)  |        1 |
| błąd 20 pp, +5 pp                          | wszystkie z IV > cena      |  0.177 |          0.154 |          0.2   |  -0.2   | +0.37 (0.24…0.64)  |        1 |
| błąd 35 pp, +5 pp                          | top 20 najwyższy potencjał |  0.239 |          0.17  |          0.313 |  -0.298 | +0.84 (0.58…1.30)  |        1 |
| błąd 35 pp, +5 pp                          | wszystkie z IV > cena      |  0.167 |          0.148 |          0.187 |  -0.214 | +0.30 (0.20…0.51)  |        1 |
| g = 10 % dla wszystkich (bez prognozy)     | top 20 najwyższy potencjał |  0.102 |          0.087 |          0.117 |  -0.432 | -0.10 (-0.41…0.25) |        0 |
| g = 10 % dla wszystkich (bez prognozy)     | wszystkie z IV > cena      |  0.104 |          0.1   |          0.109 |  -0.437 | -0.08 (-0.33…0.29) |        0 |
| CEM10 (to samo uniwersum, N = 10)          | -                          |  0.219 |          0.112 |          0.341 |  -0.293 | nan                |      nan |
| równe wagi uniwersum                       | -                          |  0.128 |          0.119 |          0.138 |  -0.268 | nan                |      nan |
| SPY                                        | -                          |  0.141 |          0.112 |          0.172 |  -0.239 | nan                |      nan |

## Czy IV przewiduje cenę za rok

| prognoza                                   |   IC_potencjal_vs_cena_za_rok |   IC_t |   cena_ge_IV |   mediana_bledu_pp |
|:-------------------------------------------|------------------------------:|-------:|-------------:|-------------------:|
| idealna prognoza (s 0)                     |                         0.136 |  6.881 |        0.554 |             70.377 |
| jak analitycy: błąd 10 pp, +5 pp optymizmu |                         0.124 |  6.468 |        0.467 |             68.951 |
| błąd 20 pp, +5 pp                          |                         0.105 |  5.779 |        0.411 |             77.456 |
| błąd 35 pp, +5 pp                          |                         0.084 |  4.925 |        0.336 |             93.858 |
| g = 10 % dla wszystkich (bez prognozy)     |                         0.001 |  0.063 |        0.924 |             65.322 |

Mediana faktycznej zmiany ceny za rok w kwintylach potencjału (1 = najniższy, 5 = najwyższy):

|   kwintyl |   błąd 20 pp, +5 pp |   błąd 35 pp, +5 pp |   g = 10 % dla wszystkich (bez prognozy) |   idealna prognoza (s 0) |   jak analitycy: błąd 10 pp, +5 pp optymizmu |
|----------:|--------------------:|--------------------:|-----------------------------------------:|-------------------------:|---------------------------------------------:|
|         1 |               0.115 |               0.124 |                                    0.105 |                    0.098 |                                        0.102 |
|         2 |               0.13  |               0.124 |                                    0.121 |                    0.138 |                                        0.136 |
|         3 |               0.143 |               0.134 |                                    0.124 |                    0.161 |                                        0.144 |
|         4 |               0.15  |               0.146 |                                    0.125 |                    0.171 |                                        0.163 |
|         5 |               0.186 |               0.18  |                                    0.104 |                    0.185 |                                        0.185 |
