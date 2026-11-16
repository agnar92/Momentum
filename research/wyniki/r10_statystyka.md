# Etap 5b: statystyka zachowania ceny (miesiące sygnału 1998-01 ... 2012-06)

Panel: 516,473 obserwacji spółka-miesiąc, 174 miesięcy, spółki płynne. Zwroty przyszłe jako nadwyżka nad średnią przekrojową (winsoryzacja 1/99 % w miesiącu). IC = korelacja rang cechy i przyszłego zwrotu w danym miesiącu.

## A. Co przewiduje przyszły zwrot względem rynku

stabilny = q_BH < 0,05, |t_NW| > 3 i ten sam znak IC w trzech podokresach. D10_D1_mies = różnica średniego zwrotu nadwyżkowego najwyższego i najniższego decyla cechy, na miesiąc.

| cecha                                                    |   H |      IC |    t_NW |   IC_dodatnie |   D10_D1_mies |   t_spread |   IC_98_02 |   IC_03_07 |   IC_08_12 |      p |   q_BH | ten_sam_znak_3_okresy   | stabilny   |
|:---------------------------------------------------------|----:|--------:|--------:|--------------:|--------------:|-----------:|-----------:|-----------:|-----------:|-------:|-------:|:------------------------|:-----------|
| odsetek dni wzrostowych w mies.                          |  12 |  0.0506 |  4.1983 |        0.7529 |        0.0053 |     2.9532 |     0.0667 |     0.0501 |     0.0332 | 0      | 0.0019 | True                    | True       |
| największy dzienny wzrost w mies.                        |   1 | -0.0521 | -3.6044 |        0.3908 |       -0.0117 |    -1.3751 |    -0.077  |    -0.0319 |    -0.0467 | 0.0003 | 0.0074 | True                    | True       |
| odsetek dni wzrostowych w mies.                          |   6 |  0.0353 |  3.5733 |        0.6667 |        0.0058 |     2.4612 |     0.0549 |     0.0357 |     0.0132 | 0.0004 | 0.0074 | True                    | True       |
| największy dzienny wzrost w mies.                        |   3 | -0.0753 | -3.4497 |        0.3333 |       -0.0096 |    -1.316  |    -0.1178 |    -0.0422 |    -0.0648 | 0.0006 | 0.0074 | True                    | True       |
| sezonowość własna (ten sam miesiąc w poprzednich latach) |   1 |  0.018  |  3.3905 |        0.592  |        0.0064 |     2.2011 |     0.0326 |     0.0088 |     0.012  | 0.0007 | 0.0074 | True                    | True       |
| największy dzienny wzrost w mies.                        |   6 | -0.1008 | -3.3098 |        0.2816 |       -0.0081 |    -1.1574 |    -0.1561 |    -0.0665 |    -0.0777 | 0.0009 | 0.0074 | True                    | True       |
| zmienność dzienna (1 mies.)                              |   6 | -0.1151 | -3.2967 |        0.2874 |       -0.0097 |    -1.2563 |    -0.1742 |    -0.0784 |    -0.0903 | 0.001  | 0.0074 | True                    | True       |
| zmienność dzienna (1 mies.)                              |  12 | -0.149  | -3.2946 |        0.2126 |       -0.007  |    -0.9905 |    -0.1995 |    -0.128  |    -0.1165 | 0.001  | 0.0074 | True                    | True       |
| zmienność dzienna (1 mies.)                              |   1 | -0.0551 | -3.2853 |        0.3851 |       -0.0117 |    -1.2115 |    -0.0777 |    -0.0337 |    -0.0539 | 0.001  | 0.0074 | True                    | True       |
| zmienność dzienna (1 mies.)                              |   3 | -0.0826 | -3.2577 |        0.3333 |       -0.0108 |    -1.3183 |    -0.1274 |    -0.0477 |    -0.0714 | 0.0011 | 0.0074 | True                    | True       |
| największy dzienny wzrost w mies.                        |  12 | -0.1281 | -3.2569 |        0.2299 |       -0.0052 |    -0.8064 |    -0.1757 |    -0.1089 |    -0.0966 | 0.0011 | 0.0074 | True                    | True       |
| szerokość zakresu 3 mies.                                |   6 | -0.0743 | -2.865  |        0.2874 |       -0.0048 |    -0.7722 |    -0.1255 |    -0.0471 |    -0.0478 | 0.0042 | 0.025  | True                    | False      |
| odległość od rekordu wszech czasów                       |   6 |  0.0781 |  2.817  |        0.7299 |        0.0072 |     1.1656 |     0.1227 |     0.0813 |     0.0249 | 0.0048 | 0.0261 | True                    | False      |
| szerokość zakresu 3 mies.                                |   3 | -0.0507 | -2.7805 |        0.3678 |       -0.0045 |    -0.7268 |    -0.0791 |    -0.029  |    -0.0431 | 0.0054 | 0.0261 | True                    | False      |
| odległość od rekordu wszech czasów                       |   3 |  0.0584 |  2.7571 |        0.6437 |        0.0094 |     1.4299 |     0.0995 |     0.0487 |     0.0235 | 0.0058 | 0.0261 | True                    | False      |
| szerokość zakresu 3 mies.                                |  12 | -0.1009 | -2.7556 |        0.2126 |       -0.0031 |    -0.5136 |    -0.142  |    -0.0919 |    -0.0652 | 0.0059 | 0.0261 | True                    | False      |
| seria miesięcy wzrostowych (+) / spadkowych (-)          |  12 |  0.0369 |  2.7389 |        0.6552 |        0.0031 |     1.8188 |     0.0646 |     0.0305 |     0.0132 | 0.0062 | 0.0261 | True                    | False      |
| odległość od szczytu 12 mies.                            |   6 |  0.0795 |  2.6286 |        0.7529 |        0.0102 |     1.4446 |     0.1522 |     0.0651 |     0.0146 | 0.0086 | 0.033  | True                    | False      |
| odległość od rekordu wszech czasów                       |  12 |  0.0944 |  2.623  |        0.7701 |        0.0042 |     0.8062 |     0.1197 |     0.1206 |     0.037  | 0.0087 | 0.033  | True                    | False      |
| odległość od rekordu wszech czasów                       |   1 |  0.038  |  2.5932 |        0.6207 |        0.0086 |     1.021  |     0.0579 |     0.0343 |     0.0201 | 0.0095 | 0.0337 | True                    | False      |
| szerokość zakresu 3 mies.                                |   1 | -0.0326 | -2.5817 |        0.4425 |       -0.0023 |    -0.2846 |    -0.044  |    -0.0244 |    -0.0291 | 0.0098 | 0.0337 | True                    | False      |
| odległość od szczytu 12 mies.                            |   3 |  0.0559 |  2.5002 |        0.6667 |        0.0114 |     1.6152 |     0.1115 |     0.0385 |     0.0136 | 0.0124 | 0.0406 | True                    | False      |
| odsetek dni wzrostowych w mies.                          |   3 |  0.0224 |  2.4782 |        0.6034 |        0.006  |     2.0434 |     0.033  |     0.0161 |     0.0176 | 0.0132 | 0.0413 | True                    | False      |
| odległość od szczytu 12 mies.                            |  12 |  0.0932 |  2.2934 |        0.7874 |        0.0064 |     1.0404 |     0.1456 |     0.0823 |     0.0471 | 0.0218 | 0.0655 | True                    | False      |
| seria miesięcy wzrostowych (+) / spadkowych (-)          |   6 |  0.0244 |  2.2182 |        0.6149 |        0.0041 |     1.8496 |     0.0519 |     0.0212 |    -0.0028 | 0.0265 | 0.0764 | False                   | False      |
| zwrot 12 mies. bez ostatniego                            |   1 |  0.0304 |  2.1844 |        0.6264 |        0.0137 |     1.6894 |     0.0639 |     0.0137 |     0.0118 | 0.0289 | 0.0801 | True                    | False      |
| odległość od szczytu 12 mies.                            |   1 |  0.0337 |  2.1449 |        0.6322 |        0.0094 |     1.0364 |     0.0583 |     0.0267 |     0.0142 | 0.032  | 0.0852 | True                    | False      |
| zwrot ostatniego miesiąca                                |  12 |  0.0273 |  2.0821 |        0.592  |        0.0047 |     1.8891 |     0.0512 |     0.0227 |     0.006  | 0.0373 | 0.096  | True                    | False      |
| wolumen mies. / średnia 12 mies.                         |  12 | -0.0173 | -2.0448 |        0.3908 |       -0.0001 |    -0.1002 |    -0.0098 |    -0.0245 |    -0.0175 | 0.0409 | 0.1015 | True                    | False      |
| zwrot 6 mies.                                            |   6 |  0.0446 |  1.9847 |        0.6897 |        0.0117 |     1.7748 |     0.1036 |     0.0455 |    -0.0219 | 0.0472 | 0.1132 | False                   | False      |
| zwrot 12 mies.                                           |   1 |  0.0265 |  1.8428 |        0.6207 |        0.0126 |     1.4616 |     0.0563 |     0.013  |     0.0085 | 0.0654 | 0.1518 | True                    | False      |
| zwrot 3 mies.                                            |   6 |  0.0281 |  1.7965 |        0.6034 |        0.0086 |     1.8154 |     0.0668 |     0.0302 |    -0.0171 | 0.0724 | 0.1629 | False                   | False      |
| zawężenie zmienności (1 mies. / 12 mies.)                |   1 | -0.0091 | -1.7723 |        0.477  |       -0.0023 |    -0.8131 |    -0.0155 |     0.0006 |    -0.0127 | 0.0763 | 0.1666 | False                   | False      |
| zwrot 3 mies.                                            |  12 |  0.039  |  1.749  |        0.6667 |        0.0069 |     1.5877 |     0.0816 |     0.0252 |     0.007  | 0.0803 | 0.17   | True                    | False      |
| wolumen mies. / średnia 12 mies.                         |   1 |  0.0082 |  1.7357 |        0.5287 |        0.0075 |     1.9279 |     0.0231 |     0.0065 |    -0.0065 | 0.0826 | 0.17   | False                   | False      |
| zwrot 6 mies.                                            |   3 |  0.0292 |  1.7117 |        0.5747 |        0.0128 |     1.9266 |     0.0716 |     0.0306 |    -0.0195 | 0.087  | 0.1739 | False                   | False      |
| sezonowość własna (ten sam miesiąc w poprzednich latach) |   6 | -0.0137 | -1.5214 |        0.4425 |       -0.0008 |    -0.3754 |    -0.0196 |    -0.0105 |    -0.0109 | 0.1282 | 0.2494 | True                    | False      |
| zwrot 12 mies. bez ostatniego                            |   3 |  0.0274 |  1.3866 |        0.5747 |        0.0101 |     1.4993 |     0.0811 |     0.0007 |    -0.0027 | 0.1656 | 0.3137 | False                   | False      |
| zwrot ostatniego miesiąca                                |   6 |  0.0138 |  1.3555 |        0.5287 |        0.0048 |     1.6365 |     0.0302 |     0.0177 |    -0.0086 | 0.1753 | 0.3236 | False                   | False      |
| zawężenie zmienności (1 mies. / 12 mies.)                |   3 | -0.0096 | -1.3273 |        0.4425 |       -0.002  |    -1.0259 |    -0.0163 |    -0.0008 |    -0.0118 | 0.1844 | 0.3319 | True                    | False      |
| zwrot 12 mies.                                           |   3 |  0.0268 |  1.3052 |        0.5862 |        0.01   |     1.3702 |     0.0786 |     0.0023 |    -0.0034 | 0.1918 | 0.3368 | False                   | False      |
| zwrot 6 mies.                                            |  12 |  0.0404 |  1.276  |        0.6667 |        0.0063 |     1.0866 |     0.0909 |     0.0274 |    -0.0013 | 0.2019 | 0.3462 | False                   | False      |
| wielkość (obroty)                                        |   1 | -0.0068 | -1.2291 |        0.4828 |       -0.0093 |    -3.0535 |    -0.0181 |    -0.0048 |     0.0034 | 0.219  | 0.3667 | False                   | False      |
| wielkość (obroty)                                        |   3 | -0.011  | -1.1599 |        0.4598 |       -0.0075 |    -2.3804 |    -0.0275 |    -0.0111 |     0.0073 | 0.2461 | 0.4027 | False                   | False      |
| zwrot 6 mies.                                            |   1 |  0.0149 |  1.1171 |        0.5862 |        0.0099 |     1.1756 |     0.0325 |     0.0199 |    -0.0102 | 0.2639 | 0.4223 | False                   | False      |
| zawężenie zmienności (1 mies. / 12 mies.)                |  12 | -0.0097 | -1.102  |        0.4023 |       -0.0004 |    -0.3129 |    -0.0188 |    -0.0052 |    -0.0046 | 0.2704 | 0.4233 | True                    | False      |
| seria miesięcy wzrostowych (+) / spadkowych (-)          |   3 |  0.011  |  1.071  |        0.523  |        0.0033 |     1.1111 |     0.031  |     0.0062 |    -0.0059 | 0.2842 | 0.435  | False                   | False      |
| zawężenie zmienności (1 mies. / 12 mies.)                |   6 | -0.0089 | -1.058  |        0.4253 |       -0.0012 |    -0.6516 |    -0.0151 |    -0.0053 |    -0.0062 | 0.29   | 0.435  | True                    | False      |
| wolumen mies. / średnia 12 mies.                         |   6 | -0.006  | -0.9674 |        0.4713 |        0.001  |     0.6718 |     0.0035 |    -0.0083 |    -0.0138 | 0.3333 | 0.4848 | False                   | False      |
| zwrot 3 mies.                                            |   3 |  0.0138 |  0.9502 |        0.5287 |        0.0084 |     1.6602 |     0.0288 |     0.0118 |    -0.0006 | 0.342  | 0.4848 | False                   | False      |
| wielkość (obroty)                                        |   6 | -0.0133 | -0.9475 |        0.454  |       -0.0063 |    -1.8309 |    -0.0348 |    -0.0122 |     0.0093 | 0.3434 | 0.4848 | False                   | False      |
| wielkość (obroty)                                        |  12 | -0.0183 | -0.8718 |        0.4828 |       -0.005  |    -1.4819 |    -0.0531 |    -0.0136 |     0.0153 | 0.3833 | 0.5307 | False                   | False      |
| sezonowość własna (ten sam miesiąc w poprzednich latach) |  12 | -0.0087 | -0.8207 |        0.4828 |       -0.0002 |    -0.1152 |    -0.0199 |    -0.0077 |     0.0028 | 0.4118 | 0.5595 | False                   | False      |
| zwrot 12 mies.                                           |   6 |  0.0233 |  0.7978 |        0.6264 |        0.0062 |     0.8655 |     0.0798 |     0.0057 |    -0.0201 | 0.425  | 0.5663 | False                   | False      |
| zwrot 12 mies. bez ostatniego                            |   6 |  0.0226 |  0.7848 |        0.6322 |        0.006  |     0.8676 |     0.0768 |     0.0017 |    -0.0144 | 0.4326 | 0.5663 | False                   | False      |
| zwrot sprzed 1-3 lat                                     |   1 |  0.007  |  0.7241 |        0.5575 |       -0.0056 |    -1.2574 |    -0.0232 |     0.0341 |     0.0105 | 0.469  | 0.5968 | False                   | False      |
| zwrot sprzed 1-3 lat                                     |  12 |  0.0202 |  0.7185 |        0.5345 |       -0.0014 |    -0.389  |    -0.0637 |     0.0876 |     0.0385 | 0.4725 | 0.5968 | False                   | False      |
| zwrot 3 mies.                                            |   1 |  0.0078 |  0.6678 |        0.5172 |        0.0046 |     0.5979 |     0.0092 |     0.0081 |     0.006  | 0.5042 | 0.626  | True                    | False      |
| sezonowość własna (ten sam miesiąc w poprzednich latach) |   3 | -0.0039 | -0.6105 |        0.5057 |       -0.0008 |    -0.3862 |    -0.0086 |    -0.0008 |    -0.0022 | 0.5416 | 0.6609 | True                    | False      |
| zwrot ostatniego miesiąca                                |   3 |  0.0066 |  0.5966 |        0.5345 |        0.0052 |     1.2155 |     0.012  |     0.0055 |     0.0017 | 0.5508 | 0.6609 | True                    | False      |
| zwrot sprzed 1-3 lat                                     |   3 |  0.0071 |  0.5006 |        0.5402 |       -0.0049 |    -1.3798 |    -0.0421 |     0.0472 |     0.0171 | 0.6167 | 0.7241 | False                   | False      |
| zwrot ostatniego miesiąca                                |   1 | -0.0049 | -0.4909 |        0.4943 |        0.0001 |     0.0098 |    -0.0072 |    -0.0026 |    -0.0051 | 0.6235 | 0.7241 | True                    | False      |
| odsetek dni wzrostowych w mies.                          |   1 |  0.0035 |  0.4596 |        0.5287 |       -0.0004 |    -0.0879 |     0.0015 |     0.0054 |     0.0035 | 0.6458 | 0.7381 | True                    | False      |
| seria miesięcy wzrostowych (+) / spadkowych (-)          |   1 | -0.0037 | -0.4447 |        0.5115 |       -0.001  |    -0.2456 |     0.0021 |    -0.0029 |    -0.011  | 0.6565 | 0.7386 | False                   | False      |
| wzrost od dołka 12 mies.                                 |  12 | -0.0106 | -0.4287 |        0.5402 |        0.0052 |     1.0585 |    -0.0011 |    -0.0161 |    -0.0152 | 0.6681 | 0.7401 | True                    | False      |
| zwrot sprzed 1-3 lat                                     |   6 |  0.0076 |  0.3866 |        0.4885 |       -0.0039 |    -1.1288 |    -0.0577 |     0.0646 |     0.0167 | 0.699  | 0.7626 | False                   | False      |
| zwrot 12 mies.                                           |  12 |  0.0131 |  0.3521 |        0.6207 |        0.002  |     0.3505 |     0.0428 |    -0.0016 |    -0.0035 | 0.7248 | 0.7789 | False                   | False      |
| zwrot 12 mies. bez ostatniego                            |  12 |  0.0104 |  0.2855 |        0.6149 |        0.0014 |     0.2527 |     0.0352 |    -0.0059 |     0.0008 | 0.7753 | 0.8209 | False                   | False      |
| wzrost od dołka 12 mies.                                 |   1 | -0.0023 | -0.2047 |        0.523  |        0.007  |     1.0652 |    -0.0046 |     0.006  |    -0.0088 | 0.8378 | 0.8742 | False                   | False      |
| wzrost od dołka 12 mies.                                 |   3 |  0.0026 |  0.1852 |        0.546  |        0.0093 |     1.6606 |     0.0051 |     0.0118 |    -0.0104 | 0.853  | 0.8774 | False                   | False      |
| wolumen mies. / średnia 12 mies.                         |   3 |  0.0009 |  0.1563 |        0.4885 |        0.0025 |     0.9977 |     0.01   |     0.0033 |    -0.0118 | 0.8758 | 0.8881 | False                   | False      |
| wzrost od dołka 12 mies.                                 |   6 |  0.0021 |  0.1071 |        0.569  |        0.0081 |     1.527  |     0.0163 |     0.0134 |    -0.0263 | 0.9147 | 0.9147 | False                   | False      |

