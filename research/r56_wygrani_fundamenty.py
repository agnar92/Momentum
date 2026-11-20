"""Etap 35: fundamenty 5 lat wcześniej a maksymalny zwrot w 5 lat (protokół etap 35)."""
import os, json, numpy as np, pandas as pd
from scipy import stats
HERE = os.path.dirname(os.path.abspath(__file__))
exec(open(os.path.join(HERE, 'r39_peg.py')).read().split('\ncols = {s: j')[0])   # TT (EPS TTM skorygowany, zn), kwartaly, ttm_serie, C, SP, best_map, etf, SECQ
cols = {s: j for j, s in enumerate(C.columns)}; im_ = {m: i for i, m in enumerate(C.index)}; Cv = C.to_numpy()
KOH = [pd.Period(f'{y}-03', 'M') for y in range(2011, 2022)]
# kapitalizacja point-in-time
A_ = pd.read_pickle('/home/user/eodhd-data/szeroki/A.pkl'); capm = np.load('/home/user/ndx/pit_cap2.npy'); acol = {c: j for j, c in enumerate(A_.columns)}; aidx = {m: i for i, m in enumerate(A_.index)}
BIL = json.load(open('/home/user/ndx/bilans.json'))


def ttm_df(rows):
    q = kwartaly(rows)
    if len(q) < 4: return None
    g = pd.DataFrame([(pd.Timestamp(e), v, pd.Timestamp(f)) for e, (v, f) in q.items()], columns=['end', 'eps', 'filed']).sort_values('end')
    t = ttm_serie(g)
    return t.set_index('end') if len(t) else None


def at(T, t, lat=0):
    """wartość TTM znana na t, przesunięta o lat lat wstecz od ostatniego znanego kwartału."""
    if T is None: return np.nan
    z = T[T.zn <= t]
    if z.empty or (t - z.index[-1]).days > 250: return np.nan
    if lat == 0: return z.ttm.iloc[-1]
    e0 = z.index[-1]; d = round(365.25 * lat)
    c = z[(z.index <= e0 - pd.Timedelta(days=d - 45)) & (z.index >= e0 - pd.Timedelta(days=d + 45))]
    return c.ttm.iloc[-1] if len(c) else np.nan


def cagr(a, b, n):
    return (a / b) ** (1 / n) - 1 if np.isfinite(a) and np.isfinite(b) and a > 0 and b > 0 else np.nan


def ostatni(rows, t):
    best = {}
    for e, v, f in rows:
        if pd.Timestamp(f) <= t and (e not in best or f < best[e][1]): best[e] = (v, f)
    if not best: return None, None
    e = max(best); return pd.Timestamp(e), best[e][0]


