"""Etap 13: warianty CEM10 łapiące wcześniej / oddające mniej (lista i kryteria zarejestrowane w protokole przed uruchomieniem).
Skład S&P 500 point-in-time (jak w r19_cem10.py), 10 pozycji, równe kwoty, bez rebalancingu, koszt 0,1 % na stronę.
Warianty miesięczne M0-M6 i tygodniowe W1-W2 (filtr rynku w tygodniowych: SPY pod SMA 52 tyg. = odpowiednik SMA 12 mies.).
"""
import os, warnings, duckdb, numpy as np, pandas as pd
warnings.filterwarnings('ignore')
_src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'r19_cem10.py')).read().split('warianty = {')[0]
exec(_src)                     # składy, C, S10, SP, spy_bear, etf, blok, miary (wspólne z r19)
WYN = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'wyniki')
KOSZT = 0.001; N = 10
R3 = C / C.shift(3) - 1; R6m = C / C.shift(6) - 1
POD = (C < S10).astype(float).where(S10.notna())
POD3 = POD.shift(1).rolling(3).sum()                 # ile z 3 poprzednich miesięcy było pod SMA 10


def sim(daty, sklad_f, ok_f, score_f, wyjdz_f, bear_f, CC):
    poz, got, wart, tr = {}, 1.0, [], []
    for i, t in enumerate(daty[:-1]):
        nx = daty[i + 1]
        for s in list(poz):
            c = CC.at[t, s]
            if np.isnan(c) or wyjdz_f(t, s, poz[s]):
                v = poz[s]['v'] * (1 - KOSZT); got += v
                tr.append(dict(seria=s, wej=poz[s]['wej'], wyj=t, cw=poz[s]['cw'], cx=c if np.isfinite(c) else poz[s]['cl'], zwrot=v / poz[s]['k0'] - 1)); del poz[s]
        sk = sklad_f(t)
        if sk and not bear_f(t) and len(poz) < N:
            kand = [s for s in sk if s not in poz and s in CC.columns and ok_f(t, s)]
            kand = sorted(kand, key=lambda s: -score_f(t, s))[:N - len(poz)]
            eq = got + sum(x['v'] for x in poz.values())
            for s in kand:
                k = min(eq / N, got)
                if k <= 1e-9: break
                got -= k; c = CC.at[t, s]; poz[s] = dict(v=k * (1 - KOSZT), k0=k, wej=t, cw=c, cl=c, mx=c)
        for s in list(poz):
            c0, c1 = CC.at[t, s], CC.at[nx, s]
            if np.isnan(c1):
                v = poz[s]['v'] * (1 - KOSZT); got += v
                tr.append(dict(seria=s, wej=poz[s]['wej'], wyj=t, cw=poz[s]['cw'], cx=c0, zwrot=v / poz[s]['k0'] - 1)); del poz[s]
            else:
                poz[s]['v'] *= c1 / c0; poz[s]['cl'] = c1; poz[s]['mx'] = max(poz[s]['mx'], c1)
        wart.append((nx, got + sum(x['v'] for x in poz.values())))
    return pd.Series(dict(wart)), pd.DataFrame(tr)


