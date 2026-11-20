"""Etap 67: strategia 'Lower Risk (Hello Stocks)': 7 kryteriów, kupno 7/7, trzymanie 6/7, sprzedaż <= 5/7."""
import os, sys, numpy as np, pandas as pd
HERE = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(HERE, 'r66_low_risk.py')).read()
exec(src[:src.index("KOSZT = 0.001")])          # Cv, PE_, G1, ROE, DE, G5, FCF, RV1, RV5, SEKT, f, ms, im_, ser, etf
spy = etf['SPY']
PEG_EPS = np.where((PE_ > 0) & (G5 > 0), PE_ / (100 * G5), np.nan)
g5r = np.where(RV5 > -1, (1 + RV5) ** 0.2 - 1, np.nan)
PEG_REV = np.where((PE_ > 0) & (g5r > 0), PE_ / (100 * g5r), np.nan)
KONIEC = pd.Period('2026-09', 'M')   # ostatni miesiąc z fundamentami (RV liczone do 2026-09)
tick = np.array([s.split('.US')[0] for s in ser])


def wynik(PEG):
    K = [f(RV5 > 0.5), f(RV1 > 0.05), f(G1 > 0.05), f(ROE > 0.15), f(DE >= 0) & f(DE < 1), f(FCF > 0), f(PEG > 0) & f(PEG < 1)]
    return sum(k.astype(int) for k in K) * SEKT[None, :] + (~SEKT[None, :]) * -9     # wykluczony sektor: nigdy


def bez_limitu(SC, S, E):
    """Kupno 1 jednostki przy 7/7, sprzedaż przy <= 5/7; zwraca zysk %, IRR, to samo dla SPY, liczbę zakupów, otwartych."""
    poz = {}; wplywy = 0.0; wlozono = 0.0; flows = []; spy_poz = {}; spy_wpl = 0.0; n_k = 0
    mies = [m for m in ms if S <= m <= E]
    for m in mies:
        i = im_[m]
        for j in list(poz):
            if (SC[i, j] <= 5 or not np.isfinite(Cv[i, j])) and m != mies[0]:
                c = Cv[i, j] if np.isfinite(Cv[i, j]) else poz[j][1]
                v = poz.pop(j)[0] * c; wplywy += v; flows.append((m, v))
                spy_wpl += spy_poz.pop(j) * spy[m]
        if m == E: break
        for j in np.flatnonzero((SC[i] == 7) & np.isfinite(Cv[i])):
            if j in poz: continue
            poz[j] = [1 / Cv[i, j], Cv[i, j]]; wlozono += 1; flows.append((m, -1.0)); n_k += 1
            spy_poz[j] = 1 / spy[m]
        for j in poz:                       # ostatnia znana cena (na wypadek końca notowań)
            if np.isfinite(Cv[i, j]): poz[j][1] = Cv[i, j]
    i = im_[E]
    otwarte = sum(u * (Cv[i, j] if np.isfinite(Cv[i, j]) else last) for j, (u, last) in poz.items())
    spy_otw = sum(spy_poz.values()) * spy[E]
    flows.append((E, otwarte))
    def irr(fl):
        t = np.array([(m - S).n / 12 for m, _ in fl]); v = np.array([x for _, x in fl])
        lo, hi = -0.99, 10.0
        for _ in range(200):
            r = (lo + hi) / 2; npv = (v / (1 + r) ** t).sum()
            lo, hi = (r, hi) if npv > 0 else (lo, r)
        return r
    # przepływy SPY: wpłaty te same, wypłaty przy tych samych sprzedażach
    return dict(zakupow=n_k, otwartych=len(poz), zysk=(wplywy + otwarte) / wlozono - 1 if wlozono else np.nan,
                zysk_SPY_te_same_wplaty=(spy_wpl + spy_otw) / wlozono - 1 if wlozono else np.nan, IRR=irr(flows) if wlozono else np.nan,
                top=', '.join(f'{tick[j]} {u * Cv[i, j] - 1:+.0%}' for j, (u, _) in sorted(poz.items(), key=lambda x: -x[1][0] * np.nan_to_num(Cv[i, x[0]]))[:5]))


