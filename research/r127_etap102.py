"""Etap 102: fazy Weinsteina (kurs vs średnia ~30 tyg.) a zwrot. Protokół: etap 102."""
import os
HERE = os.path.dirname(os.path.abspath(__file__))
_s101 = open(os.path.join(HERE, 'r126_etap101.py')).read()
exec(_s101[:_s101.index("def opis(")])
rng = np.random.default_rng(102)
MA = pd.DataFrame(Cv).rolling(7, min_periods=7).mean().to_numpy()
ST = np.zeros((NT, NS), int)
for m in STARTY:
    i = im_[m]
    c, a, a1, a6 = Cv[i], MA[i], MA[i - 1], MA[i - 6]
    ok = np.isfinite(c) & np.isfinite(a) & np.isfinite(a1) & np.isfinite(a6) & (a1 > 0)
    sl = np.where(ok, a / np.where(ok, a1, 1) - 1, np.nan)
    s = np.zeros(NS, int)
    ros, mal, pl = ok & (sl >= 0.01), ok & (sl <= -0.01), ok & (np.abs(sl) < 0.01)
    s[ros & (c >= a)] = 2; s[ros & (c < a)] = 3; s[mal & (c < a)] = 4; s[mal & (c >= a)] = 1
    s[pl & (a >= a6)] = 3; s[pl & (a < a6)] = 1
    ST[i] = s
S_ = {k: ST == k for k in (1, 2, 3, 4)}
NAZ = {1: '1 Baza', 2: '2 Wzrost', 3: '3 Szczyt', 4: '4 Spadek'}
JAKOSC = PKT['P1 Jakość 7/7'] | PKT['P2 Siła ≥ 7']
DANE_ST = ST > 0


def opis(M, h, a, b):
    ex, bij, st = [], [], []
    for m in [m for m in STARTY if a <= m.year <= b and m <= KON[h]]:
        i = im_[m]; ok = UNI[i] & M[i] & np.isfinite(EX[h][i])
        ex += list(EX[h][i, ok]); bij += list(EX[h][i, ok] > 0); st += list(FW[h][i, ok] < 0)
    return (len(ex), 100 * np.median(ex), 100 * np.mean(bij), 100 * np.mean(st)) if ex else (0, np.nan, np.nan, np.nan)


rows = []
for k in (1, 2, 3, 4):
    r = {'faza kursu': NAZ[k]}
    for h in (12, 36):
        n, med, bij, st = opis(S_[k], h, 2012, 2023)
        r[f'n {h} m'] = n; r[f'nadwyżka {h} m'] = f'{med:+.1f} pp'; r[f'lepsze {h} m'] = f'{bij:.0f} %'; r[f'strata {h} m'] = f'{st:.0f} %'
    rows.append(r)
por = []
POR = [('A: 2 Wzrost vs 4 Spadek', S_[2], S_[4])] + [(f'B: {NAZ[k]} vs pozostałe', S_[k], DANE_ST & ~S_[k]) for k in (1, 2, 3, 4)] + [
    ('C: jakość, 4 Spadek vs pozostałe', JAKOSC & S_[4], JAKOSC & DANE_ST & ~S_[4]), ('C: jakość, 2 Wzrost vs pozostałe', JAKOSC & S_[2], JAKOSC & DANE_ST & ~S_[2]),
    ('C: jakość, 2 Wzrost vs 4 Spadek', JAKOSC & S_[2], JAKOSC & S_[4]), ('D: faza spółki 4 i kurs 2 vs faza spółki 4, kurs inny', F4 & S_[2], F4 & DANE_ST & ~S_[2])]
for nm, A_, B_ in POR:
    r = {'porównanie': nm}
    for h in (12, 36):
        na, nb, d0, lo, hi = test(A_, B_, h)
        r[f'n {h} m'] = f'{na}/{nb}'; r[f'różnica {h} m (pp)'] = f'{d0:+.1f} [{lo:+.1f}; {hi:+.1f}]' if d0 == d0 else '–'
        for a, b in ((2012, 2017), (2018, 2023)):
            ra, rb = opis(A_, h, a, b), opis(B_, h, a, b); r[f'{h} m {a % 100}–{b % 100}'] = f'{ra[1] - rb[1]:+.1f}'
        if h == 12: r['strata 12 m A/B'] = f'{opis(A_, 12, 2012, 2023)[3]:.0f} / {opis(B_, 12, 2012, 2023)[3]:.0f} %'
    por.append(r); print(r, flush=True)
lata = {m.year: {NAZ[k]: int((UNI[im_[m]] & S_[k][im_[m]]).sum()) for k in (1, 2, 3, 4)} for m in STARTY}
out = ['# Etap 102: fazy Weinsteina (kurs vs średnia ~30 tyg.) a zwrot', '',
       'Top 500 USA PIT bez wykluczonych sektorów, starty w styczniu 2012–2023; średnia 7 mies. z miesięcznych zamknięć (≈ 30 tyg.). Nadwyżka = mediana (zwrot − mediana zbioru).', '',
       '## Fazy kursu', '', pd.DataFrame(rows).to_markdown(index=False), '', '## Porównania (różnica median, 95 % przedział z bootstrapu po latach; połowy: różnica median)', '',
       pd.DataFrame(por).to_markdown(index=False), '', '## Liczba spółek w fazach (styczeń)', '', pd.DataFrame(lata).T.to_markdown(), '']
open(os.path.join(HERE, 'wyniki', 'r127_etap102.md'), 'w').write('\n'.join(out)); print('\n'.join(out))
