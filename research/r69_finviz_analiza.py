"""Etap 47: analiza panelu parametrów Finviz -> wyniki/r69_finviz.json (dla strony-raportu) + r69_finviz.md."""
import os, json, warnings, numpy as np, pandas as pd, statsmodels.api as sm, lightgbm as lgb
from scipy import stats
warnings.filterwarnings('ignore')
HERE = os.path.dirname(os.path.abspath(__file__))
D = pd.read_parquet('/home/user/ndx/panel_finviz.parquet'); D['mp'] = pd.PeriodIndex(D.m, freq='M')
H = (1, 3, 6, 12, 24, 36, 60)
F = [c for c in D.columns if c not in ('m', 'mp', 'seria', 'max60') and not (c[0] in 'fe' and c[1:].isdigit())]
rng = np.random.default_rng(20261118)
nw = lambda v, lag: sm.OLS(np.asarray(v), np.ones(len(v))).fit(cov_type='HAC', cov_kwds={'maxlags': max(lag, 1)})
OUT = {'parametry': F, 'horyzonty': list(H)}
# (1) korelacje rang i kwintyle
ic_rows, kw_rows = [], []
G = {m: g for m, g in D.groupby('mp')}
for c in F:
    r = {'parametr': c, 'pokrycie': float(D[c].notna().mean())}
    for h in H:
        v = []
        for m, g in G.items():
            x = g[[c, f'e{h}']].dropna()
            if len(x) >= 50: v.append(stats.spearmanr(x[c], x[f'e{h}'])[0])
        if len(v) > 12:
            f = nw(v, h); r[f'IC_{h}'] = float(np.mean(v)); r[f't_{h}'] = float(f.tvalues[0])
    # kwintyle dla 12 i 60 mies.
    for h in (12, 60):
        q = []
        for m, g in G.items():
            x = g[[c, f'e{h}']].dropna()
            if len(x) < 50: continue
            k = pd.qcut(x[c].rank(method='first'), 5, labels=False)
            q.append(x.groupby(k)[f'e{h}'].mean().values)
        if q:
            Q = np.nanmean(np.vstack(q), axis=0); r[f'kwintyle_{h}'] = [float(a) for a in Q]
            r[f'spread_{h}'] = float(Q[4] - Q[0]); r[f'monotonia_{h}'] = float(stats.spearmanr(range(5), Q)[0])
    ic_rows.append(r); print(c, round(r.get('IC_60', np.nan), 3), flush=True)
IC = pd.DataFrame(ic_rows); OUT['jednowymiarowo'] = ic_rows
# (2) progi Finviz dla składników strategii (nadwyżka 5 lat, starty co miesiąc do 2021-09)
P5 = D[D.mp <= pd.Period('2021-09', 'M')]
def efekt(maska, h=60, baza=None):
    v = []
    for m, g in P5.groupby('mp'):
        mk = maska.loc[g.index]; b = g[f'e{h}'].notna() if baza is None else baza.loc[g.index]
        a1, a0 = g.loc[mk & b, f'e{h}'], g.loc[~mk & b, f'e{h}']
        if len(a1) >= 3 and len(a0) >= 3: v.append((a1.mean() - a0.mean(), a1.mean(), int(mk.sum())))
    if len(v) < 12: return None
    d = np.array([x[0] for x in v]); f = nw(d, 60)
    return dict(roznica=float(d.mean()), t=float(f.tvalues[0]), nadwyzka_przechodzacych=float(np.mean([x[1] for x in v])), sr_spolek=float(np.mean([x[2] for x in v])))
PROGI = {'PEG (EPS 5 lat)': [('< 1', lambda s: (s > 0) & (s < 1)), ('< 2', lambda s: (s > 0) & (s < 2)), ('< 3', lambda s: (s > 0) & (s < 3))],
         'PEG (estymata)': [('< 1', lambda s: (s > 0) & (s < 1)), ('< 2', lambda s: (s > 0) & (s < 2))],
         'przychody 5 lat (CAGR)': [('> 10 %', lambda s: s > 0.10), ('> 20 %', lambda s: s > 0.20), ('> 30 %', lambda s: s > 0.30)],
         'ROE': [('> 10 %', lambda s: s > 0.10), ('> 15 %', lambda s: s > 0.15), ('> 20 %', lambda s: s > 0.20)],
         'dług / kapitał': [('< 0,5', lambda s: (s >= 0) & (s < 0.5)), ('< 1', lambda s: (s >= 0) & (s < 1))],
         'P/E': [('< 15', lambda s: s < 15), ('< 25', lambda s: s < 25)], 'marża operacyjna': [('> 15 %', lambda s: s > 0.15), ('> 25 %', lambda s: s > 0.25)],
         'EPS 5 lat (CAGR)': [('> 10 %', lambda s: s > 0.10), ('> 20 %', lambda s: s > 0.20)]}
