"""Etap 4: wzorce bez nadzoru (P1). Tylko próba ucząca: wybicia 1998-01-01 ... 2012-06-30 (wynik 52 tyg. kończy się
przed 2013-06-30).

1. Wektor kształtu = 13 punktów log ceny (względem zamknięcia wybicia) + 13 punktów log wolumenu (względem średniej 52 tyg.),
   każda kolumna standaryzowana. k-średnie dla k = 3..12.
2. Wybór k: wskaźnik sylwetki (próbka 20 tys.) i stabilność: 30 dopasowań na losowych połówkach, skorygowany indeks Randa
   względem dopasowania na całości (wymóg >= 0,6). Wybieramy k z najwyższą sylwetką spośród stabilnych.
3. Dla każdej grupy: udział, odsetek sukcesu s50 (+50 % przed -25 %), lift = s50 grupy / s50 wszystkich, przedział 95 %
   z bootstrapu blokowego po miesiącach (2000 losowań), lift w podokresach 1998-2002 / 2003-2007 / 2008-2012,
   p-wartość z bootstrapu (H0: lift = 1), korekta BH.
4. Czy kształt wnosi coś ponad momentum: s50 ~ decyle r26 + rok vs + grupa; test ilorazu wiarygodności.
"""
import os, warnings, duckdb, numpy as np, pandas as pd
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score, adjusted_rand_score
import statsmodels.formula.api as smf
from statsmodels.stats.multitest import multipletests
from scipy import stats
warnings.filterwarnings('ignore')
DB = os.environ.get('RESEARCH_DB', '/home/user/ndx/db/research.duckdb')
WYN = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'wyniki')
SEED = 20261110
rng = np.random.default_rng(SEED)
B = 2000

con = duckdb.connect(DB, read_only=True)
z = con.execute("""SELECT * FROM zdarzenia WHERE okres BETWEEN '1998-01-01' AND '2012-06-30' AND pelny_h = 1""").df()
z['okres'] = pd.to_datetime(z.okres); z['rok'] = z.okres.dt.year; z['mies'] = z.okres.dt.to_period('M').astype(str)
KC = [f'kc{k}' for k in range(13)]; KV = [f'kv{k}' for k in range(13)]
z = z.dropna(subset=KC + KV + ['s50']).reset_index(drop=True)
X = z[KC + KV].to_numpy()
mu, sd = X.mean(0), X.std(0); Xs = (X - mu) / sd
out = ['# Etap 4: wzorce bez nadzoru (wybicia 1998-01 ... 2012-06)', '',
       f'Zdarzeń: {len(z):,}, miesięcy: {z.mies.nunique()}, odsetek sukcesu s50 (wszystkie): {z.s50.mean()*100:.1f} %.', '']

