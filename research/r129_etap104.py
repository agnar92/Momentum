"""Etap 104: kup przy wejściu w fazę rozwoju (definicja ze strony), sprzedaj przy schyłku. Protokół: etap 104."""
import os
HERE = os.path.dirname(os.path.abspath(__file__))
_s101 = open(os.path.join(HERE, 'r126_etap101.py')).read()
exec(_s101[:_s101.index("def opis(")])
rng = np.random.default_rng(104)


def fazy_lat(rev, zysk, wyp):
    """Port W.fazyLat (docs/js/wspolne.js) bez punktu 12 mies."""
    n, out = len(rev), []
    ok = lambda v: v is not None and np.isfinite(v)
    def suma(a, idx):
        v = [a[j] for j in idx if j >= 0 and ok(a[j])]
        return sum(v) if v else None
    def srednia(a, idx):
        v = [a[j] for j in idx if j >= 0 and ok(a[j])]
        return sum(v) / len(v) if len(v) >= 2 else None
    maks, sp_p, sch, szR, szZ, pocz = 0, False, False, -np.inf, -np.inf, 0
    for i in range(n):
        r = rev[i]
        if not ok(r) or r <= 0: out.append(None); continue
        rp, zp = (rev[i - 1], zysk[i - 1]) if i > 0 else (None, None)
        if ok(rp) and rp > 0 and r < 0.7 * rp and ok(zp) and zp > 0 and ok(zysk[i]) and zysk[i] / r >= 0.8 * (zp / rp):
            pocz, szR, szZ, sch, sp_p = i, -np.inf, -np.inf, False, False
        jest = lambda j: j >= pocz
        okno = [j for j in (i - 2, i - 1, i) if jest(j)]; wcz = [j for j in (i - 5, i - 4, i - 3) if jest(j)]
        r5 = rev[i - 5] if jest(i - 5) and ok(rev[i - 5]) else None; r3 = rev[i - 3] if jest(i - 3) and ok(rev[i - 3]) else None
        s3, s3w = srednia(rev, okno), srednia(rev, wcz)
        spadek = bool(s3 is not None and s3w is not None and s3 < s3w and ((r < r5) if r5 is not None else (r3 is not None and r < r3)))
        z3, w3, p3 = suma(zysk, okno), suma(wyp, okno), suma(rev, okno)
        g3 = (r / r3) ** (1 / 3) - 1 if r3 and r3 > 0 else ((r / rev[i - 1] - 1) if i > 0 and ok(rev[i - 1]) and rev[i - 1] > 0 else None)
        f = None
        if z3 is not None:
            if z3 <= 0: f = 2 if i > 0 and ok(zysk[i - 1]) and ok(zysk[i]) and zysk[i] > zysk[i - 1] else 1
            elif w3 is not None and w3 >= 0.2 * z3: f = 4
            elif g3 is not None and g3 >= 0.25 and p3 and z3 / p3 < 0.10: f = 2
            else: f = 3
        zw = sorted(zysk[j] for j in okno if ok(zysk[j]))
        zs3 = zw[1] if len(zw) >= 3 else (sum(zw) / len(zw) if zw else None)
        if sch:
            if r > szR and zs3 is not None and zs3 > szZ and f: sch, maks = False, f; out.append(f)
            else: out.append(5)
        elif spadek and sp_p:
            sch = True; out.append(5)
        else:
            if f: maks = max(maks, f)
            out.append(maks or None)
        if not sch:
            szR = max(szR, r)
            if len(zw) >= 3: szZ = max(szZ, zs3)
        sp_p = spadek
    return out


# faza bieżąca i poprzedni punkt serii w każdym styczniu
STARTY_ALL = [pd.Period(f'{y}-01', 'M') for y in range(2012, 2027)]
FAZA, POPRZ = {}, {}
for j in range(NS):
    k = kod[j]
    if k not in cache or k not in ROK: continue
    sq, R_ = cache[k], ROK[k]
    zr = sq.get('opinc') or sq.get('ni')
    if 'rev' not in sq or zr is None: continue
    for m in STARTY_ALL:
        if m not in im_: continue
        t = m.to_timestamp(how='end')
        fa = [z for z in R_['fc'] if z[3] <= t]
        if not fa: continue
        e0 = fa[-1][0]
        if (t - e0).days > 500: continue
        rev, zy, wy = [], [], []
        for nn in range(10, -1, -1):
            e = e0 - nn * Y
            rev.append(sq['rev'].przy(t, e)); zy.append(zr.przy(t, e))
            sk = przy_rok(R_['skup'], e, t) if R_.get('skup') else None
            dv = przy_rok(R_['dyw'], e, t) if R_.get('dyw') else None
            wy.append(None if sk is None and dv is None else abs(sk or 0) + abs(dv or 0))
        f = fazy_lat([np.nan if v is None else v for v in rev], [np.nan if v is None else v for v in zy], [np.nan if v is None else v for v in wy])
        f = [x for x in f]
        if f and f[-1]:
            FAZA[(j, m)] = f[-1]; POPRZ[(j, m)] = f[-2] if len(f) > 1 else None
