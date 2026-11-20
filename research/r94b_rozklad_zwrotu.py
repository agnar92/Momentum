"""Etap 69b: skąd zwrot (lub jego brak) spółek we wzorcach: rozkład zwrotu 36 mies. na wzrost przychodów, zysku i zmianę wyceny (P/S, P/E)."""
import os, json, pickle, datetime as dt, numpy as np, pandas as pd
HERE = os.path.dirname(os.path.abspath(__file__)); SZ = '/home/user/ndx/szer'
dd = lambda s: dt.date.fromisoformat(s)
r25 = open(os.path.join(HERE, 'r25_cem10_eps.py')).read(); exec(r25[r25.index('def kwartaly'):r25.index('\n\n\ncechy = {}')])
r39 = open(os.path.join(HERE, 'r39_peg.py')).read(); exec(r39[r39.index('def ttm_serie'):r39.index('\n\n\nTT = {k:')])
Z = np.load(f'{SZ}/cache.npz', allow_pickle=True); Cv, U = Z['Cv'], Z['U'].astype(bool)
ms = [pd.Period(x, 'M') for x in Z['mies']]; ser = [str(s) for s in Z['seria']]; im_ = {m: i for i, m in enumerate(ms)}
kod = [s.split('.US')[0] for s in ser]
P_, S_, G0, _ = pickle.load(open(f'{SZ}/wzorce.pkl', 'rb'))
CAP = pd.read_pickle(f'{SZ}/cap.pkl'); CAP.columns = [c.split('#')[0] for c in CAP.columns]; CAP = CAP.T.groupby(level=0).max().T
BIL = json.load(open(f'{SZ}/bilans.json'))
def ttm(rows):
    q = kwartaly(rows)
    if len(q) < 8: return None
    g = pd.DataFrame([(pd.Timestamp(e), v, pd.Timestamp(f)) for e, (v, f) in q.items()], columns=['end', 'eps', 'filed']).sort_values('end')
    T = ttm_serie(g); return T.sort_values('zn') if len(T) else None
def znane(T, t):
    if T is None: return np.nan
    z = T[T.zn <= t]
    return z.sort_values('end').ttm.iloc[-1] if len(z) and (t - z.end.max()).days <= 200 else np.nan
mies = [m for m in ms if pd.Period('2012-01', 'M') <= m <= pd.Period('2023-09', 'M')]
rows = []; cache = {}
rng = np.random.default_rng(1)
for j, k in enumerate(kod):
    if k not in CAP.columns: continue
    if k not in cache:
        p = f'{SZ}/sec_q/{k}.json'
        d = json.load(open(p)) if os.path.exists(p) else {}
        R = ttm(d['rev']['rows']) if 'rev' in d else None
        ni = (BIL.get(k) or {}).get('ni'); N = ttm([[a, b, c, f] for a, b, c, f in ni]) if ni else None
        cache[k] = (R, N)
    R, N = cache[k]
    if R is None: continue
    for m in mies:
        i = im_[m]
        if not U[i, j]: continue
        wz = 'PARABOLA' if P_[i, j] else 'STABILNY' if S_[i, j] else ('wszystkie' if rng.random() < 0.15 else None)
        if wz is None: continue
        i2 = im_[m + 36]
        if not (np.isfinite(Cv[i, j]) and np.isfinite(Cv[i2, j])): continue
        t0, t1 = m.to_timestamp(how='end'), (m + 36).to_timestamp(how='end')
        r0, r1, n0, n1 = znane(R, t0), znane(R, t1), znane(N, t0), znane(N, t1)
        c0, c1 = CAP.get(k, pd.Series()).get(m, np.nan), CAP.get(k, pd.Series()).get(m + 36, np.nan)
        rows.append(dict(wzorzec=wz, cena=Cv[i2, j] / Cv[i, j] - 1, przychody=r1 / r0 - 1 if r0 > 0 else np.nan, zysk=n1 / n0 - 1 if n0 > 0 and n1 > 0 else np.nan,
                         PS0=c0 / r0 if r0 > 0 else np.nan, PS1=c1 / r1 if r1 > 0 else np.nan, PE0=c0 / n0 if n0 > 0 else np.nan, PE1=c1 / n1 if n1 > 0 else np.nan))
D = pd.DataFrame(rows)
D['zmiana_PS'] = D.PS1 / D.PS0 - 1; D['zmiana_PE'] = D.PE1 / D.PE0 - 1
T = D.groupby('wzorzec').agg(obserwacji=('cena', 'size'), cena_mediana=('cena', 'median'), przychody_mediana=('przychody', 'median'), zysk_mediana=('zysk', 'median'),
                             PS_na_starcie=('PS0', 'median'), PE_na_starcie=('PE0', 'median'), zmiana_PS_mediana=('zmiana_PS', 'median'), zmiana_PE_mediana=('zmiana_PE', 'median'))
out = ['# Etap 69b: rozkład zwrotu 36 mies. (starty 2012-01..2023-09, top 500 USA): wzrost przychodów i zysku vs zmiana wyceny', '',
       '„wszystkie” = losowa próbka 15 % obserwacji wszystkich spółek top 500 (odniesienie). Zwrot ceny ≈ wzrost przychodów × zmiana P/S (≈ wzrost zysku × zmiana P/E).', '',
       T.round(3).to_markdown(), '']
open(os.path.join(HERE, 'wyniki', 'r94b_rozklad_zwrotu.md'), 'w').write('\n'.join(out)); print('\n'.join(out))
