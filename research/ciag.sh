#!/bin/bash
# Pełny ciąg obliczeń od tabel tygodniowych (po r01_baza.py i r08_katalizator.py)
cd "$(dirname "$0")"
set -e
python3 r03_tygodnie.py > wyniki/r03.log 2>&1
python3 r04_ruchy.py > wyniki/r04.log 2>&1
python3 r06_zdarzenia.py > wyniki/r06.log 2>&1
python3 r05_opis.py > wyniki/r05.log 2>&1 &
python3 r09_katalizator_test.py > wyniki/r09.log 2>&1
wait
python3 r07_wzorce.py > wyniki/r07.log 2>&1 &
python3 r07b_ksztalt.py > wyniki/r07b.log 2>&1
wait
echo KONIEC
