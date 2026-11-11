# Etap 6: model łączący cechy vs momentum 6M (prognozy krokowe 2003-01 ... 2012-12, próba ucząca)

Spółek-miesięcy w ocenie: 379,977; miesięcy: 120. Rynek = równe wagi wszystkich płynnych spółek (bez kosztów).

## IC (korelacja rang prognozy i zwrotu następnego miesiąca)

| ranking   |     IC |      t |   mies. z IC > 0 |
|:----------|-------:|-------:|-----------------:|
| s_B0      | 0.0043 | 0.3636 |           0.5333 |
| s_B1      | 0.0342 | 2.2657 |           0.5833 |
| s_M       | 0.0481 | 5.1391 |           0.7    |

## Portfele netto (miesięczny rebalancing, równe wagi)

obrot = średni odsetek nowych spółek w portfelu na miesiąc.

| wariant                   | ranking            | portfel     |    CAGR |   zmiennosc |   Sharpe |   maxDD |    obrot |
|:--------------------------|:-------------------|:------------|--------:|------------:|---------:|--------:|---------:|
| bez kary                  | rynek (równe wagi) | wszystkie   |  0.1707 |      0.2391 |   0.7798 | -0.5742 | nan      |
| bez kary                  | s_B0               | top 10      | -0.2888 |      0.4249 |  -0.5732 | -0.9877 |   0.5308 |
| bez kary                  | s_B0               | top 50      | -0.0872 |      0.2972 |  -0.1553 | -0.8333 |   0.483  |
| bez kary                  | s_B0               | górny decyl |  0.1396 |      0.3258 |   0.5416 | -0.5962 |   0.4034 |
| bez kary                  | s_B1               | top 10      |  0.1086 |      0.1417 |   0.7987 | -0.2944 |   0.9625 |
| bez kary                  | s_B1               | top 50      |  0.0727 |      0.107  |   0.7119 | -0.2985 |   0.8998 |
| bez kary                  | s_B1               | górny decyl |  0.0674 |      0.1212 |   0.6013 | -0.4129 |   0.6819 |
| bez kary                  | s_M                | top 10      |  0.2055 |      0.2654 |   0.8377 | -0.4114 |   0.9775 |
| bez kary                  | s_M                | top 50      |  0.1558 |      0.2025 |   0.8237 | -0.4531 |   0.931  |
| bez kary                  | s_M                | górny decyl |  0.1043 |      0.1784 |   0.6504 | -0.4878 |   0.7997 |
| kara -30 % przy wycofaniu | rynek (równe wagi) | wszystkie   |  0.1582 |      0.2392 |   0.7344 | -0.5845 | nan      |
| kara -30 % przy wycofaniu | s_B0               | top 10      | -0.312  |      0.4242 |  -0.6506 | -0.9912 |   0.5308 |
| kara -30 % przy wycofaniu | s_B0               | top 50      | -0.1146 |      0.2972 |  -0.2567 | -0.8763 |   0.483  |
| kara -30 % przy wycofaniu | s_B0               | górny decyl |  0.1031 |      0.3264 |   0.4406 | -0.6236 |   0.4034 |
| kara -30 % przy wycofaniu | s_B1               | top 10      | -0.0908 |      0.1757 |  -0.4527 | -0.7765 |   0.9625 |
| kara -30 % przy wycofaniu | s_B1               | top 50      | -0.0345 |      0.1166 |  -0.2421 | -0.5742 |   0.8998 |
| kara -30 % przy wycofaniu | s_B1               | górny decyl |  0.0226 |      0.122  |   0.2461 | -0.4686 |   0.6819 |
| kara -30 % przy wycofaniu | s_M                | top 10      |  0.1854 |      0.2628 |   0.7786 | -0.4114 |   0.9775 |
| kara -30 % przy wycofaniu | s_M                | top 50      |  0.1409 |      0.2017 |   0.7609 | -0.4531 |   0.931  |
| kara -30 % przy wycofaniu | s_M                | górny decyl |  0.0914 |      0.1782 |   0.5843 | -0.4948 |   0.7997 |

## Różnica miesięcznego zwrotu netto względem momentum 6M (95 % bootstrap blokowy)

