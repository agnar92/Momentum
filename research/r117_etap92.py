"""Etap 92: test sygnałów ostrzegawczych Lyncha z karty spółki. Protokół: etap 92."""
import os
HERE = os.path.dirname(os.path.abspath(__file__))
_s = open(os.path.join(HERE, 'r111_etap86.py')).read()
exec(_s[:_s.index("\n\ndef grupa(")])
nz = lambda A_, v: np.nan_to_num(A_, nan=v)
rng = np.random.default_rng(92)
g5, r1 = X['rev_cagr5'], X['rev_1y']
CYK = nz(X['najgorszy_rok_przych'], 9) <= -0.10
SZYB = ~CYK & (nz(g5, -9) >= 0.20)
STAB = ~CYK & (nz(g5, -9) >= 0.08) & (nz(g5, 9) < 0.20)
WOLN = ~CYK & np.isfinite(g5) & (nz(g5, 9) < 0.08)
lag = lambda A_, k: np.vstack([np.full((k, NS), np.nan), A_[:-k]])
PE = np.where(nz(X['pe'], -1) > 0, X['pe'], np.nan)
PEMED = pd.DataFrame(PE).rolling(60, min_periods=36).median().to_numpy()
N1 = X['ni_1y']
SPADEK = ((nz(r1, 1) < 0) & (nz(lag(r1, 12), 1) < 0)) | ((nz(N1, 1) < 0) & (nz(lag(N1, 12), 1) < 0))
ZAP = X['zapasy_vs_przych']
SYG = [  # (typ, nazwa, ⚠, ✓)  — ✓ = sygnał policzalny i nie wystąpił
    ('Szybko rosnąca', 'dojrzewanie (przychody 1 rok < 0,6 × średnia 5 lat)', SZYB & (nz(r1, 9) < 0.6 * nz(g5, 0)), SZYB & np.isfinite(r1) & (nz(r1, -9) >= 0.6 * nz(g5, 0))),
    ('Szybko rosnąca', 'sprzedaż kwartalna hamuje 2 kwartały z rzędu', SZYB & (nz(X['przysp_kw'], 9) < 0) & (nz(lag(X['przysp_kw'], 3), 9) < 0),
     SZYB & np.isfinite(X['przysp_kw']) & np.isfinite(lag(X['przysp_kw'], 3)) & ~((nz(X['przysp_kw'], 9) < 0) & (nz(lag(X['przysp_kw'], 3), 9) < 0))),
    ('Szybko rosnąca', 'PEG ≥ 2 (historyczny)', SZYB & (nz(X['peg'], -1) >= 2), SZYB & (nz(X['peg'], -1) > 0) & (nz(X['peg'], 9) < 2)),
    ('Szybko rosnąca', 'zapasy r/r > sprzedaż r/r + 10 pp', SZYB & (nz(ZAP, 9) < -0.10), SZYB & (nz(ZAP, -9) >= -0.10)),
    ('Stabilnie rosnąca', 'P/E > 1,3 × własna mediana 5 lat', STAB & (nz(PE, -1) > 1.3 * nz(PEMED, 1e9)), STAB & np.isfinite(PE) & np.isfinite(PEMED) & (nz(PE, 1e9) <= 1.3 * nz(PEMED, 0))),
    ('Stabilnie rosnąca', 'przychody 1 rok < średnia 5 lat − 5 pp', STAB & (nz(r1, 9) < nz(g5, 0) - 0.05), STAB & np.isfinite(r1) & (nz(r1, -9) >= nz(g5, 0) - 0.05)),
    ('Stabilnie rosnąca', 'fundamenty słabną 2 lata (⬇)', STAB & SPADEK, STAB & np.isfinite(r1) & ~SPADEK),
    ('Wolno rosnąca', 'fundamenty słabną 2 lata (⬇)', WOLN & SPADEK, WOLN & np.isfinite(r1) & ~SPADEK),
    ('Cykliczna', 'zapasy r/r > sprzedaż r/r + 10 pp', CYK & (nz(ZAP, 9) < -0.10), CYK & (nz(ZAP, -9) >= -0.10)),
    ('Cykliczna', 'rampa capex (≥ 2× w 2 lata)', CYK & (nz(C['ramp'], 0) == 1), CYK & (nz(C['ramp'], 1) == 0)),
    ('Cykliczna', 'sprzedaż kwartalna r/r < 0', CYK & (nz(X['przych_kw_rr'], 9) < 0), CYK & (nz(X['przych_kw_rr'], -9) >= 0)),
    ('Cykliczna', 'pułapka: zysk +50 % r/r i P/E < własna mediana', CYK & (nz(N1, -9) > 0.5) & (nz(PE, 1e9) < nz(PEMED, 0)),
     CYK & np.isfinite(N1) & np.isfinite(PE) & np.isfinite(PEMED) & ~((nz(N1, -9) > 0.5) & (nz(PE, 1e9) < nz(PEMED, 0)))),
]


