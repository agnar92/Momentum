# Etap 50: jak często zestawy filtrów pobijają rynek (S&P 500 z danymi SEC, starty 2012-2025)

pobicie_* = odsetek miesięcy startu, w których portfel równych wag zestawu pobił odniesienie; przewaga_SPY = średnia różnica zwrotu; spolka_bije_SPY_60m = odsetek pojedynczych spółek zestawu, które pobiły SPY w 5 lat; lata_pobite_SPY = start w styczniu, rok trzymania.

| zestaw                                 |   sr_spolek |   miesiecy_z_spolkami |   pobicie_rownych_12m |   pobicie_SPY_12m |   przewaga_SPY_12m |   pobicie_rownych_60m |   pobicie_SPY_60m |   przewaga_SPY_60m |   spolka_bije_SPY_60m | lata_pobite_SPY   |
|:---------------------------------------|------------:|----------------------:|----------------------:|------------------:|-------------------:|----------------------:|------------------:|-------------------:|----------------------:|:------------------|
| S0 wszystkie spółki                    |     467.299 |                   177 |                 0.102 |             0.359 |             -0.013 |                 0.025 |             0.185 |             -0.1   |                 0.364 | 6 z 14            |
| S1 przychody +8 % co rok (5 lat)       |      24.713 |                   143 |                 0.383 |             0.323 |             -0.04  |                 0.635 |             0.318 |             -0.017 |                 0.367 | 4 z 11            |
| S2 S1 + dług < 1 + FCF > 0             |      17.95  |                   141 |                 0.374 |             0.26  |             -0.045 |                 0.663 |             0.41  |              0.041 |                 0.351 | 4 z 11            |
| S3 S2 + ROE > 15 %                     |      10.8   |                   140 |                 0.354 |             0.315 |             -0.06  |                 0.451 |             0.378 |             -0.116 |                 0.359 | 3 z 10            |
| S4 S3 + ROE nie spada r/r              |       6.841 |                   138 |                 0.414 |             0.312 |             -0.078 |                 0.6   |             0.45  |             -0.039 |                 0.389 | 3 z 9             |
| S5 S4 + PEG z przychodów < 2           |       3.835 |                   133 |                 0.48  |             0.415 |             -0.05  |                 0.667 |             0.6   |              0.05  |                 0.476 | 4 z 9             |
| S6 S4 + PEG z przychodów < 1           |       2.038 |                   106 |                 0.629 |             0.598 |              0.027 |                 0.783 |             0.717 |              0.299 |                 0.606 | 5 z 7             |
| S7 S4 + PEG z EPS 5 lat < 2            |       4.72  |                   125 |                 0.496 |             0.461 |             -0.023 |                 0.627 |             0.418 |             -0.029 |                 0.404 | 4 z 9             |
| S8 S2 + PEG z przychodów < 2 (bez ROE) |       8.3   |                   140 |                 0.431 |             0.369 |             -0.044 |                 0.512 |             0.415 |             -0.082 |                 0.41  | 4 z 10            |

## Rok po roku: przewaga nad SPY portfela ze stycznia (w nawiasie liczba spółek)

|      | S0 wszystkie spółki   | S2 S1 + dług < 1 + FCF > 0   | S4 S3 + ROE nie spada r/r   | S5 S4 + PEG z przychodów < 2   |
|-----:|:----------------------|:-----------------------------|:----------------------------|:-------------------------------|
| 2012 | +2 pp (424)           | nan                          | nan                         | nan                            |
| 2013 | +3 pp (433)           | nan                          | nan                         | nan                            |
| 2014 | +0 pp (437)           | nan                          | nan                         | nan                            |
| 2015 | -4 pp (440)           | +66 pp (1)                   | nan                         | nan                            |
| 2016 | +5 pp (447)           | -14 pp (5)                   | nan                         | nan                            |
| 2017 | -4 pp (462)           | +4 pp (12)                   | -23 pp (2)                  | -24 pp (1)                     |
| 2018 | -1 pp (468)           | -6 pp (6)                    | +20 pp (1)                  | +20 pp (1)                     |
| 2019 | -5 pp (473)           | -4 pp (5)                    | -43 pp (1)                  | -43 pp (1)                     |
| 2020 | -6 pp (480)           | +20 pp (17)                  | +24 pp (5)                  | +30 pp (3)                     |
| 2021 | +1 pp (482)           | -8 pp (16)                   | +2 pp (8)                   | -3 pp (4)                      |
| 2022 | +7 pp (482)           | -3 pp (22)                   | -6 pp (8)                   | +5 pp (5)                      |
| 2023 | -14 pp (485)          | +1 pp (23)                   | -5 pp (10)                  | +4 pp (6)                      |
| 2024 | -8 pp (490)           | -10 pp (28)                  | -24 pp (8)                  | -16 pp (1)                     |
| 2025 | -4 pp (490)           | -22 pp (28)                  | -28 pp (10)                 | -27 pp (3)                     |
