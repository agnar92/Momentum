# Etap 48: kombinacje filtrów a nadwyżka 5 lat (S&P 500 z danymi SEC, starty 2012-2021)

nadwyzka_5l = średnia nadwyżka 5-letnia spółek spełniających kombinację nad średnią wszystkich (0,20 = +20 pp); pol1 / pol2 = starty 2012-2016 / 2016-2021.

## Pojedyncze

| kombinacja                  |   nadwyzka_5l |     t |   pol1 |   pol2 |   sr_spolek |
|:----------------------------|--------------:|------:|-------:|-------:|------------:|
| B przychody 5 l. > 20 %/rok |         0.32  | 5.72  |  0.518 |  0.241 |      12.487 |
| F quick ratio > 1,5         |         0.254 | 5.715 |  0.217 |  0.29  |      95.256 |
| A przychody 5 l. > +50 %    |         0.207 | 7.418 |  0.235 |  0.193 |      53.171 |
| H PEG < 2                   |         0.161 | 2.529 |  0.287 |  0.091 |      97.957 |
| C EPS 5 l. > 10 %/rok       |         0.142 | 3.115 |  0.251 |  0.084 |     112.282 |
| J current ratio > 1,5       |         0.13  | 4.033 |  0.093 |  0.166 |     138.581 |
| E marża operacyjna > 25 %   |         0.101 | 4.622 |  0.092 |  0.109 |      44.795 |
| G ROE > 15 %                |         0.046 | 0.883 | -0.039 |  0.127 |     136.991 |
| D dług / kapitał < 0,5      |         0.038 | 4.492 |  0.052 |  0.024 |     215.607 |
| I zwrot 3 mies. > 0         |         0.013 | 0.962 |  0.027 |  0     |     238.402 |

## Pary (stabilne, wg nadwyżki)

