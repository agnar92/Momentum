# Etap 22b: CEM10 z filtrem beta > 1,5 (beta z tygodniowych zwrotów vs SPY: 1, 3, 5 lat)

roznica = średnia różnica miesięcznego zwrotu vs CEM10 bez filtra, pp (95 % bootstrap blokowy).

| indeks   |   N | prog_6M_30   | wariant             |   CAGR |   pierwsza_polowa |   druga_polowa |   maxDD | roznica            | lepszy   |
|:---------|----:|:-------------|:--------------------|-------:|------------------:|---------------:|--------:|:-------------------|:---------|
| S&P 500  |   5 | True         | CEM10 bez filtra    |  0.189 |             0.107 |          0.286 |  -0.548 |                    | False    |
| S&P 500  |   5 | True         | beta > 1,5 (1 rok)  |  0.243 |             0.134 |          0.373 |  -0.533 | +0.45 (-0.06…1.05) | False    |
| S&P 500  |   5 | True         | beta > 1,5 (3 lata) |  0.204 |             0.141 |          0.277 |  -0.557 | +0.11 (-0.36…0.84) | False    |
| S&P 500  |   5 | True         | beta > 1,5 (5 lat)  |  0.227 |             0.153 |          0.312 |  -0.37  | +0.21 (-0.25…1.01) | False    |
| S&P 500  |   5 | False        | CEM10 bez filtra    |  0.189 |             0.107 |          0.286 |  -0.548 |                    | False    |
| S&P 500  |   5 | False        | beta > 1,5 (1 rok)  |  0.237 |             0.134 |          0.361 |  -0.532 | +0.43 (-0.05…1.07) | False    |
| S&P 500  |   5 | False        | beta > 1,5 (3 lata) |  0.192 |             0.146 |          0.243 |  -0.473 | +0.01 (-0.44…0.74) | False    |
| S&P 500  |   5 | False        | beta > 1,5 (5 lat)  |  0.241 |             0.17  |          0.323 |  -0.405 | +0.33 (-0.16…1.18) | False    |
| S&P 500  |  10 | True         | CEM10 bez filtra    |  0.19  |             0.134 |          0.253 |  -0.387 |                    | False    |
| S&P 500  |  10 | True         | beta > 1,5 (1 rok)  |  0.178 |             0.109 |          0.258 |  -0.503 | -0.01 (-0.47…0.52) | False    |
| S&P 500  |  10 | True         | beta > 1,5 (3 lata) |  0.153 |             0.105 |          0.209 |  -0.469 | -0.26 (-0.69…0.19) | False    |
| S&P 500  |  10 | True         | beta > 1,5 (5 lat)  |  0.168 |             0.105 |          0.241 |  -0.279 | -0.18 (-0.60…0.35) | False    |
| S&P 500  |  10 | False        | CEM10 bez filtra    |  0.188 |             0.134 |          0.249 |  -0.387 |                    | False    |
| S&P 500  |  10 | False        | beta > 1,5 (1 rok)  |  0.174 |             0.104 |          0.255 |  -0.503 | -0.02 (-0.43…0.45) | False    |
| S&P 500  |  10 | False        | beta > 1,5 (3 lata) |  0.18  |             0.15  |          0.212 |  -0.466 | -0.02 (-0.42…0.46) | False    |
| S&P 500  |  10 | False        | beta > 1,5 (5 lat)  |  0.186 |             0.14  |          0.239 |  -0.416 | -0.00 (-0.37…0.50) | False    |
| NDX      |   5 | True         | CEM10 bez filtra    |  0.263 |             0.226 |          0.298 |  -0.331 |                    | False    |
| NDX      |   5 | True         | beta > 1,5 (1 rok)  |  0.269 |             0.171 |          0.365 |  -0.335 | +0.06 (-0.44…0.58) | False    |
| NDX      |   5 | True         | beta > 1,5 (3 lata) |  0.245 |             0.138 |          0.353 |  -0.363 | -0.07 (-0.83…0.49) | False    |
| NDX      |   5 | True         | beta > 1,5 (5 lat)  |  0.246 |             0.174 |          0.316 |  -0.343 | -0.10 (-0.80…0.49) | False    |
| NDX      |   5 | False        | CEM10 bez filtra    |  0.267 |             0.226 |          0.306 |  -0.34  |                    | False    |
| NDX      |   5 | False        | beta > 1,5 (1 rok)  |  0.295 |             0.195 |          0.395 |  -0.427 | +0.24 (-0.37…0.85) | False    |
| NDX      |   5 | False        | beta > 1,5 (3 lata) |  0.272 |             0.136 |          0.41  |  -0.358 | +0.09 (-0.61…0.59) | False    |
| NDX      |   5 | False        | beta > 1,5 (5 lat)  |  0.308 |             0.215 |          0.399 |  -0.32  | +0.30 (-0.41…0.96) | False    |
| NDX      |  10 | True         | CEM10 bez filtra    |  0.236 |             0.209 |          0.262 |  -0.309 |                    | False    |
| NDX      |  10 | True         | beta > 1,5 (1 rok)  |  0.204 |             0.114 |          0.293 |  -0.341 | -0.24 (-0.75…0.24) | False    |
| NDX      |  10 | True         | beta > 1,5 (3 lata) |  0.183 |             0.083 |          0.282 |  -0.288 | -0.40 (-0.97…0.05) | False    |
| NDX      |  10 | True         | beta > 1,5 (5 lat)  |  0.183 |             0.092 |          0.273 |  -0.258 | -0.41 (-0.97…0.06) | False    |
| NDX      |  10 | False        | CEM10 bez filtra    |  0.231 |             0.207 |          0.254 |  -0.285 |                    | False    |
| NDX      |  10 | False        | beta > 1,5 (1 rok)  |  0.217 |             0.138 |          0.294 |  -0.325 | -0.07 (-0.54…0.46) | False    |
| NDX      |  10 | False        | beta > 1,5 (3 lata) |  0.197 |             0.099 |          0.293 |  -0.302 | -0.25 (-0.71…0.27) | False    |
| NDX      |  10 | False        | beta > 1,5 (5 lat)  |  0.214 |             0.142 |          0.283 |  -0.248 | -0.15 (-0.60…0.33) | False    |

