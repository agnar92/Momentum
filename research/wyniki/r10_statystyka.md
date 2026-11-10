# Etap 5b: statystyka zachowania ceny (miesiące sygnału 1998-01 ... 2012-06)

Panel: 516,234 obserwacji spółka-miesiąc, 174 miesięcy, spółki płynne. Zwroty przyszłe jako nadwyżka nad średnią przekrojową (winsoryzacja 1/99 % w miesiącu). IC = korelacja rang cechy i przyszłego zwrotu w danym miesiącu.

## A. Co przewiduje przyszły zwrot względem rynku

stabilny = q_BH < 0,05, |t_NW| > 3 i ten sam znak IC w trzech podokresach. D10_D1_mies = różnica średniego zwrotu nadwyżkowego najwyższego i najniższego decyla cechy, na miesiąc.

| cecha                                                    |   H |      IC |    t_NW |   IC_dodatnie |   D10_D1_mies |   t_spread |   IC_98_02 |   IC_03_07 |   IC_08_12 |      p |   q_BH | ten_sam_znak_3_okresy   | stabilny   |
|:---------------------------------------------------------|----:|--------:|--------:|--------------:|--------------:|-----------:|-----------:|-----------:|-----------:|-------:|-------:|:------------------------|:-----------|
| odsetek dni wzrostowych w mies.                          |  12 |  0.0503 |  4.1492 |        0.7356 |        0.0053 |     2.9314 |     0.0667 |     0.0495 |     0.033  | 0      | 0.0024 | True                    | True       |
| największy dzienny wzrost w mies.                        |   1 | -0.0519 | -3.5878 |        0.3908 |       -0.0116 |    -1.3612 |    -0.077  |    -0.0316 |    -0.0467 | 0.0003 | 0.0083 | True                    | True       |
| odsetek dni wzrostowych w mies.                          |   6 |  0.0353 |  3.5782 |        0.6724 |        0.0059 |     2.4711 |     0.0549 |     0.0356 |     0.0131 | 0.0003 | 0.0083 | True                    | True       |
| największy dzienny wzrost w mies.                        |   3 | -0.0751 | -3.4416 |        0.3333 |       -0.0095 |    -1.3033 |    -0.1175 |    -0.042  |    -0.0647 | 0.0006 | 0.0084 | True                    | True       |
| największy dzienny wzrost w mies.                        |   6 | -0.1007 | -3.312  |        0.2816 |       -0.0081 |    -1.1479 |    -0.156  |    -0.0663 |    -0.0774 | 0.0009 | 0.0084 | True                    | True       |
| zmienność dzienna (1 mies.)                              |   6 | -0.1149 | -3.2942 |        0.2874 |       -0.0097 |    -1.2369 |    -0.1745 |    -0.0779 |    -0.0899 | 0.001  | 0.0084 | True                    | True       |
| zmienność dzienna (1 mies.)                              |  12 | -0.1486 | -3.287  |        0.2126 |       -0.007  |    -0.9899 |    -0.2    |    -0.1273 |    -0.1151 | 0.001  | 0.0084 | True                    | True       |
| zmienność dzienna (1 mies.)                              |   1 | -0.055  | -3.2698 |        0.3851 |       -0.0115 |    -1.1835 |    -0.0777 |    -0.0334 |    -0.054  | 0.0011 | 0.0084 | True                    | True       |
| największy dzienny wzrost w mies.                        |  12 | -0.1278 | -3.2529 |        0.2299 |       -0.0052 |    -0.8103 |    -0.1759 |    -0.1085 |    -0.0957 | 0.0011 | 0.0084 | True                    | True       |
| zmienność dzienna (1 mies.)                              |   3 | -0.0824 | -3.2484 |        0.3333 |       -0.0107 |    -1.296  |    -0.1274 |    -0.0474 |    -0.0713 | 0.0012 | 0.0084 | True                    | True       |
| sezonowość własna (ten sam miesiąc w poprzednich latach) |   1 |  0.0167 |  3.1286 |        0.6092 |        0.0057 |     1.9353 |     0.0287 |     0.0088 |     0.0121 | 0.0018 | 0.0115 | True                    | True       |
| szerokość zakresu 3 mies.                                |   6 | -0.0743 | -2.8738 |        0.2874 |       -0.0048 |    -0.7651 |    -0.1253 |    -0.0472 |    -0.0478 | 0.0041 | 0.0243 | True                    | False      |
| odległość od rekordu wszech czasów                       |   6 |  0.0776 |  2.822  |        0.7414 |        0.0068 |     1.1208 |     0.1207 |     0.0792 |     0.028  | 0.0048 | 0.0264 | True                    | False      |
| szerokość zakresu 3 mies.                                |   3 | -0.0507 | -2.7833 |        0.3678 |       -0.0045 |    -0.7069 |    -0.0785 |    -0.0294 |    -0.0434 | 0.0054 | 0.0264 | True                    | False      |
| odległość od rekordu wszech czasów                       |   3 |  0.0583 |  2.7717 |        0.6494 |        0.009  |     1.3967 |     0.098  |     0.0472 |     0.0266 | 0.0056 | 0.0264 | True                    | False      |
| szerokość zakresu 3 mies.                                |  12 | -0.1007 | -2.7553 |        0.2126 |       -0.003  |    -0.4982 |    -0.1418 |    -0.0917 |    -0.0649 | 0.0059 | 0.0264 | True                    | False      |
| seria miesięcy wzrostowych (+) / spadkowych (-)          |  12 |  0.0359 |  2.6702 |        0.6609 |        0.0029 |     1.6939 |     0.0633 |     0.0293 |     0.0128 | 0.0076 | 0.0314 | True                    | False      |
| odległość od szczytu 12 mies.                            |   6 |  0.0792 |  2.6308 |        0.7529 |        0.0101 |     1.4246 |     0.1512 |     0.0644 |     0.0156 | 0.0085 | 0.0314 | True                    | False      |
| odległość od rekordu wszech czasów                       |   1 |  0.0382 |  2.6251 |        0.6264 |        0.0082 |     0.9952 |     0.0573 |     0.0337 |     0.0219 | 0.0087 | 0.0314 | True                    | False      |
| odległość od rekordu wszech czasów                       |  12 |  0.0936 |  2.6228 |        0.7701 |        0.0039 |     0.7619 |     0.1172 |     0.1187 |     0.0394 | 0.0087 | 0.0314 | True                    | False      |
| szerokość zakresu 3 mies.                                |   1 | -0.0328 | -2.5943 |        0.4425 |       -0.0022 |    -0.2738 |    -0.0441 |    -0.0245 |    -0.0293 | 0.0095 | 0.0325 | True                    | False      |
| odległość od szczytu 12 mies.                            |   3 |  0.0559 |  2.5132 |        0.6667 |        0.0114 |     1.6157 |     0.1108 |     0.0382 |     0.0148 | 0.012  | 0.0392 | True                    | False      |
| odsetek dni wzrostowych w mies.                          |   3 |  0.0224 |  2.4818 |        0.6034 |        0.006  |     2.0527 |     0.0331 |     0.0161 |     0.0175 | 0.0131 | 0.0409 | True                    | False      |
| odległość od szczytu 12 mies.                            |  12 |  0.0921 |  2.2646 |        0.7874 |        0.0062 |     1.0055 |     0.1442 |     0.0813 |     0.0462 | 0.0235 | 0.0706 | True                    | False      |
| seria miesięcy wzrostowych (+) / spadkowych (-)          |   6 |  0.0237 |  2.179  |        0.6092 |        0.0038 |     1.7915 |     0.0509 |     0.0203 |    -0.0026 | 0.0293 | 0.0845 | False                   | False      |
| odległość od szczytu 12 mies.                            |   1 |  0.0339 |  2.1626 |        0.6322 |        0.0094 |     1.0398 |     0.058  |     0.0265 |     0.0152 | 0.0306 | 0.0847 | True                    | False      |
| zwrot 12 mies. bez ostatniego                            |   1 |  0.0296 |  2.1387 |        0.6207 |        0.0134 |     1.6579 |     0.0625 |     0.0131 |     0.0114 | 0.0325 | 0.0866 | True                    | False      |
| zwrot ostatniego miesiąca                                |  12 |  0.0266 |  2.0346 |        0.5862 |        0.0047 |     1.8577 |     0.0501 |     0.022  |     0.0056 | 0.0419 | 0.1077 | True                    | False      |
| wolumen mies. / średnia 12 mies.                         |  12 | -0.0164 | -1.9738 |        0.3908 |        0.0001 |     0.0485 |    -0.0085 |    -0.0248 |    -0.016  | 0.0484 | 0.1202 | True                    | False      |
| zwrot 6 mies.                                            |   6 |  0.043  |  1.9347 |        0.6897 |        0.0115 |     1.7379 |     0.1005 |     0.0439 |    -0.0219 | 0.053  | 0.1273 | False                   | False      |
| zwrot 12 mies.                                           |   1 |  0.0258 |  1.8037 |        0.6149 |        0.0123 |     1.4292 |     0.0548 |     0.0125 |     0.0084 | 0.0713 | 0.1656 | True                    | False      |
| zwrot 3 mies.                                            |   6 |  0.0272 |  1.7486 |        0.592  |        0.0086 |     1.7858 |     0.0654 |     0.0291 |    -0.0173 | 0.0804 | 0.1808 | False                   | False      |
| wolumen mies. / średnia 12 mies.                         |   1 |  0.0081 |  1.7265 |        0.5402 |        0.0074 |     1.8795 |     0.0235 |     0.0061 |    -0.0067 | 0.0843 | 0.1838 | False                   | False      |
| zawężenie zmienności (1 mies. / 12 mies.)                |   1 | -0.0086 | -1.6886 |        0.4828 |       -0.0019 |    -0.6572 |    -0.0151 |     0.0009 |    -0.0119 | 0.0913 | 0.1927 | False                   | False      |
| zwrot 3 mies.                                            |  12 |  0.0373 |  1.6764 |        0.6667 |        0.0068 |     1.5317 |     0.0792 |     0.0237 |     0.0057 | 0.0937 | 0.1927 | True                    | False      |
| zwrot 6 mies.                                            |   3 |  0.028  |  1.6537 |        0.5805 |        0.0124 |     1.8614 |     0.0692 |     0.0297 |    -0.0196 | 0.0982 | 0.1964 | False                   | False      |
| sezonowość własna (ten sam miesiąc w poprzednich latach) |   6 | -0.0155 | -1.6112 |        0.454  |       -0.0012 |    -0.589  |    -0.0243 |    -0.0113 |    -0.0103 | 0.1071 | 0.2085 | True                    | False      |
| zwrot 12 mies. bez ostatniego                            |   3 |  0.0262 |  1.3336 |        0.5747 |        0.0097 |     1.4445 |     0.0788 |     0.0001 |    -0.0034 | 0.1823 | 0.3373 | False                   | False      |
| zwrot ostatniego miesiąca                                |   6 |  0.0135 |  1.3324 |        0.5287 |        0.0048 |     1.6304 |     0.0295 |     0.0172 |    -0.0084 | 0.1827 | 0.3373 | False                   | False      |
| wielkość (obroty)                                        |   1 | -0.0072 | -1.2921 |        0.4828 |       -0.0095 |    -3.1314 |    -0.0185 |    -0.0052 |     0.0033 | 0.1963 | 0.3534 | False                   | False      |
| zwrot 12 mies.                                           |   3 |  0.0255 |  1.2537 |        0.5805 |        0.0095 |     1.3015 |     0.0762 |     0.0016 |    -0.0041 | 0.2099 | 0.3678 | False                   | False      |
| zawężenie zmienności (1 mies. / 12 mies.)                |   3 | -0.0089 | -1.2408 |        0.454  |       -0.0018 |    -0.9306 |    -0.0154 |    -0.0004 |    -0.0111 | 0.2147 | 0.3678 | True                    | False      |
| wielkość (obroty)                                        |   3 | -0.0117 | -1.2274 |        0.4655 |       -0.0076 |    -2.388  |    -0.028  |    -0.0121 |     0.0069 | 0.2197 | 0.3678 | False                   | False      |
| zwrot 6 mies.                                            |  12 |  0.0376 |  1.194  |        0.6667 |        0.006  |     1.01   |     0.0868 |     0.0255 |    -0.0035 | 0.2325 | 0.3804 | False                   | False      |
| zwrot 6 mies.                                            |   1 |  0.0142 |  1.0698 |        0.5862 |        0.0093 |     1.1038 |     0.0311 |     0.0194 |    -0.0102 | 0.2847 | 0.4556 | False                   | False      |
| seria miesięcy wzrostowych (+) / spadkowych (-)          |   3 |  0.0107 |  1.0461 |        0.5287 |        0.0031 |     1.0757 |     0.0303 |     0.0058 |    -0.0058 | 0.2955 | 0.462  | False                   | False      |
| wielkość (obroty)                                        |   6 | -0.0145 | -1.033  |        0.4483 |       -0.0064 |    -1.8486 |    -0.0359 |    -0.014  |     0.0087 | 0.3016 | 0.462  | False                   | False      |
| wielkość (obroty)                                        |  12 | -0.0206 | -0.9821 |        0.4828 |       -0.0054 |    -1.5886 |    -0.056  |    -0.0167 |     0.0143 | 0.3261 | 0.4891 | False                   | False      |
| zawężenie zmienności (1 mies. / 12 mies.)                |   6 | -0.008  | -0.9467 |        0.431  |       -0.0008 |    -0.4289 |    -0.0144 |    -0.0041 |    -0.0051 | 0.3438 | 0.5011 | True                    | False      |
| zawężenie zmienności (1 mies. / 12 mies.)                |  12 | -0.0081 | -0.9282 |        0.4023 |       -0      |    -0.0011 |    -0.0172 |    -0.004  |    -0.0026 | 0.3533 | 0.5011 | True                    | False      |
| zwrot 3 mies.                                            |   3 |  0.0134 |  0.9214 |        0.5287 |        0.0083 |     1.6381 |     0.0279 |     0.0114 |    -0.0006 | 0.3568 | 0.5011 | False                   | False      |
| wolumen mies. / średnia 12 mies.                         |   6 | -0.0056 | -0.9117 |        0.4655 |        0.0012 |     0.759  |     0.0045 |    -0.0086 |    -0.0136 | 0.3619 | 0.5011 | False                   | False      |
| sezonowość własna (ten sam miesiąc w poprzednich latach) |  12 | -0.0101 | -0.88   |        0.4598 |       -0.0004 |    -0.3091 |    -0.0252 |    -0.0076 |     0.004  | 0.3788 | 0.5146 | False                   | False      |
| zwrot 12 mies.                                           |   6 |  0.0211 |  0.73   |        0.6264 |        0.0058 |     0.7921 |     0.0762 |     0.0046 |    -0.0217 | 0.4654 | 0.6205 | False                   | False      |
| zwrot 12 mies. bez ostatniego                            |   6 |  0.0204 |  0.7123 |        0.6322 |        0.0055 |     0.7882 |     0.073  |     0.0005 |    -0.016  | 0.4763 | 0.6235 | False                   | False      |
| zwrot sprzed 1-3 lat                                     |   1 |  0.0063 |  0.6495 |        0.5517 |       -0.0063 |    -1.4365 |    -0.0252 |     0.0333 |     0.0112 | 0.516  | 0.6496 | False                   | False      |
| zwrot 3 mies.                                            |   1 |  0.0076 |  0.6481 |        0.523  |        0.0045 |     0.586  |     0.0087 |     0.0079 |     0.0059 | 0.5169 | 0.6496 | True                    | False      |
| sezonowość własna (ten sam miesiąc w poprzednich latach) |   3 | -0.0043 | -0.6383 |        0.5057 |       -0.0009 |    -0.43   |    -0.0107 |    -0.0004 |    -0.0016 | 0.5233 | 0.6496 | True                    | False      |
| zwrot sprzed 1-3 lat                                     |  12 |  0.0177 |  0.6186 |        0.523  |       -0.0021 |    -0.5771 |    -0.0709 |     0.088  |     0.038  | 0.5362 | 0.6544 | False                   | False      |
| zwrot ostatniego miesiąca                                |   3 |  0.0065 |  0.5869 |        0.5345 |        0.0052 |     1.2221 |     0.0117 |     0.0054 |     0.0017 | 0.5573 | 0.6687 | True                    | False      |
| wzrost od dołka 12 mies.                                 |  12 | -0.0132 | -0.5342 |        0.5345 |        0.0048 |     0.9623 |    -0.0039 |    -0.0179 |    -0.0183 | 0.5932 | 0.7002 | True                    | False      |
| zwrot ostatniego miesiąca                                |   1 | -0.005  | -0.5007 |        0.5115 |        0      |     0.002  |    -0.0077 |    -0.0025 |    -0.0049 | 0.6166 | 0.7161 | True                    | False      |
| seria miesięcy wzrostowych (+) / spadkowych (-)          |   1 | -0.0038 | -0.4631 |        0.5115 |       -0.001  |    -0.2388 |     0.0015 |    -0.003  |    -0.0108 | 0.6433 | 0.7254 | False                   | False      |
| odsetek dni wzrostowych w mies.                          |   1 |  0.0035 |  0.461  |        0.5287 |       -0.0004 |    -0.085  |     0.0015 |     0.0054 |     0.0036 | 0.6448 | 0.7254 | True                    | False      |
| zwrot sprzed 1-3 lat                                     |   3 |  0.0055 |  0.392  |        0.5402 |       -0.0055 |    -1.5578 |    -0.0461 |     0.0463 |     0.0175 | 0.6951 | 0.7699 | False                   | False      |
| zwrot sprzed 1-3 lat                                     |   6 |  0.0054 |  0.2747 |        0.4885 |       -0.0046 |    -1.3206 |    -0.0634 |     0.0636 |     0.0172 | 0.7835 | 0.8408 | False                   | False      |
| zwrot 12 mies.                                           |  12 |  0.01   |  0.2685 |        0.6207 |        0.0016 |     0.2666 |     0.0386 |    -0.0033 |    -0.007  | 0.7883 | 0.8408 | False                   | False      |
| wzrost od dołka 12 mies.                                 |   1 | -0.0029 | -0.261  |        0.5115 |        0.0066 |     1.0041 |    -0.0052 |     0.0052 |    -0.0093 | 0.7941 | 0.8408 | False                   | False      |
| zwrot 12 mies. bez ostatniego                            |  12 |  0.0075 |  0.2069 |        0.5977 |        0.0009 |     0.1722 |     0.0313 |    -0.0075 |    -0.0022 | 0.8361 | 0.8725 | False                   | False      |
| wolumen mies. / średnia 12 mies.                         |   3 |  0.001  |  0.1625 |        0.4828 |        0.0027 |     1.0456 |     0.0111 |     0.0026 |    -0.012  | 0.8709 | 0.8958 | False                   | False      |
| wzrost od dołka 12 mies.                                 |   3 |  0.0017 |  0.1169 |        0.5402 |        0.009  |     1.5755 |     0.0043 |     0.0106 |    -0.0113 | 0.9069 | 0.9197 | False                   | False      |
| wzrost od dołka 12 mies.                                 |   6 |  0.0005 |  0.0246 |        0.5575 |        0.0077 |     1.4398 |     0.0147 |     0.0116 |    -0.0277 | 0.9804 | 0.9804 | False                   | False      |

