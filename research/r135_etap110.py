"""Etap 110: przychody rosnące 5 lat z rzędu, horyzont 5–10 lat. Protokół: etap 110."""
import os
HERE = os.path.dirname(os.path.abspath(__file__))
_s107 = open(os.path.join(HERE, 'r132_etap107.py')).read()
exec(_s107[:_s107.index("def portfel(")])
rng = np.random.default_rng(110)
for h in (60, 120):
    A = np.full((NT, NS), np.nan); A[:-h] = Cv[h:] / Cv[:-h] - 1; FW[h] = A
    EX[h] = np.full((NT, NS), np.nan)
    for m in STARTY:
        i = im_[m]
        if i + h >= NT: continue
        ok = UNI[i] & np.isfinite(FW[h][i])
        if ok.sum() > 50: EX[h][i, ok] = FW[h][i, ok] - np.median(FW[h][i, ok])
KON[60] = pd.Period('2021-09', 'M'); KON[120] = pd.Period('2016-09', 'M')
P5 = np.zeros((NT, NS), bool); MALO = np.zeros((NT, NS), bool); DANE = np.zeros((NT, NS), bool)
NIW = np.full((NT, NS), np.nan)  # zysk netto za 5 lat > dziś (1/0)
for j in range(NS):
    k = kod[j]
    if k not in cache: continue
    sq = cache[k]
    if 'rev' not in sq: continue
    for r in LATA:
        m = pd.Period(f'{r}-01', 'M'); i = im_[m]
        if not UNI[i, j]: continue
        t = m.to_timestamp(how='end')
        e0, _ = sq['rev'].teraz(t)
        if e0 is None: continue
        rv = [sq['rev'].przy(t, e0 - n * Y) for n in range(6)]
        if any(v is None for v in rv): continue
        ru = sum(rv[n] > rv[n + 1] for n in range(5))
        DANE[i, j] = True; P5[i, j] = ru == 5; MALO[i, j] = ru <= 3
        if 'ni' in sq:
            n0 = sq['ni'].przy(t, e0); n5 = sq['ni'].przy(t + 5 * Y + pd.Timedelta(days=120), e0 + 5 * Y)
            if n0 is not None and n5 is not None: NIW[i, j] = float(n5 > n0)
print('ocen:', DANE.sum(), 'P5:', P5.sum(), '≤3/5:', MALO.sum(), flush=True)

POL = {36: ((2012, 2017), (2018, 2023)), 60: ((2012, 2016), (2017, 2021)), 120: ((2012, 2014), (2015, 2016))}


def polowy(A_, B_, h):
    out = []
    for a, b in POL[h]:
        ea, eb = [], []
        for m in [m for m in STARTY if a <= m.year <= b and m <= KON[h]]:
            i = im_[m]
            ea += list(EX[h][i, A_[i] & UNI[i] & np.isfinite(EX[h][i])]); eb += list(EX[h][i, B_[i] & UNI[i] & np.isfinite(EX[h][i])])
        out.append(100 * (np.median(ea) - np.median(eb)) if ea and eb else np.nan)
    return out


def straty(M, h):
    v = [FW[h][im_[m], M[im_[m]] & UNI[im_[m]] & np.isfinite(FW[h][im_[m]])] for m in STARTY if m <= KON[h]]
    v = np.concatenate(v); return 100 * np.mean(v < 0), 100 * np.median(v), len(v)


rows = []
for nm, A_, B_ in (('P5 (przychody 5/5) vs reszta', P5, DANE & ~P5), ('P5 vs ≤ 3/5 lat wzrostu', P5, MALO)):
    for h in (36, 60, 120):
        na, nb, d0, lo, hi = test(A_, B_, h); p1, p2 = polowy(A_, B_, h)
        sa, ma, _ = straty(A_, h); sb, mb, _ = straty(B_, h)
        rows.append({'porównanie': nm, 'horyzont': f'{h // 12} l.', 'n': f'{na}/{nb}', 'różnica median (pp)': f'{d0:+.1f} [{lo:+.1f}; {hi:+.1f}]',
                     'połowy': f'{p1:+.1f} / {p2:+.1f}', 'mediana zwrotu A / B': f'{ma:+.0f} % / {mb:+.0f} %', 'ze stratą A / B': f'{sa:.0f} % / {sb:.0f} %'})
        print(rows[-1], flush=True)
eps = []
for nm, M in (('P5', P5), ('reszta', DANE & ~P5), ('≤ 3/5', MALO)):
    v = np.concatenate([NIW[im_[m], M[im_[m]] & np.isfinite(NIW[im_[m]])] for m in STARTY if m <= pd.Period('2021-01', 'M')])
    eps.append({'grupa': nm, 'zysk netto za 5 lat wyższy niż dziś': f'{100 * v.mean():.0f} %', 'n': len(v)})
print(eps)
out = ['# Etap 110: przychody rosnące 5 lat z rzędu, horyzont 5–10 lat', '', 'Nadwyżka = zwrot spółki minus mediana zbioru w tym samym starcie; różnica median grup, 95 % przedział z bootstrapu po latach startu.', '',
       pd.DataFrame(rows).to_markdown(index=False), '', '## Czy zysk idzie za sprzedażą (starty 2012–2021)', '', pd.DataFrame(eps).to_markdown(index=False), '']
open(os.path.join(HERE, 'wyniki', 'r135_etap110.md'), 'w').write('\n'.join(out)); print('\n'.join(out))
