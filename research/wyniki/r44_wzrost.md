# Etap 26: jak szacować wzrost EPS i ile akcja rośnie w rok

## (a) Trafność prognoz wzrostu EPS TTM na następne 4 kwartały (spółki S&P z danymi SEC, 2012-2025)

IC = średnia korelacja rang prognozy z faktyczną zmianą (0 = brak związku, 1 = idealnie). trwalosc_nachylenie = o ile rośnie mediana faktycznego wzrostu przy +1 pp prognozy (1 = prognoza "przenosi się" w całości, 0 = nic). Odrzucone przypadki z |zmianą| > 1000 %.

| metoda                         | proba                       |     n |   IC_sr |    IC_t |   mediana_bledu_pp |   blad_do_10pp |   trwalosc_nachylenie |   prognoza_mediana |   faktycznie_mediana |
|:-------------------------------|:----------------------------|------:|--------:|--------:|-------------------:|---------------:|----------------------:|-------------------:|---------------------:|
| E7 ostatnia zmiana r/r         | własna próba                | 24592 |  -0.177 | -10.762 |             40.11  |          0.177 |                -0.149 |              0.127 |                0.102 |
| E7 ostatnia zmiana r/r         | wspólna próba (E1 dostępne) | 19808 |  -0.187 | -10.304 |             37.738 |          0.185 |                -0.151 |              0.121 |                0.103 |
| E8 zero (brak wzrostu)         | własna próba                | 26670 | nan     | nan     |             28.136 |          0.205 |                 0     |              0     |                0.101 |
| E8 zero (brak wzrostu)         | wspólna próba (E1 dostępne) | 19808 | nan     | nan     |             25.183 |          0.224 |                 0     |              0     |                0.103 |
| E10 CAGR przychodów 3 lata     | własna próba                | 22091 |   0.029 |   2.077 |             28.227 |          0.232 |                 0.014 |              0.061 |                0.099 |
| E10 CAGR przychodów 3 lata     | wspólna próba (E1 dostępne) | 18504 |   0.042 |   2.808 |             24.779 |          0.255 |                 0.04  |              0.062 |                0.103 |
| E1 średnia r/r 3 lata (arkusz) | własna próba                | 19808 |  -0.159 | -10.719 |             33.483 |          0.202 |                -0.079 |              0.18  |                0.103 |
| E1 średnia r/r 3 lata (arkusz) | wspólna próba (E1 dostępne) | 19808 |  -0.159 | -10.719 |             33.483 |          0.202 |                -0.079 |              0.18  |                0.103 |
| E3 CAGR 3 lata                 | własna próba                | 19808 |  -0.19  | -11.558 |             29.949 |          0.219 |                -0.261 |              0.127 |                0.103 |
| E3 CAGR 3 lata                 | wspólna próba (E1 dostępne) | 19808 |  -0.19  | -11.558 |             29.949 |          0.219 |                -0.261 |              0.127 |                0.103 |
| E9 CAGR 3 lata obcięty 0-30 %  | własna próba                | 19808 |  -0.186 | -11.257 |             26.788 |          0.238 |                -0.594 |              0.127 |                0.103 |
| E9 CAGR 3 lata obcięty 0-30 %  | wspólna próba (E1 dostępne) | 19808 |  -0.186 | -11.257 |             26.788 |          0.238 |                -0.594 |              0.127 |                0.103 |
| E2 średnia r/r 5 lat           | własna próba                | 14904 |  -0.141 | -10.032 |             33.286 |          0.198 |                -0.052 |              0.201 |                0.102 |
| E2 średnia r/r 5 lat           | wspólna próba (E1 dostępne) | 14904 |  -0.141 | -10.032 |             33.286 |          0.198 |                -0.052 |              0.201 |                0.102 |
| E4 CAGR 5 lat                  | własna próba                | 14904 |  -0.185 |  -9.977 |             27.698 |          0.228 |                -0.388 |              0.126 |                0.102 |
| E4 CAGR 5 lat                  | wspólna próba (E1 dostępne) | 14904 |  -0.185 |  -9.977 |             27.698 |          0.228 |                -0.388 |              0.126 |                0.102 |
| E5 mediana r/r 5 lat           | własna próba                | 14904 |  -0.096 |  -6.177 |             28.473 |          0.224 |                -0.209 |              0.129 |                0.102 |
| E5 mediana r/r 5 lat           | wspólna próba (E1 dostępne) | 14904 |  -0.096 |  -6.177 |             28.473 |          0.224 |                -0.209 |              0.129 |                0.102 |
| E6 regresja log, 5 lat         | własna próba                | 15480 |  -0.107 |  -6.882 |             26.702 |          0.226 |                -0.235 |              0.127 |                0.1   |
| E6 regresja log, 5 lat         | wspólna próba (E1 dostępne) | 15454 |  -0.107 |  -6.89  |             26.747 |          0.226 |                -0.235 |              0.127 |                0.1   |

## (b) Roczna zmiana ceny członków S&P 500 (1998-2025)

Obserwacji (spółka x miesiąc): 148926. > +50 %: 10.2 %, > +100 %: 2.1 %, < -30 %: 9.1 %, < -50 %: 3.1 %.

| percentyl      |   zmiana_12m |
|:---------------|-------------:|
| 5 %            |       -0.412 |
| 25 %           |       -0.091 |
| 50 % (mediana) |        0.095 |
| 75 %           |        0.285 |
| 95 %           |        0.693 |

## Zmiana ceny w roku a FAKTYCZNY wzrost EPS w tym roku (wiedza o przyszłości, 2012-2025)

| kwintyl_wzrostu_eps   |   wzrost_eps_mediana |   cena_mediana |   cena_p10 |   cena_p90 |
|:----------------------|---------------------:|---------------:|-----------:|-----------:|
| 1 (najgorszy)         |               -0.625 |          0.018 |     -0.364 |      0.437 |
| 2                     |               -0.088 |          0.083 |     -0.221 |      0.434 |
| 3                     |                0.103 |          0.136 |     -0.153 |      0.449 |
| 4                     |                0.285 |          0.189 |     -0.116 |      0.569 |
| 5 (najlepszy)         |                0.936 |          0.195 |     -0.152 |      0.722 |
