"""Etap 107: top po fundamentach — wszystkie kryteria, najwyżej 10 spółek (Siła), przegląd w styczniu, vs SPY. Protokół: etap 107."""
import os
HERE = os.path.dirname(os.path.abspath(__file__))
_s95 = open(os.path.join(HERE, 'r120_etap95.py')).read()
exec(_s95[:_s95.index("L = sum(")])
import duckdb
LATA = list(range(2012, 2027))
# Siła także dla styczni 2024–2026 (r120 liczy tylko STARTY 2012–2023)
for r in LATA:
    m = pd.Period(f'{r}-01', 'M'); i = im_[m]
    if np.isfinite(SILA[i]).any(): continue
    cols = []
    for p, kier in SILA_P:
        v = X[p][i].copy(); ok = UNI[i] & np.isfinite(v)
        if p == 'de': ok &= v >= 0
        Pp = np.full(NS, np.nan)
        if ok.sum() >= 20:
            rk = pd.Series(v[ok]).rank(method='average').to_numpy(); Pp[ok] = (rk - 0.5) / ok.sum() if kier > 0 else 1 - (rk - 0.5) / ok.sum()
        cols.append(Pp)
    A = np.stack(cols); n_ = np.isfinite(A).sum(0)
    SILA[i] = np.where(n_ >= 2, 10 * (np.nansum(A, 0) + 0.5 * (len(SILA_P) - n_)) / len(SILA_P), np.nan)
J = J7 == 7
r5 = nz(X['rev_cagr5'], -9)
K77 = (np.power(1 + np.maximum(r5, -0.99), 5) - 1 > 0.5) & (nz(X['rev_1y'], -9) > 0.05) & (nz(X['ni_1y'], -9) > 0.05) & (nz(X['roe'], -9) > 0.15) \
      & (nz(X['de'], -1) >= 0) & (nz(X['de'], 9) < 1) & (nz(X['fcf_margin'], -1) > 0)
PEG02 = (nz(X['peg'], -1) > 0) & (nz(X['peg'], 9) < 2)
BEZ = np.isfinite(r1) & ~SPADEK
WAR = {'A: wszystko (Jakość 7/7 + 7/7 z PEG 0–2 + bez ⬇)': J & K77 & PEG02 & BEZ, 'B: Jakość 7/7 + 7/7 bez PEG + bez ⬇': J & K77 & BEZ,
       'C: B + Siła ≥ 7': J & K77 & BEZ & (nz(SILA, 0) >= 7)}
e = duckdb.connect('/home/user/ndx/db/eodhd.duckdb', read_only=True)
sp = e.execute("SELECT date, adjusted_close c FROM prices_valid WHERE ticker='SPY.US' ORDER BY date").df()
sp['m'] = pd.to_datetime(sp.date).dt.to_period('M'); SPY = sp.groupby('m').c.last()
OD, DO, KOSZT = pd.Period('2011-12', 'M'), pd.Period('2026-09', 'M'), 0.001
mies = [m for m in pd.period_range(OD, DO, freq='M')]