| kombinacja                                             |   nadwyzka_5l |      t |   pol1 |   pol2 |   sr_spolek |   interakcja_vs_lepszy_skladnik |
|:-------------------------------------------------------|--------------:|-------:|-------:|-------:|------------:|--------------------------------:|
| F quick ratio > 1,5 + H PEG < 2                        |         0.582 |  7.866 |  0.602 |  0.571 |      22.017 |                           0.328 |
| C EPS 5 l. > 10 %/rok + F quick ratio > 1,5            |         0.526 | 14.955 |  0.559 |  0.51  |      27.658 |                           0.272 |
| A przychody 5 l. > +50 % + F quick ratio > 1,5         |         0.505 |  4.225 |  0.327 |  0.592 |      18.863 |                           0.251 |
| A przychody 5 l. > +50 % + E marża operacyjna > 25 %   |         0.46  |  4.754 |  0.248 |  0.558 |      12.017 |                           0.252 |
| E marża operacyjna > 25 % + F quick ratio > 1,5        |         0.436 |  2.973 |  0.186 |  0.673 |      18.761 |                           0.182 |
| A przychody 5 l. > +50 % + G ROE > 15 %                |         0.43  |  3.467 |  0.159 |  0.56  |      22.632 |                           0.222 |
| H PEG < 2 + J current ratio > 1,5                      |         0.409 |  6.351 |  0.509 |  0.354 |      32.479 |                           0.248 |
| A przychody 5 l. > +50 % + H PEG < 2                   |         0.408 |  3.149 |  0.16  |  0.54  |      25.812 |                           0.201 |
| E marża operacyjna > 25 % + J current ratio > 1,5      |         0.402 |  2.9   |  0.164 |  0.628 |      19.846 |                           0.272 |
| C EPS 5 l. > 10 %/rok + J current ratio > 1,5          |         0.371 | 12.204 |  0.434 |  0.339 |      39.043 |                           0.229 |
| A przychody 5 l. > +50 % + C EPS 5 l. > 10 %/rok       |         0.364 |  4.676 |  0.198 |  0.452 |      33.077 |                           0.156 |
| A przychody 5 l. > +50 % + J current ratio > 1,5       |         0.338 |  4.298 |  0.206 |  0.402 |      24.043 |                           0.131 |
| D dług / kapitał < 0,5 + F quick ratio > 1,5           |         0.333 |  7.353 |  0.33  |  0.336 |      66.282 |                           0.079 |
| F quick ratio > 1,5 + I zwrot 3 mies. > 0              |         0.327 |  5.774 |  0.322 |  0.332 |      61.419 |                           0.073 |
| E marża operacyjna > 25 % + H PEG < 2                  |         0.324 |  4.867 |  0.37  |  0.298 |      15.658 |                           0.163 |
| A przychody 5 l. > +50 % + B przychody 5 l. > 20 %/rok |         0.32  |  5.72  |  0.518 |  0.241 |      12.487 |                           0     |
| A przychody 5 l. > +50 % + D dług / kapitał < 0,5      |         0.309 |  8.915 |  0.283 |  0.322 |      35.462 |                           0.101 |
| C EPS 5 l. > 10 %/rok + E marża operacyjna > 25 %      |         0.291 |  4.552 |  0.405 |  0.23  |      20.744 |                           0.149 |
| F quick ratio > 1,5 + G ROE > 15 %                     |         0.285 |  1.979 |  0.065 |  0.494 |      44.615 |                           0.031 |
| A przychody 5 l. > +50 % + I zwrot 3 mies. > 0         |         0.267 |  6.286 |  0.308 |  0.245 |      33.615 |                           0.059 |
| G ROE > 15 % + H PEG < 2                               |         0.257 |  3.758 |  0.375 |  0.193 |      54.111 |                           0.097 |
| F quick ratio > 1,5 + J current ratio > 1,5            |         0.254 |  5.715 |  0.217 |  0.29  |      95.256 |                           0     |
| C EPS 5 l. > 10 %/rok + G ROE > 15 %                   |         0.213 |  7.735 |  0.26  |  0.189 |      61.581 |                           0.071 |
| H PEG < 2 + I zwrot 3 mies. > 0                        |         0.212 |  2.762 |  0.388 |  0.116 |      57.906 |                           0.051 |
| E marża operacyjna > 25 % + G ROE > 15 %               |         0.208 |  2.766 |  0.07  |  0.338 |      24.137 |                           0.107 |
| D dług / kapitał < 0,5 + H PEG < 2                     |         0.206 |  3.669 |  0.319 |  0.144 |      60.496 |                           0.045 |
| C EPS 5 l. > 10 %/rok + D dług / kapitał < 0,5         |         0.198 |  3.966 |  0.33  |  0.128 |      69     |                           0.056 |
| C EPS 5 l. > 10 %/rok + I zwrot 3 mies. > 0            |         0.189 |  3.015 |  0.348 |  0.104 |      70.436 |                           0.047 |
| I zwrot 3 mies. > 0 + J current ratio > 1,5            |         0.181 |  4.721 |  0.168 |  0.194 |      88.803 |                           0.051 |
| D dług / kapitał < 0,5 + E marża operacyjna > 25 %     |         0.17  |  4.49  |  0.119 |  0.219 |      27.188 |                           0.069 |
| D dług / kapitał < 0,5 + J current ratio > 1,5         |         0.164 |  6.015 |  0.165 |  0.162 |      94.513 |                           0.034 |
| C EPS 5 l. > 10 %/rok + H PEG < 2                      |         0.155 |  3.068 |  0.255 |  0.102 |      90.47  |                          -0.006 |
| E marża operacyjna > 25 % + I zwrot 3 mies. > 0        |         0.102 |  3.888 |  0.085 |  0.117 |      29.752 |                           0.001 |
| D dług / kapitał < 0,5 + I zwrot 3 mies. > 0           |         0.059 |  3.128 |  0.087 |  0.032 |     137.598 |                           0.021 |

## Trójki (stabilne, top 20)