def limit(SC, PEG, N, S, E):
    poz, sp, eq = {}, 1.0, []
    mies = [m for m in ms if S <= m <= E]
    for a, m in enumerate(mies[:-1]):
        i = im_[m]; i1 = im_[mies[a + 1]]
        for j in list(poz):
            if SC[i, j] <= 5: sp += poz.pop(j) * 0.999
        e = sp + sum(poz.values())
        kand = np.flatnonzero((SC[i] == 7) & np.isfinite(Cv[i]) & np.isfinite(Cv[i1])); kand = kand[np.argsort(np.nan_to_num(PEG[i, kand], nan=9))]
        for j in kand:
            if len(poz) >= N: break
            if j in poz: continue
            kw = min(e / N, sp)
            if kw < 1e-9: break
            poz[j] = kw * 0.999; sp -= kw
        for j in list(poz):
            if np.isfinite(Cv[i1, j]) and np.isfinite(Cv[i, j]): poz[j] *= Cv[i1, j] / Cv[i, j]
            else: sp += poz.pop(j) * 0.999
        sp *= spy[mies[a + 1]] / spy[m]
        eq.append((mies[a + 1], sp + sum(poz.values()), len(poz)))
    e = pd.Series({m: v for m, v, _ in eq}); s = spy[mies[1]:mies[-1]] / spy[mies[0]]; e = e.reindex(s.index); lat = len(e) / 12
    return dict(zysk=e.iloc[-1] - 1, SPY=s.iloc[-1] - 1, CAGR=e.iloc[-1] ** (1 / lat) - 1, SPY_CAGR=s.iloc[-1] ** (1 / lat) - 1,
                maxDD=(e / e.cummax() - 1).min(), sr_spolek=np.mean([n for _, _, n in eq]))


out = ['# Etap 67: strategia Lower Risk (Hello Stocks): kupno 7/7, trzymanie 6/7, sprzedaż <= 5/7', '',
       os.environ.get('OPIS', 'Wszechświat: S&P 500 PIT (ze spółkami usuniętymi)') + ', bez 5 sektorów. PEG autora jest z prognozy 5-letniej — tu przybliżenia historyczne.', '']
for nazwa, PEG in (('PEG = P/E / historyczny wzrost EPS 5 lat', PEG_EPS), ('PEG = P/E / wzrost przychodów 5 lat', PEG_REV)):
    SC = wynik(PEG)
    lic = pd.Series({m: int((SC[im_[m]] == 7).sum()) for m in ms if pd.Period('2015-01', 'M') <= m <= KONIEC})
    lic6 = pd.Series({m: int((SC[im_[m]] >= 6).sum()) for m in ms if pd.Period('2015-01', 'M') <= m <= KONIEC})
    rows = []
    for y in range(2015, 2026):
        S = pd.Period(f'{y}-01', 'M')
        r = bez_limitu(SC, S, min(S + 21, KONIEC)); rows.append(dict(start=str(S), koniec=str(min(S + 21, KONIEC)), **r))
        if y < 2025:
            r = bez_limitu(SC, S, KONIEC); rows.append(dict(start=str(S), koniec=str(KONIEC), **r))
        print(nazwa[:20], y, round(rows[-1]['zysk'], 3), flush=True)
    T = pd.DataFrame(rows)
    L = []
    for N in (15, 20, 30):
        L.append(dict(N=N, okres='2015-01..2026-09', **limit(SC, PEG, N, pd.Period('2015-01', 'M'), KONIEC)))
        L.append(dict(N=N, okres='2025-01..2026-09', **limit(SC, PEG, N, pd.Period('2025-01', 'M'), KONIEC)))
    i = im_[KONIEC]; ok = np.flatnonzero(SC[i] >= 6)
    teraz = pd.DataFrame(dict(spolka=tick[ok], wynik=SC[i, ok], PEG=PEG[i, ok])).sort_values(['wynik', 'PEG'], ascending=[False, True])
    out += [f'## {nazwa}', '', f'Spółek 7/7 w miesiącu: mediana {lic.median():.0f} ({lic.min()}-{lic.max()}); >= 6/7: mediana {lic6.median():.0f}. '
            f'W {KONIEC}: 7/7 {int((SC[i] == 7).sum())}, 6/7 {int((SC[i] == 6).sum())}.', '',
            '### (1) Nielimitowany kapitał (1 jednostka na zakup); zysk = łączny zwrot z zainwestowanych jednostek; SPY = te same wpłaty i wypłaty', '',
            T.round(3).to_markdown(index=False), '', '### (2) Portfel N miejsc, wolna gotówka w SPY', '', pd.DataFrame(L).round(3).to_markdown(index=False), '',
            f'### Spółki >= 6/7 w {KONIEC}', '', teraz.round(2).to_markdown(index=False), '']
open(os.path.join(HERE, 'wyniki', os.environ.get('WYNIK', 'r90_hello_stocks.md')), 'w').write('\n'.join(out)); print('\n'.join(out))
