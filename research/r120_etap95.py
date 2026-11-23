"""Etap 95: „Prosty wybór” — licznik 0–6 potwierdzonych cech (Jakość 7/7, Siła ≥ 7, przychody > 10 % w ≥ 3 z 5 lat, ROA ≥ 10 %, OCF ≥ 30 % długu, brak ⬇).
Protokół: etap 95."""
import os
HERE = os.path.dirname(os.path.abspath(__file__))
_s92 = open(os.path.join(HERE, 'r117_etap92.py')).read()
exec(_s92[:_s92.index("SYG = [")])
exec(_s92[_s92.index("def nadw(h):"):_s92.index("rows = []")])
rng = np.random.default_rng(95)
kryt = lambda war, A: np.where(np.isfinite(A), war(np.nan_to_num(A, nan=0)), False)
J7 = sum(x.astype(int) for x in [kryt(lambda a: a > 0.08, X['rev_cagr5']), kryt(lambda a: (a >= 0) & (a < 1), X['de']), kryt(lambda a: a > 0, X['fcf_margin']),
                                 kryt(lambda a: a > 0.15, X['roe']), kryt(lambda a: a > 0.10, X['roa']), kryt(lambda a: a > 0, X['d_roe_3l']), kryt(lambda a: a > 0.15, X['roce'])])
SILA_P = [('gm', 1), ('om', 1), ('nm', 1), ('roe', 1), ('roa', 1), ('roce', 1), ('fcf_margin', 1), ('de', -1), ('qr', 1), ('net_cash_mc', 1), ('C3_akcje_3l', 1),
          ('capex_przych', -1), ('kapital_3l', -1)]
SILA = np.full((NT, NS), np.nan)
for m in STARTY:
    i = im_[m]; cols = []
    for p, kier in SILA_P:
        v = X[p][i].copy(); ok = UNI[i] & np.isfinite(v)
        if p == 'de': ok &= v >= 0
        P = np.full(NS, np.nan)
        if ok.sum() >= 20:
            r = pd.Series(v[ok]).rank(method='average').to_numpy(); P[ok] = (r - 0.5) / ok.sum() if kier > 0 else 1 - (r - 0.5) / ok.sum()
        cols.append(P)
    A = np.stack(cols); n_ = np.isfinite(A).sum(0)
    SILA[i] = np.where(n_ >= 2, 10 * (np.nansum(A, 0) + 0.5 * (len(SILA_P) - n_)) / len(SILA_P), np.nan)
PKT = {'P1 Jakość 7/7': J7 == 7, 'P2 Siła ≥ 7': nz(SILA, 0) >= 7, 'P3 przychody > 10 % w ≥ 3 z 5 lat': nz(X['rev_lata_10'], 0) >= 3,
       'P4 ROA ≥ 10 %': nz(X['roa'], -9) >= 0.10, 'P5 OCF ≥ 30 % długu': nz(C['ocf_dlug'], -9) >= 0.30, 'P6 brak ⬇': np.isfinite(r1) & ~SPADEK}
L = sum(v.astype(int) for v in PKT.values())
FW36, FW12 = FW[36], FW[12]


def opis(M, h, lata):
    ex, bij, strata = [], [], []
    for m in lata:
        i = im_[m]; ok = UNI[i] & np.isfinite(EX[h][i]) & M[i]
        ex += list(EX[h][i, ok]); bij += list(EX[h][i, ok] > 0); strata += list(FW[h][i, ok] < 0)
    return len(ex), np.median(ex) if ex else np.nan, np.mean(bij) if bij else np.nan, np.mean(strata) if strata else np.nan


GR = {'0–2 pkt': L <= 2, '3–4 pkt': (L >= 3) & (L <= 4), '5–6 pkt': L >= 5, 'wszystkie': np.ones((NT, NS), bool)}
rows = []
for okres, a, b in (('2012–2023', 2012, 2023), ('2012–2017', 2012, 2017), ('2018–2023', 2018, 2023)):
    for nm, M in GR.items():
        r = {'okres': okres, 'grupa': nm}
        for h in (12, 36):
            lata = [m for m in STARTY if a <= m.year <= b and m <= KON[h]]
            n, med, bij, st = opis(M, h, lata)
            r[f'n {h} m'] = n; r[f'nadwyżka {h} m (mediana)'] = f'{100 * med:+.1f} pp'; r[f'lepsze od mediany {h} m'] = f'{100 * bij:.0f} %'
            if h == 36: r['ze stratą po 36 m'] = f'{100 * st:.0f} %'
        rows.append(r)
T = pd.DataFrame(rows)
d = {h: test(L >= 5, L <= 2, h) for h in (12, 36)}
pojed = []
for nm, M in PKT.items():
    na, nb, d0, lo, hi = test(M, ~M & np.isfinite(r1), 36)
    pojed.append({'cecha': nm, 'n z / bez': f'{na}/{nb}', 'różnica 36 m (pp)': f'{d0:+.1f} [{lo:+.1f}; {hi:+.1f}]'})
out = ['# Etap 95: „Prosty wybór” — licznik 0–6 potwierdzonych cech', '',
       'Top 500 USA PIT bez wykluczonych sektorów, starty w styczniu. Nadwyżka = zwrot ceny minus mediana zbioru w tym samym starcie; „lepsze od mediany” = odsetek spółek '
       'z nadwyżką > 0 (prawdopodobieństwo trafienia lepszej spółki).', '', T.to_markdown(index=False), '',
       f"5–6 pkt minus 0–2 pkt (różnica median, 95 % przedział z bootstrapu po latach): 12 mies. {d[12][2]:+.1f} [{d[12][3]:+.1f}; {d[12][4]:+.1f}] pp, "
       f"36 mies. {d[36][2]:+.1f} [{d[36][3]:+.1f}; {d[36][4]:+.1f}] pp.", '',
       '## Pojedyncze cechy (spółki z cechą vs bez, 36 mies.)', '', pd.DataFrame(pojed).to_markdown(index=False), '']
open(os.path.join(HERE, 'wyniki', 'r120_etap95.md'), 'w').write('\n'.join(out)); print('\n'.join(out))
