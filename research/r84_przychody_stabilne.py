"""Etap 62: przychody 5 lat > +50 % i obsunięcie przychodów (lub ceny) w 5 lat >= -20 %; na bazie etapu 61: stalwarts (+8…+15 % r/r) i fast growers (≥ +20 % r/r), ROE > 15 % stabilnie, dług < 1, FCF > 0; kupno po PEG."""
import os, numpy as np, pandas as pd
HERE = os.path.dirname(os.path.abspath(__file__))
exec(open(os.path.join(HERE, 'r19_cem10.py')).read().split('warianty = {')[0])   # etf
D = pd.read_parquet('/home/user/ndx/panel_finviz.parquet'); D['mp'] = pd.PeriodIndex(D.m, freq='M')
D = D.sort_values(['seria', 'mp']).reset_index(drop=True); gS = D.groupby('seria')
sh = lambda c, k: gS[c].shift(k).where(gS['mp'].shift(k) == D.mp - k)
rv = 'przychody TTM r/r'
A = np.column_stack([D[rv] if k == 0 else sh(rv, 12 * k) for k in range(5)]); okA = np.isfinite(A).all(1)
E = np.column_stack([D['ROE'] if k == 0 else sh('ROE', 12 * k) for k in range(5)])
g5 = D['przychody 5 lat (CAGR)'].values
ROE_MIN = 4
pos = okA & (np.where(okA[:, None], A, -1) > 0).all(1); gg = np.nan_to_num(g5, nan=-1)
REVL = np.exp(D['log kapitalizacji']) / D['P/S']
D['_rev'] = np.where(np.isfinite(REVL) & (REVL > 0), REVL, np.nan)
roll = lambda x: x.rolling(60, min_periods=48)
peak = gS['_rev'].transform(lambda x: roll(x).max()); D['_rdd'] = D['_rev'] / peak - 1
RDD = gS['_rdd'].transform(lambda x: roll(x).min()).values
REV50 = (1 + gg) ** 5 > 1.5
STAL = REV50 & (np.nan_to_num(RDD, nan=-9) >= -0.20)
FAST = np.zeros(len(D), bool)
_STAL_OLD = okA & (((A >= 0.08) & (A <= 0.15)).sum(1) >= 4) & (np.where(okA[:, None], A, -1) > 0).all(1)
_FAST_OLD = okA & ((A >= 0.20).sum(1) >= 3) & (np.nan_to_num(g5, nan=-1) >= 0.20)
WSP = ((np.where(np.isfinite(E), E, 0) > 0.15).sum(1) >= ROE_MIN) & (D['dług / kapitał'] >= 0).values & (D['dług / kapitał'] < 1).values & (D['FCF yield'] > 0).values
PEGv = np.where((D['P/E'] > 0) & (g5 > 0), D['P/E'] / (100 * g5), np.nan)
REV0, REV1 = D[rv].values, sh(rv, 12).values
Z = np.load('/home/user/ndx/wskazniki_cache.npz', allow_pickle=True); Cv = Z['Cv']
ms = [pd.Period(x, 'M') for x in Z['mies']]; ser = [str(s) for s in Z['seria']]; im_ = {m: i for i, m in enumerate(ms)}; cols = {s: j for j, s in enumerate(ser)}
NT, NS = Cv.shape
ii = np.array([im_[m] for m in D.mp]); jj = np.array([cols.get(s, -1) for s in D.seria]); okc = jj >= 0
def mat(v, fill=np.nan, dtype=float):
    M = np.full((NT, NS), fill, dtype=dtype); M[ii[okc], jj[okc]] = np.asarray(v)[okc]; return M
STm, FAm, WSm = (mat(x, False, bool) for x in (STAL, FAST, WSP))
PEG, R0, R1 = mat(PEGv), mat(REV0), mat(REV1)
PDD = np.full((NT, NS), np.nan)
for t in range(59, NT):
    W = Cv[t - 59:t + 1]; pk = np.fmax.accumulate(np.where(np.isfinite(W), W, -np.inf), axis=0)
    dd = np.where(np.isfinite(W), W / pk - 1, np.nan); ok = np.isfinite(W).sum(0) >= 48
    PDD[t] = np.where(ok, np.nanmin(dd, axis=0), np.nan)
REV50m = mat(REV50, False, bool)
spy = etf['SPY']; SPYR = np.array([spy.get(ms[i + 1], np.nan) / spy.get(ms[i], np.nan) - 1 if i + 1 < NT else 0 for i in range(NT)])
KOSZT = 0.001; OD, DO = pd.Period('2015-01', 'M'), pd.Period('2026-09', 'M'); mies = [m for m in ms if OD <= m <= DO]
nz = lambda M: np.nan_to_num(M, nan=-1)
tick = np.array([s.split('.US')[0] for s in ser])


