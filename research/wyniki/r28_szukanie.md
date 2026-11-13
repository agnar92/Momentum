# Etap 18: szukanie strategii 50-100 % rocznie (320 prostych wariantów miesięcznych)

SPY: 1998-2012 4.3 % rocznie, 2013-2026 14.6 % rocznie.

Wariantów z CAGR >= 50 %: 1998-2012: 0, 2013-2026: 3, w obu okresach: 0.
Wariantów z CAGR >= 30 % w obu okresach: 0. Korelacja rang CAGR między okresami: 0.78.

Rozkład CAGR (kwantyle 10 / 50 / 90 / max):

|         |   1998-2012 |   2013-2026 |
|:--------|------------:|------------:|
| 10 %    |      -0.289 |      -0.453 |
| mediana |      -0.005 |       0.09  |
| 90 %    |       0.145 |       0.335 |
| max     |       0.283 |       0.633 |

## 10 najlepszych w okresie wyboru (1998-2012) i ich wynik w sprawdzianie (2013-2026)

| uniwersum   | ranking   |   N | prog_6M_30   | rotacja   | filtr_rynku   |   CAGR_98_12 |   maxDD_98_12 |   CAGR_13_26 |   maxDD_13_26 |   Sharpe_13_26 |
|:------------|:----------|----:|:-------------|:----------|:--------------|-------------:|--------------:|-------------:|--------------:|---------------:|
| S&P 500     | 1M        |   1 | False        | False     | True          |        0.283 |        -0.381 |        0.225 |        -0.599 |          0.659 |
| S&P 500     | 6M        |   2 | False        | True      | True          |        0.213 |        -0.583 |        0.347 |        -0.67  |          0.861 |
| S&P 500     | 6M        |   2 | True         | True      | True          |        0.213 |        -0.583 |        0.347 |        -0.67  |          0.861 |
| S&P 500     | 1M        |   2 | False        | False     | True          |        0.208 |        -0.356 |        0.286 |        -0.394 |          0.821 |
| S&P 500     | 6M        |   5 | False        | True      | True          |        0.205 |        -0.287 |        0.25  |        -0.525 |          0.798 |
| S&P 500     | 1M        |   3 | False        | False     | True          |        0.203 |        -0.335 |        0.297 |        -0.314 |          0.906 |
| S&P 500     | 1M        |  10 | False        | False     | True          |        0.203 |        -0.296 |        0.209 |        -0.292 |          0.905 |
| S&P 500     | 6M        |   5 | True         | True      | True          |        0.203 |        -0.287 |        0.251 |        -0.509 |          0.801 |
| S&P 500     | 1M        |   5 | False        | False     | True          |        0.2   |        -0.308 |        0.285 |        -0.264 |          1.025 |
| S&P 500     | 6M        |   5 | False        | True      | False         |        0.198 |        -0.542 |        0.282 |        -0.446 |          0.862 |

## 10 najlepszych w 2013-2026 (wybór po fakcie, tylko informacyjnie)

| uniwersum   | ranking   |   N | prog_6M_30   | rotacja   | filtr_rynku   |   CAGR_98_12 |   maxDD_98_12 |   CAGR_13_26 |   maxDD_13_26 |   Sharpe_13_26 |
|:------------|:----------|----:|:-------------|:----------|:--------------|-------------:|--------------:|-------------:|--------------:|---------------:|
| S&P 500     | 12-1      |   1 | False        | True      | False         |       -0.058 |        -0.884 |        0.633 |        -0.466 |          1.179 |
| S&P 500     | 12-1      |   1 | False        | True      | True          |        0.056 |        -0.71  |        0.541 |        -0.466 |          1.09  |
| S&P 500     | 1M        |   1 | True         | False     | True          |        0.124 |        -0.624 |        0.505 |        -0.564 |          1.189 |
| S&P 500     | 12-1      |   1 | True         | True      | False         |        0.025 |        -0.871 |        0.475 |        -0.57  |          0.995 |
| S&P 500     | 6M        |   1 | False        | False     | False         |       -0.115 |        -0.946 |        0.442 |        -0.531 |          0.96  |
| S&P 500     | 6M        |   1 | True         | False     | False         |       -0.133 |        -0.96  |        0.442 |        -0.531 |          0.96  |
| S&P 500     | 6M        |   3 | True         | False     | False         |        0.063 |        -0.631 |        0.441 |        -0.361 |          1.073 |
| S&P 500     | 6M        |   3 | False        | False     | False         |        0.075 |        -0.625 |        0.441 |        -0.361 |          1.073 |
| S&P 500     | 6M        |   2 | True         | False     | True          |        0.146 |        -0.517 |        0.414 |        -0.431 |          0.97  |
| S&P 500     | 6M        |   2 | False        | False     | True          |        0.146 |        -0.517 |        0.414 |        -0.431 |          0.97  |
