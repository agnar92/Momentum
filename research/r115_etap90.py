"""Etap 90: kanał odchylenia standardowego (2500 dni) — kupno przy −3σ (top 10) / −4σ (reszta ≥ 50 mld USD), wyjście na linii regresji. Protokół: etap 90."""
import os
import pickle
import duckdb
import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.environ.get('EODHD_DB', '/home/user/ndx/db/eodhd.duckdb')
CAP = pickle.load(open('/home/user/ndx/szer/cap.pkl', 'rb'))
N, MIN_CAP = 2500, 5e10
OD, DO = pd.Timestamp('2012-01-01'), pd.Timestamp('2025-10-31')
KOSZT = 0.999

capm = CAP.loc[pd.Period('2010-12', 'M'):]
uni = [k for k in capm.columns if (capm[k] >= MIN_CAP).any()]
rank = capm.rank(axis=1, ascending=False)
print('spółek kiedykolwiek ≥ 50 mld od 2011:', len(uni), flush=True)
e = duckdb.connect(SRC, read_only=True)
lst = ",".join(f"'{k}.US'" for k in uni + ['SPY', 'QQQ'])
d = e.execute(f"SELECT ticker, date, adjusted_close c FROM prices_valid WHERE ticker IN ({lst}) AND date >= DATE '2001-01-01' ORDER BY ticker, date").df()
d['date'] = pd.to_datetime(d.date)
PX = {t[:-3]: s.set_index('date').c for t, s in d.groupby('ticker')}
spy, qqq = PX.pop('SPY'), PX.pop('QQQ')
print('serii cen:', len(PX), flush=True)


def kanal(c):
    """Linia regresji (wartość w bieżącym dniu), σ reszt i nachylenie z ostatnich N dni."""
    y = c.to_numpy(float); n = N
    x = np.arange(len(y), dtype=float)
    Sy = pd.Series(y).rolling(n).sum().to_numpy(); Syy = pd.Series(y * y).rolling(n).sum().to_numpy(); Sxy = pd.Series(x * y).rolling(n).sum().to_numpy()
    xbar = x - (n - 1) / 2; ybar = Sy / n; sxx = n * (n * n - 1) / 12
    b = (Sxy - n * xbar * ybar) / sxx
    linia = ybar + b * (n - 1) / 2
    var = np.maximum((Syy - n * ybar ** 2 - b * b * sxx) / n, 0)
    return pd.DataFrame({'c': y, 'linia': linia, 'sd': np.sqrt(var), 'b': b}, index=c.index)


def cap_dnia(k, dt):
    m = dt.to_period('M') - 1
    try:
        return CAP.at[m, k], rank.at[m, k] if m in rank.index else np.nan
    except KeyError:
        return np.nan, np.nan


K = {}
for k, c in PX.items():
    c = c[c > 0]
    if len(c) > N + 20:
        K[k] = kanal(c)
print('kanałów:', len(K), flush=True)


def zdarzenia(sygnal_fn):
    out = []
    for k, df in K.items():
        dd = df[(df.index >= OD) & (df.index <= DO)]
        if not len(dd):
            continue
        uzbrojony, i_all = True, df.index
        pos = {t: i for i, t in enumerate(i_all)}
        ath = df.c.cummax()
        for t, r in dd.iterrows():
            if not uzbrojony:
                if r.c >= r.linia:
                    uzbrojony = True
                continue
            mc, rk = cap_dnia(k, t)
            if not (mc >= MIN_CAP):
                continue
            if not sygnal_fn(r, rk, ath.at[t]):
                continue
            uzbrojony = False
            i0 = pos[t]; fut = df.iloc[i0 + 1:i0 + 1 + 756]
            hit = fut.index[fut.c >= fut.linia]
            te = hit[0] if len(hit) else (fut.index[-1] if len(fut) else t)
            ce = df.at[te, 'c']
            sciezka = df.c.iloc[i0:pos[te] + 1]
            f = lambda h: (df.c.iloc[i0 + h] / r.c - 1) if i0 + h < len(df) else np.nan
            s = lambda h: (spy.asof(df.index[i0 + h]) / spy.asof(t) - 1) if i0 + h < len(df) else np.nan
            out.append(dict(k=k, data=t, top10=rk <= 10, zwrot=ce * KOSZT ** 2 / r.c - 1, dni=pos[te] - i0, linia=bool(len(hit)),
                            mae=sciezka.min() / r.c - 1, r12=f(252), r24=f(504), spy12=s(252), spy24=s(504)))
    return pd.DataFrame(out)