def sim(grupy=('S', 'F'), wyj='WA', peg_max=1e9, trim=None, bez=(), log=None, cena_dd=None):
    poz, od, sp, eq, ile, udz, czasy = {}, {}, 1.0, [], [], [], []
    wyl = np.isin(tick, list(bez))
    for a, m in enumerate(mies[:-1]):
        i = im_[m]; i1 = im_[mies[a + 1]]
        G = np.zeros(NS, bool)
        if 'S' in grupy: G |= STm[i]
        if 'F' in grupy: G |= FAm[i]
        if cena_dd is not None: G = REV50m[i] & (np.nan_to_num(PDD[i], nan=-9) >= cena_dd)
        OK = G & WSm[i] & ~wyl
        e = sp + sum(poz.values())
        for j in list(poz):
            if wyj == 'WA': out = R0[i, j] < 0.08 and R1[i, j] < 0.08
            elif wyj == 'WB': out = not OK[j]
            else: out = False
            if out:
                sp += poz.pop(j) * (1 - KOSZT); czasy.append((m - od.pop(j)).n)
                if log is not None: log.append((str(m), 'SPRZEDAJ', tick[j]))
        if trim and m.month == 1:
            e = sp + sum(poz.values())
            for j in poz:
                if poz[j] > trim * e: sp += (poz[j] - trim * e) * (1 - KOSZT); poz[j] = trim * e
        handel = np.isfinite(Cv[i]) & np.isfinite(Cv[i1])
        nie_spr = ~((nz(R0[i]) < 0.08) & (nz(R1[i]) < 0.08))
        kand = np.flatnonzero(OK & handel & nie_spr & (np.nan_to_num(PEG[i], nan=99) < peg_max)); kand = kand[np.argsort(np.nan_to_num(PEG[i, kand], nan=99))]
        n = 0; e = sp + sum(poz.values())
        for j in kand:
            if n >= 4: break
            kw = min(0.025 * e, 0.10 * e - poz.get(j, 0), sp)
            if kw < 0.002 * e: continue
            poz[j] = poz.get(j, 0) + kw * (1 - KOSZT); sp -= kw; od.setdefault(j, m); n += 1
            if log is not None: log.append((str(m), 'KUP', tick[j], round(float(PEG[i, j]), 2), round(float(R0[i, j]), 3)))
        for j in list(poz):
            if np.isfinite(Cv[i1, j]) and np.isfinite(Cv[i, j]): poz[j] *= Cv[i1, j] / Cv[i, j]
            else: sp += poz.pop(j) * (1 - KOSZT); czasy.append((m - od.pop(j)).n)
        if np.isfinite(SPYR[i]): sp *= 1 + SPYR[i]
        tot = sp + sum(poz.values()); eq.append((mies[a + 1], tot)); ile.append(len(poz)); udz.append(sum(poz.values()) / tot)
    czasy += [(mies[-1] - m0).n for m0 in od.values()]
    e = pd.Series(dict(eq)); s = spy[(spy.index >= mies[1]) & (spy.index <= mies[-1])] / spy[mies[0]]; e = e.reindex(s.index); lat = len(e) / 12
    tot = e.iloc[-1]; naj = max(poz.items(), key=lambda x: x[1]) if poz else (None, 0)
    return dict(CAGR=e.iloc[-1] ** (1 / lat) - 1, SPY=s.iloc[-1] ** (1 / lat) - 1, maxDD=(e / e.cummax() - 1).min(),
                okna_12m=(e.pct_change(12) > s.pct_change(12)).iloc[12:].mean(), okna_60m=(e.pct_change(60) > s.pct_change(60)).iloc[60:].mean(),
                sr_spolek=np.mean(ile), udzial=np.mean(udz), mediana_trzymania=float(np.median(czasy)) if czasy else np.nan,
                najwieksza_na_koniec=f'{tick[naj[0]]} {naj[1] / tot:.0%}' if naj[0] is not None else '')


rows = []
def run(opis, **kw):
    r = sim(**kw); rows.append(dict(wariant=opis, **r)); print(opis, round(r['CAGR'], 3), r['najwieksza_na_koniec'], flush=True); return r
for w in ('WA', 'WB', 'WC'):
    run(f'przychody > +50 %, obsunięcie przychodów >= -20 %, wyjście {w}', grupy=('S',), wyj=w)
run('to samo, WA, PEG < 2', grupy=('S',), peg_max=2.0)
run('to samo, WA, przycinanie do 15 % w styczniu', grupy=('S',), trim=0.15)
r = sim(grupy=('S',)); top = r['najwieksza_na_koniec'].split()[0]
run(f'to samo, WA, bez najlepszej spółki ({top})', grupy=('S',), bez=(top,))
run('to samo, WA, bez NVDA', grupy=('S',), bez=('NVDA',))
for c in (-0.20, -0.30):
    run(f'przychody > +50 %, obsunięcie CENY w 5 lat >= {c:.0%}, WA', grupy=('S',), cena_dd=c)
T = pd.DataFrame(rows)
ns = [int((STm[im_[m]] & WSm[im_[m]]).sum()) for m in mies]; nf = [int((REV50m[im_[m]] & WSm[im_[m]]).sum()) for m in mies]
i = im_[mies[-1]]; ok = np.flatnonzero((STm[i] | FAm[i]) & WSm[i])
L = pd.DataFrame(dict(spolka=tick[ok], PEG=PEG[i, ok], przychody_rr=R0[i, ok])).sort_values('PEG')
LOG = []; sim(grupy=('S',), log=LOG)
out = ['# Etap 62: przychody 5 lat > +50 %, obsunięcie przychodów w 5 lat >= -20 %, ROE > 15 % w >= 4 z 5 lat, dług < 1, FCF > 0; kupno po PEG; 2015-2026', '',
       f'Spółek w miesiącu: spełniające wszystko mediana {np.median(ns):.0f} ({min(ns)}-{max(ns)}); bez warunku obsunięcia {np.median(nf):.0f} ({min(nf)}-{max(nf)}). Rezerwa w SPY.', '',
       'WA = przychody r/r < 8 % dwa lata z rzędu; WB = spółka wypada z grup / warunków; WC = nigdy.', '', T.round(3).to_markdown(index=False), '',
       f'## Spółki na {mies[-1]}', '', L.round(3).to_markdown(index=False), '', '## Transakcje (wariant główny, WA)', '',
       pd.DataFrame(LOG).to_markdown(index=False), '']
open(os.path.join(HERE, 'wyniki', 'r84_przychody_stabilne.md'), 'w').write('\n'.join(out)); print('\n'.join(out[:30]))
