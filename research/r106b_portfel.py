"""Etap 81b (opis wyników etapu 81, bez nowej hipotezy): lista transakcji i obecny portfel wariantu P1 bez dokupowania; zwroty w % i w USD od 10 000 USD."""
import os
HERE = os.path.dirname(os.path.abspath(__file__))
_s = open(os.path.join(HERE, 'r106_etap81.py')).read()
exec(_s[:_s.index("PN = {")])
NAZ = {}
try:
    import json as _j
    NAZ = {k: v for k, v in (_j.load(open('/home/user/Momentum/docs/data/lista.json'))and {}).items()}
except Exception:
    pass
START = 10000.0


def z_logiem(PSUJE):
    poz, sp, eq, tr = {}, START, [], []      # poz[j] = [wartość, data kupna, wpłacone, cena kupna]
    mm = mies
    for a, m in enumerate(mm[:-1]):
        i, i1 = im_[m], im_[mm[a + 1]]
        for j in list(poz):
            if PSUJE[i, j]:
                w, d0, wp, c0 = poz.pop(j); sp += w * 0.999
                tr.append(dict(spolka=kod[j], kupno=str(d0), sprzedaz=str(m), powod='fundamenty słabną 2 lata', mies=(m - d0).n, zwrot=Cv[i, j] / c0 - 1, wplacone=wp, wynik_usd=w * 0.999 - wp))
        e = sp + sum(v[0] for v in poz.values())
        k_ = np.flatnonzero(WEJ[i] & np.isfinite(Cv[i1]) & ~PSUJE[i]); n = 0
        for j in k_[np.argsort(-OG[i, k_])]:
            if n >= 4: break
            if j in poz: continue
            kw = min(0.04 * e, sp)
            if kw < 0.01 * e: break
            poz[j] = [kw * 0.999, m, kw, Cv[i, j]]; sp -= kw; n += 1
        for j in list(poz):
            if np.isfinite(Cv[i1, j]) and np.isfinite(Cv[i, j]) and Cv[i, j] > 0: poz[j][0] *= Cv[i1, j] / Cv[i, j]
            else:
                w, d0, wp, c0 = poz.pop(j); sp += w * 0.999
                tr.append(dict(spolka=kod[j], kupno=str(d0), sprzedaz=str(m), powod='wycofana z obrotu / przejęta', mies=(m - d0).n, zwrot=Cv[i, j] / c0 - 1 if Cv[i, j] > 0 else np.nan, wplacone=wp, wynik_usd=w * 0.999 - wp))
        sp *= spy[mm[a + 1]] / spy[m]
        eq.append((mm[a + 1], sp + sum(v[0] for v in poz.values()), sp))
    i = im_[mm[-1]]
    teraz = [dict(spolka=kod[j], kupno=str(d0), mies=(mm[-1] - d0).n, zwrot=Cv[i, j] / c0 - 1, wplacone=wp, wartosc=w, wynik_usd=w - wp) for j, (w, d0, wp, c0) in poz.items()]
    return tr, teraz, eq


tr, teraz, eq = z_logiem(P1)
E = pd.DataFrame(eq, columns=['m', 'konto', 'w_spy'])
s0 = spy[mies[0]]; E['spy_10k'] = [START * spy[m] / s0 for m in E.m]; q0 = qqq[mies[0]]; E['qqq_10k'] = [START * qqq[m] / q0 for m in E.m]
T = pd.DataFrame(tr); N = pd.DataFrame(teraz).sort_values('wartosc', ascending=False)
f = lambda x: f'{100 * x:+.0f} %'
u = lambda x: f'{x:,.0f} USD'.replace(',', ' ')
out = ['# Portfel strategii: kup najlepiej ocenione przy PEG 0–2, trzymaj, sprzedaj, gdy przychody lub zysk spadają 2 lata z rzędu (start 10 000 USD, 2013-01)', '']
rok = E[E.m.map(lambda m: m.month == 12) | (E.m == E.m.iloc[-1])]
out += ['## Wartość konta', '', pd.DataFrame({'koniec': rok.m.astype(str), 'strategia': rok.konto.map(u), 'SPY': rok.spy_10k.map(u), 'QQQ': rok.qqq_10k.map(u),
        'w tym gotówka w SPY': (rok.w_spy / rok.konto).map(lambda x: f'{100 * x:.0f} %')}).to_markdown(index=False), '']
out += [f'## Obecny portfel ({mies[-1]}): {len(N)} spółek, {u(N.wartosc.sum())} w akcjach + {u(E.w_spy.iloc[-1])} w SPY', '',
        pd.DataFrame({'spółka': N.spolka, 'kupiona': N.kupno, 'trzymana (mies.)': N.mies, 'zwrot ceny': N.zwrot.map(f), 'włożone': N.wplacone.map(u), 'warta dziś': N.wartosc.map(u),
                      'zysk': N.wynik_usd.map(u)}).to_markdown(index=False), '']
T = T.sort_values('sprzedaz')
out += [f'## Sprzedane spółki ({len(T)}): zyskowne {int((T.zwrot > 0).sum())}, stratne {int((T.zwrot <= 0).sum())}; mediana zwrotu {f(T.zwrot.median())}, średnio {f(T.zwrot.mean())}', '',
        pd.DataFrame({'spółka': T.spolka, 'kupiona': T.kupno, 'sprzedana': T.sprzedaz, 'mies.': T.mies, 'zwrot ceny': T.zwrot.map(f), 'zysk / strata': T.wynik_usd.map(u),
                      'powód': T.powod}).to_markdown(index=False), '']
W = pd.concat([T[['spolka', 'wynik_usd']], N[['spolka', 'wynik_usd']]]).groupby('spolka').wynik_usd.sum().sort_values(ascending=False)
out += ['## Kto zarobił najwięcej (zysk w USD, sprzedane + obecne)', '', pd.DataFrame({'spółka': W.index[:10], 'zysk': W.values[:10]}).assign(zysk=lambda d: d.zysk.map(u)).to_markdown(index=False), '',
        'Najwięcej straciły:', '', pd.DataFrame({'spółka': W.index[-8:], 'wynik': W.values[-8:]}).assign(wynik=lambda d: d.wynik.map(u)).to_markdown(index=False), '']
open(os.path.join(HERE, 'wyniki', 'r106b_portfel.md'), 'w').write('\n'.join(out)); print('\n'.join(out))
