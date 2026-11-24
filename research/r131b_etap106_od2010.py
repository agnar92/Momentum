"""Etap 106: top 10 / 25 / 50 największych spółek USA, przegląd w styczniu, równe wagi vs wg kapitalizacji, vs SPY / RSP. Protokół: etap 106."""
import os, pickle, duckdb, numpy as np, pandas as pd
HERE = os.path.dirname(os.path.abspath(__file__))
CAP = pickle.load(open('/home/user/ndx/szer/cap.pkl', 'rb'))
SEKT = pickle.load(open('/home/user/ndx/szer/sektory.pkl', 'rb')) if os.path.exists('/home/user/ndx/szer/sektory.pkl') else {}
WYKL = {'Financial Services', 'Financials', 'Financial', 'Basic Materials', 'Materials', 'Energy', 'Utilities', 'Real Estate'}
OD, DO, KOSZT = pd.Period(os.environ.get('OD', '2012-01'), 'M'), pd.Period('2026-09', 'M'), 0.001
lata = list(range(OD.year, 2027))
kand = set()
for r in lata:
    c = CAP.loc[pd.Period(f'{r - 1}-12', 'M')].dropna().sort_values(ascending=False)
    kand |= set(c.index[:150])
e = duckdb.connect('/home/user/ndx/db/eodhd.duckdb', read_only=True)
lst = ",".join(f"'{k}.US'" for k in sorted(kand) + ['SPY', 'RSP'])
d = e.execute(f"SELECT ticker, date, adjusted_close c FROM prices_valid WHERE ticker IN ({lst}) AND date >= DATE '2000-11-01' ORDER BY ticker, date").df()
d['m'] = pd.to_datetime(d.date).dt.to_period('M')
P = d.groupby(['ticker', 'm']).c.last().unstack(0); P.columns = [c[:-3] for c in P.columns]
P = P.loc[OD - 1:DO]
spy, rsp = P.pop('SPY'), P.pop('RSP')
print('kandydatów', len(kand), 'z cenami', P.shape[1], flush=True)


def sektor(k):
    s = SEKT.get(k) if isinstance(SEKT, dict) else None
    return s


def portfel(N, wagi, bez_sekt=False):
    """miesięczna wartość portfela: skład i wagi ustalane w styczniu z kapitalizacji z grudnia, wagi dryfują w roku"""
    wart, war, sklad_pop = [1.0], [OD - 1], set()
    for r in lata:
        c = CAP.loc[pd.Period(f'{r - 1}-12', 'M')].dropna().sort_values(ascending=False)
        c = c[[k for k in c.index if k in P.columns and np.isfinite(P[k].get(pd.Period(f'{r - 1}-12', 'M'), np.nan))]]
        if bez_sekt:
            c = c[[k for k in c.index if sektor(k) not in WYKL]]
        top = c.iloc[:N]
        w = (top / top.sum()) if wagi == 'kap' else pd.Series(1 / N, index=top.index)
        obrot = 1.0 if not sklad_pop else len(set(top.index) - sklad_pop) / N
        v = wart[-1] * (1 - KOSZT * 2 * obrot)
        m0 = pd.Period(f'{r - 1}-12', 'M')
        poz = {k: v * w[k] / P.at[m0, k] for k in top.index}
        for mm in pd.period_range(f'{r}-01', f'{r}-12', freq='M'):
            if mm > DO: break
            tot = 0.0
            for k, q in poz.items():
                px = P[k].loc[:mm].dropna()
                tot += q * px.iloc[-1]                 # spółka zdjęta z giełdy: ostatnia cena (gotówka)
            wart.append(tot); war.append(mm)
        sklad_pop = set(top.index)
    return pd.Series(wart, index=war)


def stat(s):
    s = s.dropna(); lat = (s.index[-1] - s.index[0]).n / 12
    rr = s.resample('Y').last() if hasattr(s, 'resample') else None
    return (s.iloc[-1] / s.iloc[0]) ** (1 / lat) - 1, (s / s.cummax() - 1).min()


S = spy.loc[OD - 1:DO] / spy.loc[OD - 1]
R = rsp.loc[OD - 1:DO] / rsp.loc[OD - 1] if np.isfinite(rsp.get(OD - 1, np.nan)) else None   # RSP od 2003-05
def roczne(s):
    s = s.copy(); s.index = s.index.to_timestamp(how='end'); return s.resample('YE').last().pct_change().dropna()
rs = roczne(S)
PODZ = pd.Period(os.environ.get('PODZ', '2018-12'), 'M')
rows = []
for nm, s in [('SPY (S&P 500)', S)] + ([('RSP (S&P 500 równe wagi)', R)] if R is not None else []) + [(f'top {N}, {"wg kapitalizacji" if w == "kap" else "równe wagi"}{", bez wykl. sektorów" if b else ""}', portfel(N, w, b))
                                                                        for N in (10, 25, 50) for w in ('kap', 'rowne') for b in ((False, True) if SEKT else (False,))]:
    c, dd = stat(s); ra = roczne(s); lep = int((ra.values > rs.reindex(ra.index).values).sum())
    h1 = (s.loc[:PODZ].iloc[-1] / s.iloc[0]) ** (1 / ((PODZ - OD).n / 12 + 1 / 12)) - 1
    h2 = (s.iloc[-1] / s.loc[PODZ]) ** (1 / ((DO - PODZ).n / 12)) - 1
    rows.append({'portfel': nm, 'rocznie': f'{100 * c:.1f} %', '10 tys. →': f'{10000 * s.iloc[-1] / s.iloc[0]:,.0f}'.replace(',', ' '), 'najgł. obsunięcie': f'{100 * dd:.0f} %',
                 'lata lepsze od SPY': f'{lep}/{len(ra)}', 'pierwsza połowa': f'{100 * h1:.1f} %', 'druga połowa': f'{100 * h2:.1f} %'})
    print(rows[-1], flush=True)
T = pd.DataFrame(rows)
out = ['# Etap 106 (dodatek): top 10 / 25 / 50 od 2010 r. (połowy 2010–2017 / 2018–2026)', '', f'Od {OD}. Skład w styczniu z kapitalizacji z grudnia (PIT), 12 mies., ceny z dywidendami, koszt 0,1 % na stronę.', '',
       T.to_markdown(index=False), '']
open(os.path.join(HERE, 'wyniki', 'r131b_etap106_od2010.md'), 'w').write('\n'.join(out)); print('\n'.join(out))
