"""Etap 54: przychody 5 lat > +50 %, dług/kapitał < 1, ROE > 15 %, FCF > 0; wagi 1/PEG z limitem 10 %; przebudowa 12 / 3 / 1 mies., kontrola miesięczna."""
import os, numpy as np, pandas as pd
HERE = os.path.dirname(os.path.abspath(__file__))
exec(open(os.path.join(HERE, 'r19_cem10.py')).read().split('warianty = {')[0])   # etf
D = pd.read_parquet('/home/user/ndx/panel_finviz.parquet'); D['mp'] = pd.PeriodIndex(D.m, freq='M')
Z = np.load('/home/user/ndx/wskazniki_cache.npz', allow_pickle=True); Cv = Z['Cv']
ms = [pd.Period(x, 'M') for x in Z['mies']]; ser = [str(s) for s in Z['seria']]; im_ = {m: i for i, m in enumerate(ms)}; cols = {s: j for j, s in enumerate(ser)}
NT, NS = Cv.shape
ii = np.array([im_[m] for m in D.mp]); jj = np.array([cols.get(s, -1) for s in D.seria]); okc = jj >= 0
def mat(v, fill=np.nan, dtype=float):
    A = np.full((NT, NS), fill, dtype=dtype); A[ii[okc], jj[okc]] = np.asarray(v)[okc]; return A
f = lambda s: s.fillna(False).values
g5 = D['przychody 5 lat (CAGR)']
WAR = mat(f((1 + g5) ** 5 > 1.5) & f((D['dług / kapitał'] >= 0) & (D['dług / kapitał'] < 1)) & f(D.ROE > 0.15) & f(D['FCF yield'] > 0), False, bool)
PEG = mat(np.where((D['P/E'] > 0) & (g5 > 0), D['P/E'] / (100 * g5), np.nan))
spy = etf['SPY']; SPYR = np.array([spy.get(ms[i + 1], np.nan) / spy.get(ms[i], np.nan) - 1 if i + 1 < NT else 0 for i in range(NT)])
KOSZT = 0.001; OD, DO = pd.Period('2015-01', 'M'), pd.Period('2026-09', 'M'); mies = [m for m in ms if OD <= m <= DO]
LIMIT = 0.10


def wagi(peg, tryb):
    """Wagi docelowe: 1/PEG (albo równe), limit 10 %; suma <= 1, reszta w SPY."""
    raw = 1 / peg if tryb == 'PEG' else np.ones(len(peg))
    w = np.zeros(len(raw)); wolne = np.ones(len(raw), bool); zostalo = 1.0
    while wolne.any():
        x = zostalo * raw[wolne] / raw[wolne].sum()
        if (x <= LIMIT + 1e-12).all(): w[wolne] = x; break
        idx = np.flatnonzero(wolne)[x > LIMIT]; w[idx] = LIMIT; zostalo -= LIMIT * len(idx); wolne[idx] = False
    return w


def sim(co, kontrola, tryb, log=False):
    poz, sp, eq, obrot, ile, udz = {}, 1.0, [], 0.0, [], []
    for a, m in enumerate(mies[:-1]):
        i = im_[m]; i1 = im_[mies[a + 1]]
        e = sp + sum(poz.values())
        przeb = (co == 12 and m.month == 1) or (co == 3 and m.month in (1, 4, 7, 10)) or co == 1 or a == 0
        if przeb:
            ok = np.flatnonzero(WAR[i] & np.isfinite(PEG[i]) & np.isfinite(Cv[i]) & np.isfinite(Cv[i1]))
            w = wagi(PEG[i, ok], tryb); cel = {j: wi * e for j, wi in zip(ok, w)}
            zm = sum(abs(cel.get(j, 0) - poz.get(j, 0)) for j in set(cel) | set(poz))
            obrot += zm / e; koszt = zm * KOSZT
            poz = dict(cel); sp = e - sum(cel.values()) - koszt
        elif kontrola:
            for j in list(poz):
                if not WAR[i, j]: v = poz.pop(j); sp += v * (1 - KOSZT); obrot += v / e
        for j in list(poz):
            if np.isfinite(Cv[i1, j]) and np.isfinite(Cv[i, j]): poz[j] *= Cv[i1, j] / Cv[i, j]
            else: sp += poz.pop(j) * (1 - KOSZT)
        if np.isfinite(SPYR[i]): sp *= 1 + SPYR[i]
        tot = sp + sum(poz.values()); eq.append((mies[a + 1], tot)); ile.append(len(poz)); udz.append(sum(poz.values()) / tot)
    e = pd.Series(dict(eq)); s = spy[(spy.index >= mies[1]) & (spy.index <= mies[-1])] / spy[mies[0]]; e = e.reindex(s.index)
    lat = len(e) / 12
    return dict(CAGR=e.iloc[-1] ** (1 / lat) - 1, SPY=s.iloc[-1] ** (1 / lat) - 1, maxDD=(e / e.cummax() - 1).min(), SPY_DD=(s / s.cummax() - 1).min(),
                okna_12m=(e.pct_change(12) > s.pct_change(12)).iloc[12:].mean(), okna_60m=(e.pct_change(60) > s.pct_change(60)).iloc[60:].mean(),
                sr_spolek=np.mean(ile), udzial_spolek=np.mean(udz), obrot_rocznie=obrot / lat)


rows = []
for tryb in ('PEG', 'równe'):
    for co, nm in ((12, 'co rok (styczeń)'), (3, 'co kwartał'), (1, 'co miesiąc')):
        for k in ((False, True) if co > 1 else (False,)):
            rows.append(dict(wagi=tryb, przebudowa=nm, kontrola_mies='tak' if k else 'nie', **sim(co, k, tryb)))
    print(tryb, flush=True)
T = pd.DataFrame(rows)
ile = [int((WAR[im_[m]] & np.isfinite(PEG[im_[m]])).sum()) for m in mies]
i = im_[mies[-1]]; ok = np.flatnonzero(WAR[i] & np.isfinite(PEG[i])); w = wagi(PEG[i, ok], 'PEG')
S = pd.DataFrame(dict(spolka=[ser[j].split('.US')[0] for j in ok], PEG=PEG[i, ok], waga=w)).sort_values('waga', ascending=False)
out = ['# Etap 54: przychody 5 lat > +50 %, dług/kapitał < 1, ROE > 15 %, FCF > 0; wagi 1/PEG (max 10 %); 2015-2026', '',
       f'Spółek spełniających warunki w miesiącu: mediana {np.median(ile):.0f} ({min(ile)}-{max(ile)}). Wolna gotówka w SPY.', '',
       T.round(3).to_markdown(index=False), '', f'## Skład na {mies[-1]} (wagi 1/PEG, limit 10 %; SPY {1 - w.sum():.1%})', '', S.round(3).to_markdown(index=False), '']
open(os.path.join(HERE, 'wyniki', 'r76_peg_wagi.md'), 'w').write('\n'.join(out)); print('\n'.join(out))
