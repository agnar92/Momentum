"""Etap 5: ślad katalizatora (P3) i znaczenie wolumenu (P4). Tylko próba ucząca (wybicia 1998-01 ... 2012-06).

P3: dla każdej flagi katalizatora w tygodniu wybicia lub tygodniu przed nim: udział, s50 z flagą i bez, iloraz szans
    z regresji logistycznej s50 ~ flaga + decyle r26 + rok (błędy grupowane po miesiącu), różnica średniego f52.
P4: LightGBM w schemacie kroczącym (uczenie na wybiciach do końca roku y-2, prognoza roku y, lata 2003-2012):
    model CENA vs CENA + WOLUMEN. ΔAUC i przedział 95 % z bootstrapu blokowego po miesiącach na prognozach spoza próby.
    Placebo: cechy wolumenu przetasowane w obrębie roku (zrywa związek z wynikiem) -> ΔAUC powinna być ok. 0.
"""
import os, warnings, duckdb, numpy as np, pandas as pd, lightgbm as lgb
import statsmodels.formula.api as smf
from sklearn.metrics import roc_auc_score
from statsmodels.stats.multitest import multipletests
warnings.filterwarnings('ignore')
DB = os.environ.get('RESEARCH_DB', '/home/user/ndx/db/research.duckdb')
KAT = os.path.join(os.path.dirname(DB), 'kat.duckdb')
WYN = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'wyniki')
wmean = lambda v: v.clip(v.quantile(0.01), v.quantile(0.99)).mean()  # średnia winsoryzowana 1/99 %
SEED = 20261110; rng = np.random.default_rng(SEED); B = 2000

con = duckdb.connect(KAT, read_only=True)
con.execute(f"ATTACH '{DB}' AS r (READ_ONLY)")
z = con.execute("""
  SELECT e.*, coalesce(greatest(k0.kat_4_3, k1.kat_4_3), 0) kat_4_3, coalesce(greatest(k0.kat_2_2, k1.kat_2_2), 0) kat_2_2,
         coalesce(greatest(k0.kat_8_5, k1.kat_8_5), 0) kat_8_5, coalesce(greatest(k0.dzien_8_3, k1.dzien_8_3), 0) dzien_8_3,
         greatest(k0.max_rv, k1.max_rv) max_rv, greatest(k0.max_luka, k1.max_luka) max_luka, k0.dni_rv2, k0.sila_dnia_max_rv
  FROM r.zdarzenia e
  LEFT JOIN kat_w k0 ON k0.ticker = e.ticker AND k0.okres = e.okres
  LEFT JOIN kat_w k1 ON k1.ticker = e.ticker AND k1.okres = e.okres - INTERVAL 7 DAY
  WHERE e.okres BETWEEN '1998-01-01' AND '2012-06-30' AND e.pelny_h = 1""").df()
z['okres'] = pd.to_datetime(z.okres); z['rok'] = z.okres.dt.year; z['mies'] = z.okres.dt.to_period('M').astype(str)
z['dec26'] = pd.qcut(z.r26, 10, labels=False, duplicates='drop')
z = z.dropna(subset=['s50', 'r26']).reset_index(drop=True)
out = ['# Etap 5: ślad katalizatora i wolumen (wybicia 1998-01 ... 2012-06)', '',
       f'Zdarzeń: {len(z):,}; odsetek sukcesu s50: {z.s50.mean()*100:.1f} %.', '']

# P3
FL = {'kat_4_3': 'luka >= 4 % i wolumen >= 3x', 'kat_2_2': 'luka >= 2 % i wolumen >= 2x', 'kat_8_5': 'luka >= 8 % i wolumen >= 5x',
      'dzien_8_3': 'dzień +8 % i wolumen >= 3x'}
grp = pd.factorize(z.mies)[0]
rows = []
for f, opis in FL.items():
    m = smf.logit(f's50 ~ {f} + C(dec26) + C(rok)', data=z).fit(disp=0, cov_type='cluster', cov_kwds={'groups': grp})
    b, se = m.params[f], m.bse[f]
    rows.append(dict(flaga=opis, udzial=round(z[f].mean(), 3), s50_z=round(z.s50[z[f] == 1].mean(), 3), s50_bez=round(z.s50[z[f] == 0].mean(), 3),
                     OR=round(np.exp(b), 3), ci95=f'{np.exp(b-1.96*se):.2f}-{np.exp(b+1.96*se):.2f}', p=m.pvalues[f],
                     f52w_z=round(wmean(z.f52[z[f] == 1]), 3), f52w_bez=round(wmean(z.f52[z[f] == 0]), 3), f52med_z=round(z.f52[z[f] == 1].median(), 3), f52med_bez=round(z.f52[z[f] == 0].median(), 3)))
P3 = pd.DataFrame(rows); P3['q_BH'] = multipletests(P3.p, method='fdr_bh')[1]
P3['p'] = P3.p.map('{:.2e}'.format); P3['q_BH'] = P3.q_BH.map('{:.2e}'.format)
out += ['## P3: ślad katalizatora w tygodniu wybicia lub tygodniu przed', '',
        'OR = iloraz szans sukcesu z flagą vs bez, przy tych samych decylach zwrotu 26 tyg. i roku; błędy grupowane po miesiącu.', '',
        P3.to_markdown(index=False), '']