mies = [m for m in C.index if pd.Period('1998-01', 'M') <= m <= pd.Period('2026-09', 'M')]
spf = lambda m: SP.get(m)
bear_m = lambda m: bool(spy_bear.get(m, False))
f = lambda X, t, s: X.at[t, s]
base_ok = lambda t, s: C.at[t, s] > S10.at[t, s] and R6m.at[t, s] > 0.30
sma_exit = lambda t, s, p: C.at[t, s] < S10.at[t, s]
WAR = {
    'M0 baza CEM10': (base_ok, lambda t, s: R6m.at[t, s], sma_exit),
    'M1 6M > 15 %': (lambda t, s: C.at[t, s] > S10.at[t, s] and R6m.at[t, s] > 0.15, lambda t, s: R6m.at[t, s], sma_exit),
    'M2 3M > 15 %, ranking 3M': (lambda t, s: C.at[t, s] > S10.at[t, s] and R3.at[t, s] > 0.15, lambda t, s: R3.at[t, s], sma_exit),
    'M3 6M 15-60 %': (lambda t, s: C.at[t, s] > S10.at[t, s] and 0.15 < R6m.at[t, s] < 0.60, lambda t, s: R6m.at[t, s], sma_exit),
    'M4 początek trendu': (lambda t, s: C.at[t, s] > S10.at[t, s] and POD3.at[t, s] >= 3 and R3.at[t, s] > 0, lambda t, s: R6m.at[t, s], sma_exit),
    'M5 baza, trailing -20 %': (base_ok, lambda t, s: R6m.at[t, s], lambda t, s, p: C.at[t, s] < p['mx'] * 0.80),
    'M6 baza, SMA 10 lub trailing -25 %': (base_ok, lambda t, s: R6m.at[t, s], lambda t, s, p: C.at[t, s] < S10.at[t, s] or C.at[t, s] < p['mx'] * 0.75),
}
wyniki, krzywe, trans = {}, {}, {}
for nm, (ok_, sc_, ex_) in WAR.items():
    e, T = sim(mies, spf, ok_, sc_, ex_, bear_m, C)
    krzywe[nm] = e; T['wej_d'] = [m.to_timestamp(how='end').normalize() for m in T.wej]; T['wyj_d'] = [m.to_timestamp(how='end').normalize() for m in T.wyj]
    trans[nm] = T; print(nm, flush=True)

# tygodniowe
con = duckdb.connect(DB, read_only=True)
ser_sp = sorted(set().union(*SP.values()))
w = con.execute(f"SELECT seria, okres, c FROM w WHERE seria IN (SELECT unnest(?::VARCHAR[])) AND okres >= '1996-01-01'", [ser_sp]).df()
w['okres'] = pd.to_datetime(w.okres)
CW = w.pivot_table(index='okres', columns='seria', values='c')
S40 = CW.rolling(40, min_periods=40).mean(); R26 = CW / CW.shift(26) - 1; R13 = CW / CW.shift(13) - 1
sw = duckdb.connect(SRC, read_only=True).execute("SELECT date_trunc('week', date)::DATE o, arg_max(adjusted_close, date) c FROM prices_valid WHERE ticker='SPY.US' GROUP BY 1 ORDER BY 1").df()
spyw = pd.Series(sw.c.values, index=pd.to_datetime(sw.o)); spy_bear_w = (spyw < spyw.rolling(52).mean()).reindex(CW.index).fillna(False)
tyg = [t for t in CW.index if pd.Timestamp('1998-01-01') <= t <= pd.Timestamp('2026-09-30')]
spw = lambda t: SP.get(pd.Period(t, 'M'))
bear_w = lambda t: bool(spy_bear_w.get(t, False))
WARW = {
    'W1 tygodniowy CEM10': (lambda t, s: CW.at[t, s] > S40.at[t, s] and R26.at[t, s] > 0.30, lambda t, s: R26.at[t, s], lambda t, s, p: CW.at[t, s] < S40.at[t, s]),
    'W2 tygodniowy wczesny': (lambda t, s: CW.at[t, s] > S40.at[t, s] and R13.at[t, s] > 0.15, lambda t, s: R13.at[t, s], lambda t, s, p: CW.at[t, s] < S40.at[t, s]),
}
for nm, (ok_, sc_, ex_) in WARW.items():
    e, T = sim(tyg, spw, ok_, sc_, ex_, bear_w, CW)
    e.index = pd.DatetimeIndex(e.index).to_period('M'); e = e.groupby(level=0).last()
    krzywe[nm] = e; T['wej_d'] = pd.to_datetime(T.wej); T['wyj_d'] = pd.to_datetime(T.wyj); trans[nm] = T; print(nm, flush=True)

# faza wejścia i część złapanego ruchu (ruchy zygzaka 25 %, ceny tygodniowe)
ru = con.execute("SELECT ticker AS seria, t0, t1, p0, p1, zmiana FROM ruchy WHERE y = 0.25 AND kier = 1 AND status <> 'trwa'").df()
ru['t0'] = pd.to_datetime(ru.t0); ru['t1'] = pd.to_datetime(ru.t1)
ru = ru[ru.seria.isin(ser_sp)]
rg = {s: g for s, g in ru.groupby('seria')}


def cena(s, d):
    col = CW[s].dropna() if s in CW.columns else None
    if col is None or not len(col): return np.nan
    i = col.index.searchsorted(d, side='right') - 1
    return col.iloc[max(i, 0)]


