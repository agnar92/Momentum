"""Etap 47: panel miesięczny parametrów Finviz (PIT) + zwroty naprzód -> /home/user/ndx/panel_finviz.parquet."""
import os, json, datetime as dt, numpy as np, pandas as pd
HERE = os.path.dirname(os.path.abspath(__file__))
exec(open(os.path.join(HERE, 'r19_cem10.py')).read().split('warianty = {')[0])   # best_map
Z = np.load('/home/user/ndx/wskazniki_cache.npz', allow_pickle=True)
Cv, U, EPS0, PE_, G1, GRW, RQ, ROE, DE, FCF, G5, S10 = (Z[k] for k in ('Cv', 'U', 'EPS0', 'PE_', 'G1', 'GRW', 'RQ', 'ROE', 'DE', 'FCF', 'G5', 'S10'))
ms = [pd.Period(x, 'M') for x in Z['mies']]; ser = list(Z['seria']); im_ = {m: i for i, m in enumerate(ms)}; cols = {s: j for j, s in enumerate(ser)}
NT, NS = Cv.shape
dd = lambda s: dt.date.fromisoformat(s)
r25 = open(os.path.join(HERE, 'r25_cem10_eps.py')).read(); exec(r25[r25.index('def kwartaly'):r25.index('\n\n\ncechy = {}')])
M0 = [m for m in ms if pd.Period('2011-01', 'M') <= m <= pd.Period('2026-09', 'M')]
TE = np.array([m.to_timestamp(how='end').value for m in M0])
# kapitalizacja PIT
A_ = pd.read_pickle('/home/user/eodhd-data/szeroki/A.pkl'); capm = np.load('/home/user/ndx/pit_cap2.npy'); acol = list(A_.columns)
CAP = np.full((NT, NS), np.nan)
for ia, mm in enumerate(A_.index):
    if mm not in im_ or mm < pd.Period('2010-01', 'M'): continue
    for k, v in zip(acol, capm[ia]):
        if np.isfinite(v):
            s_ = best_map.get((mm, k))
            if s_ in cols: CAP[im_[mm], cols[s_]] = v if not np.isfinite(CAP[im_[mm], cols[s_]]) else max(v, CAP[im_[mm], cols[s_]])
print('kapitalizacja', np.isfinite(CAP).sum(), flush=True)


def ttm_rows(q):
    """{end: (v, filed)} kwartały -> lista (end, ttm, znany) dla 4 kolejnych kwartałów."""
    e = sorted(q); out = []
    for i in range(3, len(e)):
        z = e[i - 3:i + 1]
        if all(75 <= (dd(z[k + 1]) - dd(z[k])).days <= 110 for k in range(3)):
            out.append((pd.Timestamp(z[-1]), sum(q[x][0] for x in z), max(pd.Timestamp(q[x][1]) for x in z)))
    return out


def seria_miesieczna(rows, lata=(0,)):
    """rows [(end, val, znany)] -> {lat: tablica wartości dla M0} (wartość z ostatnim end znanym do t, przesunięta o lat lat)."""
    out = {l: np.full(len(M0), np.nan) for l in lata}
    if not rows: return out
    rows = sorted(rows, key=lambda x: x[2]); zn = np.array([r[2].value for r in rows])
    byend = {}
    for e, v, z in rows:
        if e not in byend or z < byend[e][1]: byend[e] = (v, z)
    ends = np.array(sorted(byend)); vals = np.array([byend[e][0] for e in ends])
    best = None; k = 0; kn_end = []
    for ti, t in enumerate(TE):
        while k < len(rows) and zn[k] <= t:
            best = rows[k][0] if best is None or rows[k][0] > best else best; k += 1
        if best is None or (t - best.value) > 250 * 86400e9: continue
        for l in lata:
            tgt = best - pd.Timedelta(days=round(365.25 * l))
            ix = np.searchsorted(ends, tgt)
            for c in (ix - 1, ix):
                if 0 <= c < len(ends) and abs((ends[c] - tgt).days) <= 45: out[l][ti] = vals[c]; break
    return out


def inst_mies(rows):
    """[[None, end, val, filed]] -> wartość z najpóźniejszym end znanym do t (<= 250 dni)."""
    out = np.full(len(M0), np.nan)
    if not rows: return out
    R = sorted(((pd.Timestamp(f), pd.Timestamp(e), v) for _, e, v, f in rows), key=lambda x: x[0])
    best = None; k = 0
    for ti, t in enumerate(TE):
        while k < len(R) and R[k][0].value <= t:
            if best is None or R[k][1] > best[0]: best = (R[k][1], R[k][2])
            k += 1
        if best is not None and (t - best[0].value) <= 250 * 86400e9: out[ti] = best[1]
    return out


