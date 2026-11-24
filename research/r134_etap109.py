"""Etap 109: stabilny wzrost przychodów i EPS 5 lat — cecha i pierwszeństwo w portfelu top 10. Protokół: etap 109."""
import os
HERE = os.path.dirname(os.path.abspath(__file__))
_s107 = open(os.path.join(HERE, 'r132_etap107.py')).read()
exec(_s107[:_s107.index("def portfel(")])
rng = np.random.default_rng(109)
S5 = np.zeros((NT, NS), bool); S55 = np.zeros((NT, NS), bool); DANE5 = np.zeros((NT, NS), bool)
for j in range(NS):
    k = kod[j]
    if k not in cache: continue
    sq = cache[k]
    if 'rev' not in sq or 'ni' not in sq or 'sh' not in sq: continue
    for r in LATA:
        m = pd.Period(f'{r}-01', 'M'); i = im_[m]
        if not UNI[i, j]: continue
        t = m.to_timestamp(how='end')
        e0, _ = sq['rev'].teraz(t)
        if e0 is None: continue
        rv = [sq['rev'].przy(t, e0 - n * Y) for n in range(6)]
        ni = [sq['ni'].przy(t, e0 - n * Y) for n in range(6)]
        sh = [sq['sh'].przy(t, e0 - n * Y) for n in range(6)]
        if any(v is None for v in rv + ni + sh) or any(s <= 0 for s in sh): continue
        eps = [ni[n] / (sh[n] * podziel(k, e0 - n * Y, e0)) for n in range(6)]
        ru = sum(rv[n] > rv[n + 1] for n in range(5)); eu = sum(eps[n] > eps[n + 1] for n in range(5))
        DANE5[i, j] = True; S5[i, j] = ru == 5 and eu >= 4; S55[i, j] = ru == 5 and eu == 5
print('ocen:', DANE5.sum(), 'S:', S5.sum(), 'S55:', S55.sum(), flush=True)


def polowy(A_, B_, h):
    out = []
    for a, b in ((2012, 2017), (2018, 2023)):
        ea, eb = [], []
        for m in [m for m in STARTY if a <= m.year <= b and m <= KON[h]]:
            i = im_[m]
            ea += list(EX[h][i, A_[i] & UNI[i] & np.isfinite(EX[h][i])]); eb += list(EX[h][i, B_[i] & UNI[i] & np.isfinite(EX[h][i])])
        out.append(100 * (np.median(ea) - np.median(eb)) if ea and eb else np.nan)
    return out


rowsA = []
for nm, A_, B_ in (('S (przychody 5/5, EPS ≥ 4/5) vs reszta', S5, DANE5 & ~S5), ('S55 (oba 5/5) vs reszta', S55, DANE5 & ~S55)):
    r = {'porównanie': nm}
    for h in (12, 36):
        na, nb, d0, lo, hi = test(A_, B_, h); p1, p2 = polowy(A_, B_, h)
        r[f'n {h} m'] = f'{na}/{nb}'; r[f'różnica {h} m (pp)'] = f'{d0:+.1f} [{lo:+.1f}; {hi:+.1f}]'; r[f'{h} m 12–17 / 18–23'] = f'{p1:+.1f} / {p2:+.1f}'
    rowsA.append(r); print(r, flush=True)


def portfel2(M, klucz):
    wart, liczba, sklady, pop = [1.0], [], {}, set()
    for r in LATA:
        m0 = pd.Period(f'{r}-01', 'M'); i0 = im_[m0]
        kand = np.flatnonzero(M[i0] & UNI[i0] & np.isfinite(Cv[i0]) & (Cv[i0] > 0) & np.isfinite(SILA[i0]))
        kand = kand[np.argsort(-klucz[i0, kand])][:10]
        liczba.append(len(kand)); sklady[r] = [kod[j] for j in kand]
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


_o = _s107[_s107.index("def opis(s):"):_s107.index("S = SPY.loc")]; exec(_o)
S = SPY.loc[pd.Period('2012-01', 'M'):DO]; S = S / S.iloc[0]
cs, dds, s1, s2, rs = opis(S)
rowsB = [{'portfel': 'SPY', 'rocznie': f'{100 * cs:.1f} %', 'obsunięcie': f'{100 * dds:.0f} %', '2012–18': f'{100 * s1:.1f} %', '2019–26': f'{100 * s2:.1f} %', 'spółek': '—', 'w tym S': '—'}]
POOL = WAR['B: Jakość 7/7 + 7/7 bez PEG + bez ⬇']
SIL = np.nan_to_num(SILA, nan=-1)
for nm, kl in (('B: tylko Siła (etap 107)', SIL), ('B: najpierw stabilny wzrost S, potem Siła', SIL + 100 * S5), ('B: najpierw S55, potem S, potem Siła', SIL + 100 * S5 + 100 * S55)):
    s, n, sk = portfel2(POOL, kl)
    c, dd, h1, h2, ro = opis(s)
    ws = np.mean([np.mean([S5[im_[pd.Period(f'{r}-01', 'M')], list(kod).index(t)] for t in v]) for r, v in sk.items() if v])
    rowsB.append({'portfel': nm, 'rocznie': f'{100 * c:.1f} %', 'obsunięcie': f'{100 * dd:.0f} %', '2012–18': f'{100 * h1:.1f} %', '2019–26': f'{100 * h2:.1f} %',
                  'spółek': f'{np.mean(n):.1f}', 'w tym S': f'{100 * ws:.0f} %'})
    print(rowsB[-1], flush=True)
out = ['# Etap 109: stabilny wzrost przychodów i EPS 5 lat', '', '## A. Cecha (nadwyżka nad medianą zbioru, różnica median, 95 % przedział z bootstrapu po latach)', '',
       pd.DataFrame(rowsA).to_markdown(index=False), '', '## B. Portfel top 10 (pula B z etapu 107), przegląd w styczniu', '', pd.DataFrame(rowsB).to_markdown(index=False), '']
open(os.path.join(HERE, 'wyniki', 'r134_etap109.md'), 'w').write('\n'.join(out)); print('\n'.join(out))
