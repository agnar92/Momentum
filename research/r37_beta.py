"""Etap 22: CEM10 z filtrem beta 0,9-1,1 (okna 1, 3, 5 lat, tygodniowe zwroty vs SPY), protokół etap 22."""
import os, duckdb, numpy as np, pandas as pd
HERE = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(HERE, 'r36_laczony.py')).read().split('rows = []')[0]
exec(src)                      # r30 (macierze, U_SP, U_ND, blok) + sim_eq, cagr
con = duckdb.connect(DB, read_only=True)
cel = sorted(set().union(*SP.values(), *ND.values()) & set(ser))
W = con.execute("SELECT seria, ostatni, c FROM w WHERE seria IN (SELECT unnest(?::VARCHAR[])) AND okres >= '1990-01-01'", [cel]).df()
spy = con.execute("SELECT okres, spy FROM rynek_w WHERE okres >= '1990-01-01' ORDER BY okres").df()
W['tydz'] = pd.to_datetime(W.ostatni).dt.to_period('W-SUN')
spy['tydz'] = pd.to_datetime(spy.okres).dt.to_period('W-SUN')
Cw = W.pivot_table(index='tydz', columns='seria', values='c', aggfunc='last').sort_index()
sp = spy.set_index('tydz').spy.reindex(Cw.index)
Rw = Cw.pct_change(fill_method=None); rs = sp.pct_change(fill_method=None)
Rw = Rw.where(Rw.abs() < 1.5)                                   # pojedyncze błędy danych
print('tygodnie', Rw.shape, flush=True)
mies_w = Cw.index.to_timestamp(how='end').to_period('M')        # miesiąc końca tygodnia
ost = pd.Series(range(len(Cw)), index=Cw.index).groupby(mies_w).max()   # ostatni tydzień miesiąca
BETA = {}
for L, nm in ((52, '1 rok'), (156, '3 lata'), (260, '5 lat')):
    mp = int(0.8 * L)
    X = Rw.where(rs.notna(), axis=0); Y = rs.where(Rw.notna()) if False else None
    msk = X.notna() & rs.notna().values[:, None]
    x = X.where(msk); s_ = pd.DataFrame(np.where(msk, rs.values[:, None], np.nan), index=X.index, columns=X.columns)
    n = msk.rolling(L).sum()
    sxy = (x * s_).rolling(L, min_periods=mp).sum(); sx = x.rolling(L, min_periods=mp).sum()
    ss = s_.rolling(L, min_periods=mp).sum(); s2 = (s_ ** 2).rolling(L, min_periods=mp).sum()
    b = (sxy - sx * ss / n) / (s2 - ss ** 2 / n)
    b = b.where(n >= mp).iloc[ost.values]; b.index = ost.index
    B = np.full((NT, NS), np.nan)
    bm = b.reindex(index=ms, columns=ser)
    BETA[nm] = bm.to_numpy(); print('beta', nm, np.nanmedian(BETA[nm]), flush=True)


def sim_f(U, N, prog, od, do, F=None, log=None):
    i0, i1 = im[pd.Period(od, 'M')], im[pd.Period(do, 'M')]
    poz, got, eq = {}, 1.0, [1.0]; Rk = R6
    for i in range(i0, i1):
        c = Cm[i]; ok = U[i] & np.isfinite(c) & np.isfinite(S10[i]) & (c > S10[i]) & np.isfinite(Rk[i])
        if prog: ok &= np.nan_to_num(R6[i], nan=-9) > 0.30
        if log is not None: log['kand'].append(ok.copy() & True)
        if F is not None: ok &= F[i]
        kand = np.flatnonzero(ok); kand = kand[np.argsort(-Rk[i, kand])]
        for j in list(poz):
            if not np.isfinite(c[j]) or (np.isfinite(S10[i, j]) and c[j] < S10[i, j]): got += poz.pop(j) * 0.999
        if not BEAR[i] and len(poz) < N:
            wolne = N - len(poz); e = got + sum(poz.values())
            for j in kand:
                if wolne == 0: break
                if j in poz: continue
                k = min(e / N, got)
                if k <= 1e-9: break
                got -= k; poz[j] = k * 0.999; wolne -= 1
                if log is not None: log['kup'].append((i, j))
        c1 = Cm[i + 1]
        for j in list(poz):
            if np.isfinite(c1[j]) and np.isfinite(c[j]) and c[j] > 0: poz[j] *= c1[j] / c[j]
            else: got += poz.pop(j) * 0.999
        eq.append(got + sum(poz.values()))
    return pd.Series(eq, index=pd.period_range(od, periods=len(eq), freq='M'))


