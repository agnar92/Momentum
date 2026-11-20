import os, sys, numpy as np, pandas as pd
os.chdir('/home/user/Momentum/research'); __file__ = '/home/user/Momentum/research/r90_hello_stocks.py'
src = open('r90_hello_stocks.py').read().split("\nout = [")[0]
exec(src)
def transakcje(SC, S, E):
    poz = {}; tr = []
    mies = [m for m in ms if S <= m <= E]
    for m in mies:
        i = im_[m]
        for j in list(poz):
            if m != mies[0] and (SC[i, j] <= 5 or not np.isfinite(Cv[i, j])) and m != E:
                c = Cv[i, j] if np.isfinite(Cv[i, j]) else poz[j][1]
                m0, c0, _ = poz.pop(j); tr.append((tick[j], str(m0), str(m), c / c0 - 1, 'zamknięta', spy[m] / spy[m0] - 1))
        if m == E: break
        for j in np.flatnonzero((SC[i] == 7) & np.isfinite(Cv[i])):
            if j not in poz: poz[j] = (m, Cv[i, j], None)
    i = im_[E]
    for j, (m0, c0, _) in poz.items():
        c = Cv[i, j] if np.isfinite(Cv[i, j]) else c0
        tr.append((tick[j], str(m0), str(E), c / c0 - 1, 'otwarta', spy[E] / spy[m0] - 1))
    return pd.DataFrame(tr, columns=['spolka', 'kupno', 'sprzedaz', 'zwrot', 'status', 'SPY_w_tym_czasie'])
for nazwa, PEG in (('PEG z EPS', PEG_EPS), ('PEG z przychodów', PEG_REV)):
    T = transakcje(wynik(PEG), pd.Period('2025-01', 'M'), KONIEC)
    o = T[T.status == 'otwarta']
    print(f'\n== {nazwa}: {len(T)} pozycji ({len(o)} otwartych)')
    print(f'suma procentów wszystkich pozycji: {T.zwrot.sum():+.0%}   (SPY tak samo: {T.SPY_w_tym_czasie.sum():+.0%})')
    print(f'średnia na pozycję (= wynik na włożonych pieniądzach): {T.zwrot.mean():+.1%}')
    print(f'średnia otwartych pozycji: {o.zwrot.mean():+.1%}, suma otwartych: {o.zwrot.sum():+.0%}')
    print(f'trafione: {(T.zwrot > 0).mean():.0%}; najlepsze: ' + ', '.join(f'{r.spolka} {r.zwrot:+.0%}' for r in T.nlargest(6, 'zwrot').itertuples()))
    T.round(3).to_csv(f'/home/user/Momentum/research/wyniki/r90b_hs_{nazwa[-3:]}.csv', index=False)
