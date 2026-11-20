"""Etap 81: trzymaj dobre firmy, dokupuj przy korzystnym PEG, sprzedaj, gdy fundamenty się psują. Protokół: etap 81."""
import os
HERE = os.path.dirname(os.path.abspath(__file__))
_s = open(os.path.join(HERE, 'r105_etap80.py')).read()
exec(_s[:_s.index("out = ['# Etap 80")])
SILA = O['sila']; SILA12 = lag(SILA, 12)
R1z, N1z = np.nan_to_num(R1, nan=1), np.nan_to_num(N1, nan=1)
P1 = SPADEK
P2 = P1 | (np.nan_to_num(PCTL, nan=1) < 0.5)
ile = (R1z < 0).astype(int) + (N1z < 0) + (np.nan_to_num(SILA12 - SILA, nan=0) >= 2)
P3 = P1 | (ile >= 2)
WEJ = kupno(0.90, 2.0)


def strategia(PSUJE, dokup=True, peg_dokup=1.0, limit=0.15, bez=(), od=None, do=None):
    poz, sp, eq = {}, 1.0, []
    wyl = np.isin(kod, list(bez)); mm = [m for m in mies if (od is None or m >= od) and (do is None or m <= do)]
    for a, m in enumerate(mm[:-1]):
        i, i1 = im_[m], im_[mm[a + 1]]
        for j in list(poz):
            if PSUJE[i, j]: sp += poz.pop(j) * 0.999
        e = sp + sum(poz.values())
        if dokup:
            pg = PEG[i]
            for j in sorted(poz, key=lambda j: -np.nan_to_num(OG[i, j], nan=0)):
                if np.isfinite(pg[j]) and 0 < pg[j] < peg_dokup and np.isfinite(Cv[i1, j]):
                    kw = min(0.02 * e, limit * e - poz[j], sp)
                    if kw > 0.002 * e: poz[j] += kw * 0.999; sp -= kw
        k_ = np.flatnonzero(WEJ[i] & ~wyl & np.isfinite(Cv[i1]) & ~PSUJE[i]); n = 0
        for j in k_[np.argsort(-OG[i, k_])]:
            if n >= 4: break
            if j in poz: continue
            kw = min(0.04 * e, sp)
            if kw < 0.01 * e: break
            poz[j] = kw * 0.999; sp -= kw; n += 1
        for j in list(poz):
            if np.isfinite(Cv[i1, j]) and np.isfinite(Cv[i, j]) and Cv[i, j] > 0: poz[j] *= Cv[i1, j] / Cv[i, j]
            else: sp += poz.pop(j) * 0.999
        sp *= spy[mm[a + 1]] / spy[m]
        tot = sp + sum(poz.values()); eq.append((tot, len(poz), 1 - sp / tot))
    e = pd.Series([x[0] for x in eq]); lat = len(e) / 12
    naj = sorted(poz.items(), key=lambda x: -x[1])[:4]
    return dict(CAGR=e.iloc[-1] ** (1 / lat) - 1, maxDD=(e / e.cummax() - 1).min(), sr_spolek=np.mean([x[1] for x in eq]), w_spolkach=np.mean([x[2] for x in eq]),
                najwieksze_teraz=', '.join(f'{kod[j]} {v / e.iloc[-1]:.0%}' for j, v in naj))


PN = {'P1': ('P1 fundamenty słabną 2 lata z rzędu', P1), 'P2': ('P2 = P1 lub ocena poniżej mediany', P2), 'P3': ('P3 = P1 lub 2 z 3 (przychody < 0, zysk < 0, siła −2 pkt)', P3)}
out = ['# Etap 81: trzymaj dobre firmy, dokupuj przy korzystnym PEG, sprzedaj, gdy fundamenty się psują (2013-01..2026-09)', '',
       'Wejście: ocena top 10 % + PEG 0–2, transza 4 % konta; dokupowanie: trzymana spółka z PEG 0–1 bez pogorszenia → +2 % konta / mies., limit 15 %; gotówka w SPY.', '']
rows = [dict(wariant='SPY', **bench(spy)), dict(wariant='QQQ', **bench(qqq)), dict(wariant='równe wagi', **rowne())]
for p_, (nm, M) in PN.items():
    rows.append(dict(wariant=f'{nm}, z dokupowaniem', **strategia(M)))
    rows.append(dict(wariant=f'{nm}, bez dokupowania', **strategia(M, dokup=False)))
    print(p_, flush=True)
rows += [dict(wariant='P1, dokupowanie przy PEG 0–1,5', **strategia(P1, peg_dokup=1.5)), dict(wariant='P1, dokupowanie, limit 10 %', **strategia(P1, limit=0.10)),
         dict(wariant='P1, dokupowanie, limit 20 %', **strategia(P1, limit=0.20)), dict(wariant='P1, z dokupowaniem, BEZ NVDA', **strategia(P1, bez=('NVDA',))),
         dict(wariant='P3, z dokupowaniem, BEZ NVDA', **strategia(P3, bez=('NVDA',))), dict(wariant='P1, bez dokupowania, BEZ NVDA', **strategia(P1, dokup=False, bez=('NVDA',)))]
out += ['## Całość', '', pd.DataFrame(rows).round(3).to_markdown(index=False), '']
rows = []
for od, do, nm in ((pd.Period('2013-01', 'M'), pd.Period('2019-12', 'M'), '2013–2019'), (pd.Period('2020-01', 'M'), pd.Period('2026-09', 'M'), '2020–2026')):
    rows += [dict(okres=nm, wariant='SPY', **bench(spy, od, do)), dict(okres=nm, wariant='QQQ', **bench(qqq, od, do))]
    for p_, (nm2, M) in PN.items():
        rows.append(dict(okres=nm, wariant=f'{nm2}, z dokupowaniem', **strategia(M, od=od, do=do)))
    rows.append(dict(okres=nm, wariant='P1, bez dokupowania', **strategia(P1, dokup=False, od=od, do=do)))
out += ['## Połowy (start od zera)', '', pd.DataFrame(rows).round(3).to_markdown(index=False), '']
open(os.path.join(HERE, 'wyniki', 'r106_etap81.md'), 'w').write('\n'.join(out)); print('\n'.join(out))
