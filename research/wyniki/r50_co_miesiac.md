# Etap 29c: PEG <= 1 i IV > cena sprawdzane co miesiąc / kwartał / rok (S&P 500 z danymi SEC, 2011-2026)

Odniesienia: równe wagi uniwersum 12,8 %, SPY 14,1 %, CEM10 21,9 % (etap 27).

| wzrost                                  |   N | trzymanie                          | decyzje    |   CAGR |   CAGR_2011_18 |   CAGR_2019_26 |   maxDD |   z_10k | roznica_vs_rowne   | lepszy   |
|:----------------------------------------|----:|:-----------------------------------|:-----------|-------:|---------------:|---------------:|--------:|--------:|:-------------------|:---------|
| A: CAGR EPS od początku (realne)        |  10 | dopóki tania (IV > cena, PEG <= 1) | co miesiąc |  0.11  |          0.082 |          0.139 |  -0.455 |   51483 | -0.02 (-0.49…0.44) | False    |
| A: CAGR EPS od początku (realne)        |  10 | dopóki tania (IV > cena, PEG <= 1) | co kwartał |  0.125 |          0.08  |          0.173 |  -0.35  |   63905 | +0.08 (-0.33…0.55) | False    |
| A: CAGR EPS od początku (realne)        |  10 | dopóki tania (IV > cena, PEG <= 1) | raz w roku |  0.117 |          0.059 |          0.181 |  -0.293 |   57387 | -0.00 (-0.44…0.42) | False    |
| A: CAGR EPS od początku (realne)        |  10 | dopóki w top 2N                    | co miesiąc |  0.087 |          0.071 |          0.104 |  -0.439 |   37469 | -0.22 (-0.59…0.19) | False    |
| A: CAGR EPS od początku (realne)        |  10 | dopóki w top 2N                    | co kwartał |  0.096 |          0.082 |          0.111 |  -0.434 |   42493 | -0.16 (-0.53…0.29) | False    |
| A: CAGR EPS od początku (realne)        |  10 | dopóki w top 2N                    | raz w roku |  0.102 |          0.094 |          0.109 |  -0.401 |   45882 | -0.12 (-0.56…0.34) | False    |
| A: CAGR EPS od początku (realne)        |  20 | dopóki tania (IV > cena, PEG <= 1) | co miesiąc |  0.118 |          0.075 |          0.165 |  -0.363 |   58333 | -0.00 (-0.39…0.40) | False    |
| A: CAGR EPS od początku (realne)        |  20 | dopóki tania (IV > cena, PEG <= 1) | co kwartał |  0.12  |          0.071 |          0.173 |  -0.367 |   59732 | +0.02 (-0.34…0.45) | False    |
| A: CAGR EPS od początku (realne)        |  20 | dopóki tania (IV > cena, PEG <= 1) | raz w roku |  0.111 |          0.065 |          0.16  |  -0.36  |   52420 | -0.07 (-0.48…0.29) | False    |
| A: CAGR EPS od początku (realne)        |  20 | dopóki w top 2N                    | co miesiąc |  0.098 |          0.073 |          0.125 |  -0.402 |   43631 | -0.16 (-0.50…0.21) | False    |
| A: CAGR EPS od początku (realne)        |  20 | dopóki w top 2N                    | co kwartał |  0.098 |          0.081 |          0.116 |  -0.416 |   43667 | -0.16 (-0.48…0.20) | False    |
| A: CAGR EPS od początku (realne)        |  20 | dopóki w top 2N                    | raz w roku |  0.098 |          0.073 |          0.123 |  -0.411 |   43370 | -0.16 (-0.56…0.28) | False    |
| B: jak analityk, błąd 10 pp (nierealne) |  10 | dopóki tania (IV > cena, PEG <= 1) | co miesiąc |  0.272 |          0.224 |          0.324 |  -0.208 |  443977 | +1.04 (0.70…1.56)  | True     |
| B: jak analityk, błąd 10 pp (nierealne) |  10 | dopóki tania (IV > cena, PEG <= 1) | co kwartał |  0.273 |          0.182 |          0.375 |  -0.239 |  448442 | +1.09 (0.72…1.67)  | True     |
| B: jak analityk, błąd 10 pp (nierealne) |  10 | dopóki tania (IV > cena, PEG <= 1) | raz w roku |  0.201 |          0.134 |          0.273 |  -0.264 |  178175 | +0.61 (0.26…1.09)  | True     |
| B: jak analityk, błąd 10 pp (nierealne) |  10 | dopóki w top 2N                    | co miesiąc |  0.264 |          0.21  |          0.321 |  -0.266 |  398193 | +0.99 (0.64…1.56)  | True     |
| B: jak analityk, błąd 10 pp (nierealne) |  10 | dopóki w top 2N                    | co kwartał |  0.265 |          0.169 |          0.372 |  -0.27  |  404334 | +1.04 (0.61…1.67)  | True     |
| B: jak analityk, błąd 10 pp (nierealne) |  10 | dopóki w top 2N                    | raz w roku |  0.199 |          0.148 |          0.255 |  -0.311 |  175224 | +0.60 (0.19…1.16)  | True     |
| B: jak analityk, błąd 10 pp (nierealne) |  20 | dopóki tania (IV > cena, PEG <= 1) | co miesiąc |  0.272 |          0.234 |          0.314 |  -0.249 |  444983 | +1.04 (0.72…1.51)  | True     |
| B: jak analityk, błąd 10 pp (nierealne) |  20 | dopóki tania (IV > cena, PEG <= 1) | co kwartał |  0.255 |          0.184 |          0.332 |  -0.255 |  356284 | +0.95 (0.62…1.47)  | True     |
| B: jak analityk, błąd 10 pp (nierealne) |  20 | dopóki tania (IV > cena, PEG <= 1) | raz w roku |  0.18  |          0.145 |          0.218 |  -0.285 |  135695 | +0.44 (0.18…0.82)  | True     |
| B: jak analityk, błąd 10 pp (nierealne) |  20 | dopóki w top 2N                    | co miesiąc |  0.269 |          0.217 |          0.325 |  -0.276 |  427169 | +1.02 (0.72…1.48)  | True     |
| B: jak analityk, błąd 10 pp (nierealne) |  20 | dopóki w top 2N                    | co kwartał |  0.264 |          0.193 |          0.342 |  -0.271 |  399792 | +1.01 (0.71…1.48)  | True     |
| B: jak analityk, błąd 10 pp (nierealne) |  20 | dopóki w top 2N                    | raz w roku |  0.188 |          0.153 |          0.225 |  -0.306 |  151234 | +0.50 (0.23…0.90)  | True     |
