"""Etap 65: (A) dług/kapitał < 1 vs >= 1; (B) spółki stabilne / paraboliczne, wagi 1/PEG z limitem 10 %."""
import os, numpy as np, pandas as pd
HERE = os.path.dirname(os.path.abspath(__file__))
exec(open(os.path.join(HERE, 'r86_rankingi_proste.py')).read().split('\nrows = []')[0])   # etap 63/64: D, macierze, portfel, miary, REV50m, STm (rev50 & dd), WSm
pos5 = okA & (np.where(okA[:, None], A, -1) > 0).all(1); gg = np.nan_to_num(g5, nan=-1)
U = (pos5 & (gg >= 0.08) & (gg <= 0.15)) | (pos5 & (gg >= 0.20))
Um = mat(U, False, bool) | STm
UNI = Um & WSm


def wagi(peg, rowne=False, limit=0.10):
    raw = np.ones(len(peg)) if rowne else 1 / peg
    w = np.zeros(len(raw)); wolne = np.ones(len(raw), bool); zost = 1.0
    while wolne.any():
        x = zost * raw[wolne] / raw[wolne].sum()
        if (x <= limit + 1e-12).all(): w[wolne] = x; break
        idx = np.flatnonzero(wolne)[x > limit]; w[idx] = limit; zost -= limit * len(idx); wolne[idx] = False
    return w


def strat(co=1, rowne=False, bez=(), limit=0.10):
    poz, sp, eq, ile, udz = {}, 1.0, [], [], []
    wyl = np.isin(tick, list(bez))
    for a, m in enumerate(mies[:-1]):
        i = im_[m]; i1 = im_[mies[a + 1]]
        if (co == 1) or (co == 3 and m.month in (1, 4, 7, 10)) or (co == 12 and m.month == 1) or a == 0:
            e = sp + sum(poz.values())
            ok = np.flatnonzero(UNI[i] & ~wyl & np.isfinite(PEG[i]) & (np.nan_to_num(PEG[i]) > 0) & np.isfinite(Cv[i]) & np.isfinite(Cv[i1]))
            w = wagi(PEG[i, ok], rowne, limit) if len(ok) else np.array([])
            cel = {j: wi * e for j, wi in zip(ok, w)}
            zm = sum(abs(cel.get(j, 0) - poz.get(j, 0)) for j in set(cel) | set(poz))
            poz = cel; sp = e - sum(cel.values()) - zm * KOSZT
        for j in list(poz):
            if np.isfinite(Cv[i1, j]) and np.isfinite(Cv[i, j]): poz[j] *= Cv[i1, j] / Cv[i, j]
            else: sp += poz.pop(j) * (1 - KOSZT)
        if np.isfinite(SPYR[i]): sp *= 1 + SPYR[i]
        tot = sp + sum(poz.values()); eq.append((mies[a + 1], tot)); ile.append(len(poz)); udz.append(sum(poz.values()) / tot)
    e = pd.Series(dict(eq)); s = spy[(spy.index >= mies[1]) & (spy.index <= mies[-1])] / spy[mies[0]]; e = e.reindex(s.index)
    return e, s, len(e) / 12, np.mean(ile), np.mean(udz)


rows = []
ew, s, lat = portfel(lambda i: (np.flatnonzero(CZL[i]), np.zeros(NS)), N=0)
rows.append(dict(wariant='(A) wszyscy członkowie S&P 500, równe wagi', **miary(ew, s, lat, ew)))
rows.append(dict(wariant='(A) dług/kapitał 0-1, równe wagi', **miary(*portfel(lambda i: (np.flatnonzero(CZL[i] & (np.nan_to_num(DEm[i], nan=-1) >= 0) & (np.nan_to_num(DEm[i], nan=9) < 1)), np.zeros(NS)), N=0), ew)))
rows.append(dict(wariant='(A) dług/kapitał >= 1 lub ujemny kapitał, równe wagi', **miary(*portfel(lambda i: (np.flatnonzero(CZL[i] & np.isfinite(DEm[i]) & ((DEm[i] >= 1) | (DEm[i] < 0))), np.zeros(NS)), N=0), ew)))
rows.append(dict(wariant='SPY', **miary(s, s, lat, ew)))
for co, cn in ((1, 'co miesiąc'), (3, 'co kwartał'), (12, 'co rok')):
    for rw, rn in ((False, 'wagi 1/PEG'), (True, 'równe wagi')):
        e, s_, l_, n_, u_ = strat(co, rw); rows.append(dict(wariant=f'(B) {rn}, max 10 %, {cn}', **miary(e, s_, l_, ew), sr_spolek=n_, udzial=u_))
    print(cn, flush=True)
for opis, kw in (('(B) wagi 1/PEG, co miesiąc, bez NVDA', dict(bez=('NVDA',))), ('(B) wagi 1/PEG, co rok, bez NVDA', dict(co=12, bez=('NVDA',))),
                 ('(B) wagi 1/PEG, max 20 %, co miesiąc', dict(limit=0.20))):
    e, s_, l_, n_, u_ = strat(**kw); rows.append(dict(wariant=opis, **miary(e, s_, l_, ew), sr_spolek=n_, udzial=u_))
# kwintyle długu: nadwyżka 60 mies. (panel)
K = D[(D.mp >= pd.Period('2012-01', 'M')) & (D.mp <= pd.Period('2021-09', 'M'))][['mp', 'dług / kapitał', 'e60', 'f60']].dropna()
K = K[K['dług / kapitał'] >= 0]; K['k'] = K.groupby('mp')['dług / kapitał'].transform(lambda x: pd.qcut(x.rank(method='first'), 5, labels=False))
kq = K.groupby(['mp', 'k']).e60.mean().groupby('k').mean()
T = pd.DataFrame(rows)
n_uni = [int(UNI[im_[m]].sum()) for m in mies]
i = im_[mies[-1]]; ok = np.flatnonzero(UNI[i] & np.isfinite(PEG[i]) & (np.nan_to_num(PEG[i]) > 0)); w = wagi(PEG[i, ok])
L = pd.DataFrame(dict(spolka=tick[ok], PEG=PEG[i, ok], waga=w)).sort_values('waga', ascending=False)
out = ['# Etap 65: dług/kapitał < 1 vs >= 1; spółki o stabilnym / parabolicznym wzroście z wagami 1/PEG (max 10 %); 2015-01..2026-09', '',
       'Kwintyle dług/kapitał (K1 najniższy), średnia nadwyżka 60 mies. nad średnią spółek, starty 2012-2021: ' + ', '.join(f'K{int(k) + 1} {v:+.1%}' for k, v in kq.items()), '',
       f'Spółek we wszechświecie (B) w miesiącu: mediana {np.median(n_uni):.0f} ({min(n_uni)}-{max(n_uni)}).', '',
       T.round(3).to_markdown(index=False), '', f'## Skład na {mies[-1]} (wagi 1/PEG; SPY {1 - w.sum():.0%})', '', L.round(3).to_markdown(index=False), '']
open(os.path.join(HERE, 'wyniki', 'r87_dlug_wagi_peg.md'), 'w').write('\n'.join(out)); print('\n'.join(out[:40]))