| kombinacja                                                                 |   nadwyzka_5l |      t |   pol1 |   pol2 |   sr_spolek |   interakcja_vs_lepszy_skladnik |
|:---------------------------------------------------------------------------|--------------:|-------:|-------:|-------:|------------:|--------------------------------:|
| A przychody 5 l. > +50 % + C EPS 5 l. > 10 %/rok + F quick ratio > 1,5     |         0.782 |  2.787 |  0.194 |  1.065 |      12.137 |                           0.528 |
| A przychody 5 l. > +50 % + F quick ratio > 1,5 + G ROE > 15 %              |         0.771 |  2.715 |  0.191 |  1.051 |      10.068 |                           0.517 |
| F quick ratio > 1,5 + H PEG < 2 + I zwrot 3 mies. > 0                      |         0.738 |  8.585 |  1.017 |  0.584 |      13.393 |                           0.484 |
| A przychody 5 l. > +50 % + H PEG < 2 + J current ratio > 1,5               |         0.725 |  2.265 |  0.046 |  1.042 |      12.034 |                           0.518 |
| A przychody 5 l. > +50 % + G ROE > 15 % + J current ratio > 1,5            |         0.702 |  2.602 |  0.111 |  0.988 |      11.906 |                           0.495 |
| D dług / kapitał < 0,5 + F quick ratio > 1,5 + H PEG < 2                   |         0.693 | 10.658 |  0.815 |  0.626 |      14.248 |                           0.439 |
| C EPS 5 l. > 10 %/rok + F quick ratio > 1,5 + I zwrot 3 mies. > 0          |         0.685 |  7.866 |  0.975 |  0.54  |      17.915 |                           0.431 |
| A przychody 5 l. > +50 % + C EPS 5 l. > 10 %/rok + J current ratio > 1,5   |         0.64  |  2.594 |  0.115 |  0.894 |      15.205 |                           0.433 |
| C EPS 5 l. > 10 %/rok + D dług / kapitał < 0,5 + F quick ratio > 1,5       |         0.63  | 13.781 |  0.796 |  0.546 |      18.205 |                           0.376 |
| A przychody 5 l. > +50 % + D dług / kapitał < 0,5 + F quick ratio > 1,5    |         0.616 |  5.237 |  0.464 |  0.689 |      13.487 |                           0.362 |
| D dług / kapitał < 0,5 + E marża operacyjna > 25 % + F quick ratio > 1,5   |         0.6   |  3.426 |  0.309 |  0.878 |      12.838 |                           0.346 |
| A przychody 5 l. > +50 % + F quick ratio > 1,5 + I zwrot 3 mies. > 0       |         0.587 |  5.702 |  0.436 |  0.657 |      11.479 |                           0.333 |
| F quick ratio > 1,5 + H PEG < 2 + J current ratio > 1,5                    |         0.582 |  7.866 |  0.602 |  0.571 |      22.017 |                           0.328 |
| A przychody 5 l. > +50 % + G ROE > 15 % + H PEG < 2                        |         0.571 |  2.549 |  0.089 |  0.796 |      15.641 |                           0.364 |
| D dług / kapitał < 0,5 + E marża operacyjna > 25 % + J current ratio > 1,5 |         0.552 |  3.432 |  0.281 |  0.809 |      13.598 |                           0.422 |
| C EPS 5 l. > 10 %/rok + F quick ratio > 1,5 + G ROE > 15 %                 |         0.549 |  6.103 |  0.424 |  0.611 |      19.427 |                           0.295 |
| C EPS 5 l. > 10 %/rok + F quick ratio > 1,5 + H PEG < 2                    |         0.548 |  6.621 |  0.508 |  0.568 |      21.333 |                           0.294 |
| F quick ratio > 1,5 + G ROE > 15 % + H PEG < 2                             |         0.544 |  5.731 |  0.496 |  0.571 |      16.949 |                           0.29  |
| H PEG < 2 + I zwrot 3 mies. > 0 + J current ratio > 1,5                    |         0.537 |  5.505 |  0.824 |  0.38  |      18.974 |                           0.377 |
| C EPS 5 l. > 10 %/rok + F quick ratio > 1,5 + J current ratio > 1,5        |         0.526 | 14.955 |  0.559 |  0.51  |      27.658 |                           0.272 |

## Czwórki (z najlepszych trójek, stabilne)

