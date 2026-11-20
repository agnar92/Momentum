"""Etap 73: spółki stabilne (przychody 10-18 % r/r) i paraboliczne: zwrot wg horyzontu (1-10 lat) i portfel długoterminowy z dokupowaniem przy niskim PEG."""
import os, pickle, numpy as np, pandas as pd
HERE = os.path.dirname(os.path.abspath(__file__)); SZ = '/home/user/ndx/szer'
Z = np.load(f'{SZ}/cache.npz', allow_pickle=True); Cv, U = Z['Cv'], Z['U'].astype(bool)
PE_, G5, REV5, DE, FCF = (Z[k] for k in ('PE_', 'G5', 'REV5', 'DE', 'FCF'))
ms = [pd.Period(x, 'M') for x in Z['mies']]; im_ = {m: i for i, m in enumerate(ms)}; kod = np.array([str(s).split('.US')[0] for s in Z['seria']]); NT, NS = Cv.shape
P_, S_, G0, _ = pickle.load(open(f'{SZ}/wzorce.pkl', 'rb'))
exec(open(os.path.join(HERE, 'r19_cem10.py')).read().split('warianty = {')[0]); spy, qqq = etf['SPY'], etf['QQQ']
lag = lambda A, k: np.vstack([np.full((k, NS), np.nan), A[:-k]])
w = lambda A: (np.nan_to_num(A, nan=-9) >= 0.10) & (np.nan_to_num(A, nan=-9) <= 0.18)
ST = w(G0) & w(lag(G0, 12)) & w(lag(G0, 24)) & (np.nan_to_num(DE, nan=9) >= 0) & (np.nan_to_num(DE, nan=9) < 1) & (np.nan_to_num(FCF, nan=-1) > 0) & U
PA = P_ & U
PEG = {'EPS 5 l.': np.where((PE_ > 0) & (G5 > 0), PE_ / (100 * G5), np.nan), 'przychody 5 l.': np.where((PE_ > 0) & (REV5 > 0), PE_ / (100 * REV5), np.nan)}
ZLAM = ((np.nan_to_num(G0, nan=1) < 0.05) & (np.nan_to_num(lag(G0, 12), nan=1) < 0.05)) | (np.nan_to_num(DE, nan=0) > 1) | (np.nan_to_num(DE, nan=0) < 0)
out = ['# Etap 73: spółki stabilne (przychody 10-18 % r/r 3 lata, dług < 1, FCF > 0) i paraboliczne — horyzont 1-10 lat i portfel długoterminowy (top 500 USA)', '']
# (A)
def fwd(h):
    R = np.full((NT, NS), np.nan); R[:-h] = Cv[h:] / Cv[:-h] - 1; return R
rows = []
for h in (12, 36, 60, 120):
    R = fwd(h); kon = {12: '2025-09', 36: '2023-09', 60: '2021-09', 120: '2016-09'}[h]
    acc = {'STABILNA': [], 'PARABOLICZNA': [], 'pozostałe': []}
    for m in ms:
        if not (pd.Period('2012-01', 'M') <= m <= pd.Period(kon, 'M')): continue
        i = im_[m]; uni = U[i] & np.isfinite(R[i])
        if uni.sum() < 100: continue
        avg = R[i, uni].mean(); sr = spy.get(m + h, np.nan) / spy.get(m, np.nan) - 1
        for nm, M in (('STABILNA', ST[i] & uni), ('PARABOLICZNA', PA[i] & uni), ('pozostałe', uni & ~ST[i] & ~PA[i])):
            acc[nm] += [(R[i, j] - avg, R[i, j] > sr, kod[j]) for j in np.flatnonzero(M)]
    for nm, v in acc.items():
        ex = np.array([x[0] for x in v])
        rows.append(dict(grupa=nm, horyzont=f'{h // 12} l.', obs=len(v), spolek=len({x[2] for x in v}), nadwyzka_srednia=ex.mean(), nadwyzka_mediana=np.median(ex),
                         bije_srednia=(ex > 0).mean(), bije_SPY=np.mean([x[1] for x in v]), nadwyzka_rocznie_mediana=(1 + np.median(ex) / 1) ** 0 - 1))
