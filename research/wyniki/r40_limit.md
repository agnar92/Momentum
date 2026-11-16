# Etap 24: CEM10 z limitem udziału pozycji (S&P 500 1998-2026, NDX 2008-2026)

roznica = średnia różnica miesięcznego zwrotu vs CEM10 bez limitu, pp (95 % bootstrap blokowy).

| indeks   |   N | wariant                               |   CAGR |   pierwsza_polowa |   druga_polowa |   maxDD |            z_10k | roznica             | lepszy   |
|:---------|----:|:--------------------------------------|-------:|------------------:|---------------:|--------:|-----------------:|:--------------------|:---------|
| S&P 500  |  10 | CEM10 bez limitu                      |  0.19  |             0.134 |          0.253 |  -0.387 |      1.45664e+06 | +0.00 (0.00…0.00)   | False    |
| S&P 500  |  10 | rebalancing do równych wag co miesiąc |  0.187 |             0.141 |          0.238 |  -0.365 |      1.35758e+06 | -0.05 (-0.17…0.08)  | False    |
| S&P 500  |  10 | limit 10 %, nadwyżka w gotówce        |  0.181 |             0.138 |          0.229 |  -0.323 |      1.17496e+06 | -0.12 (-0.24…0.03)  | False    |
| S&P 500  |  10 | limit 10 %, nadwyżka w SPY            |  0.181 |             0.114 |          0.259 |  -0.556 |      1.18706e+06 | -0.06 (-0.38…0.22)  | False    |
| S&P 500  |  10 | limit 15 %, nadwyżka w gotówce        |  0.193 |             0.14  |          0.254 |  -0.367 |      1.58561e+06 | +0.01 (-0.06…0.11)  | False    |
| S&P 500  |  10 | limit 15 %, nadwyżka w SPY            |  0.187 |             0.111 |          0.274 |  -0.574 |      1.34836e+06 | +0.01 (-0.32…0.28)  | False    |
| S&P 500  |  10 | limit 20 %, nadwyżka w gotówce        |  0.189 |             0.136 |          0.248 |  -0.373 |      1.42253e+06 | -0.02 (-0.07…0.04)  | False    |
| S&P 500  |  10 | limit 20 %, nadwyżka w SPY            |  0.176 |             0.099 |          0.265 |  -0.619 |      1.03706e+06 | -0.06 (-0.38…0.20)  | False    |
| S&P 500  |  20 | CEM10 bez limitu                      |  0.176 |             0.138 |          0.219 |  -0.373 |      1.03762e+06 | +0.00 (0.00…0.00)   | False    |
| S&P 500  |  20 | rebalancing do równych wag co miesiąc |  0.156 |             0.131 |          0.185 |  -0.339 | 643846           | -0.17 (-0.29…-0.03) | False    |
| S&P 500  |  20 | limit 10 %, nadwyżka w gotówce        |  0.171 |             0.139 |          0.206 |  -0.349 | 915636           | -0.05 (-0.12…0.02)  | False    |
| S&P 500  |  20 | limit 10 %, nadwyżka w SPY            |  0.163 |             0.113 |          0.22  |  -0.549 | 754792           | -0.07 (-0.36…0.19)  | False    |
| S&P 500  |  20 | limit 15 %, nadwyżka w gotówce        |  0.169 |             0.137 |          0.206 |  -0.373 | 888205           | -0.05 (-0.11…-0.00) | False    |
| S&P 500  |  20 | limit 15 %, nadwyżka w SPY            |  0.172 |             0.11  |          0.242 |  -0.576 | 939825           | +0.01 (-0.29…0.25)  | False    |
| S&P 500  |  20 | limit 20 %, nadwyżka w gotówce        |  0.171 |             0.139 |          0.208 |  -0.373 | 932302           | -0.04 (-0.09…0.01)  | False    |
| S&P 500  |  20 | limit 20 %, nadwyżka w SPY            |  0.164 |             0.11  |          0.226 |  -0.576 | 785691           | -0.04 (-0.35…0.20)  | False    |
| NDX      |  10 | CEM10 bez limitu                      |  0.236 |             0.209 |          0.262 |  -0.309 | 524852           | +0.00 (0.00…0.00)   | False    |
| NDX      |  10 | rebalancing do równych wag co miesiąc |  0.219 |             0.195 |          0.241 |  -0.274 | 401125           | -0.16 (-0.37…0.04)  | False    |
| NDX      |  10 | limit 10 %, nadwyżka w gotówce        |  0.211 |             0.19  |          0.231 |  -0.265 | 357529           | -0.23 (-0.44…-0.02) | False    |
| NDX      |  10 | limit 10 %, nadwyżka w SPY            |  0.224 |             0.179 |          0.267 |  -0.463 | 436018           | -0.09 (-0.45…0.35)  | False    |
| NDX      |  10 | limit 15 %, nadwyżka w gotówce        |  0.227 |             0.203 |          0.248 |  -0.268 | 452698           | -0.08 (-0.24…0.03)  | False    |
| NDX      |  10 | limit 15 %, nadwyżka w SPY            |  0.234 |             0.188 |          0.277 |  -0.463 | 505219           | +0.01 (-0.36…0.37)  | False    |
| NDX      |  10 | limit 20 %, nadwyżka w gotówce        |  0.225 |             0.203 |          0.245 |  -0.294 | 442201           | -0.09 (-0.20…-0.00) | False    |
| NDX      |  10 | limit 20 %, nadwyżka w SPY            |  0.238 |             0.191 |          0.283 |  -0.463 | 538886           | +0.05 (-0.29…0.40)  | False    |
| NDX      |  20 | CEM10 bez limitu                      |  0.17  |             0.151 |          0.188 |  -0.262 | 187737           | +0.00 (0.00…0.00)   | False    |
| NDX      |  20 | rebalancing do równych wag co miesiąc |  0.15  |             0.134 |          0.165 |  -0.218 | 136801           | -0.18 (-0.31…-0.02) | False    |
| NDX      |  20 | limit 10 %, nadwyżka w gotówce        |  0.159 |             0.151 |          0.166 |  -0.234 | 156717           | -0.10 (-0.17…0.00)  | False    |
| NDX      |  20 | limit 10 %, nadwyżka w SPY            |  0.173 |             0.14  |          0.204 |  -0.463 | 196375           | +0.06 (-0.33…0.44)  | False    |
| NDX      |  20 | limit 15 %, nadwyżka w gotówce        |  0.173 |             0.151 |          0.193 |  -0.255 | 195433           | +0.02 (-0.03…0.05)  | False    |
| NDX      |  20 | limit 15 %, nadwyżka w SPY            |  0.181 |             0.138 |          0.221 |  -0.463 | 221469           | +0.12 (-0.23…0.46)  | False    |
| NDX      |  20 | limit 20 %, nadwyżka w gotówce        |  0.171 |             0.151 |          0.191 |  -0.262 | 191692           | +0.01 (-0.00…0.03)  | False    |
| NDX      |  20 | limit 20 %, nadwyżka w SPY            |  0.181 |             0.138 |          0.221 |  -0.463 | 221573           | +0.12 (-0.21…0.48)  | False    |
