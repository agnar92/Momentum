# Etap 5b: statystyka zachowania ceny (miesiące sygnału 1998-01 ... 2012-06)

Panel: 516,267 obserwacji spółka-miesiąc, 174 miesięcy, spółki płynne. Zwroty przyszłe jako nadwyżka nad średnią przekrojową (winsoryzacja 1/99 % w miesiącu). IC = korelacja rang cechy i przyszłego zwrotu w danym miesiącu.

## A. Co przewiduje przyszły zwrot względem rynku

stabilny = q_BH < 0,05, |t_NW| > 3 i ten sam znak IC w trzech podokresach. D10_D1_mies = różnica średniego zwrotu nadwyżkowego najwyższego i najniższego decyla cechy, na miesiąc.

| cecha                                                    |   H |      IC |    t_NW |   IC_dodatnie |   D10_D1_mies |   t_spread |   IC_98_02 |   IC_03_07 |   IC_08_12 |      p |   q_BH | ten_sam_znak_3_okresy   | stabilny   |
|:---------------------------------------------------------|----:|--------:|--------:|--------------:|--------------:|-----------:|-----------:|-----------:|-----------:|-------:|-------:|:------------------------|:-----------|
| odsetek dni wzrostowych w mies.                          |  12 |  0.0507 |  4.1794 |        0.7471 |        0.0054 |     3.017  |     0.0669 |     0.0501 |     0.0335 | 0      | 0.0021 | True                    | True       |
| odsetek dni wzrostowych w mies.                          |   6 |  0.0355 |  3.6042 |        0.6782 |        0.006  |     2.5244 |     0.0552 |     0.0357 |     0.0135 | 0.0003 | 0.0078 | True                    | True       |
| największy dzienny wzrost w mies.                        |   1 | -0.052  | -3.5931 |        0.3908 |       -0.0117 |    -1.3752 |    -0.077  |    -0.0317 |    -0.0468 | 0.0003 | 0.0078 | True                    | True       |
| największy dzienny wzrost w mies.                        |   3 | -0.0753 | -3.4493 |        0.3333 |       -0.0097 |    -1.3331 |    -0.1176 |    -0.0421 |    -0.065  | 0.0006 | 0.0081 | True                    | True       |
| największy dzienny wzrost w mies.                        |   6 | -0.1009 | -3.3181 |        0.2816 |       -0.0082 |    -1.1747 |    -0.156  |    -0.0664 |    -0.078  | 0.0009 | 0.0081 | True                    | True       |
| zmienność dzienna (1 mies.)                              |   6 | -0.1153 | -3.3039 |        0.2874 |       -0.0099 |    -1.2799 |    -0.1744 |    -0.0782 |    -0.0907 | 0.001  | 0.0081 | True                    | True       |
| zmienność dzienna (1 mies.)                              |  12 | -0.1494 | -3.3037 |        0.2126 |       -0.0073 |    -1.0351 |    -0.2001 |    -0.1278 |    -0.1171 | 0.001  | 0.0081 | True                    | True       |
| zmienność dzienna (1 mies.)                              |   1 | -0.0551 | -3.2754 |        0.3851 |       -0.0117 |    -1.2077 |    -0.0777 |    -0.0335 |    -0.0541 | 0.0011 | 0.0081 | True                    | True       |
| największy dzienny wzrost w mies.                        |  12 | -0.1284 | -3.2659 |        0.2299 |       -0.0054 |    -0.8415 |    -0.176  |    -0.1088 |    -0.0972 | 0.0011 | 0.0081 | True                    | True       |
| zmienność dzienna (1 mies.)                              |   3 | -0.0826 | -3.2577 |        0.3333 |       -0.011  |    -1.3285 |    -0.1274 |    -0.0476 |    -0.0718 | 0.0011 | 0.0081 | True                    | True       |
| sezonowość własna (ten sam miesiąc w poprzednich latach) |   1 |  0.0168 |  3.1511 |        0.6034 |        0.0062 |     2.1092 |     0.0295 |     0.0086 |     0.0118 | 0.0016 | 0.0106 | True                    | True       |
| szerokość zakresu 3 mies.                                |   6 | -0.0743 | -2.8733 |        0.2874 |       -0.0049 |    -0.7881 |    -0.1251 |    -0.047  |    -0.0483 | 0.0041 | 0.0244 | True                    | False      |
| odległość od rekordu wszech czasów                       |   6 |  0.0775 |  2.8224 |        0.7299 |        0.007  |     1.1678 |     0.1209 |     0.0789 |     0.0277 | 0.0048 | 0.0259 | True                    | False      |
| szerokość zakresu 3 mies.                                |   3 | -0.0506 | -2.7825 |        0.3678 |       -0.0046 |    -0.7423 |    -0.0784 |    -0.0291 |    -0.0437 | 0.0054 | 0.0259 | True                    | False      |
| odległość od rekordu wszech czasów                       |   3 |  0.0582 |  2.7722 |        0.6494 |        0.0092 |     1.4298 |     0.098  |     0.0471 |     0.0262 | 0.0056 | 0.0259 | True                    | False      |
| szerokość zakresu 3 mies.                                |  12 | -0.101  | -2.7618 |        0.2126 |       -0.0032 |    -0.5287 |    -0.1419 |    -0.0918 |    -0.0658 | 0.0057 | 0.0259 | True                    | False      |
| seria miesięcy wzrostowych (+) / spadkowych (-)          |  12 |  0.0364 |  2.7097 |        0.6552 |        0.0031 |     1.8219 |     0.0636 |     0.0298 |     0.0135 | 0.0067 | 0.0285 | True                    | False      |
| odległość od szczytu 12 mies.                            |   6 |  0.0797 |  2.6452 |        0.7586 |        0.0104 |     1.4742 |     0.1513 |     0.065  |     0.0163 | 0.0082 | 0.0326 | True                    | False      |
| odległość od rekordu wszech czasów                       |  12 |  0.0934 |  2.6202 |        0.7701 |        0.0042 |     0.8245 |     0.1179 |     0.1182 |     0.0388 | 0.0088 | 0.0326 | True                    | False      |
| odległość od rekordu wszech czasów                       |   1 |  0.0379 |  2.6101 |        0.6207 |        0.0082 |     0.9974 |     0.0572 |     0.0335 |     0.0214 | 0.0091 | 0.0326 | True                    | False      |
| szerokość zakresu 3 mies.                                |   1 | -0.0327 | -2.5879 |        0.4425 |       -0.0023 |    -0.2907 |    -0.044  |    -0.0244 |    -0.0294 | 0.0097 | 0.0331 | True                    | False      |
| odległość od szczytu 12 mies.                            |   3 |  0.0562 |  2.5198 |        0.6667 |        0.0116 |     1.6502 |     0.1108 |     0.0385 |     0.0151 | 0.0117 | 0.0384 | True                    | False      |
| odsetek dni wzrostowych w mies.                          |   3 |  0.0226 |  2.4978 |        0.6034 |        0.0061 |     2.0856 |     0.0332 |     0.0162 |     0.0178 | 0.0125 | 0.0391 | True                    | False      |
| odległość od szczytu 12 mies.                            |  12 |  0.0933 |  2.2995 |        0.7874 |        0.0066 |     1.0835 |     0.1446 |     0.0822 |     0.0486 | 0.0215 | 0.0644 | True                    | False      |
| seria miesięcy wzrostowych (+) / spadkowych (-)          |   6 |  0.024  |  2.2006 |        0.6149 |        0.004  |     1.8484 |     0.0513 |     0.0206 |    -0.0024 | 0.0278 | 0.0792 | False                   | False      |
| zwrot 12 mies. bez ostatniego                            |   1 |  0.0303 |  2.1889 |        0.6264 |        0.0137 |     1.7018 |     0.0633 |     0.0136 |     0.0123 | 0.0286 | 0.0792 | True                    | False      |
| odległość od szczytu 12 mies.                            |   1 |  0.0339 |  2.1609 |        0.6322 |        0.0095 |     1.0496 |     0.058  |     0.0265 |     0.0152 | 0.0307 | 0.0819 | True                    | False      |
| zwrot ostatniego miesiąca                                |  12 |  0.0271 |  2.0711 |        0.592  |        0.0048 |     1.9261 |     0.0505 |     0.0225 |     0.0062 | 0.0384 | 0.0982 | True                    | False      |
| wolumen mies. / średnia 12 mies.                         |  12 | -0.0171 | -2.0585 |        0.3908 |       -0.0001 |    -0.077  |    -0.0092 |    -0.0251 |    -0.0171 | 0.0395 | 0.0982 | True                    | False      |
| zwrot 6 mies.                                            |   6 |  0.0441 |  1.9764 |        0.6954 |        0.0118 |     1.7909 |     0.1017 |     0.0452 |    -0.0212 | 0.0481 | 0.1155 | False                   | False      |
| zwrot 12 mies.                                           |   1 |  0.0266 |  1.8527 |        0.6207 |        0.0129 |     1.4935 |     0.0558 |     0.013  |     0.0091 | 0.0639 | 0.1485 | True                    | False      |
| zwrot 3 mies.                                            |   6 |  0.028  |  1.7988 |        0.6034 |        0.0087 |     1.8408 |     0.0662 |     0.03   |    -0.0166 | 0.0721 | 0.1621 | False                   | False      |
| zawężenie zmienności (1 mies. / 12 mies.)                |   1 | -0.0091 | -1.7845 |        0.4828 |       -0.0022 |    -0.7889 |    -0.0158 |     0.0004 |    -0.0124 | 0.0743 | 0.1622 | False                   | False      |
| zwrot 3 mies.                                            |  12 |  0.0386 |  1.7388 |        0.6667 |        0.007  |     1.618  |     0.0802 |     0.025  |     0.0075 | 0.0821 | 0.1738 | True                    | False      |
| wolumen mies. / średnia 12 mies.                         |   1 |  0.0081 |  1.7171 |        0.5172 |        0.0074 |     1.8837 |     0.0234 |     0.0062 |    -0.0068 | 0.086  | 0.1768 | False                   | False      |
| zwrot 6 mies.                                            |   3 |  0.0289 |  1.7008 |        0.5805 |        0.0128 |     1.926  |     0.0702 |     0.0306 |    -0.0189 | 0.089  | 0.1779 | False                   | False      |
| sezonowość własna (ten sam miesiąc w poprzednich latach) |   6 | -0.0151 | -1.5784 |        0.454  |       -0.0012 |    -0.5591 |    -0.0234 |    -0.011  |    -0.0106 | 0.1145 | 0.2228 | True                    | False      |
| zwrot 12 mies. bez ostatniego                            |   3 |  0.0273 |  1.391  |        0.5747 |        0.0103 |     1.5331 |     0.08   |     0.0008 |    -0.0018 | 0.1642 | 0.3112 | False                   | False      |
| zwrot ostatniego miesiąca                                |   6 |  0.0138 |  1.3585 |        0.5287 |        0.0049 |     1.6715 |     0.03   |     0.0174 |    -0.0082 | 0.1743 | 0.3218 | False                   | False      |
| zawężenie zmienności (1 mies. / 12 mies.)                |   3 | -0.0095 | -1.3175 |        0.4483 |       -0.002  |    -0.986  |    -0.0161 |    -0.001  |    -0.0115 | 0.1877 | 0.3316 | True                    | False      |
| zwrot 12 mies.                                           |   3 |  0.0268 |  1.3141 |        0.5805 |        0.0101 |     1.394  |     0.0776 |     0.0024 |    -0.0024 | 0.1888 | 0.3316 | False                   | False      |
| wielkość (obroty)                                        |   1 | -0.0071 | -1.2853 |        0.4828 |       -0.0095 |    -3.1066 |    -0.0184 |    -0.0052 |     0.0032 | 0.1987 | 0.3406 | False                   | False      |
| zwrot 6 mies.                                            |  12 |  0.0396 |  1.2572 |        0.6667 |        0.0065 |     1.109  |     0.0884 |     0.027  |    -0.0006 | 0.2087 | 0.3494 | False                   | False      |
| wielkość (obroty)                                        |   3 | -0.0117 | -1.2312 |        0.4655 |       -0.0076 |    -2.3997 |    -0.0281 |    -0.012  |     0.0068 | 0.2182 | 0.3571 | False                   | False      |
| zwrot 6 mies.                                            |   1 |  0.0147 |  1.1049 |        0.5862 |        0.0097 |     1.1555 |     0.0317 |     0.0199 |    -0.0099 | 0.2692 | 0.4307 | False                   | False      |
| seria miesięcy wzrostowych (+) / spadkowych (-)          |   3 |  0.0109 |  1.0628 |        0.5287 |        0.0033 |     1.1156 |     0.0305 |     0.0061 |    -0.0056 | 0.2879 | 0.4419 | False                   | False      |
| zawężenie zmienności (1 mies. / 12 mies.)                |  12 | -0.0092 | -1.0505 |        0.3966 |       -0.0003 |    -0.238  |    -0.0183 |    -0.0048 |    -0.004  | 0.2935 | 0.4419 | True                    | False      |
| wielkość (obroty)                                        |   6 | -0.0146 | -1.0421 |        0.4483 |       -0.0065 |    -1.8838 |    -0.0362 |    -0.0139 |     0.0084 | 0.2974 | 0.4419 | False                   | False      |
| zawężenie zmienności (1 mies. / 12 mies.)                |   6 | -0.0087 | -1.0349 |        0.431  |       -0.0011 |    -0.5778 |    -0.0151 |    -0.0051 |    -0.0056 | 0.3007 | 0.4419 | True                    | False      |
| wielkość (obroty)                                        |  12 | -0.0209 | -0.9976 |        0.477  |       -0.0054 |    -1.589  |    -0.0562 |    -0.0167 |     0.0136 | 0.3185 | 0.4586 | False                   | False      |
| zwrot 3 mies.                                            |   3 |  0.014  |  0.9622 |        0.5345 |        0.0085 |     1.6962 |     0.0285 |     0.012  |    -0.0001 | 0.336  | 0.4743 | False                   | False      |
| wolumen mies. / średnia 12 mies.                         |   6 | -0.0059 | -0.9487 |        0.4655 |        0.0012 |     0.7494 |     0.0041 |    -0.0086 |    -0.014  | 0.3428 | 0.4746 | False                   | False      |
| sezonowość własna (ten sam miesiąc w poprzednich latach) |  12 | -0.01   | -0.873  |        0.477  |       -0.0005 |    -0.3488 |    -0.0246 |    -0.0074 |     0.0034 | 0.3827 | 0.5198 | False                   | False      |
| zwrot 12 mies.                                           |   6 |  0.0229 |  0.7908 |        0.6264 |        0.0064 |     0.8812 |     0.0779 |     0.0057 |    -0.019  | 0.4291 | 0.5721 | False                   | False      |
| zwrot 12 mies. bez ostatniego                            |   6 |  0.0221 |  0.7703 |        0.6379 |        0.0061 |     0.8815 |     0.0746 |     0.0015 |    -0.0134 | 0.4411 | 0.5775 | False                   | False      |
| zwrot 3 mies.                                            |   1 |  0.0079 |  0.6796 |        0.523  |        0.0047 |     0.6132 |     0.0091 |     0.0083 |     0.0062 | 0.4967 | 0.6387 | True                    | False      |
| zwrot sprzed 1-3 lat                                     |   1 |  0.0064 |  0.6613 |        0.5517 |       -0.0062 |    -1.4057 |    -0.0249 |     0.0337 |     0.011  | 0.5084 | 0.6422 | False                   | False      |
| zwrot sprzed 1-3 lat                                     |  12 |  0.0181 |  0.629  |        0.5517 |       -0.0018 |    -0.5111 |    -0.0702 |     0.0888 |     0.0377 | 0.5294 | 0.6528 | False                   | False      |
| sezonowość własna (ten sam miesiąc w poprzednich latach) |   3 | -0.0042 | -0.6205 |        0.5057 |       -0.0007 |    -0.323  |    -0.0102 |    -0.0004 |    -0.0017 | 0.5349 | 0.6528 | True                    | False      |
| zwrot ostatniego miesiąca                                |   3 |  0.0066 |  0.6005 |        0.5287 |        0.0053 |     1.2466 |     0.0119 |     0.0056 |     0.0019 | 0.5481 | 0.6578 | True                    | False      |
| zwrot ostatniego miesiąca                                |   1 | -0.005  | -0.4989 |        0.5057 |        0.0001 |     0.016  |    -0.0075 |    -0.0025 |    -0.005  | 0.6179 | 0.7293 | True                    | False      |
| odsetek dni wzrostowych w mies.                          |   1 |  0.0035 |  0.463  |        0.5287 |       -0.0004 |    -0.0813 |     0.0015 |     0.0053 |     0.0036 | 0.6434 | 0.7326 | True                    | False      |
| seria miesięcy wzrostowych (+) / spadkowych (-)          |   1 | -0.0038 | -0.4549 |        0.5115 |       -0.001  |    -0.2363 |     0.0017 |    -0.0029 |    -0.0108 | 0.6492 | 0.7326 | False                   | False      |
| wzrost od dołka 12 mies.                                 |  12 | -0.0112 | -0.4521 |        0.5345 |        0.0052 |     1.05   |    -0.002  |    -0.0164 |    -0.0156 | 0.6512 | 0.7326 | True                    | False      |
| zwrot sprzed 1-3 lat                                     |   3 |  0.0058 |  0.4122 |        0.546  |       -0.0052 |    -1.4687 |    -0.0454 |     0.0468 |     0.0173 | 0.6802 | 0.7534 | False                   | False      |
| zwrot 12 mies.                                           |  12 |  0.0125 |  0.3357 |        0.6264 |        0.0022 |     0.3769 |     0.0403 |    -0.0016 |    -0.0027 | 0.7371 | 0.8041 | False                   | False      |
| zwrot sprzed 1-3 lat                                     |   6 |  0.0057 |  0.2906 |        0.4943 |       -0.0044 |    -1.2567 |    -0.0624 |     0.0644 |     0.0162 | 0.7714 | 0.8289 | False                   | False      |
| zwrot 12 mies. bez ostatniego                            |  12 |  0.0097 |  0.2661 |        0.6092 |        0.0015 |     0.2819 |     0.0327 |    -0.0061 |     0.0015 | 0.7902 | 0.8366 | False                   | False      |
| wzrost od dołka 12 mies.                                 |   1 | -0.0023 | -0.2032 |        0.523  |        0.007  |     1.0741 |    -0.0043 |     0.0058 |    -0.0089 | 0.839  | 0.8733 | False                   | False      |
| wzrost od dołka 12 mies.                                 |   3 |  0.0027 |  0.1903 |        0.5402 |        0.0093 |     1.6678 |     0.0056 |     0.0116 |    -0.0105 | 0.849  | 0.8733 | False                   | False      |
| wolumen mies. / średnia 12 mies.                         |   3 |  0.0009 |  0.1495 |        0.477  |        0.0026 |     1.0386 |     0.0108 |     0.0028 |    -0.0122 | 0.8812 | 0.8936 | False                   | False      |
| wzrost od dołka 12 mies.                                 |   6 |  0.0019 |  0.0978 |        0.569  |        0.0081 |     1.5253 |     0.0164 |     0.0129 |    -0.0265 | 0.9221 | 0.9221 | False                   | False      |

