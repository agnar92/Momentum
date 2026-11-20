"""Etap 74: CAGR przychodów 5 l. > 8 %, dług < 1, FCF > 0, ROE > 15 %, ROA > 10 %, ROE rośnie (5 / 3 lata): nadwyżka wg horyzontu i portfel z transzami po PEG."""
import os, json, pickle, datetime as dt, numpy as np, pandas as pd
HERE = os.path.dirname(os.path.abspath(__file__)); SZ = '/home/user/ndx/szer'
dd = lambda s: dt.date.fromisoformat(s)
r25 = open(os.path.join(HERE, 'r25_cem10_eps.py')).read(); exec(r25[r25.index('def kwartaly'):r25.index('\n\n\ncechy = {}')])
r39 = open(os.path.join(HERE, 'r39_peg.py')).read(); exec(r39[r39.index('def ttm_serie'):r39.index('\n\n\nTT = {k:')])
Z = np.load(f'{SZ}/cache.npz', allow_pickle=True); Cv, U = Z['Cv'], Z['U'].astype(bool)
PE_, REV5, DE, FCF, ROE = (Z[k] for k in ('PE_', 'REV5', 'DE', 'FCF', 'ROE'))
ms = [pd.Period(x, 'M') for x in Z['mies']]; im_ = {m: i for i, m in enumerate(ms)}; kod = np.array([str(s).split('.US')[0] for s in Z['seria']]); NT, NS = Cv.shape
P_, S_, G0, _ = pickle.load(open(f'{SZ}/wzorce.pkl', 'rb'))
# ROA = zysk netto TTM / aktywa (ostatnie znane, <= 400 dni)
BIL = json.load(open(f'{SZ}/bilans.json')); AK = json.load(open(f'{SZ}/aktywa.json'))
ROA = np.full((NT, NS), np.nan); ME = [m.to_timestamp(how='end') for m in ms]
cache = {}
for j, k in enumerate(kod):
    if k not in cache:
        ni = (BIL.get(k) or {}).get('ni'); a = AK.get(k)
        T = None
        if ni:
            q = kwartaly([[s, e, v, f] for s, e, v, f in ni])
            if len(q) >= 4:
                g = pd.DataFrame([(pd.Timestamp(e), v, pd.Timestamp(f)) for e, (v, f) in q.items()], columns=['end', 'eps', 'filed']).sort_values('end'); T = ttm_serie(g)
        A = sorted((pd.Timestamp(f), pd.Timestamp(e), v) for e, v, f in a) if a else None
        cache[k] = (T, A)
    T, A = cache[k]
    if T is None or T.empty or not A: continue
    T = T.sort_values('zn')
    for i, m in enumerate(ms):
        if not U[i, j] or m < pd.Period('2011-01', 'M'): continue
        t = ME[i]; z = T[T.zn <= t]
        if z.empty or (t - z.end.max()).days > 200: continue
        ni_ = z.sort_values('end').ttm.iloc[-1]
        aa = [x for x in A if x[0] <= t and (t - x[1]).days <= 400]
        if aa: ROA[i, j] = ni_ / max(aa, key=lambda x: x[1])[2]
exec(open(os.path.join(HERE, 'r19_cem10.py')).read().split('warianty = {')[0]); spy, qqq = etf['SPY'], etf['QQQ']
lag = lambda A_, k: np.vstack([np.full((k, NS), np.nan), A_[:-k]])
nz = lambda A_, v: np.nan_to_num(A_, nan=v)
K1 = nz(REV5, -9) > 0.08; K2 = (nz(DE, 9) >= 0) & (nz(DE, 9) < 1); K3 = nz(FCF, -1) > 0; K4 = nz(ROE, -9) > 0.15; K5 = nz(ROA, -9) > 0.10
K6 = nz(ROE, -9) > nz(lag(ROE, 60), 99); K6b = nz(ROE, -9) > nz(lag(ROE, 36), 99)
ZB = {'Z1 przychody 5 l. > 8 %, dług < 1, FCF > 0': K1 & K2 & K3, 'Z2 + ROE > 15 %': K1 & K2 & K3 & K4, 'Z3 + ROA > 10 %': K1 & K2 & K3 & K4 & K5,
      'Z4 + ROE dziś > ROE 5 lat temu': K1 & K2 & K3 & K4 & K5 & K6, 'Z4b + ROE dziś > ROE 3 lata temu': K1 & K2 & K3 & K4 & K5 & K6b}
ZB = {k: v & U for k, v in ZB.items()}
out = ['# Etap 74: przychody 5 l. > 8 %/rok, dług < 1, FCF > 0, ROE > 15 %, ROA > 10 %, ROE rośnie — top 500 USA', '']
def fwd(h):
    R = np.full((NT, NS), np.nan); R[:-h] = Cv[h:] / Cv[:-h] - 1; return R
