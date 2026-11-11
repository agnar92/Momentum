# Etap 6: model łączący cechy vs momentum 6M i rynek (prognozy krokowe 2003-01 ... 2012-12, próba ucząca, uniwersum: duze)

Uwaga: momentum tutaj to ranking 6M w całym uniwersum z miesięczną rotacją, NIE reguły CEM10 (indeksy, filtry, wyjście SMA 10).

Spółek-miesięcy w ocenie: 60,000; miesięcy: 120. Rynek = równe wagi wszystkich płynnych spółek (bez kosztów).

## IC (korelacja rang prognozy i zwrotu następnego miesiąca)

| ranking   |     IC |      t |   mies. z IC > 0 |
|:----------|-------:|-------:|-----------------:|
| s_B0      | 0.0111 | 0.7001 |           0.5083 |
| s_B1      | 0.0447 | 2.4429 |           0.6    |
| s_M       | 0.0434 | 4.054  |           0.6583 |

## Portfele netto (miesięczny rebalancing, równe wagi)

obrot = średni odsetek nowych spółek w portfelu na miesiąc.

| wariant                   | ranking            | portfel     |    CAGR |   zmiennosc |   Sharpe |   maxDD |    obrot |
|:--------------------------|:-------------------|:------------|--------:|------------:|---------:|--------:|---------:|
| bez kary                  | rynek (równe wagi) | wszystkie   |  0.0731 |      0.2003 |   0.455  | -0.6029 | nan      |
| bez kary                  | s_B0               | top 10      | -0.1023 |      0.3798 |  -0.0894 | -0.8355 |   0.4908 |
| bez kary                  | s_B0               | top 50      |  0.0126 |      0.2515 |   0.1798 | -0.6499 |   0.4062 |
| bez kary                  | s_B0               | górny decyl |  0.0126 |      0.2515 |   0.1798 | -0.6499 |   0.4062 |
| bez kary                  | s_B1               | top 10      |  0.0863 |      0.1157 |   0.7758 | -0.2486 |   0.8908 |
| bez kary                  | s_B1               | top 50      |  0.0727 |      0.1143 |   0.6741 | -0.389  |   0.6938 |
| bez kary                  | s_B1               | górny decyl |  0.0727 |      0.1143 |   0.6741 | -0.389  |   0.6938 |
| bez kary                  | s_M                | top 10      |  0.0018 |      0.2614 |   0.1426 | -0.6847 |   0.8858 |
| bez kary                  | s_M                | top 50      |  0.0597 |      0.2027 |   0.3915 | -0.6268 |   0.7595 |
| bez kary                  | s_M                | górny decyl |  0.0597 |      0.2027 |   0.3915 | -0.6268 |   0.7595 |
| kara -30 % przy wycofaniu | rynek (równe wagi) | wszystkie   |  0.061  |      0.2002 |   0.3982 | -0.6124 | nan      |
| kara -30 % przy wycofaniu | s_B0               | top 10      | -0.1402 |      0.3798 |  -0.2015 | -0.8892 |   0.4908 |
| kara -30 % przy wycofaniu | s_B0               | top 50      | -0.0288 |      0.2532 |   0.0161 | -0.679  |   0.4062 |
| kara -30 % przy wycofaniu | s_B0               | górny decyl | -0.0288 |      0.2532 |   0.0161 | -0.679  |   0.4062 |
| kara -30 % przy wycofaniu | s_B1               | top 10      | -0.0132 |      0.1331 |  -0.0322 | -0.471  |   0.8908 |
| kara -30 % przy wycofaniu | s_B1               | top 50      |  0.0256 |      0.1169 |   0.276  | -0.4521 |   0.6938 |
| kara -30 % przy wycofaniu | s_B1               | górny decyl |  0.0256 |      0.1169 |   0.276  | -0.4521 |   0.6938 |
| kara -30 % przy wycofaniu | s_M                | top 10      | -0.0103 |      0.2615 |   0.0961 | -0.7038 |   0.8858 |
| kara -30 % przy wycofaniu | s_M                | top 50      |  0.047  |      0.203  |   0.3316 | -0.6354 |   0.7595 |
| kara -30 % przy wycofaniu | s_M                | górny decyl |  0.047  |      0.203  |   0.3316 | -0.6354 |   0.7595 |

## Różnica miesięcznego zwrotu netto względem momentum 6M (95 % bootstrap blokowy)