X = {nm: np.full((len(M0), NS), np.nan) for nm in ('rev', 'rev1', 'rev3', 'rev5', 'op', 'ni', 'gross', 'da', 'div', 'div1', 'assets', 'acur', 'lcur', 'inv', 'cash', 'ltd', 'eq', 'debt')}
EX = json.load(open('/home/user/ndx/sec_extra.json')); BIL = json.load(open('/home/user/ndx/bilans.json'))
idxM = {m: i for i, m in enumerate(M0)}
for fn in sorted(os.listdir('/home/user/ndx/sec_q')):
    k = fn[:-5].replace('.', '-'); d = json.load(open(os.path.join('/home/user/ndx/sec_q', fn)))
    if not d: continue
    jj = {}
    for m in M0:
        s_ = best_map.get((m, k))
        if s_ in cols: jj[idxM[m]] = cols[s_]
    if not jj: continue
    res = {}
    if 'rev' in d:
        r = seria_miesieczna(ttm_rows(kwartaly(d['rev']['rows'])), (0, 1, 3, 5)); res.update(rev=r[0], rev1=r[1], rev3=r[3], rev5=r[5])
    if 'opinc' in d: res['op'] = seria_miesieczna(ttm_rows(kwartaly(d['opinc']['rows'])))[0]
    b = BIL.get(k) or {}; e = EX.get(k) or {}
    if b.get('ni'): res['ni'] = seria_miesieczna(ttm_rows(kwartaly([[s1, e1, v1, f1] for s1, e1, v1, f1 in b['ni']])))[0]
    for nm in ('gross', 'da'):
        if e.get(nm): res[nm] = seria_miesieczna(ttm_rows(kwartaly([[s1, e1, v1, f1] for s1, e1, v1, f1 in e[nm]])))[0]
    if not e.get('gross') and e.get('cogs') and 'rev' in res:
        c = seria_miesieczna(ttm_rows(kwartaly([[s1, e1, v1, f1] for s1, e1, v1, f1 in e['cogs']])))[0]; res['gross'] = res['rev'] - c
    if e.get('div'):
        r = seria_miesieczna(ttm_rows(kwartaly([[s1, e1, v1, f1] for s1, e1, v1, f1 in e['div']])), (0, 1)); res['div'], res['div1'] = r[0], r[1]
    for nm, src in (('assets', 'assets'), ('acur', 'assets_cur'), ('lcur', 'liab_cur'), ('inv', 'inventory'), ('cash', 'cash'), ('ltd', 'ltd_nc')):
        if e.get(src): res[nm] = inst_mies(e[src])
    if b.get('eq'): res['eq'] = inst_mies([[None, e1, v1, f1] for e1, v1, f1 in b['eq']])
    for nm, v in res.items():
        for ti, j in jj.items(): X[nm][ti, j] = v[ti]
print('SEC gotowe', flush=True)
# macierze na pełnej osi ms
def pelna(A):
    B = np.full((NT, NS), np.nan); B[[im_[m] for m in M0]] = A; return B
