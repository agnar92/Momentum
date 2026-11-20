"""Etap 59: świetne spółki (konsekwentny wzrost przychodów, niski dług, trwały ROIC), dokupowanie i kolejność po PEG, wyjścia fundamentalne."""
import os, numpy as np, pandas as pd
HERE = os.path.dirname(os.path.abspath(__file__))
exec(open(os.path.join(HERE, 'r19_cem10.py')).read().split('warianty = {')[0])   # etf
D = pd.read_parquet('/home/user/ndx/panel_finviz.parquet'); D['mp'] = pd.PeriodIndex(D.m, freq='M')
D = D.sort_values(['seria', 'mp']).reset_index(drop=True); gS = D.groupby('seria')
sh = lambda c, k: gS[c].shift(k).where(gS['mp'].shift(k) == D.mp - k)
rv = 'przychody TTM r/r'
A = np.column_stack([D[rv] if k == 0 else sh(rv, 12 * k) for k in range(5)]); okA = np.isfinite(A).all(1)
NREV = np.where(okA, (A > 0.10).sum(1), np.nan)
B = np.column_stack([D['ROIC (przybliżenie)'] if k == 0 else sh('ROIC (przybliżenie)', 12 * k) for k in range(5)])
NROIC = np.where(np.isfinite(B).all(1), (B > 0.15).sum(1), np.nan)
REV0, REV1 = D[rv].values, sh(rv, 12).values
g5 = D['przychody 5 lat (CAGR)']
PEGv = np.where((D['P/E'] > 0) & (g5 > 0), D['P/E'] / (100 * g5), np.nan)
DE = D['dług / kapitał'].values; QR = D['quick ratio'].values
Z = np.load('/home/user/ndx/wskazniki_cache.npz', allow_pickle=True); Cv = Z['Cv']
ms = [pd.Period(x, 'M') for x in Z['mies']]; ser = [str(s) for s in Z['seria']]; im_ = {m: i for i, m in enumerate(ms)}; cols = {s: j for j, s in enumerate(ser)}
NT, NS = Cv.shape
ii = np.array([im_[m] for m in D.mp]); jj = np.array([cols.get(s, -1) for s in D.seria]); okc = jj >= 0
def mat(v, fill=np.nan, dtype=float):
    M = np.full((NT, NS), fill, dtype=dtype); M[ii[okc], jj[okc]] = np.asarray(v)[okc]; return M
NREVm, NROICm, PEG, DEm, QRm, R0, R1 = (mat(x) for x in (NREV, NROIC, PEGv, DE, QR, REV0, REV1))
spy = etf['SPY']; SPYR = np.array([spy.get(ms[i + 1], np.nan) / spy.get(ms[i], np.nan) - 1 if i + 1 < NT else 0 for i in range(NT)])
KOSZT = 0.001; OD, DO = pd.Period('2015-01', 'M'), pd.Period('2026-09', 'M'); mies = [m for m in ms if OD <= m <= DO]
nz = lambda M: np.nan_to_num(M, nan=-1)


def swietna(i, nrev=3, roic=True, quick=False):
    s = (nz(NREVm[i]) >= nrev) & (DEm[i] >= 0) & (DEm[i] < 1)
    if roic: s &= nz(NROICm[i]) >= 3
    if quick: s &= nz(QRm[i]) > 1
    return s


