# Etap 6: model łączący cechy vs momentum 6M i rynek (prognozy krokowe 2003-01 ... 2012-12, próba ucząca, uniwersum: wszystkie)

Uwaga: momentum tutaj to ranking 6M w całym uniwersum z miesięczną rotacją, NIE reguły CEM10 (indeksy, filtry, wyjście SMA 10).

Spółek-miesięcy w ocenie: 379,184; miesięcy: 120. Rynek = równe wagi wszystkich płynnych spółek (bez kosztów).

## IC (korelacja rang prognozy i zwrotu następnego miesiąca)

| ranking   |     IC |      t |   mies. z IC > 0 |
|:----------|-------:|-------:|-----------------:|
| s_B0      | 0.0046 | 0.3841 |           0.5333 |
| s_B1      | 0.0341 | 2.2559 |           0.5917 |
| s_M       | 0.0444 | 4.6217 |           0.7    |

## Portfele netto (miesięczny rebalancing, równe wagi)

obrot = średni odsetek nowych spółek w portfelu na miesiąc.

| wariant                   | ranking            | portfel     |    CAGR |   zmiennosc |   Sharpe |   maxDD |    obrot |
|:--------------------------|:-------------------|:------------|--------:|------------:|---------:|--------:|---------:|
| bez kary                  | rynek (równe wagi) | wszystkie   |  0.1047 |      0.2097 |   0.5829 | -0.5767 | nan      |
| bez kary                  | s_B0               | top 10      | -0.3219 |      0.4    |  -0.7455 | -0.9902 |   0.5792 |
| bez kary                  | s_B0               | top 50      | -0.0753 |      0.2922 |  -0.1183 | -0.8008 |   0.4903 |
| bez kary                  | s_B0               | górny decyl |  0.085  |      0.2341 |   0.4671 | -0.5949 |   0.4034 |
| bez kary                  | s_B1               | top 10      |  0.1394 |      0.1357 |   1.0317 | -0.2426 |   0.9642 |
| bez kary                  | s_B1               | top 50      |  0.0839 |      0.1071 |   0.8086 | -0.2774 |   0.9005 |
| bez kary                  | s_B1               | górny decyl |  0.0683 |      0.1212 |   0.6088 | -0.4105 |   0.681  |
| bez kary                  | s_M                | top 10      |  0.2463 |      0.2772 |   0.9379 | -0.4479 |   0.9775 |
| bez kary                  | s_M                | top 50      |  0.1844 |      0.2045 |   0.9372 | -0.4386 |   0.9342 |
| bez kary                  | s_M                | górny decyl |  0.1086 |      0.1799 |   0.6689 | -0.4838 |   0.7971 |
| kara -30 % przy wycofaniu | rynek (równe wagi) | wszystkie   |  0.0914 |      0.2097 |   0.5245 | -0.588  | nan      |
| kara -30 % przy wycofaniu | s_B0               | top 10      | -0.3482 |      0.3952 |  -0.8559 | -0.9934 |   0.5792 |
| kara -30 % przy wycofaniu | s_B0               | top 50      | -0.1078 |      0.2916 |  -0.2403 | -0.8591 |   0.4903 |
| kara -30 % przy wycofaniu | s_B0               | górny decyl |  0.0471 |      0.2345 |   0.3146 | -0.6237 |   0.4034 |
| kara -30 % przy wycofaniu | s_B1               | top 10      | -0.0699 |      0.1665 |  -0.3523 | -0.7637 |   0.9642 |
| kara -30 % przy wycofaniu | s_B1               | top 50      | -0.0279 |      0.1167 |  -0.1833 | -0.5713 |   0.9005 |
| kara -30 % przy wycofaniu | s_B1               | górny decyl |  0.0222 |      0.1219 |   0.2429 | -0.4693 |   0.681  |
| kara -30 % przy wycofaniu | s_M                | top 10      |  0.2391 |      0.277  |   0.9169 | -0.4479 |   0.9775 |
| kara -30 % przy wycofaniu | s_M                | top 50      |  0.1706 |      0.2033 |   0.8831 | -0.4386 |   0.9342 |
| kara -30 % przy wycofaniu | s_M                | górny decyl |  0.0932 |      0.1794 |   0.5916 | -0.49   |   0.7971 |

## Różnica miesięcznego zwrotu netto względem momentum 6M (95 % bootstrap blokowy)

