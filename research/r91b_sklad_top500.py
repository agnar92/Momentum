"""Etap 68 (dane): kapitalizacja = cena niekorygowana x liczba akcji (SEC) -> skład 'top 500 USA' co miesiąc -> /home/user/ndx/szer/sklady/ (format sp500_pit_source.csv)."""
import os, re, json, shutil, numpy as np, pandas as pd
OUT = '/home/user/ndx/szer'; os.makedirs(OUT + '/sklady', exist_ok=True)
C = pd.read_pickle('/home/user/eodhd-data/szeroki/C.pkl')
SH = json.load(open(f'{OUT}/akcje.json')); M = pd.read_csv(f'{OUT}/mapa.csv')
baza = lambda c: re.sub(r'#\d+$', '', c)
# pliki sec_q pod kodem bazowym (przy ponownym użyciu tickera: spółka notowana najpóźniej)
M['b'] = M.kod.map(baza); M = M.sort_values('do')
for b, g in M.groupby('b'):
    c = g.kod.iloc[-1]
    if c != b and os.path.exists(f'{OUT}/sec_q/{c}.json'): shutil.move(f'{OUT}/sec_q/{c}.json', f'{OUT}/sec_q/{b}.json')
for f in os.listdir(f'{OUT}/sec_q'):
    if '#' in f: os.remove(f'{OUT}/sec_q/{f}')
for nm in ('bilans.json', 'fcf.json', 'sic.json'):
    D = json.load(open(f'{OUT}/{nm}')); D2 = {}
    for b, g in M.groupby('b'):
        c = g.kod.iloc[-1]
        if c in D: D2[b] = D[c]
        elif b in D: D2[b] = D[b]          # ponowne uruchomienie: już pod kodem bazowym
    json.dump(D2, open(f'{OUT}/{nm}', 'w'))
CAP = pd.DataFrame(np.nan, index=C.index, columns=sorted(set(M.kod)))
ends = np.array([m.to_timestamp(how='end') for m in C.index])
for c in CAP.columns:
    rows = sorted((pd.Timestamp(f), pd.Timestamp(e), v) for e, v, f in SH.get(c, []) if v and v > 0)
    if not rows or c not in C.columns: continue
    fz = np.array([r[0].value for r in rows]); k = np.searchsorted(fz, np.array([t.value for t in ends]), side='right') - 1
    sh = np.array([rows[x][2] if x >= 0 and (ends[i] - rows[x][1]).days <= 400 else np.nan for i, x in enumerate(k)])
    CAP[c] = C[c].values * sh
CAP[(CAP > 6e12) | (CAP <= 0)] = np.nan
# kontrola: (a) obroty miesięczne >= 0,1 % kapitalizacji (inaczej cena innej spółki / zła liczba akcji), (b) bez emitentów zagranicznych 20-F (ADR: liczba akcji
# zwykłych x cena ADR) — w danych SEC ostatnie roczne sprawozdanie 20-F zamiast 10-K
DVm = pd.read_pickle('/home/user/eodhd-data/szeroki/DV.pkl').reindex(index=CAP.index, columns=CAP.columns)
CAP[~(DVm / CAP >= 0.001)] = np.nan
zagr = set()
for c in CAP.columns:
    p = f'{OUT}/sec_q/{baza(c)}.json'
    if not os.path.exists(p): CAP[c] = np.nan; continue
    d = json.load(open(p))
    if not d.get('rev'): CAP[c] = np.nan; continue          # bez przychodów us-gaap nie da się ocenić
    roczne = sorted({(r[3], r[4][:4]) for v in d.values() for r in v['rows'] if r[4][:4] in ('10-K', '20-F', '40-F')})
    if not roczne: continue
    fz = np.array([pd.Timestamp(f).value for f, _ in roczne]); typ = np.array([t for _, t in roczne])
    k = np.searchsorted(fz, np.array([t.value for t in ends]), side='right') - 1
    obce = np.array([x >= 0 and typ[x] in ('20-F', '40-F') for x in k])      # ostatnie roczne sprawozdanie przed końcem miesiąca
    if obce.any(): zagr.add(c); CAP.loc[obce, c] = np.nan
print('wykluczone 20-F / 40-F:', len(zagr), sorted(zagr)[:30], flush=True)
CAP.to_pickle(f'{OUT}/cap.pkl')
wiersze = []
for m in C.index:
    if m < pd.Period('2008-01', 'M'): continue
    s = CAP.loc[m].dropna().sort_values(ascending=False)
    top = s.index[:500]
    wiersze.append((m.to_timestamp(how='end').date().isoformat(), ','.join(sorted({baza(c) for c in top}))))
W_ = pd.DataFrame(wiersze, columns=['date', 'tickers']); W_ = W_[W_.tickers.str.len() > 0]
W_.to_csv(f'{OUT}/sklady/sp500_pit_source.csv', index=False)
shutil.copy('/home/user/eodhd-data/ndx_czlonkostwo.csv', f'{OUT}/sklady/ndx_czlonkostwo.csv')
n = CAP.loc['2010-01':].notna().sum(1); print('spółek z kapitalizacją: min', n.min(), 'mediana', n.median(), flush=True)
for y in (2010, 2015, 2020, 2025):
    s = CAP.loc[f'{y}-06'].dropna().sort_values(ascending=False); print(y, 'nr 500:', s.index[499] if len(s) > 499 else None, round(s.iloc[min(499, len(s) - 1)] / 1e9, 1), 'mld; top5', list(s.index[:5]))