print('ocen faz:', len(FAZA), flush=True)

KONIEC = pd.Period('2026-09', 'M')
mies = sorted(im_)


def cena(j, m):
    v = Cv[im_[m], j] if m in im_ else np.nan
    return v if np.isfinite(v) and v > 0 else None


def pozycja(j, m0):
    """wejście w styczniu m0, wyjście: pierwszy styczeń z fazą 5, koniec danych lub ostatnia cena"""
    c0 = cena(j, m0)
    if c0 is None: return None
    m1 = None
    for m in STARTY_ALL:
        if m <= m0: continue
        if FAZA.get((j, m)) == 5: m1 = m; break
    m1 = m1 or KONIEC
    # ostatnia dostępna cena ≤ m1 (spółka zdjęta z giełdy)
    i0, i1 = im_[m0], im_[m1] if m1 in im_ else len(mies) - 1
    kol = Cv[i0:i1 + 1, j]; idx = np.flatnonzero(np.isfinite(kol) & (kol > 0))
    if len(idx) < 2: return None
    ie = i0 + idx[-1]; lat = (ie - i0) / 12
    if lat < 0.25: return None
    zw = Cv[ie, j] / c0
    # mediana zbioru w tym samym okresie
    ok = UNI[i0] & np.isfinite(Cv[i0]) & (Cv[i0] > 0) & np.isfinite(Cv[ie]) & (Cv[ie] > 0)
    med = np.median(Cv[ie, ok] / Cv[i0, ok])
    return dict(cagr=zw ** (1 / lat) - 1, med=med ** (1 / lat) - 1, lat=lat, strata=zw < 1, rok=m0.year, wyjscie_schylek=FAZA.get((j, m1)) == 5)


NAZ = {1: '1 Start', 2: '2 Hiperwzrost', 3: '3 Dźwignia operacyjna', 4: '4 Zwrot kapitału', 5: '5 Schyłek (wejście w schyłek)'}
wyniki = {}
for war in ('A wejście w fazę', 'B każdy styczeń w fazie'):
    for X in (1, 2, 3, 4):
        P = []
        for (j, m), f in FAZA.items():
            if f != X or not (2012 <= m.year <= 2023) or not UNI[im_[m], j]: continue
            if war.startswith('A') and POPRZ.get((j, m)) == X: continue
            p = pozycja(j, m)
            if p: P.append(p)
        wyniki[(war, X)] = pd.DataFrame(P)


def bs(df):
    lata = sorted(df.rok.unique()); g = {r: (df[df.rok == r].cagr - df[df.rok == r].med).to_numpy() for r in lata}
    b = []
    for _ in range(2000):
        w = rng.choice(len(lata), len(lata)); v = np.concatenate([g[lata[x]] for x in w]); b.append(np.median(v))
    return np.percentile(b, [2.5, 97.5])


rows = []
for (war, X), df in wyniki.items():
    if len(df) < 10:
        rows.append({'wariant': war, 'faza wejścia': NAZ[X], 'pozycji': len(df)}); continue
    ex = df.cagr - df.med; lo, hi = bs(df)
    h1, h2 = df[df.rok <= 2017], df[df.rok >= 2018]
    rows.append({'wariant': war, 'faza wejścia': NAZ[X], 'pozycji': len(df), 'trzymanie (lat, mediana)': round(df.lat.median(), 1),
                 'wyjście przez schyłek': f'{100 * df.wyjscie_schylek.mean():.0f} %', 'CAGR (mediana)': f'{100 * df.cagr.median():+.1f} %',
                 'nadwyżka CAGR nad medianą zbioru': f'{100 * ex.median():+.1f} pp [{100 * lo:+.1f}; {100 * hi:+.1f}]', 'lepsze od mediany': f'{100 * (ex > 0).mean():.0f} %',
                 'ze stratą': f'{100 * df.strata.mean():.0f} %', 'nadwyżka 2012–17': f'{100 * (h1.cagr - h1.med).median():+.1f} pp ({len(h1)})',
                 'nadwyżka 2018–23': f'{100 * (h2.cagr - h2.med).median():+.1f} pp ({len(h2)})'})
T = pd.DataFrame(rows); print(T.to_markdown(index=False))
rozk = pd.Series([f for (j, m), f in FAZA.items() if UNI[im_[m], j] and 2012 <= m.year <= 2023]).value_counts().sort_index()
out = ['# Etap 104: kup przy wejściu w fazę, sprzedaj przy schyłku', '',
       'Top 500 USA PIT bez wykluczonych sektorów; fazy jak na stronie (W.fazyLat), liczone w styczniu z danych znanych w tym dniu. CAGR = roczna stopa zwrotu pozycji; '
       'nadwyżka = CAGR pozycji − CAGR mediany zbioru w tym samym okresie (95 % przedział z bootstrapu po latach wejścia).', '',
       T.to_markdown(index=False), '', '## Rozkład faz w styczniach 2012–2023 (spółki w zbiorze)', '', rozk.rename(index=NAZ).to_markdown(), '']
open(os.path.join(HERE, 'wyniki', 'r129_etap104.md'), 'w').write('\n'.join(out))