### Tydzień do tygodnia

| cecha                     | H      |      IC |    t_NW |   IC_dodatnie |   D10_D1_okres |   t_spread |
|:--------------------------|:-------|--------:|--------:|--------------:|---------------:|-----------:|
| zwrot ostatniego tygodnia | 1 tyg. | -0.024  | -6.119  |        0.4189 |        -0.0066 |    -6.0399 |
| zwrot ostatniego tygodnia | 4 tyg. | -0.0131 | -2.8993 |        0.461  |        -0.0056 |    -2.0166 |

## B. Profile decylowe (0 = najniższa wartość cechy, x1 / x12 = średni zwrot nadwyżkowy za 1 / 12 mies.)

|   dec | cecha                                           |   cecha_med |      x1 |     x12 |
|------:|:------------------------------------------------|------------:|--------:|--------:|
|     0 | zwrot ostatniego miesiąca                       |     -0.1881 | -0.003  | -0.0537 |
|     1 | zwrot ostatniego miesiąca                       |     -0.0852 | -0.001  | -0.0134 |
|     2 | zwrot ostatniego miesiąca                       |     -0.0461 | -0.0003 | -0.0002 |
|     3 | zwrot ostatniego miesiąca                       |     -0.0196 |  0.0006 |  0.0084 |
|     4 | zwrot ostatniego miesiąca                       |      0.0014 |  0.0011 |  0.0107 |
|     5 | zwrot ostatniego miesiąca                       |      0.0212 |  0.0029 |  0.0148 |
|     6 | zwrot ostatniego miesiąca                       |      0.044  |  0.0012 |  0.0145 |
|     7 | zwrot ostatniego miesiąca                       |      0.073  |  0.0005 |  0.0111 |
|     8 | zwrot ostatniego miesiąca                       |      0.1141 | -0.0005 |  0.0149 |
|     9 | zwrot ostatniego miesiąca                       |      0.2362 | -0.0016 | -0.0034 |
|     0 | zwrot 12 mies. bez ostatniego                   |     -0.4866 | -0.0089 | -0.0231 |
|     1 | zwrot 12 mies. bez ostatniego                   |     -0.2278 | -0.0015 |  0.0106 |
|     2 | zwrot 12 mies. bez ostatniego                   |     -0.1051 |  0.001  |  0.0154 |
|     3 | zwrot 12 mies. bez ostatniego                   |     -0.0132 |  0.001  |  0.0227 |
|     4 | zwrot 12 mies. bez ostatniego                   |      0.0689 |  0.0009 |  0.0182 |
|     5 | zwrot 12 mies. bez ostatniego                   |      0.1528 |  0.002  |  0.0209 |
|     6 | zwrot 12 mies. bez ostatniego                   |      0.2451 |  0.0029 |  0.0137 |
|     7 | zwrot 12 mies. bez ostatniego                   |      0.3632 |  0.0032 |  0.0095 |
|     8 | zwrot 12 mies. bez ostatniego                   |      0.5596 |  0.0027 | -0.0007 |
|     9 | zwrot 12 mies. bez ostatniego                   |      1.2311 |  0.0018 | -0.0249 |
|     0 | zwrot sprzed 1-3 lat                            |     -0.5748 | -0.0009 | -0.0208 |
|     1 | zwrot sprzed 1-3 lat                            |     -0.2643 |  0.0008 | -0.0032 |
|     2 | zwrot sprzed 1-3 lat                            |     -0.0895 |  0.002  |  0.0104 |
|     3 | zwrot sprzed 1-3 lat                            |      0.0512 |  0.0004 |  0.0096 |
|     4 | zwrot sprzed 1-3 lat                            |      0.1765 |  0.0025 |  0.0207 |
|     5 | zwrot sprzed 1-3 lat                            |      0.3102 |  0.0028 |  0.0233 |
|     6 | zwrot sprzed 1-3 lat                            |      0.4734 |  0.0022 |  0.0249 |
|     7 | zwrot sprzed 1-3 lat                            |      0.6967 |  0.0019 |  0.0231 |
|     8 | zwrot sprzed 1-3 lat                            |      1.0918 |  0.0018 |  0.0193 |
|     9 | zwrot sprzed 1-3 lat                            |      2.3932 | -0.0021 | -0.0014 |
|     0 | odległość od szczytu 12 mies.                   |     -0.5659 | -0.0076 | -0.0575 |
|     1 | odległość od szczytu 12 mies.                   |     -0.3411 | -0.0008 | -0.0197 |
|     2 | odległość od szczytu 12 mies.                   |     -0.2454 | -0.0021 | -0.0028 |
|     3 | odległość od szczytu 12 mies.                   |     -0.1795 | -0.0007 |  0.0075 |
|     4 | odległość od szczytu 12 mies.                   |     -0.1298 |  0.0001 |  0.0186 |
|     5 | odległość od szczytu 12 mies.                   |     -0.0889 |  0.0017 |  0.02   |
|     6 | odległość od szczytu 12 mies.                   |     -0.0507 |  0.0021 |  0.0224 |
|     7 | odległość od szczytu 12 mies.                   |     -0.0141 |  0.0045 |  0.022  |
|     8 | odległość od szczytu 12 mies.                   |      0      |  0.0043 |  0.0242 |
|     9 | odległość od szczytu 12 mies.                   |      0      |  0.0032 |  0.0217 |
|     0 | wzrost od dołka 12 mies.                        |      0      | -0.004  | -0.0388 |
|     1 | wzrost od dołka 12 mies.                        |      0.0559 |  0.0005 | -0.003  |
|     2 | wzrost od dołka 12 mies.                        |      0.1209 |  0.0002 |  0.0056 |
|     3 | wzrost od dołka 12 mies.                        |      0.1819 |  0.0006 |  0.0182 |
|     4 | wzrost od dołka 12 mies.                        |      0.2467 |  0.0004 |  0.0196 |
|     5 | wzrost od dołka 12 mies.                        |      0.3187 |  0.0011 |  0.0218 |
|     6 | wzrost od dołka 12 mies.                        |      0.406  |  0.0002 |  0.0216 |
|     7 | wzrost od dołka 12 mies.                        |      0.531  |  0.0014 |  0.0121 |
|     8 | wzrost od dołka 12 mies.                        |      0.7585 |  0.0035 |  0.0152 |
|     9 | wzrost od dołka 12 mies.                        |      1.5973 |  0.0008 | -0.0159 |
|     0 | największy dzienny wzrost w mies.               |      0.017  |  0.0038 |  0.0157 |
|     1 | największy dzienny wzrost w mies.               |      0.025  |  0.0023 |  0.0193 |
|     2 | największy dzienny wzrost w mies.               |      0.031  |  0.0024 |  0.0188 |
|     3 | największy dzienny wzrost w mies.               |      0.0369 |  0.0027 |  0.0199 |
|     4 | największy dzienny wzrost w mies.               |      0.0428 |  0.0018 |  0.0138 |
|     5 | największy dzienny wzrost w mies.               |      0.0497 |  0.0008 |  0.009  |
|     6 | największy dzienny wzrost w mies.               |      0.058  |  0.0008 |  0.0086 |
|     7 | największy dzienny wzrost w mies.               |      0.0696 | -0.0013 | -0.0118 |
|     8 | największy dzienny wzrost w mies.               |      0.0898 | -0.0031 | -0.0228 |
|     9 | największy dzienny wzrost w mies.               |      0.1619 | -0.0102 | -0.0704 |
|     0 | zawężenie zmienności (1 mies. / 12 mies.)       |      0.5379 | -0.0001 | -0.0095 |
|     1 | zawężenie zmienności (1 mies. / 12 mies.)       |      0.6787 |  0.0014 |  0.0049 |
|     2 | zawężenie zmienności (1 mies. / 12 mies.)       |      0.7548 |  0.0011 |  0.0055 |
|     3 | zawężenie zmienności (1 mies. / 12 mies.)       |      0.8177 |  0.0003 |  0.0117 |
|     4 | zawężenie zmienności (1 mies. / 12 mies.)       |      0.8787 |  0.0015 |  0.0073 |
|     5 | zawężenie zmienności (1 mies. / 12 mies.)       |      0.9428 |  0.0006 |  0.0069 |
|     6 | zawężenie zmienności (1 mies. / 12 mies.)       |      1.0152 |  0.0001 |  0.0088 |
|     7 | zawężenie zmienności (1 mies. / 12 mies.)       |      1.1056 | -0      |  0.008  |
|     8 | zawężenie zmienności (1 mies. / 12 mies.)       |      1.2383 |  0.0002 |  0.0074 |
|     9 | zawężenie zmienności (1 mies. / 12 mies.)       |      1.6131 | -0.0019 | -0.0097 |
|     0 | seria miesięcy wzrostowych (+) / spadkowych (-) |      0      |  0.0021 | -0.0053 |
|     1 | seria miesięcy wzrostowych (+) / spadkowych (-) |      0      | -0.0001 | -0.0152 |
|     2 | seria miesięcy wzrostowych (+) / spadkowych (-) |      0      |  0.0009 | -0.0151 |
|     3 | seria miesięcy wzrostowych (+) / spadkowych (-) |      0      | -0.0017 | -0.0122 |
|     4 | seria miesięcy wzrostowych (+) / spadkowych (-) |      1      | -0.0026 | -0.0135 |
|     5 | seria miesięcy wzrostowych (+) / spadkowych (-) |      1      | -0.0016 | -0.006  |
|     6 | seria miesięcy wzrostowych (+) / spadkowych (-) |      1      | -0.0008 |  0.0026 |
|     7 | seria miesięcy wzrostowych (+) / spadkowych (-) |      2      | -0.001  |  0.0173 |
|     8 | seria miesięcy wzrostowych (+) / spadkowych (-) |      2      |  0.0024 |  0.0203 |
|     9 | seria miesięcy wzrostowych (+) / spadkowych (-) |      4      |  0.0022 |  0.0269 |
|     0 | zmienność dzienna (1 mies.)                     |      0.0096 |  0.0024 |  0.0218 |
|     1 | zmienność dzienna (1 mies.)                     |      0.0134 |  0.0028 |  0.0212 |
|     2 | zmienność dzienna (1 mies.)                     |      0.0161 |  0.0029 |  0.0236 |
|     3 | zmienność dzienna (1 mies.)                     |      0.0186 |  0.0022 |  0.0213 |
|     4 | zmienność dzienna (1 mies.)                     |      0.0212 |  0.003  |  0.0144 |
|     5 | zmienność dzienna (1 mies.)                     |      0.0242 |  0.0013 |  0.0136 |
|     6 | zmienność dzienna (1 mies.)                     |      0.0278 |  0.0017 |  0.0038 |
|     7 | zmienność dzienna (1 mies.)                     |      0.0325 |  0.0003 | -0.0037 |
|     8 | zmienność dzienna (1 mies.)                     |      0.0398 | -0.0044 | -0.0259 |
|     9 | zmienność dzienna (1 mies.)                     |      0.0634 | -0.0123 | -0.0891 |

