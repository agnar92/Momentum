# Etap 6: model łączący cechy vs momentum 6M i rynek (prognozy krokowe 2003-01 ... 2012-12, próba ucząca, uniwersum: duze)

Uwaga: momentum tutaj to ranking 6M w całym uniwersum z miesięczną rotacją, NIE reguły CEM10 (indeksy, filtry, wyjście SMA 10).

Spółek-miesięcy w ocenie: 60,000; miesięcy: 120. Rynek = równe wagi wszystkich płynnych spółek (bez kosztów).

## IC (korelacja rang prognozy i zwrotu następnego miesiąca)

| ranking   |     IC |      t |   mies. z IC > 0 |
|:----------|-------:|-------:|-----------------:|
| s_B0      | 0.0115 | 0.7225 |           0.5083 |
| s_B1      | 0.0447 | 2.4539 |           0.5917 |
| s_M       | 0.0418 | 3.8984 |           0.6333 |

## Portfele netto (miesięczny rebalancing, równe wagi)

obrot = średni odsetek nowych spółek w portfelu na miesiąc.

| wariant                   | ranking            | portfel     |    CAGR |   zmiennosc |   Sharpe |   maxDD |    obrot |
|:--------------------------|:-------------------|:------------|--------:|------------:|---------:|--------:|---------:|
| bez kary                  | rynek (równe wagi) | wszystkie   |  0.0575 |      0.1969 |   0.385  | -0.6025 | nan      |
| bez kary                  | s_B0               | top 10      | -0.0945 |      0.365  |  -0.0832 | -0.8276 |   0.4917 |
| bez kary                  | s_B0               | top 50      |  0.0144 |      0.251  |   0.1866 | -0.6491 |   0.4072 |
| bez kary                  | s_B0               | górny decyl |  0.0144 |      0.251  |   0.1866 | -0.6491 |   0.4072 |
| bez kary                  | s_B1               | top 10      |  0.0928 |      0.1107 |   0.8603 | -0.2415 |   0.8933 |
| bez kary                  | s_B1               | top 50      |  0.0725 |      0.1143 |   0.6721 | -0.3851 |   0.6932 |
| bez kary                  | s_B1               | górny decyl |  0.0725 |      0.1143 |   0.6721 | -0.3851 |   0.6932 |
| bez kary                  | s_M                | top 10      | -0.0187 |      0.2628 |   0.0699 | -0.7146 |   0.8758 |
| bez kary                  | s_M                | top 50      |  0.0447 |      0.212  |   0.3173 | -0.6616 |   0.7515 |
| bez kary                  | s_M                | górny decyl |  0.0447 |      0.212  |   0.3173 | -0.6616 |   0.7515 |
| kara -30 % przy wycofaniu | rynek (równe wagi) | wszystkie   |  0.0452 |      0.1968 |   0.3254 | -0.6121 | nan      |
| kara -30 % przy wycofaniu | s_B0               | top 10      | -0.1301 |      0.3652 |  -0.1914 | -0.8778 |   0.4917 |
| kara -30 % przy wycofaniu | s_B0               | top 50      | -0.0271 |      0.2527 |   0.0226 | -0.6783 |   0.4072 |
| kara -30 % przy wycofaniu | s_B0               | górny decyl | -0.0271 |      0.2527 |   0.0226 | -0.6783 |   0.4072 |
| kara -30 % przy wycofaniu | s_B1               | top 10      | -0.0012 |      0.1282 |   0.056  | -0.4397 |   0.8933 |
| kara -30 % przy wycofaniu | s_B1               | top 50      |  0.0254 |      0.1169 |   0.2741 | -0.4486 |   0.6932 |
| kara -30 % przy wycofaniu | s_B1               | górny decyl |  0.0254 |      0.1169 |   0.2741 | -0.4486 |   0.6932 |
| kara -30 % przy wycofaniu | s_M                | top 10      | -0.0427 |      0.2641 |  -0.0227 | -0.7436 |   0.8758 |
| kara -30 % przy wycofaniu | s_M                | top 50      |  0.0321 |      0.2124 |   0.2601 | -0.6696 |   0.7515 |
| kara -30 % przy wycofaniu | s_M                | górny decyl |  0.0321 |      0.2124 |   0.2601 | -0.6696 |   0.7515 |

## Różnica miesięcznego zwrotu netto względem momentum 6M (95 % bootstrap blokowy)

