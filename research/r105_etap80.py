"""Etap 80: portfel — najwyższa ocena ogólna przy uczciwej wycenie (PEG), reguły sprzedaży. Protokół: etap 80."""
import os
HERE = os.path.dirname(os.path.abspath(__file__))
_s = open(os.path.join(HERE, 'r104_etap79.py')).read()
exec(_s[:_s.index('# --- cel: nadwyżka nad średnią ---')])
exec(open(os.path.join(HERE, 'r19_cem10.py')).read().split('warianty = {')[0]); spy, qqq = etf['SPY'], etf['QQQ']
GRUPY = {'wzrost': [('rev_1y', 1), ('rev_cagr3', 1), ('rev_cagr5', 1), ('ni_1y', 1), ('ni_5y', 1), ('rev_lata_10', 1), ('C1_lata_zysk', 1)],
         'sila': [('gm', 1), ('om', 1), ('nm', 1), ('roe', 1), ('roa', 1), ('roce', 1), ('fcf_margin', 1), ('de', -1), ('qr', 1), ('net_cash_mc', 1), ('C3_akcje_3l', 1),
                  ('capex_przych', -1), ('kapital_3l', -1)],
         'wycena': [('pe', -1), ('peg', -1), ('ps', -1), ('pfcf', -1), ('fcf_yield', 1)]}
DOD = {'pe', 'peg', 'ps', 'pfcf'}
lag = lambda A_, k: np.vstack([np.full((k, NS), np.nan), A_[:-k]])
STARE = np.isfinite(lag(Cv, 60)) & (lag(Cv, 60) > 0)
ZB = UNI & STARE
PCT = {}
for gr, pola in GRUPY.items():
    for p, kier in pola:
        P = np.full((NT, NS), np.nan)
        for m in MI:
            i = im_[m]; v = X[p][i].copy(); ok = ZB[i] & np.isfinite(v)
            if p in DOD: ok &= v > 0
            if p == 'de': ok &= v >= 0
            if ok.sum() < 20: continue
            r = pd.Series(v[ok]).rank(method='average').to_numpy(); P[i, np.flatnonzero(ok)] = (r - 0.5) / ok.sum() if kier > 0 else 1 - (r - 0.5) / ok.sum()
        PCT[p] = P
O = {}
for gr, pola in GRUPY.items():
    A = np.stack([PCT[p] for p, _ in pola]); n_ = np.isfinite(A).sum(0)
    O[gr] = np.where(n_ >= 2, 10 * (np.nansum(A, 0) + 0.5 * (len(pola) - n_)) / len(pola), np.nan)
T_ = np.zeros((NT, NS)); W_ = np.zeros((NT, NS))
for a, wg in ((O['wzrost'], 0.4), (O['sila'], 0.35), (O['wycena'], 0.25)):
    f = np.isfinite(a); T_ += np.where(f, a * wg, 0); W_ += np.where(f, wg, 0)
OG = np.where(np.isfinite(O['wzrost']) & (np.isfinite(O['sila']) | np.isfinite(O['wycena'])) & (W_ > 0) & ZB, T_ / np.where(W_ > 0, W_, 1), np.nan)
PCTL = np.full((NT, NS), np.nan)   # miejsce w rankingu oceny (0..1, 1 = najlepsza)
for m in MI:
    i = im_[m]; ok = np.isfinite(OG[i])
    if ok.sum() > 50: PCTL[i, ok] = pd.Series(OG[i, ok]).rank(pct=True).to_numpy()
PEG = X['peg']; R1, N1 = X['rev_1y'], X['ni_1y']
SPADEK = ((np.nan_to_num(R1, nan=1) < 0) & (np.nan_to_num(lag(R1, 12), nan=1) < 0)) | ((np.nan_to_num(N1, nan=1) < 0) & (np.nan_to_num(lag(N1, 12), nan=1) < 0))
DROGO = (np.nan_to_num(PEG, nan=0) > 3) | (np.nan_to_num(X['ni_1y'], nan=0) == 0) & False | (np.nan_to_num(X['pe'], nan=-1) < 0)
DROGO = (np.nan_to_num(PEG, nan=0) > 3)
mies = [m for m in MI if pd.Period('2013-01', 'M') <= m <= pd.Period('2026-09', 'M')]