| wariant   | portfel     | ranking       |   roznica_mies | ci95          |   roznica_rocznie | lata_lepsze   |
|:----------|:------------|:--------------|---------------:|:--------------|------------------:|:--------------|
| f1        | top 10      | s_B1          |         0.0103 | -0.20…2.90 %  |            0.131  | 5/10          |
| f1        | top 10      | s_M           |         0.0059 | -0.43…2.34 %  |            0.0736 | 4/10          |
| f1        | top 10      | s_B1 vs rynek |        -0.0001 | -1.03…1.36 %  |           -0.0013 | 5/10          |
| f1        | top 10      | s_M vs rynek  |        -0.0045 | -0.98…0.29 %  |           -0.0525 | 3/10          |
| f1        | top 10      | s_B0 vs rynek |        -0.0104 | -2.45…-0.10 % |           -0.1182 | 4/10          |
| f1        | top 50      | s_B1          |         0.0027 | -0.59…1.51 %  |            0.0323 | 6/10          |
| f1        | top 50      | s_M           |         0.0028 | -0.37…1.14 %  |            0.0347 | 7/10          |
| f1        | top 50      | s_B1 vs rynek |        -0.0012 | -0.71…0.70 %  |           -0.014  | 5/10          |
| f1        | top 50      | s_M vs rynek  |        -0.001  | -0.51…0.26 %  |           -0.0117 | 4/10          |
| f1        | top 50      | s_B0 vs rynek |        -0.0038 | -1.22…0.33 %  |           -0.045  | 3/10          |
| f1        | górny decyl | s_B1          |         0.0027 | -0.49…1.47 %  |            0.0323 | 6/10          |
| f1        | górny decyl | s_M           |         0.0028 | -0.39…1.13 %  |            0.0347 | 7/10          |
| f1        | górny decyl | s_B1 vs rynek |        -0.0012 | -0.69…0.76 %  |           -0.014  | 5/10          |
| f1        | górny decyl | s_M vs rynek  |        -0.001  | -0.53…0.27 %  |           -0.0117 | 4/10          |
| f1        | górny decyl | s_B0 vs rynek |        -0.0038 | -1.21…0.34 %  |           -0.045  | 3/10          |
| f1_kara   | top 10      | s_B1          |         0.006  | -0.75…2.52 %  |            0.0747 | 5/10          |
| f1_kara   | top 10      | s_M           |         0.0085 | -0.25…2.58 %  |            0.1065 | 6/10          |
| f1_kara   | top 10      | s_B1 vs rynek |        -0.007  | -1.44…0.37 %  |           -0.0808 | 4/10          |
| f1_kara   | top 10      | s_M vs rynek  |        -0.0045 | -1.03…0.36 %  |           -0.0532 | 2/10          |
| f1_kara   | top 10      | s_B0 vs rynek |        -0.013  | -2.63…-0.34 % |           -0.1455 | 4/10          |
| f1_kara   | top 50      | s_B1          |         0.0023 | -0.56…1.46 %  |            0.0285 | 6/10          |
| f1_kara   | top 50      | s_M           |         0.0053 | -0.08…1.39 %  |            0.0651 | 7/10          |
| f1_kara   | top 50      | s_B1 vs rynek |        -0.004  | -0.96…0.38 %  |           -0.0464 | 3/10          |
| f1_kara   | top 50      | s_M vs rynek  |        -0.001  | -0.50…0.25 %  |           -0.0123 | 4/10          |
| f1_kara   | top 50      | s_B0 vs rynek |        -0.0063 | -1.48…0.07 %  |           -0.0731 | 3/10          |
| f1_kara   | górny decyl | s_B1          |         0.0023 | -0.51…1.50 %  |            0.0285 | 6/10          |
| f1_kara   | górny decyl | s_M           |         0.0053 | -0.11…1.38 %  |            0.0651 | 7/10          |
| f1_kara   | górny decyl | s_B1 vs rynek |        -0.004  | -0.96…0.38 %  |           -0.0464 | 3/10          |
| f1_kara   | górny decyl | s_M vs rynek  |        -0.001  | -0.54…0.25 %  |           -0.0123 | 4/10          |
| f1_kara   | górny decyl | s_B0 vs rynek |        -0.0063 | -1.46…0.07 %  |           -0.0731 | 3/10          |

## Zwroty roczne netto (top 50, bez kary)

|   rok |   s_B0 top 50 |   s_B1 top 50 |   s_M top 50 |   rynek |
|------:|--------------:|--------------:|-------------:|--------:|
|  2003 |         0.795 |         0.177 |        0.432 |   0.512 |
|  2004 |        -0.174 |         0.06  |        0.089 |   0.07  |
|  2005 |         0.313 |         0.108 |        0.222 |   0.173 |
|  2006 |        -0.098 |         0.116 |        0.005 |   0.071 |
|  2007 |         0.139 |        -0.002 |       -0.095 |  -0.07  |
|  2008 |        -0.53  |        -0.249 |       -0.515 |  -0.485 |
|  2009 |         0.231 |         0.123 |        0.36  |   0.468 |
|  2010 |         0.098 |         0.165 |        0.287 |   0.284 |
|  2011 |        -0.205 |         0.112 |       -0.018 |  -0.024 |
|  2012 |         0.12  |         0.199 |        0.235 |   0.132 |

## Ważność cech w LightGBM (średnie |SHAP|, w jednostkach rangi zwrotu)

| cecha      |    SHAP |
|:-----------|--------:|
| rv12       | 0.01029 |
| seria_wzr  | 0.00875 |
| rv1        | 0.00827 |
| od_max12   | 0.00745 |
| od_ath     | 0.00743 |
| r12_1      | 0.00699 |
| r36_12     | 0.00591 |
| sez_wlasna | 0.0057  |
| od_min12   | 0.00556 |
| max_d      | 0.00508 |
| r6         | 0.00485 |
| log_dv     | 0.00477 |
| vol_zm     | 0.0046  |
| zakres3    | 0.00446 |
| r12        | 0.00391 |
| r3         | 0.00378 |
| r1m        | 0.00363 |
| up_d       | 0.0035  |
| zawezenie  | 0.00254 |
