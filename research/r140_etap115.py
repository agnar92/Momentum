"""Etap 115: kupno „tanio” wśród dobrych spółek — DCF vs PEG vs P/E na tle własnych 5 lat. Protokół: etap 115."""
import os
HERE = os.path.dirname(os.path.abspath(__file__))
_s113 = open(os.path.join(HERE, 'r138_etap113.py')).read()
exec(_s113[:_s113.index("nz = lambda")])          # dane, POT (potencjał DCF w styczniu), portfel_k
exec(_s113[_s113.index("POL = {"):_s113.index("D10 = ")])
rng = np.random.default_rng(115)
nz = lambda A_, v: np.nan_to_num(A_, nan=v)
PEc = X['pe']
print('pokrycie P/E: styczeń', np.isfinite(PEc[im_[pd.Period('2016-01', 'M')]]).sum(), 'lipiec', np.isfinite(PEc[im_[pd.Period('2016-07', 'M')]]).sum(), flush=True)
J = (nz(X['rev_cagr5'], -9) > 0.08) & (nz(X['roe'], -9) > 0.15) & (nz(X['fcf_margin'], -1) > 0) & (nz(X['de'], -1) >= 0) & (nz(X['de'], 9) < 1)
J77 = WAR['B: Jakość 7/7 + 7/7 bez PEG + bez ⬇']
TER = np.zeros((NT, NS), bool); TER_ok = np.zeros((NT, NS), bool); MED = np.zeros((NT, NS), bool)
for m in STARTY:
    i = im_[m]
    for j in np.flatnonzero(UNI[i]):
        p0 = PEc[i, j]
        if not (np.isfinite(p0) and p0 > 0): continue
        h = PEc[max(0, i - 60):i, j]; h = h[np.isfinite(h) & (h > 0)]
        if len(h) < 24: continue
        TER_ok[i, j] = True
        TER[i, j] = p0 <= np.percentile(h, 100 / 3)
        MED[i, j] = p0 < 0.8 * np.median(h)
print('P/E z historią (średnio w styczniu):', np.mean([TER_ok[im_[m]].sum() for m in STARTY]), flush=True)
PEG = X['peg']
SYG = {'DCF ≥ +15 %': (nz(POT, -9) >= 0.15, np.isfinite(POT)),
       'PEG 0–2': ((nz(PEG, -1) > 0) & (nz(PEG, 9) < 2), np.isfinite(PEG)),
       'PEG < 1': ((nz(PEG, -1) > 0) & (nz(PEG, 9) < 1), np.isfinite(PEG)),
       'P/E w dolnej 1/3 własnych 5 lat': (TER, TER_ok),
       'P/E < 0,8 × mediana 5 lat': (MED, TER_ok)}
rowsC = []
for pn, P_ in (('J (wzrost 5 l. > 8 %, ROE > 15 %, FCF > 0, D/E < 1)', J), ('J77 (Jakość 7/7 + 7/7 bez PEG, bez ⬇)', J77)):
    for nm, (A0, OK) in SYG.items():
        A_ = P_ & OK & A0; B_ = P_ & OK & ~A0
        for h in (12, 36, 60):
            na, nb, d0, lo, hi = test(A_, B_, h); p1, p2 = polowy(A_, B_, h)
            rowsC.append({'pula': pn.split(' ')[0], 'sygnał „tanio”': nm, 'horyzont': f'{h} mies.', 'n tanio/reszta': f'{na}/{nb}',
                          'różnica (pp)': f'{d0:+.1f} [{lo:+.1f}; {hi:+.1f}]', 'połowy': f'{p1:+.1f} / {p2:+.1f}',
                          'działa': 'tak' if h >= 36 and lo > 0 and p1 > 0 and p2 > 0 else ''})
            print(rowsC[-1], flush=True)

S = SPY.loc[pd.Period('2012-01', 'M'):DO]; S = S / S.iloc[0]
cs, dds, s1, s2, rs = opis(S)
rows = [{'portfel': 'SPY (S&P 500)', 'rocznie': f'{100 * cs:.1f} %', '10 tys. →': f'{10000 * S.iloc[-1]:,.0f}'.replace(',', ' '), 'obsunięcie': f'{100 * dds:.0f} %',
         '2012–18': f'{100 * s1:.1f} %', '2019–26': f'{100 * s2:.1f} %', 'lata lepsze od SPY': '—', 'spółek': '—'}]
zero = np.where(UNI, 0.0, np.nan)
for nm, M in [('Cała pula J (bez warunku ceny)', J)] + [(f'J + {k}', J & v[1] & v[0]) for k, v in SYG.items()] + \
        [('Cała pula J77', J77)] + [(f'J77 + {k}', J77 & v[1] & v[0]) for k, v in SYG.items()]:
    s, liczba, sk = portfel_k(M, zero, None)
    c, dd, h1, h2, ro = opis(s)
    lep = sum(1 for y in ro.index if y in rs.index and ro[y] > rs[y])
    rows.append({'portfel': nm, 'rocznie': f'{100 * c:.1f} %', '10 tys. →': f'{10000 * s.iloc[-1]:,.0f}'.replace(',', ' '), 'obsunięcie': f'{100 * dd:.0f} %',
                 '2012–18': f'{100 * h1:.1f} %', '2019–26': f'{100 * h2:.1f} %', 'lata lepsze od SPY': f'{lep} z {len(ro)}', 'spółek': f'{np.mean(liczba):.0f}'})
    print(rows[-1], flush=True)
out = ['# Etap 115: kupno „tanio” wśród dobrych spółek — DCF vs PEG vs P/E na tle własnych 5 lat', '',
       'Top 500 USA PIT bez wykluczonych sektorów, starty w styczniu 2012–2023. W puli jakości: „tanio” vs reszta puli, nadwyżka nad medianą zbioru, bootstrap po latach.', '',
       pd.DataFrame(rowsC).to_markdown(index=False), '', '## Portfele (wszystkie spółki spełniające warunek, równe wagi, przegląd w styczniu, koszt 0,1 %, 2012-01 → 2026-09)', '',
       pd.DataFrame(rows).to_markdown(index=False)]
open(os.path.join(HERE, 'wyniki', 'r140_etap115.md'), 'w').write('\n'.join(out) + '\n'); print('\n'.join(out))
