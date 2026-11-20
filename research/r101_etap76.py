"""Etap 76: (A) czy ocena ze strony (percentyle w sektorze) przewiduje nadwyżkę zwrotu, (B) wagi kategorii poza próbą, (C) nowe cechy:
lata z rosnącym zyskiem, lata z ROIC > 15 %, zmiana liczby akcji, FCF / zysk netto, marża brutto i jej zmienność, momentum. Protokół: protokol.md, etap 76."""
import os, re, json, pickle, bisect, itertools, datetime as dt, numpy as np, pandas as pd
HERE = os.path.dirname(os.path.abspath(__file__)); SZ = '/home/user/ndx/szer'
dd = lambda s: dt.date.fromisoformat(s)
r25 = open(os.path.join(HERE, 'r25_cem10_eps.py')).read(); exec(r25[r25.index('def kwartaly'):r25.index('\n\n\ncechy = {}')])
Z = np.load(f'{SZ}/cache.npz', allow_pickle=True); Cv, U = Z['Cv'], Z['U'].astype(bool)
ms = [pd.Period(x, 'M') for x in Z['mies']]; im_ = {m: i for i, m in enumerate(ms)}; ser = list(Z['seria']); kod = np.array([s.split('.US')[0] for s in ser]); NT, NS = Cv.shape
MI = [m for m in ms if pd.Period('2012-01', 'M') <= m <= pd.Period('2026-09', 'M')]
CAP = pickle.load(open(f'{SZ}/cap.pkl', 'rb'))
BIL = json.load(open(f'{SZ}/bilans.json')); AK = json.load(open(f'{SZ}/aktywa.json')); ZB = json.load(open(f'{SZ}/zob_biezace.json'))
FC = json.load(open(f'{SZ}/fcf.json')); SH = json.load(open(f'{SZ}/akcje.json')); S76 = json.load(open(f'{SZ}/sec76.json')) if os.path.exists(f'{SZ}/sec76.json') else {}; SPL = json.load(open('/home/user/ndx/splits.json'))

# --- sektory: GICS (skład S&P 500), w pozostałych z kodu SIC ---
g = pd.read_csv('/home/user/eodhd-data/gics.csv'); GICS = dict(zip(g.Symbol.str.replace('.', '-'), g['GICS Sector']))
SIC = json.load(open('/home/user/ndx/sic.json')); SIC.update(json.load(open(f'{SZ}/sic.json')))


def sektor_sic(s):
    s = int(s); d2 = s // 100
    if 6000 <= s <= 6799: return 'Real Estate' if (6500 <= s <= 6599 or s == 6798) else 'Financials'
    if d2 == 13 or d2 == 29: return 'Energy'
    if d2 in (10, 12, 14, 24, 26, 30, 32, 33) or (d2 == 28 and not (2830 <= s <= 2836 or 2840 <= s <= 2844)): return 'Materials'
    if 2830 <= s <= 2836 or 3841 <= s <= 3851 or d2 == 80 or s == 5122: return 'Health Care'
    if d2 in (1, 2, 7, 8, 9, 20, 21, 54) or 2840 <= s <= 2844 or 5140 <= s <= 5149 or s == 5912: return 'Consumer Staples'
    if d2 == 49: return 'Utilities'
    if d2 in (27, 48, 78, 79) or 7310 <= s <= 7319: return 'Communication Services'
    if 3570 <= s <= 3579 or (d2 == 36 and s != 3630) or 7370 <= s <= 7379 or d2 == 38: return 'Information Technology'
    if d2 in (22, 23, 25, 31, 39, 52, 53, 55, 56, 57, 58, 59, 70, 72, 75, 76, 82) or 3711 <= s <= 3716 or s == 3630: return 'Consumer Discretionary'
    return 'Industrials'


def sektor(k):
    if k in GICS: return GICS[k]
    s = SIC.get(k)
    return sektor_sic(s) if s and str(s).isdigit() else None


