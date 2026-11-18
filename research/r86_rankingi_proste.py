"""Etap 64: diagnoza (SPY vs równe wagi, spółki z etapu 63 w równych wagach) + proste rankingi top 10 po PEG / długu co miesiąc."""
import os, numpy as np, pandas as pd
HERE = os.path.dirname(os.path.abspath(__file__))
exec(open(os.path.join(HERE, 'r85_przycinanie_peg.py')).read().split('rows = []')[0])   # D, macierze, STm, WSm, PEG, sim (etap 63)
g5e = D['EPS 5 lat (CAGR)']
PEGE = mat(np.where((D['P/E'] > 0) & (g5e > 0), D['P/E'] / (100 * g5e), np.nan))
DEm = mat(D['dług / kapitał'].values); ROEm = mat(D['ROE'].values)
CZL = mat(np.ones(len(D)), 0) > 0          # członek S&P 500 w danym miesiącu (wiersz panelu)


def portfel(wybor, N=10, co=1):
    """Równe wagi top N co `co` mies.; wybor(i) -> (indeksy kandydatów, klucz rosnąco)."""
    eq, wart, poz = [], 1.0, {}
    for a, m in enumerate(mies[:-1]):
        i = im_[m]; i1 = im_[mies[a + 1]]
        if a % co == 0:
            ok, key = wybor(i); ok = ok[np.isfinite(Cv[i, ok]) & np.isfinite(Cv[i1, ok])]
            ok = ok[np.argsort(key[ok])][:N] if N else ok
            nowe = {j: wart / len(ok) for j in ok} if len(ok) else {}
            zm = sum(abs(nowe.get(j, 0) - poz.get(j, 0)) for j in set(nowe) | set(poz)) + (wart if not nowe else 0) * 0
            wart -= zm * KOSZT; poz = {j: wart / len(ok) for j in ok} if len(ok) else {}
        r = 0.0
        if poz:
            v = 0.0
            for j in poz:
                c0, c1 = Cv[i, j], Cv[i1, j]
                poz[j] *= c1 / c0 if np.isfinite(c1) and np.isfinite(c0) else 1.0
                v += poz[j]
            wart = v
        else:
            wart *= 1 + SPYR[i]
        eq.append((mies[a + 1], wart))
    e = pd.Series(dict(eq)); s = spy[(spy.index >= mies[1]) & (spy.index <= mies[-1])] / spy[mies[0]]; e = e.reindex(s.index); lat = len(e) / 12
    return e, s, lat


def miary(e, s, lat, ew=None):
    d = dict(CAGR=e.iloc[-1] ** (1 / lat) - 1, SPY=s.iloc[-1] ** (1 / lat) - 1, maxDD=(e / e.cummax() - 1).min(),
             okna_12m_SPY=(e.pct_change(12) > s.pct_change(12)).iloc[12:].mean(), okna_60m_SPY=(e.pct_change(60) > s.pct_change(60)).iloc[60:].mean())
    if ew is not None: d['okna_60m_rowne_SP500'] = (e.pct_change(60) > ew.pct_change(60)).iloc[60:].mean()
    return d


pos = lambda M, i: np.flatnonzero(np.isfinite(M[i]) & (M[i] > 0))
rows = []
ew, s, lat = portfel(lambda i: (np.flatnonzero(CZL[i]), np.zeros(NS)), N=0)
rows.append(dict(wariant='równe wagi wszystkich członków S&P 500 (co miesiąc)', **miary(ew, s, lat)))
rows.append(dict(wariant='SPY (ważony kapitalizacją)', **miary(s, s, lat, ew)))
q, _, _ = portfel(lambda i: (np.flatnonzero(STm[i] & WSm[i]), np.zeros(NS)), N=0)
rows.append(dict(wariant='spółki z etapu 63, równe wagi, 100 % w spółkach, co miesiąc', **miary(q, s, lat, ew)))
for N in (10, 20):
    for co in (1, 3):
        cn = f'top {N}, co {"miesiąc" if co == 1 else "kwartał"}'
        rows.append(dict(wariant=f'R1 najniższy PEG z przychodów, {cn}', **miary(*portfel(lambda i: (pos(PEG, i), PEG[i]), N, co), ew)))
        rows.append(dict(wariant=f'R2 najniższy PEG z EPS 5 lat, {cn}', **miary(*portfel(lambda i: (pos(PEGE, i), PEGE[i]), N, co), ew)))
        rows.append(dict(wariant=f'R3 najniższy dług/kapitał, {cn}', **miary(*portfel(lambda i: (np.flatnonzero(np.isfinite(DEm[i]) & (DEm[i] >= 0)), DEm[i]), N, co), ew)))
        rows.append(dict(wariant=f'R3b najniższy dług/kapitał przy ROE > 15 %, {cn}',
                         **miary(*portfel(lambda i: (np.flatnonzero(np.isfinite(DEm[i]) & (DEm[i] >= 0) & (np.nan_to_num(ROEm[i]) > 0.15)), DEm[i]), N, co), ew)))
        print(cn, flush=True)
T = pd.DataFrame(rows)
# etap 63: udział i zwrot części spółkowej
r63 = sim(grupy=('S',))
out = ['# Etap 64: diagnoza i proste rankingi (równe wagi, top N); 2015-01..2026-09', '',
       f'Etap 63 (wariant główny): {r63["CAGR"]:.1%}/rok, średnio {r63["udzial"]:.0%} kapitału w spółkach, {r63["sr_spolek"]:.1f} spółki.', '',
       T.round(3).to_markdown(index=False), '']
open(os.path.join(HERE, 'wyniki', 'r86_rankingi_proste.md'), 'w').write('\n'.join(out)); print('\n'.join(out))
