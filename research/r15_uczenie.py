"""Etap 6b: uczenie z surowych danych (bez gotowych wskaźników). Próba ucząca: decyzje 1998-2012, zwrot przyszły kończy się
<= 2013-06-30. Prognozy krokowe na lata 2003-2012 (model uczony na datach < 1 stycznia roku y minus H tygodni = embargo).

A. Wybór spółek: dla H = 1, 4, 13, 26, 52 tyg. LightGBM uczy się rangi przekrojowej przyszłego zwrotu z: 52 tygodniowych
   zwrotów, 26 zwrotów 4-tygodniowych sprzed 1-3 lat, 13 bloków wolumenu, obrotów, zmienności i maks. dziennego zwrotu
   z poprzedniego miesiąca, 13 zwrotów 4-tygodniowych rynku i SPY względem SMA 40.
   Ocena: IC (t Neweya-Westa), spread decyli zwrotu nadwyżkowego za H, portfel top 50 trzymany 4 tyg. (rebalancing co 4 tyg.,
   koszty 0,1/0,25/0,5 % na stronę wg obrotów) vs rynek (równe wagi), bootstrap blokowy 13 okresów.
B. Co model wie: |SHAP| po blokach i po opóźnieniach; kierunek: średni SHAP w kwintylach najważniejszych wejść.
C. Rynek: czy da się przewidzieć zwrot indeksu za 4 / 13 tyg. (wejścia: m1..m13, spy_sma, szerokość = odsetek spółek z
   dodatnim zwrotem 26 tyg., rozrzut przekrojowy zwrotów 4 tyg., średnia zmienność); strategia: w rynku, gdy prognoza > 0.
"""
import os, warnings, numpy as np, pandas as pd, lightgbm as lgb
from scipy import stats
warnings.filterwarnings('ignore')
DB = os.environ.get('RESEARCH_DB', '/home/user/ndx/db/research.duckdb')
PANEL = os.path.join(os.path.dirname(DB), 'panel_surowy.parquet')
WYN = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'wyniki')
SEED = 20261110; rng = np.random.default_rng(SEED); B = 2000
HS = (1, 4, 13, 26, 52)
GR = pd.Timestamp('2013-06-30')
P = pd.read_parquet(PANEL)
P = P[(P.okres >= '1998-01-01') & (P.okres <= '2012-12-31')].reset_index(drop=True)
for h in HS:
    P.loc[P.okres + pd.Timedelta(weeks=h) > GR, f'f{h}w'] = np.nan
    f = P[f'f{h}w'].clip(lower=-1)
    q1 = f.groupby(P.okres).transform(lambda v: v.quantile(0.01)); q99 = f.groupby(P.okres).transform(lambda v: v.quantile(0.99))
    fw = f.clip(q1, q99)
    P[f'x{h}'] = fw - fw.groupby(P.okres).transform('mean')
    P[f'y{h}'] = f.groupby(P.okres).rank(pct=True)
WEJ = [f'w{k}' for k in range(1, 53)] + [f'b{k}' for k in range(1, 27)] + [f'v{k}' for k in range(1, 14)] + ['ldv', 'rvd', 'maxd'] + \
      [f'm{k}' for k in range(1, 14)] + ['spy_sma']
PAR = dict(objective='regression', learning_rate=0.05, num_leaves=31, min_child_samples=1000, subsample=0.7, subsample_freq=1,
           colsample_bytree=0.5, reg_lambda=10.0, n_estimators=250, verbose=-1, random_state=SEED, n_jobs=4)
P['koszt'] = np.select([np.exp(P.ldv) / 5 >= 2e7, np.exp(P.ldv) / 5 >= 5e6], [0.001, 0.0025], 0.005)
print('panel', P.shape, flush=True)


def nw_t(x, lags):
    x = np.asarray(x, float); x = x[~np.isnan(x)]; n = len(x); e = x - x.mean(); s = e @ e / n
    for l in range(1, lags + 1): s += 2 * (1 - l / (lags + 1)) * (e[l:] @ e[:-l]) / n
    return x.mean() / np.sqrt(s / n)


def blok(x, b=13):
    x = np.asarray(x); n = len(x); nb = int(np.ceil(n / b))
    s = [np.concatenate([x[i:i + b] for i in rng.integers(0, n - b, nb)])[:n].mean() for _ in range(B)]
    return np.percentile(s, [2.5, 97.5])


out = ['# Etap 6b: uczenie z surowych danych (decyzje co 4 tyg., prognozy krokowe 2003-2012, próba ucząca)', '',
       f'Obserwacji spółka-data: {len(P):,}; dat decyzji: {P.okres.nunique()}. Wejść: {len(WEJ)} (surowe zwroty, wolumen, rynek).', '']
