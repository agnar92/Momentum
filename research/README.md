# Badanie ruchów ceny (research)

Badanie wzorców dużych ruchów akcji USA na danych EODHD (1998-2026, ze spółkami wycofanymi).
Plan: dokument "Plan badania ruchów ceny" (claude.ai). Protokół i odstępstwa: `protokol.md`.
Rejestr wszystkich testów: `rejestr.csv`. Wyniki etapów: `wyniki/`.

## Kolejność uruchamiania

Wymaga pełnej bazy `eodhd.duckdb` (skrypty `01_symbols.py` ... `05_finalize.py` z paczki EODHD Lite)
i pakietów: duckdb pandas numpy scipy statsmodels scikit-learn lightgbm lifelines yfinance tabulate.

```bash
export EODHD_DB=/sciezka/eodhd.duckdb RESEARCH_DB=/sciezka/research.duckdb
python r01_baza.py      # etap 1: baza dzienna, czyszczenie (widok dc)
python r02_audyt.py     # etap 1: audyt -> wyniki/r02_audyt.md
python r03_tygodnie.py  # etap 2: świece tygodniowe i miesięczne, tło rynku
python r04_ruchy.py     # etap 2: tabela ruchów (zygzak 15/25/35 %)
```

Próba ucząca 1998-2012, walidacja 2013-07 ... 2018, test nietknięty 2019-07 ... (otwierany raz).