def sim(nrev=3, roic=True, quick=False, wyj='S1', transza=0.025, max_tr=4, peg_max=2.0, kolejnosc='PEG', rownewagi=False):
    poz, od, sp, eq, ile, udz, czasy = {}, {}, 1.0, [], [], [], []
    for a, m in enumerate(mies[:-1]):
        i = im_[m]; i1 = im_[mies[a + 1]]; S = swietna(i, nrev, roic, quick)
        e = sp + sum(poz.values())
        for j in list(poz):
            if wyj == 'S1': out = R0[i, j] < 0.10 and R1[i, j] < 0.10
            elif wyj == 'S2': out = np.isfinite(NREVm[i, j]) and NREVm[i, j] < 3
            elif wyj == 'S3': out = R0[i, j] < 0
            else: out = False
            if rownewagi and m.month == 1 and not S[j]: out = True
            if out: sp += poz.pop(j) * (1 - KOSZT); czasy.append((m - od.pop(j)).n)
        handel = np.isfinite(Cv[i]) & np.isfinite(Cv[i1])
        if rownewagi:
            if m.month == 1 or a == 0:
                ok = np.flatnonzero(S & handel); e = sp + sum(poz.values())
                if len(ok):
                    w = min(1 / len(ok), 0.10); nowe = {j: w * e for j in ok}
                    zm = sum(abs(nowe.get(j, 0) - poz.get(j, 0)) for j in set(nowe) | set(poz))
                    for j in set(poz) - set(nowe): czasy.append((m - od.pop(j)).n)
                    for j in nowe: od.setdefault(j, m)
                    poz = nowe; sp = e - sum(nowe.values()) - zm * KOSZT
        else:
            nie_sprzedaj = ~((nz(R0[i]) < 0.10) & (nz(R1[i]) < 0.10)) if wyj == 'S1' else (nz(R0[i]) >= 0) if wyj == 'S3' else np.ones(NS, bool)
            kand = np.flatnonzero(S & handel & nie_sprzedaj & (np.nan_to_num(PEG[i], nan=99) < peg_max))
            if kolejnosc == 'PEG': kand = kand[np.argsort(PEG[i, kand])]
            else: kand = kand[np.random.default_rng(a).permutation(len(kand))]
            n = 0
            for j in kand:
                if max_tr and n >= max_tr: break
                kw = min(transza * e, 0.10 * e - poz.get(j, 0), sp)
                if kw < 0.002 * e: continue
                poz[j] = poz.get(j, 0) + kw * (1 - KOSZT); sp -= kw; od.setdefault(j, m); n += 1
        for j in list(poz):
            if np.isfinite(Cv[i1, j]) and np.isfinite(Cv[i, j]): poz[j] *= Cv[i1, j] / Cv[i, j]
            else: sp += poz.pop(j) * (1 - KOSZT); czasy.append((m - od.pop(j)).n)
        if np.isfinite(SPYR[i]): sp *= 1 + SPYR[i]
        tot = sp + sum(poz.values()); eq.append((mies[a + 1], tot)); ile.append(len(poz)); udz.append(sum(poz.values()) / tot)
    czasy += [(mies[-1] - m0).n for m0 in od.values()]
    e = pd.Series(dict(eq)); s = spy[(spy.index >= mies[1]) & (spy.index <= mies[-1])] / spy[mies[0]]; e = e.reindex(s.index); lat = len(e) / 12
    return dict(CAGR=e.iloc[-1] ** (1 / lat) - 1, SPY=s.iloc[-1] ** (1 / lat) - 1, maxDD=(e / e.cummax() - 1).min(),
                okna_12m=(e.pct_change(12) > s.pct_change(12)).iloc[12:].mean(), okna_60m=(e.pct_change(60) > s.pct_change(60)).iloc[60:].mean(),
                sr_spolek=np.mean(ile), udzial=np.mean(udz), mediana_trzymania=float(np.median(czasy)) if czasy else np.nan), poz


rows = []
def run(opis, **kw):
    r, _ = sim(**kw); rows.append(dict(wariant=opis, **r)); print(opis, round(r['CAGR'], 3), flush=True)
for w in ('S1', 'S2', 'S3', 'S4'):
    run(f'baza (≥3 z 5, dług < 1, ROIC ≥3 z 5), PEG < 2, transza 2,5 %, wyjście {w}', wyj=w)
run('≥4 z 5 lat, wyjście S1', nrev=4); run('5 z 5 lat, wyjście S1', nrev=5)
run('bez warunku ROIC, wyjście S1', roic=False); run('+ quick ratio > 1, wyjście S1', quick=True)
run('transza 5 %, wyjście S1', transza=0.05); run('bez limitu transz w miesiącu, wyjście S1', max_tr=0)
run('kolejność losowa zamiast PEG (PEG < 2), S1', kolejnosc='los')
run('bez progu PEG (kupno zawsze), kolejność PEG, S1', peg_max=1e9)
run('bez progu PEG, kolejność losowa, S1', peg_max=1e9, kolejnosc='los')
run('bez warunku ROIC, bez progu PEG, kolejność PEG, S1', roic=False, peg_max=1e9)
run('bez warunku ROIC, bez progu PEG, kolejność losowa, S1', roic=False, peg_max=1e9, kolejnosc='los')
run('PEG < 1, S1', peg_max=1.0)
run('porównanie: równe wagi, przebudowa w styczniu, bez PEG, S1', rownewagi=True)
run('porównanie: równe wagi, przebudowa w styczniu, bez PEG, S4', rownewagi=True, wyj='S4')
T = pd.DataFrame(rows)
i = im_[mies[-1]]; S = swietna(i); ok = np.flatnonzero(S & np.isfinite(PEG[i]))
L = pd.DataFrame(dict(spolka=[ser[j].split('.US')[0] for j in ok], PEG=PEG[i, ok], lat_przych_10=NREVm[i, ok], lat_ROIC_15=NROICm[i, ok], dlug=DEm[i, ok])).sort_values('PEG')
ile = [int(swietna(im_[m]).sum()) for m in mies]
out = ['# Etap 59: świetne spółki, kolejność i dokupowanie po PEG; 2015-2026', '',
       f'Świetnych spółek (baza) w miesiącu: mediana {np.median(ile):.0f} ({min(ile)}-{max(ile)}). Rezerwa w SPY.', '',
       'S1 = przychody r/r < 10 % dwa lata z rzędu, S2 = mniej niż 3 z 5 lat z przychodami > 10 %, S3 = przychody r/r < 0, S4 = nigdy.', '',
       T.round(3).to_markdown(index=False), '', f'## Świetne spółki na {mies[-1]} (od najniższego PEG; kupno przy PEG < 2)', '', L.round(2).to_markdown(index=False), '']
open(os.path.join(HERE, 'wyniki', 'r81_swietne_peg.md'), 'w').write('\n'.join(out)); print('\n'.join(out[:12]))
