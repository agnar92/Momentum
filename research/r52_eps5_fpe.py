"""Etap 31: top 40 po EPS 5 lat, z nich najniższe forward P/E (forward EPS z ważonej średniej przychodów).
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
GRW = np.full((NT, NS), np.nan); GRA = np.full((NT, NS), np.nan)
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
        GRW[i, j] = float(np.dot(WAGI, Z_.yy.values)); GRA[i, j] = float(Z_.yy.mean())
print('przychody: spółek', nk, 'wartości', np.isfinite(GRW).sum(), flush=True)

G5 = np.full((NT, NS), np.nan)
for k, T in TT.items():
    if len(T) < 8: continue
    T = T.set_index('end')
    for m in DECm:
        s_ = best_map.get((m, k))
        if s_ is None or s_ not in cols: continue
        i, j = im_[m], cols[s_]
        zn = T[T.zn <= m.to_timestamp(how='end')]
        if zn.empty: continue
        e0, t0 = zn.index[-1], zn.ttm.iloc[-1]
        c = zn[(zn.index <= e0 - pd.Timedelta(days=5 * 365 - 45)) & (zn.index >= e0 - pd.Timedelta(days=5 * 365 + 45))]
        if len(c) and t0 > 0 and c.ttm.iloc[-1] > 0: G5[i, j] = (t0 / c.ttm.iloc[-1]) ** (1 / 5) - 1
print('EPS 5 lat: wartości', np.isfinite(G5).sum(), flush=True)
rng_ = np.random.default_rng(20261116); Z2 = rng_.standard_normal((NT, NS))
GWS = {'A: ważona średnia przychodów (metoda użytkownika)': GRW, 'B: bez estymaty (trailing P/E)': np.where(np.isfinite(EPS0), 0.0, np.nan),
       'C: jak analityk, błąd 10 pp (nierealne)': GF + 0.05 + 0.10 * Z2}
ew = rowne(); rows = []
for gn, G in GWS.items():
    fe = EPS0 * (1 + G)
    P_ = np.full((NT, NS), np.nan)
    for i in range(NT):
        a = np.flatnonzero(U[i] & np.isfinite(G5[i]) & (np.nan_to_num(EPS0[i]) > 0) & np.isfinite(Cv[i]))
        if len(a) < 40: continue
        top40 = a[np.argsort(-G5[i, a])][:40]
        ok = top40[np.nan_to_num(fe[i, top40], nan=-1) > 0]
        P_[i, ok] = -(Cv[i, ok] / fe[i, ok])      # strat2 sortuje malejąco -> najniższe forward P/E pierwsze
    ile = [np.sum(U[im_[m]] & np.isfinite(P_[im_[m]])) for m in mies if m.month == 2]
    print(gn, 'kandydatów w lutym: mediana', np.median(ile), flush=True)
    for N in (10, 20):
        for regula, rn in (('R1', 'dopóki w top 40 po EPS 5 l.'), ('R3', 'dopóki w top 2N')):
            for cz, mm in CZ.items():
                e = strat2(P_, N, mm, regula)
                d = (e.pct_change() - ew.pct_change()).dropna(); lo, hi = blok(d.values)
                c1, c2, b1, b2 = cg(e, None, POL), cg(e, POL), cg(ew, None, POL), cg(ew, POL)
                rows.append(dict(estymata=gn, N=N, trzymanie=rn, decyzje=cz, CAGR=cg(e), CAGR_2011_18=c1, CAGR_2019_26=c2, maxDD=(e / e.cummax() - 1).min(),
                                 z_10k=round(10000 * e.iloc[-1]), roznica_vs_rowne=f'{d.mean()*100:+.2f} ({lo*100:.2f}…{hi*100:.2f})', lepszy=c1 > b1 and c2 > b2 and lo > 0))
        print(gn, N, flush=True)
T = pd.DataFrame(rows)
out = ['# Etap 31: top 40 po CAGR EPS 5 lat -> 10 z najniższym forward P/E (S&P 500 z danymi SEC, 2011-2026)', '',
       'Odniesienia: równe wagi uniwersum 12,8 %, SPY 14,1 %, CEM10 21,9 %.', '', T.round(3).to_markdown(index=False), '']
open(os.path.join(HERE, 'wyniki', 'r52_eps5_fpe.md'), 'w').write('\n'.join(out)); print('\n'.join(out))
