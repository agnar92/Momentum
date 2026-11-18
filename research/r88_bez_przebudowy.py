"""Etap 66: kupno raz (wielkość 5 %/PEG, max 10 %), bez przebudowy; sprzedaż przy wysokim P/E i PEG."""
import os, numpy as np, pandas as pd
HERE = os.path.dirname(os.path.abspath(__file__))
exec(open(os.path.join(HERE, 'r87_dlug_wagi_peg.py')).read().split('\nrows = []')[0])   # UNI, PEG, Cv, D, mat, miary, portfel, R0, R1
PEm = mat(D['P/E'].values)


def sim(wyj='X1', stala=None, bez=(), log=None):
    poz, sp, eq, ile, udz = {}, 1.0, [], [], []
    wyl = np.isin(tick, list(bez))
    for a, m in enumerate(mies[:-1]):
        i = im_[m]; i1 = im_[mies[a + 1]]
        pe, pg = nz(PEm[i]), nz(PEG[i])
        for j in list(poz):
            hi = {'X1': pe[j] > 50 and pg[j] > 3, 'X2': pe[j] > 40 and pg[j] > 3, 'X3': pe[j] > 30 and pg[j] > 2,
                  'X4': (pe[j] > 50 and pg[j] > 3) or (R0[i, j] < 0.08 and R1[i, j] < 0.08), 'X0': False}[wyj]
            if hi:
                sp += poz.pop(j) * (1 - KOSZT)
                if log is not None: log.append((str(m), 'SPRZEDAJ', tick[j], round(float(PEm[i, j]), 1), round(float(PEG[i, j]), 2)))
        e = sp + sum(poz.values())
        ok = np.flatnonzero(UNI[i] & ~wyl & (pg > 0) & np.isfinite(Cv[i]) & np.isfinite(Cv[i1]))
        ok = [j for j in ok[np.argsort(pg[ok])] if j not in poz]
        for j in ok:
            w = stala if stala else min(0.10, max(0.01, 0.05 / pg[j]))
            kw = min(w * e, sp)
            if kw < 0.005 * e: break
            poz[j] = kw * (1 - KOSZT); sp -= kw
            if log is not None: log.append((str(m), 'KUP', tick[j], round(float(PEm[i, j]), 1), round(float(PEG[i, j]), 2), round(kw / e, 3)))
        for j in list(poz):
            if np.isfinite(Cv[i1, j]) and np.isfinite(Cv[i, j]): poz[j] *= Cv[i1, j] / Cv[i, j]
            else: sp += poz.pop(j) * (1 - KOSZT)
        if np.isfinite(SPYR[i]): sp *= 1 + SPYR[i]
        tot = sp + sum(poz.values()); eq.append((mies[a + 1], tot)); ile.append(len(poz)); udz.append(sum(poz.values()) / tot)
    e = pd.Series(dict(eq)); s = spy[(spy.index >= mies[1]) & (spy.index <= mies[-1])] / spy[mies[0]]; e = e.reindex(s.index)
    tot = e.iloc[-1]; naj = max(poz.items(), key=lambda x: x[1]) if poz else (None, 0)
    return dict(**miary(e, s, len(e) / 12, ew), sr_spolek=np.mean(ile), udzial=np.mean(udz), najwieksza=f'{tick[naj[0]]} {naj[1] / tot:.0%}' if naj[0] is not None else '')


ew, s, lat = portfel(lambda i: (np.flatnonzero(CZL[i]), np.zeros(NS)), N=0)
rows = []
for w, wn in (('X1', 'P/E > 50 i PEG > 3'), ('X2', 'P/E > 40 i PEG > 3'), ('X3', 'P/E > 30 i PEG > 2'), ('X4', 'X1 lub przychody < 8 % dwa lata'), ('X0', 'nigdy')):
    rows.append(dict(wariant=f'sprzedaż: {wn}', **sim(w))); print(w, rows[-1]['CAGR'], rows[-1]['najwieksza'], flush=True)
rows.append(dict(wariant='sprzedaż X1, bez NVDA', **sim('X1', bez=('NVDA',))))
rows.append(dict(wariant='sprzedaż X0 (nigdy), bez NVDA', **sim('X0', bez=('NVDA',))))
rows.append(dict(wariant='sprzedaż X1, wielkość stała 5 %', **sim('X1', stala=0.05)))
rows.append(dict(wariant='sprzedaż X3, bez NVDA', **sim('X3', bez=('NVDA',))))
T = pd.DataFrame(rows)
LOG = []; sim('X1', log=LOG)
out = ['# Etap 66: bez przebudowy; kupno raz (5 %/PEG, max 10 %), sprzedaż przy wysokim P/E i PEG; 2015-01..2026-09', '', 'SPY 14,1 %/rok, DD -23,9 %.', '',
       T.round(3).to_markdown(index=False), '', '## Transakcje (X1)', '', pd.DataFrame(LOG).to_markdown(index=False), '']
open(os.path.join(HERE, 'wyniki', 'r88_bez_przebudowy.md'), 'w').write('\n'.join(out)); print('\n'.join(out[:20]))
