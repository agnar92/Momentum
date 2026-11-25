"""Etap 113: portfel 10 spółek z najwyższym potencjałem DCF. Protokół: etap 113."""
import os
HERE = os.path.dirname(os.path.abspath(__file__))
_s107 = open(os.path.join(HERE, 'r132_etap107.py')).read()
exec(_s107[:_s107.index("def portfel(")])
_o = _s107[_s107.index("def opis(s):"):_s107.index("S = SPY.loc")]; exec(_o)
_s105 = open(os.path.join(HERE, 'r130_etap105.py')).read()
exec(_s105[_s105.index("def dcf_wzgl("):_s105.index("TANIO = {}")])
rng = np.random.default_rng(113)
STARTY = [pd.Period(f'{y}-01', 'M') for y in range(2012, 2024)]
KON[60] = pd.Period('2021-09', 'M')
if 60 not in FW:
    A_ = np.full((NT, NS), np.nan); A_[:-60] = Cv[60:] / Cv[:-60] - 1; FW[60] = A_
EX[60] = nadw(60)
POT = np.full((NT, NS), np.nan)
for r in LATA:
    i = im_[pd.Period(f'{r}-01', 'M')]
    for j in np.flatnonzero(UNI[i]):
        ps, mz, g3, nc = X['ps'][i, j], X['fcf_margin'][i, j], X['rev_cagr3'][i, j], X['net_cash_mc'][i, j]
        if np.isfinite(ps) and ps > 0 and np.isfinite(mz) and mz > 0 and np.isfinite(g3):
            POT[i, j] = dcf_wzgl(1 / ps, min(0.60, mz), max(0.0, min(0.25, g3)), nc if np.isfinite(nc) else 0.0) - 1
print('z DCF w styczniu (średnio):', np.mean([np.isfinite(POT[im_[pd.Period(f"{r}-01", "M")]]).sum() for r in LATA]), flush=True)


def portfel_k(M, klucz, n=10):
    wart, liczba, sklady, pop = [1.0], [], {}, set()
    for r in LATA:
        m0 = pd.Period(f'{r}-01', 'M'); i0 = im_[m0]
        kand = np.flatnonzero(M[i0] & UNI[i0] & np.isfinite(Cv[i0]) & (Cv[i0] > 0) & np.isfinite(klucz[i0]))
        kand = kand[np.argsort(-klucz[i0, kand])][:n] if n else kand
        liczba.append(len(kand)); sklady[r] = [(kod[j], round(100 * float(klucz[i0, j]))) for j in kand[:12]]
        nowe = set(kand.tolist()); obrot = 1.0 if not pop else (len(nowe - pop) / max(1, len(nowe)) if nowe else 1.0)
        v = wart[-1] * (1 - KOSZT * 2 * obrot); pop = nowe
        konc = min(pd.Period(f'{r + 1}-01', 'M'), DO); okres = pd.period_range(m0 + 1, konc, freq='M')
        if len(kand):
            q = {j: v / len(kand) / Cv[i0, j] for j in kand}
            for mm in okres:
                tot = 0.0
                for j, qq in q.items():
                    kol = Cv[im_[m0]:im_[mm] + 1, j]; ok = np.flatnonzero(np.isfinite(kol) & (kol > 0)); tot += qq * kol[ok[-1]]
                wart.append(tot)
        else:
            for mm in okres: wart.append(v * SPY[mm] / SPY[m0])
        if konc >= DO: break
    s = pd.Series(wart, index=[pd.Period('2012-01', 'M')] + list(pd.period_range('2012-02', DO, freq='M'))[:len(wart) - 1])
    return s, liczba, sklady


nz = lambda A_, v: np.nan_to_num(A_, nan=v)
ZDR = (nz(X['fcf_margin'], -1) > 0) & (nz(X['de'], 9) >= 0) & (nz(X['de'], 9) < 1)
S = SPY.loc[pd.Period('2012-01', 'M'):DO]; S = S / S.iloc[0]
cs, dds, s1, s2, rs = opis(S)
rows = [{'portfel': 'SPY (S&P 500)', 'rocznie': f'{100 * cs:.1f} %', '10 tys. →': f'{10000 * S.iloc[-1]:,.0f}'.replace(',', ' '), 'obsunięcie': f'{100 * dds:.0f} %',
         '2012–18': f'{100 * s1:.1f} %', '2019–26': f'{100 * s2:.1f} %', 'lata lepsze od SPY': '—', 'spółek': '—'}]