## C. Konsolidacja: zawężenie zmienności a przyszły ruch (3 mies.)

IC zawężenia z wielkością przyszłego ruchu |x3|: 0.0252, t_NW = 3.79.

|   dec |   zawezenie_med |   ruch_abs_3m |   kierunek_3m |   zmiennosc_roczna |
|------:|----------------:|--------------:|--------------:|-------------------:|
|     0 |          0.5379 |        0.1658 |       -0.0002 |             0.0294 |
|     1 |          0.6787 |        0.1614 |        0.0032 |             0.0265 |
|     2 |          0.7548 |        0.1571 |        0.0038 |             0.0257 |
|     3 |          0.8177 |        0.1548 |        0.0028 |             0.0251 |
|     4 |          0.8787 |        0.156  |        0.0035 |             0.0247 |
|     5 |          0.9428 |        0.1559 |        0.0026 |             0.0245 |
|     6 |          1.0152 |        0.1554 |        0.001  |             0.0244 |
|     7 |          1.1056 |        0.1603 |        0.0003 |             0.0244 |
|     8 |          1.2383 |        0.1656 |        0.0006 |             0.0248 |
|     9 |          1.6131 |        0.1882 |       -0.0061 |             0.0275 |

## D. Rynek: indeks równoważony płynnych spółek (zwrot w %, 95 % z bootstrapu blokowego 12 mies.)