SEK = np.array([sektor(k) for k in kod], dtype=object)
WYKL = {'Financials', 'Materials', 'Energy', 'Utilities', 'Real Estate'}
UNI = U & np.array([s is not None and s not in WYKL for s in SEK])[None, :]
print('sektory: brak', sum(s is None for s in SEK), '; w zbiorze (mediana / mies.)', int(np.median([UNI[im_[m]].sum() for m in MI])), flush=True)


# --- serie spółki: TTM przepływów, stany bilansowe, roczne ---
def ttm(q):
    """{end: (v, filed)} -> [(end, ttm, znany)]"""
    e = sorted(q); out = []
    for i in range(3, len(e)):
        z = e[i - 3:i + 1]
        if all(75 <= (dd(z[k + 1]) - dd(z[k])).days <= 110 for k in range(3)):
            out.append((pd.Timestamp(z[-1]), sum(q[x][0] for x in z), max(pd.Timestamp(q[x][1]) for x in z)))
    return out


def stan(rows):
    best = {}
    for e, v, f in rows:
        if e not in best or f < best[e][1]: best[e] = (v, f)
    return sorted((pd.Timestamp(e), v, pd.Timestamp(f)) for e, (v, f) in best.items())


def roczne(rows):
    best = {}
    for r in rows:
        s, e, v, f = r[:4]
        if 350 <= (dd(e) - dd(s)).days <= 380 and (e not in best or f < best[e][1]): best[e] = (v, f)
    return sorted((pd.Timestamp(e), v, pd.Timestamp(f)) for e, (v, f) in best.items())


def wiele(d):
    """{tag: wiersze} -> wiersze pierwszego tagu z danymi dla każdej daty"""
    if not d: return []
    if isinstance(d, list): return d
    out, kl = [], set()
    for rows in d.values():
        for r in rows:
            k_ = tuple(r[:-2]) if len(r) == 4 else (r[0],)
            if k_ not in kl: out.append(r)
        kl |= {tuple(r[:-2]) if len(r) == 4 else (r[0],) for r in rows}
    return out


class Seria:
    """punkty (end, v, znany) posortowane po end; teraz(t) = ostatni znany ≤ t (end ≤ maks dni wstecz); przy(t, cel) = znany ≤ t z end ±tol od cel."""
    def __init__(self, pts, tol=45):
        self.p = sorted(pts, key=lambda x: x[0]); self.e = [x[0] for x in self.p]; self.tol = pd.Timedelta(days=tol)

    def teraz(self, t, maks=250):
        k = bisect.bisect_right(self.e, t) - 1
        while k >= 0:
            if self.p[k][2] <= t:
                return (self.p[k][0], self.p[k][1]) if (t - self.p[k][0]).days <= maks else (None, None)
            k -= 1
        return None, None

    def przy(self, t, cel):
        a, b = bisect.bisect_left(self.e, cel - self.tol), bisect.bisect_right(self.e, cel + self.tol)
        best = None
        for x in self.p[a:b]:
            if x[2] <= t and (best is None or abs(x[0] - cel) < abs(best[0] - cel)): best = x
        return best[1] if best else None


DLUGI = {}


def dlug(d, t, cel, k=None):
    dt_ = d.get('debt') or {}
    if 'LongTermDebt' in dt_: parts = ['LongTermDebt']
    elif 'LongTermDebtAndCapitalLeaseObligations' in dt_: parts = ['LongTermDebtAndCapitalLeaseObligations', 'LongTermDebtAndCapitalLeaseObligationsCurrent']
    else: parts = ['LongTermDebtNoncurrent', 'LongTermDebtCurrent' if 'LongTermDebtCurrent' in dt_ else 'DebtCurrent']
    tot, jest = 0.0, False
    for p_ in parts + ['ShortTermBorrowings', 'CommercialPaper']:
        if p_ in dt_:
            if (k, p_) not in DLUGI: DLUGI[(k, p_)] = Seria(stan(dt_[p_]), 100)
            v = DLUGI[(k, p_)].przy(t, cel)
            if v is not None: tot += v; jest = True
    return tot if jest or dt_ else None


