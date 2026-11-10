# Etap 5: ślad katalizatora i wolumen (wybicia 1998-01 ... 2012-06)

Zdarzeń: 66,224; odsetek sukcesu s50: 17.9 %.

## P3: ślad katalizatora w tygodniu wybicia lub tygodniu przed

OR = iloraz szans sukcesu z flagą vs bez, przy tych samych decylach zwrotu 26 tyg. i roku; błędy grupowane po miesiącu.

| flaga                       |   udzial |   s50_z |   s50_bez |    OR | ci95      |        p |   f52_z |   f52_bez |     q_BH |
|:----------------------------|---------:|--------:|----------:|------:|:----------|---------:|--------:|----------:|---------:|
| luka >= 4 % i wolumen >= 3x |    0.089 |   0.213 |     0.176 | 1.134 | 1.04-1.24 | 0.00509  |   0.539 |     0.32  | 0.00678  |
| luka >= 2 % i wolumen >= 2x |    0.193 |   0.216 |     0.17  | 1.219 | 1.13-1.31 | 1.62e-07 |   0.312 |     0.346 | 6.46e-07 |
| luka >= 8 % i wolumen >= 5x |    0.034 |   0.193 |     0.179 | 0.955 | 0.84-1.09 | 0.492    |   0.926 |     0.319 | 0.492    |
| dzień +8 % i wolumen >= 3x  |    0.122 |   0.228 |     0.172 | 1.201 | 1.10-1.31 | 2.55e-05 |   0.344 |     0.339 | 5.11e-05 |

Kwintyle największego dziennego wolumenu względnego w tygodniu wybicia (lub tydzień przed):

|   kw_rv |   max_rv_mediana |     n |   s50 |   f52_sr |   mfe_med |
|--------:|-----------------:|------:|------:|---------:|----------:|
|       0 |            1.115 | 13245 | 0.159 |    0.286 |     0.213 |
|       1 |            1.515 | 13245 | 0.159 |    0.356 |     0.214 |
|       2 |            1.978 | 13244 | 0.175 |    0.274 |     0.221 |
|       3 |            2.783 | 13245 | 0.193 |    0.244 |     0.228 |
|       4 |            5.35  | 13245 | 0.209 |    0.537 |     0.234 |

## P4: czy wolumen poprawia prognozę sukcesu (LightGBM, prognozy spoza próby 2003-2012)

AUC cena: 0.6268; cena + wolumen: 0.6262; placebo (wolumen przetasowany): 0.6270.

ΔAUC (cena + wolumen − cena) = -0.0006, 95 % blokowo: -0.0037 … 0.0022; odsetek losowań ≤ 0: 0.6645.

ΔAUC placebo = 0.0002, 95 %: -0.0023 … 0.0030.

Lata z dodatnią różnicą: 5 z 10.

|   rok |   AUC_cena |   AUC_cena_wolumen |   roznica |
|------:|-----------:|-------------------:|----------:|
|  2003 |     0.6223 |             0.6165 |   -0.0058 |
|  2004 |     0.5693 |             0.5659 |   -0.0034 |
|  2005 |     0.6537 |             0.658  |    0.0043 |
|  2006 |     0.6296 |             0.6361 |    0.0065 |
|  2007 |     0.6332 |             0.631  |   -0.0022 |
|  2008 |     0.6574 |             0.6508 |   -0.0066 |
|  2009 |     0.5424 |             0.5359 |   -0.0065 |
|  2010 |     0.6153 |             0.6177 |    0.0024 |
|  2011 |     0.6052 |             0.6054 |    0.0002 |
|  2012 |     0.6584 |             0.6612 |    0.0028 |

Kwintyle prognozy, model cena (0 = najniższa):

|   kwintyl |   s50 |   f52_sr |   f52_med |
|----------:|------:|---------:|----------:|
|         0 | 0.085 |    0.703 |     0.095 |
|         1 | 0.147 |    0.422 |     0.084 |
|         2 | 0.177 |    0.235 |     0.057 |
|         3 | 0.212 |    0.114 |     0.055 |
|         4 | 0.275 |    0.258 |     0.031 |

Kwintyle prognozy, model cena + wolumen (0 = najniższa):

|   kwintyl |   s50 |   f52_sr |   f52_med |
|----------:|------:|---------:|----------:|
|         0 | 0.086 |    0.726 |     0.096 |
|         1 | 0.147 |    0.401 |     0.078 |
|         2 | 0.176 |    0.236 |     0.056 |
|         3 | 0.213 |    0.107 |     0.061 |
|         4 | 0.274 |    0.262 |     0.034 |
