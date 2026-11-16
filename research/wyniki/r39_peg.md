# Etap 23: wzrost w rozsądnej cenie (P/E vs wzrost zysku), S&P 500 z danymi SEC, 2011-2026

Średnio członków S&P 500 w miesiącu: 484, z policzalnym P/E (dane SEC): 334. roznica_vs_rowne = średnia różnica miesięcznego zwrotu vs równe wagi tego samego uniwersum, pp (95 % bootstrap blokowy).

| strategia                                         |   CAGR |   CAGR_2011_18 |   CAGR_2019_26 |   maxDD | roznica_vs_rowne   |    z_10k | lepszy   |
|:--------------------------------------------------|-------:|---------------:|---------------:|--------:|:-------------------|---------:|:---------|
| S1 najniższe P/E                                  |  0.102 |          0.087 |          0.117 |  -0.432 | -0.10 (-0.41…0.24) |  45940.4 | False    |
| S2 najniższy PEG (wzrost 1 rok)                   |  0.102 |          0.071 |          0.136 |  -0.324 | -0.15 (-0.46…0.22) |  46340.8 | False    |
| S3 najniższy PEG (wzrost 3 lata)                  |  0.102 |          0.075 |          0.13  |  -0.299 | -0.16 (-0.45…0.14) |  45915.4 | False    |
| S4 forward PEG z wiedzą o przyszłości (nierealne) |  0.228 |          0.201 |          0.257 |  -0.22  | +0.76 (0.50…1.13)  | 255156   | True     |
| CEM10 (to samo uniwersum, N = 10)                 |  0.219 |          0.112 |          0.341 |  -0.293 | +0.84 (-0.11…1.52) | 225827   | False    |
| równe wagi uniwersum                              |  0.128 |          0.119 |          0.138 |  -0.268 | +0.00 (0.00…0.00)  |  66685.2 | False    |
| SPY                                               |  0.141 |          0.112 |          0.172 |  -0.239 | +0.08 (-0.12…0.25) |  79896.3 | False    |

## Najniższy PEG (wzrost 1 rok) na koniec sierpnia 2026 (przykład, top 20)

| seria     |    PE |   wzrost_1r |   PEG |
|:----------|------:|------------:|------:|
| CINF.US~0 |  8.08 |        0.88 |  0.09 |
| T.US~0    |  8.79 |        0.77 |  0.11 |
| CF.US~0   |  9.75 |        0.81 |  0.12 |
| SMCI.US~0 | 11.44 |        0.94 |  0.12 |
| TRV.US~0  |  9.88 |        0.67 |  0.15 |
| EIX.US~0  |  6.04 |        0.37 |  0.16 |
| BMY.US~0  | 14.88 |        0.92 |  0.16 |
| INCY.US~0 | 15.7  |        0.83 |  0.19 |
| HIG.US~0  |  8.95 |        0.42 |  0.21 |
| BALL.US~0 | 18.04 |        0.84 |  0.21 |
| HST.US~0  | 15.13 |        0.69 |  0.22 |
| ACGL.US~0 |  7.68 |        0.34 |  0.23 |
| AMZN.US~0 | 20.9  |        0.89 |  0.23 |
| UHS.US~0  |  6.96 |        0.3  |  0.23 |
| AMCR.US~0 | 16.47 |        0.68 |  0.24 |
| IBM.US~0  | 21.02 |        0.87 |  0.24 |
| ROP.US~0  | 17.63 |        0.71 |  0.25 |
| AIZ.US~0  | 13.59 |        0.54 |  0.25 |
| ES.US~0   | 18.58 |        0.73 |  0.25 |
| PPG.US~0  | 16.32 |        0.61 |  0.27 |
