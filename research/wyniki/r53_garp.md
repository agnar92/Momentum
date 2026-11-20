# Etap 32: GARP (S&P 500 z danymi SEC, 2011-2026)

Odniesienia: równe wagi uniwersum 12,8 %, SPY 14,1 %, CEM10 21,9 %.

| wariant                    |   N | decyzje    |   kandydatow_mediana |   CAGR |   CAGR_2011_18 |   CAGR_2019_26 |   maxDD |   z_10k | roznica_vs_rowne    | lepszy   |
|:---------------------------|----:|:-----------|---------------------:|-------:|---------------:|---------------:|--------:|--------:|:--------------------|:---------|
| G1 pełny GARP              |  10 | co miesiąc |                  2   |  0.017 |         -0.012 |          0.048 |  -0.237 |   13050 | -0.90 (-1.37…-0.51) | False    |
| G1 pełny GARP              |  10 | co kwartał |                  2   |  0.006 |         -0.017 |          0.03  |  -0.268 |   10998 | -1.00 (-1.40…-0.68) | False    |
| G1 pełny GARP              |  20 | co miesiąc |                  2   |  0.017 |         -0.006 |          0.04  |  -0.125 |   12960 | -0.94 (-1.44…-0.51) | False    |
| G1 pełny GARP              |  20 | co kwartał |                  2   |  0.006 |         -0.008 |          0.02  |  -0.139 |   10944 | -1.04 (-1.50…-0.67) | False    |
| G2 bez warunku stabilności |  10 | co miesiąc |                  4.5 |  0.042 |         -0.01  |          0.097 |  -0.26  |   18978 | -0.68 (-1.14…-0.30) | False    |
| G2 bez warunku stabilności |  10 | co kwartał |                  4.5 |  0.029 |         -0.015 |          0.078 |  -0.291 |   15800 | -0.77 (-1.19…-0.47) | False    |
| G2 bez warunku stabilności |  20 | co miesiąc |                  4.5 |  0.029 |         -0.005 |          0.065 |  -0.195 |   15683 | -0.82 (-1.31…-0.42) | False    |
| G2 bez warunku stabilności |  20 | co kwartał |                  4.5 |  0.015 |         -0.007 |          0.039 |  -0.217 |   12702 | -0.94 (-1.37…-0.62) | False    |
| G3 pełny GARP + nad SMA 10 |  10 | co miesiąc |                  1   |  0.002 |         -0.004 |          0.008 |  -0.144 |   10373 | -1.07 (-1.53…-0.73) | False    |
| G3 pełny GARP + nad SMA 10 |  10 | co kwartał |                  1   |  0.013 |         -0.005 |          0.032 |  -0.135 |   12282 | -0.98 (-1.39…-0.60) | False    |
| G3 pełny GARP + nad SMA 10 |  20 | co miesiąc |                  1   |  0.001 |         -0.002 |          0.005 |  -0.074 |   10226 | -1.08 (-1.56…-0.66) | False    |
| G3 pełny GARP + nad SMA 10 |  20 | co kwartał |                  1   |  0.007 |         -0.002 |          0.016 |  -0.07  |   11126 | -1.04 (-1.53…-0.65) | False    |

## Lista G1 na koniec sierpnia 2026 (top 20 po PEG)

| seria    |   P/E |   EPS_CAGR_5l_% |   przychody_wazone_% |   lat_wzrostu_z_5 |   PEG | nad_SMA10   |
|:---------|------:|----------------:|---------------------:|------------------:|------:|:------------|
| MKC.US~0 |  9.19 |           19.06 |                12.55 |                 4 |  0.73 | False       |
| OKE.US~0 | 16.97 |           20.48 |                40.07 |                 4 |  0.83 | True        |
