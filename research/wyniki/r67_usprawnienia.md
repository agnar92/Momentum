# Etap 46: przegląd czynnikowy usprawnień screenera (wybór 2015-2020, sprawdzian 2021-2026)

SPY: 2015-2020 13.1 %, 2021-2026 15.2 % rocznie. Wariantów: 96. Korelacja rang między okresami: Calmar 0.03, CAGR -0.04.

## Średni efekt czynników (różnica średnich po wariantach)

| czynnik                         |   CAGR_wybor |   maxDD_wybor |   Calmar_wybor |   CAGR_sprawdzian |   maxDD_sprawdzian |   Calmar_sprawdzian |
|:--------------------------------|-------------:|--------------:|---------------:|------------------:|-------------------:|--------------------:|
| ranking: przychody zamiast PEG  |       -0.006 |         0.004 |         -0.014 |             0.045 |             -0.004 |               0.142 |
| trend_SMA10: True zamiast False |        0.001 |         0.017 |          0.054 |             0.007 |             -0.044 |              -0.054 |
| kap_10mld: True zamiast False   |        0.004 |         0.002 |          0.033 |             0.06  |              0.012 |               0.198 |
| filtr_rynku: True zamiast False |       -0.004 |         0.002 |         -0.019 |            -0.002 |             -0.001 |              -0.008 |
| N: 5 zamiast 10                 |        0.001 |        -0.082 |         -0.238 |            -0.006 |             -0.02  |              -0.047 |
| prog_PEG: 2.0 zamiast 1.0       |        0.032 |        -0.035 |          0.058 |             0.003 |              0.016 |               0.042 |

## 5 najlepszych wg Calmar w okresie wyboru i ich wynik w sprawdzianie

| ranking   |   prog_PEG | trend_SMA10   | kap_10mld   | filtr_rynku   |   N |   CAGR_wybor |   maxDD_wybor |   Calmar_wybor |   Sharpe_wybor |   CAGR_sprawdzian |   maxDD_sprawdzian |   Calmar_sprawdzian |   Sharpe_sprawdzian |
|:----------|-----------:|:--------------|:------------|:--------------|----:|-------------:|--------------:|---------------:|---------------:|------------------:|-------------------:|--------------------:|--------------------:|
| PEG       |          2 | True          | True        | False         |  10 |        0.17  |        -0.174 |          0.98  |          1.028 |             0.205 |             -0.34  |               0.604 |               1.036 |
| PEG       |          2 | True          | True        | True          |  10 |        0.164 |        -0.174 |          0.947 |          1.028 |             0.197 |             -0.34  |               0.582 |               1.013 |
| przychody |          2 | True          | True        | True          |  10 |        0.155 |        -0.174 |          0.895 |          0.985 |             0.229 |             -0.305 |               0.751 |               1.082 |
| przychody |          2 | True          | True        | False         |  10 |        0.155 |        -0.174 |          0.895 |          0.985 |             0.229 |             -0.305 |               0.751 |               1.082 |
| przychody |          2 | False         | False       | True          |  10 |        0.164 |        -0.194 |          0.848 |          0.997 |             0.207 |             -0.288 |               0.718 |               0.988 |

## 10 najlepszych w sprawdzianie (po fakcie, tylko informacyjnie)

| ranking   |   prog_PEG | trend_SMA10   | kap_10mld   | filtr_rynku   |   N |   CAGR_wybor |   maxDD_wybor |   Calmar_wybor |   Sharpe_wybor |   CAGR_sprawdzian |   maxDD_sprawdzian |   Calmar_sprawdzian |   Sharpe_sprawdzian |
|:----------|-----------:|:--------------|:------------|:--------------|----:|-------------:|--------------:|---------------:|---------------:|------------------:|-------------------:|--------------------:|--------------------:|
| przychody |        2   | False         | False       | True          |   5 |        0.126 |        -0.265 |          0.474 |          0.758 |             0.239 |             -0.255 |               0.935 |               1.102 |
| przychody |        2   | False         | False       | False         |   5 |        0.102 |        -0.265 |          0.386 |          0.611 |             0.239 |             -0.255 |               0.935 |               1.102 |
| przychody |        1   | False         | True        | True          |   5 |        0.122 |        -0.236 |          0.517 |          0.701 |             0.264 |             -0.312 |               0.848 |               1.098 |
| przychody |        1   | False         | True        | False         |   5 |        0.138 |        -0.236 |          0.582 |          0.755 |             0.264 |             -0.312 |               0.848 |               1.098 |
| przychody |        2   | True          | True        | True          |   5 |        0.124 |        -0.235 |          0.529 |          0.742 |             0.255 |             -0.303 |               0.844 |               1.179 |
| przychody |        2   | True          | True        | False         |   5 |        0.122 |        -0.235 |          0.519 |          0.696 |             0.255 |             -0.303 |               0.844 |               1.179 |
| przychody |        2   | False         | True        | False         |   5 |        0.131 |        -0.298 |          0.44  |          0.662 |             0.253 |             -0.301 |               0.843 |               1.14  |
| przychody |        2   | False         | True        | True          |   5 |        0.132 |        -0.279 |          0.474 |          0.734 |             0.253 |             -0.301 |               0.84  |               1.136 |
| PEG       |        1   | True          | True        | False         |  10 |        0.098 |        -0.129 |          0.763 |          0.749 |             0.232 |             -0.277 |               0.837 |               1.067 |
| przychody |        1.5 | False         | True        | False         |   5 |        0.129 |        -0.265 |          0.488 |          0.717 |             0.259 |             -0.312 |               0.83  |               1.161 |
