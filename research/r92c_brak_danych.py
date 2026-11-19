"""Etap 68b: jak etap 68, ale brak danych przy kryterium nie liczy się jako niespełnione przy TRZYMANIU (kupno nadal wymaga 7/7 z danymi); liczba trzymanych i wynik."""
import os, numpy as np, pandas as pd
HERE = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(HERE, 'r90_hello_stocks.py')).read(); exec(src[:src.index("\nout = [")])
def wynik_tr(PEG):
    t = lambda war, X: np.where(np.isfinite(X), war, True)
    K = [t(RV5 > 0.5, RV5), t(RV1 > 0.05, RV1), t(G1 > 0.05, G1), t(ROE > 0.15, ROE), t((DE >= 0) & (DE < 1), DE), t(FCF > 0, FCF), t((PEG > 0) & (PEG < 1), PEG)]
    return sum(np.asarray(k, int) for k in K) * SEKT[None, :] + (~SEKT[None, :]) * -9
def sim(SCk, SCt, S, E):
    poz = {}; wpl = 0.0; wl = 0; ile = []
    mies = [m for m in ms if S <= m <= E]
    for m in mies:
        i = im_[m]
        for j in list(poz):
            if m != mies[0] and (SCt[i, j] <= 5 or not np.isfinite(Cv[i, j])):
                wpl += poz.pop(j)[0] * (Cv[i, j] if np.isfinite(Cv[i, j]) else 0)
        for j in np.flatnonzero((SCk[i] == 7) & np.isfinite(Cv[i])):
            if j not in poz: poz[j] = (1 / Cv[i, j],); wl += 1
        ile.append(len(poz))
    i = im_[E]; otw = sum(u * Cv[i, j] for j, (u,) in poz.items() if np.isfinite(Cv[i, j]))
    return wl, len(poz), (wpl + otw) / wl - 1, int(np.median(ile))
out = ['# Etap 68b: brak danych przy trzymaniu = kryterium spełnione (top 500 USA)', '']
for nm, PEG in (('PEG z EPS', PEG_EPS), ('PEG z przychodów', PEG_REV)):
    SCk = wynik(PEG); SCt = wynik_tr(PEG)
    for S in (pd.Period('2015-01', 'M'), pd.Period('2023-01', 'M'), pd.Period('2025-01', 'M')):
        a = sim(SCk, SCk, S, KONIEC); b = sim(SCk, SCt, S, KONIEC)
        out.append(f'- {nm}, start {S}: brak danych = niespełnione: zakupów {a[0]}, trzymanych na koniec {a[1]}, zysk {a[2]:+.1%}; '
                   f'brak danych = spełnione: zakupów {b[0]}, trzymanych {b[1]}, zysk {b[2]:+.1%}')
        print(out[-1], flush=True)
open(os.path.join(HERE, 'wyniki', 'r92c_brak_danych.md'), 'w').write('\n'.join(out) + '\n')
