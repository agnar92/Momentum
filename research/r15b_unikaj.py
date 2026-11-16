"""Etap 6b-b: strategia "rynek bez przegranych" z prognoz modelu surowego (r15_uczenie.py). Próba ucząca 2003-2012.
Co 4 tygodnie: równe wagi wszystkich płynnych spółek z wyjątkiem dolnych 10 / 20 / 30 % prognozy modelu H (26 lub 52 tyg.).
Koszty 0,1/0,25/0,5 % na stronę tylko od zmian składu; rynek bez kosztów (odniesienie). Bootstrap blokowy 13 okresów.
"""
import os, numpy as np, pandas as pd
DB = os.environ.get('RESEARCH_DB', '/home/user/ndx/db/research.duckdb')
WYN = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'wyniki')
rng = np.random.default_rng(20261110)
P = pd.read_parquet(os.path.join(os.path.dirname(DB), 'panel_surowy.parquet'), columns=['seria', 'okres', 'f4w', 'ldv'])
pr = pd.read_parquet(os.path.join(os.path.dirname(DB), 'prognozy_surowe.parquet'))
O = P.merge(pr, on=['seria', 'okres'])
O = O[(O.okres >= '2003-01-01') & (O.okres <= '2012-12-31') & O.f4w.notna()].copy()
O['f4w'] = O.f4w.clip(lower=-1)
O['koszt'] = np.select([np.exp(O.ldv) / 5 >= 2e7, np.exp(O.ldv) / 5 >= 5e6], [0.001, 0.0025], 0.005)
daty = sorted(O.okres.unique()); ew = O.groupby('okres').f4w.mean()

def blok(x, b=13):
    x = np.asarray(x); n = len(x); nb = int(np.ceil(n / b))
    s = [np.concatenate([x[i:i + b] for i in rng.integers(0, n - b, nb)])[:n].mean() for _ in range(2000)]
    return np.percentile(s, [2.5, 97.5])

rows, roczne = [], {'rynek': ew}
for h in (26, 52, 13):
    for odc in (0.1, 0.2, 0.3):
        zw, prev, kp = [], set(), {}
        for t in daty:
            d = O[O.okres == t]; keep = d[d[f'p{h}'].rank(pct=True) > odc]
            cur = set(keep.seria); kz = dict(zip(keep.seria, keep.koszt)); n = len(keep)
            koszt = (sum(kz[s] for s in cur - prev) + sum(kp.get(s, 0.005) for s in prev - cur)) / n
            zw.append(keep.f4w.mean() - koszt); prev, kp = cur, kz
        r = pd.Series(zw, index=daty); d = r - ew; lo, hi = blok(d)
        eq = (1 + r).cumprod(); lat = len(r) * 4 / 52
        rows.append(dict(model_H=h, odciete=odc, CAGR=eq.iloc[-1] ** (1 / lat) - 1, zmiennosc=r.std() * np.sqrt(13),
                         maxDD=(eq / eq.cummax() - 1).min(), nadwyzka_na_4tyg=d.mean(), ci95=f'{lo*100:.2f}…{hi*100:.2f} %',
                         nadwyzka_rocznie=(1 + d.mean()) ** 13 - 1, lata_lepsze=f"{(d.groupby(pd.DatetimeIndex(d.index).year).sum() > 0).sum()}/10"))
        if odc == 0.2: roczne[f'bez dolnych 20 % (H={h})'] = r
eqm = (1 + ew).cumprod()
rows.insert(0, dict(model_H='-', odciete=0, CAGR=eqm.iloc[-1] ** (1 / (len(ew) * 4 / 52)) - 1, zmiennosc=ew.std() * np.sqrt(13),
                    maxDD=(eqm / eqm.cummax() - 1).min(), nadwyzka_na_4tyg=0, ci95='', nadwyzka_rocznie=0, lata_lepsze=''))
R = pd.DataFrame(roczne); R = R.groupby(pd.DatetimeIndex(R.index).year).apply(lambda v: (1 + v).prod() - 1)
out = ['# Etap 6b-b: rynek bez spółek, które model ocenia najgorzej (2003-2012, próba ucząca, netto kosztów)', '',
       pd.DataFrame(rows).round(4).to_markdown(index=False), '', 'Zwroty roczne:', '', R.round(3).reset_index(names='rok').to_markdown(index=False), '']
open(os.path.join(WYN, 'r15b_unikaj.md'), 'w').write('\n'.join(out)); print('\n'.join(out))