def kupno(top=0.90, peg_max=2.0):
    pg = np.nan_to_num(PEG, nan=-1)
    warunek_peg = np.ones((NT, NS), bool) if peg_max is None else (pg > 0) & (pg < peg_max)
    return (np.nan_to_num(PCTL, nan=0) >= top) & warunek_peg


def portfel(K, sprzedaz, N=20, bez=(), od=None, do=None):
    poz, sp, eq, czasy, kupione = {}, 1.0, [], [], {}
    wyl = np.isin(kod, list(bez)); mm = [m for m in mies if (od is None or m >= od) and (do is None or m <= do)]
    for a, m in enumerate(mm[:-1]):
        i, i1 = im_[m], im_[mm[a + 1]]
        for j in list(poz):
            sprzedaj = False
            if sprzedaz == 'S1': sprzedaj = np.nan_to_num(PCTL[i, j], nan=0) < 0.70
            elif sprzedaz == 'S2': sprzedaj = SPADEK[i, j]
            elif sprzedaz == 'S3': sprzedaj = DROGO[i, j]
            elif sprzedaz == 'S4': sprzedaj = SPADEK[i, j] or DROGO[i, j]
            elif sprzedaz == 'S5': sprzedaj = m.month == 1 and not K[i, j]
            if sprzedaj:
                sp += poz.pop(j) * 0.999; czasy.append(a - kupione.pop(j))
        e = sp + sum(poz.values())
        wolne = N - len(poz)
        if wolne > 0:
            k_ = np.flatnonzero(K[i] & ~wyl & np.isfinite(Cv[i1]))
            for j in k_[np.argsort(-OG[i, k_])]:
                if wolne <= 0: break
                if j in poz: continue
                kw = min(e / N, sp)
                if kw < 0.2 * e / N: break
                poz[j] = kw * 0.999; sp -= kw; kupione[j] = a; wolne -= 1
        for j in list(poz):
            if np.isfinite(Cv[i1, j]) and np.isfinite(Cv[i, j]) and Cv[i, j] > 0: poz[j] *= Cv[i1, j] / Cv[i, j]
            else: sp += poz.pop(j) * 0.999; czasy.append(a - kupione.pop(j))
        sp *= spy[mm[a + 1]] / spy[m]
        tot = sp + sum(poz.values()); eq.append((tot, len(poz), 1 - sp / tot))
    e = pd.Series([x[0] for x in eq]); lat = len(e) / 12
    czasy += [len(mm) - 1 - v for v in kupione.values()]
    naj = sorted(poz.items(), key=lambda x: -x[1])[:3]
    return dict(CAGR=e.iloc[-1] ** (1 / lat) - 1, maxDD=(e / e.cummax() - 1).min(), sr_spolek=np.mean([x[1] for x in eq]), w_spolkach=np.mean([x[2] for x in eq]),
                trzymanie_mies=np.median(czasy) if czasy else np.nan, transakcji_kupna=len(czasy), najwieksze_teraz=', '.join(f'{kod[j]} {v / e.iloc[-1]:.0%}' for j, v in naj))


def bench(s, od=None, do=None):
    mm = [m for m in mies if (od is None or m >= od) and (do is None or m <= do)]
    x = s[mm[0]:mm[-1]]; e = (x / x.iloc[0]).iloc[1:]; return dict(CAGR=e.iloc[-1] ** (12 / len(e)) - 1, maxDD=(e / e.cummax() - 1).min())