| kombinacja                                                                                        |   nadwyzka_5l |      t |   pol1 |   pol2 |   sr_spolek |
|:--------------------------------------------------------------------------------------------------|--------------:|-------:|-------:|-------:|------------:|
| C EPS 5 l. > 10 %/rok + D dług / kapitał < 0,5 + F quick ratio > 1,5 + I zwrot 3 mies. > 0        |         0.829 |  5.239 |  1.302 |  0.589 |      11.538 |
| A przychody 5 l. > +50 % + C EPS 5 l. > 10 %/rok + F quick ratio > 1,5 + J current ratio > 1,5    |         0.782 |  2.787 |  0.194 |  1.065 |      12.137 |
| A przychody 5 l. > +50 % + F quick ratio > 1,5 + G ROE > 15 % + J current ratio > 1,5             |         0.771 |  2.715 |  0.191 |  1.051 |      10.068 |
| A przychody 5 l. > +50 % + C EPS 5 l. > 10 %/rok + D dług / kapitał < 0,5 + J current ratio > 1,5 |         0.744 |  2.953 |  0.221 |  0.997 |      10.752 |
| C EPS 5 l. > 10 %/rok + F quick ratio > 1,5 + G ROE > 15 % + I zwrot 3 mies. > 0                  |         0.744 | 12.677 |  0.786 |  0.724 |      12.265 |
| F quick ratio > 1,5 + H PEG < 2 + I zwrot 3 mies. > 0 + J current ratio > 1,5                     |         0.738 |  8.585 |  1.017 |  0.584 |      13.393 |
| A przychody 5 l. > +50 % + C EPS 5 l. > 10 %/rok + H PEG < 2 + J current ratio > 1,5              |         0.73  |  2.144 |  0.004 |  1.069 |      11.684 |
| C EPS 5 l. > 10 %/rok + F quick ratio > 1,5 + H PEG < 2 + I zwrot 3 mies. > 0                     |         0.719 |  9.538 |  0.992 |  0.583 |      13.068 |
| D dług / kapitał < 0,5 + F quick ratio > 1,5 + H PEG < 2 + J current ratio > 1,5                  |         0.693 | 10.658 |  0.815 |  0.626 |      14.248 |
| C EPS 5 l. > 10 %/rok + F quick ratio > 1,5 + I zwrot 3 mies. > 0 + J current ratio > 1,5         |         0.685 |  7.866 |  0.975 |  0.54  |      17.915 |
| C EPS 5 l. > 10 %/rok + D dług / kapitał < 0,5 + F quick ratio > 1,5 + H PEG < 2                  |         0.677 | 10.673 |  0.773 |  0.629 |      13.709 |
| F quick ratio > 1,5 + G ROE > 15 % + H PEG < 2 + I zwrot 3 mies. > 0                              |         0.668 |  8.379 |  0.75  |  0.624 |      10.171 |
| C EPS 5 l. > 10 %/rok + D dług / kapitał < 0,5 + F quick ratio > 1,5 + J current ratio > 1,5      |         0.63  | 13.781 |  0.796 |  0.546 |      18.205 |
| A przychody 5 l. > +50 % + D dług / kapitał < 0,5 + F quick ratio > 1,5 + J current ratio > 1,5   |         0.616 |  5.237 |  0.464 |  0.689 |      13.487 |
| D dług / kapitał < 0,5 + F quick ratio > 1,5 + G ROE > 15 % + H PEG < 2                           |         0.581 |  8.544 |  0.612 |  0.563 |      11.957 |

## Macierz par (nadwyżka 5 lat; przekątna = filtr sam)

|    |     A |     B |     C |     D |     E |     F |     G |     H |     I |     J |
|:---|------:|------:|------:|------:|------:|------:|------:|------:|------:|------:|
| A  | 0.207 | 0.32  | 0.364 | 0.309 | 0.46  | 0.505 | 0.43  | 0.408 | 0.267 | 0.338 |
| B  | 0.32  | 0.32  | 0.642 | 0.561 | 1.446 | 0.732 | 0.646 | 0.599 | 0.315 | 0.659 |
| C  | 0.364 | 0.642 | 0.142 | 0.198 | 0.291 | 0.526 | 0.213 | 0.155 | 0.189 | 0.371 |
| D  | 0.309 | 0.561 | 0.198 | 0.038 | 0.17  | 0.333 | 0.071 | 0.206 | 0.059 | 0.164 |
| E  | 0.46  | 1.446 | 0.291 | 0.17  | 0.101 | 0.436 | 0.208 | 0.324 | 0.102 | 0.402 |
| F  | 0.505 | 0.732 | 0.526 | 0.333 | 0.436 | 0.254 | 0.285 | 0.582 | 0.327 | 0.254 |
| G  | 0.43  | 0.646 | 0.213 | 0.071 | 0.208 | 0.285 | 0.046 | 0.257 | 0.067 | 0.148 |
| H  | 0.408 | 0.599 | 0.155 | 0.206 | 0.324 | 0.582 | 0.257 | 0.161 | 0.212 | 0.409 |
| I  | 0.267 | 0.315 | 0.189 | 0.059 | 0.102 | 0.327 | 0.067 | 0.212 | 0.013 | 0.181 |
| J  | 0.338 | 0.659 | 0.371 | 0.164 | 0.402 | 0.254 | 0.148 | 0.409 | 0.181 | 0.13  |
