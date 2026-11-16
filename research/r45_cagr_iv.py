"""Etap 27 (bazuje na r42/r39): forward PEG i wartość z CAGR od początku danych, z korektą.
Etap 23: P/E względem wzrostu zysku (PEG) vs niskie P/E vs CEM10, S&P 500 z danymi SEC, 2011-2026 (protokół etap 23)."""
import os, json, warnings, duckdb, numpy as np, pandas as pd
warnings.filterwarnings('ignore')
HERE = os.path.dirname(os.path.abspath(__file__))
exec(open(os.path.join(HERE, 'r25_cem10_eps.py')).read().split('cechy = {}')[0])   # C, S10, SP, R6m, blok, kwartaly, SECQ, best_map, p, etf, spy_bear
KOSZT, OD, DO, POL = 0.001, pd.Period('2011-01', 'M'), pd.Period('2026-09', 'M'), pd.Period('2018-12', 'M')
mies = [m for m in C.index if OD - 1 <= m <= DO]
con = duckdb.connect(DB, read_only=True)

# --- EPS kwartalny -> baza ceny skorygowanej ---
Q = {}
for fn in os.listdir(SECQ):
    d = json.load(open(os.path.join(SECQ, fn)))
    if not d or 'eps' not in d: continue
    q = kwartaly(d['eps']['rows'])
    if len(q) >= 8: Q[fn[:-5].replace('.', '-')] = q
tick = [k + '.US' for k in Q]
px = con.execute("SELECT ticker, date, close, adj FROM dc WHERE ticker IN (SELECT unnest(?::VARCHAR[])) AND date >= '2005-01-01'", [tick]).df()
px['date'] = pd.to_datetime(px.date); px['f'] = px.adj / px.close
FAK = {t[:-3]: g.set_index('date').f.sort_index() for t, g in px.groupby('ticker')}
print('spółki SEC', len(Q), 'z cenami', len(FAK), flush=True)
rek = []
for k, q in Q.items():
    fs = FAK.get(k)
    if fs is None: continue
    for e, (v, f) in q.items():
        fa = fs.asof(pd.Timestamp(f))
        if np.isfinite(fa): rek.append((k, pd.Timestamp(e), v * fa, pd.Timestamp(f)))
E = pd.DataFrame(rek, columns=['kod', 'end', 'eps', 'filed']).sort_values(['kod', 'end']).reset_index(drop=True)


def ttm_serie(g):
    """dla każdego kwartału: TTM z 4 kolejnych (odstępy 75-110 dni), data znajomości = max(filed)."""
    g = g.reset_index(drop=True); out = []
    for i in range(3, len(g)):
        z = g.iloc[i - 3:i + 1]
        if all(75 <= (z.end.iloc[j + 1] - z.end.iloc[j]).days <= 110 for j in range(3)):
            out.append((g.end[i], z.eps.sum(), z.filed.max()))
    return pd.DataFrame(out, columns=['end', 'ttm', 'zn'])


TT = {k: ttm_serie(g) for k, g in E.groupby('kod')}
cols = {s: j for j, s in enumerate(C.columns)}; im_ = {m: i for i, m in enumerate(C.index)}
NT, NS = len(C.index), len(C.columns)
PE, G1, G3, FPEG = (np.full((NT, NS), np.nan) for _ in range(4))
Cv = C.to_numpy()
for k, T in TT.items():
    if len(T) < 5: continue
    T = T.set_index('end')
    for m in mies:
        s = best_map.get((m, k))
        if s is None or s not in cols: continue
        i, j = im_[m], cols[s]; kon = m.to_timestamp(how='end')
        zn = T[T.zn <= kon]
        if zn.empty: continue
        e0 = zn.index[-1]; t0 = zn.ttm.iloc[-1]
        if (kon - e0).days > 200 or t0 <= 0 or not np.isfinite(Cv[i, j]): continue
        PE[i, j] = Cv[i, j] / t0
        def wst(dni):
            c = T[(T.index <= e0 - pd.Timedelta(days=dni - 45)) & (T.index >= e0 - pd.Timedelta(days=dni + 45))]
            return c.ttm.iloc[-1] if len(c) else np.nan
        a1, a3 = wst(365), wst(3 * 365)
        if a1 > 0: G1[i, j] = t0 / a1 - 1
        if a3 > 0: G3[i, j] = (t0 / a3) ** (1 / 3) - 1
        fw = T[(T.index >= e0 + pd.Timedelta(days=320)) & (T.index <= e0 + pd.Timedelta(days=410))]   # TTM za 4 kw. naprzód (faktyczny)
        if len(fw) and fw.ttm.iloc[0] > 0:
            gf = fw.ttm.iloc[0] / t0 - 1
            if 0.10 <= gf <= 1.0: FPEG[i, j] = (Cv[i, j] / fw.ttm.iloc[0]) / (100 * gf)