### Tydzień do tygodnia

| cecha                     | H      |      IC |    t_NW |   IC_dodatnie |   D10_D1_okres |   t_spread |
|:--------------------------|:-------|--------:|--------:|--------------:|---------------:|-----------:|
| zwrot ostatniego tygodnia | 1 tyg. | -0.024  | -6.1179 |        0.4202 |        -0.0066 |    -6.0364 |
| zwrot ostatniego tygodnia | 4 tyg. | -0.0131 | -2.8921 |        0.4623 |        -0.0056 |    -1.9949 |

## B. Profile decylowe (0 = najniższa wartość cechy, x1 / x12 = średni zwrot nadwyżkowy za 1 / 12 mies.)

|   dec | cecha                                           |   cecha_med |      x1 |     x12 |
|------:|:------------------------------------------------|------------:|--------:|--------:|
|     0 | zwrot ostatniego miesiąca                       |     -0.1881 | -0.0031 | -0.0553 |
|     1 | zwrot ostatniego miesiąca                       |     -0.0852 | -0.0009 | -0.0133 |
|     2 | zwrot ostatniego miesiąca                       |     -0.0461 | -0.0003 |  0      |
|     3 | zwrot ostatniego miesiąca                       |     -0.0196 |  0.0007 |  0.0087 |
|     4 | zwrot ostatniego miesiąca                       |      0.0014 |  0.0012 |  0.0114 |
|     5 | zwrot ostatniego miesiąca                       |      0.0212 |  0.0029 |  0.0159 |
|     6 | zwrot ostatniego miesiąca                       |      0.044  |  0.0012 |  0.0151 |
|     7 | zwrot ostatniego miesiąca                       |      0.073  |  0.0005 |  0.0118 |
|     8 | zwrot ostatniego miesiąca                       |      0.114  | -0.0005 |  0.0141 |
|     9 | zwrot ostatniego miesiąca                       |      0.2358 | -0.0016 | -0.0041 |
|     0 | zwrot 12 mies. bez ostatniego                   |     -0.4868 | -0.009  | -0.0268 |
|     1 | zwrot 12 mies. bez ostatniego                   |     -0.2281 | -0.0015 |  0.0107 |
|     2 | zwrot 12 mies. bez ostatniego                   |     -0.1055 |  0.001  |  0.0169 |
|     3 | zwrot 12 mies. bez ostatniego                   |     -0.0136 |  0.001  |  0.0234 |
|     4 | zwrot 12 mies. bez ostatniego                   |      0.0682 |  0.0009 |  0.0194 |
|     5 | zwrot 12 mies. bez ostatniego                   |      0.1522 |  0.0021 |  0.021  |
|     6 | zwrot 12 mies. bez ostatniego                   |      0.2444 |  0.0029 |  0.0152 |
|     7 | zwrot 12 mies. bez ostatniego                   |      0.3618 |  0.0031 |  0.0099 |
|     8 | zwrot 12 mies. bez ostatniego                   |      0.5568 |  0.0029 |  0.0006 |
|     9 | zwrot 12 mies. bez ostatniego                   |      1.2092 |  0.0021 | -0.0211 |
|     0 | zwrot sprzed 1-3 lat                            |     -0.5717 | -0.0007 | -0.0191 |
|     1 | zwrot sprzed 1-3 lat                            |     -0.2637 |  0.001  | -0.0022 |
|     2 | zwrot sprzed 1-3 lat                            |     -0.0892 |  0.002  |  0.0122 |
|     3 | zwrot sprzed 1-3 lat                            |      0.051  |  0.0004 |  0.0108 |
|     4 | zwrot sprzed 1-3 lat                            |      0.176  |  0.0024 |  0.0216 |
|     5 | zwrot sprzed 1-3 lat                            |      0.309  |  0.0029 |  0.025  |
|     6 | zwrot sprzed 1-3 lat                            |      0.4714 |  0.0021 |  0.0256 |
|     7 | zwrot sprzed 1-3 lat                            |      0.6928 |  0.0021 |  0.0241 |
|     8 | zwrot sprzed 1-3 lat                            |      1.0832 |  0.0017 |  0.0209 |
|     9 | zwrot sprzed 1-3 lat                            |      2.3293 | -0.002  |  0.002  |
|     0 | odległość od szczytu 12 mies.                   |     -0.5658 | -0.0076 | -0.0607 |
|     1 | odległość od szczytu 12 mies.                   |     -0.3409 | -0.0008 | -0.0199 |
|     2 | odległość od szczytu 12 mies.                   |     -0.2453 | -0.002  | -0.0018 |
|     3 | odległość od szczytu 12 mies.                   |     -0.1795 | -0.0006 |  0.009  |
|     4 | odległość od szczytu 12 mies.                   |     -0.1297 |  0.0002 |  0.02   |
|     5 | odległość od szczytu 12 mies.                   |     -0.0889 |  0.0018 |  0.0213 |
|     6 | odległość od szczytu 12 mies.                   |     -0.0508 |  0.0021 |  0.0234 |
|     7 | odległość od szczytu 12 mies.                   |     -0.0141 |  0.0045 |  0.0233 |
|     8 | odległość od szczytu 12 mies.                   |      0      |  0.0043 |  0.025  |
|     9 | odległość od szczytu 12 mies.                   |      0      |  0.0033 |  0.0235 |
|     0 | wzrost od dołka 12 mies.                        |      0      | -0.004  | -0.04   |
|     1 | wzrost od dołka 12 mies.                        |      0.0557 |  0.0005 | -0.003  |
|     2 | wzrost od dołka 12 mies.                        |      0.1206 |  0.0002 |  0.0065 |
|     3 | wzrost od dołka 12 mies.                        |      0.1816 |  0.0006 |  0.0189 |
|     4 | wzrost od dołka 12 mies.                        |      0.2463 |  0.0004 |  0.0199 |
|     5 | wzrost od dołka 12 mies.                        |      0.3181 |  0.001  |  0.0225 |
|     6 | wzrost od dołka 12 mies.                        |      0.4051 |  0.0003 |  0.0218 |
|     7 | wzrost od dołka 12 mies.                        |      0.5291 |  0.0014 |  0.0125 |
|     8 | wzrost od dołka 12 mies.                        |      0.7538 |  0.0034 |  0.0157 |
|     9 | wzrost od dołka 12 mies.                        |      1.5649 |  0.0012 | -0.0118 |
|     0 | największy dzienny wzrost w mies.               |      0.017  |  0.0039 |  0.0163 |
|     1 | największy dzienny wzrost w mies.               |      0.025  |  0.0023 |  0.0199 |
|     2 | największy dzienny wzrost w mies.               |      0.031  |  0.0024 |  0.0199 |
|     3 | największy dzienny wzrost w mies.               |      0.0369 |  0.0028 |  0.0208 |
|     4 | największy dzienny wzrost w mies.               |      0.0428 |  0.0018 |  0.014  |
|     5 | największy dzienny wzrost w mies.               |      0.0497 |  0.0008 |  0.0095 |
|     6 | największy dzienny wzrost w mies.               |      0.058  |  0.0007 |  0.0085 |
|     7 | największy dzienny wzrost w mies.               |      0.0696 | -0.0013 | -0.0119 |
|     8 | największy dzienny wzrost w mies.               |      0.0898 | -0.0031 | -0.0247 |
|     9 | największy dzienny wzrost w mies.               |      0.162  | -0.0103 | -0.0723 |
|     0 | zawężenie zmienności (1 mies. / 12 mies.)       |      0.5403 |  0.0002 | -0.0064 |
|     1 | zawężenie zmienności (1 mies. / 12 mies.)       |      0.6793 |  0.0014 |  0.0045 |
|     2 | zawężenie zmienności (1 mies. / 12 mies.)       |      0.7552 |  0.0011 |  0.0061 |
|     3 | zawężenie zmienności (1 mies. / 12 mies.)       |      0.818  |  0.0002 |  0.012  |
|     4 | zawężenie zmienności (1 mies. / 12 mies.)       |      0.8791 |  0.0017 |  0.0077 |
|     5 | zawężenie zmienności (1 mies. / 12 mies.)       |      0.943  |  0.0006 |  0.0073 |
|     6 | zawężenie zmienności (1 mies. / 12 mies.)       |      1.0154 |  0.0001 |  0.0092 |
|     7 | zawężenie zmienności (1 mies. / 12 mies.)       |      1.1058 | -0.0001 |  0.0081 |
|     8 | zawężenie zmienności (1 mies. / 12 mies.)       |      1.2385 |  0.0002 |  0.0081 |
|     9 | zawężenie zmienności (1 mies. / 12 mies.)       |      1.6129 | -0.002  | -0.0101 |
|     0 | seria miesięcy wzrostowych (+) / spadkowych (-) |      0      |  0.0021 | -0.0068 |
|     1 | seria miesięcy wzrostowych (+) / spadkowych (-) |      0      | -0.0001 | -0.0156 |
|     2 | seria miesięcy wzrostowych (+) / spadkowych (-) |      0      |  0.001  | -0.0149 |
|     3 | seria miesięcy wzrostowych (+) / spadkowych (-) |      0      | -0.0017 | -0.0124 |
|     4 | seria miesięcy wzrostowych (+) / spadkowych (-) |      1      | -0.0027 | -0.0131 |
|     5 | seria miesięcy wzrostowych (+) / spadkowych (-) |      1      | -0.0015 | -0.0052 |
|     6 | seria miesięcy wzrostowych (+) / spadkowych (-) |      1      | -0.0008 |  0.0028 |
|     7 | seria miesięcy wzrostowych (+) / spadkowych (-) |      2      | -0.0011 |  0.017  |
|     8 | seria miesięcy wzrostowych (+) / spadkowych (-) |      2      |  0.0026 |  0.0202 |
|     9 | seria miesięcy wzrostowych (+) / spadkowych (-) |      4      |  0.0022 |  0.028  |
|     0 | zmienność dzienna (1 mies.)                     |      0.0096 |  0.0025 |  0.0227 |
|     1 | zmienność dzienna (1 mies.)                     |      0.0134 |  0.0028 |  0.0224 |
|     2 | zmienność dzienna (1 mies.)                     |      0.0161 |  0.0029 |  0.024  |
|     3 | zmienność dzienna (1 mies.)                     |      0.0186 |  0.0022 |  0.0222 |
|     4 | zmienność dzienna (1 mies.)                     |      0.0212 |  0.003  |  0.0152 |
|     5 | zmienność dzienna (1 mies.)                     |      0.0242 |  0.0013 |  0.0137 |
|     6 | zmienność dzienna (1 mies.)                     |      0.0278 |  0.0017 |  0.0034 |
|     7 | zmienność dzienna (1 mies.)                     |      0.0325 |  0.0003 | -0.0039 |
|     8 | zmienność dzienna (1 mies.)                     |      0.0398 | -0.0044 | -0.0271 |
|     9 | zmienność dzienna (1 mies.)                     |      0.0635 | -0.0124 | -0.0917 |

