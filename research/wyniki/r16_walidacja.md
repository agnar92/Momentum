# Walidacja 2013-07 ... 2018-12 (jedno spojrzenie, kryteria z protokołu)

## V1: spokojny trend (500 największych, rebalancing co miesiąc, netto)

| portfel                                  |   CAGR |   zmiennosc |   Sharpe |   maxDD |   roznica_mies |   ci95_lo |   ci95_hi |
|:-----------------------------------------|-------:|------------:|---------:|--------:|---------------:|----------:|----------:|
| odniesienie: równe wagi 500 największych | 0.0104 |      0.1237 |   0.1454 | -0.2169 |       nan      |  nan      |  nan      |
| SPY (opisowo)                            | 0.0972 |      0.1085 |   0.9117 | -0.1353 |       nan      |  nan      |  nan      |
| RSP (opisowo)                            | 0.0829 |      0.1118 |   0.7701 | -0.1391 |       nan      |  nan      |  nan      |
| spokojny trend top 10                    | 0.0664 |      0.1019 |   0.6836 | -0.1112 |         0.0043 |   -0.0015 |    0.0089 |
| spokojny trend top 50                    | 0.0821 |      0.0924 |   0.902  | -0.0972 |         0.0054 |    0.0006 |    0.0086 |

Zmienność top 50 / zmienność odniesienia = 0.75 (kryterium <= 0,70); dolna granica różnicy = 0.06 pp/mies. (kryterium >= -0,25). **V1 NIE PRZESZEDŁ walidacji.**

Zwroty roczne:

|   rok |   odniesienie |   top 10 |   top 50 |
|------:|--------------:|---------:|---------:|
|  2013 |         0.09  |    0.085 |    0.067 |
|  2014 |         0.017 |    0.165 |    0.153 |
|  2015 |        -0.156 |   -0.056 |   -0.036 |
|  2016 |         0.194 |    0.096 |    0.124 |
|  2017 |         0.152 |    0.151 |    0.191 |
|  2018 |        -0.178 |   -0.059 |   -0.035 |

## V2: trailing stop po świeżym wybiciu (wejścia 2013-07 ... 2017-06)

| regula                |   wejsc |   sr_zwrot_w |   mediana |   sr_tyg |   zwrot_na_tydz_% |   roznica_vs_czas52_pp | ci95         |
|:----------------------|--------:|-------------:|----------:|---------:|------------------:|-----------------------:|:-------------|
| czas 52               |   24961 |       0.0719 |    0.0608 |  50.5924 |            0.1422 |                 0      |              |
| trailing 25           |   24961 |       0.108  |    0.0067 |  71.94   |            0.1501 |                 0.008  | -0.035…0.052 |
| stop 15 + trailing 25 |   24961 |       0.0976 |   -0.0363 |  63.8236 |            0.1529 |                 0.0108 | -0.032…0.055 |

**V2 NIE PRZESZEDŁ walidacji** (trailing 25 vs czas 52, dolna granica 95 % > 0).