| wariant   | portfel     | ranking       |   roznica_mies | ci95          |   roznica_rocznie | lata_lepsze   |
|:----------|:------------|:--------------|---------------:|:--------------|------------------:|:--------------|
| f1        | top 10      | s_B1          |         0.0365 | 2.21…5.42 %   |            0.5379 | 8/10          |
| f1        | top 10      | s_M           |         0.0465 | 2.62…6.89 %   |            0.7256 | 9/10          |
| f1        | top 10      | s_B1 vs rynek |         0.0015 | -0.59…0.94 %  |            0.0179 | 7/10          |
| f1        | top 10      | s_M vs rynek  |         0.0115 | -0.23…2.51 %  |            0.1468 | 6/10          |
| f1        | top 10      | s_B0 vs rynek |        -0.035  | -4.99…-2.11 % |           -0.3482 | 2/10          |
| f1        | top 50      | s_B1          |         0.0101 | 0.13…2.24 %   |            0.1281 | 7/10          |
| f1        | top 50      | s_M           |         0.0189 | 1.15…3.06 %   |            0.2512 | 8/10          |
| f1        | top 50      | s_B1 vs rynek |        -0.003  | -1.03…0.54 %  |           -0.035  | 4/10          |
| f1        | top 50      | s_M vs rynek  |         0.0058 | -0.01…1.45 %  |            0.0717 | 7/10          |
| f1        | top 50      | s_B0 vs rynek |        -0.0131 | -2.23…-0.68 % |           -0.146  | 1/10          |
| f1        | górny decyl | s_B1          |        -0.003  | -0.87…0.65 %  |           -0.035  | 4/10          |
| f1        | górny decyl | s_M           |         0.0009 | -0.36…0.85 %  |            0.011  | 7/10          |
| f1        | górny decyl | s_B1 vs rynek |        -0.004  | -0.98…0.30 %  |           -0.0473 | 5/10          |
| f1        | górny decyl | s_M vs rynek  |        -0.0002 | -0.34…0.43 %  |           -0.0019 | 6/10          |
| f1        | górny decyl | s_B0 vs rynek |        -0.0011 | -0.93…0.43 %  |           -0.0128 | 4/10          |
| f1_kara   | top 10      | s_B1          |         0.0233 | 0.92…3.93 %   |            0.3183 | 8/10          |
| f1_kara   | top 10      | s_M           |         0.0493 | 3.09…7.13 %   |            0.7825 | 9/10          |
| f1_kara   | top 10      | s_B1 vs rynek |        -0.0141 | -2.29…-0.61 % |           -0.1562 | 1/10          |
| f1_kara   | top 10      | s_M vs rynek  |         0.012  | -0.17…2.65 %  |            0.1538 | 6/10          |
| f1_kara   | top 10      | s_B0 vs rynek |        -0.0374 | -5.23…-2.39 % |           -0.3667 | 2/10          |
| f1_kara   | top 50      | s_B1          |         0.0041 | -0.55…1.66 %  |            0.0498 | 7/10          |
| f1_kara   | top 50      | s_M           |         0.0208 | 1.38…3.22 %   |            0.2803 | 8/10          |
| f1_kara   | top 50      | s_B1 vs rynek |        -0.0109 | -1.76…-0.40 % |           -0.1238 | 1/10          |
| f1_kara   | top 50      | s_M vs rynek  |         0.0058 | -0.01…1.47 %  |            0.0718 | 7/10          |
| f1_kara   | top 50      | s_B0 vs rynek |        -0.015  | -2.47…-0.85 % |           -0.1659 | 1/10          |
| f1_kara   | górny decyl | s_B1          |        -0.0037 | -0.95…0.62 %  |           -0.0433 | 5/10          |
| f1_kara   | górny decyl | s_M           |         0.0027 | -0.19…1.04 %  |            0.0329 | 7/10          |
| f1_kara   | górny decyl | s_B1 vs rynek |        -0.0067 | -1.22…-0.04 % |           -0.0775 | 3/10          |
| f1_kara   | górny decyl | s_M vs rynek  |        -0.0003 | -0.40…0.41 %  |           -0.0039 | 5/10          |
| f1_kara   | górny decyl | s_B0 vs rynek |        -0.003  | -1.11…0.22 %  |           -0.0356 | 3/10          |

## Zwroty roczne netto (top 50, bez kary)

|   rok |   s_B0 top 50 |   s_B1 top 50 |   s_M top 50 |   rynek |
|------:|--------------:|--------------:|-------------:|--------:|
|  2003 |         1.186 |         0.342 |        0.614 |   0.651 |
|  2004 |        -0.225 |        -0.019 |        0.302 |   0.076 |
|  2005 |         0.164 |         0.135 |        0.061 |   0.198 |
|  2006 |        -0.198 |         0.105 |        0.119 |   0.104 |
|  2007 |        -0.269 |         0.023 |        0.255 |  -0.09  |
|  2008 |        -0.462 |        -0.165 |       -0.266 |  -0.435 |
|  2009 |         0.177 |         0.106 |        0.483 |   0.583 |
|  2010 |        -0.022 |         0.189 |        0.354 |   0.309 |
|  2011 |        -0.329 |         0.044 |       -0.011 |  -0.041 |
|  2012 |        -0.048 |         0.157 |        0.191 |   0.127 |

## Ważność cech w LightGBM (średnie |SHAP|, w jednostkach rangi zwrotu)

| cecha      |    SHAP |
|:-----------|--------:|
| rv12       | 0.01008 |
| seria_wzr  | 0.00663 |
| rv1        | 0.0066  |
| od_max12   | 0.00502 |
| od_min12   | 0.00461 |
| log_dv     | 0.00445 |
| r12_1      | 0.00432 |
| sez_wlasna | 0.00408 |
| max_d      | 0.00368 |
| r36_12     | 0.0036  |
| od_ath     | 0.0035  |
| vol_zm     | 0.00346 |
| r1m        | 0.00249 |
| r3         | 0.00214 |
| r6         | 0.00207 |
| zakres3    | 0.00193 |
| up_d       | 0.00184 |
| r12        | 0.00146 |
| zawezenie  | 0.00113 |