def rowne(od=None, do=None):
    mm = [m for m in mies if (od is None or m >= od) and (do is None or m <= do)]; v = 1.0; e = []
    for a, m in enumerate(mm[:-1]):
        i, i1 = im_[m], im_[mm[a + 1]]; ok = ZB[i] & np.isfinite(Cv[i]) & np.isfinite(Cv[i1]) & (Cv[i] > 0)
        v *= 1 + np.mean(Cv[i1, ok] / Cv[i, ok] - 1); e.append(v)
    e = pd.Series(e); return dict(CAGR=e.iloc[-1] ** (12 / len(e)) - 1, maxDD=(e / e.cummax() - 1).min())


out = ['# Etap 80: portfel — najwyższa ocena przy uczciwej wycenie, reguły sprzedaży (2013-01..2026-09)', '',
       'Kupno: ocena ogólna w top 10 % zbioru (spółki ≥ 5 lat na giełdzie) i PEG (historyczny) 0–2; N = 20 pozycji po 1/N konta; wolna gotówka w SPY; koszt 0,1 %.', '']
SN = {'S0': 'S0 nigdy (trzymaj)', 'S1': 'S1 ocena spada poza top 30 %', 'S2': 'S2 fundamenty słabną 2 lata z rzędu', 'S3': 'S3 PEG > 3',
      'S4': 'S4 = S2 lub S3', 'S5': 'S5 co rok: sprzedaj, gdy nie spełnia warunku kupna'}
rows = [dict(wariant='SPY', **bench(spy)), dict(wariant='QQQ', **bench(qqq)), dict(wariant='równe wagi całego zbioru', **rowne())]
K0 = kupno()
for s_ in SN: rows.append(dict(wariant=f'top 10 % + PEG 0–2, N 20, {SN[s_]}', **portfel(K0, s_))); print(s_, flush=True)
out += ['## Reguły sprzedaży (kupno: top 10 % + PEG 0–2, N = 20)', '', pd.DataFrame(rows).round(3).to_markdown(index=False), '']
rows = []
for nm, K_, N_ in (('top 10 % + PEG 0–1', kupno(0.9, 1.0), 20), ('top 10 % bez progu PEG', kupno(0.9, None), 20), ('top 20 % + PEG 0–2', kupno(0.8, 2.0), 20),
                   ('top 10 % + PEG 0–2, N 10', K0, 10), ('top 10 % + PEG 0–2, N 30', K0, 30)):
    for s_ in ('S0', 'S2', 'S4'): rows.append(dict(wariant=f'{nm}, {SN[s_]}', **portfel(K_, s_, N_)))
for s_ in ('S0', 'S2'): rows.append(dict(wariant=f'top 10 % + PEG 0–2, {SN[s_]}, BEZ NVDA', **portfel(K0, s_, bez=('NVDA',))))
out += ['## Warianty kupna, liczby spółek i kontrola bez NVDA', '', pd.DataFrame(rows).round(3).to_markdown(index=False), '']
rows = []
for od, do, nm in ((pd.Period('2013-01', 'M'), pd.Period('2019-12', 'M'), '2013–2019'), (pd.Period('2020-01', 'M'), pd.Period('2026-09', 'M'), '2020–2026')):
    rows += [dict(okres=nm, wariant='SPY', **bench(spy, od, do)), dict(okres=nm, wariant='QQQ', **bench(qqq, od, do)), dict(okres=nm, wariant='równe wagi', **rowne(od, do))]
    for s_ in ('S0', 'S2', 'S3', 'S4', 'S1'): rows.append(dict(okres=nm, wariant=SN[s_], **portfel(K0, s_, od=od, do=do)))
out += ['## Połowy (portfel startuje od zera na początku okresu)', '', pd.DataFrame(rows).round(3).to_markdown(index=False), '']
i = im_[mies[-1]]; dz = np.flatnonzero(K0[i])
out += [f'Spełniające warunek kupna w {mies[-1]}: ' + ', '.join(f'{kod[j]} (ocena {OG[i, j]:.1f}, PEG {PEG[i, j]:.2f})' for j in dz[np.argsort(-OG[i, dz])]), '']
open(os.path.join(HERE, 'wyniki', 'r105_etap80.md'), 'w').write('\n'.join(out)); print('\n'.join(out))
