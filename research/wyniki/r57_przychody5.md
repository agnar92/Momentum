# Etap 36: ranking po wzroście przychodów / EPS z 5 lat, dług / kapitał < 1, PEG jako moment wejścia (S&P 500 z danymi SEC, 2015-03 ... 2026-09)

## Odniesienia

| odniesienie                       |   CAGR |   CAGR_2015_20 |   CAGR_2021_26 |   maxDD |
|:----------------------------------|-------:|---------------:|---------------:|--------:|
| równe wagi uniwersum              |  0.114 |          0.115 |          0.112 |  -0.268 |
| SPY                               |  0.139 |          0.131 |          0.147 |  -0.239 |
| CEM10 (to samo uniwersum, N = 10) |  0.259 |          0.131 |          0.403 |  -0.293 |

## Warianty

sr_zainwestowane = średni udział kapitału w akcjach (reszta czeka w gotówce na wejście).

| ranking         | dlug_kapital_lt_1   | wejscie    |   N |   CAGR |   CAGR_2015_20 |   CAGR_2021_26 |   maxDD |   sr_zainwestowane |   z_10k | roznica_vs_rowne    | lepszy   |
|:----------------|:--------------------|:-----------|----:|-------:|---------------:|---------------:|--------:|-------------------:|--------:|:--------------------|:---------|
| przychody 5 lat | True                | od razu    |  10 |  0.143 |          0.175 |          0.113 |  -0.286 |              0.965 |   46683 | +0.22 (-0.42…0.65)  | False    |
| przychody 5 lat | True                | od razu    |  20 |  0.189 |          0.135 |          0.245 |  -0.334 |              0.988 |   73047 | +0.59 (-0.12…1.15)  | False    |
| przychody 5 lat | True                | PEG <= 1   |  10 |  0.095 |          0.102 |          0.087 |  -0.188 |              0.696 |   28310 | -0.18 (-0.55…0.24)  | False    |
| przychody 5 lat | True                | PEG <= 1   |  20 |  0.152 |          0.092 |          0.215 |  -0.307 |              0.763 |   50850 | +0.29 (-0.29…0.86)  | False    |
| przychody 5 lat | True                | PEG <= 1,5 |  10 |  0.107 |          0.113 |          0.101 |  -0.252 |              0.748 |   32309 | -0.06 (-0.50…0.43)  | False    |
| przychody 5 lat | True                | PEG <= 1,5 |  20 |  0.17  |          0.109 |          0.235 |  -0.31  |              0.851 |   60757 | +0.45 (-0.22…0.98)  | False    |
| przychody 5 lat | False               | od razu    |  10 |  0.082 |          0.143 |          0.024 |  -0.457 |              0.966 |   24768 | -0.21 (-0.97…0.30)  | False    |
| przychody 5 lat | False               | od razu    |  20 |  0.159 |          0.128 |          0.19  |  -0.421 |              0.999 |   54430 | +0.39 (-0.34…1.08)  | False    |
| przychody 5 lat | False               | PEG <= 1   |  10 |  0.066 |          0.055 |          0.076 |  -0.145 |              0.63  |   20783 | -0.42 (-0.86…-0.03) | False    |
| przychody 5 lat | False               | PEG <= 1   |  20 |  0.155 |          0.083 |          0.233 |  -0.292 |              0.756 |   52704 | +0.32 (-0.34…0.88)  | False    |
| przychody 5 lat | False               | PEG <= 1,5 |  10 |  0.071 |          0.068 |          0.074 |  -0.207 |              0.674 |   22028 | -0.37 (-0.78…0.04)  | False    |
| przychody 5 lat | False               | PEG <= 1,5 |  20 |  0.16  |          0.098 |          0.225 |  -0.301 |              0.825 |   54953 | +0.36 (-0.28…0.97)  | False    |
| EPS 5 lat       | True                | od razu    |  10 |  0.111 |          0.117 |          0.105 |  -0.294 |              0.997 |   33710 | +0.07 (-0.36…0.55)  | False    |
| EPS 5 lat       | True                | od razu    |  20 |  0.122 |          0.101 |          0.145 |  -0.268 |              0.996 |   37733 | +0.12 (-0.34…0.39)  | False    |
| EPS 5 lat       | True                | PEG <= 1   |  10 |  0.112 |          0.127 |          0.097 |  -0.286 |              0.978 |   33769 | +0.06 (-0.38…0.63)  | False    |
| EPS 5 lat       | True                | PEG <= 1   |  20 |  0.117 |          0.084 |          0.152 |  -0.288 |              0.99  |   35820 | +0.08 (-0.37…0.38)  | False    |
| EPS 5 lat       | True                | PEG <= 1,5 |  10 |  0.113 |          0.132 |          0.094 |  -0.286 |              0.991 |   34192 | +0.07 (-0.39…0.62)  | False    |
| EPS 5 lat       | True                | PEG <= 1,5 |  20 |  0.121 |          0.097 |          0.145 |  -0.27  |              0.997 |   37075 | +0.11 (-0.35…0.37)  | False    |
| EPS 5 lat       | False               | od razu    |  10 |  0.073 |          0.1   |          0.047 |  -0.38  |              0.995 |   22540 | -0.23 (-0.61…0.21)  | False    |
| EPS 5 lat       | False               | od razu    |  20 |  0.116 |          0.111 |          0.121 |  -0.279 |              0.995 |   35415 | +0.07 (-0.29…0.40)  | False    |
| EPS 5 lat       | False               | PEG <= 1   |  10 |  0.055 |          0.083 |          0.028 |  -0.355 |              0.987 |   18513 | -0.37 (-0.70…0.12)  | False    |
| EPS 5 lat       | False               | PEG <= 1   |  20 |  0.126 |          0.099 |          0.154 |  -0.276 |              0.992 |   39165 | +0.14 (-0.21…0.49)  | False    |
| EPS 5 lat       | False               | PEG <= 1,5 |  10 |  0.058 |          0.088 |          0.03  |  -0.377 |              0.993 |   19216 | -0.34 (-0.69…0.16)  | False    |
| EPS 5 lat       | False               | PEG <= 1,5 |  20 |  0.119 |          0.106 |          0.131 |  -0.283 |              0.998 |   36355 | +0.09 (-0.31…0.43)  | False    |

