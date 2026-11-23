"""Etap 91: kanał odchylenia standardowego na zamknięciach miesięcznych — siatka 12 wariantów. Protokół: etap 91."""
import os
HERE = os.path.dirname(os.path.abspath(__file__))
_s = open(os.path.join(HERE, 'r115_etap90.py')).read()
exec(_s[:_s.index("K = {}")])
import numpy as np, pandas as pd

M = {k: c[c > 0].resample('ME').last().dropna() for k, c in PX.items()}
spy_m = spy.resample('ME').last(); qqq_m = qqq.resample('ME').last()


def kanal_m(y, L):
    n = L; x = np.arange(len(y), dtype=float)
    Sy = pd.Series(y).rolling(n).sum().to_numpy(); Syy = pd.Series(y * y).rolling(n).sum().to_numpy(); Sxy = pd.Series(x * y).rolling(n).sum().to_numpy()
    xbar = x - (n - 1) / 2; ybar = Sy / n; sxx = n * (n * n - 1) / 12
    b = (Sxy - n * xbar * ybar) / sxx
    return ybar + b * (n - 1) / 2, np.sqrt(np.maximum((Syy - n * ybar ** 2 - b * b * sxx) / n, 0)), b


def cap_m(k, t):
    m = t.to_period('M') - 1
    try:
        return CAP.at[m, k], rank.at[m, k]
    except KeyError:
        return np.nan, np.nan


def zdarzenia(L, log, k3, k4):
    out = []
    for k, c in M.items():
        if len(c) <= L + 2:
            continue
        y = np.log(c.to_numpy()) if log else c.to_numpy(float)
        lin, sd, b = kanal_m(y, L)
        linia = np.exp(lin) if log else lin
        idx = c.index; uzbr = True
        for i, t in enumerate(idx):
            if t < OD or t > DO or not np.isfinite(lin[i]):
                continue
            if not uzbr:
                if c.iloc[i] >= linia[i]:
                    uzbr = True
                continue
            mc, rk = cap_m(k, t)
            if not (mc >= MIN_CAP):
                continue
            kk = k3 if rk <= 10 else k4; dol = lin[i] - kk * sd[i]
            if not (b[i] > 0 and y[i] < dol and (log or dol > 0)):
                continue
            uzbr = False
            j = i + 1
            while j < len(c) and j <= i + 36 and c.iloc[j] < linia[j]:
                j += 1
            j = min(j, len(c) - 1, i + 36)
            f = lambda h: c.iloc[i + h] / c.iloc[i] - 1 if i + h < len(c) else np.nan
            s = lambda h: spy_m.asof(idx[i + h]) / spy_m.asof(t) - 1 if i + h < len(c) else np.nan
            out.append(dict(k=k, data=t, wyj=idx[j], zwrot=c.iloc[j] / c.iloc[i] * KOSZT ** 2 - 1, r12=f(12), spy12=s(12)))
    return pd.DataFrame(out)


def portfel(Z, od, do, cash_spy):
    mies = spy_m.loc[od:do].index
    ev = {}
    for z in Z.itertuples():
        ev.setdefault(z.data, []).append(z)
    got, poz, eq, inw = 1.0, {}, [], []
    for a, t in enumerate(mies):
        if a and cash_spy:
            got *= spy_m.at[t] / spy_m.at[mies[a - 1]]
        for k in list(poz):
            q, z = poz[k]; c = M[k]
            if t >= z.wyj or t > c.index[-1]:
                got += q * c.asof(min(t, z.wyj)) * KOSZT; poz.pop(k)
        wart = lambda: got + sum(q * M[k].asof(t) for k, (q, _) in poz.items())
        for z in ev.get(t, []):
            if z.k in poz or len(poz) >= 10:
                continue
            E = wart(); kw = min(0.10 * E, got)
            if kw < 0.02 * E:
                continue
            got -= kw; poz[z.k] = (kw * KOSZT / M[z.k].at[t], z)
        E = wart(); eq.append(E); inw.append(1 - got / E if not cash_spy else (E - got) / E)
    return pd.Series(eq, index=mies), float(np.mean(inw))


def cagr(s):
    lata = len(s) / 12
    return (s.iloc[-1] / s.iloc[0]) ** (1 / lata) - 1


OKRESY = (('2013–2026', '2013-01-31', '2026-10-31'), ('2013–2019', '2013-01-31', '2019-12-31'), ('2020–2026', '2020-01-31', '2026-10-31'))
rows = []
for L in (60, 120):
    for log in (False, True):
        for k3, k4 in ((2, 2), (2, 3), (3, 4)):
            Z = zdarzenia(L, log, k3, k4)
            r = {'L (mies.)': L, 'skala': 'log' if log else 'cena', 'progi': f'−{k3}σ/−{k4}σ', 'sygnałów': len(Z),
                 'z zyskiem': f"{(Z.zwrot > 0).mean():.0%}" if len(Z) else '–', 'nad SPY 12 m': f"{(Z.r12 - Z.spy12).mean():+.1%}" if len(Z) else '–'}
            for nm, od, do in OKRESY:
                zz = Z[(Z.data >= od) & (Z.data <= do)] if len(Z) else Z
                if nm != '2013–2026' and len(zz):
                    r[f'nad SPY 12 m {nm}'] = f"{(zz.r12 - zz.spy12).mean():+.1%}"
                for cs in (False, True):
                    P, inw = portfel(Z, od, do, cs)
                    r[f'{nm} {"SPY" if cs else "0%"}'] = f"{cagr(P):.1%}"
                    if nm == '2013–2026' and not cs:
                        r['maxDD 0%'] = f"{(P / P.cummax() - 1).min():.0%}"; r['zaangażowanie'] = f"{inw:.0%}"
            rows.append(r); print(r, flush=True)
bench = {nm: (f"{cagr(spy_m.loc[od:do]):.1%}", f"{cagr(qqq_m.loc[od:do]):.1%}") for nm, od, do in OKRESY}
T = pd.DataFrame(rows)
out = ['# Etap 91: kanał odchylenia standardowego na zamknięciach miesięcznych — siatka wariantów', '',
       'Spółki ≥ 50 mld USD (ze spółkami usuniętymi), sygnał i wyjście na zamknięciu miesiąca, wyjście na linii regresji (najdłużej 36 mies.), portfel 10 % na pozycję, '
       'najwyżej 10; kolumny „0%” — gotówka bez oprocentowania, „SPY” — gotówka czeka w SPY. Połowy liczone od zera.', '',
       'SPY / QQQ rocznie: ' + '; '.join(f'{nm}: {a} / {b}' for nm, (a, b) in bench.items()), '',
       T.to_markdown(index=False), '']
open(os.path.join(HERE, 'wyniki', 'r116_etap91.md'), 'w').write('\n'.join(out)); print('\n'.join(out))
