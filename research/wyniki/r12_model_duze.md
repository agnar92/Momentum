# Etap 6: model łączący cechy vs momentum 6M i rynek (prognozy krokowe 2003-01 ... 2012-12, próba ucząca, uniwersum: duze)

Uwaga: momentum tutaj to ranking 6M w całym uniwersum z miesięczną rotacją, NIE reguły CEM10 (indeksy, filtry, wyjście SMA 10).

Spółek-miesięcy w ocenie: 60,000; miesięcy: 120. Rynek = równe wagi wszystkich płynnych spółek (bez kosztów).

## IC (korelacja rang prognozy i zwrotu następnego miesiąca)

| ranking   |     IC |      t |   mies. z IC > 0 |
|:----------|-------:|-------:|-----------------:|
| s_B0      | 0.0114 | 0.7159 |           0.5083 |
| s_B1      | 0.0443 | 2.4217 |           0.5833 |
| s_M       | 0.0387 | 3.5828 |           0.6583 |

## Portfele netto (miesięczny rebalancing, równe wagi)

obrot = średni odsetek nowych spółek w portfelu na miesiąc.

| wariant                   | ranking            | portfel     |    CAGR |   zmiennosc |   Sharpe |   maxDD |    obrot |
|:--------------------------|:-------------------|:------------|--------:|------------:|---------:|--------:|---------:|
| bez kary                  | rynek (równe wagi) | wszystkie   |  0.0628 |      0.1973 |   0.4102 | -0.6011 | nan      |
| bez kary                  | s_B0               | top 10      | -0.0856 |      0.3648 |  -0.0569 | -0.819  |   0.4883 |
| bez kary                  | s_B0               | top 50      |  0.0256 |      0.2509 |   0.2305 | -0.6508 |   0.405  |
| bez kary                  | s_B0               | górny decyl |  0.0256 |      0.2509 |   0.2305 | -0.6508 |   0.405  |
| bez kary                  | s_B1               | top 10      |  0.0937 |      0.1123 |   0.8564 | -0.2414 |   0.89   |
| bez kary                  | s_B1               | top 50      |  0.0795 |      0.1154 |   0.7234 | -0.3819 |   0.689  |
| bez kary                  | s_B1               | górny decyl |  0.0795 |      0.1154 |   0.7234 | -0.3819 |   0.689  |
| bez kary                  | s_M                | top 10      | -0.0436 |      0.2797 |  -0.0098 | -0.8214 |   0.895  |
| bez kary                  | s_M                | top 50      |  0.0447 |      0.2029 |   0.3212 | -0.6515 |   0.7537 |
| bez kary                  | s_M                | górny decyl |  0.0447 |      0.2029 |   0.3212 | -0.6515 |   0.7537 |
| kara -30 % przy wycofaniu | rynek (równe wagi) | wszystkie   |  0.048  |      0.1971 |   0.3387 | -0.6097 | nan      |
| kara -30 % przy wycofaniu | s_B0               | top 10      | -0.1297 |      0.3658 |  -0.1894 | -0.8772 |   0.4883 |
| kara -30 % przy wycofaniu | s_B0               | top 50      | -0.0223 |      0.2522 |   0.0416 | -0.6799 |   0.405  |
| kara -30 % przy wycofaniu | s_B0               | górny decyl | -0.0223 |      0.2522 |   0.0416 | -0.6799 |   0.405  |
| kara -30 % przy wycofaniu | s_B1               | top 10      | -0.0034 |      0.1298 |   0.0397 | -0.4498 |   0.89   |
| kara -30 % przy wycofaniu | s_B1               | top 50      |  0.0296 |      0.1175 |   0.3082 | -0.4447 |   0.689  |
| kara -30 % przy wycofaniu | s_B1               | górny decyl |  0.0296 |      0.1175 |   0.3082 | -0.4447 |   0.689  |
| kara -30 % przy wycofaniu | s_M                | top 10      | -0.0609 |      0.2791 |  -0.0754 | -0.827  |   0.895  |
| kara -30 % przy wycofaniu | s_M                | top 50      |  0.03   |      0.2035 |   0.251  | -0.6582 |   0.7537 |
| kara -30 % przy wycofaniu | s_M                | górny decyl |  0.03   |      0.2035 |   0.251  | -0.6582 |   0.7537 |

## Różnica miesięcznego zwrotu netto względem momentum 6M (95 % bootstrap blokowy)

