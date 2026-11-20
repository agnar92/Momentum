"""Etap 50: częstość pobicia rynku przez zestawy filtrów użytkownika."""
import os, json, datetime as dt, numpy as np, pandas as pd
HERE = os.path.dirname(os.path.abspath(__file__))
exec(open(os.path.join(HERE, 'r19_cem10.py')).read().split('warianty = {')[0])   # best_map, etf
dd = lambda s: dt.date.fromisoformat(s)
r25 = open(os.path.join(HERE, 'r25_cem10_eps.py')).read(); exec(r25[r25.index('def kwartaly'):r25.index('\n\n\ncechy = {}')])
r39 = open(os.path.join(HERE, 'r39_peg.py')).read(); exec(r39[r39.index('def ttm_serie'):r39.index('\n\n\nTT = {k:')])
D = pd.read_parquet('/home/user/ndx/panel_finviz.parquet'); D['mp'] = pd.PeriodIndex(D.m, freq='M')
# przychody rosną co roku >= 8 % przez 5 lat (wg TTM znanych na t)
ROK = {}
starts = sorted(D.mp.unique())
for fn in os.listdir('/home/user/ndx/sec_q'):
    d = json.load(open(os.path.join('/home/user/ndx/sec_q', fn)))
    if not d or 'rev' not in d: continue
    q = kwartaly(d['rev']['rows'])
    if len(q) < 24: continue
    g = pd.DataFrame([(pd.Timestamp(e), v, pd.Timestamp(f)) for e, (v, f) in q.items()], columns=['end', 'eps', 'filed']).sort_values('end')
    T = ttm_serie(g)
    if T.empty: continue
    T = T.set_index('end').sort_values('zn'); k = fn[:-5].replace('.', '-')
    for m in starts:
        s_ = best_map.get((m, k))
        if s_ is None: continue
        t = m.to_timestamp(how='end'); z = T[T.zn <= t]
        if z.empty or (t - z.index.max()).days > 250: continue
        e0 = z.index.max(); L = []
        for r in range(6):
            c = z[(z.index <= e0 - pd.Timedelta(days=round(365.25 * r) - 45)) & (z.index >= e0 - pd.Timedelta(days=round(365.25 * r) + 45))]
            L.append(c.ttm.iloc[-1] if len(c) else np.nan)
        L = np.array(L)
        if np.isfinite(L).all() and (L > 0).all(): ROK[(str(m), s_)] = bool((L[:-1] / L[1:] >= 1.08).all())
D['R'] = [ROK.get((m, s), False) for m, s in zip(D.m, D.seria)]
print('spółek z przychodami +8 % co rok (średnio w miesiącu)', D.groupby('mp').R.sum().mean().round(1), flush=True)
D = D.sort_values(['seria', 'mp'])
D['ROE_12'] = D.groupby('seria').ROE.shift(12).where(D.groupby('seria').mp.shift(12) == D.mp - 12)
f = lambda s: s.fillna(False)
PEGr = np.where((D['P/E'] > 0) & (D['przychody 5 lat (CAGR)'] > 0), D['P/E'] / (100 * D['przychody 5 lat (CAGR)']), np.nan)
Dd, Ff, O = f((D['dług / kapitał'] >= 0) & (D['dług / kapitał'] < 1)), f(D['FCF yield'] > 0), f(D.ROE > 0.15)
S = f(D.ROE >= D.ROE_12 - 0.01); R_ = D.R
P2, P1 = pd.Series(PEGr < 2, index=D.index), pd.Series(PEGr < 1, index=D.index)
PE2 = f((D['PEG (EPS 5 lat)'] > 0) & (D['PEG (EPS 5 lat)'] < 2))
ZES = {'S0 wszystkie spółki': pd.Series(True, index=D.index), 'S1 przychody +8 % co rok (5 lat)': R_, 'S2 S1 + dług < 1 + FCF > 0': R_ & Dd & Ff,
       'S3 S2 + ROE > 15 %': R_ & Dd & Ff & O, 'S4 S3 + ROE nie spada r/r': R_ & Dd & Ff & O & S, 'S5 S4 + PEG z przychodów < 2': R_ & Dd & Ff & O & S & P2,
       'S6 S4 + PEG z przychodów < 1': R_ & Dd & Ff & O & S & P1, 'S7 S4 + PEG z EPS 5 lat < 2': R_ & Dd & Ff & O & S & PE2,
       'S8 S2 + PEG z przychodów < 2 (bez ROE)': R_ & Dd & Ff & P2}
