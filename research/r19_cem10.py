"""Etap 12: CEM10 na oczyszczonych danych badania i w świetle anatomii wzrostów (etap 11).

Reguły (jak w cem10.py / CLAUDE.md): co miesiąc kandydaci ze składu indeksu w danym miesiącu (point-in-time):
zwrot 6 mies. > +30 % i zamknięcie miesiąca > SMA 10 mies.; ranking po zwrocie 6 mies.; wolne miejsca (N = 10)
uzupełniane najwyżej ocenionymi, brak zakupów, gdy SPY zamyka miesiąc pod SMA 12; wyjście: zamknięcie miesiąca
pod SMA 10 (członkostwo w indeksie nie jest warunkiem wyjścia); koniec serii = sprzedaż po ostatniej cenie.
Równe kwoty przy wejściu, bez rebalancingu, koszt 0,1 % na stronę. Stop -40 % w trakcie miesiąca pominięty
(dane miesięczne; wg notatek wpływ ok. -0,3 pp rocznie).
Warianty: S&P 500 (od 1998), NDX (od 2008), lider (SPY vs QQQ wg zwrotu 5 mies., od 2008).
Uwaga: CEM10 był już testowany na latach 1997-2026 (dobór parametrów), więc żaden okres nie jest dla niego niezależny.
"""
import os, warnings, duckdb, numpy as np, pandas as pd
warnings.filterwarnings('ignore')
DB = os.environ.get('RESEARCH_DB', '/home/user/ndx/db/research.duckdb')
SRC = os.environ.get('EODHD_DB', '/home/user/ndx/db/eodhd.duckdb')
SKL = os.environ.get('SKLADY', '/home/user/eodhd-data')
WYN = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'wyniki')
rng = np.random.default_rng(20261110); B = 2000

p = pd.read_parquet(os.path.join(os.path.dirname(DB), 'panel_m.parquet'), columns=['ticker', 'seria', 'okres', 'c', 'r6', 'dv1'])
p['okres'] = pd.to_datetime(p.okres)
p = p.sort_values(['seria', 'okres'])
p['sma10'] = p.groupby('seria').c.transform(lambda s: s.rolling(10, min_periods=10).mean())
p['kod'] = p.ticker.str.replace('.US', '', regex=False)
p['kod0'] = p.kod.str.replace(r'_old\d*$', '', regex=True)          # FB_old -> FB (spółka sprzed ponownego użycia tickera)
mies = pd.period_range('1997-01', '2026-10', freq='M')

# składy point-in-time
sp = pd.read_csv(os.path.join(SKL, 'sp500_pit_source.csv'), parse_dates=['date']).sort_values('date')
sp_m = {}
for m in mies:
    r = sp[sp.date <= m.to_timestamp(how='end')]
    if len(r): sp_m[m] = set(t.replace('.', '-') for t in r.iloc[-1].tickers.split(','))
nd = pd.read_csv(os.path.join(SKL, 'ndx_czlonkostwo.csv'), parse_dates=['start_date', 'end_date'])
nd_m = {m: set(nd[(nd.start_date <= m.to_timestamp(how='end')) & (nd.end_date.isna() | (nd.end_date >= m.to_timestamp(how='end')))].ticker) for m in mies}
nd_m = {m: s for m, s in nd_m.items() if m >= pd.Period('2007-01', 'M')}

# dopasowanie tickera indeksu do serii w danym miesiącu (kod lub kod bez _old; przy kilku: większe obroty)
p['m'] = p.okres.dt.to_period('M')
idx_kod = p.groupby(['m', 'kod0'])
# członek indeksu musi mieć realną wielkość (cena >= 5 USD, obroty >= 50 mln USD w miesiącu): inaczej ticker wskazuje
# inną spółkę (ponowne użycie tickera, np. CBE.US w 2003 = spółka groszowa, nie Cooper Industries) albo szereg śmieciowy
pk = p[(p.c > 0) & (p.dv1 >= 5e7)]
pk = pk[pk.seria.isin(p.loc[(p.dv1 >= 5e7), 'seria'])]
best = pk.loc[pk.groupby(['m', 'kod0']).dv1.idxmax().dropna()]
best_map = {(m, k): s for m, k, s in zip(best.m, best.kod0, best.seria)}


def czlonkowie(sklad):
    out, cov = {}, {}
    for m, ts in sklad.items():
        ss = {best_map[(m, t)] for t in ts if (m, t) in best_map}
        out[m] = ss; cov[m] = len(ss) / max(len(ts), 1)
    return out, pd.Series(cov)