P = {k: pelna(v) for k, v in X.items()}
lag = lambda A, k: np.vstack([np.full((k, NS), np.nan), A[:-k]])
pos = lambda A: np.where(A > 0, A, np.nan)
debt = np.where(np.isfinite(DE) & np.isfinite(P['eq']), DE * P['eq'], np.nan)
ev = CAP + np.nan_to_num(debt) - np.nan_to_num(P['cash'])
cagr = lambda a, b, n: np.where((a > 0) & (b > 0), (a / b) ** (1 / n) - 1, np.nan)
F = {
 'P/E': pos(PE_), 'E/P': np.where(CAP > 0, P['ni'] / CAP, np.nan), 'forward P/E (estymata)': np.where(EPS0 * (1 + GRW) > 0, Cv / (EPS0 * (1 + GRW)), np.nan),
 'PEG (EPS 5 lat)': np.where((PE_ > 0) & (G5 > 0), PE_ / (100 * G5), np.nan), 'PEG (estymata)': np.where((PE_ > 0) & (GRW > 0), PE_ / (100 * GRW), np.nan),
 'P/S': np.where(P['rev'] > 0, CAP / P['rev'], np.nan), 'P/B': np.where(P['eq'] > 0, CAP / P['eq'], np.nan), 'cena / gotówka': np.where(P['cash'] > 0, CAP / P['cash'], np.nan),
 'P/FCF': np.where(FCF > 0, CAP / FCF, np.nan), 'FCF yield': FCF / CAP, 'EV/Sales': np.where(P['rev'] > 0, ev / P['rev'], np.nan),
 'EV/EBITDA': np.where(P['op'] + np.nan_to_num(P['da']) > 0, ev / (P['op'] + np.nan_to_num(P['da'])), np.nan), 'stopa dywidendy': np.where(np.isfinite(P['div']), P['div'] / CAP, 0.0),
 'EPS TTM r/r': G1, 'EPS 3 lata (CAGR)': cagr(EPS0, lag(EPS0, 36), 3), 'EPS 5 lat (CAGR)': G5,
 'przychody kwartał r/r': RQ, 'przychody TTM r/r': np.where(P['rev1'] > 0, P['rev'] / P['rev1'] - 1, np.nan), 'przychody 3 lata (CAGR)': cagr(P['rev'], P['rev3'], 3),
 'przychody 5 lat (CAGR)': cagr(P['rev'], P['rev5'], 5), 'przychody (estymata ważona)': GRW, 'wzrost dywidendy r/r': np.where(P['div1'] > 0, P['div'] / P['div1'] - 1, np.nan),
 'ROA': np.where(P['assets'] > 0, P['ni'] / P['assets'], np.nan), 'ROE': ROE,
 'ROIC (przybliżenie)': np.where(P['eq'] + np.nan_to_num(debt) - np.nan_to_num(P['cash']) > 0, P['op'] * 0.79 / (P['eq'] + np.nan_to_num(debt) - np.nan_to_num(P['cash'])), np.nan),
 'marża brutto': np.where(P['rev'] > 0, P['gross'] / P['rev'], np.nan), 'marża operacyjna': np.where(P['rev'] > 0, P['op'] / P['rev'], np.nan),
 'marża netto': np.where(P['rev'] > 0, P['ni'] / P['rev'], np.nan), 'wypłata dywidendy / zysk': np.where(P['ni'] > 0, np.nan_to_num(P['div']) / P['ni'], np.nan),
 'current ratio': np.where(P['lcur'] > 0, P['acur'] / P['lcur'], np.nan), 'quick ratio': np.where(P['lcur'] > 0, (P['acur'] - np.nan_to_num(P['inv'])) / P['lcur'], np.nan),
 'dług / kapitał': DE, 'dług długoterminowy / kapitał': np.where(P['eq'] > 0, P['ltd'] / P['eq'], np.nan),
 'zwrot 3 mies.': Cv / lag(Cv, 3) - 1, 'zwrot 6 mies.': Cv / lag(Cv, 6) - 1, 'zwrot 12 mies.': Cv / lag(Cv, 12) - 1,
 'odległość od maks. 12 mies.': Cv / pd.DataFrame(Cv).rolling(12, min_periods=12).max().to_numpy() - 1, 'odległość od SMA 10 mies.': Cv / S10 - 1,
 'zmienność 12 mies.': pd.DataFrame(Cv / lag(Cv, 1) - 1).rolling(12, min_periods=10).std().to_numpy(), 'log kapitalizacji': np.log(pos(CAP))}
H = (1, 3, 6, 12, 24, 36, 60)
FW = {h: np.vstack([Cv[h:] / Cv[:-h] - 1, np.full((h, NS), np.nan)]) for h in H}
MAX60 = np.full((NT, NS), np.nan)
for i in range(NT - 1): MAX60[i] = np.nanmax(Cv[i + 1:i + 61], axis=0) / Cv[i] - 1
rows = []
for m in [m for m in M0 if m >= pd.Period('2012-01', 'M')]:
    i = im_[m]; ok = np.flatnonzero(U[i] & np.isfinite(Cv[i]) & np.isfinite(EPS0[i] if False else Cv[i]))
    ok = [j for j in ok if np.isfinite(PE_[:, j]).any()]
    for j in ok:
        r = {'m': str(m), 'seria': ser[j]}
        for nm, A in F.items(): r[nm] = A[i, j]
        for h in H: r[f'f{h}'] = FW[h][i, j]
        r['max60'] = MAX60[i, j] if i + 60 < NT else np.nan
        rows.append(r)
D = pd.DataFrame(rows).replace([np.inf, -np.inf], np.nan)
for h in H:
    D[f'e{h}'] = D[f'f{h}'] - D.groupby('m')[f'f{h}'].transform('mean')
D.to_parquet('/home/user/ndx/panel_finviz.parquet'); print('panel', D.shape, flush=True)
print(D[list(F)].notna().mean().round(2).to_string())
