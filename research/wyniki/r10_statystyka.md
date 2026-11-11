# Etap 5b: statystyka zachowania ceny (miesiące sygnału 1998-01 ... 2012-06)

Panel: 516,363 obserwacji spółka-miesiąc, 174 miesięcy, spółki płynne. Zwroty przyszłe jako nadwyżka nad średnią przekrojową (winsoryzacja 1/99 % w miesiącu). IC = korelacja rang cechy i przyszłego zwrotu w danym miesiącu.

## A. Co przewiduje przyszły zwrot względem rynku

stabilny = q_BH < 0,05, |t_NW| > 3 i ten sam znak IC w trzech podokresach. D10_D1_mies = różnica średniego zwrotu nadwyżkowego najwyższego i najniższego decyla cechy, na miesiąc.

| cecha                                                    |   H |      IC |    t_NW |   IC_dodatnie |   D10_D1_mies |   t_spread |   IC_98_02 |   IC_03_07 |   IC_08_12 |      p |   q_BH | ten_sam_znak_3_okresy   | stabilny   |
|:---------------------------------------------------------|----:|--------:|--------:|--------------:|--------------:|-----------:|-----------:|-----------:|-----------:|-------:|-------:|:------------------------|:-----------|
| odsetek dni wzrostowych w mies.                          |  12 |  0.0505 |  4.1832 |        0.7414 |        0.0053 |     2.9725 |     0.0664 |     0.0501 |     0.0332 | 0      | 0.0021 | True                    | True       |
| największy dzienny wzrost w mies.                        |   1 | -0.052  | -3.597  |        0.3908 |       -0.0116 |    -1.3638 |    -0.0771 |    -0.0317 |    -0.0467 | 0.0003 | 0.0082 | True                    | True       |
| odsetek dni wzrostowych w mies.                          |   6 |  0.0353 |  3.5783 |        0.6724 |        0.0059 |     2.4749 |     0.055  |     0.0356 |     0.0132 | 0.0003 | 0.0082 | True                    | True       |
| największy dzienny wzrost w mies.                        |   3 | -0.0752 | -3.4476 |        0.3333 |       -0.0096 |    -1.3078 |    -0.1179 |    -0.042  |    -0.0648 | 0.0006 | 0.0082 | True                    | True       |
| największy dzienny wzrost w mies.                        |   6 | -0.1009 | -3.3153 |        0.2816 |       -0.0081 |    -1.1527 |    -0.1566 |    -0.0662 |    -0.0777 | 0.0009 | 0.0082 | True                    | True       |
| zmienność dzienna (1 mies.)                              |  12 | -0.1495 | -3.3019 |        0.2126 |       -0.0071 |    -1.0077 |    -0.201  |    -0.1277 |    -0.1165 | 0.001  | 0.0082 | True                    | True       |
| zmienność dzienna (1 mies.)                              |   6 | -0.1152 | -3.3018 |        0.2874 |       -0.0097 |    -1.2547 |    -0.1748 |    -0.0782 |    -0.0903 | 0.001  | 0.0082 | True                    | True       |
| zmienność dzienna (1 mies.)                              |   1 | -0.0551 | -3.2767 |        0.3851 |       -0.0116 |    -1.1981 |    -0.0776 |    -0.0335 |    -0.0539 | 0.0011 | 0.0082 | True                    | True       |
| największy dzienny wzrost w mies.                        |  12 | -0.1285 | -3.264  |        0.2299 |       -0.0052 |    -0.8196 |    -0.1771 |    -0.1086 |    -0.0965 | 0.0011 | 0.0082 | True                    | True       |
| zmienność dzienna (1 mies.)                              |   3 | -0.0825 | -3.2546 |        0.3333 |       -0.0108 |    -1.309  |    -0.1275 |    -0.0475 |    -0.0714 | 0.0011 | 0.0082 | True                    | True       |
| sezonowość własna (ten sam miesiąc w poprzednich latach) |   1 |  0.0168 |  3.1446 |        0.6034 |        0.0062 |     2.1635 |     0.0292 |     0.0089 |     0.0119 | 0.0017 | 0.0109 | True                    | True       |
| szerokość zakresu 3 mies.                                |   6 | -0.0744 | -2.8736 |        0.2874 |       -0.0048 |    -0.7714 |    -0.1258 |    -0.0468 |    -0.0481 | 0.0041 | 0.0244 | True                    | False      |
| odległość od rekordu wszech czasów                       |   6 |  0.0785 |  2.8273 |        0.7299 |        0.0073 |     1.1681 |     0.1224 |     0.0815 |     0.0266 | 0.0047 | 0.0255 | True                    | False      |
| odległość od rekordu wszech czasów                       |   3 |  0.0591 |  2.7839 |        0.6494 |        0.0094 |     1.4331 |     0.0993 |     0.0491 |     0.0254 | 0.0054 | 0.0255 | True                    | False      |
| szerokość zakresu 3 mies.                                |   3 | -0.0507 | -2.7835 |        0.3678 |       -0.0045 |    -0.7253 |    -0.079  |    -0.0289 |    -0.0434 | 0.0054 | 0.0255 | True                    | False      |
| szerokość zakresu 3 mies.                                |  12 | -0.1013 | -2.7661 |        0.2126 |       -0.0031 |    -0.5152 |    -0.1431 |    -0.0917 |    -0.0655 | 0.0057 | 0.0255 | True                    | False      |
| seria miesięcy wzrostowych (+) / spadkowych (-)          |  12 |  0.0366 |  2.7229 |        0.6552 |        0.0032 |     1.8375 |     0.064  |     0.0303 |     0.0131 | 0.0065 | 0.0274 | True                    | False      |
| odległość od szczytu 12 mies.                            |   6 |  0.0797 |  2.6403 |        0.7529 |        0.0104 |     1.4656 |     0.1524 |     0.065  |     0.0154 | 0.0083 | 0.032  | True                    | False      |
| odległość od rekordu wszech czasów                       |  12 |  0.0949 |  2.6318 |        0.7701 |        0.0043 |     0.8282 |     0.1195 |     0.1213 |     0.0383 | 0.0085 | 0.032  | True                    | False      |
| odległość od rekordu wszech czasów                       |   1 |  0.0384 |  2.6167 |        0.6207 |        0.0087 |     1.0349 |     0.0579 |     0.0345 |     0.0212 | 0.0089 | 0.032  | True                    | False      |
| szerokość zakresu 3 mies.                                |   1 | -0.0327 | -2.5869 |        0.4425 |       -0.0023 |    -0.2839 |    -0.0441 |    -0.0243 |    -0.0293 | 0.0097 | 0.0332 | True                    | False      |
| odległość od szczytu 12 mies.                            |   3 |  0.0563 |  2.5197 |        0.6667 |        0.0117 |     1.6498 |     0.1116 |     0.0384 |     0.0147 | 0.0117 | 0.0384 | True                    | False      |
| odsetek dni wzrostowych w mies.                          |   3 |  0.0225 |  2.4885 |        0.6034 |        0.0061 |     2.0649 |     0.0333 |     0.0161 |     0.0177 | 0.0128 | 0.0402 | True                    | False      |
| odległość od szczytu 12 mies.                            |  12 |  0.0935 |  2.3012 |        0.7874 |        0.0066 |     1.074  |     0.1459 |     0.0824 |     0.0477 | 0.0214 | 0.0641 | True                    | False      |
| seria miesięcy wzrostowych (+) / spadkowych (-)          |   6 |  0.0243 |  2.2155 |        0.6092 |        0.0041 |     1.8586 |     0.0517 |     0.021  |    -0.0027 | 0.0267 | 0.077  | False                   | False      |
| zwrot 12 mies. bez ostatniego                            |   1 |  0.0305 |  2.1975 |        0.6264 |        0.0138 |     1.7101 |     0.0638 |     0.0136 |     0.0122 | 0.028  | 0.0775 | True                    | False      |
| odległość od szczytu 12 mies.                            |   1 |  0.0339 |  2.1615 |        0.6322 |        0.0096 |     1.0511 |     0.0583 |     0.0267 |     0.0149 | 0.0307 | 0.0818 | True                    | False      |
| zwrot ostatniego miesiąca                                |  12 |  0.0272 |  2.0798 |        0.592  |        0.0047 |     1.9127 |     0.0507 |     0.0226 |     0.0062 | 0.0375 | 0.0965 | True                    | False      |
| wolumen mies. / średnia 12 mies.                         |  12 | -0.0172 | -2.0569 |        0.3908 |       -0.0001 |    -0.041  |    -0.0095 |    -0.0245 |    -0.0176 | 0.0397 | 0.0986 | True                    | False      |
| zwrot 6 mies.                                            |   6 |  0.0443 |  1.9797 |        0.7011 |        0.0117 |     1.7839 |     0.1027 |     0.0453 |    -0.0216 | 0.0477 | 0.1146 | False                   | False      |
| zwrot 12 mies.                                           |   1 |  0.0267 |  1.8583 |        0.6207 |        0.0129 |     1.4909 |     0.0563 |     0.0131 |     0.009  | 0.0631 | 0.1466 | True                    | False      |
| zwrot 3 mies.                                            |   6 |  0.028  |  1.7955 |        0.6092 |        0.0087 |     1.8303 |     0.0664 |     0.0301 |    -0.0169 | 0.0726 | 0.1585 | False                   | False      |
| zawężenie zmienności (1 mies. / 12 mies.)                |   1 | -0.0092 | -1.795  |        0.4713 |       -0.0022 |    -0.7738 |    -0.0158 |     0.0004 |    -0.0125 | 0.0727 | 0.1585 | False                   | False      |
| zwrot 3 mies.                                            |  12 |  0.0388 |  1.743  |        0.6667 |        0.007  |     1.6124 |     0.0807 |     0.0251 |     0.0074 | 0.0813 | 0.1676 | True                    | False      |
| wolumen mies. / średnia 12 mies.                         |   1 |  0.0082 |  1.7423 |        0.5172 |        0.0074 |     1.9085 |     0.0235 |     0.0064 |    -0.0067 | 0.0815 | 0.1676 | False                   | False      |
| zwrot 6 mies.                                            |   3 |  0.029  |  1.7042 |        0.5747 |        0.0127 |     1.9189 |     0.0709 |     0.0305 |    -0.0192 | 0.0883 | 0.1767 | False                   | False      |
| sezonowość własna (ten sam miesiąc w poprzednich latach) |   6 | -0.015  | -1.5752 |        0.4425 |       -0.0011 |    -0.5448 |    -0.0236 |    -0.0106 |    -0.0104 | 0.1152 | 0.2242 | True                    | False      |
| zwrot 12 mies. bez ostatniego                            |   3 |  0.0275 |  1.3968 |        0.5747 |        0.0103 |     1.5276 |     0.081  |     0.0008 |    -0.0021 | 0.1625 | 0.3079 | False                   | False      |
| zwrot ostatniego miesiąca                                |   6 |  0.0138 |  1.3576 |        0.5287 |        0.0048 |     1.6585 |     0.03   |     0.0175 |    -0.0083 | 0.1746 | 0.3223 | False                   | False      |
| zawężenie zmienności (1 mies. / 12 mies.)                |   3 | -0.0096 | -1.3407 |        0.4425 |       -0.002  |    -0.9993 |    -0.0165 |    -0.0009 |    -0.0117 | 0.18   | 0.324  | True                    | False      |
| zwrot 12 mies.                                           |   3 |  0.027  |  1.3181 |        0.5805 |        0.0101 |     1.3857 |     0.0784 |     0.0024 |    -0.0028 | 0.1875 | 0.3292 | False                   | False      |
| zwrot 6 mies.                                            |  12 |  0.04   |  1.2658 |        0.6667 |        0.0065 |     1.1018 |     0.0896 |     0.0273 |    -0.0009 | 0.2056 | 0.3525 | False                   | False      |
| wielkość (obroty)                                        |   1 | -0.0069 | -1.2515 |        0.4828 |       -0.0093 |    -3.0645 |    -0.0182 |    -0.0049 |     0.0033 | 0.2107 | 0.3529 | False                   | False      |
| wielkość (obroty)                                        |   3 | -0.0112 | -1.1713 |        0.4655 |       -0.0073 |    -2.3208 |    -0.0276 |    -0.0113 |     0.0072 | 0.2415 | 0.3952 | False                   | False      |
| zwrot 6 mies.                                            |   1 |  0.0148 |  1.1108 |        0.5862 |        0.0097 |     1.1546 |     0.0321 |     0.0199 |    -0.01   | 0.2667 | 0.4191 | False                   | False      |
| zawężenie zmienności (1 mies. / 12 mies.)                |  12 | -0.0097 | -1.1083 |        0.4023 |       -0.0004 |    -0.2962 |    -0.0188 |    -0.0053 |    -0.0045 | 0.2677 | 0.4191 | True                    | False      |
| zawężenie zmienności (1 mies. / 12 mies.)                |   6 | -0.0091 | -1.0794 |        0.4253 |       -0.0012 |    -0.6288 |    -0.0157 |    -0.0054 |    -0.006  | 0.2804 | 0.4262 | True                    | False      |
| seria miesięcy wzrostowych (+) / spadkowych (-)          |   3 |  0.011  |  1.0711 |        0.523  |        0.0033 |     1.1208 |     0.031  |     0.0061 |    -0.0058 | 0.2841 | 0.4262 | False                   | False      |
| wielkość (obroty)                                        |   6 | -0.0136 | -0.9701 |        0.4483 |       -0.0062 |    -1.7911 |    -0.0355 |    -0.0124 |     0.0092 | 0.332  | 0.4864 | False                   | False      |
| zwrot 3 mies.                                            |   3 |  0.0139 |  0.9586 |        0.5345 |        0.0085 |     1.6852 |     0.0287 |     0.0119 |    -0.0003 | 0.3378 | 0.4864 | False                   | False      |
| wolumen mies. / średnia 12 mies.                         |   6 | -0.0058 | -0.9405 |        0.4713 |        0.0013 |     0.7775 |     0.0039 |    -0.0083 |    -0.0139 | 0.3469 | 0.4898 | False                   | False      |
| wielkość (obroty)                                        |  12 | -0.0191 | -0.907  |        0.477  |       -0.005  |    -1.4753 |    -0.055  |    -0.0141 |     0.0152 | 0.3644 | 0.5046 | False                   | False      |
| sezonowość własna (ten sam miesiąc w poprzednich latach) |  12 | -0.0099 | -0.8736 |        0.4828 |       -0.0004 |    -0.269  |    -0.0241 |    -0.0077 |     0.0034 | 0.3823 | 0.5194 | False                   | False      |
| zwrot 12 mies.                                           |   6 |  0.0232 |  0.7971 |        0.6264 |        0.0063 |     0.8776 |     0.079  |     0.0059 |    -0.0196 | 0.4254 | 0.5672 | False                   | False      |
| zwrot 12 mies. bez ostatniego                            |   6 |  0.0224 |  0.7804 |        0.6379 |        0.0062 |     0.8856 |     0.0758 |     0.0018 |    -0.0139 | 0.4352 | 0.5697 | False                   | False      |
| zwrot 3 mies.                                            |   1 |  0.0079 |  0.6782 |        0.523  |        0.0046 |     0.6082 |     0.0092 |     0.0083 |     0.0061 | 0.4977 | 0.6398 | True                    | False      |
| zwrot sprzed 1-3 lat                                     |   1 |  0.0064 |  0.6554 |        0.5575 |       -0.0062 |    -1.3953 |    -0.0255 |     0.0342 |     0.0109 | 0.5122 | 0.647  | False                   | False      |
| sezonowość własna (ten sam miesiąc w poprzednich latach) |   3 | -0.0043 | -0.6331 |        0.5115 |       -0.0007 |    -0.3345 |    -0.0103 |    -0.0007 |    -0.0016 | 0.5266 | 0.6538 | True                    | False      |
| zwrot sprzed 1-3 lat                                     |  12 |  0.0176 |  0.6085 |        0.5345 |       -0.002  |    -0.5376 |    -0.0724 |     0.0886 |     0.0389 | 0.5428 | 0.6582 | False                   | False      |
| zwrot ostatniego miesiąca                                |   3 |  0.0066 |  0.6001 |        0.5287 |        0.0053 |     1.2347 |     0.0119 |     0.0055 |     0.0019 | 0.5485 | 0.6582 | True                    | False      |
| zwrot ostatniego miesiąca                                |   1 | -0.005  | -0.5007 |        0.5115 |        0      |     0.005  |    -0.0075 |    -0.0025 |    -0.005  | 0.6166 | 0.7278 | True                    | False      |
| odsetek dni wzrostowych w mies.                          |   1 |  0.0035 |  0.4593 |        0.5287 |       -0.0004 |    -0.0771 |     0.0015 |     0.0053 |     0.0035 | 0.646  | 0.7308 | True                    | False      |
| wzrost od dołka 12 mies.                                 |  12 | -0.0113 | -0.4558 |        0.5345 |        0.0052 |     1.0513 |    -0.0027 |    -0.0163 |    -0.0154 | 0.6485 | 0.7308 | True                    | False      |
| seria miesięcy wzrostowych (+) / spadkowych (-)          |   1 | -0.0038 | -0.4543 |        0.5115 |       -0.001  |    -0.235  |     0.0018 |    -0.0029 |    -0.0109 | 0.6496 | 0.7308 | False                   | False      |
| zwrot sprzed 1-3 lat                                     |   3 |  0.0057 |  0.3995 |        0.5402 |       -0.0053 |    -1.4746 |    -0.0467 |     0.0475 |     0.0175 | 0.6895 | 0.7638 | False                   | False      |
| zwrot 12 mies.                                           |  12 |  0.0128 |  0.3428 |        0.6264 |        0.0022 |     0.3672 |     0.0411 |    -0.0011 |    -0.0032 | 0.7318 | 0.7983 | False                   | False      |
| zwrot sprzed 1-3 lat                                     |   6 |  0.0055 |  0.2765 |        0.5    |       -0.0045 |    -1.2485 |    -0.0642 |     0.065  |     0.0169 | 0.7822 | 0.8288 | False                   | False      |
| zwrot 12 mies. bez ostatniego                            |  12 |  0.0101 |  0.2758 |        0.6092 |        0.0015 |     0.2806 |     0.0337 |    -0.0054 |     0.001  | 0.7827 | 0.8288 | False                   | False      |
| wzrost od dołka 12 mies.                                 |   1 | -0.0022 | -0.198  |        0.523  |        0.007  |     1.0711 |    -0.0042 |     0.0058 |    -0.0089 | 0.843  | 0.8737 | False                   | False      |
| wzrost od dołka 12 mies.                                 |   3 |  0.0027 |  0.1882 |        0.546  |        0.0092 |     1.6583 |     0.0057 |     0.0115 |    -0.0105 | 0.8507 | 0.8737 | False                   | False      |
| wolumen mies. / średnia 12 mies.                         |   3 |  0.001  |  0.1744 |        0.477  |        0.0026 |     1.0528 |     0.0107 |     0.0032 |    -0.0121 | 0.8616 | 0.8737 | False                   | False      |
| wzrost od dołka 12 mies.                                 |   6 |  0.0018 |  0.0954 |        0.569  |        0.008  |     1.5273 |     0.0162 |     0.0129 |    -0.0264 | 0.924  | 0.924  | False                   | False      |

