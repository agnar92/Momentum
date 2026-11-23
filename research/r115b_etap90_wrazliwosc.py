"""Etap 90 — wrażliwość (poza protokołem): kanał na log-cenie, niższe progi, gotówka w SPY."""
import os
HERE = os.path.dirname(os.path.abspath(__file__))
_s = open(os.path.join(HERE, 'r115_etap90.py')).read()
exec(_s[:_s.index("SIG = lambda")])
import numpy as np, pandas as pd
K_lin = K
K_log = {}
for k, df in K_lin.items():
    c = df.c
    g = kanal(np.log(c))
    K_log[k] = pd.DataFrame({'c': c.to_numpy(), 'linia': np.exp(g.linia), 'sd': g.sd, 'b': g.b, 'lin_log': g.linia}, index=c.index)


def sig(k3, k4, log):
    if log:
        return lambda r, rk, ath: r.b > 0 and np.log(r.c) < r.lin_log - (k3 if rk <= 10 else k4) * r.sd
    return lambda r, rk, ath: r.b > 0 and r.c < r.linia - (k3 if rk <= 10 else k4) * r.sd and r.linia - (k3 if rk <= 10 else k4) * r.sd > 0


def portfel(Zs, Kx, cash_spy):
    dni = spy.loc['2013-01-01':'2026-10-31'].index
    ev = {}
    for z in Zs.itertuples():
        ev.setdefault(z.data, []).append(z.k)
    got, poz, eq = 1.0, {}, []
    prev = dni[0]
    for t in dni:
        if cash_spy:
            got *= spy.asof(t) / spy.asof(prev)
        prev = t
        for k in list(poz):
            df = Kx[k]
            if t not in df.index:
                if t > df.index[-1]:
                    got += poz.pop(k) * df.c.iloc[-1] * KOSZT
                continue
            if df.at[t, 'c'] >= df.at[t, 'linia']:
                got += poz.pop(k) * df.at[t, 'c'] * KOSZT
        wart = lambda: got + sum(q * Kx[k].c.asof(t) for k, q in poz.items())
        for k in ev.get(t, []):
            if k in poz or len(poz) >= 10:
                continue
            E = wart(); kw = min(0.10 * E, got)
            if kw < 0.02 * E:
                continue
            got -= kw; poz[k] = kw * KOSZT / Kx[k].at[t, 'c']
        eq.append(wart())
    return pd.Series(eq, index=dni)


def stat(s, nm):
    s = s.dropna(); lata = (s.index[-1] - s.index[0]).days / 365.25
    return {'stopa roczna': f"{(s.iloc[-1] / s.iloc[0]) ** (1 / lata) - 1:.1%}", 'maxDD': f"{(s / s.cummax() - 1).min():.0%}"}


rows = []
for nm, k3, k4, log in (('liniowy −3σ/−4σ (jak w protokole)', 3, 4, False), ('liniowy −2σ/−3σ', 2, 3, False), ('log-cena −3σ/−4σ', 3, 4, True), ('log-cena −2σ/−3σ', 2, 3, True)):
    globals()['K'] = K_log if log else K_lin
    Zs = zdarzenia(sig(k3, k4, log))
    for cs in (False, True):
        P = portfel(Zs, K, cs)
        st = stat(P, '')
        rows.append({'wariant': nm, 'gotówka': 'SPY' if cs else '0 %', 'sygnałów': len(Zs), 'z zyskiem': f"{(Zs.zwrot > 0).mean():.0%}" if len(Zs) else '–',
                     'nad SPY 12 m': f"{(Zs.r12 - Zs.spy12).mean():+.1%}" if len(Zs) else '–', 'bije SPY 12 m': f"{((Zs.r12 - Zs.spy12) > 0).mean():.0%}" if len(Zs) else '–',
                     'stopa roczna 2013–26': st['stopa roczna'], 'maxDD': st['maxDD']})
    print(nm, flush=True)
st = stat(spy.loc['2013-01-01':'2026-10-31'], '')
rows.append({'wariant': 'SPY', 'stopa roczna 2013–26': st['stopa roczna'], 'maxDD': st['maxDD']})
t = pd.DataFrame(rows)
out = ['# Etap 90 — wrażliwość (poza protokołem)', '', t.to_markdown(index=False), '']
open(os.path.join(HERE, 'wyniki', 'r115b_etap90_wrazliwosc.md'), 'w').write('\n'.join(out)); print('\n'.join(out))
