"""Etap 121: dobre fundamenty (rosnące zarobki i sprzedaż, mały dług, duża wolna gotówka, rosnąca cena). Protokół: etap 121."""
import os
HERE = os.path.dirname(os.path.abspath(__file__))
_s113 = open(os.path.join(HERE, 'r138_etap113.py')).read()
exec(_s113[:_s113.index("print('z DCF")])
_a = _s113.index("def portfel_k"); exec(_s113[_a:_s113.index("return s, liczba, sklady", _a) + len("return s, liczba, sklady")])
exec(_s113[_s113.index("POL = {"):_s113.index("D10 = ")])
rng = np.random.default_rng(121)
nz = lambda A_, v: np.nan_to_num(A_, nan=v)
WSZ = [pd.Period(f'{y}-01', 'M') for y in range(2012, 2027)]

KON[60] = pd.Period('2021-09', 'M')
MOM = np.full((NT, NS), np.nan)
for m in WSZ:
    i = im_[m]
    if i >= 12: MOM[i] = Cv[i] / Cv[i - 12] - 1
f = lambda k: np.where(np.isfinite(X[k]), X[k], np.nan)
R = np.isfinite(X['rev_1y']) & (X['rev_1y'] >= 0.05) & np.isfinite(X['ni_1y']) & (X['ni_1y'] >= 0.05) & np.isfinite(X['rev_cagr3']) & (X['rev_cagr3'] > 0)
D05 = np.isfinite(X['de']) & (X['de'] >= 0) & (X['de'] <= 0.5)
D1 = np.isfinite(X['de']) & (X['de'] >= 0) & (X['de'] < 1)
G = np.isfinite(X['fcf_margin']) & (X['fcf_margin'] >= 0.10)
GN = G & np.isfinite(X['net_cash_mc']) & (X['net_cash_mc'] > 0)
C5 = np.isfinite(MOM) & (MOM >= 0.05)
C20 = np.isfinite(MOM) & (MOM >= 0.20)
ZN = lambda k: np.isfinite(X[k])
DAN = {'R': ZN('rev_1y') & ZN('ni_1y') & ZN('rev_cagr3'), 'D': ZN('de'), 'G': ZN('fcf_margin'), 'GN': ZN('fcf_margin') & ZN('net_cash_mc'), 'C': np.isfinite(MOM)}
ZB = {'rosnące przychody i zysk': (R, 'R'), 'mały dług D/E ≤ 0,5': (D05, 'D'), 'D/E < 1': (D1, 'D'), 'marża FCF ≥ 10 %': (G, 'G'),
      'marża FCF ≥ 10 % i gotówka netto > 0': (GN, 'GN'), 'cena 12 mies. ≥ +5 %': (C5, 'C'), 'cena 12 mies. ≥ +20 %': (C20, 'C')}
ZESTAWY = {'R+D+G (bez ceny)': (R & D05 & G, ['R', 'D', 'G']), 'R+D+G+C5 (pełny zestaw)': (R & D05 & G & C5, ['R', 'D', 'G', 'C']),
           'R+D+G+C20': (R & D05 & G & C20, ['R', 'D', 'G', 'C']), 'R+D1+G+C5': (R & D1 & G & C5, ['R', 'D', 'G', 'C']),
           'R+D+GN+C5': (R & D05 & GN & C5, ['R', 'D', 'GN', 'C']), 'R+D+GN (bez ceny)': (R & D05 & GN, ['R', 'D', 'GN'])}
WS = np.isin(np.arange(NT), [im_[m] for m in WSZ])[:, None] & UNI
print('pule w styczniu:', {k: [int((w & WS)[im_[pd.Period(f"{r}-01", "M")]].sum()) for r in range(2012, 2027)] for k, (w, _) in ZESTAWY.items()}, flush=True)
def porown(A_, B_, nazwa, wiersze, uwagi=''):
    for h in (12, 36, 60):
        na, nb, d0, lo, hi = test(A_, B_, h); p1, p2 = polowy(A_, B_, h)
        wiersze.append({'grupa': nazwa, 'horyzont': f'{h} mies.', 'n': f'{na}/{nb}', 'różnica (pp)': f'{d0:+.1f} [{lo:+.1f}; {hi:+.1f}]', 'połowy': f'{p1:+.1f} / {p2:+.1f}',
                        'działa': 'tak' if h >= 36 and lo > 0 and p1 > 0 and p2 > 0 else ''})
        print(wiersze[-1], flush=True)



