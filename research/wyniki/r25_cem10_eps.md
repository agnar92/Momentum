# Etap 15: CEM10 + filtr przyspieszenia EPS (S&P 500 z danymi SEC, 2011-2026)

Warianty i kryteria zapisane w protokole przed uruchomieniem. Wszystkie E0-E3 na tym samym uniwersum (członkowie S&P 500 z danymi SEC).

| wariant                          |   CAGR |   CAGR_11_18 |   CAGR_19_26 |   maxDD |   transakcji |   trafione |   roznica_vs_E0_mies | ci95          | lepszy   |
|:---------------------------------|-------:|-------------:|-------------:|--------:|-------------:|-----------:|---------------------:|:--------------|:---------|
| E0 baza (uniwersum z danymi SEC) | 0.2219 |       0.1022 |       0.3562 | -0.2935 |          163 |     0.4479 |               0      | 0.00…0.00 %   | False    |
| E1 EPS przyspiesza (1 kw.)       | 0.1686 |       0.1612 |       0.1761 | -0.3427 |          150 |     0.4133 |              -0.0046 | -1.02…0.11 %  | False    |
| E2 EPS przyspiesza (2 kw.)       | 0.1354 |       0.0813 |       0.1928 | -0.2603 |          136 |     0.4485 |              -0.0076 | -1.37…0.05 %  | False    |
| E3 EPS r/r >= 25 %               | 0.1482 |       0.0841 |       0.2168 | -0.342  |          174 |     0.3966 |              -0.0057 | -1.18…-0.12 % | False    |
| CEM10 pełny skład (odniesienie)  | 0.2174 |       0.1041 |       0.3438 | -0.3456 |          nan |   nan      |              -0.0004 | -0.39…0.23 %  | False    |

SPY 2011-2026: CAGR 0.1402.
