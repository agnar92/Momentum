"""Etap 14b: Minervini Trend Template (selekcja) i VCP (wejście) - definicje i kryteria w protokole (etap 14).
Okres A: sygnały 1998-01 ... 2018-12; okres B (nietknięty do teraz): 2019-07 ... koniec danych.
"""
import os, warnings, duckdb, numpy as np, pandas as pd
warnings.filterwarnings('ignore')
DB = os.environ.get('RESEARCH_DB', '/home/user/ndx/db/research.duckdb')
MV = os.path.join(os.path.dirname(DB), 'mv.duckdb')
SRC = os.environ.get('EODHD_DB', '/home/user/ndx/db/eodhd.duckdb')
WYN = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'wyniki')
rng = np.random.default_rng(20261110); B = 2000; KOSZT = 0.001
con = duckdb.connect(MV, read_only=True); con.execute("SET threads=4; SET memory_limit='8GB'")
KONIEC = pd.Timestamp(con.execute("SELECT max(date) FROM mv").fetchone()[0])
A_OD, A_DO, B_OD = pd.Timestamp('1998-01-01'), pd.Timestamp('2018-12-31'), pd.Timestamp('2019-07-01')


def okres(d):
    return np.where((d >= A_OD) & (d <= A_DO), 'A 1998-2018', np.where(d >= B_OD, 'B 2019-2026', ''))


def vcp(c, v, t):
    """Zwraca (pivot, dołek ostatniego cofnięcia, liczba cofnięć, głębokości) albo None."""
    lo = max(t - 120, 0)
    if t - 5 - lo < 20: return None
    i_hi = lo + int(np.argmax(c[lo:t - 5]))
    if t - i_hi < 15: return None
    base = c[i_hi:t]
    piv = [(0, base[0], 'H')]; kier = -1; ext_i, ext = 0, base[0]
    for j in range(1, len(base)):
        x = base[j]
        if kier == -1:
            if x < ext: ext_i, ext = j, x
            elif x >= ext * 1.05: piv.append((ext_i, ext, 'L')); kier = 1; ext_i, ext = j, x
        else:
            if x > ext: ext_i, ext = j, x
            elif x <= ext * 0.95: piv.append((ext_i, ext, 'H')); kier = -1; ext_i, ext = j, x
    piv.append((ext_i, ext, 'L' if kier == -1 else 'H'))
    d, H, lows = [], None, []
    for i_, x, typ in piv:
        if typ == 'H': H = x
        elif H is not None: d.append(1 - x / H); lows.append(x); H = None
    if len(d) < 2 or d[0] > 0.35 or d[-1] > 0.12 or any(d[k + 1] >= d[k] for k in range(len(d) - 1)): return None
    i_lastH = max(i_ for i_, x, typ in piv if typ == 'H')
    pivot = base[i_lastH:].max() if i_lastH < len(base) else base[-1]
    if v[t - 10:t].mean() >= v[t - 50:t].mean(): return None
    return pivot, lows[-1], len(d), d


def transakcja(o, l, c, s50, dts, t, stop_px):
    """Wejście po otwarciu t+1, stop w trakcie sesji, wyjście po otwarciu dnia po zamknięciu < SMA 50."""
    if t + 1 >= len(c): return None
    e = o[t + 1]
    if not np.isfinite(e) or e <= 0: return None
    st = min(stop_px, e * 0.99)
    for d in range(t + 1, len(c)):
        if l[d] <= st:
            px = o[d] if (d > t + 1 and o[d] < st) else st
            return e, px, d, 'stop'
        if np.isfinite(s50[d]) and c[d] < s50[d]:
            if d + 1 < len(c): return e, o[d + 1], d + 1, 'sma50'
            return e, c[d], d, 'koniec'
    return e, c[-1], len(c) - 1, 'otwarta' if dts[-1] >= KONIEC - pd.Timedelta(days=7) else 'koniec_serii'