pr = []
for c, lst in PROGI.items():
    for nm, fn in lst:
        e = efekt(fn(P5[c]).fillna(False))
        if e: pr.append(dict(parametr=c, prog=nm, **e))
OUT['progi'] = pr
# (3) pary składników strategii
SK = {'PEG < 2': ((P5['PEG (EPS 5 lat)'] > 0) & (P5['PEG (EPS 5 lat)'] < 2)), 'przychody 5 lat > 30 %': P5['przychody 5 lat (CAGR)'] > 0.30,
      'ROE > 15 %': P5['ROE'] > 0.15, 'dług / kapitał < 0,5': (P5['dług / kapitał'] >= 0) & (P5['dług / kapitał'] < 0.5)}
SK = {k: v.fillna(False) for k, v in SK.items()}
pojed = {k: efekt(v) for k, v in SK.items()}
pary = []
import itertools
for a, b in itertools.combinations(SK, 2):
    e = efekt(SK[a] & SK[b])
    if e: pary.append(dict(para=f'{a} + {b}', **e, interakcja=e['roznica'] - (pojed[a]['roznica'] + pojed[b]['roznica'])))
wsz = efekt(SK['PEG < 2'] & SK['przychody 5 lat > 30 %'] & SK['ROE > 15 %'] & SK['dług / kapitał < 0,5'])
bez = {}
for k in SK:
    rest = [v for kk, v in SK.items() if kk != k]; bez[k] = efekt(rest[0] & rest[1] & rest[2])
OUT['skladniki'] = dict(pojedyncze=pojed, pary=pary, wszystkie=wsz, bez_jednego=bez)
# (5) model
Fm = [c for c in F if D[c].notna().mean() > 0.5]
R = D[['mp', 'seria'] + Fm + [f'e{h}' for h in H] + [f'f{h}' for h in H]].copy()
for c in Fm: R[c] = R.groupby('mp')[c].rank(pct=True)
R[Fm] = R[Fm].fillna(0.5)
# (a) Fama-MacBeth
fm = {}
for h in (12, 60):
    co = []
    for m, g in R.groupby('mp'):
        g = g.dropna(subset=[f'e{h}'])
        if len(g) < 100: continue
        b = np.linalg.lstsq(np.c_[np.ones(len(g)), g[Fm].values - 0.5], g[f'e{h}'].values, rcond=None)[0][1:]; co.append(b)
    co = np.vstack(co); fm[h] = [dict(parametr=c, wsp=float(co[:, k].mean()), t=float(nw(co[:, k], h).tvalues[0])) for k, c in enumerate(Fm)]
OUT['fama_macbeth'] = fm
# (b) LightGBM kroczący, cel nadwyżka 12 mies.
prm = dict(objective='regression', learning_rate=0.03, num_leaves=15, min_data_in_leaf=200, feature_fraction=0.7, bagging_fraction=0.7, bagging_freq=1, lambda_l2=5.0, verbose=-1, seed=7)
oos = []; imp = np.zeros(len(Fm))
for Y in range(2016, 2026):
    tr = R[(R.mp <= pd.Period(f'{Y-2}-12', 'M')) & R.e12.notna()]; te = R[(R.mp.dt.year == Y) & R.e12.notna()]
    if len(te) == 0: continue
    yt = tr.groupby('mp').e12.rank(pct=True) - 0.5
    mdl = lgb.train(prm, lgb.Dataset(tr[Fm].values, yt.values), num_boost_round=300)
    te = te.assign(pred=mdl.predict(te[Fm].values)); oos.append(te[['mp', 'seria', 'pred', 'e12', 'f1', 'f12']])
    contrib = mdl.predict(tr[Fm].values[::5], pred_contrib=True)[:, :-1]; imp += np.abs(contrib).mean(axis=0)
    print('LGBM', Y, flush=True)
O = pd.concat(oos)
icm = O.groupby('mp').apply(lambda g: stats.spearmanr(g.pred, g.e12)[0]).dropna()
O['q'] = O.groupby('mp').pred.transform(lambda s: pd.qcut(s.rank(method='first'), 5, labels=False) + 1)
kw = O.groupby('q').e12.mean()
OUT['lgbm'] = dict(IC=float(icm.mean()), t=float(nw(icm.values, 12).tvalues[0]), kwintyle_nadwyzka12=[float(x) for x in kw.values],
                   waznosc=sorted([dict(parametr=c, shap=float(v / max(imp.sum(), 1e-12))) for c, v in zip(Fm, imp)], key=lambda x: -x['shap']))