duze = ru[(ru.zmiana >= 1) & (ru.t0 >= '1998-01-01') & (ru.t0 <= '2025-06-30')]
duze = duze[[s in SP.get(pd.Period(t, 'M'), set()) for s, t in zip(duze.seria, duze.t0)]]
tab = []
for nm, e in krzywe.items():
    T = trans[nm]
    faza = []
    for t in T.itertuples():
        g = rg.get(t.seria); fz = np.nan
        if g is not None:
            h = g[(g.t0 <= t.wej_d) & (g.t1 >= t.wej_d)]
            if len(h) and np.isfinite(t.cw): r0 = h.iloc[0]; fz = np.log(t.cw / r0.p0) / np.log(r0.p1 / r0.p0)
        faza.append(fz)
    tg = {s: g for s, g in T.groupby('seria')}
    zl, cz = [], []
    for r in duze.itertuples():
        g = tg.get(r.seria); c_ = 0.0
        if g is not None:
            for t in g[(g.wej_d <= r.t1) & (g.wyj_d >= r.t0)].itertuples():
                a_, b_ = cena(r.seria, max(t.wej_d, r.t0)), cena(r.seria, min(t.wyj_d, r.t1))
                if np.isfinite(a_) and np.isfinite(b_) and b_ > a_: c_ += np.log(b_ / a_) / np.log(r.p1 / r.p0)
        zl.append(c_ > 0); cz.append(min(c_, 1))
    zl, cz = np.array(zl), np.array(cz)
    r = e.pct_change().dropna(); m0 = krzywe['M0 baza CEM10'].pct_change().dropna()
    d = (r - m0.reindex(r.index)).dropna(); lo, hi = blok(d)
    h1 = r[r.index <= pd.Period('2012-12', 'M')]; h2 = r[r.index >= pd.Period('2013-01', 'M')]
    oddane = (np.nan if 'mx' not in T else np.nan)
    tab.append(dict(wariant=nm, CAGR=miary(e)['CAGR'], CAGR_98_12=(1 + h1).prod() ** (12 / len(h1)) - 1, CAGR_13_26=(1 + h2).prod() ** (12 / len(h2)) - 1,
                    maxDD=miary(e)['maxDD'], transakcji=len(T), trafione=(T.zwrot > 0).mean(), mediana_transakcji=T.zwrot.median(),
                    faza_wejscia_med=np.nanmedian(faza), zlapane_duze=zl.mean(), czesc_gdy_zlapany=cz[zl].mean() if zl.any() else np.nan,
                    roznica_vs_M0_mies=d.mean(), ci95=f'{lo*100:.2f}…{hi*100:.2f} %'))
Tb = pd.DataFrame(tab)
m0 = Tb.iloc[0]
Tb['lepszy'] = [(r.faza_wejscia_med < m0.faza_wejscia_med or r.czesc_gdy_zlapany > m0.czesc_gdy_zlapany) and r.CAGR_98_12 > m0.CAGR_98_12
                and r.CAGR_13_26 > m0.CAGR_13_26 and float(r.ci95.split('…')[0]) > 0 if i > 0 else False for i, r in Tb.iterrows()]
out = ['# Etap 13: warianty CEM10 łapiące wcześniej / oddające mniej (S&P 500 point-in-time, 1998-2026)', '',
       'Lista wariantów i kryteria zapisane w protokole przed uruchomieniem. faza_wejscia_med = mediana części ruchu zygzaka (log) już za nami '
       'przy wejściu; zlapane_duze = odsetek wzrostów >= +100 % członków S&P 500 (dołek 1998-2025) choć częściowo trzymanych; '
       'czesc_gdy_zlapany = średnia część takiego ruchu (log) objęta trzymaniem.', '',
       Tb.round(4).to_markdown(index=False), '',
       f'Odniesienia: SPY 1998-2026 CAGR {miary(etf["SPY"][(etf["SPY"].index >= pd.Period("1998-01", "M")) & (etf["SPY"].index <= pd.Period("2026-09", "M"))])["CAGR"]:.4f}.', '']
open(os.path.join(WYN, 'r20_cem10_warianty.md'), 'w').write('\n'.join(out))
print('\n'.join(out))
