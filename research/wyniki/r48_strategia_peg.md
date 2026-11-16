# Etap 29: PEG <= 1, top N po potencjale IV, przebudowa roczna, przycinanie kwartalne (S&P 500 z danymi SEC, 2011-2026)

| wzrost                                  |   N | trzymanie        | przycinanie   |   CAGR |   CAGR_2011_18 |   CAGR_2019_26 |   maxDD |   z_10k | roznica_vs_rowne    | lepszy   |
|:----------------------------------------|----:|:-----------------|:--------------|-------:|---------------:|---------------:|--------:|--------:|:--------------------|:---------|
| A: CAGR EPS od początku (realne)        |  10 | dopóki potencjał | brak          |  0.117 |          0.059 |          0.181 |  -0.293 |   57387 | -0.00 (-0.47…0.41)  | False    |
| A: CAGR EPS od początku (realne)        |  10 | dopóki potencjał | 7 %           |  0.077 |          0.042 |          0.115 |  -0.258 |   32334 | -0.41 (-0.71…-0.22) | False    |
| A: CAGR EPS od początku (realne)        |  10 | dopóki potencjał | 10 %          |  0.103 |          0.054 |          0.156 |  -0.313 |   46679 | -0.15 (-0.56…0.15)  | False    |
| A: CAGR EPS od początku (realne)        |  10 | tylko w top N    | brak          |  0.094 |          0.078 |          0.11  |  -0.394 |   40938 | -0.18 (-0.65…0.27)  | False    |
| A: CAGR EPS od początku (realne)        |  10 | tylko w top N    | 7 %           |  0.071 |          0.062 |          0.079 |  -0.339 |   29274 | -0.44 (-0.81…-0.15) | False    |
| A: CAGR EPS od początku (realne)        |  10 | tylko w top N    | 10 %          |  0.091 |          0.075 |          0.107 |  -0.382 |   39349 | -0.23 (-0.70…0.14)  | False    |
| A: CAGR EPS od początku (realne)        |  20 | dopóki potencjał | brak          |  0.111 |          0.065 |          0.16  |  -0.36  |   52420 | -0.07 (-0.47…0.27)  | False    |
| A: CAGR EPS od początku (realne)        |  20 | dopóki potencjał | 7 %           |  0.107 |          0.066 |          0.151 |  -0.356 |   49668 | -0.11 (-0.51…0.23)  | False    |
| A: CAGR EPS od początku (realne)        |  20 | dopóki potencjał | 10 %          |  0.109 |          0.065 |          0.157 |  -0.358 |   51353 | -0.09 (-0.51…0.27)  | False    |
| A: CAGR EPS od początku (realne)        |  20 | tylko w top N    | brak          |  0.098 |          0.07  |          0.127 |  -0.394 |   43508 | -0.15 (-0.61…0.27)  | False    |
| A: CAGR EPS od początku (realne)        |  20 | tylko w top N    | 7 %           |  0.096 |          0.07  |          0.124 |  -0.396 |   42593 | -0.17 (-0.60…0.26)  | False    |
| A: CAGR EPS od początku (realne)        |  20 | tylko w top N    | 10 %          |  0.098 |          0.07  |          0.127 |  -0.394 |   43542 | -0.15 (-0.57…0.30)  | False    |
| B: jak analityk, błąd 10 pp (nierealne) |  10 | dopóki potencjał | brak          |  0.201 |          0.134 |          0.273 |  -0.264 |  178175 | +0.61 (0.29…1.10)   | True     |
| B: jak analityk, błąd 10 pp (nierealne) |  10 | dopóki potencjał | 7 %           |  0.151 |          0.11  |          0.194 |  -0.223 |   91065 | +0.17 (-0.05…0.57)  | False    |
| B: jak analityk, błąd 10 pp (nierealne) |  10 | dopóki potencjał | 10 %          |  0.19  |          0.136 |          0.248 |  -0.259 |  154301 | +0.51 (0.22…0.96)   | True     |
| B: jak analityk, błąd 10 pp (nierealne) |  10 | tylko w top N    | brak          |  0.2   |          0.155 |          0.247 |  -0.311 |  175876 | +0.61 (0.17…1.22)   | True     |
| B: jak analityk, błąd 10 pp (nierealne) |  10 | tylko w top N    | 7 %           |  0.15  |          0.123 |          0.177 |  -0.259 |   89788 | +0.17 (-0.14…0.63)  | False    |
| B: jak analityk, błąd 10 pp (nierealne) |  10 | tylko w top N    | 10 %          |  0.184 |          0.148 |          0.222 |  -0.297 |  142560 | +0.47 (0.09…1.03)   | True     |
| B: jak analityk, błąd 10 pp (nierealne) |  20 | dopóki potencjał | brak          |  0.18  |          0.145 |          0.218 |  -0.285 |  135695 | +0.44 (0.18…0.81)   | True     |
| B: jak analityk, błąd 10 pp (nierealne) |  20 | dopóki potencjał | 7 %           |  0.178 |          0.145 |          0.213 |  -0.283 |  132171 | +0.42 (0.17…0.79)   | True     |
| B: jak analityk, błąd 10 pp (nierealne) |  20 | dopóki potencjał | 10 %          |  0.18  |          0.145 |          0.217 |  -0.285 |  135479 | +0.44 (0.18…0.82)   | True     |
| B: jak analityk, błąd 10 pp (nierealne) |  20 | tylko w top N    | brak          |  0.187 |          0.142 |          0.235 |  -0.308 |  148141 | +0.49 (0.19…0.90)   | True     |
| B: jak analityk, błąd 10 pp (nierealne) |  20 | tylko w top N    | 7 %           |  0.183 |          0.142 |          0.227 |  -0.308 |  140832 | +0.46 (0.18…0.86)   | True     |
| B: jak analityk, błąd 10 pp (nierealne) |  20 | tylko w top N    | 10 %          |  0.186 |          0.142 |          0.234 |  -0.308 |  147806 | +0.48 (0.20…0.91)   | True     |

