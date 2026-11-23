"""Etap 98: spółki z ujemnym kapitałem własnym — skup akcji, ROA, ROCE. Protokół: etap 98."""
import os
HERE = os.path.dirname(os.path.abspath(__file__))
_s95 = open(os.path.join(HERE, 'r120_etap95.py')).read()
exec(_s95[:_s95.index("L = sum(")])
rng = np.random.default_rng(98)
UJ = nz(X['ksiegowa_rynkowa'], 9) < 0
ALL = np.ones((NT, NS), bool)


def opis(M, h):
    ex, bij, st = [], [], []
    for m in [m for m in STARTY if m <= KON[h]]:
        i = im_[m]; ok = UNI[i] & M[i] & np.isfinite(EX[h][i])
        ex += list(EX[h][i, ok]); bij += list(EX[h][i, ok] > 0); st += list(FW[h][i, ok] < 0)
    return (len(ex), 100 * np.median(ex), 100 * np.mean(bij), 100 * np.mean(st)) if ex else (0, np.nan, np.nan, np.nan)


rows = []
for nm, A_, B_ in (('ujemny kapitał vs dodatni', UJ, ~UJ & np.isfinite(X['ksiegowa_rynkowa'])),
                   ('ujemny kapitał: skup netto 12 m > 2 % kapit. vs reszta', UJ & (nz(C['skup_mc'], -9) > 0.02), UJ & np.isfinite(C['skup_mc']) & (nz(C['skup_mc'], 9) <= 0.02)),
                   ('ujemny kapitał: akcje 3 lata ≤ −2 % vs reszta', UJ & (nz(X['C3_akcje_3l'], 9) <= -0.02), UJ & np.isfinite(X['C3_akcje_3l']) & (nz(X['C3_akcje_3l'], -9) > -0.02)),
                   ('ujemny kapitał: ROA ≥ 10 % vs < 10 %', UJ & (nz(X['roa'], -9) >= 0.10), UJ & np.isfinite(X['roa']) & (nz(X['roa'], 9) < 0.10)),
                   ('ujemny kapitał: ROCE ≥ 15 % vs < 15 %', UJ & (nz(X['roce'], -9) >= 0.15), UJ & np.isfinite(X['roce']) & (nz(X['roce'], 9) < 0.15))):
    r = {'porównanie (A vs B)': nm}
    for h in (12, 36):
        na, nb, d0, lo, hi = test(A_, B_, h)
        r[f'n A/B {h} m'] = f'{na}/{nb}'; r[f'A − B {h} m (pp)'] = f'{d0:+.1f} [{lo:+.1f}; {hi:+.1f}]' if d0 == d0 else '–'
    a, b = opis(A_, 36), opis(B_, 36)
    r['lepsze od mediany A/B'] = f'{a[2]:.0f} / {b[2]:.0f} %'; r['strata 36 m A/B'] = f'{a[3]:.0f} / {b[3]:.0f} %'
    rows.append(r); print(r, flush=True)
lata = {m.year: int((UNI[im_[m]] & UJ[im_[m]]).sum()) for m in STARTY}
out = ['# Etap 98: spółki z ujemnym kapitałem własnym (bez ROE)', '', f'Liczba spółek z ujemnym kapitałem w zbiorze w styczniu: {lata}', '',
       pd.DataFrame(rows).to_markdown(index=False), '']
open(os.path.join(HERE, 'wyniki', 'r123_etap98.md'), 'w').write('\n'.join(out)); print('\n'.join(out))
