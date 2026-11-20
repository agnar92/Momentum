"""Etap 69: wzorce sprzedaży / zysków: PARABOLA (typ NVIDIA) i STABILNY (typ Microsoft) w top 500 USA; zwroty naprzód, trwałość, wykres NVDA i MSFT."""
import os, json, datetime as dt, numpy as np, pandas as pd
HERE = os.path.dirname(os.path.abspath(__file__)); WYN = os.path.join(HERE, 'wyniki')
SZ = '/home/user/ndx/szer'
dd = lambda s: dt.date.fromisoformat(s)
r25 = open(os.path.join(HERE, 'r25_cem10_eps.py')).read(); exec(r25[r25.index('def kwartaly'):r25.index('\n\n\ncechy = {}')])
r39 = open(os.path.join(HERE, 'r39_peg.py')).read(); exec(r39[r39.index('def ttm_serie'):r39.index('\n\n\nTT = {k:')])
Z = np.load(f'{SZ}/cache.npz', allow_pickle=True); Cv, U = Z['Cv'], Z['U'].astype(bool)
ms = [pd.Period(x, 'M') for x in Z['mies']]; ser = [str(s) for s in Z['seria']]; im_ = {m: i for i, m in enumerate(ms)}; NT, NS = Cv.shape
kod = [s.split('.US')[0].replace('_old', '').rstrip('0123456789') if '_old' in s else s.split('.US')[0] for s in ser]
BIL = json.load(open(f'{SZ}/bilans.json'))
def ttm(rows):
    q = kwartaly(rows)
    if len(q) < 8: return None
    g = pd.DataFrame([(pd.Timestamp(e), v, pd.Timestamp(f)) for e, (v, f) in q.items()], columns=['end', 'eps', 'filed']).sort_values('end')
    T = ttm_serie(g)
    return T if len(T) else None