### Tydzień do tygodnia

| cecha                     | H      |      IC |    t_NW |   IC_dodatnie |   D10_D1_okres |   t_spread |
|:--------------------------|:-------|--------:|--------:|--------------:|---------------:|-----------:|
| zwrot ostatniego tygodnia | 1 tyg. | -0.024  | -6.1159 |        0.4202 |        -0.0066 |    -6.0374 |
| zwrot ostatniego tygodnia | 4 tyg. | -0.0131 | -2.8948 |        0.4598 |        -0.0056 |    -2.0016 |

## B. Profile decylowe (0 = najniższa wartość cechy, x1 / x12 = średni zwrot nadwyżkowy za 1 / 12 mies.)

|   dec | cecha                                           |   cecha_med |      x1 |     x12 |
|------:|:------------------------------------------------|------------:|--------:|--------:|
|     0 | zwrot ostatniego miesiąca                       |     -0.1879 | -0.003  | -0.0546 |
|     1 | zwrot ostatniego miesiąca                       |     -0.0852 | -0.0009 | -0.0135 |
|     2 | zwrot ostatniego miesiąca                       |     -0.046  | -0.0004 | -0.0005 |
|     3 | zwrot ostatniego miesiąca                       |     -0.0196 |  0.0006 |  0.0087 |
|     4 | zwrot ostatniego miesiąca                       |      0.0014 |  0.0011 |  0.011  |
|     5 | zwrot ostatniego miesiąca                       |      0.0212 |  0.0029 |  0.0157 |
|     6 | zwrot ostatniego miesiąca                       |      0.044  |  0.0012 |  0.0152 |
|     7 | zwrot ostatniego miesiąca                       |      0.073  |  0.0005 |  0.0114 |
|     8 | zwrot ostatniego miesiąca                       |      0.114  | -0.0005 |  0.0142 |
|     9 | zwrot ostatniego miesiąca                       |      0.2358 | -0.0016 | -0.0037 |
|     0 | zwrot 12 mies. bez ostatniego                   |     -0.483  | -0.0091 | -0.0261 |
|     1 | zwrot 12 mies. bez ostatniego                   |     -0.227  | -0.0015 |  0.0103 |
|     2 | zwrot 12 mies. bez ostatniego                   |     -0.105  |  0.001  |  0.0159 |
|     3 | zwrot 12 mies. bez ostatniego                   |     -0.0132 |  0.001  |  0.0231 |
|     4 | zwrot 12 mies. bez ostatniego                   |      0.0687 |  0.0009 |  0.0187 |
|     5 | zwrot 12 mies. bez ostatniego                   |      0.1525 |  0.002  |  0.0208 |
|     6 | zwrot 12 mies. bez ostatniego                   |      0.2447 |  0.0029 |  0.0144 |
|     7 | zwrot 12 mies. bez ostatniego                   |      0.3622 |  0.0031 |  0.0094 |
|     8 | zwrot 12 mies. bez ostatniego                   |      0.5572 |  0.0029 |  0.0001 |
|     9 | zwrot 12 mies. bez ostatniego                   |      1.2099 |  0.0021 | -0.0204 |
|     0 | zwrot sprzed 1-3 lat                            |     -0.5635 | -0.0008 | -0.0201 |
|     1 | zwrot sprzed 1-3 lat                            |     -0.2606 |  0.001  | -0.0018 |
|     2 | zwrot sprzed 1-3 lat                            |     -0.0869 |  0.002  |  0.011  |
|     3 | zwrot sprzed 1-3 lat                            |      0.0523 |  0.0004 |  0.0105 |
|     4 | zwrot sprzed 1-3 lat                            |      0.1773 |  0.0024 |  0.0207 |
|     5 | zwrot sprzed 1-3 lat                            |      0.3102 |  0.0028 |  0.024  |
|     6 | zwrot sprzed 1-3 lat                            |      0.4725 |  0.0021 |  0.0239 |
|     7 | zwrot sprzed 1-3 lat                            |      0.6937 |  0.0021 |  0.0231 |
|     8 | zwrot sprzed 1-3 lat                            |      1.0839 |  0.0017 |  0.0206 |
|     9 | zwrot sprzed 1-3 lat                            |      2.3293 | -0.0019 |  0.0017 |
|     0 | odległość od szczytu 12 mies.                   |     -0.5625 | -0.0075 | -0.0601 |
|     1 | odległość od szczytu 12 mies.                   |     -0.3401 | -0.0009 | -0.0202 |
|     2 | odległość od szczytu 12 mies.                   |     -0.2447 | -0.002  | -0.0017 |
|     3 | odległość od szczytu 12 mies.                   |     -0.1792 | -0.0006 |  0.0083 |
|     4 | odległość od szczytu 12 mies.                   |     -0.1295 |  0.0001 |  0.0194 |
|     5 | odległość od szczytu 12 mies.                   |     -0.0888 |  0.0018 |  0.0212 |
|     6 | odległość od szczytu 12 mies.                   |     -0.0507 |  0.002  |  0.0228 |
|     7 | odległość od szczytu 12 mies.                   |     -0.0141 |  0.0044 |  0.0226 |
|     8 | odległość od szczytu 12 mies.                   |      0      |  0.0043 |  0.0243 |
|     9 | odległość od szczytu 12 mies.                   |      0      |  0.0033 |  0.0235 |
|     0 | wzrost od dołka 12 mies.                        |      0      | -0.004  | -0.0404 |
|     1 | wzrost od dołka 12 mies.                        |      0.0559 |  0.0004 | -0.0028 |
|     2 | wzrost od dołka 12 mies.                        |      0.1208 |  0.0001 |  0.0064 |
|     3 | wzrost od dołka 12 mies.                        |      0.1817 |  0.0006 |  0.0185 |
|     4 | wzrost od dołka 12 mies.                        |      0.2464 |  0.0003 |  0.0192 |
|     5 | wzrost od dołka 12 mies.                        |      0.3182 |  0.0011 |  0.0217 |
|     6 | wzrost od dołka 12 mies.                        |      0.4051 |  0.0003 |  0.0215 |
|     7 | wzrost od dołka 12 mies.                        |      0.5291 |  0.0014 |  0.0121 |
|     8 | wzrost od dołka 12 mies.                        |      0.7537 |  0.0034 |  0.0158 |
|     9 | wzrost od dołka 12 mies.                        |      1.5643 |  0.0012 | -0.0119 |
|     0 | największy dzienny wzrost w mies.               |      0.017  |  0.0039 |  0.0161 |
|     1 | największy dzienny wzrost w mies.               |      0.025  |  0.0023 |  0.0195 |
|     2 | największy dzienny wzrost w mies.               |      0.031  |  0.0024 |  0.0196 |
|     3 | największy dzienny wzrost w mies.               |      0.0369 |  0.0028 |  0.0206 |
|     4 | największy dzienny wzrost w mies.               |      0.0428 |  0.0018 |  0.0137 |
|     5 | największy dzienny wzrost w mies.               |      0.0497 |  0.0008 |  0.0094 |
|     6 | największy dzienny wzrost w mies.               |      0.058  |  0.0007 |  0.0079 |
|     7 | największy dzienny wzrost w mies.               |      0.0696 | -0.0013 | -0.0119 |
|     8 | największy dzienny wzrost w mies.               |      0.0899 | -0.0032 | -0.0242 |
|     9 | największy dzienny wzrost w mies.               |      0.162  | -0.0102 | -0.0707 |
|     0 | zawężenie zmienności (1 mies. / 12 mies.)       |      0.5405 |  0.0002 | -0.0056 |
|     1 | zawężenie zmienności (1 mies. / 12 mies.)       |      0.6795 |  0.0014 |  0.0044 |
|     2 | zawężenie zmienności (1 mies. / 12 mies.)       |      0.7554 |  0.0011 |  0.006  |
|     3 | zawężenie zmienności (1 mies. / 12 mies.)       |      0.8183 |  0.0002 |  0.0113 |
|     4 | zawężenie zmienności (1 mies. / 12 mies.)       |      0.8792 |  0.0016 |  0.0074 |
|     5 | zawężenie zmienności (1 mies. / 12 mies.)       |      0.9432 |  0.0006 |  0.0067 |
|     6 | zawężenie zmienności (1 mies. / 12 mies.)       |      1.0155 |  0.0002 |  0.009  |
|     7 | zawężenie zmienności (1 mies. / 12 mies.)       |      1.106  | -0.0001 |  0.0072 |
|     8 | zawężenie zmienności (1 mies. / 12 mies.)       |      1.2386 |  0.0001 |  0.008  |
|     9 | zawężenie zmienności (1 mies. / 12 mies.)       |      1.6134 | -0.002  | -0.01   |
|     0 | seria miesięcy wzrostowych (+) / spadkowych (-) |      0      |  0.0021 | -0.0066 |
|     1 | seria miesięcy wzrostowych (+) / spadkowych (-) |      0      | -0      | -0.0157 |
|     2 | seria miesięcy wzrostowych (+) / spadkowych (-) |      0      |  0.001  | -0.0149 |
|     3 | seria miesięcy wzrostowych (+) / spadkowych (-) |      0      | -0.0017 | -0.0122 |
|     4 | seria miesięcy wzrostowych (+) / spadkowych (-) |      1      | -0.0026 | -0.0131 |
|     5 | seria miesięcy wzrostowych (+) / spadkowych (-) |      1      | -0.0015 | -0.0054 |
|     6 | seria miesięcy wzrostowych (+) / spadkowych (-) |      1      | -0.0009 |  0.0025 |
|     7 | seria miesięcy wzrostowych (+) / spadkowych (-) |      2      | -0.0011 |  0.0167 |
|     8 | seria miesięcy wzrostowych (+) / spadkowych (-) |      2      |  0.0025 |  0.0201 |
|     9 | seria miesięcy wzrostowych (+) / spadkowych (-) |      4      |  0.0022 |  0.0284 |
|     0 | zmienność dzienna (1 mies.)                     |      0.0096 |  0.0024 |  0.0221 |
|     1 | zmienność dzienna (1 mies.)                     |      0.0134 |  0.0028 |  0.0222 |
|     2 | zmienność dzienna (1 mies.)                     |      0.0161 |  0.0029 |  0.0241 |
|     3 | zmienność dzienna (1 mies.)                     |      0.0186 |  0.0022 |  0.0218 |
|     4 | zmienność dzienna (1 mies.)                     |      0.0212 |  0.0029 |  0.0149 |
|     5 | zmienność dzienna (1 mies.)                     |      0.0242 |  0.0014 |  0.0133 |
|     6 | zmienność dzienna (1 mies.)                     |      0.0278 |  0.0017 |  0.0034 |
|     7 | zmienność dzienna (1 mies.)                     |      0.0325 |  0.0003 | -0.0042 |
|     8 | zmienność dzienna (1 mies.)                     |      0.0398 | -0.0044 | -0.0269 |
|     9 | zmienność dzienna (1 mies.)                     |      0.0635 | -0.0123 | -0.0899 |