| wariant   | portfel     | ranking       |   roznica_mies | ci95          |   roznica_rocznie | lata_lepsze   |
|:----------|:------------|:--------------|---------------:|:--------------|------------------:|:--------------|
| f1        | top 10      | s_B1          |         0.0297 | 1.24…5.30 %   |            0.4212 | 8/10          |
| f1        | top 10      | s_M           |         0.0388 | 1.68…6.58 %   |            0.5795 | 8/10          |
| f1        | top 10      | s_B0 vs rynek |        -0.0358 | -5.23…-1.94 % |           -0.3546 | 1/10          |
| f1        | top 50      | s_B1          |         0.0102 | 0.08…2.41 %   |            0.1294 | 8/10          |
| f1        | top 50      | s_M           |         0.0177 | 0.99…2.94 %   |            0.235  | 7/10          |
| f1        | top 50      | s_B0 vs rynek |        -0.0194 | -2.92…-1.03 % |           -0.2094 | 1/10          |
| f1        | górny decyl | s_B1          |        -0.0086 | -2.13…0.54 %  |           -0.0988 | 4/10          |
| f1        | górny decyl | s_M           |        -0.005  | -1.61…0.59 %  |           -0.0588 | 5/10          |
| f1        | górny decyl | s_B0 vs rynek |        -0.0008 | -1.19…1.09 %  |           -0.0099 | 4/10          |
| f1_kara   | top 10      | s_B1          |         0.0164 | 0.33…3.42 %   |            0.2151 | 7/10          |
| f1_kara   | top 10      | s_M           |         0.0401 | 1.97…6.56 %   |            0.602  | 8/10          |
| f1_kara   | top 10      | s_B0 vs rynek |        -0.0376 | -5.36…-2.11 % |           -0.3689 | 1/10          |
| f1_kara   | top 50      | s_B1          |         0.004  | -0.59…1.69 %  |            0.0492 | 7/10          |
| f1_kara   | top 50      | s_M           |         0.0191 | 1.15…3.05 %   |            0.2556 | 7/10          |
| f1_kara   | top 50      | s_B0 vs rynek |        -0.021  | -3.11…-1.19 % |           -0.2248 | 1/10          |
| f1_kara   | górny decyl | s_B1          |        -0.0095 | -2.24…0.44 %  |           -0.108  | 5/10          |
| f1_kara   | górny decyl | s_M           |        -0.0033 | -1.48…0.79 %  |           -0.039  | 6/10          |
| f1_kara   | górny decyl | s_B0 vs rynek |        -0.0027 | -1.37…0.91 %  |           -0.0314 | 3/10          |

## Zwroty roczne netto (top 50, bez kary)

|   rok |   s_B0 top 50 |   s_B1 top 50 |   s_M top 50 |   rynek |
|------:|--------------:|--------------:|-------------:|--------:|
|  2003 |         1.294 |         0.275 |        0.621 |   0.66  |
|  2004 |        -0.245 |        -0.01  |        0.324 |   0.083 |
|  2005 |         0.131 |         0.194 |        0.079 |   0.343 |
|  2006 |        -0.258 |         0.069 |        0.073 |   0.106 |
|  2007 |        -0.311 |         0.004 |        0.216 |  -0.077 |
|  2008 |        -0.48  |        -0.187 |       -0.306 |  -0.43  |
|  2009 |         0.313 |         0.093 |        0.338 |   0.696 |
|  2010 |         0.018 |         0.186 |        0.349 |   0.313 |
|  2011 |        -0.372 |         0.049 |       -0.027 |   0.033 |
|  2012 |        -0.081 |         0.129 |        0.155 |   0.496 |

## Ważność cech w LightGBM (średnie |SHAP|, w jednostkach rangi zwrotu)

| cecha      |    SHAP |
|:-----------|--------:|
| rv12       | 0.01036 |
| rv1        | 0.00676 |
| seria_wzr  | 0.00653 |
| od_max12   | 0.00496 |
| od_min12   | 0.00456 |
| log_dv     | 0.00455 |
| r12_1      | 0.0043  |
| sez_wlasna | 0.00398 |
| max_d      | 0.00371 |
| r36_12     | 0.00361 |
| vol_zm     | 0.00356 |
| od_ath     | 0.00301 |
| r1m        | 0.0025  |
| r3         | 0.00209 |
| r6         | 0.00204 |
| zakres3    | 0.00189 |
| up_d       | 0.00185 |
| r12        | 0.00141 |
| zawezenie  | 0.00115 |