mies = [m for m in ms if pd.Period('2012-01', 'M') <= m <= pd.Period('2026-09', 'M')]
ME = np.array([m.to_timestamp(how='end').value for m in mies])
P_ = np.zeros((NT, NS), bool); S_ = np.zeros((NT, NS), bool); G0 = np.full((NT, NS), np.nan)
SER = {}
import pickle
GOTOWE = os.path.exists(f'{SZ}/wzorce.pkl') and os.environ.get('PRZELICZ') != '1'
if GOTOWE: P_, S_, G0, SER = pickle.load(open(f'{SZ}/wzorce.pkl', 'rb'))                        # do wykresu
cache_k = {}
for j, k in enumerate(kod if not GOTOWE else []):
    if k in cache_k: R, N, O = cache_k[k]
    else:
        p = f'{SZ}/sec_q/{k}.json'
        if not os.path.exists(p): cache_k[k] = (None, None, None); continue
        d = json.load(open(p))
        R = ttm(d['rev']['rows']) if 'rev' in d else None
        N = ttm([[a, b, c, f_] for a, b, c, f_ in (BIL.get(k) or {}).get('ni', [])]) if (BIL.get(k) or {}).get('ni') else None
        O = ttm(d['opinc']['rows']) if 'opinc' in d else None
        cache_k[k] = (R, N, O)
    if R is None or N is None: continue
    if k in ('NVDA', 'MSFT') and k not in SER: SER[k] = (R, N)
    R = R.sort_values('end').reset_index(drop=True); N = N.sort_values('end').set_index('end').ttm; Oi = O.sort_values('end').set_index('end').ttm if O is not None else None
    ends = R.end.values; vals = R.ttm.values; zn = R.zn.values
    # wzrost r/r dla każdego punktu TTM (punkt sprzed 365 +- 45 dni)
    g = np.full(len(R), np.nan)
    for a in range(len(R)):
        b = np.flatnonzero(np.abs((ends[a] - ends[:a]).astype('timedelta64[D]').astype(int) - 365) <= 45)
        if len(b) and vals[b[-1]] > 0 and vals[a] > 0: g[a] = vals[a] / vals[b[-1]] - 1
    def ni_at(e, lat=0):
        x = N[(N.index >= e - pd.Timedelta(days=365 * lat + 45)) & (N.index <= e - pd.Timedelta(days=365 * lat - 45))]
        return x.iloc[-1] if len(x) else np.nan
    for ti, m in enumerate(mies):
        i = im_[m]
        if not U[i, j]: continue
        a = np.flatnonzero(zn.astype('datetime64[ns]').astype(np.int64) <= ME[ti])
        if not len(a): continue
        a = a[-1]
        if (ME[ti] - ends[a].astype('datetime64[ns]').astype(np.int64)) > 200 * 86400e9 or not np.isfinite(g[a]): continue
        G0[i, j] = g[a]
        e = pd.Timestamp(ends[a])
        n0, n1, n2 = ni_at(e), ni_at(e, 1), ni_at(e, 2)
        g4 = g[a - 4] if a >= 4 and abs((ends[a] - ends[a - 4]).astype('timedelta64[D]').astype(int) - 365) <= 45 else np.nan
        if g[a] >= 0.30 and np.isfinite(g4) and g[a] - g4 >= 0.15 and n0 > 0 and n1 > 0 and n0 / n1 - 1 >= 0.50: P_[i, j] = True
        if a >= 11:
            w = g[a - 11:a + 1]
            if np.isfinite(w).all() and (w >= 0.08).all() and (w <= 0.30).all() and w.std() <= 0.05 and n0 > n1 > n2 > 0 and np.isfinite(n2):
                ok = True
                if Oi is not None:
                    o0 = Oi[Oi.index <= e]; o3 = Oi[(Oi.index <= e - pd.Timedelta(days=3 * 365 - 45)) & (Oi.index >= e - pd.Timedelta(days=3 * 365 + 45))]
                    r3 = R[(R.end <= e - pd.Timedelta(days=3 * 365 - 45)) & (R.end >= e - pd.Timedelta(days=3 * 365 + 45))]
                    if len(o0) and len(o3) and len(r3): ok = o0.iloc[-1] / vals[a] >= o3.iloc[-1] / r3.ttm.iloc[-1] - 0.02
                S_[i, j] = ok
print('cechy gotowe', flush=True)
import pickle; pickle.dump((P_, S_, G0, SER), open(f'{SZ}/wzorce.pkl', 'wb'))
exec(open(os.path.join(HERE, 'r19_cem10.py')).read().split('warianty = {')[0])   # etf
spy, qqq = etf['SPY'], etf['QQQ']
mies = [m for m in ms if pd.Period('2012-01', 'M') <= m <= pd.Period('2026-09', 'M')]   # r19 nadpisuje 'mies'
def fwd(h):
    F = np.full((NT, NS), np.nan); F[:-h] = Cv[h:] / Cv[:-h] - 1; return F
out = ['# Etap 69: wzorce PARABOLA (typ NVIDIA) i STABILNY (typ Microsoft) w top 500 USA', '']
jN, jM = [j for j, k in enumerate(kod) if k == 'NVDA'], [j for j, k in enumerate(kod) if k == 'MSFT']
for nm, jj, M in (('NVDA', jN, P_), ('MSFT', jM, S_)):
    mm = [str(m) for m in mies if M[im_[m], jj].any()]
    out.append(f'- {nm}: miesiące we wzorcu ({len(mm)}): ' + (', '.join(mm[:3]) + ' … ' + ', '.join(mm[-3:]) if len(mm) > 6 else ', '.join(mm)))
