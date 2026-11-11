#!/bin/bash
# Pełny ciąg obliczeń od tabel tygodniowych (po r01_baza.py). Kolejność wynika z zależności i blokad zapisu DuckDB.
cd "$(dirname "$0")"
set -e
log() { echo "$(date +%H:%M) $1"; }
log r03; python3 r03_tygodnie.py > wyniki/r03.log 2>&1
log r04; python3 r04_ruchy.py > wyniki/r04.log 2>&1
log r06; python3 r06_zdarzenia.py > wyniki/r06.log 2>&1
log r08; python3 r08_katalizator.py > wyniki/r08.log 2>&1
log r11; python3 r11_panel.py > wyniki/r11p.log 2>&1
log r14; python3 r14_surowe_panel.py > wyniki/r14p.log 2>&1
log "r05 r09 r10"; python3 r05_opis.py > wyniki/r05.log 2>&1 & python3 r09_katalizator_test.py > wyniki/r09.log 2>&1; python3 r10_statystyka.py > wyniki/r10.log 2>&1; wait
log "r13 r12"; python3 r13_wyjscie.py > wyniki/r13.log 2>&1; python3 r12_model.py > wyniki/r12.log 2>&1; UNIW=duze python3 r12_model.py > wyniki/r12d.log 2>&1
log "r15"; python3 r15_uczenie.py > wyniki/r15.log 2>&1; python3 r15b_unikaj.py > wyniki/r15b.log 2>&1
log "r07 r07b"; rm -f wyniki/r07_kmeans.pkl; python3 r07_wzorce.py > wyniki/r07.log 2>&1; python3 r07b_ksztalt.py > wyniki/r07b.log 2>&1
log "r17 r18"; python3 r17_anatomia.py > wyniki/r17.log 2>&1; python3 r18_kontynuacja.py > wyniki/r18.log 2>&1
log r19; python3 r19_cem10.py > wyniki/r19.log 2>&1
log KONIEC