spy = etf['SPY']
def spyr(m, h):
    a, b = spy.get(m), spy.get(m + h); return b / a - 1 if a and b else np.nan
D['spy12'] = [spyr(m, 12) for m in D.mp]; D['spy60'] = [spyr(m, 60) for m in D.mp]
D['ew12'] = D.f12 - D.e12; D['ew60'] = D.f60 - D.e60
rows = []
for nm, mk in ZES.items():
    X = D[mk]
    g = X.groupby('mp').agg(n=('f12', 'size'), r12=('f12', 'mean'), r60=('f60', 'mean'), ew12=('ew12', 'first'), ew60=('ew60', 'first'), spy12=('spy12', 'first'), spy60=('spy60', 'first'))
    g12 = g.dropna(subset=['r12', 'spy12']); g60 = g.dropna(subset=['r60', 'spy60'])
    sp60 = X.dropna(subset=['f60', 'spy60'])
    # lata kalendarzowe: start w styczniu, rok trzymania
    sty = g12[[m.month == 1 for m in g12.index]]
    rows.append(dict(zestaw=nm, sr_spolek=float(g.n.mean()), miesiecy_z_spolkami=int((g.n > 0).sum()),
                     pobicie_rownych_12m=float((g12.r12 > g12.ew12).mean()), pobicie_SPY_12m=float((g12.r12 > g12.spy12).mean()), przewaga_SPY_12m=float((g12.r12 - g12.spy12).mean()),
                     pobicie_rownych_60m=float((g60.r60 > g60.ew60).mean()), pobicie_SPY_60m=float((g60.r60 > g60.spy60).mean()), przewaga_SPY_60m=float((g60.r60 - g60.spy60).mean()),
                     spolka_bije_SPY_60m=float((sp60.f60 > sp60.spy60).mean()), lata_pobite_SPY=f'{int((sty.r12 > sty.spy12).sum())} z {len(sty)}'))
    print(nm, flush=True)
T = pd.DataFrame(rows)
lata = {}
for nm in ('S0 wszystkie spółki', 'S2 S1 + dług < 1 + FCF > 0', 'S4 S3 + ROE nie spada r/r', 'S5 S4 + PEG z przychodów < 2'):
    X = D[ZES[nm]]; g = X.groupby('mp').agg(r12=('f12', 'mean'), spy12=('spy12', 'first'), n=('f12', 'size'))
    lata[nm] = {str(m.year): (round(float(r.r12 - r.spy12), 3), int(r.n)) for m, r in g.iterrows() if m.month == 1 and np.isfinite(r.r12) and np.isfinite(r.spy12)}
json.dump(dict(zestawy=T.round(4).to_dict('records'), lata=lata), open(os.path.join(HERE, 'wyniki', 'r72_pobicie.json'), 'w'), ensure_ascii=False, indent=1)
L = pd.DataFrame({k: {y: f'{v[0]*100:+.0f} pp ({v[1]})' for y, v in d.items()} for k, d in lata.items()})
out = ['# Etap 50: jak często zestawy filtrów pobijają rynek (S&P 500 z danymi SEC, starty 2012-2025)', '',
       'pobicie_* = odsetek miesięcy startu, w których portfel równych wag zestawu pobił odniesienie; przewaga_SPY = średnia różnica zwrotu; spolka_bije_SPY_60m = odsetek pojedynczych spółek zestawu, które pobiły SPY w 5 lat; lata_pobite_SPY = start w styczniu, rok trzymania.', '',
       T.round(3).to_markdown(index=False), '', '## Rok po roku: przewaga nad SPY portfela ze stycznia (w nawiasie liczba spółek)', '', L.to_markdown(), '']
open(os.path.join(HERE, 'wyniki', 'r72_pobicie.md'), 'w').write('\n'.join(out)); print('\n'.join(out))