rek = []
for fn in sorted(os.listdir(SECQ)):
    k = fn[:-5].replace('.', '-')
    d = json.load(open(os.path.join(SECQ, fn)))
    if not d: continue
    Te = TT.get(k); Te = Te.set_index('end') if Te is not None and len(Te) else None
    Tr = ttm_df(d['rev']['rows']) if 'rev' in d else None
    To = ttm_df(d['opinc']['rows']) if 'opinc' in d else None
    b = BIL.get(k, {}); Tn = ttm_df([[s_, e_, v_, f_] for s_, e_, v_, f_ in b.get('ni', [])]) if b else None
    # kwartalne przychody r/r do estymaty użytkownika
    qr = kwartaly(d['rev']['rows']) if 'rev' in d else {}
    QR = pd.DataFrame([(pd.Timestamp(e), v, pd.Timestamp(f)) for e, (v, f) in qr.items()], columns=['end', 'rev', 'filed']).sort_values('end').reset_index(drop=True)
    yy, zz = [], []
    for i in range(len(QR)):
        j = [x for x in range(i) if 340 <= (QR.end[i] - QR.end[x]).days <= 390]
        if j and QR.rev[j[-1]] > 0: yy.append(QR.rev[i] / QR.rev[j[-1]] - 1); zz.append(max(QR.filed[i], QR.filed[j[-1]]))
        else: yy.append(np.nan); zz.append(QR.filed[i])
    QR['yy'] = yy; QR['zn'] = pd.to_datetime(pd.Series(zz, dtype='object')) if len(zz) else pd.Series([], dtype='datetime64[ns]')
    for m in KOH:
        s = best_map.get((m, k))
        if s is None or s not in cols or s not in SP.get(m, set()): continue
        i, j = im_[m], cols[s]; t = m.to_timestamp(how='end'); c0 = Cv[i, j]
        if not np.isfinite(c0): continue
        fut = Cv[i + 1:i + 61, j]
        if np.isfinite(fut).sum() < 55: continue
        r = dict(kod=k, kohorta=m.year, max5=np.nanmax(fut) / c0 - 1, ret5=fut[np.isfinite(fut)][-1] / c0 - 1)
        e = [at(Te, t, l) for l in range(6)]
        r['eps_g1'] = e[0] / e[1] - 1 if np.isfinite(e[1]) and e[1] > 0 else np.nan
        r['eps_cagr2'], r['eps_cagr3'], r['eps_cagr5'] = cagr(e[0], e[2], 2), cagr(e[0], e[3], 3), cagr(e[0], e[5], 5)
        g1prev = e[1] / e[2] - 1 if np.isfinite(e[2]) and e[2] > 0 else np.nan
        r['eps_przysp'] = r['eps_g1'] - g1prev
        r['eps_lat_wzrostu5'] = np.sum([e[x] > e[x + 1] for x in range(5)]) if np.isfinite(e).all() else np.nan
        rv = [at(Tr, t, l) for l in range(6)]
        r['rev_g1'] = rv[0] / rv[1] - 1 if np.isfinite(rv[1]) and rv[1] > 0 else np.nan
        r['rev_cagr2'], r['rev_cagr3'], r['rev_cagr5'] = cagr(rv[0], rv[2], 2), cagr(rv[0], rv[3], 3), cagr(rv[0], rv[5], 5)
        rprev = rv[1] / rv[2] - 1 if np.isfinite(rv[2]) and rv[2] > 0 else np.nan
        r['rev_przysp'] = r['rev_g1'] - rprev
        Z = QR[QR.zn <= t].tail(4) if len(QR) else QR
        if len(Z) == 4 and np.isfinite(Z.yy).all():
            r['rev_q_rr'] = Z.yy.iloc[-1]; r['rev_wazona'] = float(np.dot([0.1, 0.2, 0.3, 0.4], Z.yy.values))
        op = [at(To, t, l) for l in (0, 1, 3)]
        om = [op[x] / rv[l] if np.isfinite(op[x]) and np.isfinite(rv[l]) and rv[l] > 0 else np.nan for x, l in enumerate((0, 1, 3))]
        r['marza_op'], r['marza_zm1'], r['marza_zm3'] = om[0], om[0] - om[1], om[0] - om[2]
        cap = capm[aidx[m], acol[k]] if m in aidx and k in acol else np.nan
        ni = at(Tn, t, 0)
        if np.isfinite(cap) and cap > 0:
            r['log_kap'] = np.log(cap)
            if np.isfinite(ni): r['E_P'] = ni / cap; r['P_E'] = cap / ni if ni > 0 else np.nan
            if np.isfinite(rv[0]) and rv[0] > 0: r['S_P'] = rv[0] / cap
        if np.isfinite(e[0]) and e[0] > 0:
            pe = c0 / e[0]
            if np.isfinite(r['eps_cagr3']) and r['eps_cagr3'] > 0: r['PEG_3l'] = pe / (100 * r['eps_cagr3'])
            g = r.get('rev_wazona', np.nan)
            if np.isfinite(g) and g > -1: r['fwd_PE_uzytk'] = c0 / (e[0] * (1 + g))
            # mediana P/E z 36 mies. (EPS TTM znany na koniec każdego miesiąca)
            pes = []
            for back in range(36):
                mm = m - back; ii = im_.get(mm)
                if ii is None: continue
                ee = at(Te, mm.to_timestamp(how='end'), 0)
                if np.isfinite(ee) and ee > 0 and np.isfinite(Cv[ii, j]): pes.append(Cv[ii, j] / ee)
            if len(pes) >= 12 and np.isfinite(g): r['potencjal_PT_uzytk'] = np.median(pes) * e[0] * (1 + g) / c0 - 1
        if b and b.get('eq'):
            ee_, eq = ostatni(b['eq'], t)
            if eq and eq > 0 and (t - ee_).days < 250:
                if np.isfinite(ni): r['ROE'] = ni / eq
                tot, dt_ = 0.0, b['debt']
                parts = ['LongTermDebt'] if 'LongTermDebt' in dt_ else (['LongTermDebtAndCapitalLeaseObligations', 'LongTermDebtAndCapitalLeaseObligationsCurrent'] if 'LongTermDebtAndCapitalLeaseObligations' in dt_ else ['LongTermDebtNoncurrent', 'LongTermDebtCurrent' if 'LongTermDebtCurrent' in dt_ else 'DebtCurrent'])
                for p_ in parts + ['ShortTermBorrowings', 'CommercialPaper']:
                    if p_ in dt_:
                        e2, v2 = ostatni(dt_[p_], t)
                        if v2 is not None and abs((e2 - ee_).days) <= 100: tot += v2
                r['dlug_kapital'] = tot / eq
        r['zwrot_6m'] = c0 / Cv[i - 6, j] - 1 if np.isfinite(Cv[i - 6, j]) else np.nan
        r['zwrot_12m'] = c0 / Cv[i - 12, j] - 1 if np.isfinite(Cv[i - 12, j]) else np.nan
        rek.append(r)
