"""Walidacja 2013-07 ... 2018-12 dwóch kandydatów zarejestrowanych w protokole (V1 spokojny trend, V2 trailing stop).
Jedno spojrzenie; parametry identyczne jak w próbie uczącej (r12_model.py, r13_wyjscie.py).
"""
import os, warnings, duckdb, numpy as np, pandas as pd
warnings.filterwarnings('ignore')
DB = os.environ.get('RESEARCH_DB', '/home/user/ndx/db/research.duckdb')
WYN = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'wyniki')
rng = np.random.default_rng(20261110); B = 2000
KON = pd.Timestamp('2018-12-31')


def blok(x, b=12):
    x = np.asarray(x); n = len(x); nb = int(np.ceil(n / b))
    return np.percentile([np.concatenate([x[i:i + b] for i in rng.integers(0, n - b, nb)])[:n].mean() for _ in range(B)], [2.5, 97.5])


def miary(r, okr=12):
    eq = (1 + r).cumprod(); lat = len(r) / okr
    return dict(CAGR=eq.iloc[-1] ** (1 / lat) - 1, zmiennosc=r.std() * np.sqrt(okr), Sharpe=r.mean() / r.std() * np.sqrt(okr),
                maxDD=(eq / eq.cummax() - 1).min())


# ---------- V1 ----------
p = pd.read_parquet(os.path.join(os.path.dirname(DB), 'panel_m.parquet')); p['okres'] = pd.to_datetime(p.okres)
p = p[(p.ok == 1) & (p.okres >= '2013-07-01') & (p.okres <= '2018-11-30') & p.f1.notna() & p.r6.notna()].copy()
p = p[p.groupby('okres').log_dv.rank(ascending=False) <= 500].copy()
p['f1'] = p.f1.clip(lower=-1)
p['koszt'] = np.select([p.dv1 / 21 >= 2e7, p.dv1 / 21 >= 5e6], [0.001, 0.0025], 0.005)
R = p.groupby('okres')[['rv1', 'max_d', 'up_d', 'od_max12', 'sez_wlasna']].rank(pct=True)
p['s_B1'] = (1 - R.rv1.fillna(0.5) + 1 - R.max_d.fillna(0.5) + R.up_d.fillna(0.5) + R.od_max12.fillna(0.5) + R.sez_wlasna.fillna(0.5)) / 5
mies = sorted(p.okres.unique())
ew = p.groupby('okres').f1.mean()


def portfel(n):
    zw, prev, kp = [], set(), {}
    for t in mies:
        d = p[p.okres == t]; top = d.nlargest(n, 's_B1'); cur = set(top.seria); kz = dict(zip(top.seria, top.koszt))
        koszt = (sum(kz[s] for s in cur - prev) + sum(kp.get(s, 0.005) for s in prev - cur)) / n
        zw.append(top.f1.mean() - koszt); prev, kp = cur, kz
    return pd.Series(zw, index=mies)


rows = [dict(portfel='odniesienie: równe wagi 500 największych', **miary(ew))]
_e = duckdb.connect(os.environ.get('EODHD_DB', '/home/user/ndx/db/eodhd.duckdb'), read_only=True)
for _t in ('SPY.US', 'RSP.US'):  # odniesienia opisowe (ETF, bez kosztów)
    _d = _e.execute(f"SELECT date_trunc('month', date) m, arg_max(adjusted_close, date) c FROM prices_valid WHERE ticker='{_t}' AND date BETWEEN '2013-06-01' AND '2018-12-31' GROUP BY 1 ORDER BY 1").df()
    _r = _d.set_index(pd.to_datetime(_d.m)).c.pct_change().shift(-1).reindex(mies)
    rows.append(dict(portfel=f'{_t[:3]} (opisowo)', **miary(_r.dropna())))
ser = {}
for n in (10, 50):
    r = portfel(n); ser[n] = r; d = r - ew; lo, hi = blok(d)
    rows.append(dict(portfel=f'spokojny trend top {n}', **miary(r), roznica_mies=d.mean(), ci95_lo=lo, ci95_hi=hi))
V1 = pd.DataFrame(rows)
v_ratio = ser[50].std() / ew.std()
lo50 = V1.loc[V1.portfel == 'spokojny trend top 50', 'ci95_lo'].iloc[0]
v1_ok = (v_ratio <= 0.70) and (lo50 >= -0.0025)
roczne = pd.DataFrame({'odniesienie': ew, 'top 10': ser[10], 'top 50': ser[50]})
roczne = roczne.groupby(pd.DatetimeIndex(roczne.index).year).apply(lambda v: (1 + v).prod() - 1)