SIG = lambda r, rk, ath: r.b > 0 and r.c < r.linia - (3 if rk <= 10 else 4) * r.sd and r.linia - (3 if rk <= 10 else 4) * r.sd > 0
ATH30 = lambda r, rk, ath: r.c <= 0.7 * ath
Z = zdarzenia(SIG); print('sygnały σ:', len(Z), flush=True)
A = zdarzenia(ATH30); print('sygnały −30 %:', len(A), flush=True)


def opis(z, nm):
    if not len(z):
        return dict(reguła=nm, sygnałów=0)
    return {'reguła': nm, 'sygnałów': len(z), 'spółek': z.k.nunique(), 'wyjście na linii': f"{z.linia.mean():.0%}", 'z zyskiem': f"{(z.zwrot > 0).mean():.0%}",
            'zwrot średni': f"{z.zwrot.mean():+.1%}", 'zwrot mediana': f"{z.zwrot.median():+.1%}", 'dni mediana': int(z.dni.median()),
            'najgłębszy spadek mediana': f"{z.mae.median():.1%}", 'najgorszy': f"{z.zwrot.min():+.0%}",
            '12 mies. średnio': f"{z.r12.mean():+.1%}", 'nad SPY 12 m': f"{(z.r12 - z.spy12).mean():+.1%}", 'bije SPY 12 m': f"{((z.r12 - z.spy12) > 0).mean():.0%}",
            '24 mies. nad SPY': f"{(z.r24 - z.spy24).mean():+.1%}"}


# losowy dzień (pierwszy dzień sesyjny miesiąca) w tej samej grupie
L = []
for k, df in K.items():
    c = df.c; idx = c.index
    for m in pd.period_range('2012-01', '2025-10', freq='M'):
        mc, _ = cap_dnia(k, m.to_timestamp())
        if not (mc >= MIN_CAP):
            continue
        i0 = idx.searchsorted(m.to_timestamp())
        if i0 + 252 >= len(c):
            continue
        t = idx[i0]
        L.append(dict(r12=c.iloc[i0 + 252] / c.iloc[i0] - 1, spy12=spy.asof(idx[i0 + 252]) / spy.asof(t) - 1,
                      r24=c.iloc[i0 + 504] / c.iloc[i0] - 1 if i0 + 504 < len(c) else np.nan, spy24=spy.asof(idx[i0 + 504]) / spy.asof(t) - 1 if i0 + 504 < len(c) else np.nan))
L = pd.DataFrame(L)
los = {'reguła': 'losowy miesiąc (spółki ≥ 50 mld)', 'sygnałów': len(L), '12 mies. średnio': f"{L.r12.mean():+.1%}", 'nad SPY 12 m': f"{(L.r12 - L.spy12).mean():+.1%}",
       'bije SPY 12 m': f"{((L.r12 - L.spy12) > 0).mean():.0%}", '24 mies. nad SPY': f"{(L.r24 - L.spy24).mean():+.1%}"}

# portfel: 10 % konta na pozycję, najwyżej 10, gotówka 0 %, wyjście na linii regresji
dni = spy.loc['2013-01-01':'2026-10-31'].index
ev = {}
for z in Z.itertuples():
    ev.setdefault(z.data, []).append(z.k)