R = pd.DataFrame(rek)
R['wygrany'] = R.groupby('kohorta').max5.transform(lambda x: x >= x.quantile(0.9))
R.to_parquet(os.path.join(os.path.dirname(DB), 'wygrani_cechy.parquet'))
CECHY = [c for c in R.columns if c not in ('kod', 'kohorta', 'max5', 'ret5', 'wygrany')]
print('obserwacji', len(R), 'kohort', R.kohorta.nunique(), flush=True)
rows = []
for c in CECHY:
    rho, rho5 = [], []
    for y, g in R.groupby('kohorta'):
        g = g[[c, 'max5', 'ret5']].dropna()
        if len(g) >= 40: rho.append((y, stats.spearmanr(g[c], g.max5)[0])); rho5.append(stats.spearmanr(g[c], g.ret5)[0])
    if len(rho) < 3: continue
    v = np.array([x for _, x in rho]); w = np.array(rho5)
    a = np.mean([x for y, x in rho if y <= 2015]) if any(y <= 2015 for y, _ in rho) else np.nan
    b_ = np.mean([x for y, x in rho if y >= 2016])
    X = R[[c, 'wygrany', 'kohorta']].dropna()
    X['q'] = X.groupby('kohorta')[c].transform(lambda s: pd.qcut(s.rank(method='first'), 5, labels=False) + 1)
    hit = X.groupby('q').wygrany.mean()
    rows.append(dict(cecha=c, n=len(X), kohort=len(v), rho_max5=v.mean(), t=v.mean() / v.std(ddof=1) * np.sqrt(len(v)), rho_2011_15=a, rho_2016_21=b_,
                     rho_zwrot5=w.mean(), wygrani_Q1=hit.get(1), wygrani_Q5=hit.get(5),
                     mediana_wygrani=X[X.wygrany][c].median(), mediana_reszta=X[~X.wygrany][c].median()))
W = pd.DataFrame(rows).sort_values('t', key=abs, ascending=False)
W['bonferroni'] = W.t.abs() > 3.3
out = ['# Etap 35: fundamenty 5 lat wcześniej a maksymalny zwrot w 5 lat (S&P 500 z danymi SEC, kohorty marzec 2011-2021)', '',
       f'Obserwacji (spółka x kohorta): {len(R)}; wielki wygrany = górne 10 % maks. zwrotu w kohorcie (próg mediana: {R[R.wygrany].groupby("kohorta").max5.min().median()*100:.0f} %).',
       'rho = średnia korelacja rang w kohortach (ujemna = niższa wartość cechy -> wyższy maks. zwrot); t z rozrzutu między kohortami; wygrani_Q1 / Q5 = odsetek',
       'wielkich wygranych w najniższym / najwyższym kwintylu cechy (średnio 10 %).', '', W.round(3).to_markdown(index=False), '']
open(os.path.join(HERE, 'wyniki', 'r56_wygrani_fundamenty.md'), 'w').write('\n'.join(out)); print('\n'.join(out))