| wariant   | portfel     | ranking       |   roznica_mies | ci95          |   roznica_rocznie | lata_lepsze   |
|:----------|:------------|:--------------|---------------:|:--------------|------------------:|:--------------|
| f1        | top 10      | s_B1          |         0.0105 | 0.09…2.72 %   |            0.1331 | 6/10          |
| f1        | top 10      | s_M           |         0.0041 | -0.48…1.96 %  |            0.0498 | 6/10          |
| f1        | top 10      | s_B1 vs rynek |         0.0016 | -0.70…1.41 %  |            0.0196 | 6/10          |
| f1        | top 10      | s_M vs rynek  |        -0.0048 | -1.14…0.34 %  |           -0.0559 | 2/10          |
| f1        | top 10      | s_B0 vs rynek |        -0.0088 | -2.22…0.01 %  |           -0.1011 | 3/10          |
| f1        | top 50      | s_B1          |         0.0025 | -0.59…1.46 %  |            0.0304 | 6/10          |
| f1        | top 50      | s_M           |         0.0017 | -0.54…1.18 %  |            0.0206 | 6/10          |
| f1        | top 50      | s_B1 vs rynek |         0.0001 | -0.58…0.81 %  |            0.001  | 6/10          |
| f1        | top 50      | s_M vs rynek  |        -0.0007 | -0.65…0.52 %  |           -0.0085 | 5/10          |
| f1        | top 50      | s_B0 vs rynek |        -0.0024 | -1.10…0.45 %  |           -0.0286 | 4/10          |
| f1        | górny decyl | s_B1          |         0.0025 | -0.50…1.44 %  |            0.0304 | 6/10          |
| f1        | górny decyl | s_M           |         0.0017 | -0.57…1.17 %  |            0.0206 | 6/10          |
| f1        | górny decyl | s_B1 vs rynek |         0.0001 | -0.62…0.84 %  |            0.001  | 6/10          |
| f1        | górny decyl | s_M vs rynek  |        -0.0007 | -0.68…0.50 %  |           -0.0085 | 5/10          |
| f1        | górny decyl | s_B0 vs rynek |        -0.0024 | -1.10…0.47 %  |           -0.0286 | 4/10          |
| f1_kara   | top 10      | s_B1          |         0.0064 | -0.46…2.41 %  |            0.0799 | 5/10          |
| f1_kara   | top 10      | s_M           |         0.0053 | -0.26…1.96 %  |            0.0658 | 5/10          |
| f1_kara   | top 10      | s_B1 vs rynek |        -0.0047 | -1.14…0.51 %  |           -0.0554 | 3/10          |
| f1_kara   | top 10      | s_M vs rynek  |        -0.0058 | -1.25…0.27 %  |           -0.0678 | 1/10          |
| f1_kara   | top 10      | s_B0 vs rynek |        -0.0112 | -2.40…-0.19 % |           -0.126  | 3/10          |
| f1_kara   | top 50      | s_B1          |         0.0022 | -0.55…1.44 %  |            0.0267 | 6/10          |
| f1_kara   | top 50      | s_M           |         0.0041 | -0.23…1.40 %  |            0.0507 | 7/10          |
| f1_kara   | top 50      | s_B1 vs rynek |        -0.0027 | -0.86…0.49 %  |           -0.0315 | 4/10          |
| f1_kara   | top 50      | s_M vs rynek  |        -0.0007 | -0.71…0.49 %  |           -0.0088 | 5/10          |
| f1_kara   | top 50      | s_B0 vs rynek |        -0.0049 | -1.35…0.19 %  |           -0.0568 | 3/10          |
| f1_kara   | górny decyl | s_B1          |         0.0022 | -0.52…1.47 %  |            0.0267 | 6/10          |
| f1_kara   | górny decyl | s_M           |         0.0041 | -0.26…1.39 %  |            0.0507 | 7/10          |
| f1_kara   | górny decyl | s_B1 vs rynek |        -0.0027 | -0.84…0.50 %  |           -0.0315 | 4/10          |
| f1_kara   | górny decyl | s_M vs rynek  |        -0.0007 | -0.73…0.49 %  |           -0.0088 | 5/10          |
| f1_kara   | górny decyl | s_B0 vs rynek |        -0.0049 | -1.34…0.21 %  |           -0.0568 | 3/10          |

## Zwroty roczne netto (top 50, bez kary)

|   rok |   s_B0 top 50 |   s_B1 top 50 |   s_M top 50 |   rynek |
|------:|--------------:|--------------:|-------------:|--------:|
|  2003 |         0.811 |         0.182 |        0.376 |   0.513 |
|  2004 |        -0.174 |         0.059 |        0.112 |   0.013 |
|  2005 |         0.316 |         0.13  |        0.196 |   0.164 |
|  2006 |        -0.098 |         0.113 |       -0.036 |   0.071 |
|  2007 |         0.171 |         0.002 |       -0.099 |  -0.068 |
|  2008 |        -0.529 |        -0.246 |       -0.546 |  -0.484 |
|  2009 |         0.186 |         0.106 |        0.296 |   0.464 |
|  2010 |         0.109 |         0.16  |        0.3   |   0.261 |
|  2011 |        -0.195 |         0.108 |        0.054 |  -0.058 |
|  2012 |         0.112 |         0.191 |        0.208 |   0.098 |

## Ważność cech w LightGBM (średnie |SHAP|, w jednostkach rangi zwrotu)

| cecha      |    SHAP |
|:-----------|--------:|
| rv12       | 0.01047 |
| seria_wzr  | 0.0085  |
| rv1        | 0.00818 |
| od_max12   | 0.00738 |
| od_ath     | 0.00736 |
| r12_1      | 0.00686 |
| r36_12     | 0.00577 |
| sez_wlasna | 0.00565 |
| od_min12   | 0.00536 |
| r6         | 0.00509 |
| max_d      | 0.00498 |
| log_dv     | 0.00473 |
| vol_zm     | 0.00458 |
| zakres3    | 0.0044  |
| r12        | 0.00407 |
| r3         | 0.00394 |
| r1m        | 0.00384 |
| up_d       | 0.00347 |
| zawezenie  | 0.00275 |
