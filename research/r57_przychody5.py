"""Etap 36: ranking po przychodach / EPS z 5 lat, dług < 1, PEG jako moment wejścia.
Etap 30:
Etap 29c:
Etap 29: strategia użytkownika - PEG <= 1, top N po IV, roczna przebudowa, kwartalne przycinanie.
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


GF = np.full((NT, NS), np.nan); GC = np.full((NT, NS), np.nan); EPS0 = np.full((NT, NS), np.nan)
DECm = list(mies)
for k, T in TT.items():
    if len(T) < 5: continue
    T = T.set_index('end')
    for m in DECm:
        s = best_map.get((m, k))
        if s is None or s not in cols: continue
        i, j = im_[m], cols[s]
        if not np.isfinite(PE[i, j]): continue
        kon = m.to_timestamp(how='end'); zn = T[T.zn <= kon]; e0 = zn.index[-1]; t0 = zn.ttm.iloc[-1]
        EPS0[i, j] = Cv[i, j] / PE[i, j]
        poz_ = zn[zn.ttm > 0]
        if len(poz_):
            lat = (e0 - poz_.index[0]).days / 365.25
            if lat >= 3: GC[i, j] = (t0 / poz_.ttm.iloc[0]) ** (1 / lat) - 1
        fw = T[(T.index >= e0 + pd.Timedelta(days=320)) & (T.index <= e0 + pd.Timedelta(days=410))]
        if len(fw) and abs(fw.ttm.iloc[0] / t0 - 1) < 10: GF[i, j] = fw.ttm.iloc[0] / t0 - 1
print('wzrost faktyczny gotowy', np.isfinite(GF).sum(), flush=True)

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





rng_ = np.random.default_rng(20261116); Z = rng_.standard_normal((NT, NS))
GW = {'A: CAGR EPS od początku (realne)': GC, 'B: jak analityk, błąd 10 pp (nierealne)': GF + 0.05 + 0.10 * Z}


def wskazniki(G):
    g = np.where(G > 0, G, np.nan)
    pot = EPS0 * 100 * g / Cv - 1
    peg_ = (Cv / (EPS0 * (1 + g))) / (100 * g)
    ok = (EPS0 > 0) & (peg_ <= 1) & (pot > 0)
    return np.where(ok, pot, np.nan)


def strat(P_, N, L, regula):
    poz, got, eq = {}, 1.0, []
    for a, m in enumerate(mies[:-1]):
        i = im_[m]; i1 = im_[mies[a + 1]]
        if m.month in (2, 5, 8, 11) and L is not None:
            e = got + sum(poz.values())
            for j in poz:
                if poz[j] > L * e: x = poz[j] - L * e; poz[j] -= x; got += x * (1 - KOSZT)
        if m.month == 2:
            ok = np.flatnonzero(U[i] & np.isfinite(P_[i]) & np.isfinite(Cv[i])); ok = ok[np.argsort(-P_[i, ok])]
            topN = set(ok[:N])
            for j in list(poz):
                trzymaj = np.isfinite(P_[i, j]) if regula == 'R1' else j in topN
                if not trzymaj: got += poz.pop(j) * (1 - KOSZT)
            e = got + sum(poz.values())
            for j in ok:
                if len(poz) >= N: break
                if j in poz: continue
                kw = min(e / N, got)
                if kw <= 1e-9: break
                got -= kw; poz[j] = kw * (1 - KOSZT)
        for j in list(poz):
            if np.isfinite(Cv[i1, j]) and np.isfinite(Cv[i, j]): poz[j] *= Cv[i1, j] / Cv[i, j]
            else: got += poz.pop(j) * (1 - KOSZT)
        eq.append((mies[a + 1], got + sum(poz.values())))
    return pd.Series(dict(eq))



CZ = {'co miesiąc': set(range(1, 13)), 'co kwartał': {2, 5, 8, 11}, 'raz w roku': {2}}


def strat2(P_, N, miesiace, regula):
    poz, got, eq = {}, 1.0, []
    for a, m in enumerate(mies[:-1]):
        i = im_[m]; i1 = im_[mies[a + 1]]
        if m.month in miesiace:
            ok = np.flatnonzero(U[i] & np.isfinite(P_[i]) & np.isfinite(Cv[i])); ok = ok[np.argsort(-P_[i, ok])]
            top2 = set(ok[:2 * N])
            for j in list(poz):
                trzymaj = np.isfinite(P_[i, j]) if regula == 'R1' else j in top2
                if not trzymaj: got += poz.pop(j) * (1 - KOSZT)
            e = got + sum(poz.values())
            for j in ok:
                if len(poz) >= N: break
                if j in poz: continue
                kw = min(e / N, got)
                if kw <= 1e-9: break
                got -= kw; poz[j] = kw * (1 - KOSZT)
        for j in list(poz):
            if np.isfinite(Cv[i1, j]) and np.isfinite(Cv[i, j]): poz[j] *= Cv[i1, j] / Cv[i, j]
            else: got += poz.pop(j) * (1 - KOSZT)
        eq.append((mies[a + 1], got + sum(poz.values())))
    return pd.Series(dict(eq))



# --- przychody kwartalne -> zmiana r/r z datą znajomości ---
GRW = np.full((NT, NS), np.nan); GRA = np.full((NT, NS), np.nan); RQ = np.full((NT, NS), np.nan)
WAGI = np.array([0.1, 0.2, 0.3, 0.4])
nk = 0
for fn in os.listdir(SECQ):
    d = json.load(open(os.path.join(SECQ, fn)))
    if not d or 'rev' not in d: continue
    k = fn[:-5].replace('.', '-')
    q = kwartaly(d['rev']['rows'])
    if len(q) < 8: continue
    Q_ = pd.DataFrame([(pd.Timestamp(e), v, pd.Timestamp(f)) for e, (v, f) in q.items()], columns=['end', 'rev', 'filed']).sort_values('end').reset_index(drop=True)
    yy, zn = [], []
    for i in range(len(Q_)):
        j = [x for x in range(i) if 340 <= (Q_.end[i] - Q_.end[x]).days <= 390]
        if j and Q_.rev[j[-1]] > 0:
            yy.append(Q_.rev[i] / Q_.rev[j[-1]] - 1); zn.append(max(Q_.filed[i], Q_.filed[j[-1]]))
        else:
            yy.append(np.nan); zn.append(Q_.filed[i])
    Q_['yy'] = yy; Q_['zn'] = zn
    nk += 1
    for m in DECm:
        s_ = best_map.get((m, k))
        if s_ is None or s_ not in cols: continue
        i, j = im_[m], cols[s_]
        Z_ = Q_[Q_.zn <= m.to_timestamp(how='end')].tail(4)
        if len(Z_) < 4 or not np.isfinite(Z_.yy).all(): continue
        if not all(75 <= (Z_.end.iloc[x + 1] - Z_.end.iloc[x]).days <= 110 for x in range(3)): continue
        if (m.to_timestamp(how='end') - Z_.end.iloc[-1]).days > 200: continue
        GRW[i, j] = float(np.dot(WAGI, Z_.yy.values)); GRA[i, j] = float(Z_.yy.mean()); RQ[i, j] = float(Z_.yy.values[-1])
print('przychody: spółek', nk, 'wartości', np.isfinite(GRW).sum(), flush=True)

PE_ = np.where(EPS0 > 0, Cv / EPS0, np.nan)
# mediana P/E z 36 mies. (bez bieżącego? z bieżącym), min. 12 obserwacji
MPE = pd.DataFrame(PE_).rolling(36, min_periods=12).median().to_numpy()
PT = MPE * EPS0 * (1 + GRW)
PEGu = np.where((EPS0 > 0) & (GRW > 0), PE_ / (100 * GRW), np.nan)
KAND = (EPS0 > 0) & (G1 >= 0.25) & (GRW >= 0.25) & (PEGu <= 1)
lag3 = lambda X: np.vstack([np.full((3, NS), np.nan), X[:-3]])
G1_3, GRW_3, PT_3 = lag3(G1), lag3(GRW), lag3(PT)
print('kandydaci (miesiąc): mediana', np.median(KAND.sum(axis=1)[im_[mies[0]]:]), flush=True)


# --- bilans z SEC (r55a_sec_bilans.py) -> ROE i dług / kapitał na koniec każdego miesiąca ---
BIL = json.load(open('/home/user/ndx/bilans.json'))
ROE = np.full((NT, NS), np.nan); DE = np.full((NT, NS), np.nan)
kon = {m: m.to_timestamp(how='end') for m in DECm}


def ostatni(rows, t):
    """[[end, val, filed]] -> wartość z najpóźniejszym end wśród znanych do t (dla end bierzemy najwcześniej złożoną)."""
    best = {}
    for e, v, f in rows:
        if pd.Timestamp(f) <= t and (e not in best or f < best[e][1]): best[e] = (v, f)
    if not best: return None, None
    e = max(best); return pd.Timestamp(e), best[e][0]


nb = 0
for k, d in BIL.items():
    if not d or not d.get('eq'): continue
    q = kwartaly([[s_, e_, v_, f_] for s_, e_, v_, f_ in d.get('ni', [])])
    NIq = pd.DataFrame([(pd.Timestamp(e), v, pd.Timestamp(f)) for e, (v, f) in q.items()], columns=['end', 'eps', 'filed']).sort_values('end')
    NIt = ttm_serie(NIq).set_index('end') if len(NIq) >= 4 else None
    nb += 1
    for m in DECm:
        s_ = best_map.get((m, k))
        if s_ is None or s_ not in cols: continue
        i, j = im_[m], cols[s_]; t = kon[m]
        ee, eq = ostatni(d['eq'], t)
        if eq is None or eq <= 0 or (t - ee).days > 250: continue
        if NIt is not None:
            z = NIt[NIt.zn <= t]
            if len(z) and (t - z.index[-1]).days <= 250: ROE[i, j] = z.ttm.iloc[-1] / eq
        dt_ = d['debt']; tot = 0.0
        if 'LongTermDebt' in dt_:
            parts = ['LongTermDebt']
        elif 'LongTermDebtAndCapitalLeaseObligations' in dt_:
            parts = ['LongTermDebtAndCapitalLeaseObligations', 'LongTermDebtAndCapitalLeaseObligationsCurrent']
        else:
            parts = ['LongTermDebtNoncurrent', 'LongTermDebtCurrent' if 'LongTermDebtCurrent' in dt_ else 'DebtCurrent']
        for p_ in parts + ['ShortTermBorrowings', 'CommercialPaper']:
            if p_ in dt_:
                e2, v2 = ostatni(dt_[p_], t)
                if v2 is not None and abs((e2 - ee).days) <= 100: tot += v2
        DE[i, j] = tot / eq
print('bilans: spółek', nb, 'ROE', np.isfinite(ROE).sum(), 'D/E', np.isfinite(DE).sum(), flush=True)

G5 = np.full((NT, NS), np.nan); REV5 = np.full((NT, NS), np.nan)
REVT = {}
for fn in os.listdir(SECQ):
    d = json.load(open(os.path.join(SECQ, fn)))
    if d and 'rev' in d:
        q = kwartaly(d['rev']['rows'])
        if len(q) >= 8:
            g = pd.DataFrame([(pd.Timestamp(e), v, pd.Timestamp(f)) for e, (v, f) in q.items()], columns=['end', 'eps', 'filed']).sort_values('end')
            t_ = ttm_serie(g)
            if len(t_): REVT[fn[:-5].replace('.', '-')] = t_.set_index('end')


def cagr5(T, t):
    z = T[T.zn <= t]
    if z.empty or (t - z.index[-1]).days > 250: return np.nan
    e0, a = z.index[-1], z.ttm.iloc[-1]
    c = z[(z.index <= e0 - pd.Timedelta(days=5 * 365 - 45)) & (z.index >= e0 - pd.Timedelta(days=5 * 365 + 45))]
    if not len(c): return np.nan
    b = c.ttm.iloc[-1]
    return (a / b) ** 0.2 - 1 if a > 0 and b > 0 else np.nan


for k in set(TT) | set(REVT):
    Te = TT.get(k); Te = Te.set_index('end') if Te is not None and len(Te) else None
    Tr = REVT.get(k)
    for m in DECm:
        if m < pd.Period('2014-01', 'M'): continue
        s_ = best_map.get((m, k))
        if s_ is None or s_ not in cols: continue
        i, j = im_[m], cols[s_]; t = m.to_timestamp(how='end')
        if Te is not None: G5[i, j] = cagr5(Te, t)
        if Tr is not None: REV5[i, j] = cagr5(Tr, t)
print('5 lat: EPS', np.isfinite(G5).sum(), 'przychody', np.isfinite(REV5).sum(), flush=True)
PEG5 = np.where((EPS0 > 0) & (G5 > 0), PE_ / (100 * G5), np.nan)
OD = pd.Period('2015-03', 'M'); POL2 = pd.Period('2020-12', 'M')
mies2 = [m for m in mies if m >= OD]


def strat5(RK, dlug, wej, N):
    poz, got, eq, cel = {}, 1.0, [], []
    for a, m in enumerate(mies2[:-1]):
        i = im_[m]; i1 = im_[mies2[a + 1]]
        if m.month == 3:
            ok = U[i] & np.isfinite(RK[i]) & np.isfinite(Cv[i])
            if dlug: ok &= np.nan_to_num(DE[i], nan=9) < 1
            ok = np.flatnonzero(ok); ok = ok[np.argsort(-RK[i, ok])]
            cel = list(ok[:N]); top2 = set(ok[:2 * N])
            for j in list(poz):
                if j not in top2: got += poz.pop(j) * (1 - KOSZT)
        e = got + sum(poz.values())
        for j in cel:
            if len(poz) >= N: break
            if j in poz or not np.isfinite(Cv[i, j]): continue
            if wej == 'W1' and not (PEG5[i, j] <= 1): continue
            if wej == 'W2' and not (PEG5[i, j] <= 1.5): continue
            kw = min(e / N, got)
            if kw <= 1e-9: break
            got -= kw; poz[j] = kw * (1 - KOSZT)
        for j in list(poz):
            if np.isfinite(Cv[i1, j]) and np.isfinite(Cv[i, j]): poz[j] *= Cv[i1, j] / Cv[i, j]
            else: got += poz.pop(j) * (1 - KOSZT)
        eq.append((mies2[a + 1], got + sum(poz.values()), sum(poz.values())))
    e = pd.Series({m: v for m, v, _ in eq}); inw = np.mean([x / v for _, v, x in eq])
    return e, inw


def cg2(e, od=None, do=None):
    e = pd.concat([pd.Series({OD: 1.0}), e])
    if od: e = e[e.index >= od]
    if do: e = e[e.index <= do]
    return (e.iloc[-1] / e.iloc[0]) ** (12 / (len(e) - 1)) - 1


ew0 = rowne(); ew = ew0[ew0.index > OD] / ew0[ew0.index >= OD].iloc[0]
cm0 = cem10(); cm = cm0[cm0.index > OD] / cm0[cm0.index >= OD].iloc[0]
sp_ = etf['SPY'][(etf['SPY'].index >= OD) & (etf['SPY'].index <= DO)]; spy = (sp_ / sp_.iloc[0])[1:]
rows = []
for rn, RK in (('przychody 5 lat', REV5), ('EPS 5 lat', G5)):
    for dlug in (True, False):
        for wej, wn in (('W0', 'od razu'), ('W1', 'PEG <= 1'), ('W2', 'PEG <= 1,5')):
            for N in (10, 20):
                e, inw = strat5(RK, dlug, wej, N)
                d = (e.pct_change() - ew.pct_change()).dropna(); lo, hi = blok(d.values)
                c1, c2, b1, b2 = cg2(e, None, POL2), cg2(e, POL2), cg2(ew, None, POL2), cg2(ew, POL2)
                rows.append(dict(ranking=rn, dlug_kapital_lt_1=dlug, wejscie=wn, N=N, CAGR=cg2(e), CAGR_2015_20=c1, CAGR_2021_26=c2, maxDD=(e / e.cummax() - 1).min(),
                                 sr_zainwestowane=inw, z_10k=round(10000 * e.iloc[-1]), roznica_vs_rowne=f'{d.mean()*100:+.2f} ({lo*100:.2f}…{hi*100:.2f})',
                                 lepszy=c1 > b1 and c2 > b2 and lo > 0))
            print(rn, dlug, flush=True)
T = pd.DataFrame(rows)
ref = pd.DataFrame([dict(odniesienie=n, CAGR=cg2(x), CAGR_2015_20=cg2(x, None, POL2), CAGR_2021_26=cg2(x, POL2), maxDD=(x / x.cummax() - 1).min())
                    for n, x in (('równe wagi uniwersum', ew), ('SPY', spy), ('CEM10 (to samo uniwersum, N = 10)', cm))])
i = im_[pd.Period('2026-03', 'M')]
ok = np.flatnonzero(U[i] & np.isfinite(REV5[i]) & (np.nan_to_num(DE[i], nan=9) < 1)); ok = ok[np.argsort(-REV5[i, ok])][:20]
ost = pd.DataFrame({'seria': C.columns[ok], 'przychody_CAGR5_%': 100 * REV5[i, ok], 'EPS_CAGR5_%': 100 * G5[i, ok], 'dlug_kapital': DE[i, ok], 'P/E': PE_[i, ok], 'PEG': PEG5[i, ok]})
out = ['# Etap 36: ranking po wzroście przychodów / EPS z 5 lat, dług / kapitał < 1, PEG jako moment wejścia (S&P 500 z danymi SEC, 2015-03 ... 2026-09)', '',
       '## Odniesienia', '', ref.round(3).to_markdown(index=False), '', '## Warianty', '',
       'sr_zainwestowane = średni udział kapitału w akcjach (reszta czeka w gotówce na wejście).', '', T.round(3).to_markdown(index=False), '',
       '## Lista (przychody 5 lat, dług < 1) na koniec marca 2026, top 20', '', ost.round(2).to_markdown(index=False), '']
open(os.path.join(HERE, 'wyniki', 'r57_przychody5.md'), 'w').write('\n'.join(out)); print('\n'.join(out))