# (4) częstotliwość przebudowy: górny kwintyl wg (A) modelu (poza próbą, 2016+) i (B) kompletu strategii; równe wagi, zwroty miesięczne f1
def portfel(sel_fn, start, k):
    mm = sorted(D.mp.unique()); mm = [m for m in mm if m >= start]; v, eq, sk, obrot = 1.0, [], set(), []
    F1 = D.set_index(['mp', 'seria']).f1
    for a, m in enumerate(mm[:-1]):
        if a % k == 0:
            nowy = sel_fn(m)
            if nowy: obrot.append(len(set(nowy) ^ sk) / max(len(nowy | sk), 1)); sk = nowy
        if not sk: eq.append(v); continue
        r = F1.reindex([(m, s) for s in sk]).fillna(0).values
        v *= 1 + r.mean() - 0.001 * (obrot[-1] if a % k == 0 and obrot else 0); eq.append(v)
    e = pd.Series(eq); c = e.iloc[-1] ** (12 / len(e)) - 1; dd_ = (e / e.cummax() - 1).min()
    return dict(CAGR=float(c), maxDD=float(dd_), obrot_sr=float(np.mean(obrot)) if obrot else 0.0)
gm = {m: set(g.loc[g.q == 5, 'seria']) for m, g in O.groupby('mp')}
strat_set = {m: set(g.loc[(g['PEG (EPS 5 lat)'] > 0) & (g['PEG (EPS 5 lat)'] < 2) & (g['przychody 5 lat (CAGR)'] > 0.30) & (g.ROE > 0.15) & (g['dług / kapitał'] >= 0) & (g['dług / kapitał'] < 0.5), 'seria'])
             for m, g in D.groupby('mp')}
eqw = {m: set(g.seria) for m, g in D.groupby('mp')}
reb = []
for k in (1, 3, 6, 12, 24, 60):
    reb.append(dict(co_ile_mies=k, model_gorny_kwintyl=portfel(lambda m: gm.get(m), pd.Period('2016-01', 'M'), k),
                    strategia_4_skladniki=portfel(lambda m: strat_set.get(m), pd.Period('2015-01', 'M'), k),
                    rowne_wagi_wszystkie=portfel(lambda m: eqw.get(m), pd.Period('2016-01', 'M'), k)))
OUT['przebudowa'] = reb
json.dump(OUT, open(os.path.join(HERE, 'wyniki', 'r69_finviz.json'), 'w'), ensure_ascii=False, indent=1)
# raport tekstowy
T1 = IC[['parametr', 'pokrycie', 'IC_12', 't_12', 'IC_60', 't_60', 'spread_60', 'monotonia_60']].sort_values('t_60', key=abs, ascending=False)
md = ['# Etap 47: parametry Finviz a zwroty (S&P 500 z danymi SEC, starty 2012-2025)', '', '## Każdy parametr osobno (IC = korelacja rang z nadwyżką)', '', T1.round(3).to_markdown(index=False), '',
      '## Progi Finviz (nadwyżka 5 lat)', '', pd.DataFrame(pr).round(3).to_markdown(index=False), '', '## Składniki strategii', '',
      pd.DataFrame([dict(skladnik=k, **v) for k, v in pojed.items()]).round(3).to_markdown(index=False), '', pd.DataFrame(pary).round(3).to_markdown(index=False), '',
      f'Wszystkie 4: {wsz}', '', f'Bez jednego: {json.dumps(bez, ensure_ascii=False)}', '',
      f"## Model LightGBM (poza próbą 2016-2025): IC {OUT['lgbm']['IC']:.3f}, t {OUT['lgbm']['t']:.2f}; nadwyżka 12 mies. w kwintylach {[round(x, 3) for x in OUT['lgbm']['kwintyle_nadwyzka12']]}", '',
      pd.DataFrame(OUT['lgbm']['waznosc']).round(3).to_markdown(index=False), '', '## Fama-MacBeth (60 mies.)', '', pd.DataFrame(fm[60]).sort_values('t', key=abs, ascending=False).round(3).to_markdown(index=False), '',
      '## Częstotliwość przebudowy', '', pd.json_normalize(reb).round(3).to_markdown(index=False), '']
open(os.path.join(HERE, 'wyniki', 'r69_finviz.md'), 'w').write('\n'.join(md)); print('\n'.join(md[:8]))