| wariant   | portfel     | ranking       |   roznica_mies | ci95          |   roznica_rocznie | lata_lepsze   |
|:----------|:------------|:--------------|---------------:|:--------------|------------------:|:--------------|
| f1        | top 10      | s_B1          |         0.0097 | -0.04…2.70 %  |            0.1234 | 6/10          |
| f1        | top 10      | s_M           |         0.0015 | -1.25…2.08 %  |            0.0181 | 4/10          |
| f1        | top 10      | s_B1 vs rynek |         0.0013 | -0.74…1.35 %  |            0.0154 | 6/10          |
| f1        | top 10      | s_M vs rynek  |        -0.007  | -1.66…0.25 %  |           -0.0805 | 3/10          |
| f1        | top 10      | s_B0 vs rynek |        -0.0085 | -2.22…0.05 %  |           -0.0971 | 4/10          |
| f1        | top 50      | s_B1          |         0.0021 | -0.56…1.45 %  |            0.0259 | 6/10          |
| f1        | top 50      | s_M           |         0.0006 | -0.62…1.01 %  |            0.0074 | 6/10          |
| f1        | top 50      | s_B1 vs rynek |         0.0002 | -0.56…0.83 %  |            0.0026 | 6/10          |
| f1        | top 50      | s_M vs rynek  |        -0.0013 | -0.65…0.40 %  |           -0.0156 | 5/10          |
| f1        | top 50      | s_B0 vs rynek |        -0.0019 | -1.07…0.46 %  |           -0.0228 | 4/10          |
| f1        | górny decyl | s_B1          |         0.0021 | -0.49…1.45 %  |            0.0259 | 6/10          |
| f1        | górny decyl | s_M           |         0.0006 | -0.61…1.02 %  |            0.0074 | 6/10          |
| f1        | górny decyl | s_B1 vs rynek |         0.0002 | -0.59…0.86 %  |            0.0026 | 6/10          |
| f1        | górny decyl | s_M vs rynek  |        -0.0013 | -0.69…0.37 %  |           -0.0156 | 5/10          |
| f1        | górny decyl | s_B0 vs rynek |        -0.0019 | -1.07…0.49 %  |           -0.0228 | 4/10          |
| f1_kara   | top 10      | s_B1          |         0.0062 | -0.47…2.42 %  |            0.077  | 4/10          |
| f1_kara   | top 10      | s_M           |         0.004  | -0.82…2.22 %  |            0.0493 | 4/10          |
| f1_kara   | top 10      | s_B1 vs rynek |        -0.0051 | -1.18…0.45 %  |           -0.0599 | 4/10          |
| f1_kara   | top 10      | s_M vs rynek  |        -0.0073 | -1.64…0.17 %  |           -0.0843 | 3/10          |
| f1_kara   | top 10      | s_B0 vs rynek |        -0.0113 | -2.45…-0.18 % |           -0.1279 | 4/10          |
| f1_kara   | top 50      | s_B1          |         0.0021 | -0.51…1.45 %  |            0.026  | 6/10          |
| f1_kara   | top 50      | s_M           |         0.0034 | -0.28…1.29 %  |            0.0413 | 7/10          |
| f1_kara   | top 50      | s_B1 vs rynek |        -0.0025 | -0.85…0.50 %  |           -0.0301 | 5/10          |
| f1_kara   | top 50      | s_M vs rynek  |        -0.0013 | -0.67…0.37 %  |           -0.0156 | 5/10          |
| f1_kara   | top 50      | s_B0 vs rynek |        -0.0047 | -1.35…0.20 %  |           -0.0548 | 4/10          |
| f1_kara   | górny decyl | s_B1          |         0.0021 | -0.50…1.48 %  |            0.026  | 6/10          |
| f1_kara   | górny decyl | s_M           |         0.0034 | -0.29…1.29 %  |            0.0413 | 7/10          |
| f1_kara   | górny decyl | s_B1 vs rynek |        -0.0025 | -0.81…0.51 %  |           -0.0301 | 5/10          |
| f1_kara   | górny decyl | s_M vs rynek  |        -0.0013 | -0.72…0.39 %  |           -0.0156 | 5/10          |
| f1_kara   | górny decyl | s_B0 vs rynek |        -0.0047 | -1.35…0.22 %  |           -0.0548 | 4/10          |

## Zwroty roczne netto (top 50, bez kary)

|   rok |   s_B0 top 50 |   s_B1 top 50 |   s_M top 50 |   rynek |
|------:|--------------:|--------------:|-------------:|--------:|
|  2003 |         0.79  |         0.227 |        0.403 |   0.528 |
|  2004 |        -0.128 |         0.058 |        0.06  |   0.021 |
|  2005 |         0.322 |         0.133 |        0.233 |   0.166 |
|  2006 |        -0.091 |         0.139 |       -0.007 |   0.076 |
|  2007 |         0.174 |         0.005 |       -0.131 |  -0.059 |
|  2008 |        -0.531 |        -0.241 |       -0.527 |  -0.483 |
|  2009 |         0.21  |         0.102 |        0.264 |   0.469 |
|  2010 |         0.108 |         0.165 |        0.328 |   0.268 |
|  2011 |        -0.193 |         0.104 |        0.062 |  -0.059 |
|  2012 |         0.153 |         0.186 |        0.162 |   0.105 |

## Ważność cech w LightGBM (średnie |SHAP|, w jednostkach rangi zwrotu)

| cecha      |    SHAP |
|:-----------|--------:|
| rv12       | 0.00977 |
| seria_wzr  | 0.00876 |
| od_ath     | 0.0085  |
| rv1        | 0.0081  |
| od_max12   | 0.00792 |
| r12_1      | 0.00704 |
| r36_12     | 0.00598 |
| sez_wlasna | 0.00555 |
| od_min12   | 0.00529 |
| r6         | 0.00499 |
| max_d      | 0.0049  |
| vol_zm     | 0.00455 |
| log_dv     | 0.00454 |
| zakres3    | 0.00438 |
| r12        | 0.00391 |
| r3         | 0.00384 |
| r1m        | 0.00379 |
| up_d       | 0.00348 |
| zawezenie  | 0.00264 |