def nadw(h):
    """nadwyżka nad medianą zbioru w danym starcie"""
    E = np.full((NT, NS), np.nan)
    for m in STARTY:
        if m > KON[h]: continue
        i = im_[m]; ok = UNI[i] & np.isfinite(FW[h][i])
        if ok.sum() > 50: E[i, ok] = FW[h][i, ok] - np.median(FW[h][i, ok])
    return E


EX = {h: nadw(h) for h in (12, 36)}


def test(A_, B_, h):
    lata = [m for m in STARTY if m <= KON[h]]
    pa = {m: EX[h][im_[m], np.flatnonzero(A_[im_[m]] & UNI[im_[m]] & np.isfinite(EX[h][im_[m]]))] for m in lata}
    pb = {m: EX[h][im_[m], np.flatnonzero(B_[im_[m]] & UNI[im_[m]] & np.isfinite(EX[h][im_[m]]))] for m in lata}
    a, b = np.concatenate(list(pa.values())), np.concatenate(list(pb.values()))
    if len(a) < 10 or len(b) < 10: return len(a), len(b), np.nan, np.nan, np.nan
    d0 = 100 * (np.median(a) - np.median(b)); bs = []
    for _ in range(2000):
        w = rng.choice(len(lata), len(lata), replace=True)
        aa = np.concatenate([pa[lata[k]] for k in w]); bb = np.concatenate([pb[lata[k]] for k in w])
        if len(aa) and len(bb): bs.append(100 * (np.median(aa) - np.median(bb)))
    lo, hi = np.percentile(bs, [2.5, 97.5])
    return len(a), len(b), d0, lo, hi


rows = []
for typ, nm, A_, B_ in SYG:
    r = {'typ': typ, 'sygnał ⚠': nm}
    wyn = {}
    for h in (12, 36):
        na, nb, d0, lo, hi = test(A_, B_, h); wyn[h] = (d0, hi)
        r[f'n ⚠/✓ {h} m'] = f'{na}/{nb}'
        r[f'⚠ − ✓ {h} m (pp)'] = f'{d0:+.1f} [{lo:+.1f}; {hi:+.1f}]' if d0 == d0 else '–'
    d36, h36 = wyn[36]; d12, h12 = wyn[12]
    ok = (d36 == d36 and d36 < 0 and h36 < 0) or (d12 == d12 and d12 < 0 and h12 < 0 and d36 == d36 and d36 <= 0)
    r['werdykt'] = 'potwierdzony' if ok else 'niepotwierdzony'
    rows.append(r); print(r, flush=True)
# łącznie: dowolny sygnał ⚠ w typie vs żaden
for typ in ('Szybko rosnąca', 'Stabilnie rosnąca', 'Cykliczna'):
    syg = [s for s in SYG if s[0] == typ]
    A_ = np.zeros((NT, NS), bool)
    for s in syg: A_ |= s[2]
    B_ = syg[0][3].copy()
    for s in syg[1:]: B_ &= ~s[2]
    B_ &= ~A_
    r = {'typ': typ, 'sygnał ⚠': 'co najmniej jeden sygnał vs żaden'}
    for h in (12, 36):
        na, nb, d0, lo, hi = test(A_, B_, h)
        r[f'n ⚠/✓ {h} m'] = f'{na}/{nb}'; r[f'⚠ − ✓ {h} m (pp)'] = f'{d0:+.1f} [{lo:+.1f}; {hi:+.1f}]' if d0 == d0 else '–'
    r['werdykt'] = '(łącznie)'
    rows.append(r)
T = pd.DataFrame(rows)
out = ['# Etap 92: test sygnałów ostrzegawczych Lyncha z karty spółki', '',
       'Top 500 USA PIT bez wykluczonych sektorów, starty w styczniu 2012–2023. Wartość: różnica median nadwyżki zwrotu ceny nad medianą zbioru (spółki z sygnałem ⚠ minus '
       'spółki tego samego typu bez sygnału), pp; w nawiasie 95 % przedział z bootstrapu po latach startowych. Ujemna = sygnał ostrzega słusznie.', '',
       T.to_markdown(index=False), '']
open(os.path.join(HERE, 'wyniki', 'r117_etap92.md'), 'w').write('\n'.join(out)); print('\n'.join(out))