ME, TR, MK = [], [], []        # miesięczne końce, transakcje, wyceny miesięczne pozycji
for k in range(8):
    D = con.execute(f"""SELECT seria, date, o, l, c, v, uni, sma50, rp, tt, vol50 FROM mvt WHERE hash(seria) % 8 = {k} ORDER BY seria, date""").df()
    D['date'] = pd.to_datetime(D.date)
    gr = np.flatnonzero(np.r_[True, D.seria.values[1:] != D.seria.values[:-1], True])
    S = D.seria.values; DT = D.date.values; O_ = D.o.to_numpy(float); L_ = D.l.to_numpy(float); C_ = D.c.to_numpy(float); V_ = D.v.to_numpy(float)
    U = D.uni.to_numpy(); S50 = D.sma50.to_numpy(float); RP = D.rp.to_numpy(float); TT = D.tt.fillna(0).to_numpy().astype(bool); V50 = D.vol50.to_numpy(float)
    for a, b in zip(gr[:-1], gr[1:]):
        if b - a < 60: continue
        dts = pd.DatetimeIndex(DT[a:b]); c = C_[a:b]; o = O_[a:b]; l = L_[a:b]; v = V_[a:b]; s50 = S50[a:b]; tt = TT[a:b]; rp = RP[a:b]
        # końce miesięcy (H1)
        mo = dts.to_period('M'); last = np.flatnonzero(np.r_[mo[1:] != mo[:-1], True])
        for i in last:
            ME.append((S[a], dts[i], int(U[a + i]), int(tt[i]), c[i]))
        # sygnały (tylko dni z TT)
        perw = okres(dts.values)
        for t in np.flatnonzero(tt):
            if t < 60: continue
            per = perw[t]
            if not per: continue
            pierwszy = not tt[max(t - 20, 0):t].any()
            fw = tuple(c[min(t + h, len(c) - 1)] / c[t] - 1 if (t + h < len(c) or dts[-1] < KONIEC - pd.Timedelta(days=7)) else np.nan for h in (20, 60, 120, 250))
            if pierwszy and t + 1 < len(c):
                r_ = transakcja(o, l, c, s50, dts, t, o[t + 1] * 0.92)
                if r_: TR.append(('TT bez VCP', S[a], dts[t], per, rp[t]) + r_ + fw)
            if t >= 15 and c[t] > c[t - 15:t].max() and np.isfinite(V50[a + t]) and v[t] >= 1.4 * V50[a + t] and t + 1 < len(c):
                w_ = vcp(c, v, t)
                if w_ and c[t] > w_[0]:
                    r_ = transakcja(o, l, c, s50, dts, t, max(w_[1], o[t + 1] * 0.92))
                    if r_: TR.append(('TT + VCP', S[a], dts[t], per, rp[t]) + r_ + fw)
        # wyceny miesięczne (dla portfela): ceny na koniec miesięcy serii
        for i in last: MK.append((S[a], mo[i], c[i]))
    print('porcja', k, len(TR), flush=True)
T = pd.DataFrame(TR, columns=['typ', 'seria', 'sygnal', 'okres', 'rp', 'wej_px', 'wyj_px', 'wyj_i', 'powod', 'f20', 'f60', 'f120', 'f250'])
T['zwrot'] = T.wyj_px / T.wej_px * (1 - KOSZT) ** 2 - 1
ME = pd.DataFrame(ME, columns=['seria', 'date', 'uni', 'tt', 'c']); MKd = pd.DataFrame(MK, columns=['seria', 'm', 'c']).drop_duplicates(['seria', 'm'])

# --- H1: selekcja TT na koniec miesiąca ---
ME = ME.sort_values(['seria', 'date']); g = ME.groupby('seria')
for h in (1, 3, 6, 12):
    f = g.c.shift(-h) / ME.c - 1
    kon = g.date.transform('max'); ostc = g.c.transform('last')
    f = f.where(f.notna() | (kon >= KONIEC - pd.Timedelta(days=7)), ostc / ME.c - 1)
    f[ME.date + pd.DateOffset(months=h) > KONIEC] = np.nan
    ME[f'f{h}'] = f
U = ME[ME.uni == 1].copy(); U['okres'] = okres(U.date.values)


def nw_t(x, lags):
    x = np.asarray(x, float); x = x[~np.isnan(x)]; n = len(x); e = x - x.mean(); s = e @ e / n
    for q in range(1, lags + 1): s += 2 * (1 - q / (lags + 1)) * (e[q:] @ e[:-q]) / n
    return x.mean() / np.sqrt(s / n)