## C. Konsolidacja: zawężenie zmienności a przyszły ruch (3 mies.)

IC zawężenia z wielkością przyszłego ruchu |x3|: 0.0257, t_NW = 3.84.

|   dec |   zawezenie_med |   ruch_abs_3m |   kierunek_3m |   zmiennosc_roczna |
|------:|----------------:|--------------:|--------------:|-------------------:|
|     0 |          0.5405 |        0.1641 |        0.0003 |             0.0291 |
|     1 |          0.6795 |        0.1608 |        0.0032 |             0.0265 |
|     2 |          0.7554 |        0.1566 |        0.0038 |             0.0257 |
|     3 |          0.8183 |        0.1543 |        0.0026 |             0.0251 |
|     4 |          0.8792 |        0.1552 |        0.0037 |             0.0247 |
|     5 |          0.9432 |        0.1556 |        0.0025 |             0.0245 |
|     6 |          1.0155 |        0.155  |        0.001  |             0.0244 |
|     7 |          1.106  |        0.1598 |        0.0001 |             0.0244 |
|     8 |          1.2386 |        0.1654 |        0.0006 |             0.0248 |
|     9 |          1.6134 |        0.1871 |       -0.006  |             0.0275 |

## D. Rynek: indeks równoważony płynnych spółek (zwrot w %, 95 % z bootstrapu blokowego 12 mies.)

