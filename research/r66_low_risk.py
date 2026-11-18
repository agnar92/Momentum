"""Etap 45: screener 'low risk, high reward' (zrzut użytkownika) z regułą sprzedaży 2 z 3 (z cache r59 + przychody TTM z SEC)."""
import os, json, datetime as dt, numpy as np, pandas as pd
HERE = os.path.dirname(os.path.abspath(__file__))
exec(open(os.path.join(HERE, 'r19_cem10.py')).read().split('warianty = {')[0])   # best_map, etf, blok
Z = np.load('/home/user/ndx/wskazniki_cache.npz', allow_pickle=True)
Cv, U, PE_, G1, ROE, DE, G5, FCF = (Z[k] for k in ('Cv', 'U', 'PE_', 'G1', 'ROE', 'DE', 'G5', 'FCF'))
ms = [pd.Period(x, 'M') for x in Z['mies']]; ser = list(Z['seria']); im_ = {m: i for i, m in enumerate(ms)}; cols = {s: j for j, s in enumerate(ser)}
NT, NS = Cv.shape
dd = lambda s: dt.date.fromisoformat(s)
r25 = open(os.path.join(HERE, 'r25_cem10_eps.py')).read(); exec(r25[r25.index('def kwartaly'):r25.index('\n\n\ncechy = {}')])
r39 = open(os.path.join(HERE, 'r39_peg.py')).read(); exec(r39[r39.index('def ttm_serie'):r39.index('\n\n\nTT = {k:')])
# przychody TTM: zmiana r/r i łączna 5 lat, znane na koniec miesiąca
RV1 = np.full((NT, NS), np.nan); RV5 = np.full((NT, NS), np.nan)
M0 = [m for m in ms if pd.Period('2014-06', 'M') <= m <= pd.Period('2026-09', 'M')]
for fn in os.listdir('/home/user/ndx/sec_q'):
    d = json.load(open(os.path.join('/home/user/ndx/sec_q', fn)))
    if not d or 'rev' not in d: continue
    q = kwartaly(d['rev']['rows'])
    if len(q) < 8: continue
    g = pd.DataFrame([(pd.Timestamp(e), v, pd.Timestamp(f)) for e, (v, f) in q.items()], columns=['end', 'eps', 'filed']).sort_values('end')
    T = ttm_serie(g)
    if T.empty: continue
    T = T.set_index('end'); k = fn[:-5].replace('.', '-')
    for m in M0:
        s_ = best_map.get((m, k))
        if s_ not in cols: continue
        t = m.to_timestamp(how='end'); z = T[T.zn <= t]
        if z.empty or (t - z.index[-1]).days > 250: continue
        e0, a = z.index[-1], z.ttm.iloc[-1]
        for lat, X in ((1, RV1), (5, RV5)):
            c = z[(z.index <= e0 - pd.Timedelta(days=round(365.25 * lat) - 45)) & (z.index >= e0 - pd.Timedelta(days=round(365.25 * lat) + 45))]
            if len(c) and c.ttm.iloc[-1] > 0 and a > 0: X[im_[m], cols[s_]] = a / c.ttm.iloc[-1] - 1
print('przychody', np.isfinite(RV1).sum(), np.isfinite(RV5).sum(), flush=True)
# sektory
g = pd.read_csv('/home/user/eodhd-data/gics.csv'); gics = dict(zip(g.Symbol.str.replace('.', '-'), g['GICS Sector']))
sic = json.load(open('/home/user/ndx/sic.json'))
WYKL = {'Financials', 'Materials', 'Energy', 'Utilities', 'Real Estate'}
def wykluczony(k):
    if k in gics: return gics[k] in WYKL
    s = sic.get(k)
    if not s: return False
    s = int(s)
    return (6000 <= s <= 6799 or 1000 <= s <= 1499 or 2900 <= s <= 2999 or 4900 <= s <= 4949 or 4960 <= s <= 4999 or 2600 <= s <= 2699
            or 2800 <= s <= 2829 or 2840 <= s <= 2899 or 3300 <= s <= 3399 or 2400 <= s <= 2499 or 3200 <= s <= 3299)
SEKT = np.array([not wykluczony(s.split('.US')[0].split('~')[0]) for s in ser])
print('spółek po wykluczeniu sektorów', SEKT.sum(), 'z', NS, flush=True)
f = lambda X: np.nan_to_num(X, nan=0).astype(bool)
PEG = np.where((PE_ > 0) & (G5 > 0), PE_ / (100 * G5), np.inf)
KUP = f(RV5 > 0.5) & f(RV1 > 0.05) & f(G1 > 0.05) & f(ROE > 0.15) & f(DE >= 0) & f(DE < 1) & f(FCF > 0) & (PEG > 0) & (PEG < 1) & np.isfinite(PE_)
ZLE = [PEG > 3, f(RV5 < 0.5), f(DE > 1)]
SPRZ = {'S2: 2 z 3 (PEG > 3, przychody 5 l. < 50 %, dług > 1)': (ZLE[0].astype(int) + ZLE[1] + ZLE[2]) >= 2,
        'Sb: PEG > 3 i przychody 5 l. < 50 %': ZLE[0] & ZLE[1], 'S1: którykolwiek z 3': ZLE[0] | ZLE[1] | ZLE[2], 'S0: nigdy': np.zeros((NT, NS), bool)}
