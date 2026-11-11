# Etap 6: model łączący cechy vs momentum 6M i rynek (prognozy krokowe 2003-01 ... 2012-12, próba ucząca, uniwersum: wszystkie)

Uwaga: momentum tutaj to ranking 6M w całym uniwersum z miesięczną rotacją, NIE reguły CEM10 (indeksy, filtry, wyjście SMA 10).

Spółek-miesięcy w ocenie: 379,656; miesięcy: 120. Rynek = równe wagi wszystkich płynnych spółek (bez kosztów).

## IC (korelacja rang prognozy i zwrotu następnego miesiąca)

| ranking   |     IC |      t |   mies. z IC > 0 |
|:----------|-------:|-------:|-----------------:|
| s_B0      | 0.0047 | 0.3955 |           0.5333 |
| s_B1      | 0.0343 | 2.2681 |           0.5833 |
| s_M       | 0.0481 | 4.9662 |           0.7    |

## Portfele netto (miesięczny rebalancing, równe wagi)

obrot = średni odsetek nowych spółek w portfelu na miesiąc.

| wariant                   | ranking            | portfel     |    CAGR |   zmiennosc |   Sharpe |   maxDD |    obrot |
|:--------------------------|:-------------------|:------------|--------:|------------:|---------:|--------:|---------:|
| bez kary                  | rynek (równe wagi) | wszystkie   |  0.1028 |      0.2097 |   0.5746 | -0.578  | nan      |
| bez kary                  | s_B0               | top 10      | -0.3434 |      0.4138 |  -0.7824 | -0.9929 |   0.5767 |
| bez kary                  | s_B0               | top 50      | -0.0837 |      0.2952 |  -0.1451 | -0.8176 |   0.4895 |
| bez kary                  | s_B0               | górny decyl |  0.0841 |      0.2342 |   0.4631 | -0.5956 |   0.4033 |
| bez kary                  | s_B1               | top 10      |  0.1293 |      0.1379 |   0.9516 | -0.3027 |   0.9625 |
| bez kary                  | s_B1               | top 50      |  0.0863 |      0.1077 |   0.8255 | -0.2831 |   0.8997 |
| bez kary                  | s_B1               | górny decyl |  0.0677 |      0.1214 |   0.6033 | -0.4135 |   0.6818 |
| bez kary                  | s_M                | top 10      |  0.2294 |      0.2694 |   0.9016 | -0.4121 |   0.97   |
| bez kary                  | s_M                | top 50      |  0.1447 |      0.2096 |   0.7583 | -0.5293 |   0.9303 |
| bez kary                  | s_M                | górny decyl |  0.1045 |      0.1782 |   0.6524 | -0.4817 |   0.7958 |
| kara -30 % przy wycofaniu | rynek (równe wagi) | wszystkie   |  0.0908 |      0.2098 |   0.5217 | -0.5884 | nan      |
| kara -30 % przy wycofaniu | s_B0               | top 10      | -0.3634 |      0.4116 |  -0.8615 | -0.9948 |   0.5767 |
| kara -30 % przy wycofaniu | s_B0               | top 50      | -0.1131 |      0.2949 |  -0.2544 | -0.8667 |   0.4895 |
| kara -30 % przy wycofaniu | s_B0               | górny decyl |  0.0487 |      0.2344 |   0.3211 | -0.6231 |   0.4033 |
| kara -30 % przy wycofaniu | s_B1               | top 10      | -0.0819 |      0.1732 |  -0.4066 | -0.7899 |   0.9625 |
| kara -30 % przy wycofaniu | s_B1               | top 50      | -0.0228 |      0.1169 |  -0.1376 | -0.5408 |   0.8997 |
| kara -30 % przy wycofaniu | s_B1               | górny decyl |  0.0232 |      0.122  |   0.2505 | -0.4688 |   0.6818 |
| kara -30 % przy wycofaniu | s_M                | top 10      |  0.2153 |      0.27   |   0.8568 | -0.4121 |   0.97   |
| kara -30 % przy wycofaniu | s_M                | top 50      |  0.1294 |      0.209  |   0.6948 | -0.5293 |   0.9303 |
| kara -30 % przy wycofaniu | s_M                | górny decyl |  0.0889 |      0.178  |   0.5725 | -0.4891 |   0.7958 |

## Różnica miesięcznego zwrotu netto względem momentum 6M (95 % bootstrap blokowy)