## C. Konsolidacja: zawężenie zmienności a przyszły ruch (3 mies.)

IC zawężenia z wielkością przyszłego ruchu |x3|: 0.0257, t_NW = 3.85.

|   dec |   zawezenie_med |   ruch_abs_3m |   kierunek_3m |   zmiennosc_roczna |
|------:|----------------:|--------------:|--------------:|-------------------:|
|     0 |          0.5403 |        0.1646 |        0.0001 |             0.0292 |
|     1 |          0.6793 |        0.1611 |        0.0032 |             0.0265 |
|     2 |          0.7552 |        0.1568 |        0.0038 |             0.0257 |
|     3 |          0.818  |        0.1546 |        0.0028 |             0.0251 |
|     4 |          0.8791 |        0.1555 |        0.0038 |             0.0247 |
|     5 |          0.943  |        0.1558 |        0.0026 |             0.0245 |
|     6 |          1.0154 |        0.1552 |        0.0011 |             0.0244 |
|     7 |          1.1058 |        0.16   |        0.0002 |             0.0244 |
|     8 |          1.2385 |        0.1655 |        0.0008 |             0.0248 |
|     9 |          1.6129 |        0.1877 |       -0.0061 |             0.0275 |

## D. Rynek: indeks równoważony płynnych spółek (zwrot w %, 95 % z bootstrapu blokowego 12 mies.)

