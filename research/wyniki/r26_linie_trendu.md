# Etap 16: linie trendu (Tori Trades) na wykresach miesięcznych

Definicje i kryterium w protokole (etap 16). nadwyżka = zwrot transakcji minus zwrot SPY w tym samym okresie; przedział 98,75 % (Bonferroni na 4 warianty) z bootstrapu po miesiącach wejścia.

| uniwersum                              | retest   | wyjscie   |   transakcji |   trafione |   sr_zwrot |   mediana |   sr_R |   mediana_mies |   sr_nadwyzka_vs_SPY | ci98_75       |   stop |   cel |
|:---------------------------------------|:---------|:----------|-------------:|-----------:|-----------:|----------:|-------:|---------------:|---------------------:|:--------------|-------:|------:|
| U2 wszyscy S&P 500 (1998-2026)         | True     | A cel     |          732 |      0.586 |      0.071 |     0.053 |  0.294 |              4 |               -0.005 | -2.6…1.3 %    |  0.389 | 0.548 |
| U2 wszyscy S&P 500 (1998-2026)         | True     | B stop    |          732 |      0.448 |      0.22  |    -0.014 |  1.084 |             13 |                0.012 | -3.2…6.3 %    |  0.705 | 0     |
| U2 wszyscy S&P 500 (1998-2026)         | False    | A cel     |          999 |      0.619 |      0.073 |     0.088 |  0.283 |              5 |               -0.004 | -2.2…1.3 %    |  0.379 | 0.557 |
| U2 wszyscy S&P 500 (1998-2026)         | False    | B stop    |          999 |      0.472 |      0.259 |    -0.023 |  1.198 |             14 |                0.041 | -0.9…9.3 %    |  0.682 | 0     |
| U1 top 10 po kapitalizacji (2010-2026) | True     | A cel     |            7 |      0.857 |      0.072 |     0.073 |  0.535 |              3 |                0.032 | -3.3…7.9 %    |  0.143 | 0.857 |
| U1 top 10 po kapitalizacji (2010-2026) | True     | B stop    |            7 |      0.714 |      0.842 |     0.189 |  5.195 |             38 |                0.318 | -45.1…113.0 % |  0.714 | 0     |
| U1 top 10 po kapitalizacji (2010-2026) | False    | A cel     |           10 |      0.7   |      0.06  |     0.103 |  0.358 |              3 |                0.019 | -4.5…7.0 %    |  0.3   | 0.7   |
| U1 top 10 po kapitalizacji (2010-2026) | False    | B stop    |           10 |      0.6   |      0.69  |     0.177 |  4.927 |             31 |                0.208 | -41.5…79.3 %  |  0.7   | 0     |

## Transakcje w top 10 (z retestem, wyjście: sam stop)

| seria      | przebicie   | wejscie   | wyjscie   |   zwrot |   nadwyzka | powod       |   wys_trojkata |
|:-----------|:------------|:----------|:----------|--------:|-----------:|:------------|---------------:|
| WMT.US~0   | 2011-10     | 2011-11   | 2015-10   |   0.097 |     -0.709 | stop        |          0.114 |
| T.US~0     | 2012-02     | 2012-03   | 2014-01   |   0.189 |     -0.124 | stop        |          0.097 |
| GE.US~0    | 2015-04     | 2015-05   | 2015-08   |  -0.104 |     -0.045 | stop        |          0.098 |
| GOOGL.US~0 | 2015-07     | 2015-08   | 2018-10   |   0.622 |      0.162 | stop        |          0.094 |
| AAPL.US~0  | 2016-08     | 2016-09   | 2021-09   |   4.328 |      3.155 | czas/koniec |          0.145 |
| BRK-B.US~0 | 2016-08     | 2016-09   | 2021-09   |   0.885 |     -0.287 | czas/koniec |          0.144 |
| GOOGL.US~0 | 2019-11     | 2019-12   | 2020-03   |  -0.122 |      0.073 | stop        |          0.124 |
