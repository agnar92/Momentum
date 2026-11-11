# Walidacja 2013-07 ... 2018-12 (jedno spojrzenie, kryteria z protokołu)

## V1: spokojny trend (500 największych, rebalancing co miesiąc, netto)

| portfel                                  |   CAGR |   zmiennosc |   Sharpe |   maxDD |   roznica_mies |   ci95_lo |   ci95_hi |
|:-----------------------------------------|-------:|------------:|---------:|--------:|---------------:|----------:|----------:|
| odniesienie: równe wagi 500 największych | 0.0045 |      0.1242 |   0.0979 | -0.2229 |       nan      |  nan      |  nan      |
| spokojny trend top 10                    | 0.0639 |      0.1008 |   0.6664 | -0.1112 |         0.0046 |   -0.0013 |    0.0092 |
| spokojny trend top 50                    | 0.0779 |      0.0913 |   0.8686 | -0.0968 |         0.0056 |    0.0008 |    0.0084 |

Zmienność top 50 / zmienność odniesienia = 0.74 (kryterium <= 0,70); dolna granica różnicy = 0.08 pp/mies. (kryterium >= -0,25). **V1 NIE PRZESZEDŁ walidacji.**

Zwroty roczne:

|   rok |   odniesienie |   top 10 |   top 50 |
|------:|--------------:|---------:|---------:|
|  2013 |         0.081 |    0.078 |    0.071 |
|  2014 |         0.013 |    0.169 |    0.131 |
|  2015 |        -0.159 |   -0.057 |   -0.043 |
|  2016 |         0.185 |    0.098 |    0.126 |
|  2017 |         0.147 |    0.138 |    0.195 |
|  2018 |        -0.182 |   -0.057 |   -0.038 |

## V2: trailing stop po świeżym wybiciu (wejścia 2013-07 ... 2017-06)

| regula                |   wejsc |   sr_zwrot_w |   mediana |   sr_tyg |   zwrot_na_tydz_% |   roznica_vs_czas52_pp | ci95         |
|:----------------------|--------:|-------------:|----------:|---------:|------------------:|-----------------------:|:-------------|
| czas 52               |   24977 |       0.0709 |    0.0606 |  50.6176 |            0.1401 |                 0      |              |
| trailing 25           |   24977 |       0.1072 |    0.0061 |  71.9048 |            0.1491 |                 0.009  | -0.034…0.053 |
| stop 15 + trailing 25 |   24977 |       0.097  |   -0.0372 |  63.7914 |            0.1521 |                 0.0119 | -0.031…0.057 |

**V2 NIE PRZESZEDŁ walidacji** (trailing 25 vs czas 52, dolna granica 95 % > 0).
