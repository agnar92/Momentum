# Etap 13: warianty CEM10 łapiące wcześniej / oddające mniej (S&P 500 point-in-time, 1998-2026)

Lista wariantów i kryteria zapisane w protokole przed uruchomieniem. faza_wejscia_med = mediana części ruchu zygzaka (log) już za nami przy wejściu; zlapane_duze = odsetek wzrostów >= +100 % członków S&P 500 (dołek 1998-2025) choć częściowo trzymanych; czesc_gdy_zlapany = średnia część takiego ruchu (log) objęta trzymaniem.

| wariant                            |   CAGR |   CAGR_98_12 |   CAGR_13_26 |   maxDD |   transakcji |   trafione |   mediana_transakcji |   faza_wejscia_med |   zlapane_duze |   czesc_gdy_zlapany |   roznica_vs_M0_mies | ci95          | lepszy   |
|:-----------------------------------|-------:|-------------:|-------------:|--------:|-------------:|-----------:|---------------------:|-------------------:|---------------:|--------------------:|---------------------:|:--------------|:---------|
| M0 baza CEM10                      | 0.1866 |       0.1278 |       0.2534 | -0.3873 |          272 |     0.5294 |               0.0128 |             0.7492 |         0.0805 |              0.3158 |               0      | 0.00…0.00 %   | False    |
| M1 6M > 15 %                       | 0.1846 |       0.1278 |       0.2491 | -0.3873 |          273 |     0.5238 |               0.0095 |             0.7492 |         0.081  |              0.3149 |              -0.0001 | -0.04…0.00 %  | False    |
| M2 3M > 15 %, ranking 3M           | 0.1999 |       0.1547 |       0.2508 | -0.3013 |          287 |     0.5366 |               0.0172 |             0.7472 |         0.0819 |              0.3146 |               0.0008 | -0.27…0.36 %  | False    |
| M3 6M 15-60 %                      | 0.1384 |       0.1335 |       0.1438 | -0.2953 |          282 |     0.5248 |               0.0131 |             0.7118 |         0.0723 |              0.3114 |              -0.0044 | -0.80…0.16 %  | False    |
| M4 początek trendu                 | 0.1201 |       0.1323 |       0.107  | -0.3105 |          325 |     0.4308 |              -0.0286 |             0.5145 |         0.0538 |              0.3955 |              -0.0059 | -1.04…-0.03 % | False    |
| M5 baza, trailing -20 %            | 0.1768 |       0.1502 |       0.2062 | -0.4671 |          219 |     0.5388 |               0.0445 |             0.7261 |         0.0699 |              0.3573 |              -0.0007 | -0.34…0.25 %  | False    |
| M6 baza, SMA 10 lub trailing -25 % | 0.2084 |       0.1546 |       0.2693 | -0.3476 |          286 |     0.535  |               0.0137 |             0.7454 |         0.0828 |              0.323  |               0.0016 | 0.05…0.28 %   | True     |
| W1 tygodniowy CEM10                | 0.1718 |       0.1401 |       0.2073 | -0.3265 |          368 |     0.4755 |              -0.0199 |             0.7627 |         0.0953 |              0.2625 |              -0.0018 | -0.48…0.19 %  | False    |
| W2 tygodniowy wczesny              | 0.1828 |       0.1301 |       0.2427 | -0.3699 |          366 |     0.4754 |              -0.0056 |             0.7762 |         0.0884 |              0.2952 |              -0.0008 | -0.47…0.26 %  | False    |

Odniesienia: SPY 1998-2026 CAGR 0.0927.