| warunek                 |   n mies. | f1                 | f12                 | f3                |
|:------------------------|----------:|:-------------------|:--------------------|:------------------|
| indeks nad SMA 10 mies. |       112 | 1.23 (0.72…2.21)   | 9.55 (0.88…18.48)   | 2.13 (0.41…5.65)  |
| indeks pod SMA 10 mies. |        61 | 0.25 (-2.00…1.64)  | 14.93 (-7.34…34.05) | 3.49 (-3.88…7.37) |
| po miesiącu spadkowym   |        69 | 0.22 (-1.41…1.69)  | 12.99 (-2.33…23.99) | 3.16 (-0.31…6.09) |
| po miesiącu wzrostowym  |       104 | 1.33 (0.32…2.66)   | 10.42 (1.23…19.43)  | 2.25 (-0.54…5.64) |
| po spadku > 5 %         |        30 | -0.08 (-1.90…1.46) | 16.85 (4.37…20.74)  | 2.58 (-1.00…5.15) |
| po wzroście > 5 %       |        43 | 2.31 (0.77…3.40)   | 15.86 (0.74…27.17)  | 4.99 (0.59…7.86)  |
| wszystkie miesiące      |       173 | 0.89 (-0.16…1.93)  | 11.44 (0.78…21.83)  | 2.61 (-0.55…5.94) |

Miesiąc roku (zwrot w następnym miesiącu przypisany do miesiąca kalendarzowego; 14-15 obserwacji na miesiąc, bez wniosków):

|   miesiąc |   średni zwrot % |   n |
|----------:|-----------------:|----:|
|         1 |             1.92 |  14 |
|         2 |            -0.52 |  15 |
|         3 |             3.02 |  15 |
|         4 |             1.72 |  15 |
|         5 |            -0.17 |  15 |
|         6 |             0.06 |  15 |
|         7 |            -1.58 |  14 |
|         8 |            -0.21 |  14 |
|         9 |            -2.92 |  14 |
|        10 |             3.4  |  14 |
|        11 |             2.76 |  14 |
|        12 |             3.19 |  14 |