SP, cov_sp = czlonkowie(sp_m)
ND, cov_nd = czlonkowie(nd_m)
print('pokrycie S&P', cov_sp.groupby(cov_sp.index.year).mean().round(2).to_dict(), flush=True)

# rynek: SPY, QQQ, RSP miesięcznie
e = duckdb.connect(SRC, read_only=True)
etf = {}
for t in ('SPY.US', 'QQQ.US', 'RSP.US'):
    d = e.execute(f"SELECT date_trunc('month', date) m, arg_max(adjusted_close, date) c FROM prices_valid WHERE ticker='{t}' GROUP BY 1 ORDER BY 1").df()
    etf[t[:3]] = pd.Series(d.c.values, index=pd.to_datetime(d.m).dt.to_period('M'))
spy = etf['SPY']; spy_bear = spy < spy.rolling(12).mean()
qqq = etf['QQQ'].reindex(spy.index)
lider = pd.Series(np.where((qqq / qqq.shift(5)) > (spy / spy.shift(5)), 'NDX', 'SP'), index=spy.index)

# tylko serie, które kiedykolwiek były w S&P 500 lub NDX (pamięć)
_uz = set().union(*SP.values(), *ND.values())
p = p[p.seria.isin(_uz)]
del pk, best, idx_kod
C = p.pivot_table(index='m', columns='seria', values='c'); S10 = p.pivot_table(index='m', columns='seria', values='sma10')
R6 = p.pivot_table(index='m', columns='seria', values='r6').reindex(columns=C.columns)
S10 = S10.reindex(index=C.index, columns=C.columns); R6 = R6.reindex(index=C.index)
ost = p.groupby('seria').m.max()


def symuluj(sklad_f, od, do='2026-09', N=10, koszt=0.001):
    ms = [m for m in C.index if pd.Period(od, 'M') <= m <= pd.Period(do, 'M')]
    poz, gotowka, wart, transakcje = {}, 1.0, [], []
    for i, m in enumerate(ms[:-1]):
        nast = ms[i + 1]
        # wyjścia na zamknięciu miesiąca m
        for s in list(poz):
            c, sm = C.at[m, s] if s in C.columns else np.nan, S10.at[m, s] if s in S10.columns else np.nan
            if np.isnan(c) or (not np.isnan(sm) and c < sm):
                v = poz[s]['v'] * (1 - koszt); gotowka += v
                transakcje.append(dict(seria=s, wej=poz[s]['wej'], wyj=m, zwrot=v / poz[s]['k0'] - 1, max_zwrot=poz[s]['mx'] / poz[s]['k0'] - 1))
                del poz[s]
        # wejścia
        sklad = sklad_f(m)
        if not spy_bear.get(m, False) and len(poz) < N and sklad:
            kand = [s for s in sklad if s not in poz and s in C.columns and C.at[m, s] > S10.at[m, s] and R6.at[m, s] > 0.30]
            kand = sorted(kand, key=lambda s: -R6.at[m, s])[:N - len(poz)]
            eq = gotowka + sum(x['v'] for x in poz.values())
            for s in kand:
                k = min(eq / N, gotowka)
                if k <= 1e-9: break
                gotowka -= k; poz[s] = dict(v=k * (1 - koszt), k0=k, wej=m, mx=k * (1 - koszt))
        # przejście do miesiąca nast
        for s in list(poz):
            c0, c1 = C.at[m, s], (C.at[nast, s] if s in C.columns else np.nan)
            if np.isnan(c1):          # koniec serii: sprzedaż po ostatniej cenie (c0)
                v = poz[s]['v'] * (1 - koszt); gotowka += v
                transakcje.append(dict(seria=s, wej=poz[s]['wej'], wyj=m, zwrot=v / poz[s]['k0'] - 1, max_zwrot=poz[s]['mx'] / poz[s]['k0'] - 1))
                del poz[s]
            else:
                poz[s]['v'] *= c1 / c0; poz[s]['mx'] = max(poz[s]['mx'], poz[s]['v'])
        wart.append((nast, gotowka + sum(x['v'] for x in poz.values()), len(poz)))
    W = pd.DataFrame(wart, columns=['m', 'kap', 'n']).set_index('m')
    return W, pd.DataFrame(transakcje)


def miary(eq):
    r = eq.pct_change().dropna(); lat = len(r) / 12
    return dict(CAGR=(eq.iloc[-1] / eq.iloc[0]) ** (1 / lat) - 1, zmiennosc=r.std() * np.sqrt(12), Sharpe=r.mean() / r.std() * np.sqrt(12),
                maxDD=(eq / eq.cummax() - 1).min())


