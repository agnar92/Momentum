# Etap 30: wzrost = ważona średnia kwartalnych zmian przychodów r/r (S&P 500 z danymi SEC, 2011-2026)

Odniesienia: równe wagi uniwersum 12,8 %, SPY 14,1 %, CEM10 21,9 %; etap 29c: CAGR EPS 8,7-12,5 %, prognoza jak analityk 18-27 %.

## Trafność

| wzrost                              |   IC_g_vs_wzrost_EPS |   t_EPS |   mediana_bledu_pp |   IC_potencjal_vs_cena_12m |   t_cena |   g_mediana |   wzrost_EPS_faktyczny_mediana |
|:------------------------------------|---------------------:|--------:|-------------------:|---------------------------:|---------:|------------:|-------------------------------:|
| ważona 0,1-0,4 (metoda użytkownika) |                0.133 |  11.765 |             25.896 |                      -0.04 |   -2.427 |        0.06 |                            0.1 |
| średnia arytmetyczna                |                0.111 |   9.152 |             26.108 |                      -0.04 |   -2.503 |        0.06 |                            0.1 |

## Portfele

| wzrost                              |   N | trzymanie       | decyzje    |   CAGR |   CAGR_2011_18 |   CAGR_2019_26 |   maxDD |   z_10k | roznica_vs_rowne   | lepszy   |
|:------------------------------------|----:|:----------------|:-----------|-------:|---------------:|---------------:|--------:|--------:|:-------------------|:---------|
| ważona 0,1-0,4 (metoda użytkownika) |  10 | dopóki tania    | co miesiąc |  0.146 |          0.054 |          0.25  |  -0.233 |   85779 | +0.22 (-0.45…0.88) | False    |
| ważona 0,1-0,4 (metoda użytkownika) |  10 | dopóki tania    | co kwartał |  0.136 |          0.034 |          0.253 |  -0.251 |   74758 | +0.15 (-0.48…0.83) | False    |
| ważona 0,1-0,4 (metoda użytkownika) |  10 | dopóki tania    | raz w roku |  0.132 |          0.027 |          0.25  |  -0.305 |   70109 | +0.15 (-0.49…0.78) | False    |
| ważona 0,1-0,4 (metoda użytkownika) |  10 | dopóki w top 2N | co miesiąc |  0.134 |          0.046 |          0.233 |  -0.213 |   72338 | +0.10 (-0.41…0.77) | False    |
| ważona 0,1-0,4 (metoda użytkownika) |  10 | dopóki w top 2N | co kwartał |  0.125 |          0.04  |          0.22  |  -0.221 |   63737 | +0.05 (-0.45…0.73) | False    |
| ważona 0,1-0,4 (metoda użytkownika) |  10 | dopóki w top 2N | raz w roku |  0.108 |          0.04  |          0.183 |  -0.313 |   50333 | -0.06 (-0.43…0.59) | False    |
| ważona 0,1-0,4 (metoda użytkownika) |  20 | dopóki tania    | co miesiąc |  0.124 |          0.054 |          0.201 |  -0.254 |   63050 | +0.02 (-0.44…0.49) | False    |
| ważona 0,1-0,4 (metoda użytkownika) |  20 | dopóki tania    | co kwartał |  0.118 |          0.04  |          0.204 |  -0.266 |   57783 | -0.02 (-0.48…0.44) | False    |
| ważona 0,1-0,4 (metoda użytkownika) |  20 | dopóki tania    | raz w roku |  0.116 |          0.036 |          0.206 |  -0.307 |   56622 | -0.01 (-0.45…0.43) | False    |
| ważona 0,1-0,4 (metoda użytkownika) |  20 | dopóki w top 2N | co miesiąc |  0.129 |          0.057 |          0.208 |  -0.258 |   67129 | +0.05 (-0.39…0.52) | False    |
| ważona 0,1-0,4 (metoda użytkownika) |  20 | dopóki w top 2N | co kwartał |  0.12  |          0.043 |          0.207 |  -0.266 |   60006 | +0.00 (-0.44…0.46) | False    |
| ważona 0,1-0,4 (metoda użytkownika) |  20 | dopóki w top 2N | raz w roku |  0.11  |          0.036 |          0.191 |  -0.307 |   51521 | -0.06 (-0.48…0.38) | False    |
| średnia arytmetyczna                |  10 | dopóki tania    | co miesiąc |  0.158 |          0.056 |          0.272 |  -0.272 |  100234 | +0.31 (-0.34…0.83) | False    |
| średnia arytmetyczna                |  10 | dopóki tania    | co kwartał |  0.149 |          0.064 |          0.245 |  -0.247 |   89577 | +0.26 (-0.27…0.73) | False    |
| średnia arytmetyczna                |  10 | dopóki tania    | raz w roku |  0.139 |          0.05  |          0.237 |  -0.299 |   77182 | +0.19 (-0.42…0.80) | False    |
| średnia arytmetyczna                |  10 | dopóki w top 2N | co miesiąc |  0.142 |          0.044 |          0.254 |  -0.245 |   81403 | +0.18 (-0.36…0.82) | False    |
| średnia arytmetyczna                |  10 | dopóki w top 2N | co kwartał |  0.118 |          0.045 |          0.2   |  -0.278 |   58294 | -0.00 (-0.41…0.66) | False    |
| średnia arytmetyczna                |  10 | dopóki w top 2N | raz w roku |  0.109 |          0.057 |          0.166 |  -0.306 |   51364 | -0.06 (-0.47…0.55) | False    |
| średnia arytmetyczna                |  20 | dopóki tania    | co miesiąc |  0.128 |          0.063 |          0.199 |  -0.27  |   66517 | +0.05 (-0.38…0.47) | False    |
| średnia arytmetyczna                |  20 | dopóki tania    | co kwartał |  0.117 |          0.049 |          0.191 |  -0.273 |   57032 | -0.02 (-0.43…0.38) | False    |
| średnia arytmetyczna                |  20 | dopóki tania    | raz w roku |  0.115 |          0.051 |          0.184 |  -0.327 |   55234 | -0.02 (-0.44…0.41) | False    |
| średnia arytmetyczna                |  20 | dopóki w top 2N | co miesiąc |  0.136 |          0.066 |          0.214 |  -0.234 |   74882 | +0.11 (-0.34…0.55) | False    |
| średnia arytmetyczna                |  20 | dopóki w top 2N | co kwartał |  0.125 |          0.051 |          0.206 |  -0.273 |   63510 | +0.04 (-0.40…0.45) | False    |
| średnia arytmetyczna                |  20 | dopóki w top 2N | raz w roku |  0.115 |          0.051 |          0.185 |  -0.327 |   55593 | -0.01 (-0.42…0.40) | False    |
