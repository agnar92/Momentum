# Etap 14: Minervini Trend Template i VCP (definicje i kryteria w protokole, zapisane przed uruchomieniem)

Okres A: sygnały 1998-2018; okres B: 2019-07 ... 2026 (otwarty po raz pierwszy). Uniwersum: płynne spółki USA, cena >= 5 USD.

## H1: czy spółki spełniające Trend Template wypadają lepiej od rynku

nadwyzka_TT_za_H = średni zwrot spółek z TT minus średnia wszystkich spółek uniwersum (winsoryzacja 1/99 % w miesiącu), za H miesięcy.

| okres       |   H_mies |   sr_spolek_TT |   udzial_TT |   nadwyzka_TT_za_H |   nadwyzka_rocznie |   t_NW |   miesiecy |   dodatnie |
|:------------|---------:|---------------:|------------:|-------------------:|-------------------:|-------:|-----------:|-----------:|
| A 1998-2018 |        1 |        493.738 |      0.161  |             0.0037 |             0.0447 | 1.5437 |        252 |     0.5952 |
| A 1998-2018 |        3 |        493.738 |      0.161  |             0.0093 |             0.0379 | 1.6929 |        252 |     0.631  |
| A 1998-2018 |        6 |        493.738 |      0.161  |             0.0166 |             0.0335 | 1.4878 |        252 |     0.6706 |
| A 1998-2018 |       12 |        493.738 |      0.161  |             0.023  |             0.023  | 1.1839 |        252 |     0.6786 |
| B 2019-2026 |        1 |        559.239 |      0.1583 |             0.0039 |             0.0481 | 1.4671 |         88 |     0.6023 |
| B 2019-2026 |        3 |        567.4   |      0.1577 |             0.0107 |             0.0436 | 1.7689 |         85 |     0.6    |
| B 2019-2026 |        6 |        563.329 |      0.1568 |             0.0201 |             0.0406 | 2.0329 |         82 |     0.6951 |
| B 2019-2026 |       12 |        543.026 |      0.1545 |             0.0152 |             0.0152 | 0.7241 |         77 |     0.6883 |

## H2: transakcje (wejście po otwarciu następnej sesji, stop w trakcie sesji, wyjście pod SMA 50, koszt 0,1 %/stronę)

| okres       | typ        |   transakcji |    sr_w |   mediana |   trafione |   stop |   udzial_10proc_najlepszych |   f60_med |   f250_med |
|:------------|:-----------|-------------:|--------:|----------:|-----------:|-------:|----------------------------:|----------:|-----------:|
| A 1998-2018 | TT bez VCP |        57899 |  0.0065 |   -0.0295 |     0.3195 | 0.2748 |                      0.7814 |    0.0177 |     0.045  |
| A 1998-2018 | TT + VCP   |         8282 |  0.0045 |   -0.0555 |     0.2898 | 0.4369 |                      0.7905 |    0.0079 |     0.0098 |
| B 2019-2026 | TT bez VCP |        24574 |  0.001  |   -0.0376 |     0.2932 | 0.3267 |                      0.8126 |    0.0087 |     0.0313 |
| B 2019-2026 | TT + VCP   |         3027 | -0.0083 |   -0.0645 |     0.2699 | 0.4784 |                      0.7726 |    0.0058 |     0.0144 |

Różnica średniego zwrotu na transakcję (TT + VCP minus TT bez VCP, 95 % bootstrap blokowy po miesiącach):

| okres       |   roznica_VCP_minus_TT | ci95           |
|:------------|-----------------------:|:---------------|
| A 1998-2018 |                -0.002  | -0.84…0.54 pp  |
| B 2019-2026 |                -0.0093 | -1.71…-0.10 pp |

Czas trzymania (dni kalendarzowe):

| okres       | typ        |   mediana_dni |   srednia_dni |
|:------------|:-----------|--------------:|--------------:|
| A 1998-2018 | TT + VCP   |            26 |            39 |
| A 1998-2018 | TT bez VCP |            27 |            40 |
| B 2019-2026 | TT + VCP   |            18 |            34 |
| B 2019-2026 | TT bez VCP |            21 |            35 |

## Portfel: maks. 10 pozycji, równe kwoty, kolejność sygnałów wg RP

| okres       | portfel    | od      | do      |    CAGR |   maxDD |   Sharpe |
|:------------|:-----------|:--------|:--------|--------:|--------:|---------:|
| A 1998-2018 | TT bez VCP | 1998-01 | 2019-06 | -0.0194 | -0.7064 |   0.0807 |
| A 1998-2018 | TT + VCP   | 1998-01 | 2019-06 |  0.0244 | -0.6428 |   0.2219 |
| A 1998-2018 | SPY        | 1998-01 | 2019-06 |  0.0716 | -0.5078 |   0.5395 |
| B 2019-2026 | TT bez VCP | 2019-07 | 2026-11 |  0.1066 | -0.5142 |   0.3836 |
| B 2019-2026 | TT + VCP   | 2019-07 | 2026-11 | -0.0432 | -0.5163 |  -0.0246 |
| B 2019-2026 | SPY        | 2019-07 | 2026-11 |  0.1513 | -0.2393 |   0.9517 |