## Odniesienia

| strategia                         |   CAGR |   CAGR_2011_18 |   CAGR_2019_26 |   maxDD |   z_10k |
|:----------------------------------|-------:|---------------:|---------------:|--------:|--------:|
| CEM10 (to samo uniwersum, N = 10) |  0.219 |          0.112 |          0.341 |  -0.293 |  225827 |
| równe wagi uniwersum              |  0.128 |          0.119 |          0.138 |  -0.268 |   66685 |
| SPY                               |  0.141 |          0.112 |          0.172 |  -0.239 |   79896 |

## Lista według metody A (CAGR od początku) na koniec sierpnia 2026, top 20

| seria     |   cena |   EPS |   CAGR_EPS_% |      IV |   potencjal_% |   forward_PEG |
|:----------|-------:|------:|-------------:|--------:|--------------:|--------------:|
| APP.US~0  | 312.06 | 13.01 |       202.33 | 2632.33 |        743.53 |          0.04 |
| ALL.US~0  | 257.8  | 49.47 |        25.98 | 1285.05 |        398.47 |          0.16 |
| CEG.US~0  | 274.77 | 10.22 |       127.69 | 1305.15 |        375    |          0.09 |
| HIG.US~0  | 136.78 | 15.28 |        37.11 |  567.19 |        314.67 |          0.18 |
| BAC.US~0  |  61.63 |  4.29 |        53.58 |  229.6  |        272.57 |          0.17 |
| INCY.US~0 | 123.22 |  7.85 |        58.35 |  458.04 |        271.72 |          0.17 |
| META.US~0 | 571.89 | 26.49 |        79.46 | 2104.94 |        268.07 |          0.15 |
| WDAY.US~0 | 197.45 |  4.94 |       132.49 |  654.5  |        231.48 |          0.13 |
| FIS.US~0  |  40.3  |  6.35 |        19.72 |  125.27 |        210.82 |          0.27 |
| PODD.US~0 | 148.66 |  5.33 |        86.42 |  460.64 |        209.86 |          0.17 |
| CHTR.US~0 | 152.44 | 38.44 |        11.77 |  452.45 |        196.81 |          0.3  |
| NXPI.US~0 | 223.63 | 11.62 |        52.25 |  606.91 |        171.39 |          0.24 |
| PYPL.US~0 |  52.54 |  5.25 |        27.01 |  141.86 |        170.02 |          0.29 |
| UHS.US~0  | 170.13 | 24.43 |        16.86 |  411.87 |        142.09 |          0.35 |
| CINF.US~0 | 168.94 | 20.91 |        19.05 |  398.34 |        135.79 |          0.36 |
| SMCI.US~0 |  37.28 |  3.26 |        26.76 |   87.23 |        133.99 |          0.34 |
| MPC.US~0  | 373.32 | 28.79 |        28.88 |  831.62 |        122.76 |          0.35 |
| HOOD.US~0 | 104.81 |  2.26 |       100.44 |  227.01 |        116.59 |          0.23 |
| PHM.US~1  | 126.04 |  9.74 |        27.21 |  264.89 |        110.16 |          0.37 |
| KEY.US~0  |  21.4  |  1.68 |        26.54 |   44.56 |        108.19 |          0.38 |
