"""Etap 84: pół na pół CEM10 i strategia fundamentalna. Protokół: etap 84."""
import os
HERE = os.path.dirname(os.path.abspath(__file__))
_s = open(os.path.join(HERE, 'r108_etap83.py')).read()
exec(_s[:_s.index("out = ['# Etap 83")])


def fund_eq(WE, PS, bez=(), od='2013-01', do='2026-09'):
    poz, sp, eq = {}, 1.0, []
    wyl = np.isin(kod, list(bez)); mm = [m for m in mies if pd.Period(od, 'M') <= m <= pd.Period(do, 'M')]
    for a, m in enumerate(mm[:-1]):
        i, i1 = im_[m], im_[mm[a + 1]]
        for j in list(poz):
            if PS[i, j]: sp += poz.pop(j) * 0.999
        e = sp + sum(poz.values())
        k_ = np.flatnonzero(WE[i] & ~wyl & np.isfinite(Cv[i1]) & ~PS[i]); n = 0
        for j in k_[np.argsort(-OG[i, k_])]:
            if n >= 4: break
            if j in poz: continue
            kw = min(0.04 * e, sp)
            if kw < 0.01 * e: break
            poz[j] = kw * 0.999; sp -= kw; n += 1
        for j in list(poz):
            if np.isfinite(Cv[i1, j]) and np.isfinite(Cv[i, j]) and Cv[i, j] > 0: poz[j] *= Cv[i1, j] / Cv[i, j]
            else: sp += poz.pop(j) * 0.999
        sp *= spy[mm[a + 1]] / spy[m]
        eq.append((mm[a + 1], sp + sum(poz.values())))
    s = pd.Series([v for _, v in eq], index=[m for m, _ in eq]); return pd.concat([pd.Series([1.0], index=[mm[0]]), s])


def cem_eq(od='2013-01', do='2026-09', bez=()):
    if bez:
        f = lambda m: {s for s in (SP.get(m) or set()) if s.split('.US')[0] not in bez}
    else:
        f = lambda m: SP.get(m)
    W, T = symuluj(f, od, do)
    s = W.kap; return pd.concat([pd.Series([1.0], index=[pd.Period(od, 'M')]), s]), T


def polacz(a, b, tryb):
    a, b = a.align(b, join='inner'); ra, rb = a.pct_change().fillna(0), b.pct_change().fillna(0)
    if tryb == 'bez':
        return 0.5 * a / a.iloc[0] + 0.5 * b / b.iloc[0]
    va, vb, out = 0.5, 0.5, []
    for k, m in enumerate(a.index):
        if k: va *= 1 + ra.iloc[k]; vb *= 1 + rb.iloc[k]
        tot = va + vb; out.append(tot)
        if tryb == 'mies' or (tryb == 'rok' and m.month == 12): va, vb = tot / 2, tot / 2
    return pd.Series(out, index=a.index)


def m_(e):
    r = e.pct_change().dropna(); lat = len(r) / 12
    roczne = e.groupby(e.index.year).last() / e.groupby(e.index.year).first().shift(0)
    return dict(CAGR=(e.iloc[-1] / e.iloc[0]) ** (1 / lat) - 1, maxDD=(e / e.cummax() - 1).min(), zmiennosc=r.std() * np.sqrt(12), Sharpe=r.mean() / r.std() * np.sqrt(12))


def roczne(e):
    y = e.groupby(e.index.year).last(); y0 = pd.concat([pd.Series([e.iloc[0]], index=[e.index[0].year - 1]), y]).shift(1).dropna()
    return (y / y0.reindex(y.index) - 1)


def spy_eq(od, do):
    mm = [m for m in spy.index if pd.Period(od, 'M') <= m <= pd.Period(do, 'M')]; s = spy[mm]; return s / s.iloc[0]


out = ['# Etap 84: pół na pół — CEM10 i strategia fundamentalna (2013-01..2026-09)', '']
wyniki = {}
for okr, od, do in (('2013–2026', '2013-01', '2026-09'), ('2013–2019', '2013-01', '2019-12'), ('2020–2026', '2020-01', '2026-09')):
    C1, _ = cem_eq(od, do); F1 = fund_eq(E1, P1, od=od, do=do); F2 = fund_eq(ZB & (J7k == 7), P1, od=od, do=do)
    S = spy_eq(od, do); Q = qqq[[m for m in qqq.index if pd.Period(od, 'M') <= m <= pd.Period(do, 'M')]]; Q = Q / Q.iloc[0]
    rows = [dict(portfel='SPY', **m_(S)), dict(portfel='QQQ', **m_(Q)), dict(portfel='CEM10', **m_(C1)), dict(portfel='F1 fundamentalna (ocena + PEG)', **m_(F1)),
            dict(portfel='F2 fundamentalna (Jakość 7/7)', **m_(F2))]
    for fn, F in (('F1', F1), ('F2', F2)):
        for tr, nm in (('rok', 'wyrównanie co rok'), ('bez', 'bez wyrównywania'), ('mies', 'wyrównanie co miesiąc')):
            rows.append(dict(portfel=f'50 % CEM10 + 50 % {fn}, {nm}', **m_(polacz(C1, F, tr))))
    a, b = C1.align(F1, join='inner'); a2, b2 = C1.align(F2, join='inner')
    kor = (a.pct_change().corr(b.pct_change()), a2.pct_change().corr(b2.pct_change()))
    out += [f'## {okr}', '', f'Korelacja miesięcznych zwrotów: CEM10–F1 {kor[0]:.2f}, CEM10–F2 {kor[1]:.2f}', '', pd.DataFrame(rows).round(3).to_markdown(index=False), '']
    wyniki[okr] = (C1, F1, F2, S, Q)
C1, F1, F2, S, Q = wyniki['2013–2026']
P50 = polacz(C1, F1, 'rok'); P50b = polacz(C1, F2, 'rok')
R = pd.DataFrame({'SPY': roczne(S), 'QQQ': roczne(Q), 'CEM10': roczne(C1), 'F1': roczne(F1), 'F2': roczne(F2), '50/50 CEM10+F1': roczne(P50), '50/50 CEM10+F2': roczne(P50b)})
out += ['## Zwroty rok po roku (2013–2026, 2026 do września)', '', (100 * R).round(1).to_markdown(), '',
        'Lata lepsze od SPY: ' + ', '.join(f'{c} {int((R[c] > R.SPY).sum())}/{len(R)}' for c in R.columns if c != 'SPY'), '',
        'Najgorszy rok: ' + ', '.join(f'{c} {100 * R[c].min():.1f} % ({R[c].idxmin()})' for c in R.columns), '']
Cb, _ = cem_eq(bez=('NVDA',)); Fb = fund_eq(E1, P1, bez=('NVDA',))
out += ['## Bez NVDA (obie części)', '', pd.DataFrame([dict(portfel='CEM10 bez NVDA', **m_(Cb)), dict(portfel='F1 bez NVDA', **m_(Fb)),
                                                      dict(portfel='50/50 bez NVDA, wyrównanie co rok', **m_(polacz(Cb, Fb, 'rok')))]).round(3).to_markdown(index=False), '']
open(os.path.join(HERE, 'wyniki', 'r109_etap84.md'), 'w').write('\n'.join(out)); print('\n'.join(out))
