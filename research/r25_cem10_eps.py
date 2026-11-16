"""Etap 15: CEM10 + filtr przyspieszenia EPS (warianty i kryteria w protokole). Uniwersum: członkowie S&P 500 z danymi SEC.
Okres 2011-01 ... 2026-09. EPS z /home/user/ndx/sec_q (ta sama logika kwartałów co fund_build.py), znany od daty złożenia.
"""
import os, sys, json, datetime as dt, warnings, numpy as np, pandas as pd
warnings.filterwarnings('ignore')
HERE = os.path.dirname(os.path.abspath(__file__))
_src = open(os.path.join(HERE, 'r20_cem10_warianty.py')).read().split("mies = [m for m in C.index")[0]
exec(_src)                     # składy, C, S10, SP, spy_bear, sim, R3, R6m, blok, miary (z r19/r20)
SECQ = os.environ.get('SEC_Q', '/home/user/ndx/sec_q')
dd = lambda s: dt.date.fromisoformat(s)


def kwartaly(rows):
    """[start, end, val, filed, form, ...] -> {end: (eps, filed)}; Q4 = rok - Q1..Q3 (jak fund_build.py)."""
    bq, bf = {}, {}
    for r in rows:
        s, e, v, f = r[:4]; ti = r[5] if len(r) > 5 else 0; n = (dd(e) - dd(s)).days
        if 80 <= n <= 100:
            if e not in bq or (ti, f) < bq[e][0]: bq[e] = ((ti, f), (s, v, f))
        elif 350 <= n <= 380:
            if e not in bf or (ti, f) < bf[e][0]: bf[e] = ((ti, f), (s, v, f))
    q = {e: v for e, (k, v) in bq.items()}; out = {e: (v, f) for e, (s, v, f) in q.items()}
    for e, (k, (s, v, f)) in bf.items():
        parts = [vv for ee, (ss, vv, ff) in q.items() if dd(ss) >= dd(s) - dt.timedelta(days=6) and dd(ee) < dd(e) - dt.timedelta(days=60)]
        if len(parts) == 3 and e not in out: out[e] = (v - sum(parts), f)
    return out


cechy = {}   # (kod, miesiąc) -> (g0, g1, g2)
mies_all = pd.period_range('2010-01', '2026-10', freq='M')
for fn in os.listdir(SECQ):
    d = json.load(open(os.path.join(SECQ, fn)))
    if not d or 'eps' not in d: continue
    kod = fn[:-5].replace('.', '-')
    q = kwartaly(d['eps']['rows'])
    if len(q) < 6: continue
    Q = pd.DataFrame([(pd.Timestamp(e), v, pd.Timestamp(f)) for e, (v, f) in q.items()], columns=['end', 'eps', 'filed']).sort_values('end').reset_index(drop=True)
    g, gf = [], []
    for i in range(len(Q)):
        j = [k for k in range(i) if 340 <= (Q.end[i] - Q.end[k]).days <= 390]
        if j and Q.eps[j[-1]] > 0: g.append(Q.eps[i] / Q.eps[j[-1]] - 1)
        else: g.append(np.nan)
        gf.append(max(Q.filed[i], Q.filed[j[-1]]) if j else Q.filed[i])
    Q['g'] = g; Q['gf'] = gf
    for m in mies_all:
        kon = m.to_timestamp(how='end')
        Z = Q[Q.gf <= kon]
        if len(Z) < 3: continue
        z = Z.tail(3)
        # trzy kolejne kwartały (odstępy 75-110 dni)
        if not all(75 <= (z.end.iloc[k + 1] - z.end.iloc[k]).days <= 110 for k in range(2)): continue
        cechy[(kod, m)] = (z.g.iloc[2], z.g.iloc[1], z.g.iloc[0])
print('cechy EPS', len(cechy), flush=True)
kod_ser = p.drop_duplicates(['m', 'seria']).set_index(['m', 'seria']).kod0.to_dict()
ma_dane = {fn[:-5].replace('.', '-') for fn in os.listdir(SECQ)}


def eps(t, s):
    return cechy.get((kod_ser.get((t, s)), t))