print('wskaźniki gotowe', flush=True)

import statsmodels.formula.api as smf
GC = np.full((NT, NS), np.nan); EPS0 = np.full((NT, NS), np.nan); PARY = []
DECm = [m for m in mies if m.month in (2, 5, 8, 11)]
for k, T in TT.items():
    if len(T) < 5: continue
    T = T.set_index('end')
    for m in DECm:
        s = best_map.get((m, k))
        if s is None or s not in cols: continue
        i, j = im_[m], cols[s]
        if not np.isfinite(PE[i, j]): continue
        kon = m.to_timestamp(how='end'); zn = T[T.zn <= kon]; e0 = zn.index[-1]; t0 = zn.ttm.iloc[-1]
        poz = zn[zn.ttm > 0]
        if poz.empty: continue
        st = poz.index[0]; lat = (e0 - st).days / 365.25
        if lat < 3: continue
        g = (t0 / poz.ttm.iloc[0]) ** (1 / lat) - 1
        GC[i, j] = g; EPS0[i, j] = Cv[i, j] / PE[i, j]
        fw = T[(T.index >= e0 + pd.Timedelta(days=320)) & (T.index <= e0 + pd.Timedelta(days=410))]
        if len(fw): PARY.append((m, fw.zn.iloc[0].to_period('M'), g, fw.ttm.iloc[0] / t0 - 1, i, j))
PARY = pd.DataFrame(PARY, columns=['m', 'znany', 'g', 'fakt', 'i', 'j'])
PARY = PARY[PARY.fakt.abs() < 10]
print('CAGR od początku gotowy, par', len(PARY), flush=True)
GK = np.full((NT, NS), np.nan); KAL = []
for m in DECm:
    X = PARY[PARY.znany <= m]
    if len(X) < 500: continue
    f = smf.quantreg('fakt ~ g', X.assign(g=X.g.clip(-1, 2), fakt=X.fakt.clip(-3, 3))).fit(q=0.5)
    a, b = f.params['Intercept'], f.params['g']; KAL.append((str(m), a, b, len(X)))
    i = im_[m]; GK[i] = a + b * np.clip(GC[i], -1, 2)
gp = np.where(GC > 0, GC, np.nan); gkp = np.where(GK > 0, GK, np.nan)
POT = EPS0 * 100 * gp / Cv - 1                               # IV / cena - 1
POTK = EPS0 * 100 * gkp / Cv - 1
FPEG = (Cv / (EPS0 * (1 + gp))) / (100 * gp)
FPEG = np.where(EPS0 > 0, FPEG, np.nan)

U = np.zeros((NT, NS), bool)
for m, ss in SP.items():
    if m in im_: U[im_[m], [cols[s] for s in ss if s in cols]] = True
pe_ok = np.where(PE <= 100, PE, np.nan)
zSEC = ~np.isnan(PE).all(axis=0)
pokr = [U[im_[m]].sum() for m in mies]; pokrS = [(U[im_[m]] & np.isfinite(PE[im_[m]])).sum() for m in mies]
print('członków S&P / z P/E: śr.', np.mean(pokr), np.mean(pokrS), flush=True)
DEC = {m for m in mies if m.month in (2, 5, 8, 11)}


def sim(X, N=20, niski=True):
    poz, got, eq = {}, 1.0, []
    for a, m in enumerate(mies[:-1]):
        i = im_[m]; nx = mies[a + 1]; i1 = im_[nx]
        if m in DEC:
            ok = U[i] & np.isfinite(X[i]) & np.isfinite(Cv[i])
            kand = np.flatnonzero(ok); kand = kand[np.argsort(X[i, kand] if niski else -X[i, kand])]
            top2 = set(kand[:2 * N])
            for j in list(poz):
                if j not in top2: got += poz.pop(j) * (1 - KOSZT)
            e = got + sum(poz.values())
            for j in kand:
                if len(poz) >= N: break
                if j in poz: continue
                kw = min(e / N, got)
                if kw <= 1e-9: break
                got -= kw; poz[j] = kw * (1 - KOSZT)
        for j in list(poz):
            if np.isfinite(Cv[i1, j]) and np.isfinite(Cv[i, j]): poz[j] *= Cv[i1, j] / Cv[i, j]
            else: got += poz.pop(j) * (1 - KOSZT)
        eq.append((nx, got + sum(poz.values())))
    return pd.Series(dict(eq))


