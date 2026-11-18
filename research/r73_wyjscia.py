"""Etap 51: wejście PEG z przychodów < 1, różne wyjścia; wolna gotówka w SPY."""
import os, numpy as np, pandas as pd
HERE = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(HERE, 'r72_pobicie.py')).read().split("f = lambda s: s.fillna(False)")[0]
exec(src)                                    # D z kolumną R (przychody +8 % co rok), etf, best_map
Z = np.load('/home/user/ndx/wskazniki_cache.npz', allow_pickle=True); Cv = Z['Cv']
ms = [pd.Period(x, 'M') for x in Z['mies']]; ser = list(Z['seria']); im_ = {m: i for i, m in enumerate(ms)}; cols = {s: j for j, s in enumerate(ser)}
NT, NS = Cv.shape
def mat(series_bool_or_val, fill=np.nan, dtype=float):
    A = np.full((NT, NS), fill, dtype=dtype); ii = np.array([im_[m] for m in D.mp]); jj = np.array([cols.get(s, -1) for s in D.seria]); ok = jj >= 0
    A[ii[ok], jj[ok]] = np.asarray(series_bool_or_val)[ok]; return A
f = lambda s: s.fillna(False).values
PEGr = np.where((D['P/E'] > 0) & (D['przychody 5 lat (CAGR)'] > 0), D['P/E'] / (100 * D['przychody 5 lat (CAGR)']), np.nan)
RDZEN = mat(D.R.values & f((D['dług / kapitał'] >= 0) & (D['dług / kapitał'] < 1)) & f(D['FCF yield'] > 0), False, bool)
PEG = mat(PEGr)
ZLAM = mat(f(D['przychody TTM r/r'] < 0) | f(D['dług / kapitał'] > 1) | f(D['FCF yield'] < 0), False, bool)
CZLONEK = mat(np.ones(len(D), bool), False, bool)
spy = etf['SPY']; SPYR = np.array([spy.get(ms[i + 1], np.nan) / spy.get(ms[i], np.nan) - 1 if i + 1 < NT else 0 for i in range(NT)])
KOSZT = 0.001; OD, DO = pd.Period('2015-01', 'M'), pd.Period('2026-09', 'M'); mies = [m for m in ms if OD <= m <= DO]


def sim(wej, wyj, N=10, w_spy=True):
    poz, got, eq, czasy, spyeq = {}, 1.0, [], [], []
    for a, m in enumerate(mies[:-1]):
        i = im_[m]; i1 = im_[mies[a + 1]]
        for j in list(poz):
            p = poz[j]; wiek = (m - p['od']).n
            sprzedaj = (wyj == 'W0' and wiek >= 60) or (wyj in ('W1', 'W4', 'W6') and ZLAM[i, j]) or (wyj in ('W2', 'W6') and PEG[i, j] > 2) \
                or (wyj in ('W3', 'W4') and PEG[i, j] > 3) or (wyj == 'W5' and m.month == 1 and not (RDZEN[i, j] and PEG[i, j] < wej))
            if sprzedaj: got += p['v'] * (1 - KOSZT); czasy.append(wiek); del poz[j]
        ok = np.flatnonzero(RDZEN[i] & (np.nan_to_num(PEG[i], nan=99) < wej) & np.isfinite(Cv[i])); ok = ok[np.argsort(PEG[i, ok])]
        e = got + sum(p['v'] for p in poz.values())
        for j in ok:
            if len(poz) >= N: break
            if j in poz: continue
            kw = min(e / N, got)
            if kw <= 1e-9: break
            got -= kw; poz[j] = {'v': kw * (1 - KOSZT), 'od': m}
        for j in list(poz):
            if np.isfinite(Cv[i1, j]) and np.isfinite(Cv[i, j]): poz[j]['v'] *= Cv[i1, j] / Cv[i, j]
            else: p = poz.pop(j); got += p['v'] * (1 - KOSZT); czasy.append((m - p['od']).n)
        if w_spy and np.isfinite(SPYR[i]): got *= 1 + SPYR[i]
        eq.append((mies[a + 1], got + sum(p['v'] for p in poz.values()), sum(p['v'] for p in poz.values())))
    czasy += [(mies[-1] - p['od']).n for p in poz.values()]
    e = pd.Series({m: v for m, v, _ in eq}); sp = spy[(spy.index >= mies[1]) & (spy.index <= mies[-1])]; sp = sp / spy[mies[0]]
    e = e.reindex(sp.index)
    c = e.iloc[-1] ** (12 / len(e)) - 1; spc = sp.iloc[-1] ** (12 / len(sp)) - 1; dd_ = (e / e.cummax() - 1).min()
    w12 = (e.pct_change(12) > sp.pct_change(12)).iloc[12:].mean(); w60 = (e.pct_change(60) > sp.pct_change(60)).iloc[60:].mean()
    return dict(CAGR=c, SPY_CAGR=spc, maxDD=dd_, okna_12m_lepsze_od_SPY=w12, okna_60m_lepsze_od_SPY=w60, sr_w_spolkach=float(np.mean([x / v for _, v, x in eq])),
                mediana_mies_trzymania=float(np.median(czasy)) if czasy else np.nan, sprzedazy=len(czasy))


WYJ = {'W0 trzymaj 5 lat': 'W0', 'W1 załamanie fundamentów': 'W1', 'W2 PEG z przychodów > 2': 'W2', 'W3 PEG z przychodów > 3': 'W3', 'W4 załamanie lub PEG > 3': 'W4',
       'W5 coroczna przebudowa (styczeń)': 'W5', 'W6 załamanie lub PEG > 2': 'W6', 'W7 nigdy': 'W7'}
rows = []
for wej in (1.0, 2.0):
    for nm, w in WYJ.items():
        rows.append(dict(wejscie=f'PEG z przychodów < {wej:g}', wyjscie=nm, gotowka='SPY', **sim(wej, w)))
    for nm in ('W0 trzymaj 5 lat', 'W4 załamanie lub PEG > 3'):
        rows.append(dict(wejscie=f'PEG z przychodów < {wej:g}', wyjscie=nm, gotowka='0 %', **sim(wej, WYJ[nm], w_spy=False)))
    print(wej, flush=True)
T = pd.DataFrame(rows)
ile = [int(np.sum(RDZEN[im_[m]] & (np.nan_to_num(PEG[im_[m]], nan=99) < 1))) for m in mies]; ile2 = [int(np.sum(RDZEN[im_[m]] & (np.nan_to_num(PEG[im_[m]], nan=99) < 2))) for m in mies]
out = ['# Etap 51: wejście PEG z przychodów < 1 / < 2 (rdzeń: przychody +8 % co rok, dług < 1, FCF > 0), różne wyjścia; 2015-2026', '',
       f'Kandydatów w miesiącu: PEG < 1 mediana {np.median(ile):.0f} (0-{max(ile)}), PEG < 2 mediana {np.median(ile2):.0f} (0-{max(ile2)}). Wolna gotówka w SPY, chyba że zaznaczono 0 %.', '',
       T.round(3).to_markdown(index=False), '']
open(os.path.join(HERE, 'wyniki', 'r73_wyjscia.md'), 'w').write('\n'.join(out)); print('\n'.join(out))