### Tydzień do tygodnia

| cecha                     | H      |      IC |    t_NW |   IC_dodatnie |   D10_D1_okres |   t_spread |
|:--------------------------|:-------|--------:|--------:|--------------:|---------------:|-----------:|
| zwrot ostatniego tygodnia | 1 tyg. | -0.024  | -6.1128 |        0.4202 |        -0.0066 |    -6.0369 |
| zwrot ostatniego tygodnia | 4 tyg. | -0.0131 | -2.8866 |        0.4598 |        -0.0056 |    -1.9969 |

## B. Profile decylowe (0 = najniższa wartość cechy, x1 / x12 = średni zwrot nadwyżkowy za 1 / 12 mies.)

|   dec | cecha                                           |   cecha_med |      x1 |     x12 |
|------:|:------------------------------------------------|------------:|--------:|--------:|
|     0 | zwrot ostatniego miesiąca                       |     -0.1877 | -0.003  | -0.0538 |
|     1 | zwrot ostatniego miesiąca                       |     -0.0851 | -0.001  | -0.0133 |
|     2 | zwrot ostatniego miesiąca                       |     -0.046  | -0.0004 | -0.0009 |
|     3 | zwrot ostatniego miesiąca                       |     -0.0196 |  0.0006 |  0.0086 |
|     4 | zwrot ostatniego miesiąca                       |      0.0014 |  0.0012 |  0.011  |
|     5 | zwrot ostatniego miesiąca                       |      0.0212 |  0.0029 |  0.0156 |
|     6 | zwrot ostatniego miesiąca                       |      0.044  |  0.0012 |  0.0151 |
|     7 | zwrot ostatniego miesiąca                       |      0.073  |  0.0006 |  0.0114 |
|     8 | zwrot ostatniego miesiąca                       |      0.114  | -0.0006 |  0.0138 |
|     9 | zwrot ostatniego miesiąca                       |      0.2357 | -0.0015 | -0.0033 |
|     0 | zwrot 12 mies. bez ostatniego                   |     -0.4809 | -0.009  | -0.0251 |
|     1 | zwrot 12 mies. bez ostatniego                   |     -0.2266 | -0.0014 |  0.011  |
|     2 | zwrot 12 mies. bez ostatniego                   |     -0.1047 |  0.0011 |  0.0159 |
|     3 | zwrot 12 mies. bez ostatniego                   |     -0.0133 |  0.001  |  0.0233 |
|     4 | zwrot 12 mies. bez ostatniego                   |      0.0686 |  0.0009 |  0.0188 |
|     5 | zwrot 12 mies. bez ostatniego                   |      0.1522 |  0.002  |  0.0213 |
|     6 | zwrot 12 mies. bez ostatniego                   |      0.2444 |  0.0031 |  0.0149 |
|     7 | zwrot 12 mies. bez ostatniego                   |      0.3615 |  0.0031 |  0.0092 |
|     8 | zwrot 12 mies. bez ostatniego                   |      0.5554 |  0.0029 |  0.0005 |
|     9 | zwrot 12 mies. bez ostatniego                   |      1.203  |  0.0021 | -0.0205 |
|     0 | zwrot sprzed 1-3 lat                            |     -0.5587 | -0.0008 | -0.02   |
|     1 | zwrot sprzed 1-3 lat                            |     -0.2589 |  0.0013 | -0.0015 |
|     2 | zwrot sprzed 1-3 lat                            |     -0.0859 |  0.0019 |  0.0111 |
|     3 | zwrot sprzed 1-3 lat                            |      0.0525 |  0.0005 |  0.0101 |
|     4 | zwrot sprzed 1-3 lat                            |      0.1768 |  0.0023 |  0.0208 |
|     5 | zwrot sprzed 1-3 lat                            |      0.3089 |  0.0028 |  0.0236 |
|     6 | zwrot sprzed 1-3 lat                            |      0.4681 |  0.0022 |  0.0243 |
|     7 | zwrot sprzed 1-3 lat                            |      0.6863 |  0.002  |  0.0224 |
|     8 | zwrot sprzed 1-3 lat                            |      1.0708 |  0.0018 |  0.0219 |
|     9 | zwrot sprzed 1-3 lat                            |      2.2891 | -0.0016 |  0.0046 |
|     0 | odległość od szczytu 12 mies.                   |     -0.5602 | -0.0072 | -0.0582 |
|     1 | odległość od szczytu 12 mies.                   |     -0.3389 | -0.0008 | -0.0192 |
|     2 | odległość od szczytu 12 mies.                   |     -0.244  | -0.002  | -0.0016 |
|     3 | odległość od szczytu 12 mies.                   |     -0.1786 | -0.0005 |  0.009  |
|     4 | odległość od szczytu 12 mies.                   |     -0.1292 |  0.0002 |  0.0197 |
|     5 | odległość od szczytu 12 mies.                   |     -0.0885 |  0.0017 |  0.0215 |
|     6 | odległość od szczytu 12 mies.                   |     -0.0505 |  0.0021 |  0.0223 |
|     7 | odległość od szczytu 12 mies.                   |     -0.014  |  0.0045 |  0.0226 |
|     8 | odległość od szczytu 12 mies.                   |      0      |  0.0042 |  0.0241 |
|     9 | odległość od szczytu 12 mies.                   |      0      |  0.0034 |  0.0231 |
|     0 | wzrost od dołka 12 mies.                        |      0      | -0.0039 | -0.0402 |
|     1 | wzrost od dołka 12 mies.                        |      0.0559 |  0.0006 | -0.0022 |
|     2 | wzrost od dołka 12 mies.                        |      0.1206 |  0.0003 |  0.0065 |
|     3 | wzrost od dołka 12 mies.                        |      0.1815 |  0.0007 |  0.0188 |
|     4 | wzrost od dołka 12 mies.                        |      0.2462 |  0.0004 |  0.0193 |
|     5 | wzrost od dołka 12 mies.                        |      0.3178 |  0.0009 |  0.0222 |
|     6 | wzrost od dołka 12 mies.                        |      0.4046 |  0.0005 |  0.0221 |
|     7 | wzrost od dołka 12 mies.                        |      0.5278 |  0.0013 |  0.0128 |
|     8 | wzrost od dołka 12 mies.                        |      0.7515 |  0.0034 |  0.0151 |
|     9 | wzrost od dołka 12 mies.                        |      1.5531 |  0.0014 | -0.0112 |
|     0 | największy dzienny wzrost w mies.               |      0.017  |  0.0039 |  0.0162 |
|     1 | największy dzienny wzrost w mies.               |      0.025  |  0.0023 |  0.0195 |
|     2 | największy dzienny wzrost w mies.               |      0.031  |  0.0024 |  0.0195 |
|     3 | największy dzienny wzrost w mies.               |      0.0369 |  0.0028 |  0.0204 |
|     4 | największy dzienny wzrost w mies.               |      0.0428 |  0.0018 |  0.0139 |
|     5 | największy dzienny wzrost w mies.               |      0.0497 |  0.0009 |  0.0088 |
|     6 | największy dzienny wzrost w mies.               |      0.058  |  0.0006 |  0.0074 |
|     7 | największy dzienny wzrost w mies.               |      0.0696 | -0.0013 | -0.0116 |
|     8 | największy dzienny wzrost w mies.               |      0.0899 | -0.0032 | -0.0244 |
|     9 | największy dzienny wzrost w mies.               |      0.1622 | -0.0102 | -0.0697 |
|     0 | zawężenie zmienności (1 mies. / 12 mies.)       |      0.5411 |  0.0002 | -0.0052 |
|     1 | zawężenie zmienności (1 mies. / 12 mies.)       |      0.6797 |  0.0013 |  0.0044 |
|     2 | zawężenie zmienności (1 mies. / 12 mies.)       |      0.7556 |  0.0011 |  0.0068 |
|     3 | zawężenie zmienności (1 mies. / 12 mies.)       |      0.8184 |  0.0003 |  0.0114 |
|     4 | zawężenie zmienności (1 mies. / 12 mies.)       |      0.8793 |  0.0016 |  0.0079 |
|     5 | zawężenie zmienności (1 mies. / 12 mies.)       |      0.9434 |  0.0007 |  0.0062 |
|     6 | zawężenie zmienności (1 mies. / 12 mies.)       |      1.0157 |  0      |  0.0088 |
|     7 | zawężenie zmienności (1 mies. / 12 mies.)       |      1.1062 |  0.0001 |  0.0076 |
|     8 | zawężenie zmienności (1 mies. / 12 mies.)       |      1.2387 |  0.0004 |  0.0084 |
|     9 | zawężenie zmienności (1 mies. / 12 mies.)       |      1.6131 | -0.002  | -0.0098 |
|     0 | seria miesięcy wzrostowych (+) / spadkowych (-) |      0      |  0.0021 | -0.0068 |
|     1 | seria miesięcy wzrostowych (+) / spadkowych (-) |      0      | -0.0001 | -0.0158 |
|     2 | seria miesięcy wzrostowych (+) / spadkowych (-) |      0      |  0.001  | -0.0147 |
|     3 | seria miesięcy wzrostowych (+) / spadkowych (-) |      0      | -0.0016 | -0.012  |
|     4 | seria miesięcy wzrostowych (+) / spadkowych (-) |      1      | -0.0027 | -0.0134 |
|     5 | seria miesięcy wzrostowych (+) / spadkowych (-) |      1      | -0.0015 | -0.0054 |
|     6 | seria miesięcy wzrostowych (+) / spadkowych (-) |      1      | -0.0009 |  0.0025 |
|     7 | seria miesięcy wzrostowych (+) / spadkowych (-) |      2      | -0.001  |  0.017  |
|     8 | seria miesięcy wzrostowych (+) / spadkowych (-) |      2      |  0.0025 |  0.0207 |
|     9 | seria miesięcy wzrostowych (+) / spadkowych (-) |      4      |  0.0021 |  0.0279 |
|     0 | zmienność dzienna (1 mies.)                     |      0.0096 |  0.0025 |  0.0221 |
|     1 | zmienność dzienna (1 mies.)                     |      0.0134 |  0.0028 |  0.0221 |
|     2 | zmienność dzienna (1 mies.)                     |      0.0161 |  0.0029 |  0.0239 |
|     3 | zmienność dzienna (1 mies.)                     |      0.0186 |  0.0022 |  0.0219 |
|     4 | zmienność dzienna (1 mies.)                     |      0.0212 |  0.0029 |  0.0148 |
|     5 | zmienność dzienna (1 mies.)                     |      0.0242 |  0.0014 |  0.0131 |
|     6 | zmienność dzienna (1 mies.)                     |      0.0278 |  0.0018 |  0.003  |
|     7 | zmienność dzienna (1 mies.)                     |      0.0326 |  0.0002 | -0.0041 |
|     8 | zmienność dzienna (1 mies.)                     |      0.0398 | -0.0045 | -0.0272 |
|     9 | zmienność dzienna (1 mies.)                     |      0.0636 | -0.0123 | -0.0887 |