rows = []
for h in (12, 36, 60):
    R = fwd(h); kon = {12: '2025-09', 36: '2023-09', 60: '2021-09'}[h]
    for okr, a_, b_ in (('całość', '2012-01', kon), ('2012-2016', '2012-01', '2016-12'), ('2017+', '2017-01', kon)):
        for nm, M in ZB.items():
            ex, sp_, ko = [], [], set()
            for m in ms:
                if not (pd.Period(a_, 'M') <= m <= pd.Period(b_, 'M')): continue
                i = im_[m]; uni = U[i] & np.isfinite(R[i])
                if uni.sum() < 100: continue
                avg = R[i, uni].mean(); sr = spy.get(m + h, np.nan) / spy.get(m, np.nan) - 1
                for j in np.flatnonzero(M[i] & uni): ex.append(R[i, j] - avg); sp_.append(R[i, j] > sr); ko.add(kod[j])
            if ex: rows.append(dict(zestaw=nm, horyzont=f'{h // 12} l.', starty=okr, obs=len(ex), spolek=len(ko), nadwyzka_srednia=np.mean(ex), nadwyzka_mediana=np.median(ex),
                                    bije_srednia=np.mean(np.array(ex) > 0), bije_SPY=np.mean(sp_)))
T = pd.DataFrame(rows)
mies = [m for m in ms if pd.Period('2013-01', 'M') <= m <= pd.Period('2026-09', 'M')]
out += [f'Spółek w zestawie (mediana w miesiącu 2013-2026): ' + ', '.join(f'{k.split()[0]} {int(np.median([M[im_[m]].sum() for m in mies]))}' for k, M in ZB.items()), '',
        '## (A) Nadwyżka nad średnią spółek top 500', '', T.round(3).to_markdown(index=False), '']
PEG = np.where((PE_ > 0) & (REV5 > 0), PE_ / (100 * REV5), np.nan)
ZLAM = ((nz(G0, 1) < 0.05) & (nz(lag(G0, 12), 1) < 0.05)) | (nz(DE, 0) > 1) | (nz(DE, 0) < 0)
def portfel(M, prog=1e9, trim=None, bez=()):
    poz, sp, eq = {}, 1.0, []
    wyl = np.isin(kod, list(bez))
    for a, m in enumerate(mies[:-1]):
        i, i1 = im_[m], im_[mies[a + 1]]
        for j in list(poz):
            if ZLAM[i, j]: sp += poz.pop(j) * 0.999
        e = sp + sum(poz.values())
        if trim and m.month == 1:
            for j in poz:
                if poz[j] > trim * e: sp += (poz[j] - trim * e) * 0.999; poz[j] = trim * e
        pg = nz(PEG[i], 99); k_ = np.flatnonzero(M[i] & ~wyl & (pg > 0) & (pg < prog) & np.isfinite(Cv[i1]) & ~ZLAM[i]); n = 0
        for j in k_[np.argsort(pg[k_])]:
            if n >= 4: break
            kw = min(0.02 * e, 0.10 * e - poz.get(j, 0), sp)
            if kw < 0.002 * e: continue
            poz[j] = poz.get(j, 0) + kw * 0.999; sp -= kw; n += 1
        for j in list(poz):
            if np.isfinite(Cv[i1, j]) and np.isfinite(Cv[i, j]): poz[j] *= Cv[i1, j] / Cv[i, j]
            else: sp += poz.pop(j) * 0.999
        sp *= spy[mies[a + 1]] / spy[m]
        tot = sp + sum(poz.values()); eq.append((tot, len(poz), 1 - sp / tot))
    e = pd.Series([x[0] for x in eq]); lat = len(e) / 12
    naj = max(poz.items(), key=lambda x: x[1]) if poz else (None, 0)
    return dict(CAGR=e.iloc[-1] ** (1 / lat) - 1, maxDD=(e / e.cummax() - 1).min(), sr_spolek=np.mean([x[1] for x in eq]), w_spolkach=np.mean([x[2] for x in eq]),
                najwieksza=f'{kod[naj[0]]} {naj[1] / e.iloc[-1]:.0%}' if naj[0] is not None else '')
rows = []
for nm, s in (('SPY', spy), ('QQQ', qqq)):
    x = s[mies[0]:mies[-1]]; e = (x / x.iloc[0]).iloc[1:]; rows.append(dict(wariant=nm, CAGR=e.iloc[-1] ** (12 / len(e)) - 1, maxDD=(e / e.cummax() - 1).min()))
for nm, M in ZB.items():
    rows.append(dict(wariant=f'{nm}, bez progu PEG', **portfel(M)))
    rows.append(dict(wariant=f'{nm}, PEG < 2', **portfel(M, 2.0)))
    print(nm, flush=True)
for nm in ('Z3 + ROA > 10 %', 'Z4 + ROE dziś > ROE 5 lat temu'):
    rows.append(dict(wariant=f'{nm}, bez progu PEG, przycinanie do 15 % w styczniu', **portfel(ZB[nm], trim=0.15)))
    rows.append(dict(wariant=f'{nm}, bez progu PEG, bez NVDA', **portfel(ZB[nm], bez=('NVDA',))))
i = im_[mies[-1]]; dz = np.flatnonzero(ZB['Z4 + ROE dziś > ROE 5 lat temu'][i])
out += ['## (B) Portfel: transze 2 % (max 4 / mies.), max 10 % przy kupnie, kolejność od najniższego PEG, trzymanie do załamania, gotówka w SPY (2013-01..2026-09)', '',
        pd.DataFrame(rows).round(3).to_markdown(index=False), '',
        f'Z4 dziś ({mies[-1]}): ' + ', '.join(f'{kod[j]} (PEG {PEG[i, j]:.2f}, ROE {ROE[i, j]:.0%}, ROA {ROA[i, j]:.0%})' for j in dz[np.argsort(nz(PEG[i, dz], 99))]), '']
open(os.path.join(HERE, 'wyniki', 'r99_jakosc_roa.md'), 'w').write('\n'.join(out)); print('\n'.join(out))
