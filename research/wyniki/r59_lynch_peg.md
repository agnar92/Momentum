# Etap 38: PEG Lyncha (P/E / przyszły wzrost EPS) < 2, ROE > 15 %, dług < 1, przychody 5 lat > +50 %, 10 spółek co rok (S&P 500 z danymi SEC, 2015-03 ... 2026-09)

## Odniesienia

| odniesienie                       |   CAGR |   CAGR_2015_20 |   CAGR_2021_26 |   maxDD |
|:----------------------------------|-------:|---------------:|---------------:|--------:|
| równe wagi uniwersum              |  0.114 |          0.115 |          0.112 |  -0.268 |
| SPY                               |  0.139 |          0.131 |          0.147 |  -0.239 |
| CEM10 (to samo uniwersum, N = 10) |  0.259 |          0.131 |          0.403 |  -0.293 |

## Warianty

| wariant                                                                         | kandydatow_w_marcu   |   CAGR |   CAGR_2015_20 |   CAGR_2021_26 |   maxDD |   sr_zainwestowane |   z_10k | roznica_vs_rowne   | lepszy   |
|:--------------------------------------------------------------------------------|:---------------------|-------:|---------------:|---------------:|--------:|-------------------:|--------:|:-------------------|:---------|
| kontrola: bez filtra PEG, ranking po przychodach 5 l.                           | 13-78                |  0.161 |          0.106 |          0.219 |  -0.383 |              0.994 |   55714 | +0.46 (-0.28…1.44) | False    |
| A estymata użytkownika (przychody ważone): PEG < 2, ranking po przychodach 5 l. | 3-46                 |  0.09  |          0.104 |          0.077 |  -0.27  |              0.914 |   27048 | -0.18 (-0.54…0.37) | False    |
| A estymata użytkownika (przychody ważone): PEG < 2, ranking po najniższym PEG   | 3-46                 |  0.128 |          0.089 |          0.168 |  -0.286 |              0.911 |   39853 | +0.14 (-0.24…0.50) | False    |
| B przeszły CAGR EPS 5 lat: PEG < 2, ranking po przychodach 5 l.                 | 10-50                |  0.131 |          0.145 |          0.117 |  -0.289 |              0.985 |   41016 | +0.21 (-0.49…0.99) | False    |
| B przeszły CAGR EPS 5 lat: PEG < 2, ranking po najniższym PEG                   | 10-50                |  0.134 |          0.089 |          0.182 |  -0.268 |              0.991 |   42535 | +0.23 (-0.37…0.85) | False    |
| C jak analityk (nierealne): PEG < 2, ranking po przychodach 5 l.                | 0-29                 |  0.157 |          0.157 |          0.157 |  -0.312 |              0.946 |   53628 | +0.38 (-0.11…1.08) | False    |
| C jak analityk (nierealne): PEG < 2, ranking po najniższym PEG                  | 0-29                 |  0.201 |          0.187 |          0.214 |  -0.305 |              0.949 |   81787 | +0.70 (0.27…1.29)  | True     |

## Lista (estymata użytkownika, ranking po przychodach) na koniec marca 2026

| seria     |   przychody_5l_lacznie_% |   ROE_% |   dlug_kapital |   P/E |   g_estymata_% |   PEG_Lynch |
|:----------|-------------------------:|--------:|---------------:|------:|---------------:|------------:|
| NVDA.US~2 |                  1194.98 |   76.33 |           0.05 | 35.6  |          66.07 |        0.54 |
| RCL.US~0  |                   711.98 |   42.52 |           0    | 17.81 |           9.67 |        1.84 |
| UBER.US~0 |                   366.98 |   37.18 |           0.39 | 15.21 |          19.19 |        0.79 |
| ANET.US~0 |                   288.59 |   28.39 |           0    | 44.65 |          28.63 |        1.56 |
| LVS.US~0  |                   260.38 |  102.33 |           0    | 23.3  |          20.33 |        1.15 |
| TTD.US~0  |                   246.43 |   17.84 |           0    | 25.21 |          17.32 |        1.46 |
| FIX.US~0  |                   218.61 |   41.76 |           0.06 | 47.81 |          33.16 |        1.44 |
| PODD.US~0 |                   199.44 |   16.31 |           0    | 60.3  |          30.88 |        1.95 |
| LLY.US~0  |                   165.61 |   77.78 |           0    | 40.23 |          45.23 |        0.89 |
| INTU.US~0 |                   160.74 |   22.78 |           0.32 | 28.24 |          18.02 |        1.57 |
| MU.US~0   |                   147.28 |   33.28 |           0.12 | 15.96 |         108.37 |        0.15 |
| DXCM.US~0 |                   141.97 |   30.46 |           0    | 30.05 |          16.03 |        1.87 |
| META.US~0 |                   133.78 |   27.83 |           0.27 | 24.4  |          23.32 |        1.05 |
| ACGL.US~0 |                   133.76 |   18.17 |           0    |  8.28 |          12.36 |        0.67 |
| PGR.US~0  |                   105.52 |   37.29 |           0    | 10.79 |          15.23 |        0.71 |