## C. Konsolidacja: zawężenie zmienności a przyszły ruch (3 mies.)

IC zawężenia z wielkością przyszłego ruchu |x3|: 0.0255, t_NW = 3.81.

|   dec |   zawezenie_med |   ruch_abs_3m |   kierunek_3m |   zmiennosc_roczna |
|------:|----------------:|--------------:|--------------:|-------------------:|
|     0 |          0.5411 |        0.1636 |        0.0004 |             0.029  |
|     1 |          0.6797 |        0.1603 |        0.0029 |             0.0265 |
|     2 |          0.7556 |        0.1562 |        0.0041 |             0.0257 |
|     3 |          0.8184 |        0.154  |        0.0028 |             0.0251 |
|     4 |          0.8793 |        0.1548 |        0.0037 |             0.0247 |
|     5 |          0.9434 |        0.1553 |        0.0027 |             0.0245 |
|     6 |          1.0157 |        0.1547 |        0.0009 |             0.0244 |
|     7 |          1.1062 |        0.1592 |        0.0004 |             0.0244 |
|     8 |          1.2387 |        0.165  |        0.001  |             0.0248 |
|     9 |          1.6131 |        0.1863 |       -0.006  |             0.0275 |

## D. Rynek: indeks równoważony płynnych spółek (zwrot w %, 95 % z bootstrapu blokowego 12 mies.)

