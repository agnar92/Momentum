"""Etap 94: stabilnie rosnące po podwojeniu kursu (3 lata) vs pozostałe stabilnie rosnące. Protokół: etap 94."""
import os
HERE = os.path.dirname(os.path.abspath(__file__))
_s92 = open(os.path.join(HERE, 'r117_etap92.py')).read()
exec(_s92[:_s92.index("SYG = [")])
exec(_s92[_s92.index("def nadw(h):"):_s92.index("rows = []")])
rng = np.random.default_rng(94)
Z3 = X['zwrot_3l']
rows = []
for nm, A_, B_ in (('kurs ≥ +100 % w 3 lata vs < +100 %', STAB & (nz(Z3, -9) >= 1.0), STAB & np.isfinite(Z3) & (nz(Z3, 9) < 1.0)),
                   ('kurs ≥ +100 % w 3 lata vs < +50 %', STAB & (nz(Z3, -9) >= 1.0), STAB & np.isfinite(Z3) & (nz(Z3, 9) < 0.5))):
    r = {'stabilnie rosnące': nm}
    for h in (12, 36):
        na, nb, d0, lo, hi = test(A_, B_, h)
        r[f'n {h} m'] = f'{na}/{nb}'; r[f'po 2× − reszta {h} m (pp)'] = f'{d0:+.1f} [{lo:+.1f}; {hi:+.1f}]' if d0 == d0 else '–'
    rows.append(r); print(r, flush=True)
out = ['# Etap 94: stabilnie rosnące po podwojeniu kursu', '', 'Różnica median nadwyżki nad medianą zbioru (pp), 95 % przedział z bootstrapu po latach; ujemna = Lynch ma rację.', '',
       pd.DataFrame(rows).to_markdown(index=False), '']
open(os.path.join(HERE, 'wyniki', 'r119_etap94.md'), 'w').write('\n'.join(out)); print('\n'.join(out))
