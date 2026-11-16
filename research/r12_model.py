"""Etap 6: czy połączenie cech daje lepszy portfel niż samo momentum 6M (P2). Ocena krocząca w próbie uczącej:
prognozy na miesiące 2003-01 ... 2012-12 (zwrot 1 mies. kończy się najpóźniej 2013-01, przed walidacją 2013-07).

Rankingi (co miesiąc, spółki płynne):
  B0 momentum: zwrot 6 mies. (jak ranking CEM10),
  B1 składnik: średnia rang przekrojowych stabilnych cech z etapu 5b: -zmienność dzienna, -największy dzienny wzrost,
     +odsetek dni wzrostowych, +bliskość szczytu 12 mies., +sezonowość własna (brak = środek),
  M  LightGBM: cel = ranga przekrojowa zwrotu 1 mies., cechy = rangi przekrojowe wszystkich cech; uczenie na miesiącach
     do listopada roku y-1, prognoza roku y (krokowo co rok).
Portfele: równe wagi, top 10 / top 50 / górny decyl, rebalancing co miesiąc, koszty 0,1 / 0,25 / 0,5 % na stronę
(średnie obroty dzienne >= 20 mln / 5-20 mln / < 5 mln USD). Wariant: kara -30 % przy końcu serii (wycofanie).
Przedziały: bootstrap blokowy 12 mies., 2000 losowań. Ważność cech: średnie |SHAP| z modeli krokowych.
"""
import os, warnings, numpy as np, pandas as pd, lightgbm as lgb
from scipy import stats
warnings.filterwarnings('ignore')
DB = os.environ.get('RESEARCH_DB', '/home/user/ndx/db/research.duckdb')
PANEL = os.path.join(os.path.dirname(DB), 'panel_m.parquet')
WYN = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'wyniki')
SEED = 20261110; rng = np.random.default_rng(SEED); B = 2000
FEAT = ['r1m', 'r3', 'r6', 'r12', 'r12_1', 'r36_12', 'od_max12', 'od_min12', 'od_ath', 'rv1', 'rv12', 'zawezenie', 'zakres3',
        'max_d', 'up_d', 'seria_wzr', 'vol_zm', 'log_dv', 'sez_wlasna']
PAR = dict(objective='regression', learning_rate=0.03, num_leaves=31, min_child_samples=500, subsample=0.7, subsample_freq=1,
           colsample_bytree=0.8, reg_lambda=5.0, n_estimators=300, verbose=-1, random_state=SEED)

p = pd.read_parquet(PANEL); p['okres'] = pd.to_datetime(p.okres)
p = p[(p.ok == 1) & (p.okres >= '1998-01-01') & (p.okres <= '2012-12-31') & p.f1.notna() & p.r6.notna()].copy()
UNIW = os.environ.get('UNIW', 'wszystkie')   # 'duze' = 500 spółek o największych obrotach 3 mies. w danym miesiącu
if UNIW == 'duze':
    p = p[p.groupby('okres').log_dv.rank(ascending=False) <= 500].copy()
p['f1'] = p.f1.clip(lower=-1)
p['f1_kara'] = np.where(p.koniec1 == 1, (1 + p.f1) * 0.7 - 1, p.f1)
p['koszt'] = np.select([p.dv1 / 21 >= 2e7, p.dv1 / 21 >= 5e6], [0.001, 0.0025], 0.005)
R = p.groupby('okres')[FEAT].rank(pct=True)
R['sez_wlasna'] = R.sez_wlasna.fillna(0.5)
p[[f'q_{c}' for c in FEAT]] = R.to_numpy()
p['y'] = p.groupby('okres').f1.rank(pct=True)
p['s_B0'] = p.q_r6
p['s_B1'] = (1 - p.q_rv1.fillna(0.5) + 1 - p.q_max_d.fillna(0.5) + p.q_up_d.fillna(0.5) + p.q_od_max12.fillna(0.5) + p.q_sez_wlasna) / 5
p['s_M'] = np.nan
Q = [f'q_{c}' for c in FEAT]
imp = []
for y in range(2003, 2013):
    tr = p[(p.okres < f'{y-1}-12-01')]; te = p.okres.dt.year == y
    m = lgb.LGBMRegressor(**PAR).fit(tr[Q], tr.y)
    p.loc[te, 's_M'] = m.predict(p.loc[te, Q])
    imp.append(np.abs(m.predict(p.loc[te, Q].sample(min(20000, te.sum()), random_state=SEED), pred_contrib=True)[:, :-1]).mean(0))
    print('rok', y, flush=True)
o = p[p.okres >= '2003-01-01'].copy()
mies = sorted(o.okres.unique())


def portfel(score, n=None, frac=None, kol='f1'):
    """Miesięczne zwroty netto portfela równych wag z kosztami wejścia i wyjścia."""
    zw, obr, prev = [], [], set()
    koszt_prev = {}
    for t in mies:
        d = o[o.okres == t].dropna(subset=[score])
        k = n if n else max(int(len(d) * frac), 1)
        top = d.nlargest(k, score)
        cur = set(top.seria)
        kz = dict(zip(top.seria, top.koszt))
        wej = cur - prev; wyj = prev - cur
        koszt = (sum(kz[s] for s in wej) + sum(koszt_prev.get(s, 0.005) for s in wyj)) / k
        zw.append(top[kol].mean() - koszt); obr.append(len(wej) / k)
        prev, koszt_prev = cur, kz
    return pd.Series(zw, index=mies), np.mean(obr)


def miary(r):
    eq = (1 + r).cumprod()
    lat = len(r) / 12
    return dict(CAGR=eq.iloc[-1] ** (1 / lat) - 1, zmiennosc=r.std() * np.sqrt(12), Sharpe=r.mean() / r.std() * np.sqrt(12),
                maxDD=(eq / eq.cummax() - 1).min())