# 2. wybór k
sub = rng.choice(len(Xs), min(20000, len(Xs)), replace=False)
rows = []; modele = {}
for k in range(3, 13):
    km = KMeans(k, n_init=10, random_state=SEED).fit(Xs)
    modele[k] = km
    sil = silhouette_score(Xs[sub], km.labels_[sub])
    ari = []
    for i in range(30):
        h = rng.choice(len(Xs), len(Xs) // 2, replace=False)
        kh = KMeans(k, n_init=3, random_state=SEED + i).fit(Xs[h])
        ari.append(adjusted_rand_score(km.labels_, kh.predict(Xs)))
    rows.append((k, round(sil, 4), round(np.mean(ari), 3), round(np.min(ari), 3)))
    print('k', k, rows[-1], flush=True)
wk = pd.DataFrame(rows, columns=['k', 'sylwetka', 'ARI średnio', 'ARI min'])
stab = wk[wk['ARI średnio'] >= 0.6]
K = int(stab.sort_values('sylwetka').iloc[-1].k) if len(stab) else int(wk.sort_values('ARI średnio').iloc[-1].k)
out += ['## Wybór liczby grup', '', wk.to_markdown(index=False), '', f'Wybrane k = {K} (najwyższa sylwetka wśród stabilnych, ARI >= 0,6).', '']
z['grupa'] = modele[K].labels_

# 3. lift
base = z.s50.mean()
idx_m = list(z.groupby('mies').indices.values())
g_arr = z.grupa.to_numpy(); s_arr = z.s50.to_numpy()
boot = np.zeros((B, K))
for b in range(B):
    ii = np.concatenate([idx_m[i] for i in rng.integers(0, len(idx_m), len(idx_m))])
    gb, sb = g_arr[ii], s_arr[ii]; bb = sb.mean()
    for g in range(K):
        m = gb == g
        boot[b, g] = sb[m].mean() / bb if m.any() else np.nan
okresy = [(1998, 2002), (2003, 2007), (2008, 2012)]
# p-wartość "grupa różni się od średniej": test lift = 1 z bootstrapu (dwustronny)
rows = []
for g in range(K):
    m = z.grupa == g
    lift = z.s50[m].mean() / base
    lo, hi = np.nanpercentile(boot[:, g], [2.5, 97.5])
    p_boot = 2 * min((boot[:, g] <= 1).mean(), (boot[:, g] >= 1).mean())
    pod = [z.s50[m & z.rok.between(a, b)].mean() / z.s50[z.rok.between(a, b)].mean() for a, b in okresy]
    rows.append(dict(grupa=g, n=int(m.sum()), udzial=round(m.mean(), 3), s50=round(z.s50[m].mean(), 3), lift=round(lift, 3),
                     ci95=f'{lo:.2f}-{hi:.2f}', p=max(p_boot, 1 / B), lift_98_02=round(pod[0], 2), lift_03_07=round(pod[1], 2),
                     lift_08_12=round(pod[2], 2), f52_med=round(z.f52[m].median(), 3), mfe52_med=round(z.mfe52[m].median(), 3)))
L = pd.DataFrame(rows)
L['q_BH'] = multipletests(L.p, method='fdr_bh')[1].round(4)
L['wzorzec'] = (L.lift >= 1.2) & (L.ci95.str.split('-').str[0].astype(float) > 1) & (L.q_BH < 0.05) & \
               (L[['lift_98_02', 'lift_03_07', 'lift_08_12']].min(axis=1) > 1)
out += ['## Grupy kształtów i lift sukcesu', '',
        'lift = odsetek sukcesu w grupie / odsetek we wszystkich wybiciach; ci95 z bootstrapu blokowego po miesiącach; '
        'wzorzec = lift >= 1,2, dolna granica > 1, q_BH < 0,05 i lift > 1 w każdym z trzech podokresów.', '',
        L.sort_values('lift', ascending=False).to_markdown(index=False), '']

# kształt centroidów w jednostkach pierwotnych (% od zamknięcia wybicia, wolumen x średnia)
C = modele[K].cluster_centers_ * sd + mu
cen = pd.DataFrame({'tyg_przed': [-(52 - 4 * i - 2) for i in range(13)]})
for g in range(K):
    cen[f'g{g}_cena_%'] = ((np.exp(C[g, :13]) - 1) * 100).round(1)
    cen[f'g{g}_vol_x'] = np.exp(C[g, 13:]).round(2)
cen.to_csv(os.path.join(WYN, 'r07_centroidy.csv'), index=False)
out += ['## Kształty (centroidy): cena w % względem zamknięcia wybicia, wolumen jako krotność średniej 52 tyg.', '',
        cen.to_markdown(index=False), '']

# opis grup cechami (mediany)
cechy = ['r4', 'r13', 'r26', 'r52', 'od_max52', 'od_min52', 'od_ath', 'nowy_ath', 'dl_bazy', 'gl_bazy', 'zmn_10_52',
         'vol_wyb', 'vol_baza', 'akum', 'sila', 'spy_ok', 'log_dv']
out += ['## Mediany cech w grupach', '', z.groupby('grupa')[cechy].median().round(3).reset_index().to_markdown(index=False), '']

# 4. czy kształt wnosi coś ponad momentum 6M
z['dec26'] = pd.qcut(z.r26, 10, labels=False, duplicates='drop')
m0 = smf.logit('s50 ~ C(dec26) + C(rok)', data=z).fit(disp=0)
m1 = smf.logit('s50 ~ C(dec26) + C(rok) + C(grupa)', data=z).fit(disp=0)
lr = 2 * (m1.llf - m0.llf); dfree = m1.df_model - m0.df_model
out += ['## Czy kształt dodaje informację ponad momentum 6M', '',
        f'Model 0: s50 ~ decyle zwrotu 26 tyg. + rok; model 1: + grupa kształtu. LR = {lr:.1f}, st. swobody = {dfree:.0f}, '
        f'p = {stats.chi2.sf(lr, dfree):.2e}. Pseudo-R² McFaddena: {m0.prsquared:.4f} -> {m1.prsquared:.4f}.', '',
        'Uwaga: LR zakłada niezależne obserwacje; przy zależności wewnątrz miesięcy p jest zaniżone, '
        'dlatego decyzja opiera się na lifcie z bootstrapu blokowego i stabilności w podokresach.', '']
z[['ticker', 'okres', 'grupa']].to_parquet(os.path.join(WYN, 'r07_grupy.parquet'))
open(os.path.join(WYN, 'r07_wzorce.md'), 'w').write('\n'.join(out))
print('\n'.join(out))