# ---------- V2 ----------
con = duckdb.connect(DB, read_only=True)
z = con.execute("SELECT seria, okres FROM zdarzenia WHERE okres BETWEEN '2013-07-01' AND '2017-06-30'").df(); z['okres'] = pd.to_datetime(z.okres)
w = con.execute("""SELECT seria, okres, c, dv FROM w WHERE seria IN (SELECT DISTINCT seria FROM zdarzenia WHERE okres BETWEEN '2013-07-01' AND '2017-06-30')
                   AND okres <= '2018-12-31' ORDER BY seria, okres""").df(); w['okres'] = pd.to_datetime(w.okres)
REG = ['czas 52', 'trailing 25', 'stop 15 + trailing 25']


def wyjscie(c, i0, regula, hmax=130):
    kon = min(len(c) - 1, i0 + hmax); p0 = c[i0]; mx = p0
    for j in range(i0 + 1, kon + 1):
        mx = max(mx, c[j])
        if regula == 'czas 52' and j - i0 >= 52: return j
        if regula == 'trailing 25' and c[j] <= mx * 0.75: return j
        if regula == 'stop 15 + trailing 25' and (c[j] <= p0 * 0.85 or c[j] <= mx * 0.75): return j
    return kon


zs = {s: g for s, g in z.groupby('seria')}
rows2 = []
for s, g in w.groupby('seria', sort=False):
    if s not in zs: continue
    c = g.c.to_numpy(float); ok = g.okres.to_numpy(); dvd = g.dv.to_numpy(float) / 5
    pos = {t: i for i, t in enumerate(ok)}
    for t in zs[s].okres.to_numpy():
        i0 = pos.get(t)
        if i0 is None: continue
        kin = 0.001 if dvd[i0] >= 2e7 else (0.0025 if dvd[i0] >= 5e6 else 0.005)
        for r in REG:
            j = wyjscie(c, i0, r)
            if j <= i0: continue
            kout = 0.001 if dvd[j] >= 2e7 else (0.0025 if dvd[j] >= 5e6 else 0.005)
            rows2.append((s, t, r, c[j] / c[i0] * (1 - kin) * (1 - kout) - 1, j - i0))
T = pd.DataFrame(rows2, columns=['seria', 'okres', 'regula', 'zw', 'tyg'])
piv_z = T.pivot_table(index=['seria', 'okres'], columns='regula', values='zw')[REG]
piv_t = T.pivot_table(index=['seria', 'okres'], columns='regula', values='tyg')[REG]
piv_z = piv_z.clip(piv_z.quantile(0.01), piv_z.quantile(0.99), axis=1)
mm = pd.to_datetime(piv_z.index.get_level_values(1)).to_period('M').astype(str)
idx = list(pd.Series(range(len(mm))).groupby(mm.to_numpy()).indices.values())
Z, TT = piv_z.to_numpy(), piv_t.to_numpy()
tempo = lambda ii: np.nanmean(Z[ii], 0) / np.nanmean(TT[ii], 0)
t0 = tempo(slice(None))
bs = np.array([tempo(np.concatenate([idx[i] for i in rng.integers(0, len(idx), len(idx))])) for _ in range(B)])
S2 = pd.DataFrame({'regula': REG, 'wejsc': len(piv_z), 'sr_zwrot_w': np.nanmean(Z, 0), 'mediana': np.nanmedian(piv_z.to_numpy(), 0),
                   'sr_tyg': np.nanmean(TT, 0), 'zwrot_na_tydz_%': t0 * 100})
S2['roznica_vs_czas52_pp'] = (t0 - t0[0]) * 100
S2['ci95'] = ['' if k == 0 else f'{np.percentile(bs[:, k]-bs[:, 0], 2.5)*100:.3f}…{np.percentile(bs[:, k]-bs[:, 0], 97.5)*100:.3f}' for k in range(3)]
v2_ok = np.percentile(bs[:, 1] - bs[:, 0], 2.5) > 0

out = ['# Walidacja 2013-07 ... 2018-12 (jedno spojrzenie, kryteria z protokołu)', '',
       '## V1: spokojny trend (500 największych, rebalancing co miesiąc, netto)', '', V1.round(4).to_markdown(index=False), '',
       f'Zmienność top 50 / zmienność odniesienia = {v_ratio:.2f} (kryterium <= 0,70); dolna granica różnicy = {lo50*100:.2f} pp/mies. '
       f'(kryterium >= -0,25). **V1 {"PRZESZEDŁ" if v1_ok else "NIE PRZESZEDŁ"} walidacji.**', '',
       'Zwroty roczne:', '', roczne.round(3).reset_index(names='rok').to_markdown(index=False), '',
       '## V2: trailing stop po świeżym wybiciu (wejścia 2013-07 ... 2017-06)', '', S2.round(4).to_markdown(index=False), '',
       f'**V2 {"PRZESZEDŁ" if v2_ok else "NIE PRZESZEDŁ"} walidacji** (trailing 25 vs czas 52, dolna granica 95 % > 0).', '']
open(os.path.join(WYN, 'r16_walidacja.md'), 'w').write('\n'.join(out))
print('\n'.join(out))