SKL = {}
for nm, M, kl, n in (('Równe wagi całego zbioru', UNI, np.where(UNI, 0.0, np.nan), None),
                     ('A: top 10 po potencjale DCF', UNI, POT, 10),
                     ('B: top 10 DCF wśród FCF > 0 i D/E < 1', ZDR, POT, 10),
                     ('C: top 10 DCF wśród Jakość 7/7 + 7/7 + bez ⬇ (pula etapu 107)', WAR['B: Jakość 7/7 + 7/7 bez PEG + bez ⬇'], POT, 10)):
    s, liczba, sk = portfel_k(M, kl, n); SKL[nm] = sk
    c, dd, h1, h2, ro = opis(s)
    lep = sum(1 for y in ro.index if y in rs.index and ro[y] > rs[y])
    rows.append({'portfel': nm, 'rocznie': f'{100 * c:.1f} %', '10 tys. →': f'{10000 * s.iloc[-1]:,.0f}'.replace(',', ' '), 'obsunięcie': f'{100 * dd:.0f} %',
                 '2012–18': f'{100 * h1:.1f} %', '2019–26': f'{100 * h2:.1f} %', 'lata lepsze od SPY': f'{lep} z {len(ro)}', 'spółek': f'{np.mean(liczba):.0f}'})
    print(rows[-1], flush=True)

POL = {12: ((2012, 2017), (2018, 2023)), 36: ((2012, 2017), (2018, 2023)), 60: ((2012, 2016), (2017, 2021))}


def polowy(A_, B_, h):
    out = []
    for a, b in POL[h]:
        ea, eb = [], []
        for m in [m for m in STARTY if a <= m.year <= b and m <= KON[h]]:
            i = im_[m]
            ea += list(EX[h][i, A_[i] & UNI[i] & np.isfinite(EX[h][i])]); eb += list(EX[h][i, B_[i] & UNI[i] & np.isfinite(EX[h][i])])
        out.append(100 * (np.median(ea) - np.median(eb)) if len(ea) >= 10 and len(eb) >= 10 else np.nan)
    return out


D10 = np.zeros((NT, NS), bool); RESZ = np.zeros((NT, NS), bool)
for m in STARTY:
    i = im_[m]; v = POT[i]; ok = np.isfinite(v) & UNI[i]
    if ok.sum() > 50:
        prog = np.nanpercentile(v[ok], 90); D10[i] = ok & (v >= prog); RESZ[i] = ok & (v < prog)
rowsC = []
for h in (12, 36, 60):
    na, nb, d0, lo, hi = test(D10, RESZ, h); p1, p2 = polowy(D10, RESZ, h)
    rowsC.append({'horyzont': f'{h} mies.', 'n': f'{na}/{nb}', 'górne 10 % DCF vs reszta (pp)': f'{d0:+.1f} [{lo:+.1f}; {hi:+.1f}]', 'połowy': f'{p1:+.1f} / {p2:+.1f}'})
    print(rowsC[-1], flush=True)
sk = SKL['A: top 10 po potencjale DCF']
out = ['# Etap 113: portfel 10 spółek z najwyższym potencjałem DCF', '', 'Przegląd w styczniu, równe wagi, koszt 0,1 % obrotu, 2012-01 → 2026-09.', '',
       pd.DataFrame(rows).to_markdown(index=False), '', '## Najwyższe 10 % potencjału DCF vs reszta (nadwyżka nad medianą, bootstrap po latach)', '',
       pd.DataFrame(rowsC).to_markdown(index=False), '', '## Skład portfela A (ticker, potencjał DCF %)', '']
out += [f'- {r}: ' + ', '.join(f'{t} {p:+d} %' for t, p in v) for r, v in sk.items()]
open(os.path.join(HERE, 'wyniki', 'r138_etap113.md'), 'w').write('\n'.join(out) + '\n'); print('\n'.join(out))