def cem10(N=10):
    poz, got, eq = {}, 1.0, []
    for a, m in enumerate(mies[:-1]):
        i = im_[m]; nx = mies[a + 1]; i1 = im_[nx]; c = Cv[i]; s10 = S10.to_numpy()[i]; r6 = R6m.to_numpy()[i]
        for j in list(poz):
            if not np.isfinite(c[j]) or c[j] < s10[j]: got += poz.pop(j) * (1 - KOSZT)
        if not spy_bear.get(m, False):
            ok = U[i] & zSEC & np.isfinite(c) & (c > s10) & (np.nan_to_num(r6, nan=-9) > 0.30)
            kand = np.flatnonzero(ok); kand = kand[np.argsort(-r6[kand])]; e = got + sum(poz.values())
            for j in kand:
                if len(poz) >= N: break
                if j in poz: continue
                kw = min(e / N, got)
                if kw <= 1e-9: break
                got -= kw; poz[j] = kw * (1 - KOSZT)
        for j in list(poz):
            if np.isfinite(Cv[i1, j]) and np.isfinite(Cv[i, j]): poz[j] *= Cv[i1, j] / Cv[i, j]
            else: got += poz.pop(j) * (1 - KOSZT)
        eq.append((nx, got + sum(poz.values())))
    return pd.Series(dict(eq))


def rowne():
    v, eq = 1.0, []
    for a, m in enumerate(mies[:-1]):
        i = im_[m]; i1 = im_[mies[a + 1]]
        ok = U[i] & zSEC & np.isfinite(Cv[i]) & np.isfinite(Cv[i1])
        v *= 1 + np.mean(Cv[i1, ok] / Cv[i, ok] - 1); eq.append((mies[a + 1], v))
    return pd.Series(dict(eq))


def cg(e, od=None, do=None):
    e = pd.concat([pd.Series({mies[0]: 1.0}), e])
    if od: e = e[e.index >= od]
    if do: e = e[e.index <= do]
    return (e.iloc[-1] / e.iloc[0]) ** (12 / (len(e) - 1)) - 1




def sim_prog(X, prog=1.0):
    v, eq, w = 1.0, [], {}
    for a, m in enumerate(mies[:-1]):
        i = im_[m]; i1 = im_[mies[a + 1]]
        if m in DEC or not w:
            ok = np.flatnonzero(U[i] & np.isfinite(X[i]) & (X[i] < prog) & np.isfinite(Cv[i]))
            nowe = set(ok); stare = set(w)
            obrot = len(nowe ^ stare) / max(len(nowe | stare), 1)
            v *= 1 - KOSZT * 2 * obrot
            w = {j: 1 / len(ok) for j in ok} if len(ok) else {}
        if w:
            r = [Cv[i1, j] / Cv[i, j] - 1 if np.isfinite(Cv[i1, j]) else 0.0 for j in w]
            v *= 1 + np.mean(r)
        eq.append((mies[a + 1], v))
    return pd.Series(dict(eq))


def cem10_f(F, N=10):
    poz, got, eq = {}, 1.0, []
    S10v = S10.to_numpy(); R6v = R6m.to_numpy()
    for a, m in enumerate(mies[:-1]):
        i = im_[m]; nx = mies[a + 1]; i1 = im_[nx]; c = Cv[i]
        for j in list(poz):
            if not np.isfinite(c[j]) or c[j] < S10v[i, j]: got += poz.pop(j) * (1 - KOSZT)
        if not spy_bear.get(m, False):
            ok = U[i] & zSEC & np.isfinite(c) & (c > S10v[i]) & (np.nan_to_num(R6v[i], nan=-9) > 0.30) & F[i]
            kand = np.flatnonzero(ok); kand = kand[np.argsort(-R6v[i, kand])]; e = got + sum(poz.values())
            for j in kand:
                if len(poz) >= N: break
                if j in poz: continue
                kw = min(e / N, got)
                if kw <= 1e-9: break
                got -= kw; poz[j] = kw * (1 - KOSZT)
        for j in list(poz):
            if np.isfinite(Cv[i1, j]) and np.isfinite(Cv[i, j]): poz[j] *= Cv[i1, j] / Cv[i, j]
            else: got += poz.pop(j) * (1 - KOSZT)
        eq.append((nx, got + sum(poz.values())))
    return pd.Series(dict(eq))



K_ = {'top 20 najwyższy potencjał IV (= najniższy PEG trailing)': sim(-POT), 'top 20 najniższy forward PEG': sim(FPEG),
      'wszystkie z IV > cena': sim_prog(-POT, 0.0), 'wszystkie z forward PEG < 1': sim_prog(FPEG, 1.0),
      'top 20 najwyższy potencjał IV z korektą': sim(-POTK), 'CEM10 (to samo uniwersum, N = 10)': cem10()}
