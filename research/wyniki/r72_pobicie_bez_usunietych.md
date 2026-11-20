# Etap 50: jak często zestawy filtrów pobijają rynek (S&P 500 z danymi SEC, starty 2012-2025)

pobicie_* = odsetek miesięcy startu, w których portfel równych wag zestawu pobił odniesienie; przewaga_SPY = średnia różnica zwrotu; spolka_bije_SPY_60m = odsetek pojedynczych spółek zestawu, które pobiły SPY w 5 lat; lata_pobite_SPY = start w styczniu, rok trzymania.

| zestaw                                 |   sr_spolek |   miesiecy_z_spolkami |   pobicie_rownych_12m |   pobicie_SPY_12m |   przewaga_SPY_12m |   pobicie_rownych_60m |   pobicie_SPY_60m |   przewaga_SPY_60m |   spolka_bije_SPY_60m | lata_pobite_SPY   |
|:---------------------------------------|------------:|----------------------:|----------------------:|------------------:|-------------------:|----------------------:|------------------:|-------------------:|----------------------:|:------------------|
| S0 wszystkie spółki                    |     399.181 |                   177 |                 0.138 |             0.461 |             -0.008 |                 0.025 |             0.311 |             -0.053 |                 0.378 | 6 z 14            |
| S1 przychody +8 % co rok (5 lat)       |      22.622 |                   143 |                 0.398 |             0.361 |             -0.03  |                 0.624 |             0.447 |              0.037 |                 0.382 | 5 z 11            |
| S2 S1 + dług < 1 + FCF > 0             |      14.979 |                   141 |                 0.443 |             0.366 |             -0.021 |                 0.663 |             0.542 |              0.154 |                 0.395 | 5 z 11            |
| S3 S2 + ROE > 15 %                     |       8.857 |                   140 |                 0.354 |             0.346 |             -0.041 |                 0.537 |             0.415 |             -0.017 |                 0.4   | 4 z 10            |
| S4 S3 + ROE nie spada r/r              |       5.717 |                   138 |                 0.422 |             0.359 |             -0.058 |                 0.625 |             0.488 |              0.003 |                 0.409 | 4 z 9             |
| S5 S4 + PEG z przychodów < 2           |       3.231 |                   130 |                 0.508 |             0.467 |             -0.016 |                 0.68  |             0.613 |              0.115 |                 0.512 | 4 z 8             |
| S6 S4 + PEG z przychodów < 1           |       1.941 |                   101 |                 0.62  |             0.587 |              0.024 |                 0.783 |             0.717 |              0.329 |                 0.619 | 5 z 7             |
| S7 S4 + PEG z EPS 5 lat < 2            |       3.944 |                   125 |                 0.539 |             0.513 |              0.012 |                 0.627 |             0.448 |              0.015 |                 0.428 | 4 z 9             |
| S8 S2 + PEG z przychodów < 2 (bez ROE) |       6.771 |                   140 |                 0.485 |             0.446 |             -0.026 |                 0.512 |             0.439 |             -0.044 |                 0.447 | 5 z 10            |

## Rok po roku: przewaga nad SPY portfela ze stycznia (w nawiasie liczba spółek)

|      | S0 wszystkie spółki   | S2 S1 + dług < 1 + FCF > 0   | S4 S3 + ROE nie spada r/r   | S5 S4 + PEG z przychodów < 2   |
|-----:|:----------------------|:-----------------------------|:----------------------------|:-------------------------------|
| 2012 | +3 pp (313)           | nan                          | nan                         | nan                            |
| 2013 | +3 pp (325)           | nan                          | nan                         | nan                            |
| 2014 | +0 pp (332)           | nan                          | nan                         | nan                            |
| 2015 | -3 pp (339)           | +66 pp (1)                   | nan                         | nan                            |
| 2016 | +6 pp (354)           | -4 pp (4)                    | nan                         | nan                            |
| 2017 | -2 pp (374)           | +10 pp (9)                   | -23 pp (2)                  | -24 pp (1)                     |
| 2018 | -0 pp (387)           | +0 pp (5)                    | +20 pp (1)                  | +20 pp (1)                     |
| 2019 | -4 pp (399)           | -4 pp (4)                    | -43 pp (1)                  | -43 pp (1)                     |
| 2020 | -6 pp (414)           | +19 pp (13)                  | +33 pp (4)                  | +51 pp (2)                     |
| 2021 | +1 pp (427)           | -6 pp (14)                   | +2 pp (8)                   | -3 pp (4)                      |
| 2022 | +6 pp (435)           | -3 pp (20)                   | -6 pp (8)                   | +5 pp (5)                      |
| 2023 | -13 pp (447)          | +8 pp (20)                   | +6 pp (8)                   | +11 pp (5)                     |
| 2024 | -8 pp (455)           | -8 pp (25)                   | -27 pp (6)                  | nan                            |
| 2025 | -4 pp (461)           | -23 pp (24)                  | -26 pp (8)                  | -16 pp (2)                     |
