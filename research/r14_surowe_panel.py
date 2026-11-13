"""Etap 6b-a: panel surowych danych do uczenia bez gotowych wskaźników (Parquet poza repo).

Daty decyzji: co 4 tygodnie (numer tygodnia w kalendarzu danych % 4 == 0), spółki płynne w tygodniu decyzji,
>= 60 tygodni historii serii. Wejścia (tylko przeszłość, do zamknięcia tygodnia decyzji):
  w1..w52  = tygodniowe log-zwroty z ostatnich 52 tygodni (w1 = ostatni tydzień),
  b1..b26  = 4-tygodniowe log-zwroty z tygodni 53..156 wstecz (b1 = tygodnie 53-56; brak historii = NaN),
  v1..v13  = log((wolumen średni z 4 tyg. + 1) / (średni z 52 tyg. + 1)) w 13 blokach (v1 = ostatnie 4 tygodnie),
  rvd, maxd = zmienność dzienna i największy dzienny zwrot w POPRZEDNIM pełnym miesiącu, ldv = log obrotów 13 tyg.,
  m1..m13  = 4-tygodniowe log-zwroty indeksu równoważonego (rynek), spy_sma = SPY / SMA 40 tyg. - 1.
Cele: f1w, f4w, f13w, f26w, f52w = zwrot serii za H tygodni (koniec serii przed końcem danych = ostatnia cena).
"""
import os, time, duckdb, numpy as np, pandas as pd
DB = os.environ.get('RESEARCH_DB', '/home/user/ndx/db/research.duckdb')
OUT = os.path.join(os.path.dirname(DB), 'panel_surowy.parquet')
H = (1, 4, 13, 26, 52)
t0 = time.time()
con = duckdb.connect(DB, read_only=True)
con.execute(f"SET threads=4; SET memory_limit='8GB'; SET temp_directory='{os.path.dirname(DB)}/duckdb_tmp'")
tyg = con.execute("SELECT DISTINCT okres FROM w ORDER BY 1").df().okres
tyg = pd.to_datetime(tyg)
decyzja = set(tyg[np.arange(len(tyg)) % 4 == 0])
rw = con.execute("SELECT okres, ew_r, spy FROM rynek_w ORDER BY okres").df()
rw['okres'] = pd.to_datetime(rw.okres)
rw['lidx'] = np.log1p(rw.ew_r.fillna(0)).cumsum()
rw['spy_sma'] = rw.spy / rw.spy.rolling(40, min_periods=40).mean() - 1
for k in range(1, 14):
    rw[f'm{k}'] = rw.lidx.shift(4 * (k - 1)) - rw.lidx.shift(4 * k)
rw = rw[['okres', 'spy_sma'] + [f'm{k}' for k in range(1, 14)]]
dm = con.execute("""SELECT ticker, date_trunc('month', date)::DATE mies, stddev(r_adj) rvd, max(r_adj) maxd FROM dc GROUP BY 1, 2""").df()
dm['mies'] = pd.to_datetime(dm.mies)
print('rynek, dm', f'{time.time()-t0:.0f} s', flush=True)
w = con.execute("SELECT seria, ticker, okres, c, vol, dv, ok FROM w WHERE c > 0 ORDER BY seria, okres").df()
w['okres'] = pd.to_datetime(w.okres)
maxo = w.okres.max()
print('w', len(w), f'{time.time()-t0:.0f} s', flush=True)
gr = np.flatnonzero(np.r_[True, w.seria.values[1:] != w.seria.values[:-1], True])
C = w.c.to_numpy(float); V = w.vol.to_numpy(float); D = w.dv.to_numpy(float); OK = w.ok.to_numpy()
O = w.okres.to_numpy(); S = w.seria.to_numpy(); T = w.ticker.to_numpy()
jest_dec = w.okres.isin(decyzja).to_numpy()
wiersze, meta = [], []
for a, b in zip(gr[:-1], gr[1:]):
    n = b - a
    if n < 61: continue
    lc = np.log(C[a:b]); r = np.r_[np.nan, np.diff(lc)]
    v = V[a:b]; dv = D[a:b]
    koniec_serii = pd.Timestamp(O[b - 1]) < maxo
    for i in np.flatnonzero(jest_dec[a:b] & (OK[a:b] == 1)):
        if i < 60: continue
        wk = r[i - 51:i + 1][::-1]                                           # w1..w52
        bb = np.full(26, np.nan)
        for k in range(26):
            hi, lo = i - 52 - 4 * k, i - 56 - 4 * k
            if lo >= 0: bb[k] = lc[hi] - lc[lo]
        v52 = v[i - 51:i + 1].mean()
        vv = np.array([np.log((v[i - 4 * k - 3:i - 4 * k + 1].mean() + 1) / (v52 + 1)) for k in range(13)])
        ff = []
        for h in H:
            if i + h < n: ff.append(C[a + i + h] / C[a + i] - 1)
            elif koniec_serii: ff.append(C[b - 1] / C[a + i] - 1)
            else: ff.append(np.nan)
        wiersze.append(np.r_[wk, bb, vv, np.log1p(dv[i - 12:i + 1].mean()), ff].astype(np.float32))
        meta.append((S[a], T[a], O[a + i]))
print('wiersze', len(wiersze), f'{time.time()-t0:.0f} s', flush=True)
kol = [f'w{k}' for k in range(1, 53)] + [f'b{k}' for k in range(1, 27)] + [f'v{k}' for k in range(1, 14)] + ['ldv'] + [f'f{h}w' for h in H]
P = pd.DataFrame(np.vstack(wiersze), columns=kol)
P[['seria', 'ticker', 'okres']] = pd.DataFrame(meta, columns=['seria', 'ticker', 'okres'])
P['mies_poprz'] = P.okres.dt.to_period('M').dt.to_timestamp() - pd.DateOffset(months=1)
P = P.merge(dm.rename(columns={'mies': 'mies_poprz'}), on=['ticker', 'mies_poprz'], how='left').drop(columns='mies_poprz')
P = P.merge(rw, on='okres', how='left')
P.to_parquet(OUT)
print('panel', P.shape, P.okres.min(), P.okres.max(), f'{time.time()-t0:.0f} s')