out.append('')
rows = []
for h in (12, 36):
    F = fwd(h)
    for nm, M in (('PARABOLA', P_), ('STABILNY', S_)):
        for okr, a_, b_ in (('2012-2017', '2012-01', '2017-12'), ('2018-' + ('2023' if h == 36 else '2025'), '2018-01', '2023-09' if h == 36 else '2025-09'), ('całość', '2012-01', '2023-09' if h == 36 else '2025-09')):
            ex, wy, bs, bspy = [], [], [], []
            for m in mies:
                if not (pd.Period(a_, 'M') <= m <= pd.Period(b_, 'M')): continue
                i = im_[m]; uni = U[i] & np.isfinite(F[i]); sel = M[i] & np.isfinite(F[i])
                if not sel.any() or uni.sum() < 100: continue
                avg = F[i, uni].mean(); sr = spy.get(m + h, np.nan) / spy.get(m, np.nan) - 1
                ex += list(F[i, sel] - avg); wy += list(F[i, sel]); bs += list(F[i, sel] > avg); bspy += list(F[i, sel] > sr)
            if ex:
                rows.append(dict(wzorzec=nm, horyzont=f'{h} mies.', starty=okr, obserwacji=len(ex), sredni_zwrot=np.mean(wy), mediana_zwrotu=np.median(wy),
                                 srednia_nadwyzka_vs_srednia_spolek=np.mean(ex), mediana_nadwyzki=np.median(ex), bije_srednia=np.mean(bs), bije_SPY=np.mean(bspy)))
T = pd.DataFrame(rows)
# portfel co miesiąc
def portfel(M):
    v, eq, n = 1.0, [], []
    for a, m in enumerate(mies[:-1]):
        i = im_[m]; i1 = im_[mies[a + 1]]; sel = M[i] & np.isfinite(Cv[i]) & np.isfinite(Cv[i1])
        r = np.mean(Cv[i1, sel] / Cv[i, sel] - 1) if sel.any() else spy[mies[a + 1]] / spy[m] - 1
        v *= 1 + r - (0.002 if sel.any() else 0); eq.append((mies[a + 1], v)); n.append(int(sel.sum()))
    e = pd.Series(dict(eq)); return e, np.mean(n)
def cagr(e): return e.iloc[-1] ** (12 / len(e)) - 1, (e / e.cummax() - 1).min()
ewU = []
v = 1.0
for a, m in enumerate(mies[:-1]):
    i = im_[m]; i1 = im_[mies[a + 1]]; sel = U[i] & np.isfinite(Cv[i]) & np.isfinite(Cv[i1]); v *= 1 + np.mean(Cv[i1, sel] / Cv[i, sel] - 1); ewU.append((mies[a + 1], v))
ewU = pd.Series(dict(ewU))
Pt = []
for nm, M in (('PARABOLA', P_), ('STABILNY', S_)):
    e, n = portfel(M); c, d_ = cagr(e); Pt.append(dict(portfel=f'{nm}, równe wagi co miesiąc', CAGR=c, maxDD=d_, sr_spolek=n))
for nm, s in (('SPY', spy), ('QQQ', qqq)):
    x = s[mies[0]:mies[-1]]; e = x / x.iloc[0]; e = e.iloc[1:]; c, d_ = cagr(e); Pt.append(dict(portfel=nm, CAGR=c, maxDD=d_))
c, d_ = cagr(ewU); Pt.append(dict(portfel='równe wagi top 500', CAGR=c, maxDD=d_))
# trwałość
tr = []
for nm, M in (('PARABOLA', P_), ('STABILNY', S_)):
    for h in (12, 24):
        a_, b_, c_ = [], [], []
        for m in mies:
            if m + h > mies[-1]: break
            i, i2 = im_[m], im_[m + h]
            x = M[i] & U[i2]
            a_.append(M[i2][x].mean() if x.any() else np.nan); b_.append((P_[i2] | S_[i2])[x].mean() if x.any() else np.nan)
            c_.append(np.mean(np.nan_to_num(G0[i2][x], nan=-1) < 0.08) if x.any() else np.nan)
        tr.append(dict(wzorzec=nm, po=f'{h} mies.', nadal_ten_wzorzec=np.nanmean(a_), w_ktorymkolwiek=np.nanmean(b_), wzrost_przychodow_ponizej_8_proc=np.nanmean(c_)))