T = pd.DataFrame(rows).drop(columns='nadwyzka_rocznie_mediana')
out += ['## (A) Nadwyżka nad średnią spółek top 500 wg horyzontu (starty od 2012)', '', T.round(3).to_markdown(index=False), '']
# (B)
mies = [m for m in ms if pd.Period('2013-01', 'M') <= m <= pd.Period('2026-09', 'M')]
def portfel(peg, stab=True, para=True, bez=(), log=None):
    poz, typ, sp, eq = {}, {}, 1.0, []
    wyl = np.isin(kod, list(bez)); pg_all = PEG[peg]
    for a, m in enumerate(mies[:-1]):
        i, i1 = im_[m], im_[mies[a + 1]]
        for j in list(poz):
            if ZLAM[i, j]: sp += poz.pop(j) * 0.999; typ.pop(j)
        e = sp + sum(poz.values()); pg = np.nan_to_num(pg_all[i], nan=99)
        para_w = sum(v for j, v in poz.items() if typ[j] == 'P')
        kand = []
        if stab: kand += [(pg[j], j, 'S') for j in np.flatnonzero(ST[i] & ~wyl & (pg > 0) & (pg < 2) & np.isfinite(Cv[i1]))]
        if para: kand += [(pg[j], j, 'P') for j in np.flatnonzero(PA[i] & ~wyl & (pg > 0) & (pg < 1) & np.isfinite(Cv[i1]))]
        n = 0
        for _, j, t in sorted(kand):
            if n >= 4: break
            kw = min(0.02 * e, 0.10 * e - poz.get(j, 0), sp)
            if t == 'P': kw = min(kw, 0.30 * e - para_w)
            if kw < 0.002 * e: continue
            poz[j] = poz.get(j, 0) + kw * 0.999; typ.setdefault(j, t); sp -= kw; n += 1
            if t == 'P': para_w += kw
        for j in list(poz):
            if np.isfinite(Cv[i1, j]) and np.isfinite(Cv[i, j]): poz[j] *= Cv[i1, j] / Cv[i, j]
            else: sp += poz.pop(j) * 0.999; typ.pop(j)
        sp *= spy[mies[a + 1]] / spy[m]
        tot = sp + sum(poz.values()); eq.append((tot, len(poz), 1 - sp / tot))
    e = pd.Series([x[0] for x in eq]); lat = len(e) / 12
    naj = max(poz.items(), key=lambda x: x[1]) if poz else (None, 0)
    return dict(CAGR=e.iloc[-1] ** (1 / lat) - 1, maxDD=(e / e.cummax() - 1).min(), sr_spolek=np.mean([x[1] for x in eq]), w_spolkach=np.mean([x[2] for x in eq]),
                najwieksza=f'{kod[naj[0]]} {naj[1] / e.iloc[-1]:.0%}' if naj[0] is not None else '')
rows = []
for nm, s in (('SPY', spy), ('QQQ', qqq)):
    x = s[mies[0]:mies[-1]]; e = (x / x.iloc[0]).iloc[1:]; rows.append(dict(wariant=nm, CAGR=e.iloc[-1] ** (12 / len(e)) - 1, maxDD=(e / e.cummax() - 1).min()))
for peg in PEG:
    for opis, kw in (('obie grupy', {}), ('tylko stabilne', dict(para=False)), ('tylko paraboliczne', dict(stab=False)), ('obie, bez NVDA', dict(bez=('NVDA',)))):
        rows.append(dict(wariant=f'{opis}, PEG z {peg}', **portfel(peg, **kw))); print(rows[-1]['wariant'], round(rows[-1]['CAGR'], 3), flush=True)
n_st = int(np.median([ST[im_[m]].sum() for m in mies])); n_pa = int(np.median([PA[im_[m]].sum() for m in mies]))
i = im_[mies[-1]]
out += [f'## (B) Portfel 2013-01..2026-09 (stabilne przy PEG < 2, paraboliczne przy PEG < 1, transze 2 %, trzymanie do załamania, gotówka w SPY)', '',
        f'Spółek w miesiącu: STABILNA mediana {n_st}, PARABOLICZNA {n_pa}.', '', pd.DataFrame(rows).round(3).to_markdown(index=False), '',
        f'STABILNE dziś ({mies[-1]}): ' + ', '.join(f'{kod[j]} (PEG {PEG["EPS 5 l."][i, j]:.2f})' if np.isfinite(PEG["EPS 5 l."][i, j]) else kod[j] for j in np.flatnonzero(ST[i])), '']
open(os.path.join(HERE, 'wyniki', 'r98_dlugi_termin.md'), 'w').write('\n'.join(out)); print('\n'.join(out))
