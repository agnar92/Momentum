"""Etap 26: trafność sposobów szacowania wzrostu EPS i rozkład rocznej zmiany ceny (protokół etap 26)."""
import os, json, numpy as np, pandas as pd, statsmodels.formula.api as smf
from scipy import stats
HERE = os.path.dirname(os.path.abspath(__file__))
exec(open(os.path.join(HERE, 'r39_peg.py')).read().split('\ncols = {s: j')[0])   # TT (EPS TTM), kwartaly, SECQ, C, SP, best_map
REV = {}
for fn in os.listdir(SECQ):
    d = json.load(open(os.path.join(SECQ, fn)))
    if d and 'rev' in d:
        q = kwartaly(d['rev']['rows'])
        if len(q) >= 8:
            g = pd.DataFrame([(pd.Timestamp(e), v, pd.Timestamp(f)) for e, (v, f) in q.items()], columns=['end', 'eps', 'filed']).sort_values('end')
            REV[fn[:-5].replace('.', '-')] = ttm_serie(g).set_index('end').ttm


def lag(T, e0, lat):
    c = T[(T.index <= e0 - pd.Timedelta(days=round(365.25 * lat) - 45)) & (T.index >= e0 - pd.Timedelta(days=round(365.25 * lat) + 45))]
    return c.iloc[-1] if len(c) else np.nan


rek = []
for k, T in TT.items():
    T = T.set_index('end').ttm
    if len(T) < 12: continue
    rv = REV.get(k)
    for e0, t0 in T.items():
        if e0 < pd.Timestamp('2012-01-01') or e0 > pd.Timestamp('2025-09-30') or t0 <= 0: continue
        fut = T[(T.index >= e0 + pd.Timedelta(days=320)) & (T.index <= e0 + pd.Timedelta(days=410))]
        if fut.empty: continue
        cel = fut.iloc[0] / t0 - 1
        L = np.array([t0] + [lag(T, e0, r) for r in range(1, 6)])
        yy = L[:-1] / L[1:] - 1; dod = (L > 0)
        r = dict(kod=k, e0=e0, q=e0.to_period('Q'), cel=cel)
        if dod[:4].all(): r['E1 średnia r/r 3 lata (arkusz)'] = yy[:3].mean(); r['E3 CAGR 3 lata'] = (t0 / L[3]) ** (1 / 3) - 1
        if dod.all() and np.isfinite(L).all():
            r['E2 średnia r/r 5 lat'] = yy.mean(); r['E4 CAGR 5 lat'] = (t0 / L[5]) ** (1 / 5) - 1; r['E5 mediana r/r 5 lat'] = np.median(yy)
        w = T[(T.index > e0 - pd.Timedelta(days=5 * 365 + 20)) & (T.index <= e0)]
        if len(w) >= 18 and (w > 0).all():
            x = (w.index - e0).days / 365.25; r['E6 regresja log, 5 lat'] = np.exp(np.polyfit(x, np.log(w.values), 1)[0]) - 1
        if L[1] > 0: r['E7 ostatnia zmiana r/r'] = yy[0]
        r['E8 zero (brak wzrostu)'] = 0.0
        if 'E3 CAGR 3 lata' in r: r['E9 CAGR 3 lata obcięty 0-30 %'] = float(np.clip(r['E3 CAGR 3 lata'], 0, 0.30))
        if rv is not None:
            a, b = lag(rv, e0, 0), lag(rv, e0, 3)
            if a > 0 and b > 0: r['E10 CAGR przychodów 3 lata'] = (a / b) ** (1 / 3) - 1
        rek.append(r)