| warunek                 |   n mies. | f1                 | f12                 | f3                |
|:------------------------|----------:|:-------------------|:--------------------|:------------------|
| indeks nad SMA 10 mies. |       112 | 1.21 (0.70…2.18)   | 9.28 (0.63…18.19)   | 2.06 (0.35…5.56)  |
| indeks pod SMA 10 mies. |        61 | 0.24 (-2.02…1.63)  | 14.61 (-7.57…33.70) | 3.44 (-3.94…7.29) |
| po miesiącu spadkowym   |        69 | 0.20 (-1.43…1.68)  | 12.70 (-2.58…23.66) | 3.10 (-0.37…6.04) |
| po miesiącu wzrostowym  |       104 | 1.30 (0.30…2.63)   | 10.13 (0.98…19.11)  | 2.18 (-0.61…5.56) |
| po spadku > 5 %         |        30 | -0.09 (-1.91…1.45) | 16.56 (4.07…20.47)  | 2.53 (-1.06…5.08) |
| po wzroście > 5 %       |        43 | 2.29 (0.75…3.37)   | 15.53 (0.44…26.81)  | 4.91 (0.53…7.79)  |
| wszystkie miesiące      |       173 | 0.86 (-0.18…1.91)  | 11.16 (0.52…21.50)  | 2.55 (-0.61…5.87) |

Miesiąc roku (zwrot w następnym miesiącu przypisany do miesiąca kalendarzowego; 14-15 obserwacji na miesiąc, bez wniosków):

|   miesiąc |   średni zwrot % |   n |
|----------:|-----------------:|----:|
|         1 |             1.88 |  14 |
|         2 |            -0.54 |  15 |
|         3 |             3    |  15 |
|         4 |             1.69 |  15 |
|         5 |            -0.19 |  15 |
|         6 |             0.03 |  15 |
|         7 |            -1.59 |  14 |
|         8 |            -0.22 |  14 |
|         9 |            -2.96 |  14 |
|        10 |             3.39 |  14 |
|        11 |             2.75 |  14 |
|        12 |             3.14 |  14 |