shap_all, wyn = {}, []
oos = P.okres >= '2003-01-01'
for h in HS:
    P[f'p{h}'] = np.nan
    sh = []
    for y in range(2003, 2013):
        tr = P[(P.okres < pd.Timestamp(f'{y}-01-01') - pd.Timedelta(weeks=h)) & P[f'y{h}'].notna()]
        te = P.okres.dt.year == y
        m = lgb.LGBMRegressor(**PAR).fit(tr[WEJ], tr[f'y{h}'])
        P.loc[te, f'p{h}'] = m.predict(P.loc[te, WEJ])
        smp = P.loc[te, WEJ].sample(min(8000, int(te.sum())), random_state=SEED)
        sh.append((smp, m.predict(smp, pred_contrib=True)[:, :-1]))
    shap_all[h] = sh
    O = P[oos & P[f'x{h}'].notna()]
    ic = O.groupby('okres').apply(lambda v: stats.spearmanr(v[f'p{h}'], v[f'x{h}'])[0])
    dec = O.groupby('okres').apply(lambda v: v.assign(d=pd.qcut(v[f'p{h}'].rank(method='first'), 10, labels=False)).groupby('d')[f'x{h}'].mean())
    spread = dec[9] - dec[0]
    krok = max(h // 4, 1)
    spread_nz = spread.iloc[::krok]
    wyn.append(dict(H_tyg=h, IC=ic.mean(), t_NW=nw_t(ic, max(h // 4, 1)), IC_dodatnie=(ic > 0).mean(),
                    D10_zwrot_nadw=dec[9].mean(), D1_zwrot_nadw=dec[0].mean(), spread_D10_D1=spread.mean(),
                    t_spread_niezal=spread_nz.mean() / spread_nz.std() * np.sqrt(len(spread_nz)),
                    lata_IC_dodatnie=f'{(ic.groupby(ic.index.year).mean() > 0).sum()}/10'))
    print('H', h, wyn[-1]['IC'], flush=True)
A = pd.DataFrame(wyn)
out += ['## A. Czy model przewiduje, które spółki wypadną lepiej od rynku', '',
        'IC = korelacja rang prognozy i zwrotu nadwyżkowego za H; D10 / D1 = średni zwrot nadwyżkowy najwyżej / najniżej ocenionego decyla za cały horyzont H.', '',
        A.round(4).to_markdown(index=False), '']

# portfele top 50 trzymane 4 tyg. według prognoz każdego horyzontu
O = P[oos & P.f4w.notna()].copy()
daty = sorted(O.okres.unique())
ew = O.groupby('okres').f4w.mean()
port = {}
for h in HS:
    zw, prev, kp = [], set(), {}
    for t in daty:
        d = O[O.okres == t]; top = d.nlargest(50, f'p{h}'); cur = set(top.seria); kz = dict(zip(top.seria, top.koszt))
        koszt = (sum(kz[s] for s in cur - prev) + sum(kp.get(s, 0.005) for s in prev - cur)) / 50
        zw.append(top.f4w.clip(lower=-1).mean() - koszt); prev, kp = cur, kz
    port[h] = pd.Series(zw, index=daty)
rows = []
for nm, r in [('rynek (równe wagi, bez kosztów)', ew)] + [(f'top 50 wg modelu H={h} tyg.', port[h]) for h in HS]:
    eq = (1 + r).cumprod(); lat = len(r) * 4 / 52
    d = r - ew; lo, hi = blok(d)
    rows.append(dict(portfel=nm, CAGR=eq.iloc[-1] ** (1 / lat) - 1, zmiennosc=r.std() * np.sqrt(13), Sharpe=r.mean() / r.std() * np.sqrt(13),
                     maxDD=(eq / eq.cummax() - 1).min(), nadwyzka_na_4tyg=d.mean(), ci95=f'{lo*100:.2f}…{hi*100:.2f} %'))
out += ['## Portfele top 50 (rebalancing co 4 tygodnie, netto kosztów) 2003-2012', '', pd.DataFrame(rows).round(4).to_markdown(index=False), '']
roczne = pd.DataFrame({**{f'H={h}': port[h] for h in HS}, 'rynek': ew})
roczne = roczne.groupby(roczne.index.year).apply(lambda v: (1 + v).prod() - 1)
out += ['Zwroty roczne:', '', roczne.round(3).reset_index(names='rok').to_markdown(index=False), '']

# B. co model wie
blokx = {'ostatnie 4 tyg. (w1-w4)': [f'w{k}' for k in range(1, 5)], 'tyg. 5-13': [f'w{k}' for k in range(5, 14)],
         'tyg. 14-26': [f'w{k}' for k in range(14, 27)], 'tyg. 27-52': [f'w{k}' for k in range(27, 53)],
         'rok 2-3 wstecz (b)': [f'b{k}' for k in range(1, 27)], 'wolumen (v)': [f'v{k}' for k in range(1, 14)],
         'obroty, zmienność, maks. dzień': ['ldv', 'rvd', 'maxd'], 'rynek (m, spy_sma)': [f'm{k}' for k in range(1, 14)] + ['spy_sma']}
tab, kier = [], []
for h in HS:
    X = pd.concat([s for s, _ in shap_all[h]]); Sv = np.vstack([v for _, v in shap_all[h]])
    imp = pd.Series(np.abs(Sv).mean(0), index=WEJ)
    tab.append({'H_tyg': h, **{k: imp[v].sum() for k, v in blokx.items()}})
    if h in (4, 26):
        for f in imp.sort_values(ascending=False).index[:8]:
            q = pd.qcut(X[f].rank(method='first'), 5, labels=False)
            s = pd.Series(Sv[:, WEJ.index(f)]).groupby(q.to_numpy()).mean()
            v = X[f].groupby(q.to_numpy()).median()
            kier.append(dict(H_tyg=h, wejscie=f, waznosc=imp[f], **{f'K{i+1} (mediana {v[i]:+.3f})': s[i] for i in range(5)}))
T = pd.DataFrame(tab)
T = T.set_index('H_tyg'); T = T.div(T.sum(1), axis=0).round(3).reset_index()
out += ['## B. Czego model się nauczył', '', 'Udział bloków wejść w całkowitym |SHAP| (suma = 1):', '', T.to_markdown(index=False), '',
        'Kierunek: średni wkład SHAP (w jednostkach rangi przyszłego zwrotu) w kwintylach wartości 8 najważniejszych wejść; '
        'K1 = najniższe wartości. Dodatni = model podnosi ocenę spółki.', '']
for h in (4, 26):
    k = [r for r in kier if r['H_tyg'] == h]
    out += [f'H = {h} tyg.:', '', '\n'.join(f"- {r['wejscie']} (ważność {r['waznosc']:.4f}): " + ', '.join(f'{c}: {r[c]:+.4f}' for c in r if c.startswith('K')) for r in k), '']

# C. rynek
M = P.groupby('okres').agg(**{f'm{k}': (f'm{k}', 'first') for k in range(1, 14)}, spy_sma=('spy_sma', 'first'),
                           szer=('w1', lambda v: np.nan), rv=('rvd', 'mean'))
cum26 = P[[f'w{k}' for k in range(1, 27)]].sum(1)
M['szer'] = (cum26 > 0).groupby(P.okres).mean()
M['rozrzut'] = P[[f'w{k}' for k in range(1, 5)]].sum(1).groupby(P.okres).std()
M['f4'] = P.groupby('okres').f4w.mean(); M['f13'] = P.groupby('okres').f13w.mean()
MW = [f'm{k}' for k in range(1, 14)] + ['spy_sma', 'szer', 'rozrzut', 'rv']
cr = []
for tgt in ('f4', 'f13'):
    M[f'p_{tgt}'] = np.nan
    hh = 4 if tgt == 'f4' else 13
    for y in range(2003, 2013):
        tr = M[(M.index < pd.Timestamp(f'{y}-01-01') - pd.Timedelta(weeks=hh)) & M[tgt].notna()]
        te = M.index.year == y
        m = lgb.LGBMRegressor(objective='regression', n_estimators=200, learning_rate=0.03, num_leaves=4, min_child_samples=15,
                              subsample=0.8, subsample_freq=1, verbose=-1, random_state=SEED).fit(tr[MW], tr[tgt])
        M.loc[te, f'p_{tgt}'] = m.predict(M.loc[te, MW])
    o = M[(M.index >= '2003-01-01') & M[tgt].notna()]
    ic = stats.spearmanr(o[f'p_{tgt}'], o[tgt])
    cr.append(dict(cel=f'zwrot rynku {hh} tyg.', n_dat=len(o), korelacja_rang=ic[0], p=ic[1],
                   zwrot_gdy_prognoza_dodatnia=o.loc[o[f'p_{tgt}'] > 0, tgt].mean(), zwrot_gdy_ujemna=o.loc[o[f'p_{tgt}'] <= 0, tgt].mean(),
                   udzial_dodatnich=(o[f'p_{tgt}'] > 0).mean()))
o = M[(M.index >= '2003-01-01') & M.f4.notna()]
tim = np.where(o.p_f4 > 0, o.f4, 0.0)
eqb, eqt = (1 + o.f4).cumprod(), pd.Series((1 + tim).cumprod(), index=o.index)
lat = len(o) * 4 / 52
cr_s = [dict(strategia='kup i trzymaj rynek', CAGR=eqb.iloc[-1] ** (1 / lat) - 1, maxDD=(eqb / eqb.cummax() - 1).min()),
        dict(strategia='w rynku, gdy model przewiduje wzrost 4 tyg.', CAGR=eqt.iloc[-1] ** (1 / lat) - 1, maxDD=(eqt / eqt.cummax() - 1).min())]
out += ['## C. Czy da się przewidzieć cały rynek (indeks równoważony)', '', pd.DataFrame(cr).round(4).to_markdown(index=False), '',
        pd.DataFrame(cr_s).round(4).to_markdown(index=False), '', 'Uwaga: tylko ok. 130 dat decyzji w ocenie; przedziały szerokie, wynik orientacyjny.', '']
P[['seria', 'okres'] + [f'p{h}' for h in HS]].to_parquet(os.path.join(os.path.dirname(DB), 'prognozy_surowe.parquet'))
open(os.path.join(WYN, 'r15_uczenie.md'), 'w').write('\n'.join(out))
print('\n'.join(out))
