# Etap 69c: portfele wzorców — decyzja raz w roku / co kwartał / co miesiąc (2012-01..2026-09, równe wagi)

| wzorzec                  | decyzja              |   CAGR |   maxDD |   sr_spolek |
|:-------------------------|:---------------------|-------:|--------:|------------:|
| PARABOLA (typ NVIDIA)    | raz w roku (styczeń) |  0.201 |  -0.439 |       6.136 |
| PARABOLA (typ NVIDIA)    | co kwartał           |  0.231 |  -0.287 |       6.432 |
| PARABOLA (typ NVIDIA)    | co miesiąc           |  0.164 |  -0.438 |       6.562 |
| STABILNY (typ Microsoft) | raz w roku (styczeń) |  0.137 |  -0.405 |       5.841 |
| STABILNY (typ Microsoft) | co kwartał           |  0.105 |  -0.398 |       6.358 |
| STABILNY (typ Microsoft) | co miesiąc           |  0.123 |  -0.377 |       6.472 |
| SPY                      | -                    |  0.147 |  -0.239 |     nan     |
| QQQ                      | -                    |  0.196 |  -0.326 |     nan     |

Bez NVDA (PARABOLA): raz w roku 17,0 %, co kwartał 19,4 %, co miesiąc 13,5 %.
Uwaga: w styczniu wzorzec PARABOLA ma 0-5 spółek (wyjątki: 2022 - 38, 2023 - 19), więc wynik zależy od pojedynczych spółek w pojedynczych latach (2013 +58 %, 2014 +65 % z 1-2 spółek, 2020 TTWO +61 %); różnice między częstotliwościami (3-7 pp) to szum.
Ta wersja portfela trzyma spółkę do końca notowań (r94 pomijał spółki bez ceny w następnym miesiącu), stąd inne liczby niż w r94 (13,7 / 9,9 %).