## Lista (przychody 5 lat, dług < 1) na koniec marca 2026, top 20

| seria     |   przychody_CAGR5_% |   EPS_CAGR5_% |   dlug_kapital |    P/E |    PEG |
|:----------|--------------------:|--------------:|---------------:|-------:|-------:|
| LYV.US~0  |               68.39 |        nan    |           0    | nan    | nan    |
| NVDA.US~2 |               66.9  |         95.41 |           0.05 |  35.6  |   0.37 |
| SMCI.US~0 |               53.79 |         52.66 |           0    |  16.74 |   0.32 |
| RCL.US~0  |               52.02 |        nan    |           0    |  17.81 | nan    |
| NCLH.US~0 |               50.33 |        nan    |           0    |  20.33 | nan    |
| DDOG.US~0 |               41.53 |        nan    |           0    | 380.81 | nan    |
| COIN.US~0 |               41.24 |         26.02 |           0.52 |  39.24 |   1.51 |
| CRWD.US~0 |               40.64 |        nan    |           0.17 | nan    | nan    |
| FANG.US~0 |               39.81 |        nan    |           0.37 |  35.71 | nan    |
| DASH.US~0 |               36.58 |        nan    |           0    |  70.49 | nan    |
| UBER.US~0 |               36.1  |        nan    |           0.39 |  15.21 | nan    |
| PLTR.US~0 |               32.58 |        nan    |           0    | 232.19 | nan    |
| AXON.US~2 |               32.48 |        nan    |           0.56 | 281.25 | nan    |
| ANET.US~0 |               31.19 |         40.66 |           0    |  44.65 |   1.1  |
| UAL.US~0  |               30.93 |        nan    |           0    |   9.03 | nan    |
| HST.US~0  |               30.43 |        nan    |           0.19 |  18.08 | nan    |
| DAL.US~0  |               29.96 |        nan    |           0.64 |   8.74 | nan    |
| ABNB.US~0 |               29.37 |        nan    |           0    | nan    | nan    |
| LVS.US~0  |               29.23 |        nan    |           0    |  23.3  | nan    |
| DVN.US~0  |               28.91 |        nan    |           0.6  |  12.25 | nan    |
