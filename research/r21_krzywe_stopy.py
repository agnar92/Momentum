"""Krzywe kapitału CEM10 (S&P 500 point-in-time, 1998-2026) z różnymi wyjściami:
 1 samo SMA 10 (zamknięcie miesiąca), 2 SMA 10 + stop -40 % od ceny zakupu w trakcie miesiąca,
 3 SMA 10 + trailing -25 % od najwyższego zamknięcia miesiąca, 4 wszystkie trzy.
Stop w trakcie miesiąca: najniższa cena miesiąca (low skorygowany) <= 60 % ceny zakupu -> wyjście po cenie stopu,
a przy luce (otwarcie miesiąca poniżej stopu) po cenie otwarcia. Reszta jak w r20 (10 pozycji, koszt 0,1 %, filtr SPY < SMA 12).
"""
import os, warnings, duckdb, numpy as np, pandas as pd
import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
warnings.filterwarnings('ignore')
_src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'r19_cem10.py')).read().split('warianty = {')[0]
exec(_src)
WYN = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'wyniki')
KOSZT, N = 0.001, 10
R6m = C / C.shift(6) - 1
con = duckdb.connect(DB, read_only=True)
mm = con.execute("SELECT seria, okres, o, l FROM m WHERE seria IN (SELECT unnest(?::VARCHAR[]))", [list(C.columns)]).df()
mm['m'] = pd.to_datetime(mm.okres).dt.to_period('M')
O = mm.pivot_table(index='m', columns='seria', values='o').reindex(index=C.index, columns=C.columns)
L = mm.pivot_table(index='m', columns='seria', values='l').reindex(index=C.index, columns=C.columns)


def sim(stop40, trail25, od='1998-01', do='2026-09'):
    daty = [m for m in C.index if pd.Period(od, 'M') <= m <= pd.Period(do, 'M')]
    poz, got, wart, ile = {}, 1.0, [], dict(sma=0, trail=0, stop=0)
    for i, t in enumerate(daty[:-1]):
        nx = daty[i + 1]
        for s in list(poz):
            c = C.at[t, s]; p = poz[s]
            pow_ = 'sma' if c < S10.at[t, s] else ('trail' if trail25 and c < p['mx'] * 0.75 else None)
            if pow_:
                got += p['v'] * (1 - KOSZT); ile[pow_] += 1; del poz[s]
        sk = SP.get(t)
        if sk and not spy_bear.get(t, False) and len(poz) < N:
            kand = [s for s in sk if s not in poz and s in C.columns and C.at[t, s] > S10.at[t, s] and R6m.at[t, s] > 0.30]
            kand = sorted(kand, key=lambda s: -R6m.at[t, s])[:N - len(poz)]
            eq = got + sum(x['v'] for x in poz.values())
            for s in kand:
                k = min(eq / N, got)
                if k <= 1e-9: break
                got -= k; poz[s] = dict(v=k * (1 - KOSZT), cw=C.at[t, s], mx=C.at[t, s])
        for s in list(poz):
            p = poz[s]; c0, c1 = C.at[t, s], C.at[nx, s]
            if np.isnan(c1):
                got += p['v'] * (1 - KOSZT); del poz[s]; continue
            st = p['cw'] * 0.60
            if stop40 and np.isfinite(L.at[nx, s]) and L.at[nx, s] <= st:
                o = O.at[nx, s]; px = o if np.isfinite(o) and o < st else st
                got += p['v'] * px / c0 * (1 - KOSZT); ile['stop'] += 1; del poz[s]; continue
            p['v'] *= c1 / c0; p['mx'] = max(p['mx'], c1)
        wart.append((nx, got + sum(x['v'] for x in poz.values())))
    return pd.Series(dict(wart)), ile


WAR = {'samo SMA 10': (False, False), 'SMA 10 + stop -40 % w trakcie miesiąca': (True, False),
       'SMA 10 + trailing -25 % (zamknięcie miesiąca)': (False, True), 'SMA 10 + trailing -25 % + stop -40 %': (True, True)}
K, IL = {}, {}
for nm, (a, b) in WAR.items():
    K[nm], IL[nm] = sim(a, b); print(nm, flush=True)
spy_ = etf['SPY'][(etf['SPY'].index >= pd.Period('1998-01', 'M')) & (etf['SPY'].index <= pd.Period('2026-09', 'M'))]
K['SPY'] = spy_ / spy_.iloc[0]
rows = []
for nm, e in K.items():
    r = e.pct_change().dropna(); h1 = r[r.index <= pd.Period('2012-12', 'M')]; h2 = r[r.index >= pd.Period('2013-01', 'M')]
    rows.append(dict(wariant=nm, **{k: v for k, v in miary(e).items()}, rocznie_98_12=(1 + h1).prod() ** (12 / len(h1)) - 1,
                     rocznie_13_26=(1 + h2).prod() ** (12 / len(h2)) - 1, z_10k_USD=10000 * e.iloc[-1] / e.iloc[0],
                     wyjscia_sma=IL.get(nm, {}).get('sma', np.nan), wyjscia_trailing=IL.get(nm, {}).get('trail', np.nan), wyjscia_stop40=IL.get(nm, {}).get('stop', np.nan)))
T = pd.DataFrame(rows)
fig, ax = plt.subplots(2, 1, figsize=(11, 8), sharex=True, gridspec_kw={'height_ratios': [3, 1.3]})
kol = {'samo SMA 10': '#1f6f8b', 'SMA 10 + stop -40 % w trakcie miesiąca': '#99a8b2', 'SMA 10 + trailing -25 % (zamknięcie miesiąca)': '#e07a5f',
       'SMA 10 + trailing -25 % + stop -40 %': '#f2cc8f', 'SPY': '#555555'}
for nm, e in K.items():
    x = e.index.to_timestamp(); ax[0].plot(x, 10000 * e / e.iloc[0], label=f"{nm}: {T.loc[T.wariant == nm, 'CAGR'].iloc[0]*100:.1f} % rocznie", color=kol[nm],
                                           lw=2.2 if nm in ('samo SMA 10', 'SMA 10 + trailing -25 % (zamknięcie miesiąca)') else 1.4, ls='--' if nm == 'SPY' else '-')
    ax[1].plot(x, (e / e.cummax() - 1) * 100, color=kol[nm], lw=1.2, ls='--' if nm == 'SPY' else '-')
ax[0].set_yscale('log'); ax[0].set_ylabel('kapitał z 10 000 USD (skala log.)'); ax[0].legend(fontsize=9, loc='upper left'); ax[0].grid(alpha=0.3)
ax[0].set_title('CEM10 S&P 500 (skład historyczny), 1998-2026: wyjścia SMA 10, trailing -25 %, stop -40 %', fontsize=11)
ax[1].set_ylabel('obsunięcie %'); ax[1].grid(alpha=0.3)
fig.tight_layout(); fig.savefig(os.path.join(WYN, 'r21_krzywe_stopy.png'), dpi=130)
open(os.path.join(WYN, 'r21_krzywe_stopy.md'), 'w').write('# Krzywe CEM10 z różnymi wyjściami (S&P 500, 1998-2026)\n\n' + T.round(4).to_markdown(index=False) + '\n')
print(T.round(4).to_markdown(index=False))
