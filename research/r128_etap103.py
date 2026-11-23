"""Etap 103: cykl życia spółki wg Lyncha (start, szybka ekspansja, dojrzewanie, dojrzałość, schyłek) a zwrot. Protokół: etap 103."""
import os
HERE = os.path.dirname(os.path.abspath(__file__))
_s101 = open(os.path.join(HERE, 'r126_etap101.py')).read()
exec(_s101[:_s101.index("def opis(")])
rng = np.random.default_rng(103)
g1, g3, g5, om = X['rev_1y'], X['rev_cagr3'], X['rev_cagr5'], X['om']
DANE = np.isfinite(g3) & np.isfinite(om) & np.isfinite(g1)
L5 = DANE & (g3 < 0)
BEZ = DANE & ~L5 & (om <= 0)
POPR = nz(C['ni_teraz'], -np.inf) > nz(C['ni_rok_temu'], np.inf)
L2a = BEZ & POPR & (g3 >= 0.15)
L1 = BEZ & ~L2a
ZYS = DANE & ~L5 & (om > 0)
L2b = ZYS & (g3 >= 0.15) & (g1 >= 0.15)
L3 = ZYS & ~L2b & ((g3 >= 0.15) | (nz(g5, 0) >= 0.15)) & (g1 < 0.15)
L4 = ZYS & ~L2b & ~L3
FL = {'1 Start': L1, '2 Szybka ekspansja': L2a | L2b, '3 Dojrzewanie': L3, '4 Dojrzałość': L4, '5 Schyłek': L5}


def opis(M, h, a, b):
    ex, bij, st = [], [], []
    for m in [m for m in STARTY if a <= m.year <= b and m <= KON[h]]:
        i = im_[m]; ok = UNI[i] & M[i] & np.isfinite(EX[h][i])
        ex += list(EX[h][i, ok]); bij += list(EX[h][i, ok] > 0); st += list(FW[h][i, ok] < 0)
    return (len(ex), 100 * np.median(ex), 100 * np.mean(bij), 100 * np.mean(st)) if ex else (0, np.nan, np.nan, np.nan)


rows = []
for nm, M in list(FL.items()) + [('wszystkie z danymi', DANE)]:
    r = {'faza': nm}
    for h in (12, 36):
        n, med, bij, st = opis(M, h, 2012, 2023)
        r[f'n {h} m'] = n; r[f'nadwyżka {h} m'] = f'{med:+.1f} pp'; r[f'lepsze {h} m'] = f'{bij:.0f} %'; r[f'strata {h} m'] = f'{st:.0f} %'
    for a, b in ((2012, 2017), (2018, 2023)):
        n, med, _, _ = opis(M, 36, a, b); r[f'36 m {a % 100}–{b % 100}'] = f'{med:+.1f} pp ({n})'
    rows.append(r)
F2, F3 = FL['2 Szybka ekspansja'], FL['3 Dojrzewanie']
por = []
for nm, A_, B_ in [(f'{k} vs pozostałe', M, DANE & ~M) for k, M in FL.items()] + [('3 Dojrzewanie vs 2 Szybka ekspansja', F3, F2), ('1 i 5 vs 2–4', FL['1 Start'] | L5, DANE & ~(FL['1 Start'] | L5))]:
    r = {'porównanie': nm}
    for h in (12, 36):
        na, nb, d0, lo, hi = test(A_, B_, h)
        r[f'n {h} m'] = f'{na}/{nb}'; r[f'różnica {h} m (pp)'] = f'{d0:+.1f} [{lo:+.1f}; {hi:+.1f}]' if d0 == d0 else '–'
    for a, b in ((2012, 2017), (2018, 2023)):
        ra, rb = opis(A_, 36, a, b), opis(B_, 36, a, b); r[f'36 m {a % 100}–{b % 100}'] = f'{ra[1] - rb[1]:+.1f}'
    por.append(r); print(r, flush=True)
lata = {m.year: {k: int((UNI[im_[m]] & M[im_[m]]).sum()) for k, M in FL.items()} for m in STARTY}
out = ['# Etap 103: cykl życia spółki wg Lyncha a zwrot', '',
       'Top 500 USA PIT bez wykluczonych sektorów, starty w styczniu 2012–2023. Nadwyżka = mediana (zwrot − mediana zbioru).', '',
       '## Fazy', '', pd.DataFrame(rows).to_markdown(index=False), '', '## Porównania (różnica median, 95 % przedział z bootstrapu po latach)', '',
       pd.DataFrame(por).to_markdown(index=False), '', '## Liczba spółek w fazach (styczeń)', '', pd.DataFrame(lata).T.to_markdown(), '']
open(os.path.join(HERE, 'wyniki', 'r128_etap103.md'), 'w').write('\n'.join(out)); print('\n'.join(out))