def portfel(M):
    wart, liczba, sklady, pop = [1.0], [], {}, set()
    for r in LATA:
        m0 = pd.Period(f'{r}-01', 'M'); i0 = im_[m0]
        kand = np.flatnonzero(M[i0] & UNI[i0] & np.isfinite(Cv[i0]) & (Cv[i0] > 0) & np.isfinite(SILA[i0]))
        kand = kand[np.argsort(-SILA[i0, kand])][:10]
        liczba.append(len(kand)); sklady[r] = [kod[j] for j in kand]
        nowe = set(kand.tolist())
        obrot = 1.0 if not pop else (len(nowe - pop) / max(1, len(nowe)) if nowe else 1.0)
        v = wart[-1] * (1 - KOSZT * 2 * obrot); pop = nowe
        # pozycje kupione na zamknięciu stycznia... uproszczenie: wejście po cenie z końca stycznia, wyjście z końcem kolejnego stycznia
        konc = min(pd.Period(f'{r + 1}-01', 'M'), DO)
        okres = pd.period_range(m0 + 1, konc, freq='M')
        if len(kand):
            q = {j: v / len(kand) / Cv[i0, j] for j in kand}
            for mm in okres:
                tot = 0.0
                for j, qq in q.items():
                    kol = Cv[im_[m0]:im_[mm] + 1, j]; ok = np.flatnonzero(np.isfinite(kol) & (kol > 0))
                    tot += qq * kol[ok[-1]]
                wart.append(tot)
        else:
            for mm in okres:
                wart.append(v * SPY[mm] / SPY[m0])
        if konc >= DO: break
    s = pd.Series(wart, index=[pd.Period('2012-01', 'M')] + list(pd.period_range('2012-02', DO, freq='M'))[:len(wart) - 1])
    return s, liczba, sklady


def opis(s):
    lat = (s.index[-1] - s.index[0]).n / 12
    po = pd.Period('2018-12', 'M')
    h1 = (s[po] / s.iloc[0]) ** (1 / ((po - s.index[0]).n / 12)) - 1; h2 = (s.iloc[-1] / s[po]) ** (1 / ((s.index[-1] - po).n / 12)) - 1
    ss = s.copy(); ss.index = ss.index.to_timestamp(how='end'); roczne = ss.resample('YE').last().pct_change().dropna()
    return (s.iloc[-1] / s.iloc[0]) ** (1 / lat) - 1, (s / s.cummax() - 1).min(), h1, h2, roczne


S = SPY.loc[pd.Period('2012-01', 'M'):DO]; S = S / S.iloc[0]
cs, dds, s1, s2, rs = opis(S)
rows = [{'portfel': 'SPY (S&P 500)', 'rocznie': f'{100 * cs:.1f} %', '10 tys. →': f'{10000 * S.iloc[-1]:,.0f}'.replace(',', ' '), 'obsunięcie': f'{100 * dds:.0f} %',
         'lata lepsze od SPY': '—', '2012–18': f'{100 * s1:.1f} %', '2019–26': f'{100 * s2:.1f} %', 'spółek (średnio)': '—'}]
SKL = {}
for nm, M in WAR.items():
    s, n, sk = portfel(M); SKL[nm] = sk
    c, dd, h1, h2, ro = opis(s); lep = int((ro.values > rs.reindex(ro.index).values).sum())
    rows.append({'portfel': nm, 'rocznie': f'{100 * c:.1f} %', '10 tys. →': f'{10000 * s.iloc[-1] / s.iloc[0]:,.0f}'.replace(',', ' '), 'obsunięcie': f'{100 * dd:.0f} %',
                 'lata lepsze od SPY': f'{lep}/{len(ro)}', '2012–18': f'{100 * h1:.1f} %', '2019–26': f'{100 * h2:.1f} %', 'spółek (średnio)': f'{np.mean(n):.1f} (min {min(n)})'})
    print(rows[-1], flush=True)
T = pd.DataFrame(rows)
sk_txt = []
for nm, sk in SKL.items():
    sk_txt += [f'### {nm}', ''] + [f'- {r}: {", ".join(v) if v else "(brak — SPY)"}' for r, v in sk.items()] + ['']
out = ['# Etap 107: top po fundamentach — wszystkie kryteria, najwyżej 10 spółek, przegląd w styczniu', '',
       'Top 500 USA PIT bez wykluczonych sektorów; kolejność wg Siły finansowej; równe wagi; ceny z dywidendami; koszt 0,1 % na stronę; brak spółek → SPY.', '',
       T.to_markdown(index=False), '', '## Składy', ''] + sk_txt
open(os.path.join(HERE, 'wyniki', 'r132_etap107.md'), 'w').write('\n'.join(out)); print('\n'.join(out[:14]))
