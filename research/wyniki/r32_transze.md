# CEM10 z zakupami w transzach (S&P 500 1998-2026, NDX 2008-2026)

| indeks   | wariant                                   |   CAGR |   maxDD |   Sharpe |   sr_zainwestowane |   CAGR_do_2012 |   CAGR_od_2013 |            z_10k |
|:---------|:------------------------------------------|-------:|--------:|---------:|-------------------:|---------------:|---------------:|-----------------:|
| S&P 500  | zwykły CEM10 (100 % od razu)              |  0.19  |  -0.387 |    0.826 |              0.828 |          0.134 |          0.253 |      1.45664e+06 |
| S&P 500  | transze: 20 % + 10 x 8 % (góra i dół 7 %) |  0.148 |  -0.427 |    0.748 |              0.673 |          0.072 |          0.237 | 526748           |
| S&P 500  | transze: 40 % + 10 x 6 % (góra i dół 7 %) |  0.159 |  -0.428 |    0.772 |              0.714 |          0.087 |          0.242 | 681755           |
| S&P 500  | transze 20 %: tylko przy wzroście +7 %    |  0.103 |  -0.333 |    0.68  |              0.491 |          0.056 |          0.156 | 165929           |
| S&P 500  | transze 20 %: tylko przy spadku -7 %      |  0.066 |  -0.201 |    0.727 |              0.289 |          0.036 |          0.101 |  63089.8         |
| NDX      | zwykły CEM10 (100 % od razu)              |  0.236 |  -0.309 |    0.986 |              0.834 |        nan     |          0.278 | 524852           |
| NDX      | transze: 20 % + 10 x 8 % (góra i dół 7 %) |  0.178 |  -0.258 |    0.88  |              0.654 |        nan     |          0.217 | 212059           |
| NDX      | transze: 40 % + 10 x 6 % (góra i dół 7 %) |  0.192 |  -0.266 |    0.914 |              0.7   |        nan     |          0.233 | 267385           |
| NDX      | transze 20 %: tylko przy wzroście +7 %    |  0.123 |  -0.218 |    0.803 |              0.492 |        nan     |          0.147 |  87075.3         |
| NDX      | transze 20 %: tylko przy spadku -7 %      |  0.079 |  -0.129 |    0.898 |              0.288 |        nan     |          0.095 |  41159.4         |

sr_zainwestowane = średni odsetek kapitału faktycznie w akcjach (reszta czeka w gotówce na transze).
