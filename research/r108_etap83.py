"""Etap 83: sprzedaż przy 2 niespełnionych z 7 kryteriów (listy 7/7 i Jakość). Protokół: etap 83."""
import os
HERE = os.path.dirname(os.path.abspath(__file__))
_s = open(os.path.join(HERE, 'r106_etap81.py')).read()
exec(_s[:_s.index("PN = {")])
REV5T = (1 + X['rev_cagr5']) ** 5 - 1
DE_, FCFm = X['de'], X['fcf_margin']


def kryt(war, A, brak):
    return np.where(np.isfinite(A), war(np.nan_to_num(A, nan=0)), brak)


def listy(brak):
    L7 = [kryt(lambda a: a > 0.5, REV5T, brak), kryt(lambda a: a > 0.05, X['rev_1y'], brak), kryt(lambda a: a > 0.05, X['ni_1y'], brak), kryt(lambda a: a > 0.15, X['roe'], brak),
          kryt(lambda a: (a >= 0) & (a < 1), DE_, brak), kryt(lambda a: a > 0, FCFm, brak), kryt(lambda a: (a > 0) & (a < 1), PEG, brak)]
    J7 = [kryt(lambda a: a > 0.08, X['rev_cagr5'], brak), kryt(lambda a: (a >= 0) & (a < 1), DE_, brak), kryt(lambda a: a > 0, FCFm, brak), kryt(lambda a: a > 0.15, X['roe'], brak),
          kryt(lambda a: a > 0.10, X['roa'], brak), kryt(lambda a: a > 0, X['d_roe_3l'], brak), kryt(lambda a: a > 0.15, X['roce'], brak)]
    return sum(x.astype(int) for x in L7), sum(x.astype(int) for x in J7)


L7k, J7k = listy(False)        # kupno: brak = niespełnione
L7s, J7s = listy(True)         # trzymanie: brak = spełnione
SK = {'L7': (L7k, L7s), 'J7': (J7k, J7s)}
E1 = WEJ


def strat(WE, PS, bez=(), od=None, do=None):
    global WEJ
    stare = WEJ; WEJ = WE
    try:
        return strategia(PS, dokup=False, bez=bez, od=od, do=do)
    finally:
        WEJ = stare


out = ['# Etap 83: sprzedaż, gdy 2 z 7 kryteriów przestają być spełnione (2013-01..2026-09)', '',
       'Portfel: transza 4 % konta, bez dokupowania, gotówka w SPY. E1 = ocena top 10 % + PEG 0–2; E2 = 7/7 danej listy. Przy sprzedaży brak danych = spełnione.', '']
rows = [dict(wariant='SPY', **bench(spy)), dict(wariant='QQQ', **bench(qqq)), dict(wariant='E1 + P1 (etap 81)', **strat(E1, P1))]
for nl, (K_, S_) in SK.items():
    E2 = ZB & (K_ == 7)
    for we_nm, WE in (('E1', E1), ('E2 7/7 ' + nl, E2)):
        rows.append(dict(wariant=f'{we_nm}, sprzedaj ≤ 5/7 {nl}', **strat(WE, S_ <= 5)))
        rows.append(dict(wariant=f'{we_nm}, sprzedaj ≤ 4/7 {nl}', **strat(WE, S_ <= 4)))
        rows.append(dict(wariant=f'{we_nm}, sprzedaj ≤ 5/7 {nl} lub P1', **strat(WE, (S_ <= 5) | P1)))
        rows.append(dict(wariant=f'{we_nm}, sprzedaj P1', **strat(WE, P1)))
        print(nl, we_nm, flush=True)
out += ['## Całość', '', pd.DataFrame(rows).round(3).to_markdown(index=False), '']
rows = []
for od, do, nm in ((pd.Period('2013-01', 'M'), pd.Period('2019-12', 'M'), '2013–2019'), (pd.Period('2020-01', 'M'), pd.Period('2026-09', 'M'), '2020–2026'), (None, None, 'całość bez NVDA')):
    bez = ('NVDA',) if nm == 'całość bez NVDA' else ()
    if not bez: rows.append(dict(okres=nm, wariant='SPY', **bench(spy, od, do)))
    rows.append(dict(okres=nm, wariant='E1 + P1', **strat(E1, P1, bez, od, do)))
    for nl, (K_, S_) in SK.items():
        E2 = ZB & (K_ == 7)
        rows.append(dict(okres=nm, wariant=f'E1, sprzedaj ≤ 5/7 {nl}', **strat(E1, S_ <= 5, bez, od, do)))
        rows.append(dict(okres=nm, wariant=f'E2 7/7 {nl}, sprzedaj ≤ 5/7 {nl}', **strat(E2, S_ <= 5, bez, od, do)))
out += ['## Połowy i bez NVDA', '', pd.DataFrame(rows).round(3).to_markdown(index=False), '']
i = im_[mies[-1]]
for nl, (K_, S_) in SK.items():
    dz = np.flatnonzero(ZB[i] & (K_[i] == 7))
    out += [f'7/7 {nl} w {mies[-1]}: ' + ', '.join(sorted(kod[j] for j in dz)), '']
open(os.path.join(HERE, 'wyniki', 'r108_etap83.md'), 'w').write('\n'.join(out)); print('\n'.join(out))
