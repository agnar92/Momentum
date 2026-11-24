"""Etap 105: faza rozwoju + korzystna cena (PEG / DCF) — kup w styczniu, trzymaj do schyłku. Protokół: etap 105."""
import os
HERE = os.path.dirname(os.path.abspath(__file__))
_s104 = open(os.path.join(HERE, 'r129_etap104.py')).read()
exec(_s104[:_s104.index("NAZ = {")])
rng = np.random.default_rng(105)


def dcf_wzgl(przych, marza, g, gotowka):
    """jak ocena.dcf: przychody i gotówka netto względem kapitalizacji (akcje = 1) → wartość ÷ kapitalizacja"""
    r, tg, lata, wyg = 0.10, 0.03, 5, 5
    pv, rev = 0.0, przych
    for t in range(1, lata + wyg + 1):
        gt = g if t <= lata else g + (tg - g) * (t - lata) / wyg
        rev *= 1 + gt; pv += rev * marza / (1 + r) ** t
    pv += rev * marza * (1 + tg) / (r - tg) / (1 + r) ** (lata + wyg)
    return pv + gotowka


TANIO = {}
for (j, m), f in FAZA.items():
    i = im_[m]
    peg, ps, mz, g3, nc = X['peg'][i, j], X['ps'][i, j], X['fcf_margin'][i, j], X['rev_cagr3'][i, j], X['net_cash_mc'][i, j]
    pot = None
    if np.isfinite(ps) and ps > 0 and np.isfinite(mz) and mz > 0 and np.isfinite(g3):
        pot = dcf_wzgl(1 / ps, min(0.60, mz), max(0.0, min(0.25, g3)), nc if np.isfinite(nc) else 0.0) - 1
    pg = peg if np.isfinite(peg) and peg > 0 else None
    t1 = (pg is not None and pg < 1) or (pg is None and pot is not None and pot >= 0.15)
    t2 = (pg is not None and pg < 2) or (pot is not None and pot >= 0.15)
    TANIO[(j, m)] = (t1, t2, pg, pot)
print('ocen ceny:', len(TANIO), 'z PEG:', sum(1 for v in TANIO.values() if v[2] is not None), 'z DCF:', sum(1 for v in TANIO.values() if v[3] is not None), flush=True)

NAZ = {1: '1 Start', 2: '2 Hiperwzrost', 3: '3 Dźwignia operacyjna', 4: '4 Zwrot kapitału'}


def zbierz(war):
    """war: 'T1' / 'T2' tanio, 'T1n' / 'T2n' — ta sama faza bez korzystnej ceny"""
    out = {}
    for X_ in (1, 2, 3, 4):
        P = []
        for (j, m), f in FAZA.items():
            if f != X_ or not (2012 <= m.year <= 2023) or not UNI[im_[m], j]: continue
            t1, t2, _, _ = TANIO[(j, m)]
            c = t1 if war.startswith('T1') else t2
            if war.endswith('n'): c = not c
            if not c: continue
            p = pozycja(j, m)
            if p: P.append(p)
        out[X_] = pd.DataFrame(P)
    return out


def bs(a, b=None):
    lata = sorted(a.rok.unique())
    ga = {r: (a[a.rok == r].cagr - a[a.rok == r].med).to_numpy() for r in lata}
    gb = {r: (b[b.rok == r].cagr - b[b.rok == r].med).to_numpy() for r in lata} if b is not None else None
    w_ = []
    for _ in range(2000):
        w = rng.choice(len(lata), len(lata))
        va = np.concatenate([ga[lata[x]] for x in w])
        if gb is None: w_.append(np.median(va)); continue
        vb = np.concatenate([gb[lata[x]] for x in w if len(gb[lata[x]])])
        if len(va) and len(vb): w_.append(np.median(va) - np.median(vb))
    return np.percentile(w_, [2.5, 97.5])


wyn = {w: zbierz(w) for w in ('T1', 'T1n', 'T2', 'T2n')}
rows = []
for w, wn, opis in (('T1', 'T1n', 'T1: PEG 0–1 (brak PEG → DCF ≥ +15 %)'), ('T2', 'T2n', 'T2: PEG 0–2 lub DCF ≥ +15 % (reguła dokupu)')):
    for X_ in (1, 2, 3, 4):
        a, b = wyn[w][X_], wyn[wn][X_]
        r = {'próg ceny': opis, 'faza': NAZ[X_], 'pozycji tanio / reszta': f'{len(a)} / {len(b)}'}
        if len(a) >= 10:
            ex = a.cagr - a.med; lo, hi = bs(a)
            h1, h2 = a[a.rok <= 2017], a[a.rok >= 2018]
            r.update({'CAGR tanio (mediana)': f'{100 * a.cagr.median():+.1f} %', 'nadwyżka nad rynkiem': f'{100 * ex.median():+.1f} pp [{100 * lo:+.1f}; {100 * hi:+.1f}]',
                      'lepsze od rynku': f'{100 * (ex > 0).mean():.0f} %', 'ze stratą': f'{100 * a.strata.mean():.0f} %', 'trzymanie (lat)': round(a.lat.median(), 1),
                      'nadwyżka 12–17 / 18–23': f'{100 * (h1.cagr - h1.med).median():+.1f} / {100 * (h2.cagr - h2.med).median():+.1f} pp'})
            if len(b) >= 10:
                lo2, hi2 = bs(a, b)
                r['tanio − ta sama faza drożej'] = f'{100 * ((a.cagr - a.med).median() - (b.cagr - b.med).median()):+.1f} pp [{100 * lo2:+.1f}; {100 * hi2:+.1f}]'
        rows.append(r); print(r, flush=True)
T = pd.DataFrame(rows)
out = ['# Etap 105: faza rozwoju + korzystna cena (PEG / DCF), trzymanie do schyłku', '',
       'Top 500 USA PIT bez wykluczonych sektorów; wejście w styczniu 2012–2023, gdy spółka jest w fazie i cena korzystna; wyjście przy schyłku albo 2026-09. '
       'Nadwyżka = CAGR pozycji − CAGR mediany zbioru w tym samym okresie (pp rocznie; 95 % przedział z bootstrapu po latach). PEG z przeszłego wzrostu zysku 5 lat, DCF jak na stronie.', '',
       T.to_markdown(index=False), '']
open(os.path.join(HERE, 'wyniki', 'r130_etap105.md'), 'w').write('\n'.join(out)); print('\n'.join(out))
