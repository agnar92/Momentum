"""Etap 69c: portfele wzorców z decyzją raz w roku (styczeń, trzymane 12 mies.) vs co kwartał vs co miesiąc."""
import os, pickle, numpy as np, pandas as pd
HERE = os.path.dirname(os.path.abspath(__file__)); SZ = '/home/user/ndx/szer'
Z = np.load(f'{SZ}/cache.npz', allow_pickle=True); Cv, U = Z['Cv'], Z['U'].astype(bool)
ms = [pd.Period(x, 'M') for x in Z['mies']]; im_ = {m: i for i, m in enumerate(ms)}
P_, S_, G0, _ = pickle.load(open(f'{SZ}/wzorce.pkl', 'rb'))
exec(open(os.path.join(HERE, 'r19_cem10.py')).read().split('warianty = {')[0]); spy, qqq = etf['SPY'], etf['QQQ']
mies = [m for m in ms if pd.Period('2012-01', 'M') <= m <= pd.Period('2026-09', 'M')]
def port(M, co):
    v, eq, wyb, n = 1.0, [], None, []
    for a, m in enumerate(mies[:-1]):
        i, i1 = im_[m], im_[mies[a + 1]]
        if wyb is None or (co == 12 and m.month == 1) or (co == 3 and m.month in (1, 4, 7, 10)) or co == 1:
            wyb = np.flatnonzero(M[i] & np.isfinite(Cv[i])); wart = {j: v / len(wyb) for j in wyb} if len(wyb) else {}; v -= 0.002 * v if len(wyb) else 0
        if wart:
            for j in list(wart):
                wart[j] *= Cv[i1, j] / Cv[i, j] if np.isfinite(Cv[i1, j]) else 1.0
            v = sum(wart.values())
        else: v *= spy[mies[a + 1]] / spy[m]
        eq.append(v); n.append(len(wart))
    e = pd.Series(eq); return e.iloc[-1] ** (12 / len(e)) - 1, (e / e.cummax() - 1).min(), np.mean(n)
rows = []
for nm, M in (('PARABOLA (typ NVIDIA)', P_), ('STABILNY (typ Microsoft)', S_)):
    for co, cn in ((12, 'raz w roku (styczeń)'), (3, 'co kwartał'), (1, 'co miesiąc')):
        c, d, n = port(M, co); rows.append(dict(wzorzec=nm, decyzja=cn, CAGR=c, maxDD=d, sr_spolek=n))
for nm, s in (('SPY', spy), ('QQQ', qqq)):
    x = s[mies[0]:mies[-1]]; e = (x / x.iloc[0]).iloc[1:]; rows.append(dict(wzorzec=nm, decyzja='-', CAGR=e.iloc[-1] ** (12 / len(e)) - 1, maxDD=(e / e.cummax() - 1).min()))
T = pd.DataFrame(rows); out = '# Etap 69c: portfele wzorców — decyzja raz w roku / co kwartał / co miesiąc (2012-01..2026-09, równe wagi)\n\n' + T.round(3).to_markdown(index=False) + '\n'
open(os.path.join(HERE, 'wyniki', 'r94c_raz_w_roku.md'), 'w').write(out); print(out)
