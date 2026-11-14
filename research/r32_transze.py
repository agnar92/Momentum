"""CEM10 z zakupami w transzach (pomysł użytkownika). Na każdą nową pozycję przypada kwota A = kapitał / 10.
Wejście: f0 x A na zamknięciu miesiąca sygnału. Reszta (1 - f0) x A w 10 równych transzach, każda kupowana na zamknięciu
dnia, gdy cena odejdzie o 7 % od ceny ostatniego zakupu (w górę lub w dół; warianty: tylko w górę / tylko w dół), maks. 1 transza dziennie.
Niewykorzystana reszta kwoty czeka w gotówce (0 %). Wyjście całej pozycji: zamknięcie miesiąca < SMA 10. Reguły wyboru jak CEM10
(skład indeksu point-in-time, 6M > 30 %, > SMA 10, ranking 6M, brak zakupów przy SPY < SMA 12). Koszt 0,1 % od każdego zakupu i sprzedaży.
"""
import os, warnings, duckdb, numpy as np, pandas as pd
warnings.filterwarnings('ignore')
HERE = os.path.dirname(os.path.abspath(__file__))
exec(open(os.path.join(HERE, 'r19_cem10.py')).read().split('warianty = {')[0])
KOSZT, N = 0.001, 10
R6m = C / C.shift(6) - 1
con = duckdb.connect(DB, read_only=True)
tick = sorted({s.split('~')[0] for s in set().union(*SP.values(), *ND.values())})
d = con.execute("SELECT ticker, date, adj FROM dc WHERE ticker IN (SELECT unnest(?::VARCHAR[])) AND date >= '1997-01-01' ORDER BY ticker, date", [tick]).df()
d['date'] = pd.to_datetime(d.date)
DZ = {t: g.set_index('date').adj for t, g in d.groupby('ticker')}
print('dzienne', len(d), flush=True)


def sim(sklad_f, od, f0, gora=True, dol=True, do='2026-09'):
    ms = [m for m in C.index if pd.Period(od, 'M') <= m <= pd.Period(do, 'M')]
    got, poz, eq, ekspo = 1.0, {}, [], []
    for i, m in enumerate(ms[:-1]):
        nx = ms[i + 1]
        for s in list(poz):                                   # wyjścia na zamknięciu miesiąca
            c = C.at[m, s]; p = poz[s]
            if np.isnan(c) or c < S10.at[m, s]:
                got += p['akcje'] * (c if np.isfinite(c) else p['ost_c']) * (1 - KOSZT) + p['rez']; del poz[s]
        sk = sklad_f(m)
        if sk and not spy_bear.get(m, False) and len(poz) < N:
            kand = [s for s in sk if s not in poz and s in C.columns and C.at[m, s] > S10.at[m, s] and R6m.at[m, s] > 0.30]
            kand = sorted(kand, key=lambda s: -R6m.at[m, s])[:N - len(poz)]
            e = got + sum(p['akcje'] * C.at[m, s] + p['rez'] for s, p in poz.items())
            for s in kand:
                A = min(e / N, got)
                if A <= 1e-9: break
                c = C.at[m, s]; got -= A
                poz[s] = dict(akcje=f0 * A * (1 - KOSZT) / c, rez=(1 - f0) * A, transza=(1 - f0) * A / 10, zostalo=10 if f0 < 1 else 0, ost=c, ost_c=c,
                              tk=s.split('~')[0])
        # dni między końcem m a końcem nx: transze
        t0, t1 = m.to_timestamp(how='end'), nx.to_timestamp(how='end')
        for s, p in poz.items():
            if p['zostalo'] == 0: continue
            ser = DZ.get(p['tk'])
            if ser is None: continue
            for px in ser[(ser.index > t0) & (ser.index <= t1)].values:
                if p['zostalo'] == 0: break
                if (gora and px >= p['ost'] * 1.07) or (dol and px <= p['ost'] * 0.93):
                    p['akcje'] += p['transza'] * (1 - KOSZT) / px; p['rez'] -= p['transza']; p['ost'] = px; p['zostalo'] -= 1
        for s in list(poz):                                   # wycena na koniec nx
            c1 = C.at[nx, s]
            if np.isnan(c1):
                got += poz[s]['akcje'] * poz[s]['ost_c'] * (1 - KOSZT) + poz[s]['rez']; del poz[s]
            else: poz[s]['ost_c'] = c1
        inw = sum(p['akcje'] * p['ost_c'] for p in poz.values())
        tot = got + inw + sum(p['rez'] for p in poz.values())
        eq.append((nx, tot)); ekspo.append(inw / tot)
    e = pd.Series(dict(eq)); r = e.pct_change().dropna()
    return dict(CAGR=(e.iloc[-1] / 1.0) ** (12 / len(e)) - 1, maxDD=(e / e.cummax() - 1).min(), Sharpe=r.mean() / r.std() * np.sqrt(12),
                sr_zainwestowane=np.mean(ekspo)), e


WAR = {'zwykły CEM10 (100 % od razu)': (1.0, True, True), 'transze: 20 % + 10 x 8 % (góra i dół 7 %)': (0.2, True, True),
       'transze: 40 % + 10 x 6 % (góra i dół 7 %)': (0.4, True, True), 'transze 20 %: tylko przy wzroście +7 %': (0.2, True, False),
       'transze 20 %: tylko przy spadku -7 %': (0.2, False, True)}
rows, krzywe = [], {}
for ind, f_, od in (('S&P 500', lambda m: SP.get(m), '1998-01'), ('NDX', lambda m: ND.get(m), '2008-01')):
    for nm, (f0, g, dl) in WAR.items():
        r, e = sim(f_, od, f0, g, dl); krzywe[(ind, nm)] = e
        h1 = e[e.index <= pd.Period('2012-12', 'M')]; h2 = e[e.index >= pd.Period('2012-12', 'M')]
        rows.append(dict(indeks=ind, wariant=nm, **r, CAGR_do_2012=(h1.iloc[-1] / 1.0) ** (12 / len(h1)) - 1 if ind == 'S&P 500' else np.nan,
                         CAGR_od_2013=(h2.iloc[-1] / h2.iloc[0]) ** (12 / (len(h2) - 1)) - 1, z_10k=10000 * e.iloc[-1]))
        print(ind, nm, flush=True)
T = pd.DataFrame(rows)
out = ['# CEM10 z zakupami w transzach (S&P 500 1998-2026, NDX 2008-2026)', '', T.round(3).to_markdown(index=False), '',
       'sr_zainwestowane = średni odsetek kapitału faktycznie w akcjach (reszta czeka w gotówce na transze).', '']
open(os.path.join(HERE, 'wyniki', 'r32_transze.md'), 'w').write('\n'.join(out)); print('\n'.join(out))
