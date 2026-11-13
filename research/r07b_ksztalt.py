"""Etap 4b: kształt oddzielony od wielkości ruchu (wniosek z etapu 4: grupy na surowych ścieżkach = momentum).

Ścieżka ceny: 13 punktów kc (średnie 4-tygodniowe log ceny względem zamknięcia wybicia) + punkt wybicia (0),
skalowana do [0, 1] własnym minimum i maksimum -> sam kształt, bez wielkości wzrostu. Wolumen: 13 punktów kv
standaryzowane w obrębie ścieżki. k-średnie k = 3..10, wybór jak w etapie 4.
Lift PONAD MOMENTUM: oczekiwany sukces z modelu s50 ~ decyle r26 + decyle r52 + rok (logit); lift grupy =
suma sukcesów / suma oczekiwanych. 95 % z bootstrapu blokowego po miesiącach, stabilność w trzech podokresach, BH.
"""
import os, warnings, pickle, duckdb, numpy as np, pandas as pd
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score, adjusted_rand_score
import statsmodels.formula.api as smf
from statsmodels.stats.multitest import multipletests
warnings.filterwarnings('ignore')
DB = os.environ.get('RESEARCH_DB', '/home/user/ndx/db/research.duckdb')
WYN = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'wyniki')
SEED = 20261110; rng = np.random.default_rng(SEED); B = 2000
con = duckdb.connect(DB, read_only=True)
z = con.execute("SELECT * FROM zdarzenia WHERE okres BETWEEN '1998-01-01' AND '2012-06-30' AND pelny_h = 1").df()
z['okres'] = pd.to_datetime(z.okres); z['rok'] = z.okres.dt.year; z['mies'] = z.okres.dt.to_period('M').astype(str)
KC = [f'kc{k}' for k in range(13)]; KV = [f'kv{k}' for k in range(13)]
z = z.dropna(subset=KC + KV + ['s50', 'r26', 'r52']).reset_index(drop=True)
P = np.c_[z[KC].to_numpy(), np.zeros(len(z))]
P = (P - P.min(1, keepdims=True)) / np.maximum(P.max(1, keepdims=True) - P.min(1, keepdims=True), 1e-9)
V = z[KV].to_numpy(); V = (V - V.mean(1, keepdims=True)) / np.maximum(V.std(1, keepdims=True), 1e-9)
z['dec26'] = pd.qcut(z.r26, 10, labels=False, duplicates='drop'); z['dec52'] = pd.qcut(z.r52, 10, labels=False, duplicates='drop')
base = smf.logit('s50 ~ C(dec26) + C(dec52) + C(rok)', data=z).fit(disp=0)
z['ocz'] = base.predict(z)
out = ['# Etap 4b: kształt bez wielkości ruchu, lift ponad momentum (wybicia 1998-01 ... 2012-06)', '',
       f'Zdarzeń: {len(z):,}. Model oczekiwań: s50 ~ decyle zwrotu 26 tyg. + decyle 52 tyg. + rok (pseudo-R² {base.prsquared:.4f}).', '']
okresy = [(1998, 2002), (2003, 2007), (2008, 2012)]
idx_m = list(z.groupby('mies').indices.values())
s_arr = z.s50.to_numpy(); o_arr = z.ocz.to_numpy()

for nazwa, X in [('cena', P), ('cena + wolumen', np.c_[P, V])]:
    sub = rng.choice(len(X), 20000, replace=False)
    rows, mod = [], {}
    for k in range(3, 11):
        km = KMeans(k, n_init=10, random_state=SEED).fit(X); mod[k] = km
        ari = [adjusted_rand_score(km.labels_, KMeans(k, n_init=3, random_state=SEED + i).fit(X[h]).predict(X))
               for i, h in enumerate([rng.choice(len(X), len(X) // 2, replace=False) for _ in range(20)])]
        rows.append((k, round(silhouette_score(X[sub], km.labels_[sub]), 4), round(np.mean(ari), 3)))
        print(nazwa, rows[-1], flush=True)
    wk = pd.DataFrame(rows, columns=['k', 'sylwetka', 'ARI średnio'])
    st = wk[wk['ARI średnio'] >= 0.6]
    K = int(st.sort_values('sylwetka').iloc[-1].k)
    g = mod[K].labels_
    boot = np.zeros((B, K))
    for b in range(B):
        ii = np.concatenate([idx_m[i] for i in rng.integers(0, len(idx_m), len(idx_m))])
        for j in range(K):
            m = g[ii] == j
            boot[b, j] = s_arr[ii][m].sum() / o_arr[ii][m].sum() if m.any() else np.nan
    R = []
    for j in range(K):
        m = g == j
        lift = s_arr[m].sum() / o_arr[m].sum()
        pod = [s_arr[m & z.rok.between(a, c)].sum() / o_arr[m & z.rok.between(a, c)].sum() for a, c in okresy]
        p = max(2 * min((boot[:, j] <= 1).mean(), (boot[:, j] >= 1).mean()), 1 / B)
        lo, hi = np.nanpercentile(boot[:, j], [2.5, 97.5])
        R.append(dict(grupa=j, n=int(m.sum()), udzial=round(m.mean(), 3), s50=round(s_arr[m].mean(), 3), oczekiwane=round(o_arr[m].mean(), 3),
                      lift_ponad_momentum=round(lift, 3), ci95=f'{lo:.2f}-{hi:.2f}', p=p,
                      l_98_02=round(pod[0], 2), l_03_07=round(pod[1], 2), l_08_12=round(pod[2], 2),
                      f52_med=round(z.f52[m].median(), 3), r26_med=round(z.r26[m].median(), 3)))
    R = pd.DataFrame(R); R['q_BH'] = multipletests(R.p, method='fdr_bh')[1].round(4)
    R['wzorzec'] = (R.lift_ponad_momentum >= 1.2) & (R.ci95.str.split('-').str[0].astype(float) > 1) & (R.q_BH < 0.05) & (R[['l_98_02', 'l_03_07', 'l_08_12']].min(1) > 1)
    cen = pd.DataFrame({'tyg_przed': [-(52 - 4 * i - 2) for i in range(13)] + [0]})
    for j in range(K):
        cen[f'g{j}'] = mod[K].cluster_centers_[j, :14].round(2)
    out += [f'## Kształt: {nazwa}', '', wk.to_markdown(index=False), '', f'Wybrane k = {K}.', '',
            R.sort_values('lift_ponad_momentum', ascending=False).to_markdown(index=False), '',
            'Kształt ceny (0 = najniższy punkt ścieżki, 1 = najwyższy; ostatni wiersz = tydzień wybicia):', '', cen.to_markdown(index=False), '']
    cen.to_csv(os.path.join(WYN, f'r07b_centroidy_{"cw" if "wol" in nazwa else "c"}.csv'), index=False)
    z[f'g_{"cw" if "wol" in nazwa else "c"}'] = g
z[['ticker', 'okres', 'g_c', 'g_cw']].to_parquet(os.path.join(WYN, 'r07b_grupy.parquet'))
open(os.path.join(WYN, 'r07b_ksztalt.md'), 'w').write('\n'.join(out))
print('\n'.join(out))