| wariant   | portfel     | ranking       |   roznica_mies | ci95          |   roznica_rocznie | lata_lepsze   |
|:----------|:------------|:--------------|---------------:|:--------------|------------------:|:--------------|
| f1        | top 10      | s_B1          |         0.0379 | 2.28…5.61 %   |            0.563  | 8/10          |
| f1        | top 10      | s_M           |         0.0472 | 2.29…7.47 %   |            0.7397 | 8/10          |
| f1        | top 10      | s_B1 vs rynek |         0.0009 | -0.61…0.82 %  |            0.0108 | 7/10          |
| f1        | top 10      | s_M vs rynek  |         0.0102 | -0.20…2.66 %  |            0.1295 | 7/10          |
| f1        | top 10      | s_B0 vs rynek |        -0.037  | -5.30…-2.27 % |           -0.3641 | 2/10          |
| f1        | top 50      | s_B1          |         0.011  | 0.21…2.33 %   |            0.14   | 7/10          |
| f1        | top 50      | s_M           |         0.0168 | 0.86…2.86 %   |            0.2215 | 8/10          |
| f1        | top 50      | s_B1 vs rynek |        -0.0026 | -0.98…0.60 %  |           -0.0311 | 5/10          |
| f1        | top 50      | s_M vs rynek  |         0.0032 | -0.35…1.20 %  |            0.0392 | 6/10          |
| f1        | top 50      | s_B0 vs rynek |        -0.0136 | -2.29…-0.71 % |           -0.1516 | 2/10          |
| f1        | górny decyl | s_B1          |        -0.0029 | -0.88…0.66 %  |           -0.0347 | 4/10          |
| f1        | górny decyl | s_M           |         0.0006 | -0.38…0.83 %  |            0.0078 | 7/10          |
| f1        | górny decyl | s_B1 vs rynek |        -0.0039 | -0.98…0.32 %  |           -0.0462 | 5/10          |
| f1        | górny decyl | s_M vs rynek  |        -0.0003 | -0.42…0.48 %  |           -0.0042 | 6/10          |
| f1        | górny decyl | s_B0 vs rynek |        -0.001  | -0.94…0.44 %  |           -0.0119 | 4/10          |
| f1_kara   | top 10      | s_B1          |         0.0237 | 0.98…3.95 %   |            0.3242 | 8/10          |
| f1_kara   | top 10      | s_M           |         0.0488 | 2.62…7.73 %   |            0.7719 | 8/10          |
| f1_kara   | top 10      | s_B1 vs rynek |        -0.015  | -2.30…-0.76 % |           -0.1657 | 1/10          |
| f1_kara   | top 10      | s_M vs rynek  |         0.0102 | -0.30…2.68 %  |            0.1289 | 8/10          |
| f1_kara   | top 10      | s_B0 vs rynek |        -0.0387 | -5.47…-2.49 % |           -0.377  | 2/10          |
| f1_kara   | top 50      | s_B1          |         0.0049 | -0.47…1.70 %  |            0.0606 | 7/10          |
| f1_kara   | top 50      | s_M           |         0.0184 | 1.04…2.99 %   |            0.2439 | 8/10          |
| f1_kara   | top 50      | s_B1 vs rynek |        -0.0105 | -1.70…-0.36 % |           -0.1185 | 1/10          |
| f1_kara   | top 50      | s_M vs rynek  |         0.003  | -0.39…1.20 %  |            0.0364 | 6/10          |
| f1_kara   | top 50      | s_B0 vs rynek |        -0.0154 | -2.52…-0.87 % |           -0.1696 | 2/10          |
| f1_kara   | górny decyl | s_B1          |        -0.0037 | -0.96…0.62 %  |           -0.0438 | 5/10          |
| f1_kara   | górny decyl | s_M           |         0.0022 | -0.26…1.01 %  |            0.027  | 7/10          |
| f1_kara   | górny decyl | s_B1 vs rynek |        -0.0066 | -1.21…-0.02 % |           -0.0761 | 3/10          |
| f1_kara   | górny decyl | s_M vs rynek  |        -0.0006 | -0.48…0.44 %  |           -0.0075 | 5/10          |
| f1_kara   | górny decyl | s_B0 vs rynek |        -0.0028 | -1.09…0.24 %  |           -0.0336 | 3/10          |

## Zwroty roczne netto (top 50, bez kary)

|   rok |   s_B0 top 50 |   s_B1 top 50 |   s_M top 50 |   rynek |
|------:|--------------:|--------------:|-------------:|--------:|
|  2003 |         1.177 |         0.316 |        0.581 |   0.644 |
|  2004 |        -0.222 |        -0.011 |        0.218 |   0.074 |
|  2005 |         0.174 |         0.208 |        0.024 |   0.198 |
|  2006 |        -0.225 |         0.098 |        0.061 |   0.104 |
|  2007 |        -0.287 |         0.017 |        0.21  |  -0.093 |
|  2008 |        -0.462 |        -0.171 |       -0.336 |  -0.435 |
|  2009 |         0.174 |         0.101 |        0.368 |   0.583 |
|  2010 |        -0.028 |         0.179 |        0.352 |   0.305 |
|  2011 |        -0.33  |         0.045 |        0.065 |  -0.041 |
|  2012 |        -0.076 |         0.159 |        0.167 |   0.123 |

## Ważność cech w LightGBM (średnie |SHAP|, w jednostkach rangi zwrotu)

| cecha      |    SHAP |
|:-----------|--------:|
| rv12       | 0.01036 |
| rv1        | 0.00677 |
| seria_wzr  | 0.00645 |
| od_max12   | 0.00498 |
| od_min12   | 0.00467 |
| log_dv     | 0.0045  |
| r12_1      | 0.00434 |
| sez_wlasna | 0.00398 |
| max_d      | 0.00374 |
| r36_12     | 0.00363 |
| vol_zm     | 0.00353 |
| od_ath     | 0.00315 |
| r1m        | 0.00245 |
| r3         | 0.00212 |
| r6         | 0.00205 |
| zakres3    | 0.00198 |
| up_d       | 0.00185 |
| r12        | 0.0014  |
| zawezenie  | 0.00111 |