got, poz, eq, inw = 1.0, {}, [], []
for t in dni:
    for k in list(poz):
        df = K[k]
        if t not in df.index:
            if t > df.index[-1]:
                got += poz.pop(k)[0] * KOSZT
            continue
        ilosc, _ = poz[k]
        if df.at[t, 'c'] >= df.at[t, 'linia']:
            got += ilosc * df.at[t, 'c'] * KOSZT; poz.pop(k)
    wart = lambda: got + sum(q * (K[k].c.asof(t)) for k, (q, _) in poz.items())
    for k in ev.get(t, []):
        if k in poz or len(poz) >= 10:
            continue
        E = wart(); kw = min(0.10 * E, got)
        if kw < 0.02 * E:
            continue
        got -= kw; poz[k] = (kw * KOSZT / K[k].at[t, 'c'], t)
    E = wart(); eq.append(E); inw.append(1 - got / E)
P = pd.Series(eq, index=dni); INW = pd.Series(inw, index=dni)


def stat(s, nm):
    s = s.dropna(); lata = (s.index[-1] - s.index[0]).days / 365.25
    return {'portfel': nm, 'stopa roczna': f"{(s.iloc[-1] / s.iloc[0]) ** (1 / lata) - 1:.1%}", 'maxDD': f"{(s / s.cummax() - 1).min():.0%}",
            '10 tys. →': f"{10000 * s.iloc[-1] / s.iloc[0]:,.0f}".replace(',', ' ')}


rows = []
for od in ('2013-01-01', '2016-01-01'):
    for nm, s in (('kanał σ (10 % na pozycję)', P), ('SPY', spy), ('QQQ', qqq)):
        rows.append(dict(okres=od[:4] + '–2026-10', **stat(s.loc[od:'2026-10-31'], nm)))
lata = pd.DataFrame({nm: s.loc['2012-12-31':'2026-10-31'].resample('YE').last().pct_change().dropna() for nm, s in (('kanał σ', P), ('SPY', spy), ('QQQ', qqq))})
lata.index = lata.index.year
Z['rok'] = Z.data.dt.year
out = ['# Etap 90: kanał odchylenia standardowego (2500 dni) — test strategii z filmu', '',
       'Spółki z USA ≥ 50 mld USD (kapitalizacja z poprzedniego miesiąca, ze spółkami usuniętymi z giełdy), ceny dzienne skorygowane o dywidendy. Kupno: pierwsze zamknięcie '
       'poniżej −3σ (top 10) / −4σ (pozostałe), kanał rosnący, dolna linia > 0; wyjście: zamknięcie ≥ linia regresji (najdłużej 36 mies.). Koszt 0,1 % na stronę. '
       'Analiza fundamentalna z AI z filmu nie jest testowana.', '',
       '## Zdarzenia (sygnały 2012-01..2025-10)', '', pd.DataFrame([opis(Z, 'kanał −3σ / −4σ'), opis(Z[Z.top10], '  w tym top 10 (−3σ)'), opis(Z[~Z.top10], '  w tym reszta (−4σ)'),
                                                                  opis(A, 'spadek ≥ 30 % od szczytu'), los]).to_markdown(index=False), '',
       '## Sygnały wg roku', '', Z.groupby('rok').agg(sygnałów=('k', 'size'), zwrot_średni=('zwrot', 'mean'), z_zyskiem=('zwrot', lambda x: (x > 0).mean())).round(3).to_markdown(), '',
       '## Wszystkie sygnały σ', '', Z.assign(data=Z.data.dt.date, zwrot=Z.zwrot.round(3), mae=Z.mae.round(3), r12=Z.r12.round(3))[['data', 'k', 'top10', 'zwrot', 'dni', 'linia', 'mae', 'r12']].to_markdown(index=False), '',
       '## Portfel (10 % konta na pozycję, najwyżej 10, gotówka 0 %)', '', pd.DataFrame(rows).to_markdown(index=False), '',
       f"Średnio zainwestowane: {INW.mean():.0%} konta (mediana {INW.median():.0%}); dni bez żadnej pozycji: {(INW < 0.01).mean():.0%}.", '',
       '### Zwroty roczne', '', lata.round(3).to_markdown(), '']
open(os.path.join(HERE, 'wyniki', 'r115_etap90.md'), 'w').write('\n'.join(out)); print('\n'.join(out[:12])); print('\n'.join(out[-12:]))