KOSZT = 0.001; OD = pd.Period('2015-03', 'M'); DO = pd.Period('2026-09', 'M'); POL2 = pd.Period('2020-12', 'M')
mies2 = [m for m in ms if OD <= m <= DO]


def strat(KUPm, S, kontrola, N=10):
    poz, got, eq, czasy, ile = {}, 1.0, [], [], []
    for a, m in enumerate(mies2[:-1]):
        i = im_[m]; i1 = im_[mies2[a + 1]]
        if m.month in kontrola:
            for j in list(poz):
                if S[i, j]: p = poz.pop(j); got += p['v'] * (1 - KOSZT); czasy.append((m - p['od']).n)
            ok = np.flatnonzero(U[i] & KUPm[i] & np.isfinite(Cv[i])); ile.append(len(ok)); ok = ok[np.argsort(PEG[i, ok])]
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
        eq.append((mies2[a + 1], got + sum(p['v'] for p in poz.values()), sum(p['v'] for p in poz.values())))
    czasy += [(mies2[-1] - p['od']).n for p in poz.values()]
    return pd.Series({m: v for m, v, _ in eq}), np.mean([x / v for _, v, x in eq]), (np.median(czasy) / 12 if czasy else np.nan), ile, len(czasy)


def cg2(e, od=None, do=None):
    e = pd.concat([pd.Series({OD: 1.0}), e])
    if od: e = e[e.index >= od]
    if do: e = e[e.index <= do]
    return (e.iloc[-1] / e.iloc[0]) ** (12 / (len(e) - 1)) - 1


def miary(e):
    r_ = e.pct_change().dropna(); dd_ = (e / e.cummax() - 1).min(); c = cg2(e)
    return dict(CAGR=c, CAGR_2015_20=cg2(e, None, POL2), CAGR_2021_26=cg2(e, POL2), maxDD=dd_, Sharpe=r_.mean() / r_.std() * np.sqrt(12) if r_.std() > 0 else np.nan,
                Calmar=c / abs(dd_) if dd_ < 0 else np.nan, z_10k=round(10000 * e.iloc[-1]))


rows = []
MIES = set(range(1, 13)); KW = {2, 5, 8, 11}
for nm, S in SPRZ.items():
    for sekt in (True, False):
        for N, kontr, kn in ((10, MIES, 'co miesiąc'), (20, MIES, 'co miesiąc'), (10, KW, 'co kwartał')):
            if not sekt and (N != 10 or kontr is KW): continue
            e, inw, czas, ile, ns = strat(KUP & SEKT[None, :] if sekt else KUP, S, kontr, N)
            rows.append(dict(sprzedaz=nm, bez_sektorow=sekt, N=N, kontrola=kn, kandydatow=f'{min(ile)}-{int(np.median(ile))}-{max(ile)}', **miary(e), sr_zainwestowane=inw,
                             mediana_lat_trzymania=czas, transakcji_zamkn=ns))
    print(nm, flush=True)
T = pd.DataFrame(rows)
ewL_v, eq = 1.0, []
for a, m in enumerate(mies2[:-1]):
    i, i1 = im_[m], im_[mies2[a + 1]]; ok = U[i] & np.isfinite(Cv[i]) & np.isfinite(Cv[i1]) & np.isfinite(PE_).any(axis=0)
    ewL_v *= 1 + np.mean(Cv[i1, ok] / Cv[i, ok] - 1); eq.append((mies2[a + 1], ewL_v))
ew = pd.Series(dict(eq)); sp_ = etf['SPY'][(etf['SPY'].index >= OD) & (etf['SPY'].index <= DO)]; spy = (sp_ / sp_.iloc[0])[1:]
ref = pd.DataFrame([dict(odniesienie=n, **miary(x)) for n, x in (('równe wagi uniwersum', ew), ('SPY', spy))])
i = im_[pd.Period('2026-08', 'M')]; ok = np.flatnonzero(U[i] & KUP[i] & SEKT); ok = ok[np.argsort(PEG[i, ok])]
ost = pd.DataFrame({'seria': [ser[j] for j in ok], 'PEG_5Y': PEG[i, ok], 'P/E': PE_[i, ok], 'EPS_CAGR5_%': 100 * G5[i, ok], 'przychody_5l_%': 100 * RV5[i, ok],
                    'przychody_1r_%': 100 * RV1[i, ok], 'EPS_1r_%': 100 * G1[i, ok], 'ROE_%': 100 * ROE[i, ok], 'dlug_kapital': DE[i, ok], 'FCF_mld': FCF[i, ok] / 1e9})
out = ['# Etap 45: screener "low risk, high reward" + sprzedaż 2 z 3 (S&P 500 z danymi SEC, 2015-03 ... 2026-09)', '',
       'kandydatow = min-mediana-max liczby spółek przechodzących screener w dniu kontroli.', '', '## Odniesienia', '', ref.round(3).to_markdown(index=False), '',
       '## Warianty', '', T.round(3).to_markdown(index=False), '', '## Spółki przechodzące screener na koniec sierpnia 2026', '', ost.round(2).to_markdown(index=False), '']
open(os.path.join(HERE, 'wyniki', 'r66_low_risk.md'), 'w').write('\n'.join(out)); print('\n'.join(out))
