# Etap 6: model łączący cechy vs momentum 6M i rynek (prognozy krokowe 2003-01 ... 2012-12, próba ucząca, uniwersum: duze)

Uwaga: momentum tutaj to ranking 6M w całym uniwersum z miesięczną rotacją, NIE reguły CEM10 (indeksy, filtry, wyjście SMA 10).

Spółek-miesięcy w ocenie: 60,000; miesięcy: 120. Rynek = równe wagi wszystkich płynnych spółek (bez kosztów).

## IC (korelacja rang prognozy i zwrotu następnego miesiąca)

| ranking   |     IC |      t |   mies. z IC > 0 |
|:----------|-------:|-------:|-----------------:|
| s_B0      | 0.0115 | 0.7274 |           0.5083 |
| s_B1      | 0.0447 | 2.4477 |           0.5833 |
| s_M       | 0.0399 | 3.6761 |           0.6417 |

## Portfele netto (miesięczny rebalancing, równe wagi)

obrot = średni odsetek nowych spółek w portfelu na miesiąc.

| wariant                   | ranking            | portfel     |    CAGR |   zmiennosc |   Sharpe |   maxDD |    obrot |
|:--------------------------|:-------------------|:------------|--------:|------------:|---------:|--------:|---------:|
| bez kary                  | rynek (równe wagi) | wszystkie   |  0.0624 |      0.1974 |   0.4079 | -0.6012 | nan      |
| bez kary                  | s_B0               | top 10      | -0.0853 |      0.3636 |  -0.0571 | -0.8159 |   0.4908 |
| bez kary                  | s_B0               | top 50      |  0.0257 |      0.2506 |   0.2308 | -0.6491 |   0.4058 |
| bez kary                  | s_B0               | górny decyl |  0.0257 |      0.2506 |   0.2308 | -0.6491 |   0.4058 |
| bez kary                  | s_B1               | top 10      |  0.0952 |      0.1117 |   0.8727 | -0.2415 |   0.8925 |
| bez kary                  | s_B1               | top 50      |  0.0797 |      0.1158 |   0.7233 | -0.3912 |   0.6927 |
| bez kary                  | s_B1               | górny decyl |  0.0797 |      0.1158 |   0.7233 | -0.3912 |   0.6927 |
| bez kary                  | s_M                | top 10      |  0.0108 |      0.271  |   0.1895 | -0.7834 |   0.8842 |
| bez kary                  | s_M                | top 50      |  0.0637 |      0.2001 |   0.4124 | -0.6352 |   0.7653 |
| bez kary                  | s_M                | górny decyl |  0.0637 |      0.2001 |   0.4124 | -0.6352 |   0.7653 |
| kara -30 % przy wycofaniu | rynek (równe wagi) | wszystkie   |  0.0485 |      0.1973 |   0.3409 | -0.61   | nan      |
| kara -30 % przy wycofaniu | s_B0               | top 10      | -0.1241 |      0.364  |  -0.1744 | -0.869  |   0.4908 |
| kara -30 % przy wycofaniu | s_B0               | top 50      | -0.0192 |      0.2521 |   0.0537 | -0.6783 |   0.4058 |
| kara -30 % przy wycofaniu | s_B0               | górny decyl | -0.0192 |      0.2521 |   0.0537 | -0.6783 |   0.4058 |
| kara -30 % przy wycofaniu | s_B1               | top 10      | -0.0021 |      0.1292 |   0.0498 | -0.4398 |   0.8925 |
| kara -30 % przy wycofaniu | s_B1               | top 50      |  0.0298 |      0.118  |   0.3095 | -0.4534 |   0.6927 |
| kara -30 % przy wycofaniu | s_B1               | górny decyl |  0.0298 |      0.118  |   0.3095 | -0.4534 |   0.6927 |
| kara -30 % przy wycofaniu | s_M                | top 10      | -0.0048 |      0.2719 |   0.1328 | -0.7902 |   0.8842 |
| kara -30 % przy wycofaniu | s_M                | top 50      |  0.0522 |      0.2003 |   0.3575 | -0.6419 |   0.7653 |
| kara -30 % przy wycofaniu | s_M                | górny decyl |  0.0522 |      0.2003 |   0.3575 | -0.6419 |   0.7653 |

## Różnica miesięcznego zwrotu netto względem momentum 6M (95 % bootstrap blokowy)