# relacja dawka-odpowiedź: kwintyle max_rv
z['kw_rv'] = pd.qcut(z.max_rv.rank(method='first'), 5, labels=False)
d = z.groupby('kw_rv').agg(max_rv_mediana=('max_rv', 'median'), n=('s50', 'size'), s50=('s50', 'mean'), f52_sr_w=('f52', wmean), mfe_med=('mfe52', 'median')).round(3).reset_index()
out += ['Kwintyle największego dziennego wolumenu względnego w tygodniu wybicia (lub tydzień przed):', '', d.to_markdown(index=False), '']

# P4
CENA = ['r4', 'r13', 'r26', 'r52', 'od_max52', 'od_min52', 'od_ath', 'nowy_ath', 'dl_bazy', 'gl_bazy', 'zmn_10_52', 'zmn_52',
        'sila', 'wyb_proc', 'spy_ok', 'ew13', 'log_dv'] + [f'kc{k}' for k in range(13)]
WOL = ['vol_wyb', 'vol_baza', 'akum', 'max_rv', 'max_luka', 'dni_rv2', 'kat_4_3', 'kat_2_2', 'kat_8_5', 'dzien_8_3'] + [f'kv{k}' for k in range(13)]
PAR = dict(objective='binary', learning_rate=0.03, num_leaves=15, min_child_samples=200, subsample=0.8, subsample_freq=1,
           colsample_bytree=0.8, reg_lambda=1.0, n_estimators=400, verbose=-1, random_state=SEED)


def krokowo(dane, cechy):
    pred = pd.Series(np.nan, index=dane.index)
    for y in range(2003, 2013):
        tr = dane[dane.rok <= y - 2]; te = dane[dane.rok == y]
        m = lgb.LGBMClassifier(**PAR).fit(tr[cechy], tr.s50)
        pred[te.index] = m.predict_proba(te[cechy])[:, 1]
    return pred


z2 = z[z.rok >= 2003].copy()
p_c = krokowo(z, CENA)[z2.index]
p_cw = krokowo(z, CENA + WOL)[z2.index]
zp = z.copy()
for c in WOL:  # placebo: wolumen przetasowany w obrębie roku
    zp[c] = zp.groupby('rok')[c].transform(lambda v: v.sample(frac=1, random_state=SEED).to_numpy())
p_pl = krokowo(zp, CENA + WOL)[z2.index]
yv = z2.s50.to_numpy()
auc = lambda p, ii=slice(None): roc_auc_score(yv[ii], p.to_numpy()[ii])
idx_m = list(z2.reset_index(drop=True).groupby('mies').indices.values())
bd, bp = [], []
for _ in range(B):
    ii = np.concatenate([idx_m[i] for i in rng.integers(0, len(idx_m), len(idx_m))])
    a_c = auc(p_c, ii); bd.append(auc(p_cw, ii) - a_c); bp.append(auc(p_pl, ii) - a_c)
rok_auc = pd.DataFrame({'rok': range(2003, 2013)})
rok_auc['AUC_cena'] = [roc_auc_score(z2.s50[z2.rok == y], p_c[z2.rok == y]) for y in rok_auc.rok]
rok_auc['AUC_cena_wolumen'] = [roc_auc_score(z2.s50[z2.rok == y], p_cw[z2.rok == y]) for y in rok_auc.rok]
rok_auc['roznica'] = rok_auc.AUC_cena_wolumen - rok_auc.AUC_cena
out += ['## P4: czy wolumen poprawia prognozę sukcesu (LightGBM, prognozy spoza próby 2003-2012)', '',
        f'AUC cena: {auc(p_c):.4f}; cena + wolumen: {auc(p_cw):.4f}; placebo (wolumen przetasowany): {auc(p_pl):.4f}.', '',
        f'ΔAUC (cena + wolumen − cena) = {auc(p_cw)-auc(p_c):.4f}, 95 % blokowo: {np.percentile(bd,2.5):.4f} … {np.percentile(bd,97.5):.4f}; '
        f'odsetek losowań ≤ 0: {np.mean(np.array(bd) <= 0):.4f}.', '',
        f'ΔAUC placebo = {auc(p_pl)-auc(p_c):.4f}, 95 %: {np.percentile(bp,2.5):.4f} … {np.percentile(bp,97.5):.4f}.', '',
        f'Lata z dodatnią różnicą: {(rok_auc.roznica > 0).sum()} z 10.', '', rok_auc.round(4).to_markdown(index=False), '']
# kwintyle prognozy: praktyczne znaczenie (odsetek sukcesu w górnym kwintylu)
for nm, p in [('cena', p_c), ('cena + wolumen', p_cw)]:
    q = pd.qcut(p.rank(method='first'), 5, labels=False)
    t = z2.groupby(q.to_numpy()).agg(s50=('s50', 'mean'), f52_sr_w=('f52', wmean), f52_med=('f52', 'median')).round(3)
    out += [f'Kwintyle prognozy, model {nm} (0 = najniższa):', '', t.reset_index(names='kwintyl').to_markdown(index=False), '']
open(os.path.join(WYN, 'r09_katalizator.md'), 'w').write('\n'.join(out))
print('\n'.join(out))
