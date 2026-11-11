# Etap 6: model łączący cechy vs momentum 6M i rynek (prognozy krokowe 2003-01 ... 2012-12, próba ucząca, uniwersum: wszystkie)

Uwaga: momentum tutaj to ranking 6M w całym uniwersum z miesięczną rotacją, NIE reguły CEM10 (indeksy, filtry, wyjście SMA 10).

Spółek-miesięcy w ocenie: 379,551; miesięcy: 120. Rynek = równe wagi wszystkich płynnych spółek (bez kosztów).

## IC (korelacja rang prognozy i zwrotu następnego miesiąca)

| ranking   |     IC |      t |   mies. z IC > 0 |
|:----------|-------:|-------:|-----------------:|
| s_B0      | 0.0047 | 0.3892 |           0.5333 |
| s_B1      | 0.0343 | 2.2714 |           0.5917 |
| s_M       | 0.0486 | 4.998  |           0.725  |

## Portfele netto (miesięczny rebalancing, równe wagi)

obrot = średni odsetek nowych spółek w portfelu na miesiąc.

| wariant                   | ranking            | portfel     |    CAGR |   zmiennosc |   Sharpe |   maxDD |    obrot |
|:--------------------------|:-------------------|:------------|--------:|------------:|---------:|--------:|---------:|
| bez kary                  | rynek (równe wagi) | wszystkie   |  0.1049 |      0.2098 |   0.5833 | -0.577  | nan      |
| bez kary                  | s_B0               | top 10      | -0.3365 |      0.4121 |  -0.7626 | -0.9921 |   0.575  |
| bez kary                  | s_B0               | top 50      | -0.0819 |      0.2951 |  -0.1385 | -0.8139 |   0.4895 |
| bez kary                  | s_B0               | górny decyl |  0.087  |      0.2342 |   0.4748 | -0.5945 |   0.4034 |
| bez kary                  | s_B1               | top 10      |  0.135  |      0.1376 |   0.9904 | -0.2551 |   0.9625 |
| bez kary                  | s_B1               | top 50      |  0.0907 |      0.1076 |   0.8642 | -0.2769 |   0.9002 |
| bez kary                  | s_B1               | górny decyl |  0.07   |      0.1216 |   0.6203 | -0.4127 |   0.6815 |
| bez kary                  | s_M                | top 10      |  0.2123 |      0.2616 |   0.868  | -0.3842 |   0.9692 |
| bez kary                  | s_M                | top 50      |  0.1673 |      0.2034 |   0.8704 | -0.4387 |   0.9287 |
| bez kary                  | s_M                | górny decyl |  0.0981 |      0.1812 |   0.6132 | -0.4955 |   0.7948 |
| kara -30 % przy wycofaniu | rynek (równe wagi) | wszystkie   |  0.0921 |      0.2099 |   0.5276 | -0.5878 | nan      |
| kara -30 % przy wycofaniu | s_B0               | top 10      | -0.3588 |      0.4104 |  -0.8484 | -0.9944 |   0.575  |
| kara -30 % przy wycofaniu | s_B0               | top 50      | -0.1113 |      0.2949 |  -0.2479 | -0.8641 |   0.4895 |
| kara -30 % przy wycofaniu | s_B0               | górny decyl |  0.0506 |      0.2344 |   0.329  | -0.6224 |   0.4034 |
| kara -30 % przy wycofaniu | s_B1               | top 10      | -0.077  |      0.1717 |  -0.3808 | -0.7798 |   0.9625 |
| kara -30 % przy wycofaniu | s_B1               | top 50      | -0.02   |      0.1168 |  -0.1135 | -0.5352 |   0.9002 |
| kara -30 % przy wycofaniu | s_B1               | górny decyl |  0.0245 |      0.1222 |   0.2606 | -0.4687 |   0.6815 |
| kara -30 % przy wycofaniu | s_M                | top 10      |  0.199  |      0.2603 |   0.8281 | -0.3842 |   0.9692 |
| kara -30 % przy wycofaniu | s_M                | top 50      |  0.1502 |      0.203  |   0.7979 | -0.4392 |   0.9287 |
| kara -30 % przy wycofaniu | s_M                | górny decyl |  0.0843 |      0.1808 |   0.5437 | -0.5024 |   0.7948 |

## Różnica miesięcznego zwrotu netto względem momentum 6M (95 % bootstrap blokowy)