rowsE = []
for nm, (W_, kl) in ZB.items():
    ok = WS & DAN[kl]
    porown(ok & W_, ok & ~W_, f'element: {nm}', rowsE)
rowsZ = []
for nm, (W_, kl) in ZESTAWY.items():
    ok = WS.copy()
    for k in kl: ok = ok & DAN[k]
    porown(ok & W_, ok & ~W_, f'zestaw: {nm} vs reszta z danymi', rowsZ)
    porown(ok & W_, WS & ~W_ & DAN['C'], f'zestaw: {nm} vs cały zbiór poza zestawem', rowsZ)
okc = WS & DAN['R'] & DAN['D'] & DAN['G'] & DAN['C']
rowsC = []
base = R & D05 & G
porown(okc & base & C5, okc & base & ~C5, 'wkład ceny w puli R+D+G: ≥ +5 % vs poniżej', rowsC)
porown(okc & base & C20, okc & base & ~C20, 'wkład ceny w puli R+D+G: ≥ +20 % vs poniżej', rowsC)
S0 = SPY.loc[pd.Period('2012-01', 'M'):DO]; S0 = S0 / S0.iloc[0]
cs, dds, s1, s2, rs = opis(S0)
rowsP = [{'portfel': 'SPY (S&P 500)', 'rocznie': f'{100 * cs:.1f} %', 'obsunięcie': f'{100 * dds:.0f} %', '2012–18': f'{100 * s1:.1f} %', '2019–26': f'{100 * s2:.1f} %', 'bije SPY w obu połowach': '—', 'spółek': '—'}]
sU, lU, _ = portfel_k(UNI, np.where(UNI, 0.0, np.nan), None)
c, dd, h1, h2, ro = opis(sU)
rowsP.append({'portfel': 'Równe wagi całego zbioru', 'rocznie': f'{100 * c:.1f} %', 'obsunięcie': f'{100 * dd:.0f} %', '2012–18': f'{100 * h1:.1f} %', '2019–26': f'{100 * h2:.1f} %', 'bije SPY w obu połowach': 'tak' if h1 > s1 and h2 > s2 else 'nie', 'spółek': f'{np.mean(lU):.0f}'})
for nm, (W_, kl) in ZESTAWY.items():
    s, lc, _ = portfel_k(W_, np.where(W_, 1.0, np.nan), None)
    c, dd, h1, h2, ro = opis(s)
    rowsP.append({'portfel': nm, 'rocznie': f'{100 * c:.1f} %', 'obsunięcie': f'{100 * dd:.0f} %', '2012–18': f'{100 * h1:.1f} %', '2019–26': f'{100 * h2:.1f} %', 'bije SPY w obu połowach': 'tak' if h1 > s1 and h2 > s2 else 'nie', 'spółek': f'{np.mean(lc):.0f} (min {min(lc)})'})
    print(rowsP[-1], flush=True)
out = ['# Etap 121: dobre fundamenty — rosnące zarobki i sprzedaż, mały dług, duża wolna gotówka, rosnąca cena', '', 'Top 500 USA PIT bez wykluczonych sektorów, starty w styczniu 2012–2023; różnica median zwrotu (pp) grupa vs reszta.', '',
       '## 1. Elementy osobno', '', pd.DataFrame(rowsE).to_markdown(index=False), '', '## 2. Zestawy', '', pd.DataFrame(rowsZ).to_markdown(index=False), '', '## 3. Wkład ceny w puli R+D+G', '', pd.DataFrame(rowsC).to_markdown(index=False), '',
       '## 4. Portfele (równe wagi, przegląd w styczniu, koszt 0,1 %), 2012-01 → 2026-09', '', pd.DataFrame(rowsP).to_markdown(index=False)]
open(os.path.join(HERE, 'wyniki', 'r146_etap121.md'), 'w').write('\n'.join(out) + '\n'); print('\n'.join(out[-8:]))
