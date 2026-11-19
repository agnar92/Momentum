"""Etap 72: PEG z własną prognozą (F5, F3, F1): MSFT, NVDA i portfel spółek STABILNY (styczeń, 10 miejsc, trzymanie 5 lat)."""
import os, numpy as np, pandas as pd
HERE = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(HERE, 'r96_peg_prognoza.py')).read(); exec(src[:src.index("out = ['# Etap 71")])
PEGS = {nm: np.where((PE_ > 0) & (F[k] > 0), PE_ / (100 * F[k]), np.nan) for nm, k in
        (('F5 model', 'F5 model (dopasowany 2012-16)'), ('F3 przychody ważone', 'F3 przychody ważone (4 kw.)'), ('F1 historyczny EPS', 'F1 historyczny EPS 5 l.'))}
def fwd(h):
    R = np.full((NT, NS), np.nan); R[:-h] = Cv[h:] / Cv[:-h] - 1; return R
FW = {h: fwd(h) for h in (12, 36, 60)}
kosz = lambda p: 'PEG < 1' if 0 < p < 1 else 'PEG 1-2' if 1 <= p < 2 else 'PEG >= 2 lub brak'
out = ['# Etap 72: PEG z własną prognozą wzrostu EPS — MSFT, NVDA, portfel spółek stabilnych', '']
for t in ('MSFT', 'NVDA'):
    jj = np.flatnonzero(kod == t)
    for nm, PEG in PEGS.items():
        rows = []
        for m in ms:
            if not (pd.Period('2012-01', 'M') <= m <= pd.Period('2025-09', 'M')): continue
            i = im_[m]; j = next((j for j in jj if np.isfinite(Cv[i, j])), None)
            if j is None: continue
            r = dict(m=str(m), PEG=PEG[i, j], k=kosz(PEG[i, j]))
            for h in (12, 36, 60): r[f'z{h}'] = FW[h][i, j]; r[f's{h}'] = FW[h][i, j] - (spy.get(m + h, np.nan) / spy.get(m, np.nan) - 1)
            rows.append(r)
        R = pd.DataFrame(rows)
        T = R.groupby('k').agg(miesiecy=('m', 'size'), zwrot_12m=('z12', 'mean'), zwrot_60m=('z60', 'mean'), nad_SPY_12m=('s12', 'mean'), nad_SPY_36m=('s36', 'mean'), nad_SPY_60m=('s60', 'mean'))
        sty = ', '.join(f'{r.m[:4]} {r.PEG:.2f}' if np.isfinite(r.PEG) else f'{r.m[:4]} -' for r in R[R.m.str.endswith('-01')].itertuples())
        out += [f'## {t}, PEG wg {nm}', '', T.round(2).to_markdown(), '', f'PEG w styczniu: {sty}', '']
# portfel
mies = [m for m in ms if pd.Period('2013-01', 'M') <= m <= pd.Period('2026-09', 'M')]
def portfel(PEG, prog=1.0, trzymaj=60, wyjscie=False, bez=(), N=10):
    poz, sp, eq = {}, 1.0, []
    wyl = np.isin(kod, list(bez))
    for a, m in enumerate(mies[:-1]):
        i, i1 = im_[m], im_[mies[a + 1]]
        for j in list(poz):
            v, od = poz[j]
            if (m - od).n >= trzymaj or (wyjscie and m.month == 1 and not S_[i, j] and not (np.nan_to_num(PEG[i, j], nan=9) < 3)):
                sp += v * 0.999; del poz[j]
        if m.month == 1:
            e = sp + sum(v for v, _ in poz.values())
            k_ = np.flatnonzero(S_[i] & ~wyl & (PEG[i] > 0) & (PEG[i] < prog) & np.isfinite(Cv[i]) & np.isfinite(Cv[i1]))
            for j in k_[np.argsort(PEG[i, k_])]:
                if len(poz) >= N or j in poz: continue
                kw = min(e / N, sp)
                if kw <= 1e-9: break
                poz[j] = (kw * 0.999, m); sp -= kw
        for j in list(poz):
            v, od = poz[j]
            if np.isfinite(Cv[i1, j]) and np.isfinite(Cv[i, j]): poz[j] = (v * Cv[i1, j] / Cv[i, j], od)
            else: sp += v * 0.999; del poz[j]
        sp *= spy[mies[a + 1]] / spy[m]
        eq.append((sp + sum(v for v, _ in poz.values()), len(poz)))
    e = pd.Series([x for x, _ in eq]); lat = len(e) / 12
    return dict(CAGR=e.iloc[-1] ** (1 / lat) - 1, maxDD=(e / e.cummax() - 1).min(), sr_spolek=np.mean([n for _, n in eq]))
x = spy[mies[0]:mies[-1]]; es = (x / x.iloc[0]).iloc[1:]; lat = len(es) / 12
xq = etf['QQQ'][mies[0]:mies[-1]]; eq_ = (xq / xq.iloc[0]).iloc[1:]
rows = [dict(wariant='SPY', CAGR=es.iloc[-1] ** (1 / lat) - 1, maxDD=(es / es.cummax() - 1).min()), dict(wariant='QQQ', CAGR=eq_.iloc[-1] ** (1 / lat) - 1, maxDD=(eq_ / eq_.cummax() - 1).min())]
for nm, PEG in PEGS.items():
    for prog in (1.0, 1.5, 2.0):
        rows.append(dict(wariant=f'{nm}, PEG < {prog:g}, trzymaj 5 lat', **portfel(PEG, prog)))
    rows.append(dict(wariant=f'{nm}, PEG < 2, trzymaj 5 lat lub sprzedaj gdy nie STABILNY i PEG >= 3', **portfel(PEG, 2.0, wyjscie=True)))
    rows.append(dict(wariant=f'{nm}, PEG < 2, trzymaj 5 lat, bez NVDA i MSFT', **portfel(PEG, 2.0, bez=('NVDA', 'MSFT'))))
    print(nm, flush=True)
out += ['## Portfel: styczeń, spółki STABILNY z PEG < próg, 10 miejsc po 1/10 konta, trzymanie 5 lat, wolna gotówka w SPY (2013-01..2026-09)', '',
        pd.DataFrame(rows).round(3).to_markdown(index=False), '']
open(os.path.join(HERE, 'wyniki', 'r97_peg_f5_portfel.md'), 'w').write('\n'.join(out)); print('\n'.join(out))