h1 = []
for per in ('A 1998-2018', 'B 2019-2026'):
    P = U[U.okres == per]
    for h in (1, 3, 6, 12):
        def ex(v):
            w = v[f'f{h}'].clip(v[f'f{h}'].quantile(0.01), v[f'f{h}'].quantile(0.99)); return pd.Series({'tt': (w[v.tt == 1] - w.mean()).mean(), 'n_tt': (v.tt == 1).sum(), 'n': len(v)})
        s = P.dropna(subset=[f'f{h}']).groupby('date').apply(ex)
        s = s[s.n_tt > 0]
        h1.append(dict(okres=per, H_mies=h, sr_spolek_TT=s.n_tt.mean(), udzial_TT=(s.n_tt / s.n).mean(), nadwyzka_TT_za_H=s.tt.mean(),
                       nadwyzka_rocznie=(1 + s.tt.mean()) ** (12 / h) - 1, t_NW=nw_t(s.tt.values, h), miesiecy=len(s), dodatnie=(s.tt > 0).mean()))
H1 = pd.DataFrame(h1)

# --- H2: transakcje ---
T['mies'] = T.sygnal.dt.to_period('M').astype(str)
wm = lambda x: x.clip(x.quantile(0.01), x.quantile(0.99)).mean()
h2, dif = [], []
spy = duckdb.connect(SRC, read_only=True).execute("SELECT date, adjusted_close c FROM prices_valid WHERE ticker='SPY.US' ORDER BY date").df()
spy = pd.Series(spy.c.values, index=pd.to_datetime(spy.date))
for per in ('A 1998-2018', 'B 2019-2026'):
    for typ in ('TT bez VCP', 'TT + VCP'):
        X = T[(T.okres == per) & (T.typ == typ)]
        h2.append(dict(okres=per, typ=typ, transakcji=len(X), sr_w=wm(X.zwrot), mediana=X.zwrot.median(), trafione=(X.zwrot > 0).mean(),
                       stop=(X.powod == 'stop').mean(), sr_dni=(X.wyj_i).mean() if False else np.nan,
                       udzial_10proc_najlepszych=X.zwrot.clip(lower=0).nlargest(max(len(X) // 10, 1)).sum() / max(X.zwrot.clip(lower=0).sum(), 1e-9),
                       f60_med=X.f60.median(), f250_med=X.f250.median()))
    X = T[T.okres == per]; mi = sorted(X.mies.unique()); gi = {m: X[X.mies == m] for m in mi}
    bs = []
    for _ in range(B):
        Y = pd.concat([gi[m] for m in rng.choice(mi, len(mi))])
        bs.append(wm(Y[Y.typ == 'TT + VCP'].zwrot) - wm(Y[Y.typ == 'TT bez VCP'].zwrot))
    d0 = wm(X[X.typ == 'TT + VCP'].zwrot) - wm(X[X.typ == 'TT bez VCP'].zwrot)
    dif.append(dict(okres=per, roznica_VCP_minus_TT=d0, ci95=f'{np.percentile(bs, 2.5)*100:.2f}…{np.percentile(bs, 97.5)*100:.2f} pp'))
H2 = pd.DataFrame(h2).drop(columns=['sr_dni']); DIF = pd.DataFrame(dif)

# --- portfel: maks. 10 pozycji, równe kwoty, wyceny na koniec miesiąca ---
MKd['m'] = MKd.m.astype('period[M]'); mk = MKd.set_index(['seria', 'm']).c


# daty wyjścia: odtwarzamy z indeksu sesji w serii
okr_daty = {}
for k in range(8):
    D = con.execute(f"SELECT seria, date FROM mv WHERE hash(seria) % 8 = {k} ORDER BY seria, date").df()
    for s, gdf in D.groupby('seria', sort=False):
        okr_daty[s] = pd.DatetimeIndex(gdf.date)
T['wyj_d'] = [okr_daty[s][i] for s, i in zip(T.seria, T.wyj_i)]
T['wej_d'] = [okr_daty[s][min(okr_daty[s].get_loc(d) + 1, len(okr_daty[s]) - 1)] for s, d in zip(T.seria, T.sygnal)]


def sym(typ, per, N=10):
    X = T[(T.typ == typ) & (T.okres == per)].sort_values(['wej_d', 'rp'], ascending=[True, False])
    od = X.wej_d.min().to_period('M'); do = (KONIEC.to_period('M') if per.startswith('B') else pd.Period('2019-06', 'M'))
    mies = pd.period_range(od, do, freq='M')
    got, poz, krzywa = 1.0, [], []
    wej = {m: g for m, g in X.groupby(X.wej_d.dt.to_period('M'))}
    for m in mies:
        # wyjścia w miesiącu m
        for p in [p for p in poz if p['wyj_m'] <= m]:
            got += p['k'] * p['wyj_px'] / p['wej_px'] * (1 - KOSZT) ** 2; poz.remove(p)
        # wejścia w miesiącu m (kolejność: data, RP)
        if m in wej:
            for r in wej[m].itertuples():
                if len(poz) >= N or any(p['seria'] == r.seria for p in poz): continue
                eq = got + sum(p['k'] * mk.get((p['seria'], m - 1), p['wej_px']) / p['wej_px'] for p in poz)
                k = min(eq / N, got)
                if k <= 1e-9: continue
                got -= k; poz.append(dict(seria=r.seria, k=k, wej_px=r.wej_px, wyj_px=r.wyj_px, wyj_m=r.wyj_d.to_period('M')))
        krzywa.append((m, got + sum(p['k'] * mk.get((p['seria'], m), p['wej_px']) / p['wej_px'] for p in poz)))
    return pd.Series(dict(krzywa))


def miary(e):
    r = e.pct_change().dropna(); lat = len(r) / 12
    return dict(CAGR=(e.iloc[-1] / e.iloc[0]) ** (1 / lat) - 1, maxDD=(e / e.cummax() - 1).min(), Sharpe=r.mean() / r.std() * np.sqrt(12))


pf = []
spm = spy.groupby(spy.index.to_period('M')).last()
for per in ('A 1998-2018', 'B 2019-2026'):
    for typ in ('TT bez VCP', 'TT + VCP'):
        e = sym(typ, per); pf.append(dict(okres=per, portfel=typ, od=str(e.index[0]), do=str(e.index[-1]), **miary(e)))
        sp = spm[(spm.index >= e.index[0]) & (spm.index <= e.index[-1])]
    pf.append(dict(okres=per, portfel='SPY', od=str(sp.index[0]), do=str(sp.index[-1]), **miary(sp)))
PF = pd.DataFrame(pf)
out = ['# Etap 14: Minervini Trend Template i VCP (definicje i kryteria w protokole, zapisane przed uruchomieniem)', '',
       'Okres A: sygnały 1998-2018; okres B: 2019-07 ... 2026 (otwarty po raz pierwszy). Uniwersum: płynne spółki USA, cena >= 5 USD.', '',
       '## H1: czy spółki spełniające Trend Template wypadają lepiej od rynku', '',
       'nadwyzka_TT_za_H = średni zwrot spółek z TT minus średnia wszystkich spółek uniwersum (winsoryzacja 1/99 % w miesiącu), za H miesięcy.', '',
       H1.round(4).to_markdown(index=False), '',
       '## H2: transakcje (wejście po otwarciu następnej sesji, stop w trakcie sesji, wyjście pod SMA 50, koszt 0,1 %/stronę)', '',
       H2.round(4).to_markdown(index=False), '', 'Różnica średniego zwrotu na transakcję (TT + VCP minus TT bez VCP, 95 % bootstrap blokowy po miesiącach):', '',
       DIF.round(4).to_markdown(index=False), '',
       '## Portfel: maks. 10 pozycji, równe kwoty, kolejność sygnałów wg RP', '', PF.round(4).to_markdown(index=False), '']
open(os.path.join(WYN, 'r22_minervini.md'), 'w').write('\n'.join(out))
T.drop(columns=['mies']).to_parquet(os.path.join(os.path.dirname(DB), 'mv_transakcje.parquet'))
print('\n'.join(out))