| wariant   | portfel     | ranking       |   roznica_mies | ci95          |   roznica_rocznie | lata_lepsze   |
|:----------|:------------|:--------------|---------------:|:--------------|------------------:|:--------------|
| f1        | top 10      | s_B1          |         0.0099 | -0.03…2.70 %  |            0.1249 | 6/10          |
| f1        | top 10      | s_M           |         0.006  | -0.79…2.44 %  |            0.0745 | 5/10          |
| f1        | top 10      | s_B1 vs rynek |         0.0014 | -0.76…1.40 %  |            0.0171 | 6/10          |
| f1        | top 10      | s_M vs rynek  |        -0.0024 | -1.20…0.52 %  |           -0.0288 | 5/10          |
| f1        | top 10      | s_B0 vs rynek |        -0.0084 | -2.19…0.04 %  |           -0.0967 | 4/10          |
| f1        | top 50      | s_B1          |         0.0022 | -0.57…1.44 %  |            0.0263 | 6/10          |
| f1        | top 50      | s_M           |         0.0021 | -0.55…1.23 %  |            0.025  | 7/10          |
| f1        | top 50      | s_B1 vs rynek |         0.0003 | -0.56…0.82 %  |            0.0033 | 6/10          |
| f1        | top 50      | s_M vs rynek  |         0.0002 | -0.62…0.60 %  |            0.002  | 5/10          |
| f1        | top 50      | s_B0 vs rynek |        -0.0019 | -1.06…0.45 %  |           -0.0224 | 4/10          |
| f1        | górny decyl | s_B1          |         0.0022 | -0.49…1.43 %  |            0.0263 | 6/10          |
| f1        | górny decyl | s_M           |         0.0021 | -0.57…1.25 %  |            0.025  | 7/10          |
| f1        | górny decyl | s_B1 vs rynek |         0.0003 | -0.59…0.84 %  |            0.0033 | 6/10          |
| f1        | górny decyl | s_M vs rynek  |         0.0002 | -0.67…0.59 %  |            0.002  | 5/10          |
| f1        | górny decyl | s_B0 vs rynek |        -0.0019 | -1.06…0.48 %  |           -0.0224 | 4/10          |
| f1_kara   | top 10      | s_B1          |         0.0058 | -0.56…2.34 %  |            0.0722 | 5/10          |
| f1_kara   | top 10      | s_M           |         0.0083 | -0.42…2.56 %  |            0.1043 | 5/10          |
| f1_kara   | top 10      | s_B1 vs rynek |        -0.0051 | -1.20…0.50 %  |           -0.0591 | 3/10          |
| f1_kara   | top 10      | s_M vs rynek  |        -0.0026 | -1.22…0.55 %  |           -0.0307 | 5/10          |
| f1_kara   | top 10      | s_B0 vs rynek |        -0.0109 | -2.39…-0.15 % |           -0.1232 | 4/10          |
| f1_kara   | top 50      | s_B1          |         0.0019 | -0.53…1.42 %  |            0.0232 | 6/10          |
| f1_kara   | top 50      | s_M           |         0.0048 | -0.23…1.48 %  |            0.0596 | 7/10          |
| f1_kara   | top 50      | s_B1 vs rynek |        -0.0026 | -0.85…0.48 %  |           -0.0303 | 5/10          |
| f1_kara   | top 50      | s_M vs rynek  |         0.0004 | -0.65…0.57 %  |            0.0044 | 5/10          |
| f1_kara   | top 50      | s_B0 vs rynek |        -0.0045 | -1.32…0.21 %  |           -0.0524 | 4/10          |
| f1_kara   | górny decyl | s_B1          |         0.0019 | -0.53…1.44 %  |            0.0232 | 6/10          |
| f1_kara   | górny decyl | s_M           |         0.0048 | -0.26…1.51 %  |            0.0596 | 7/10          |
| f1_kara   | górny decyl | s_B1 vs rynek |        -0.0026 | -0.83…0.50 %  |           -0.0303 | 5/10          |
| f1_kara   | górny decyl | s_M vs rynek  |         0.0004 | -0.65…0.60 %  |            0.0044 | 5/10          |
| f1_kara   | górny decyl | s_B0 vs rynek |        -0.0045 | -1.32…0.23 %  |           -0.0524 | 4/10          |

## Zwroty roczne netto (top 50, bez kary)

|   rok |   s_B0 top 50 |   s_B1 top 50 |   s_M top 50 |   rynek |
|------:|--------------:|--------------:|-------------:|--------:|
|  2003 |         0.796 |         0.231 |        0.453 |   0.526 |
|  2004 |        -0.14  |         0.058 |        0.097 |   0.019 |
|  2005 |         0.319 |         0.134 |        0.217 |   0.167 |
|  2006 |        -0.082 |         0.147 |       -0.023 |   0.076 |
|  2007 |         0.17  |        -0.001 |       -0.126 |  -0.061 |
|  2008 |        -0.529 |        -0.248 |       -0.508 |  -0.484 |
|  2009 |         0.213 |         0.103 |        0.238 |   0.473 |
|  2010 |         0.108 |         0.168 |        0.383 |   0.266 |
|  2011 |        -0.194 |         0.105 |        0.067 |  -0.058 |
|  2012 |         0.153 |         0.189 |        0.245 |   0.101 |

## Ważność cech w LightGBM (średnie |SHAP|, w jednostkach rangi zwrotu)

| cecha      |    SHAP |
|:-----------|--------:|
| rv12       | 0.0099  |
| seria_wzr  | 0.00851 |
| od_ath     | 0.0083  |
| rv1        | 0.00812 |
| od_max12   | 0.00779 |
| r12_1      | 0.00678 |
| r36_12     | 0.00592 |
| sez_wlasna | 0.00556 |
| od_min12   | 0.00529 |
| max_d      | 0.00498 |
| r6         | 0.00479 |
| log_dv     | 0.00464 |
| vol_zm     | 0.00451 |
| zakres3    | 0.00445 |
| r12        | 0.00403 |
| r1m        | 0.00392 |
| r3         | 0.0039  |
| up_d       | 0.00344 |
| zawezenie  | 0.00265 |