ew = rowne(); K_['równe wagi uniwersum'] = ew
sp_ = etf['SPY'][(etf['SPY'].index >= mies[0]) & (etf['SPY'].index <= DO)]; K_['SPY'] = (sp_ / sp_.iloc[0])[1:]
rows = []
for nm, e in K_.items():
    d = (e.pct_change() - ew.pct_change()).dropna()
    lo, hi = blok(d.values) if nm != 'równe wagi uniwersum' else (0, 0)
    c1, c2, b1, b2 = cg(e, None, POL), cg(e, POL), cg(ew, None, POL), cg(ew, POL)
    rows.append(dict(strategia=nm, CAGR=cg(e), CAGR_2011_18=c1, CAGR_2019_26=c2, maxDD=(e / e.cummax() - 1).min(),
                     roznica_vs_rowne=f'{d.mean()*100:+.2f} ({lo*100:.2f}…{hi*100:.2f})', z_10k=round(10000 * e.iloc[-1]),
                     lepszy=(nm.startswith('top') or nm.startswith('wszystkie')) and c1 > b1 and c2 > b2 and lo > 0))
T = pd.DataFrame(rows)
# trafność
from scipy import stats
tr = []
for nm, G in (('g = CAGR od początku', GC), ('g z korektą', GK)):
    ic, err = [], []
    for m in DECm:
        X = PARY[PARY.m == m]
        if len(X) < 30: continue
        gg = G[X.i.values, X.j.values]; ok = np.isfinite(gg)
        if ok.sum() < 30: continue
        ic.append(stats.spearmanr(gg[ok], X.fakt.values[ok])[0]); err += list(np.abs(X.fakt.values[ok] - gg[ok]))
    ic = np.array(ic)
    tr.append(dict(co='wzrost EPS za rok', prognoza=nm, IC=ic.mean(), IC_t=ic.mean() / ic.std() * np.sqrt(len(ic)), mediana_bledu_pp=100 * np.median(err)))
for nm, Pm in (('potencjał IV', POT), ('potencjał IV z korektą', POTK)):
    ic, dec = [], []
    for m in DECm:
        if m + 12 > DO: continue
        i, i12 = im_[m], im_[m + 12]
        ok = np.flatnonzero(U[i] & np.isfinite(Pm[i]) & np.isfinite(Cv[i12]) & np.isfinite(Cv[i]))
        if len(ok) < 30: continue
        f = Cv[i12, ok] / Cv[i, ok] - 1; ic.append(stats.spearmanr(Pm[i, ok], f)[0])
        q = pd.qcut(pd.Series(Pm[i, ok]).rank(method='first'), 5, labels=False) + 1
        dec += list(zip(q, Pm[i, ok], f))
    ic = np.array(ic); D = pd.DataFrame(dec, columns=['kwintyl', 'potencjal', 'fakt'])
    tr.append(dict(co='zmiana ceny za rok', prognoza=nm, IC=ic.mean(), IC_t=ic.mean() / ic.std() * np.sqrt(len(ic)),
                   mediana_bledu_pp=100 * (D.fakt - D.potencjal).abs().median()))
    if nm == 'potencjał IV': KW = D.groupby('kwintyl').agg(potencjal_mediana=('potencjal', 'median'), cena_za_rok_mediana=('fakt', 'median'), n=('fakt', 'size'))
TR = pd.DataFrame(tr)
KA = pd.DataFrame(KAL, columns=['data', 'a', 'b', 'par']).iloc[::8]
i = im_[pd.Period('2026-08', 'M')]; ok = np.flatnonzero(U[i] & np.isfinite(POT[i])); ok = ok[np.argsort(-POT[i, ok])][:20]
ost = pd.DataFrame({'seria': C.columns[ok], 'cena': Cv[i, ok], 'EPS': EPS0[i, ok], 'CAGR_od_poczatku_%': 100 * GC[i, ok], 'IV': EPS0[i, ok] * 100 * GC[i, ok],
                    'potencjal_%': 100 * POT[i, ok], 'forward_PEG': FPEG[i, ok], 'g_kor_%': 100 * GK[i, ok]})
out = ['# Etap 27: forward PEG i wartość wewnętrzna z CAGR od początku danych (z korektą), S&P 500 z danymi SEC, 2011-2026', '',
       '## Portfele', '', T.round(3).to_markdown(index=False), '', '## Trafność prognoz', '', TR.round(3).to_markdown(index=False), '',
       'Potencjał IV a cena za rok (kwintyle):', '', KW.round(3).to_markdown(), '',
       '## Korekta: faktyczny wzrost = a + b x g (regresja mediany na danych znanych do daty)', '', KA.round(3).to_markdown(index=False), '',
       '## Największy potencjał IV na koniec sierpnia 2026 (top 20)', '', ost.round(2).to_markdown(index=False), '']
open(os.path.join(HERE, 'wyniki', 'r45_cagr_iv.md'), 'w').write('\n'.join(out)); print('\n'.join(out))