| warunek                 |   n mies. | f1                 | f12                 | f3                |
|:------------------------|----------:|:-------------------|:--------------------|:------------------|
| indeks nad SMA 10 mies. |       112 | 1.21 (0.70…2.18)   | 9.29 (0.63…18.21)   | 2.07 (0.35…5.57)  |
| indeks pod SMA 10 mies. |        61 | 0.24 (-2.02…1.63)  | 14.61 (-7.57…33.71) | 3.44 (-3.94…7.30) |
| po miesiącu spadkowym   |        69 | 0.20 (-1.43…1.68)  | 12.71 (-2.57…23.67) | 3.10 (-0.37…6.04) |
| po miesiącu wzrostowym  |       104 | 1.31 (0.30…2.63)   | 10.14 (0.98…19.12)  | 2.19 (-0.61…5.57) |
| po spadku > 5 %         |        30 | -0.09 (-1.91…1.45) | 16.57 (4.08…20.47)  | 2.53 (-1.06…5.08) |
| po wzroście > 5 %       |        43 | 2.29 (0.75…3.38)   | 15.55 (0.45…26.81)  | 4.92 (0.53…7.79)  |
| wszystkie miesiące      |       173 | 0.87 (-0.17…1.91)  | 11.17 (0.53…21.51)  | 2.55 (-0.60…5.88) |

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
|        12 |             3.15 |  14 |