R = pd.DataFrame(rek)
R = R[R.cel.abs() < 10]                                   # odrzucenie absurdów (zysk ~0)
EST = [c for c in R.columns if c.startswith('E')]
wsp = R.dropna(subset=['E1 średnia r/r 3 lata (arkusz)', 'E3 CAGR 3 lata'])   # wspólna próba E1/E3/E8/E9
rows = []
for c in EST:
    for nm, X in (('własna próba', R), ('wspólna próba (E1 dostępne)', wsp)):
        X = X.dropna(subset=[c])
        if len(X) < 200: continue
        ic = X.groupby('q').apply(lambda g: stats.spearmanr(g[c], g.cel)[0] if len(g) > 20 else np.nan).dropna()
        err = (X.cel - X[c]).abs()
        qr = smf.quantreg('cel ~ p', pd.DataFrame({'cel': X.cel.clip(-3, 3), 'p': X[c].clip(-3, 3)})).fit(q=0.5)
        rows.append(dict(metoda=c, proba=nm, n=len(X), IC_sr=ic.mean(), IC_t=ic.mean() / ic.std() * np.sqrt(len(ic)),
                         mediana_bledu_pp=100 * err.median(), blad_do_10pp=(err <= 0.10).mean(), trwalosc_nachylenie=qr.params['p'],
                         prognoza_mediana=X[c].median(), faktycznie_mediana=X.cel.median()))
W = pd.DataFrame(rows)
# (b) rozkład rocznej zmiany ceny
r12 = (C.shift(-12) / C - 1)
vals = []
for m, ss in SP.items():
    if pd.Period('1998-01', 'M') <= m <= pd.Period('2025-09', 'M') and m in r12.index:
        v = r12.loc[m, [s for s in ss if s in r12.columns]].dropna(); vals.append(v.values)
v = np.concatenate(vals)
P = pd.DataFrame({'percentyl': ['5 %', '25 %', '50 % (mediana)', '75 %', '95 %'], 'zmiana_12m': np.percentile(v, [5, 25, 50, 75, 95])})
ekstr = f'Obserwacji (spółka x miesiąc): {len(v)}. > +50 %: {(v > .5).mean()*100:.1f} %, > +100 %: {(v > 1).mean()*100:.1f} %, < -30 %: {(v < -.3).mean()*100:.1f} %, < -50 %: {(v < -.5).mean()*100:.1f} %.'
# zmiana ceny wg faktycznego wzrostu EPS (z wiedzą o przyszłości)
pr = []
for _, x in R[['kod', 'e0', 'cel']].iterrows():
    m = x.e0.to_period('M') + 1                            # ~ miesiąc po końcu kwartału
    s = best_map.get((m, x.kod))
    if s is not None and s in r12.columns and m in r12.index and np.isfinite(r12.at[m, s]): pr.append((x.cel, r12.at[m, s]))
PR = pd.DataFrame(pr, columns=['wzrost_eps', 'zmiana_ceny'])
PR['kwintyl_wzrostu_eps'] = pd.qcut(PR.wzrost_eps.rank(method='first'), 5, labels=['1 (najgorszy)', '2', '3', '4', '5 (najlepszy)'])
KW = PR.groupby('kwintyl_wzrostu_eps').agg(wzrost_eps_mediana=('wzrost_eps', 'median'), cena_mediana=('zmiana_ceny', 'median'),
                                           cena_p10=('zmiana_ceny', lambda x: x.quantile(.1)), cena_p90=('zmiana_ceny', lambda x: x.quantile(.9)))
out = ['# Etap 26: jak szacować wzrost EPS i ile akcja rośnie w rok', '',
       '## (a) Trafność prognoz wzrostu EPS TTM na następne 4 kwartały (spółki S&P z danymi SEC, 2012-2025)', '',
       'IC = średnia korelacja rang prognozy z faktyczną zmianą (0 = brak związku, 1 = idealnie). trwalosc_nachylenie = o ile rośnie '
       'mediana faktycznego wzrostu przy +1 pp prognozy (1 = prognoza "przenosi się" w całości, 0 = nic). Odrzucone przypadki z |zmianą| > 1000 %.', '',
       W.round(3).to_markdown(index=False), '',
       '## (b) Roczna zmiana ceny członków S&P 500 (1998-2025)', '', ekstr, '', P.round(3).to_markdown(index=False), '',
       '## Zmiana ceny w roku a FAKTYCZNY wzrost EPS w tym roku (wiedza o przyszłości, 2012-2025)', '', KW.round(3).to_markdown(), '']
open(os.path.join(HERE, 'wyniki', 'r44_wzrost.md'), 'w').write('\n'.join(out)); print('\n'.join(out))
