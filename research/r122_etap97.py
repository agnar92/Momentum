"""Etap 97: P/FCF wśród spółek z D/E < 1 — progi, kwintyle, FCF ≤ 0, połowy. Protokół: etap 97."""
import os
HERE = os.path.dirname(os.path.abspath(__file__))
_s95 = open(os.path.join(HERE, 'r120_etap95.py')).read()
exec(_s95[:_s95.index("L = sum(")])
rng = np.random.default_rng(97)
DE = X['de']; FY = X['fcf_yield']
DE1 = np.isfinite(DE) & (nz(DE, 9) >= 0) & (nz(DE, 9) < 1)
POS = nz(FY, 0) > 0
PF = np.where(POS, 1 / np.where(POS, FY, 1), np.nan)
NEG = np.isfinite(FY) & (nz(FY, 1) <= 0)
SIL = PKT['P2 Siła ≥ 7']


def opis(M, h, a=2012, b=2023):
    ex, bij, st = [], [], []
    for m in STARTY:
        if not (a <= m.year <= b) or m > KON[h]: continue
        i = im_[m]; ok = UNI[i] & M[i] & np.isfinite(EX[h][i])
        ex += list(EX[h][i, ok]); bij += list(EX[h][i, ok] > 0); st += list(FW[h][i, ok] < 0)
    if not ex: return dict(n=0)
    return dict(n=len(ex), med=100 * np.median(ex), bij=100 * np.mean(bij), strata=100 * np.mean(st))


def wiersz(nm, A_, B_):
    r = {'wariant (A vs B)': nm}
    for h in (12, 36):
        na, nb, d0, lo, hi = test(A_, B_, h)
        r[f'n A/B {h} m'] = f'{na}/{nb}'; r[f'A − B {h} m (pp)'] = f'{d0:+.1f} [{lo:+.1f}; {hi:+.1f}]' if d0 == d0 else '–'
    p1 = [test_okres(A_, B_, 36, a, b) for a, b in ((2012, 2017), (2018, 2023))]
    r['A − B 36 m: 2012–17 / 2018–23'] = ' / '.join(f'{x:+.1f}' if x == x else '–' for x in p1)
    oa, ob = opis(A_, 36), opis(B_, 36)
    r['lepsze od mediany A/B'] = f"{oa.get('bij', 0):.0f} / {ob.get('bij', 0):.0f} %"; r['strata 36 m A/B'] = f"{oa.get('strata', 0):.0f} / {ob.get('strata', 0):.0f} %"
    d36 = test(A_, B_, 36)
    r['werdykt'] = 'działa' if d36[3] == d36[3] and (d36[3] > 0 or d36[4] < 0) and all(x == x and np.sign(x) == np.sign(d36[2]) for x in p1) else 'nie rozstrzyga'
    print(r, flush=True); return r


def test_okres(A_, B_, h, a, b):
    va, vb = [], []
    for m in STARTY:
        if not (a <= m.year <= b) or m > KON[h]: continue
        i = im_[m]; ok = UNI[i] & np.isfinite(EX[h][i])
        va += list(EX[h][i, ok & A_[i]]); vb += list(EX[h][i, ok & B_[i]])
    return 100 * (np.median(va) - np.median(vb)) if len(va) > 5 and len(vb) > 5 else np.nan


rows = []
for G_nm, G in (('D/E < 1', DE1), ('D/E < 1 i Siła ≥ 7', DE1 & SIL)):
    for pr in (10, 15, 20, 25, 30):
        rows.append(dict(grupa=G_nm, **wiersz(f'P/FCF ≤ {pr} vs > {pr}', G & POS & (nz(PF, 1e9) <= pr), G & POS & (nz(PF, 0) > pr))))
    rows.append(dict(grupa=G_nm, **wiersz('FCF > 0 vs FCF ≤ 0', G & POS, G & NEG)))
T1 = pd.DataFrame(rows)
# kwintyle P/FCF w D/E < 1
Q = np.full((NT, NS), np.nan)
for m in STARTY:
    i = im_[m]; ok = UNI[i] & DE1[i] & POS[i] & np.isfinite(PF[i])
    if ok.sum() > 50: Q[i, ok] = pd.qcut(pd.Series(PF[i, ok]).rank(method='first'), 5, labels=False).to_numpy()
rows = []
for q in range(5):
    M = Q == q
    pf_med = np.nanmedian(np.concatenate([PF[im_[m], np.flatnonzero(M[im_[m]])] for m in STARTY]))
    for h in (12, 36):
        pass
    o12, o36 = opis(M, 12), opis(M, 36)
    rows.append({'kwintyl P/FCF (D/E < 1)': ['K1 najtańszy', 'K2', 'K3', 'K4', 'K5 najdroższy'][q], 'mediana P/FCF': f'{pf_med:.1f}', 'n 36 m': o36['n'],
                 'nadwyżka 12 m': f"{o12['med']:+.1f} pp", 'nadwyżka 36 m': f"{o36['med']:+.1f} pp", 'lepsze od mediany 36 m': f"{o36['bij']:.0f} %", 'strata 36 m': f"{o36['strata']:.0f} %",
                 '36 m 2012–17': f"{opis(M, 36, 2012, 2017)['med']:+.1f} pp", '36 m 2018–23': f"{opis(M, 36, 2018, 2023)['med']:+.1f} pp"})
o = opis(DE1 & NEG, 36)
rows.append({'kwintyl P/FCF (D/E < 1)': 'FCF ≤ 0', 'mediana P/FCF': '–', 'n 36 m': o['n'], 'nadwyżka 12 m': f"{opis(DE1 & NEG, 12)['med']:+.1f} pp", 'nadwyżka 36 m': f"{o['med']:+.1f} pp",
             'lepsze od mediany 36 m': f"{o['bij']:.0f} %", 'strata 36 m': f"{o['strata']:.0f} %", '36 m 2012–17': f"{opis(DE1 & NEG, 36, 2012, 2017)['med']:+.1f} pp",
             '36 m 2018–23': f"{opis(DE1 & NEG, 36, 2018, 2023)['med']:+.1f} pp"})
T2 = pd.DataFrame(rows)
k15 = test(Q == 0, Q == 4, 36)
out = ['# Etap 97: P/FCF wśród spółek z długiem / kapitałem < 1', '',
       'Top 500 USA PIT bez wykluczonych sektorów, starty w styczniu 2012–2023. Nadwyżka = zwrot ceny minus mediana zbioru (wszystkich spółek) w tym samym starcie.', '',
       '## Progi P/FCF', '', T1.to_markdown(index=False), '', '## Kwintyle P/FCF (D/E < 1, FCF > 0)', '', T2.to_markdown(index=False), '',
       f'K1 (najtańszy) − K5 (najdroższy), 36 mies.: {k15[2]:+.1f} [{k15[3]:+.1f}; {k15[4]:+.1f}] pp.', '']
open(os.path.join(HERE, 'wyniki', 'r122_etap97.md'), 'w').write('\n'.join(out)); print('\n'.join(out))