| wariant   | portfel     | ranking       |   roznica_mies | ci95          |   roznica_rocznie | lata_lepsze   |
|:----------|:------------|:--------------|---------------:|:--------------|------------------:|:--------------|
| f1        | top 10      | s_B1          |         0.0375 | 2.24…5.55 %   |            0.5563 | 8/10          |
| f1        | top 10      | s_M           |         0.0451 | 2.29…7.18 %   |            0.6981 | 8/10          |
| f1        | top 10      | s_B1 vs rynek |         0.0012 | -0.61…0.89 %  |            0.014  | 7/10          |
| f1        | top 10      | s_M vs rynek  |         0.0087 | -0.27…2.49 %  |            0.1099 | 6/10          |
| f1        | top 10      | s_B0 vs rynek |        -0.0364 | -5.20…-2.25 % |           -0.3591 | 2/10          |
| f1        | top 50      | s_B1          |         0.0112 | 0.23…2.33 %   |            0.1423 | 7/10          |
| f1        | top 50      | s_M           |         0.0182 | 1.08…2.98 %   |            0.241  | 8/10          |
| f1        | top 50      | s_B1 vs rynek |        -0.0025 | -0.97…0.59 %  |           -0.029  | 5/10          |
| f1        | top 50      | s_M vs rynek  |         0.0046 | -0.05…1.16 %  |            0.056  | 6/10          |
| f1        | top 50      | s_B0 vs rynek |        -0.0136 | -2.29…-0.71 % |           -0.1516 | 2/10          |
| f1        | górny decyl | s_B1          |        -0.003  | -0.88…0.65 %  |           -0.0352 | 4/10          |
| f1        | górny decyl | s_M           |        -0      | -0.43…0.77 %  |           -0      | 7/10          |
| f1        | górny decyl | s_B1 vs rynek |        -0.0039 | -0.99…0.32 %  |           -0.0459 | 5/10          |
| f1        | górny decyl | s_M vs rynek  |        -0.0009 | -0.44…0.37 %  |           -0.0112 | 5/10          |
| f1        | górny decyl | s_B0 vs rynek |        -0.0009 | -0.93…0.44 %  |           -0.0111 | 4/10          |
| f1_kara   | top 10      | s_B1          |         0.0236 | 0.93…3.96 %   |            0.3224 | 8/10          |
| f1_kara   | top 10      | s_M           |         0.047  | 2.66…7.42 %   |            0.7347 | 8/10          |
| f1_kara   | top 10      | s_B1 vs rynek |        -0.0147 | -2.34…-0.70 % |           -0.1626 | 1/10          |
| f1_kara   | top 10      | s_M vs rynek  |         0.0087 | -0.24…2.50 %  |            0.11   | 6/10          |
| f1_kara   | top 10      | s_B0 vs rynek |        -0.0382 | -5.39…-2.46 % |           -0.3736 | 2/10          |
| f1_kara   | top 50      | s_B1          |         0.005  | -0.46…1.71 %  |            0.0615 | 7/10          |
| f1_kara   | top 50      | s_M           |         0.0196 | 1.22…3.11 %   |            0.2622 | 8/10          |
| f1_kara   | top 50      | s_B1 vs rynek |        -0.0103 | -1.71…-0.35 % |           -0.1172 | 1/10          |
| f1_kara   | top 50      | s_M vs rynek  |         0.0043 | -0.09…1.15 %  |            0.0525 | 5/10          |
| f1_kara   | top 50      | s_B0 vs rynek |        -0.0153 | -2.52…-0.87 % |           -0.1691 | 2/10          |
| f1_kara   | górny decyl | s_B1          |        -0.0038 | -0.96…0.61 %  |           -0.0443 | 5/10          |
| f1_kara   | górny decyl | s_M           |         0.0018 | -0.30…0.95 %  |            0.0214 | 7/10          |
| f1_kara   | górny decyl | s_B1 vs rynek |        -0.0066 | -1.21…-0.03 % |           -0.0761 | 3/10          |
| f1_kara   | górny decyl | s_M vs rynek  |        -0.001  | -0.48…0.35 %  |           -0.0123 | 5/10          |
| f1_kara   | górny decyl | s_B0 vs rynek |        -0.0028 | -1.09…0.25 %  |           -0.0331 | 3/10          |

## Zwroty roczne netto (top 50, bez kary)

|   rok |   s_B0 top 50 |   s_B1 top 50 |   s_M top 50 |   rynek |
|------:|--------------:|--------------:|-------------:|--------:|
|  2003 |         1.177 |         0.343 |        0.625 |   0.651 |
|  2004 |        -0.22  |        -0.019 |        0.354 |   0.076 |
|  2005 |         0.174 |         0.213 |        0.04  |   0.199 |
|  2006 |        -0.211 |         0.104 |        0.086 |   0.106 |
|  2007 |        -0.287 |         0.017 |        0.13  |  -0.091 |
|  2008 |        -0.462 |        -0.163 |       -0.297 |  -0.435 |
|  2009 |         0.174 |         0.108 |        0.489 |   0.584 |
|  2010 |        -0.028 |         0.185 |        0.318 |   0.308 |
|  2011 |        -0.33  |         0.042 |        0.068 |  -0.04  |
|  2012 |        -0.076 |         0.159 |        0.133 |   0.126 |

## Ważność cech w LightGBM (średnie |SHAP|, w jednostkach rangi zwrotu)

| cecha      |    SHAP |
|:-----------|--------:|
| rv12       | 0.01015 |
| rv1        | 0.00677 |
| seria_wzr  | 0.00666 |
| od_max12   | 0.00498 |
| od_min12   | 0.00458 |
| log_dv     | 0.00448 |
| r12_1      | 0.00445 |
| sez_wlasna | 0.00392 |
| max_d      | 0.00366 |
| r36_12     | 0.00362 |
| vol_zm     | 0.00356 |
| od_ath     | 0.00332 |
| r1m        | 0.00244 |
| r3         | 0.00213 |
| r6         | 0.00211 |
| zakres3    | 0.00192 |
| up_d       | 0.00186 |
| r12        | 0.00137 |
| zawezenie  | 0.00111 |
