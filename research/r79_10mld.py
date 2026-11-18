"""Etap 57 (tylko > 10 mld USD), na bazie etapu 56: sprzedaż przy 2 z 5 kryteriów (K5 = P/E > 50 i PEG > 3); na bazie etapów 54-55: przychody 5 lat > +50 %, dług/kapitał < 1, ROE > 15 %, FCF > 0; wagi 1/PEG z limitem 10 %; przebudowa 12 / 3 / 1 mies., kontrola miesięczna."""
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
WAR = mat(f((1 + g5) ** 5 > 1.5) & f((D['dług / kapitał'] >= 0) & (D['dług / kapitał'] < 1)) & f(D.ROE > 0.15) & f(D['FCF yield'] > 0) & f(D['log kapitalizacji'] > np.log(1e10)), False, bool)
fz = lambda c: c.fillna(False).values.astype(int)
PEn = D['P/E']; PEGs = np.where((PEn > 0) & (g5 > 0), PEn / (100 * g5), np.nan)
KB = fz((1 + g5) ** 5 <= 1.5) + fz((D['dług / kapitał'] >= 1) | (D['dług / kapitał'] < 0)) + fz(D.ROE <= 0.15) + fz(D['FCF yield'] <= 0)
NF = {'PEG': mat(KB + fz((PEn > 50) & pd.Series(PEGs > 3, index=D.index)), 0, int), 'PE': mat(KB + fz(PEn > 50), 0, int)}
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


def sim(co, kontrola, tryb, zastap=False, log=None, dwa=None):
    poz, sp, eq, obrot, ile, udz = {}, 1.0, [], 0.0, [], []
    for a, m in enumerate(mies[:-1]):
        i = im_[m]; i1 = im_[mies[a + 1]]
        e = sp + sum(poz.values())
        przeb = (co == 12 and m.month == 1) or (co == 3 and m.month in (1, 4, 7, 10)) or co == 1 or a == 0
        if przeb:
            sel = WAR[i] & np.isfinite(PEG[i])
            if dwa:
                for j in poz:
                    if NF[dwa][i, j] < 2: sel[j] = True
            ok = np.flatnonzero(sel & np.isfinite(Cv[i]) & np.isfinite(Cv[i1]))
            pg = PEG[i, ok].copy(); good = np.isfinite(pg) & (pg > 0)
            pg[~good] = np.nanmax(pg[good]) if good.any() else 1.0
            w = wagi(pg, tryb); cel = {j: wi * e for j, wi in zip(ok, w)}
            zm = sum(abs(cel.get(j, 0) - poz.get(j, 0)) for j in set(cel) | set(poz))
            obrot += zm / e; koszt = zm * KOSZT
            poz = dict(cel); sp = e - sum(cel.values()) - koszt
        elif kontrola:
            for j in list(poz):
                if (NF[dwa][i, j] >= 2) if dwa else (not WAR[i, j]):
                    v = poz.pop(j); sp += v * (1 - KOSZT); obrot += v / e
                    if zastap:
                        kand = [k for k in np.flatnonzero(WAR[i] & np.isfinite(PEG[i]) & np.isfinite(Cv[i]) & np.isfinite(Cv[i1])) if k not in poz]
                        if kand:
                            k = min(kand, key=lambda x: PEG[i, x]); kw = min(v * (1 - KOSZT), LIMIT * e)
                            poz[k] = kw * (1 - KOSZT); sp -= kw; obrot += kw / e
                            if log is not None: log.append((str(m), ser[j].split('.US')[0], ser[k].split('.US')[0], round(float(PEG[i, k]), 2)))
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
    for co, nm in ((12, 'co rok (styczeń)'), (3, 'co kwartał')):
        for dwa, dn in ((None, '1 z 4 (etap 54-55)'), ('PEG', '2 z 5, K5 = P/E > 50 i PEG > 3'), ('PE', '2 z 5, K5 = P/E > 50')):
            for z in (False, True):
                rows.append(dict(wagi=tryb, przebudowa=nm, sprzedaz=dn, po_sprzedazy='najniższy PEG' if z else 'SPY', **sim(co, True, tryb, zastap=z, dwa=dwa)))
    print(tryb, flush=True)
T = pd.DataFrame(rows)
ilek = {d: int(sum((NF[d][im_[m]] >= 2).sum() for m in mies)) for d in NF}
out = ['# Etap 57: spółki > 10 mld USD; sprzedaż 1 z 4 albo 2 z 5 kryteriów (przychody 5 lat, dług, ROE, FCF, P/E > 50 [i PEG > 3]); 2015-2026', '', T.round(3).to_markdown(index=False), '']
open(os.path.join(HERE, 'wyniki', 'r79_10mld.md'), 'w').write('\n'.join(out)); print('\n'.join(out))
