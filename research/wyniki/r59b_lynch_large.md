# Etap 38 i 38b: PEG Lyncha < 2, ROE > 15 %, dług < 1, przychody 5 lat > +50 %, 10 spółek co rok; bez i z filtrem kapitalizacji > 10 mld USD (2015-03 ... 2026-09)

## Odniesienia

| odniesienie                |   CAGR |   CAGR_2015_20 |   CAGR_2021_26 |
|:---------------------------|-------:|---------------:|---------------:|
| równe wagi uniwersum       |  0.114 |          0.115 |          0.112 |
| równe wagi spółek > 10 mld |  0.123 |          0.121 |          0.125 |
| SPY                        |  0.139 |          0.131 |          0.147 |

## Warianty

| kap_gt_10mld   | wariant                                                                         | kandydatow_w_marcu   |   CAGR |   CAGR_2015_20 |   CAGR_2021_26 |   maxDD |   sr_zainwestowane |   z_10k | roznica_vs_rowne   | lepszy   |
|:---------------|:--------------------------------------------------------------------------------|:---------------------|-------:|---------------:|---------------:|--------:|-------------------:|--------:|:-------------------|:---------|
| False          | kontrola: bez filtra PEG, ranking po przychodach 5 l.                           | 13-78                |  0.161 |          0.106 |          0.219 |  -0.383 |              0.994 |   55714 | +0.46 (-0.28…1.44) | False    |
| False          | A estymata użytkownika (przychody ważone): PEG < 2, ranking po przychodach 5 l. | 3-46                 |  0.09  |          0.104 |          0.077 |  -0.27  |              0.914 |   27048 | -0.18 (-0.54…0.37) | False    |
| False          | A estymata użytkownika (przychody ważone): PEG < 2, ranking po najniższym PEG   | 3-46                 |  0.128 |          0.089 |          0.168 |  -0.286 |              0.911 |   39853 | +0.14 (-0.24…0.50) | False    |
| False          | B przeszły CAGR EPS 5 lat: PEG < 2, ranking po przychodach 5 l.                 | 10-50                |  0.131 |          0.145 |          0.117 |  -0.289 |              0.985 |   41016 | +0.21 (-0.49…0.99) | False    |
| False          | B przeszły CAGR EPS 5 lat: PEG < 2, ranking po najniższym PEG                   | 10-50                |  0.134 |          0.089 |          0.182 |  -0.268 |              0.991 |   42535 | +0.23 (-0.37…0.85) | False    |
| False          | C jak analityk (nierealne): PEG < 2, ranking po przychodach 5 l.                | 0-29                 |  0.157 |          0.157 |          0.157 |  -0.312 |              0.946 |   53628 | +0.38 (-0.11…1.08) | False    |
| False          | C jak analityk (nierealne): PEG < 2, ranking po najniższym PEG                  | 0-29                 |  0.201 |          0.187 |          0.214 |  -0.305 |              0.949 |   81787 | +0.70 (0.27…1.29)  | True     |
| True           | kontrola: bez filtra PEG, ranking po przychodach 5 l.                           | 11-64                |  0.209 |          0.155 |          0.266 |  -0.406 |              0.988 |   89023 | +0.81 (-0.03…1.75) | False    |
| True           | A estymata użytkownika (przychody ważone): PEG < 2, ranking po przychodach 5 l. | 2-34                 |  0.152 |          0.101 |          0.205 |  -0.304 |              0.867 |   50960 | +0.30 (-0.31…0.78) | False    |
| True           | A estymata użytkownika (przychody ważone): PEG < 2, ranking po najniższym PEG   | 2-34                 |  0.168 |          0.101 |          0.239 |  -0.276 |              0.863 |   59590 | +0.42 (-0.21…0.94) | False    |
| True           | B przeszły CAGR EPS 5 lat: PEG < 2, ranking po przychodach 5 l.                 | 8-39                 |  0.168 |          0.14  |          0.198 |  -0.354 |              0.959 |   59919 | +0.47 (-0.30…1.33) | False    |
| True           | B przeszły CAGR EPS 5 lat: PEG < 2, ranking po najniższym PEG                   | 8-39                 |  0.133 |          0.102 |          0.164 |  -0.261 |              0.976 |   41863 | +0.20 (-0.35…0.82) | False    |
| True           | C jak analityk (nierealne): PEG < 2, ranking po przychodach 5 l.                | 0-23                 |  0.162 |          0.145 |          0.18  |  -0.282 |              0.916 |   56422 | +0.41 (-0.10…1.10) | False    |
| True           | C jak analityk (nierealne): PEG < 2, ranking po najniższym PEG                  | 0-23                 |  0.181 |          0.183 |          0.18  |  -0.31  |              0.92  |   68006 | +0.54 (0.08…1.12)  | True     |

## Lista (> 10 mld, estymata użytkownika, ranking po przychodach) na koniec marca 2026

| seria     |   kap_mld |   przychody_5l_% |   ROE_% |   dlug_kapital |   P/E |   g_estymata_% |   PEG_Lynch |
|:----------|----------:|-----------------:|--------:|---------------:|------:|---------------:|------------:|
| NVDA.US~2 |   4237.92 |          1194.98 |   76.33 |           0.05 | 35.6  |          66.07 |        0.54 |
| RCL.US~0  |     74.44 |           711.98 |   42.52 |           0    | 17.81 |           9.67 |        1.84 |
| UBER.US~0 |    148.04 |           366.98 |   37.18 |           0.39 | 15.21 |          19.19 |        0.79 |
| ANET.US~0 |    154.28 |           288.59 |   28.39 |           0    | 44.65 |          28.63 |        1.56 |
| LVS.US~0  |     36.2  |           260.38 |  102.33 |           0    | 23.3  |          20.33 |        1.15 |
| TTD.US~0  |     11.2  |           246.43 |   17.84 |           0    | 25.21 |          17.32 |        1.46 |
| LLY.US~0  |    867.67 |           165.61 |   77.78 |           0    | 40.23 |          45.23 |        0.89 |
| INTU.US~0 |    119.57 |           160.74 |   22.78 |           0.32 | 28.24 |          18.02 |        1.57 |
| MU.US~0   |    380.99 |           147.28 |   33.28 |           0.12 | 15.96 |         108.37 |        0.15 |
| DXCM.US~0 |     24.17 |           141.97 |   30.46 |           0    | 30.05 |          16.03 |        1.87 |
| META.US~0 |   1472.66 |           133.78 |   27.83 |           0.27 | 24.4  |          23.32 |        1.05 |
| ACGL.US~0 |     34.15 |           133.76 |   18.17 |           0    |  8.28 |          12.36 |        0.67 |
| PGR.US~0  |    116.15 |           105.52 |   37.29 |           0    | 10.79 |          15.23 |        0.71 |
| SCHW.US~0 |    164.67 |           104.61 |   17.91 |           0.04 | 20.31 |          22.29 |        0.91 |
| MSFT.US~0 |   2748.75 |            99.27 |   30.51 |           0.1  | 23.26 |          17.16 |        1.36 |