| warunek                 |   n mies. | f1                | f12                 | f3                |
|:------------------------|----------:|:------------------|:--------------------|:------------------|
| indeks nad SMA 10 mies. |       112 | 1.22 (0.71…2.19)  | 9.46 (0.83…18.35)   | 2.12 (0.38…5.63)  |
| indeks pod SMA 10 mies. |        61 | 0.25 (-2.00…1.64) | 14.92 (-7.34…34.06) | 3.48 (-3.89…7.37) |
| po miesiącu spadkowym   |        69 | 0.21 (-1.42…1.69) | 12.95 (-2.37…23.90) | 3.14 (-0.32…6.07) |
| po miesiącu wzrostowym  |       104 | 1.32 (0.32…2.65)  | 10.34 (1.20…19.35)  | 2.24 (-0.56…5.62) |
| po spadku > 5 %         |        31 | 0.14 (-1.61…1.87) | 17.37 (4.96…20.73)  | 3.02 (0.04…5.98)  |
| po wzroście > 5 %       |        43 | 2.30 (0.77…3.39)  | 15.77 (0.63…27.10)  | 4.97 (0.57…7.85)  |
| wszystkie miesiące      |       173 | 0.88 (-0.16…1.92) | 11.38 (0.74…21.75)  | 2.60 (-0.56…5.92) |

Miesiąc roku (zwrot w następnym miesiącu przypisany do miesiąca kalendarzowego; 14-15 obserwacji na miesiąc, bez wniosków):

|   miesiąc |   średni zwrot % |   n |
|----------:|-----------------:|----:|
|         1 |             1.91 |  14 |
|         2 |            -0.53 |  15 |
|         3 |             3.01 |  15 |
|         4 |             1.71 |  15 |
|         5 |            -0.18 |  15 |
|         6 |             0.06 |  15 |
|         7 |            -1.58 |  14 |
|         8 |            -0.21 |  14 |
|         9 |            -2.93 |  14 |
|        10 |             3.39 |  14 |
|        11 |             2.75 |  14 |
|        12 |             3.19 |  14 |