def podziel(k, a, b):
    """mnożnik splitów między datami a < b (liczba akcji z a -> jednostki z b)"""
    f = 1.0
    for d_, r in SPL.get(k, []):
        x, y = (float(z) for z in r.split('/'))
        if a < pd.Timestamp(d_) <= b and x > 0 and y > 0: f *= x / y
    return f


POLA = ['rev_1y', 'rev_cagr3', 'rev_cagr5', 'ni_1y', 'ni_5y', 'rev_lata_10', 'gm', 'om', 'nm', 'roe', 'roa', 'roce', 'fcf_margin', 'de', 'qr', 'net_cash_mc',
        'pe', 'peg', 'ps', 'pfcf', 'fcf_yield', 'C1_lata_zysk', 'C2_lata_roic', 'C3_akcje_3l', 'C4_fcf_zysk', 'C5_gm', 'C5b_gm_zm', 'C6_mom3', 'C6_mom6', 'C6_mom12_1']
X = {p: np.full((NT, NS), np.nan) for p in POLA}
Y = pd.Timedelta(days=365.25)
cache = {}
TEST = int(os.environ.get('TEST', '0'))
for j in (range(0, NS, NS // TEST) if TEST else range(NS)):
    k = kod[j]
    if not UNI[:, j].any(): continue
    if k not in cache:
        sq = {}
        fn = f'{SZ}/sec_q/{k}.json'
        if os.path.exists(fn):
            d = json.load(open(fn)) or {}
            for kl in ('rev', 'opinc'):
                if d.get(kl): sq[kl] = Seria(ttm(kwartaly(d[kl]['rows'])))
        b = BIL.get(k) or {}; s7 = S76.get(k) or {}
        if b.get('ni'): sq['ni'] = Seria(ttm(kwartaly(b['ni']))); sq['ni_a'] = roczne(b['ni'])
        gp = kwartaly(wiele(s7.get('gp'))) if s7.get('gp') else {}
        if not gp and s7.get('cogs') and os.path.exists(fn) and (json.load(open(fn)) or {}).get('rev'):
            rq, cq = kwartaly(json.load(open(fn))['rev']['rows']), kwartaly(wiele(s7['cogs']))
            gp = {e: (rq[e][0] - cq[e][0], max(rq[e][1], cq[e][1])) for e in rq if e in cq}
        if gp: sq['gp'] = Seria(ttm(gp))
        for kl, src in (('eq', b.get('eq')), ('as', AK.get(k)), ('lc', ZB.get(k)), ('ca', wiele(s7.get('ca'))), ('inv', wiele(s7.get('inv'))),
                        ('cash', wiele(s7.get('cash'))), ('sti', wiele(s7.get('sti'))), ('sh', SH.get(k))):
            if src: sq[kl] = Seria(stan(src), 100)
        f_ = FC.get(k) or []
        sq['fcf_a'] = sorted((pd.Timestamp(e), o - c, pd.Timestamp(f)) for s_, e, o, c, f in f_ if o is not None and c is not None)
        sq['b'] = b
        cache[k] = sq
    sq = cache[k]
    capk = CAP[k] if k in CAP.columns else None
    for m in MI:
        i = im_[m]
        if not UNI[i, j]: continue
        t = m.to_timestamp(how='end'); x = {}
        # przychody
        if 'rev' in sq:
            e0, r0 = sq['rev'].teraz(t)
            if r0 and r0 > 0:
                x['rev_ttm'] = r0
                for lat, kk in ((1, 'rev_1y'), (3, 'rev_cagr3'), (5, 'rev_cagr5')):
                    a = sq['rev'].przy(t, e0 - lat * Y)
                    if a and a > 0: x[kk] = (r0 / a) ** (1 / lat) - 1
                lt = [sq['rev'].przy(t, e0 - n * Y) if n else r0 for n in range(6)]
                if all(v_ and v_ > 0 for v_ in lt): x['rev_lata_10'] = sum(lt[n] / lt[n + 1] - 1 > 0.10 for n in range(5))
        # zysk netto
        if 'ni' in sq:
            e1, n0 = sq['ni'].teraz(t)
            if n0 is not None:
                x['ni_ttm'] = n0
                a = sq['ni'].przy(t, e1 - Y)
                if a and a > 0 and n0 > 0: x['ni_1y'] = n0 / a - 1
                a5 = sq['ni'].przy(t, e1 - 5 * Y)
                if a5 and a5 > 0 and n0 > 0: x['ni_5y'] = n0 / a5 - 1; x['ni_cagr5'] = (n0 / a5) ** 0.2 - 1
                lt = [sq['ni'].przy(t, e1 - n * Y) if n else n0 for n in range(6)]
                if all(v_ is not None for v_ in lt): x['C1_lata_zysk'] = sum(lt[n] > lt[n + 1] for n in range(5))
                if x.get('rev_ttm'): x['nm'] = n0 / x['rev_ttm']
        if 'opinc' in sq:
            eo, o0 = sq['opinc'].teraz(t)
            if o0 is not None and x.get('rev_ttm'): x['om'] = o0 / x['rev_ttm']
        else: eo, o0 = None, None
        if 'gp' in sq:
            eg, g0 = sq['gp'].teraz(t)
            if g0 is not None and x.get('rev_ttm'):
                x['gm'] = x['C5_gm'] = g0 / x['rev_ttm']
                gl = []
                for n in range(5):
                    gv, rv = sq['gp'].przy(t, eg - n * Y), sq['rev'].przy(t, eg - n * Y)
                    if gv is not None and rv and rv > 0: gl.append(gv / rv)
                if len(gl) >= 3: x['C5b_gm_zm'] = -np.std(gl)
        # bilans
        b = sq['b']
        if 'eq' in sq:
            ee, eqv = sq['eq'].teraz(t)
            if eqv is not None and eqv > 0:
                db = dlug(b, t, ee, k)
                if db is not None: x['de'] = db / eqv
                if x.get('ni_ttm') is not None: x['roe'] = x['ni_ttm'] / eqv
                ca_ = (sq['cash'].przy(t, ee) if 'cash' in sq else None)
                st_ = (sq['sti'].przy(t, ee) if 'sti' in sq else None) or 0
                if 'opinc' in sq and db is not None:
                    lr = []
                    for n in range(5):
                        cel = ee - n * Y; on = sq['opinc'].przy(t, cel); eqn = sq['eq'].przy(t, cel)
                        dn = dlug(b, t, cel, k); cn = sq['cash'].przy(t, cel) if 'cash' in sq else 0
                        if on is None or eqn is None or dn is None: continue
                        ic = eqn + dn - (cn or 0)
                        if ic > 0: lr.append(on * 0.79 / ic > 0.15)
                    if len(lr) == 5: x['C2_lata_roic'] = sum(lr)
                cap_ = capk.get(m) if capk is not None else None
                if cap_ is not None and np.isfinite(cap_) and cap_ > 0:
                    x['mcap'] = cap_
                    if ca_ is not None and db is not None: x['net_cash_mc'] = (ca_ + st_ - db) / cap_
        if 'as' in sq:
            ea, av = sq['as'].teraz(t, 400)
            if av and av > 0 and x.get('ni_ttm') is not None: x['roa'] = x['ni_ttm'] / av
            if av and 'lc' in sq and o0 is not None:
                lcv = sq['lc'].przy(t, ea)
                if lcv is not None and av - lcv > 0: x['roce'] = o0 / (av - lcv)
        if 'ca' in sq and 'lc' in sq:
            ec, cav = sq['ca'].teraz(t, 400)
            lcv = sq['lc'].przy(t, ec) if ec is not None else None
            if cav is not None and lcv and lcv > 0: x['qr'] = (cav - ((sq['inv'].przy(t, ec) or 0) if 'inv' in sq else 0)) / lcv
        # FCF roczny
        fa = [z for z in sq['fcf_a'] if z[2] <= t]
        if fa and (t - fa[-1][0]).days <= 450:
            f0 = fa[-1][1]
            if x.get('rev_ttm'): x['fcf_margin'] = f0 / x['rev_ttm']
            if x.get('mcap'):
                x['fcf_yield'] = f0 / x['mcap']
                if f0 > 0: x['pfcf'] = x['mcap'] / f0
            if len(fa) >= 3 and (fa[-1][0] - fa[-3][0]).days <= 800:
                na = {e: v for e, v, f in sq.get('ni_a', []) if f <= t}
                nis = [na.get(e) for e, _, _ in fa[-3:]]
                if all(v_ is not None for v_ in nis) and sum(nis) > 0: x['C4_fcf_zysk'] = sum(z[1] for z in fa[-3:]) / sum(nis)
        if x.get('mcap'):
            if x.get('ni_ttm') and x['ni_ttm'] > 0:
                x['pe'] = x['mcap'] / x['ni_ttm']
                if x.get('ni_cagr5') and x['ni_cagr5'] > 0: x['peg'] = x['pe'] / (100 * x['ni_cagr5'])
            if x.get('rev_ttm'): x['ps'] = x['mcap'] / x['rev_ttm']
        # liczba akcji: zmiana 3 lata (skorygowana o splity), ujemna = skup -> odwrócona (więcej = lepiej)
        if 'sh' in sq:
            es, s0 = sq['sh'].teraz(t, 300)
            if s0:
                s3 = sq['sh'].przy(t, es - 3 * Y)
                if s3 and s3 > 0:
                    zm = s0 / (s3 * podziel(k, es - 3 * Y, es)) - 1
                    if -0.6 < zm < 3: x['C3_akcje_3l'] = -zm
        # momentum
        c = Cv[:, j]
        for h, kk in ((3, 'C6_mom3'), (6, 'C6_mom6')):
            if i >= h and c[i - h] > 0 and np.isfinite(c[i]): x[kk] = c[i] / c[i - h] - 1
        if i >= 12 and c[i - 12] > 0 and np.isfinite(c[i - 1]): x['C6_mom12_1'] = c[i - 1] / c[i - 12] - 1
        for p, v in x.items():
            if p in X and v is not None and np.isfinite(v): X[p][i, j] = v
print('cechy policzone; pokrycie (2012-2026, w zbiorze):', {p: round(float(np.isfinite(X[p][UNI]).mean()), 2) for p in POLA}, flush=True)
if not TEST: np.savez_compressed('/home/user/ndx/etap76_cechy.npz', **X)

# --- ocena jak na stronie ---
GRUPY = {'wzrost': [('rev_1y', 1), ('rev_cagr3', 1), ('rev_cagr5', 1), ('ni_1y', 1), ('ni_5y', 1), ('rev_lata_10', 1)],
         'sila': [('gm', 1), ('om', 1), ('nm', 1), ('roe', 1), ('roa', 1), ('roce', 1), ('fcf_margin', 1), ('de', -1), ('qr', 1), ('net_cash_mc', 1)],
         'wycena': [('pe', -1), ('peg', -1), ('ps', -1), ('pfcf', -1), ('fcf_yield', 1)]}
DOD = {'pe', 'peg', 'ps', 'pfcf'}
PCT = {}
for gr, pola in GRUPY.items():
    for p, kier in pola:
        P = np.full((NT, NS), np.nan)
        for m in MI:
            i = im_[m]; v = X[p][i].copy(); ok = UNI[i] & np.isfinite(v)
            if p in DOD: ok &= v > 0
            if p == 'de': ok &= v >= 0
            if ok.sum() < 20: continue
            df = pd.DataFrame({'v': v[ok], 's': SEK[ok]}); gb = df.groupby('s').v
            r = gb.rank(method='average'); n = gb.transform('count'); pc = ((r - 0.5) / n).where(n >= 5)
            P[i, np.flatnonzero(ok)] = pc.to_numpy() if kier > 0 else 1 - pc.to_numpy()
        PCT[p] = P
O = {}
for gr, pola in GRUPY.items():
    A = np.stack([PCT[p] for p, _ in pola]); n_ = np.isfinite(A).sum(0)
    O[gr] = np.where(n_ >= 2, 10 * (np.nansum(A, 0) + 0.5 * (len(pola) - n_)) / len(pola), np.nan)


def ogolna(w):
    wz, si, wy = w; T_ = np.zeros((NT, NS)); W_ = np.zeros((NT, NS))
    for a, wg in ((O['wzrost'], wz), (O['sila'], si), (O['wycena'], wy)):
        f = np.isfinite(a); T_ += np.where(f, a * wg, 0); W_ += np.where(f, wg, 0)
    ok = np.isfinite(O['wzrost']) & (np.isfinite(O['sila']) | np.isfinite(O['wycena'])) & (W_ > 0)
    return np.where(ok, T_ / np.where(W_ > 0, W_, 1), np.nan)


OG = ogolna((0.4, 0.35, 0.25))

# --- zwroty naprzód: nadwyżka nad średnią spółek w zbiorze ---
EXC = {}
for h in (12, 36, 60):
    R = np.full((NT, NS), np.nan); R[:-h] = Cv[h:] / Cv[:-h] - 1
    E_ = np.full((NT, NS), np.nan)
    for m in MI:
        i = im_[m]; ok = UNI[i] & np.isfinite(R[i])
        if ok.sum() >= 100: E_[i, ok] = R[i, ok] - R[i, ok].mean()
    EXC[h] = E_
KON = {12: pd.Period('2025-09', 'M'), 36: pd.Period('2023-09', 'M'), 60: pd.Period('2021-09', 'M')}


def rang(a):
    return pd.Series(a).rank().to_numpy()


def ic_seria(F, h, a_='2012-01', b_=None, kontrola=None):
    b_ = min(pd.Period(b_, 'M'), KON[h]) if b_ else KON[h]; out, k5 = [], []
    for m in MI:
        if not (pd.Period(a_, 'M') <= m <= b_): continue
        i = im_[m]; ok = np.isfinite(F[i]) & np.isfinite(EXC[h][i])
        if kontrola is not None: ok &= np.isfinite(kontrola[i])
        if ok.sum() < 50: continue
        f, e = rang(F[i, ok]), rang(EXC[h][i, ok])
        if kontrola is not None:
            kk = rang(kontrola[i, ok]); kk = kk - kk.mean(); f = f - f.mean(); f = f - kk * (f @ kk) / (kk @ kk)
        out.append(np.corrcoef(f, e)[0, 1])
        q = pd.qcut(pd.Series(F[i, ok]).rank(method='first'), 5, labels=False) if kontrola is None else None
        if q is not None and len(set(q)) == 5: k5.append((EXC[h][i, ok][q == 4].mean() - EXC[h][i, ok][q == 0].mean(), np.median(EXC[h][i, ok][q == 4])))
    return np.array(out), k5


def nw_t(x, lag):
    x = np.asarray(x); n = len(x)
    if n < 10: return np.nan
    e = x - x.mean(); g0 = e @ e / n; s = g0
    for l in range(1, min(lag, n - 1) + 1): s += 2 * (1 - l / (lag + 1)) * (e[l:] @ e[:-l]) / n
    return x.mean() / np.sqrt(s / n)


def wiersz(nm, F, h, kontrola=None):
    c, k5 = ic_seria(F, h, kontrola=kontrola); c1, _ = ic_seria(F, h, b_='2016-12', kontrola=kontrola); c2, _ = ic_seria(F, h, a_='2017-01', kontrola=kontrola)
    r = dict(cecha=nm, h=f'{h // 12} l.', IC=c.mean() if len(c) else np.nan, t_NW=nw_t(c, h - 1), IC_2012_16=c1.mean() if len(c1) else np.nan, IC_2017p=c2.mean() if len(c2) else np.nan)
    if kontrola is None and k5:
        r['K5_K1_pp'] = 100 * np.mean([a for a, _ in k5]); r['K5_mediana_pp'] = 100 * np.mean([b for _, b in k5])
    return r


out = ['# Etap 76: ocena ze strony, wagi kategorii, nowe cechy — top 500 USA bez finansów, surowców, energii, użyteczności, nieruchomości', '',
       f'Spółek w zbiorze (mediana / mies. 2012-2026): {int(np.median([UNI[im_[m]].sum() for m in MI]))}. Nadwyżka = zwrot spółki − średnia spółek zbioru. '
       'IC = średnia miesięczna korelacja rang (Spearman), t Neweya-Westa (opóźnienie h − 1). K5 − K1 = nadwyżka najlepszej piątki minus najgorszej (pp).', '',
       'Pokrycie danych (odsetek komórek miesiąc × spółka): ' + ', '.join(f'{p} {np.isfinite(X[p][UNI]).mean():.0%}' for p in POLA), '']
# (A)
rows = []
for nm, F in (('Ocena ogólna (0,4 / 0,35 / 0,25)', OG), ('Wzrost', O['wzrost']), ('Siła', O['sila']), ('Wycena', O['wycena'])):
    for h in (12, 36, 60): rows.append(wiersz(nm, F, h))
for gr, pola in GRUPY.items():
    for p, _ in pola: rows.append(wiersz(f'  {gr}: {p}', PCT[p], 60))
out += ['## (A) Ocena ze strony odtworzona historycznie', '', pd.DataFrame(rows).round(3).to_markdown(index=False), '']
# najlepsze spółki wg oceny: top 10 % w miesiącu
rows = []
for h in (12, 36, 60):
    ex, ex_all, bij = [], [], []
    for m in MI:
        if m > KON[h]: continue
        i = im_[m]; ok = np.isfinite(OG[i]) & np.isfinite(EXC[h][i])
        if ok.sum() < 50: continue
        pr = np.nanpercentile(OG[i, ok], 90); s_ = ok & (OG[i] >= pr)
        ex += list(EXC[h][i, s_])
    rows.append(dict(h=f'{h // 12} l.', obs=len(ex), nadwyzka_srednia_pp=100 * np.mean(ex), nadwyzka_mediana_pp=100 * np.median(ex), bije_srednia=np.mean(np.array(ex) > 0)))
out += ['Top 10 % wg oceny ogólnej w każdym miesiącu:', '', pd.DataFrame(rows).round(3).to_markdown(index=False), '']
# (B) wagi
siatka = [(a / 20, b / 20, (20 - a - b) / 20) for a in range(21) for b in range(21 - a)]
rows = []
for w in siatka:
    F = ogolna(w); c, _ = ic_seria(F, 36, b_='2018-12')
    rows.append((w, c.mean()))
rows.sort(key=lambda x: -x[1]); naj = rows[0][0]
tab = []
for nm, w in (('najlepsze w próbie ' + '/'.join(f'{v:.2f}' for v in naj), naj), ('strona 0,40/0,35/0,25', (0.4, 0.35, 0.25)), ('tylko wzrost', (1, 0, 0)),
              ('tylko siła', (0, 1, 0)), ('tylko wycena', (0, 0, 1)), ('wzrost + siła po 0,5', (0.5, 0.5, 0))):
    F = ogolna(w)
    for h in (36, 60):
        c_in, _ = ic_seria(F, h, b_='2018-12'); c_out, k5 = ic_seria(F, h, a_='2019-01')
        tab.append(dict(wagi=nm, h=f'{h // 12} l.', IC_proba_2012_18=c_in.mean(), IC_sprawdzian_2019p=c_out.mean() if len(c_out) else np.nan,
                        K5_K1_sprawdzian_pp=100 * np.mean([a for a, _ in k5]) if k5 else np.nan))
out += ['## (B) Wagi kategorii: wybór na startach 2012-2018 (IC 36 mies.), sprawdzian na startach 2019+', '',
        'Najlepsze 10 w próbie: ' + '; '.join(f'{w[0]:.2f}/{w[1]:.2f}/{w[2]:.2f} IC {v:.3f}' for w, v in rows[:10]), '', pd.DataFrame(tab).round(3).to_markdown(index=False), '']
# (C) nowe cechy
rows = []
for p in POLA:
    if not p.startswith('C'): continue
    for h in (12, 36, 60):
        r = wiersz(p, X[p], h); rc = wiersz(p, X[p], h, kontrola=OG)
        r['IC_czesciowy'] = rc['IC']; r['t_czesciowy'] = rc['t_NW']
        r['przyjeta'] = h in (36, 60) and np.isfinite(r['IC_2012_16']) and np.sign(r['IC_2012_16']) == np.sign(r['IC_2017p']) == np.sign(r['IC']) and abs(r['t_NW']) >= 2 \
            and r['IC'] > 0 and r['IC_czesciowy'] > 0
        rows.append(r)
TC = pd.DataFrame(rows)
out += ['## (C) Nowe cechy (kierunek: więcej = lepiej; C3 = −zmiana liczby akcji, C5b = −odch. std. marży brutto)', '',
        'Reguła przyjęcia (protokół): IC 36 lub 60 mies. o tym samym znaku w obu połowach, |t| ≥ 2, IC > 0 i IC częściowy (po odjęciu oceny ogólnej) > 0.', '',
        TC.round(3).to_markdown(index=False), '', 'Przyjęte: ' + (', '.join(sorted(set(TC[TC.przyjeta].cecha))) or 'żadna'), '']
# (D) diagnoza (dodana po wyniku, poza regułą przyjęcia): ranking w całym zbiorze zamiast w sektorze; wpływ sektora
rows = []
KIER = {p: k_ for pola in GRUPY.values() for p, k_ in pola}
for p in ['rev_1y', 'rev_cagr3', 'rev_cagr5', 'ni_1y', 'ni_5y', 'rev_lata_10', 'om', 'nm', 'roe', 'roa', 'qr', 'net_cash_mc', 'de', 'pe', 'ps', 'C1_lata_zysk', 'C3_akcje_3l']:
    F = X[p] * KIER.get(p, 1)
    if p in DOD: F = np.where(X[p] > 0, F, np.nan)
    for h in (36, 60):
        r = wiersz(p + ' (cały zbiór, bez sektora)', F, h); r['IC_w_sektorze'] = wiersz(p, PCT[p], h)['IC'] if p in PCT else np.nan; rows.append(r)
SR = {}
for nm, F in (('Wzrost (percentyle w całym zbiorze)', None),):
    pass
out += ['## (D) Diagnoza (po wyniku, poza regułą): ta sama cecha rankowana w całym zbiorze vs w sektorze', '', pd.DataFrame(rows).round(3).to_markdown(index=False), '']
# udział sektorów: nadwyżka 5 lat średnio wg sektora
rows = []
for s_ in sorted({x for x in SEK if x and x not in WYKL}):
    ex = [EXC[60][im_[m], (SEK == s_) & np.isfinite(EXC[60][im_[m]])] for m in MI if m <= KON[60]]
    ex = np.concatenate(ex); rows.append(dict(sektor=s_, obs=len(ex), nadwyzka_5l_pp=100 * ex.mean(), mediana_pp=100 * np.median(ex)))
out += ['Nadwyżka 5 lat wg sektora (starty 2012-2021):', '', pd.DataFrame(rows).round(2).to_markdown(index=False), '']
open(os.path.join(HERE, 'wyniki', 'r101_etap76' + ('_test' if TEST else '') + '.md'), 'w').write('\n'.join(out)); print('\n'.join(out))