rows, opis = [], []
for un, U, od, pol in (('S&P 500', U_SP, '1998-01', '2012-12'), ('NDX', U_ND, '2008-01', '2016-12')):
    for N in (5, 10):
        for prog in (True, False):
            log = {'kand': [], 'kup': []}
            e0 = sim_f(U, N, prog, od, '2026-09', None, log)
            if N == 10 and prog:                                # opis bety kupowanych i kandydatów
                i0 = im[pd.Period(od, 'M')]
                for nm, B in BETA.items():
                    bk = np.array([B[i, j] for i, j in log['kup']]); bk = bk[np.isfinite(bk)]
                    kk = np.concatenate([B[i0 + t][log['kand'][t]] for t in range(len(log['kand']))]); kk = kk[np.isfinite(kk)]
                    ca = np.concatenate([B[i][U[i]] for i in range(i0, im[pd.Period('2026-09', 'M')])]); ca = ca[np.isfinite(ca)]
                    opis.append(dict(indeks=un, okno=nm, beta_kupowanych_mediana=np.median(bk), kupowanych_kw25_75=f'{np.percentile(bk,25):.2f}…{np.percentile(bk,75):.2f}',
                                     kupowanych_w_09_11=((bk >= .9) & (bk <= 1.1)).mean(), kandydatow_w_09_11=((kk >= .9) & (kk <= 1.1)).mean(),
                                     calego_indeksu_mediana=np.median(ca), calego_indeksu_w_09_11=((ca >= .9) & (ca <= 1.1)).mean()))
            rows.append(dict(indeks=un, N=N, prog_6M_30=prog, wariant='CEM10 bez filtra', CAGR=cagr(e0), pierwsza_polowa=cagr(e0, None, pol),
                             druga_polowa=cagr(e0, pol), maxDD=(e0 / e0.cummax() - 1).min(), roznica='', lepszy=False))
            for nm, B in BETA.items():
                F = (B >= 0.9) & (B <= 1.1)
                e = sim_f(U, N, prog, od, '2026-09', F)
                d = (e.pct_change() - e0.pct_change()).dropna(); lo, hi = blok(d.values)
                c1, c2, b1, b2 = cagr(e, None, pol), cagr(e, pol), cagr(e0, None, pol), cagr(e0, pol)
                rows.append(dict(indeks=un, N=N, prog_6M_30=prog, wariant=f'beta 0,9-1,1 ({nm})', CAGR=cagr(e), pierwsza_polowa=c1, druga_polowa=c2,
                                 maxDD=(e / e.cummax() - 1).min(), roznica=f'{d.mean()*100:+.2f} ({lo*100:.2f}…{hi*100:.2f})',
                                 lepszy=c1 > b1 and c2 > b2 and lo > 0))
        print(un, N, flush=True)
T = pd.DataFrame(rows); O = pd.DataFrame(opis)
out = ['# Etap 22: CEM10 z filtrem beta 0,9-1,1 (beta z tygodniowych zwrotów vs SPY: 1, 3, 5 lat)', '',
       'roznica = średnia różnica miesięcznego zwrotu vs CEM10 bez filtra, pp (95 % bootstrap blokowy).', '', T.round(3).to_markdown(index=False), '',
       '## Beta spółek w CEM10 (N = 10, próg 6M > 30 %)', '', O.round(2).to_markdown(index=False), '']
open(os.path.join(HERE, 'wyniki', 'r37_beta.md'), 'w').write('\n'.join(out)); print('\n'.join(out))