def blok(x, b=12):
    x = np.asarray(x); n = len(x); nb = int(np.ceil(n / b))
    return np.percentile([np.concatenate([x[i:i + b] for i in rng.integers(0, n - b, nb)])[:n].mean() for _ in range(B)], [2.5, 97.5])


warianty = {'S&P 500 (1998-2026)': (lambda m: SP.get(m), '1998-01'), 'NDX (2008-2026)': (lambda m: ND.get(m), '2008-01'),
            'lider SPY/QQQ (2008-2026)': (lambda m: (ND.get(m) if lider.get(m) == 'NDX' else SP.get(m)), '2008-01')}
wyn, tr_all, eqs = [], {}, {}
for nm, (f, od) in warianty.items():
    W, T = symuluj(f, od); eqs[nm] = W['kap']; tr_all[nm] = T
    r = W['kap'].pct_change().dropna()
    for bnm in ('SPY', 'QQQ', 'RSP'):
        b = etf[bnm].reindex(W.index).pct_change().dropna()
        if b.index.min() > r.index.min() + 12: continue
        rr = r.reindex(b.index).dropna(); bb = b.reindex(rr.index); d = rr - bb; lo, hi = blok(d)
        wyn.append(dict(wariant=nm, odniesienie=bnm, roznica_mies=d.mean(), ci95=f'{lo*100:.2f}…{hi*100:.2f} %', CAGR_CEM=miary((1 + rr).cumprod())['CAGR'],
                        CAGR_odn=miary((1 + bb).cumprod())['CAGR']))
    print(nm, flush=True)
M = pd.DataFrame({nm: miary(eq) for nm, eq in eqs.items()}).T
for bnm in ('SPY', 'QQQ', 'RSP'):
    for od in ('1998-01', '2008-01'):
        b = etf[bnm][(etf[bnm].index >= pd.Period(od, 'M')) & (etf[bnm].index <= pd.Period('2026-09', 'M'))]
        if len(b) > 24 and b.index.min() <= pd.Period(od, 'M') + 1: M.loc[f'{bnm} ({od[:4]}-2026)'] = miary(b)
# podokresy
pod = []
for nm, eq in eqs.items():
    r = eq.pct_change().dropna(); s = etf['SPY'].pct_change().reindex(r.index)
    for a, b_ in [(1998, 2007), (2008, 2018), (2019, 2026)]:
        m_ = (r.index.year >= a) & (r.index.year <= b_)
        if m_.sum() < 12: continue
        pod.append(dict(wariant=nm, okres=f'{a}-{b_}', CEM_rocznie=(1 + r[m_]).prod() ** (12 / m_.sum()) - 1, SPY_rocznie=(1 + s[m_]).prod() ** (12 / m_.sum()) - 1))