# lista dziś + spółki najczęściej we wzorcu
i = im_[mies[-1]]
dzis = {nm: sorted({kod[j] for j in np.flatnonzero(M[i])}) for nm, M in (('PARABOLA', P_), ('STABILNY', S_))}
czest = {nm: pd.Series({kod[j]: int(M[:, j].sum()) for j in range(NS) if M[:, j].any()}).groupby(level=0).sum().sort_values(ascending=False).head(25) for nm, M in (('PARABOLA', P_), ('STABILNY', S_))}
ile = {nm: int(np.median([M[im_[m]].sum() for m in mies])) for nm, M in (('PARABOLA', P_), ('STABILNY', S_))}
out += [f'Spółek we wzorcu w miesiącu (mediana): PARABOLA {ile["PARABOLA"]}, STABILNY {ile["STABILNY"]}.', '',
        '## Zwroty naprzód (cena; nadwyżka względem średniej spółek top 500 w tym samym miesiącu)', '', T.round(3).to_markdown(index=False), '',
        '## Portfel równych wag spółek we wzorcu (co miesiąc, 2012-01..2026-09, koszt 0,2 % miesięcznie; brak spółek = SPY)', '', pd.DataFrame(Pt).round(3).to_markdown(index=False), '',
        '## Trwałość wzorca', '', pd.DataFrame(tr).round(3).to_markdown(index=False), '']
for nm in ('PARABOLA', 'STABILNY'):
    out += [f'## {nm}: dziś ({mies[-1]}): ' + ', '.join(dzis[nm]), '', f'Najczęściej we wzorcu (liczba miesięcy): ' + ', '.join(f'{k} {v}' for k, v in czest[nm].items()), '']
open(os.path.join(WYN, 'r94_wzorce_wzrostu.md'), 'w').write('\n'.join(out)); print('\n'.join(out))
# wykres: przychody i zysk netto TTM NVDA i MSFT (skala log), zaznaczone miesiące wzorca
import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
fig, axs = plt.subplots(1, 2, figsize=(12, 4.6), dpi=150, facecolor='#fcfcfb')
for ax, (k, M, opis) in zip(axs, (('NVDA', P_, 'PARABOLA'), ('MSFT', S_, 'STABILNY'))):
    R, N = SER[k]; R = R.sort_values('end'); N = N.sort_values('end'); R = R[R.end >= '2011-01-01']; N = N[(N.end >= '2011-01-01') & (N.ttm > 0)]
    ax.set_facecolor('#fcfcfb')
    jj = [j for j, kk in enumerate(kod) if kk == k]
    for m in mies:
        if M[im_[m], jj].any(): ax.axvspan(m.to_timestamp(), (m + 1).to_timestamp(), color='#eda100', alpha=0.18, lw=0)
    ax.plot(R.end, R.ttm / 1e9, color='#2a78d6', lw=2, label='Przychody (12 mies.)')
    ax.plot(N.end, N.ttm / 1e9, color='#eb6834', lw=2, label='Zysk netto (12 mies.)')
    ax.set_yscale('log'); ax.set_title(f'{k}: przychody i zysk netto, mld USD (skala log.)', fontsize=11, color='#0b0b0b', loc='left')
    ax.grid(True, which='major', color='#e6e5e0', lw=0.6); [s.set_visible(False) for s in ax.spines.values()]; ax.tick_params(colors='#52514e', labelsize=9)
    ax.text(0.01, 0.97, f'tło: miesiące we wzorcu {opis}', transform=ax.transAxes, fontsize=8.5, color='#52514e', va='top')
    ax.legend(loc='lower right', fontsize=8.5, frameon=False)
plt.tight_layout(); plt.savefig(os.path.join(WYN, 'r94_nvda_msft.png'), facecolor='#fcfcfb')
