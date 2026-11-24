"""Etap 108: PEG z limitem wzrostu 25 % (Lynch) vs bez limitu. Protokół: etap 108."""
import os
HERE = os.path.dirname(os.path.abspath(__file__))
_s92 = open(os.path.join(HERE, 'r117_etap92.py')).read()
exec(_s92[:_s92.index("SYG = [")])
exec(_s92[_s92.index("def nadw(h):"):_s92.index("rows = []")])
rng = np.random.default_rng(108)
PE_, PEG_ = X['pe'], X['peg']
G = np.where(np.isfinite(PEG_) & (PEG_ > 0) & np.isfinite(PE_) & (PE_ > 0), PE_ / (100 * PEG_), np.nan)     # wzrost użyty w PEG
PEG25 = np.where(np.isfinite(G), PE_ / (100 * np.minimum(G, 0.25)), np.nan)
ok = np.isfinite(PEG_) & (PEG_ > 0)
POR = [('(1) PEG < 1 tylko dzięki wzrostowi > 25 % vs PEG25 < 1', ok & (PEG_ < 1) & (PEG25 >= 1), ok & (PEG25 < 1)),
       ('(2) PEG < 2 tylko dzięki wzrostowi > 25 % vs PEG25 < 2', ok & (PEG_ < 2) & (PEG25 >= 2), ok & (PEG25 < 2)),
       ('(3) PEG25 < 1 vs PEG < 1', ok & (PEG25 < 1), ok & (PEG_ < 1)),
       ('(4) PEG25 < 1 vs reszta z PEG', ok & (PEG25 < 1), ok & (PEG25 >= 1))]


def polowy(A_, B_, h):
    out = []
    for a, b in ((2012, 2017), (2018, 2023)):
        ea, eb = [], []
        for m in [m for m in STARTY if a <= m.year <= b and m <= KON[h]]:
            i = im_[m]
            ea += list(EX[h][i, A_[i] & UNI[i] & np.isfinite(EX[h][i])]); eb += list(EX[h][i, B_[i] & UNI[i] & np.isfinite(EX[h][i])])
        out.append(100 * (np.median(ea) - np.median(eb)) if ea and eb else np.nan)
    return out


rows = []
for nm, A_, B_ in POR:
    r = {'porównanie': nm}
    for h in (12, 36):
        na, nb, d0, lo, hi = test(A_, B_, h)
        p1, p2 = polowy(A_, B_, h)
        r[f'n {h} m'] = f'{na}/{nb}'; r[f'różnica {h} m (pp)'] = f'{d0:+.1f} [{lo:+.1f}; {hi:+.1f}]' if d0 == d0 else '–'; r[f'{h} m 12–17 / 18–23'] = f'{p1:+.1f} / {p2:+.1f}'
    rows.append(r); print(r, flush=True)
udz = np.nanmean([np.mean(G[im_[m]][UNI[im_[m]] & ok[im_[m]]] > 0.25) for m in STARTY])
out = ['# Etap 108: PEG z limitem wzrostu 25 % (Lynch)', '', f'PEG z przeszłego wzrostu zysku 5 lat; wzrost > 25 % miało średnio {100 * udz:.0f} % spółek z PEG. Nadwyżka nad medianą zbioru.', '',
       pd.DataFrame(rows).to_markdown(index=False), '']
open(os.path.join(HERE, 'wyniki', 'r133_etap108.md'), 'w').write('\n'.join(out)); print('\n'.join(out))
