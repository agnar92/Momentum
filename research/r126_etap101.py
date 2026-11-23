"""Etap 101: faza spółki (1 Start, 2 Hiperwzrost, 3 Dźwignia operacyjna, 4 Zwrot kapitału, 5 Schyłek) a zwrot. Protokół: etap 101."""
import os
HERE = os.path.dirname(os.path.abspath(__file__))
_s95 = open(os.path.join(HERE, 'r120_etap95.py')).read()
exec(_s95[:_s95.index("L = sum(")])
rng = np.random.default_rng(101)
DANE = np.isfinite(X['rev_cagr3']) & np.isfinite(X['om'])
SCH = DANE & (X['rev_cagr3'] < 0)
STR = DANE & ~SCH & (X['om'] <= 0)
F2 = STR & (nz(C['ni_teraz'], -np.inf) > nz(C['ni_rok_temu'], np.inf))
F1 = STR & ~F2
ZYSK = DANE & ~SCH & (X['om'] > 0)
ZWROT = (nz(C['dyw'], 0) == 1) | (nz(C['skup_mc'], -1) > 0)
F4 = ZYSK & ZWROT
F3 = ZYSK & ~ZWROT
FAZY = {'1 Start': F1, '2 Hiperwzrost': F2, '3 Dźwignia operacyjna': F3, '4 Zwrot kapitału': F4, '5 Schyłek': SCH}


def opis(M, h, a, b):
    ex, bij, st = [], [], []
    for m in [m for m in STARTY if a <= m.year <= b and m <= KON[h]]:
        i = im_[m]; ok = UNI[i] & M[i] & np.isfinite(EX[h][i])
        ex += list(EX[h][i, ok]); bij += list(EX[h][i, ok] > 0); st += list(FW[h][i, ok] < 0)
    return (len(ex), 100 * np.median(ex), 100 * np.mean(bij), 100 * np.mean(st)) if ex else (0, np.nan, np.nan, np.nan)


rows = []
for nm, M in list(FAZY.items()) + [('wszystkie z danymi', DANE)]:
    r = {'faza': nm}
    for h in (12, 36):
        n, med, bij, st = opis(M, h, 2012, 2023)
        r[f'n {h} m'] = n; r[f'nadwyżka {h} m'] = f'{med:+.1f} pp'; r[f'lepsze od mediany {h} m'] = f'{bij:.0f} %'; r[f'strata {h} m'] = f'{st:.0f} %'
    for a, b in ((2012, 2017), (2018, 2023)):
        n, med, bij, st = opis(M, 36, a, b); r[f'36 m {a}–{b % 100}'] = f'{med:+.1f} pp ({n})'
    rows.append(r)
por = []
for nm, A_, B_ in [(f'{k} vs pozostałe', M, DANE & ~M) for k, M in FAZY.items()] + [('3–4 vs 1, 2, 5', F3 | F4, F1 | F2 | SCH)]:
    r = {'porównanie': nm}
    for h in (12, 36):
        na, nb, d0, lo, hi = test(A_, B_, h)
        r[f'n {h} m'] = f'{na}/{nb}'; r[f'różnica {h} m (pp)'] = f'{d0:+.1f} [{lo:+.1f}; {hi:+.1f}]' if d0 == d0 else '–'
    for a, b in ((2012, 2017), (2018, 2023)):
        ra, rb = opis(A_, 36, a, b), opis(B_, 36, a, b); r[f'36 m {a}–{b % 100}'] = f'{ra[1] - rb[1]:+.1f} pp'
    por.append(r); print(r, flush=True)
lata = {m.year: {k: int((UNI[im_[m]] & M[im_[m]]).sum()) for k, M in FAZY.items()} for m in STARTY}
out = ['# Etap 101: faza spółki (cykl życia) a zwrot', '',
       'Top 500 USA PIT bez wykluczonych sektorów, starty w styczniu 2012–2023. Nadwyżka = mediana (zwrot − mediana zbioru w tym starcie).', '',
       '## Fazy', '', pd.DataFrame(rows).to_markdown(index=False), '', '## Porównania (różnica median, 95 % przedział z bootstrapu po latach)', '',
       pd.DataFrame(por).to_markdown(index=False), '', '## Liczba spółek w fazach (styczeń)', '', pd.DataFrame(lata).T.to_markdown(), '']
open(os.path.join(HERE, 'wyniki', 'r126_etap101.md'), 'w').write('\n'.join(out)); print('\n'.join(out))