SPd = {m: {s for s in ss if kod_ser.get((m, s)) in ma_dane} for m, ss in SP.items()}
spf = lambda m: SPd.get(m)
bear_m = lambda m: bool(spy_bear.get(m, False))
base_ok = lambda t, s: C.at[t, s] > S10.at[t, s] and R6m.at[t, s] > 0.30
sma_exit = lambda t, s, p: C.at[t, s] < S10.at[t, s]


def ok_eps(war):
    def f(t, s):
        if not base_ok(t, s): return False
        e = eps(t, s)
        if e is None or not np.isfinite(e[0]): return False
        g0, g1, g2 = e
        if war == 'E1': return g0 > 0 and np.isfinite(g1) and g0 > g1
        if war == 'E2': return g0 > 0 and np.isfinite(g1) and np.isfinite(g2) and g0 > g1 > g2
        if war == 'E3': return g0 >= 0.25
    return f


mies = [m for m in C.index if pd.Period('2011-01', 'M') <= m <= pd.Period('2026-09', 'M')]
WAR = {'E0 baza (uniwersum z danymi SEC)': base_ok, 'E1 EPS przyspiesza (1 kw.)': ok_eps('E1'),
       'E2 EPS przyspiesza (2 kw.)': ok_eps('E2'), 'E3 EPS r/r >= 25 %': ok_eps('E3')}
K, TRS = {}, {}
for nm, ok_ in WAR.items():
    e, T = sim(mies, spf, ok_, lambda t, s: R6m.at[t, s], sma_exit, bear_m, C); K[nm] = e; TRS[nm] = T; print(nm, flush=True)
# pełny CEM10 (wszyscy członkowie) dla odniesienia
e_full, _ = sim(mies, lambda m: SP.get(m), base_ok, lambda t, s: R6m.at[t, s], sma_exit, bear_m, C)
rows = []
m0 = K['E0 baza (uniwersum z danymi SEC)'].pct_change().dropna()
for nm, e in list(K.items()) + [('CEM10 pełny skład (odniesienie)', e_full)]:
    r = e.pct_change().dropna(); h1 = r[r.index <= pd.Period('2018-12', 'M')]; h2 = r[r.index >= pd.Period('2019-01', 'M')]
    d = (r - m0.reindex(r.index)).dropna(); lo, hi = blok(d) if d.abs().sum() > 0 else (0, 0)
    T = TRS.get(nm)
    rows.append(dict(wariant=nm, CAGR=miary(e)['CAGR'], CAGR_11_18=(1 + h1).prod() ** (12 / len(h1)) - 1, CAGR_19_26=(1 + h2).prod() ** (12 / len(h2)) - 1,
                     maxDD=miary(e)['maxDD'], transakcji=len(T) if T is not None else np.nan, trafione=(T.zwrot > 0).mean() if T is not None else np.nan,
                     sr_pozycji=np.nan, roznica_vs_E0_mies=d.mean(), ci95=f'{lo*100:.2f}…{hi*100:.2f} %'))
R = pd.DataFrame(rows).drop(columns=['sr_pozycji'])
spy_ = etf['SPY'][(etf['SPY'].index >= pd.Period('2011-01', 'M')) & (etf['SPY'].index <= pd.Period('2026-09', 'M'))]
b0 = R.iloc[0]
R['lepszy'] = [i in (1, 2, 3) and r.CAGR_11_18 > b0.CAGR_11_18 and r.CAGR_19_26 > b0.CAGR_19_26 and float(r.ci95.split('…')[0]) > 0 for i, r in R.iterrows()]
out = ['# Etap 15: CEM10 + filtr przyspieszenia EPS (S&P 500 z danymi SEC, 2011-2026)', '',
       'Warianty i kryteria zapisane w protokole przed uruchomieniem. Wszystkie E0-E3 na tym samym uniwersum (członkowie S&P 500 z danymi SEC).', '',
       R.round(4).to_markdown(index=False), '', f'SPY 2011-2026: CAGR {miary(spy_)["CAGR"]:.4f}.', '']
open(os.path.join(HERE, 'wyniki', 'r25_cem10_eps.md'), 'w').write('\n'.join(out))
print('\n'.join(out))