def blok(x, f=np.mean, b=12):
    x = np.asarray(x); n = len(x); nb = int(np.ceil(n / b))
    s = [f(np.concatenate([x[i:i + b] for i in rng.integers(0, n - b, nb)])[:n]) for _ in range(B)]
    return np.percentile(s, [2.5, 97.5])


ew = o.groupby('okres').f1.mean()
ew_k = o.groupby('okres').f1_kara.mean()
out = [f'# Etap 6: model łączący cechy vs momentum 6M i rynek (prognozy krokowe 2003-01 ... 2012-12, próba ucząca, uniwersum: {UNIW})', '',
       'Uwaga: momentum tutaj to ranking 6M w całym uniwersum z miesięczną rotacją, NIE reguły CEM10 (indeksy, filtry, wyjście SMA 10).', '',
       f'Spółek-miesięcy w ocenie: {len(o):,}; miesięcy: {len(mies)}. Rynek = równe wagi wszystkich płynnych spółek (bez kosztów).', '']
# IC
icr = []
for s in ['s_B0', 's_B1', 's_M']:
    ic = o.groupby('okres').apply(lambda v: stats.spearmanr(v[s], v.f1, nan_policy='omit')[0])
    icr.append((s, ic.mean(), ic.mean() / ic.std() * np.sqrt(len(ic)), (ic > 0).mean()))
out += ['## IC (korelacja rang prognozy i zwrotu następnego miesiąca)', '',
        pd.DataFrame(icr, columns=['ranking', 'IC', 't', 'mies. z IC > 0']).round(4).to_markdown(index=False), '']
wyn, serie = [], {}
for kol, nazwa_k in [('f1', 'bez kary'), ('f1_kara', 'kara -30 % przy wycofaniu')]:
    rynek = ew if kol == 'f1' else ew_k
    serie[('rynek', kol)] = rynek
    wyn.append(dict(wariant=nazwa_k, ranking='rynek (równe wagi)', portfel='wszystkie', **miary(rynek), obrot=np.nan))
    for s in ['s_B0', 's_B1', 's_M']:
        for nm, kw in [('top 10', dict(n=10)), ('top 50', dict(n=50)), ('górny decyl', dict(frac=0.1))]:
            r, ob = portfel(s, kol=kol, **kw)
            serie[(s, nm, kol)] = r
            wyn.append(dict(wariant=nazwa_k, ranking=s, portfel=nm, **miary(r), obrot=ob))
    print(nazwa_k, flush=True)
W = pd.DataFrame(wyn)
out += ['## Portfele netto (miesięczny rebalancing, równe wagi)', '', 'obrot = średni odsetek nowych spółek w portfelu na miesiąc.', '',
        W.round(4).to_markdown(index=False), '']
# różnice vs momentum
roz = []
for kol in ['f1', 'f1_kara']:
    for nm in ['top 10', 'top 50', 'górny decyl']:
        base = serie[('s_B0', nm, kol)]
        for s in ['s_B1', 's_M']:
            d = serie[(s, nm, kol)] - base
            lo, hi = blok(d)
            roz.append(dict(wariant=kol, portfel=nm, ranking=s, roznica_mies=d.mean(), ci95=f'{lo*100:.2f}…{hi*100:.2f} %',
                            roznica_rocznie=(1 + d.mean()) ** 12 - 1, lata_lepsze=f'{(d.groupby(d.index.year).sum() > 0).sum()}/10'))
        for s in ['s_B1', 's_M']:
            d = serie[(s, nm, kol)] - serie[('rynek', kol)]; lo, hi = blok(d)
            roz.append(dict(wariant=kol, portfel=nm, ranking=f'{s} vs rynek', roznica_mies=d.mean(), ci95=f'{lo*100:.2f}…{hi*100:.2f} %',
                            roznica_rocznie=(1 + d.mean()) ** 12 - 1, lata_lepsze=f'{(d.groupby(d.index.year).sum() > 0).sum()}/10'))
        d = base - serie[('rynek', kol)]; lo, hi = blok(d)
        roz.append(dict(wariant=kol, portfel=nm, ranking='s_B0 vs rynek', roznica_mies=d.mean(), ci95=f'{lo*100:.2f}…{hi*100:.2f} %',
                        roznica_rocznie=(1 + d.mean()) ** 12 - 1, lata_lepsze=f'{(d.groupby(d.index.year).sum() > 0).sum()}/10'))
out += ['## Różnica miesięcznego zwrotu netto względem momentum 6M (95 % bootstrap blokowy)', '', pd.DataFrame(roz).round(4).to_markdown(index=False), '']
# zwroty roczne
ann = pd.DataFrame({f'{s} {nm}': serie[(s, nm, 'f1')] for s in ['s_B0', 's_B1', 's_M'] for nm in ['top 50']})
ann['rynek'] = ew
ann = ann.groupby(ann.index.year).apply(lambda v: (1 + v).prod() - 1)
out += ['## Zwroty roczne netto (top 50, bez kary)', '', ann.round(3).reset_index(names='rok').to_markdown(index=False), '']
I = pd.Series(np.mean(imp, 0), index=FEAT).sort_values(ascending=False)
out += ['## Ważność cech w LightGBM (średnie |SHAP|, w jednostkach rangi zwrotu)', '', I.round(5).reset_index().rename(columns={'index': 'cecha', 0: 'SHAP'}).to_markdown(index=False), '']
open(os.path.join(WYN, f'r12_model_{UNIW}.md'), 'w').write('\n'.join(out))
print('\n'.join(out))
