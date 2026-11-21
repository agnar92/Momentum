"""Etap 85: pół na pół CEM10 + fundamentalna z N = 5 lub 10 spółkami na strategię. Protokół: etap 85."""
import os
HERE = os.path.dirname(os.path.abspath(__file__))
_s = open(os.path.join(HERE, 'r109_etap84.py')).read()
exec(_s[:_s.index("out = ['# Etap 84")])


def fund_eqN(WE, PS, N, bez=(), od='2013-01', do='2026-09'):
    poz, sp, eq = {}, 1.0, []
    wyl = np.isin(kod, list(bez)); mm = [m for m in mies if pd.Period(od, 'M') <= m <= pd.Period(do, 'M')]
    for a, m in enumerate(mm[:-1]):
        i, i1 = im_[m], im_[mm[a + 1]]
        for j in list(poz):
            if PS[i, j]: sp += poz.pop(j) * 0.999
        e = sp + sum(poz.values()); wolne = N - len(poz)
        if wolne > 0:
            k_ = np.flatnonzero(WE[i] & ~wyl & np.isfinite(Cv[i1]) & ~PS[i])
            for j in k_[np.argsort(-OG[i, k_])]:
                if wolne <= 0: break
                if j in poz: continue
                kw = min(e / N, sp)
                if kw < 0.2 * e / N: break
                poz[j] = kw * 0.999; sp -= kw; wolne -= 1
        for j in list(poz):
            if np.isfinite(Cv[i1, j]) and np.isfinite(Cv[i, j]) and Cv[i, j] > 0: poz[j] *= Cv[i1, j] / Cv[i, j]
            else: sp += poz.pop(j) * 0.999
        sp *= spy[mm[a + 1]] / spy[m]
        eq.append((mm[a + 1], sp + sum(poz.values()), len(poz)))
    s = pd.Series([v for _, v, _ in eq], index=[m for m, _, _ in eq])
    return pd.concat([pd.Series([1.0], index=[mm[0]]), s]), np.mean([n for _, _, n in eq]), [kod[j] for j in sorted(poz, key=lambda j: -poz[j])]


def cem_eqN(N, od='2013-01', do='2026-09', bez=()):
    f = (lambda m: {s for s in (SP.get(m) or set()) if s.split('.US')[0] not in bez}) if bez else (lambda m: SP.get(m))
    W, T = symuluj(f, od, do, N=N)
    return pd.concat([pd.Series([1.0], index=[pd.Period(od, 'M')]), W.kap]), W.n.mean(), T


F2W = ZB & (J7k == 7)
out = ['# Etap 85: pół na pół z N = 5 lub 10 spółkami na strategię (2013-01..2026-09)', '']
for okr, od, do in (('2013–2026', '2013-01', '2026-09'), ('2013–2019', '2013-01', '2019-12'), ('2020–2026', '2020-01', '2026-09')):
    S = spy_eq(od, do); Q = qqq[[m for m in qqq.index if pd.Period(od, 'M') <= m <= pd.Period(do, 'M')]]; Q = Q / Q.iloc[0]
    rows = [dict(portfel='SPY', **m_(S)), dict(portfel='QQQ', **m_(Q))]
    for N in (5, 10):
        Ce, nc, _ = cem_eqN(N, od, do); F1, n1, h1 = fund_eqN(E1, P1, N, od=od, do=do); F2, n2, h2 = fund_eqN(F2W, P1, N, od=od, do=do)
        rows += [dict(portfel=f"CEM10 N={N}", sr_spolek=nc, **m_(Ce)), dict(portfel=f'F1 ocena + PEG, N={N}', sr_spolek=n1, **m_(F1)),
                 dict(portfel=f'F2 Jakość 7/7, N={N}', sr_spolek=n2, **m_(F2)),
                 dict(portfel=f'{N} CEM10 + {N} F1 (50/50, co rok)', sr_spolek=nc + n1, **m_(polacz(Ce, F1, "rok"))),
                 dict(portfel=f'{N} CEM10 + {N} F2 (50/50, co rok)', sr_spolek=nc + n2, **m_(polacz(Ce, F2, "rok")))]
        if okr == '2013–2026':
            R = pd.DataFrame({'SPY': roczne(S), "CEM10": roczne(Ce), 'F2': roczne(F2), '50/50 CEM10+F2': roczne(polacz(Ce, F2, "rok")), "50/50 CEM10+F1": roczne(polacz(Ce, F1, "rok"))})
            out += [f'### Rok po roku, N = {N} (2013–2026)', '', (100 * R).round(1).to_markdown(), '',
                    f'Dziś w F2 (N={N}): ' + ', '.join(h2) + f'; w F1: ' + ', '.join(h1), '']
        print(okr, N, flush=True)
    out += [f'## {okr}', '', pd.DataFrame(rows).round(3).to_markdown(index=False), '']
rows = []
for N in (5, 10):
    Cb, nc, _ = cem_eqN(N, bez=('NVDA',)); Fb, nb, _ = fund_eqN(F2W, P1, N, bez=('NVDA',)); F1b, _, _ = fund_eqN(E1, P1, N, bez=('NVDA',))
    rows += [dict(portfel=f'CEM10 N={N} bez NVDA', **m_(Cb)), dict(portfel=f'F2 N={N} bez NVDA', **m_(Fb)),
             dict(portfel=f'{N}+{N} CEM10 + F2 bez NVDA', **m_(polacz(Cb, Fb, 'rok'))), dict(portfel=f'{N}+{N} CEM10 + F1 bez NVDA', **m_(polacz(Cb, F1b, 'rok')))]
out += ['## Bez NVDA (2013–2026)', '', pd.DataFrame(rows).round(3).to_markdown(index=False), '']
open(os.path.join(HERE, 'wyniki', 'r110_etap85.md'), 'w').write('\n'.join(out)); print('\n'.join(out))