# transakcje w świetle anatomii wzrostów
con = duckdb.connect(DB, read_only=True)
ru = con.execute("SELECT ticker AS seria, t0, t1, p0, p1, zmiana FROM ruchy WHERE y = 0.25 AND kier = 1 AND status <> 'trwa'").df()
ru['t0'] = pd.to_datetime(ru.t0).dt.to_period('M'); ru['t1'] = pd.to_datetime(ru.t1).dt.to_period('M')
an = []
for nm, T in tr_all.items():
    T = T.copy(); T['mies_trzym'] = [(b - a).n for a, b in zip(T.wej, T.wyj)]
    T['oddane_od_max'] = (1 + T.zwrot) / (1 + T.max_zwrot) - 1
    # ruch zygzaka, w którym nastąpiło wejście
    rs = ru[ru.seria.isin(T.seria)]
    gr = {s: g for s, g in rs.groupby('seria')}
    faza, zostalo = [], []
    for t in T.itertuples():
        g = gr.get(t.seria); f_, z_ = np.nan, np.nan
        if g is not None:
            h = g[(g.t0 <= t.wej) & (g.t1 >= t.wej)]
            if len(h):
                r0 = h.iloc[0]; cw = C.at[t.wej, t.seria]
                f_ = np.log(cw / r0.p0) / np.log(r0.p1 / r0.p0)          # jaka część ruchu (log) już za nami przy wejściu
                z_ = r0.p1 / cw - 1                                         # ile zostało do szczytu ruchu
        faza.append(f_); zostalo.append(z_)
    T['faza_wejscia'] = faza; T['do_szczytu'] = zostalo
    an.append(dict(wariant=nm, transakcji=len(T), mediana_mies=T.mies_trzym.median(), sr_mies=T.mies_trzym.mean(),
                   trafione=(T.zwrot > 0).mean(), mediana_zwrotu=T.zwrot.median(), srednia_zwrotu=T.zwrot.mean(),
                   udzial_zysku_top10proc=T.zwrot.clip(lower=0).nlargest(max(len(T) // 10, 1)).sum() / T.zwrot.clip(lower=0).sum(),
                   transakcje_ponad_100proc=(T.zwrot >= 1).mean(), mediana_maks_w_trakcie=T.max_zwrot.median(),
                   mediana_oddane_od_maks=T.oddane_od_max.median(), mediana_fazy_wejscia=np.nanmedian(T.faza_wejscia),
                   wejscie_w_ruchu=np.isfinite(T.faza_wejscia).mean(), mediana_do_szczytu_przy_wejsciu=np.nanmedian(T.do_szczytu)))
A = pd.DataFrame(an)
# jaką część dużych wzrostów członków indeksu łapie CEM10 (S&P 500, dołek 1998-2025, wzrost >= +100 %)
T = tr_all['S&P 500 (1998-2026)']
duze = ru[(ru.zmiana >= 1) & (ru.t0 >= pd.Period('1998-01', 'M')) & (ru.t0 <= pd.Period('2025-06', 'M'))]
duze = duze[[s in SP.get(t0, set()) for s, t0 in zip(duze.seria, duze.t0)]]
trz = {s: g for s, g in T.groupby('seria')}
zl = []
for r in duze.itertuples():
    g = trz.get(r.seria); zlap, czesc = 0, 0.0
    if g is not None:
        h = g[(g.wej <= r.t1) & (g.wyj >= r.t0)]
        if len(h):
            zlap = 1
            # część ruchu (log) objęta trzymaniem: od max(wejście, dołek) do min(wyjście, szczyt)
            for t in h.itertuples():
                a_, b_ = max(t.wej, r.t0), min(t.wyj, r.t1)
                ca, cb = C.at[a_, r.seria], C.at[b_, r.seria]
                if np.isfinite(ca) and np.isfinite(cb) and cb > ca: czesc += np.log(cb / ca) / np.log(r.p1 / r.p0)
    zl.append((r.zmiana, zlap, min(czesc, 1)))
Z = pd.DataFrame(zl, columns=['zmiana', 'zlapany', 'czesc'])
Z['klasa'] = pd.cut(Z.zmiana, [1, 2, 5, 1e9], labels=['+100-200 %', '+200-500 %', '> +500 %'], right=False)
Zt = Z.groupby('klasa').agg(ruchow=('zlapany', 'size'), zlapane=('zlapany', 'mean'), sr_czesc_ruchu=('czesc', 'mean'),
                            czesc_gdy_zlapany=('czesc', lambda v: v[v > 0].mean())).round(3)

out = ['# Etap 12: CEM10 na oczyszczonych danych i w świetle anatomii wzrostów', '',
       'Reguły CEM10 (miesięcznie): skład indeksu w danym miesiącu, 6M > +30 %, zamknięcie > SMA 10, ranking 6M, 10 pozycji, '
       'bez zakupów przy SPY < SMA 12, wyjście pod SMA 10, bez rebalancingu, koszt 0,1 % na stronę, bez stopu -40 %.', '',
       'Zastrzeżenie: CEM10 był wcześniej dobierany na tych latach, więc to nie jest test niezależny. Pokrycie składu S&P 500 '
       'cenami (średnio w roku): ' + ', '.join(f'{y}: {v:.0%}' for y, v in cov_sp.groupby(cov_sp.index.year).mean().items() if y % 4 == 2) + '.', '',
       '## Wyniki portfeli', '', M.round(4).reset_index(names='portfel').to_markdown(index=False), '',
       'Różnica miesięcznego zwrotu względem ETF (95 % bootstrap blokowy 12 mies.):', '', pd.DataFrame(wyn).round(4).to_markdown(index=False), '',
       'Podokresy (zwrot roczny):', '', pd.DataFrame(pod).round(3).to_markdown(index=False), '',
       '## Transakcje CEM10 w świetle anatomii wzrostów', '',
       'faza wejścia = jaka część ruchu zygzaka (od dołka do szczytu, w log) jest już za nami w miesiącu wejścia; '
       'do szczytu = ile ruch jeszcze urósł od ceny wejścia; oddane od maks. = spadek od najwyższej wartości pozycji do wyjścia.', '',
       A.round(3).T.reset_index().to_markdown(index=False), '',
       '## Jaką część dużych wzrostów spółek z S&P 500 łapie CEM10 (dołek 1998-2025, spółka w indeksie w miesiącu dołka)', '',
       Zt.reset_index().to_markdown(index=False), '']
open(os.path.join(WYN, 'r19_cem10.md'), 'w').write('\n'.join(out))
print('\n'.join(out))
