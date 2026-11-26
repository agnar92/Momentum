"""Etap 116: reguła budowania pozycji użytkownika — start od razu przy bardzo dobrych fundamentach, dokup przy PEG 0–2. Protokół: etap 116."""
import os
HERE = os.path.dirname(os.path.abspath(__file__))
_s113 = open(os.path.join(HERE, 'r138_etap113.py')).read()
exec(_s113[:_s113.index("POT = np.full")])
_s95 = open(os.path.join(HERE, 'r120_etap95.py')).read()
nz = lambda A_, v: np.nan_to_num(A_, nan=v)
exec(_s95[_s95.index("kryt = lambda"):_s95.index("PKT = {")])
KOSZT = 0.999
# bardzo dobre fundamenty, przegląd w styczniu -> obowiązuje do następnego stycznia
BDj = (J7 == 7) | (nz(SILA, 0) >= 7)
BD = np.zeros((NT, NS), bool); SIL = np.full((NT, NS), np.nan)
for y in range(2012, 2027):
    i0 = im_[pd.Period(f'{y}-01', 'M')]
    i1 = im_[pd.Period(f'{y + 1}-01', 'M')] if pd.Period(f'{y + 1}-01', 'M') in im_ else NT
    BD[i0:i1] = BDj[i0] & UNI[i0]; SIL[i0:i1] = SILA[i0]
PEGm = X['peg']
print('BD w styczniu:', {y: int(BD[im_[pd.Period(f'{y}-01', 'M')]].sum()) for y in range(2013, 2027)}, flush=True)
print('PEG dostępny wśród BD (styczeń):', {y: int((BD[im_[pd.Period(f'{y}-01', 'M')]] & np.isfinite(PEGm[im_[pd.Period(f'{y}-01', 'M')]])).sum()) for y in range(2013, 2027)}, flush=True)
MM_ = [m for m in MI if pd.Period('2013-01', 'M') <= m <= DO]


def irr(n, koniec):
    lo, hi = -0.99, 1.0
    for _ in range(100):
        r = (lo + hi) / 2
        fv = sum((1 + r) ** ((n - k) / 12) for k in range(n))
        lo, hi = (r, hi) if fv < koniec else (lo, r)
    return r


def pegok(i, j):
    p = PEGm[i, j]
    return np.isfinite(p) and 0 < p < 2


def symuluj(war, od, do, gotowka_spy):
    mm = [m for m in MM_ if pd.Period(od, 'M') <= m <= pd.Period(do, 'M')]
    poz, ost, got, wpl, twr, udz = {}, {}, 0.0, 0, [1.0], []
    for a, m in enumerate(mm[:-1]):
        i, i1 = im_[m], im_[mm[a + 1]]
        got += 1.0; wpl += 1
        if war == 'E':
            poz['SPY'] = poz.get('SPY', 0) + got * KOSZT; got = 0.0
        else:
            V = sum(poz.values()) + got; cel = 0.10 * V
            # nowe spółki na wolne miejsca
            wolne = 10 - len(poz)
            if wolne > 0:
                kand = [j for j in np.flatnonzero(BD[i] & np.isfinite(Cv[i]) & (Cv[i] > 0)) if j not in poz]
                if war == 'B':
                    kand = [j for j in kand if pegok(i, j)]
                kand.sort(key=lambda j: -nz(SIL[i, j], 0))
                for j in kand[:wolne]:
                    if war == 'D':
                        poz[j] = 0.0; ost[j] = (Cv[i, j], None); continue
                    kw = min(0.20 * cel, got)
                    if kw <= 0: break
                    poz[j] = kw * KOSZT; got -= kw; ost[j] = (Cv[i, j], m)
            if war == 'D':
                odb = [j for j in poz if BD[i, j] and poz[j] < cel and np.isfinite(Cv[i, j])]
                if odb and got > 0:
                    kw = got / len(odb)
                    for j in odb: poz[j] += kw * KOSZT
                    got = 0.0
            else:
                odb = []
                for j in poz:
                    c0, mz = ost[j]
                    if mz == m or poz[j] >= cel or not BD[i, j] or not np.isfinite(Cv[i, j]): continue
                    if abs(Cv[i, j] / c0 - 1) < 0.07: continue
                    if war in ('A', 'B') and not pegok(i, j): continue
                    odb.append(j)
                odb.sort(key=lambda j: PEGm[i, j] if np.isfinite(PEGm[i, j]) else 9)
                for j in odb:
                    kw = min(0.10 * cel, cel - poz[j], got)
                    if kw <= 0: break
                    poz[j] += kw * KOSZT; got -= kw; ost[j] = (Cv[i, j], m)
        przed = sum(poz.values()) + got
        udz.append(got / przed if przed > 0 else 0)
        for j in list(poz):
            if j == 'SPY':
                poz[j] *= SPY[mm[a + 1]] / SPY[m]
            elif np.isfinite(Cv[i1, j]) and Cv[i, j] > 0:
                poz[j] *= Cv[i1, j] / Cv[i, j]
            else:
                got += poz.pop(j) * KOSZT; ost.pop(j, None)
        if gotowka_spy and got:
            got *= SPY[mm[a + 1]] / SPY[m]
        po = sum(poz.values()) + got
        twr.append(twr[-1] * (po / przed if przed > 0 else 1))
    V = sum(poz.values()) + got
    t = pd.Series(twr); dd = (t / t.cummax() - 1).min()
    return {'stopa roczna (IRR)': f'{100 * irr(wpl, V):.1f} %', 'wartość ÷ wpłaty': f'{V / wpl:.2f}', 'obsunięcie': f'{100 * dd:.0f} %',
            'średnio gotówki': f'{100 * np.mean(udz):.0f} %', '_irr': irr(wpl, V)}


NAZ = {'A': 'A nowa reguła: start od razu (BD), dokup PEG 0–2 ±7 %', 'B': 'B stara: także start tylko przy PEG 0–2', 'C': 'C bez PEG: start od razu, dokup ±7 %',
       'D': 'D uśrednianie: cała wpłata równo do spółek BD', 'E': 'E wpłaty do SPY'}
out = ['# Etap 116: reguła budowania pozycji użytkownika', '', 'Wpłata 1 co miesiąc, najwyżej 10 spółek (cel 10 % konta), pierwszy zakup 20 % celu, dokup 10 % celu; '
       'bardzo dobre fundamenty = Jakość 7/7 albo Siła ≥ 7 (przegląd w styczniu); bez sprzedaży; koszt 0,1 %.', '']
WYN = {}
for gs in (False, True):
    for od, do in (('2013-01', '2026-09'), ('2013-01', '2019-12'), ('2019-01', '2026-09')):
        rows = []
        for k, nm in NAZ.items():
            r = symuluj(k, od, do, gs); WYN[(gs, od, do, k)] = r['_irr']
            rows.append({'sposób': nm, **{a: b for a, b in r.items() if not a.startswith('_')}})
            print(gs, od, do, rows[-1], flush=True)
        out += [f'## {od} → {do}, gotówka czekająca {"w SPY" if gs else "0 %"}', '', pd.DataFrame(rows).to_markdown(index=False), '']
wn = []
for gs in (False, True):
    p = [(od, do) for od, do in (('2013-01', '2019-12'), ('2019-01', '2026-09'))]
    a_b = all(WYN[(gs, *x, 'A')] >= WYN[(gs, *x, 'B')] for x in p); a_c = all(WYN[(gs, *x, 'A')] >= WYN[(gs, *x, 'C')] for x in p)
    wn.append(f'- gotówka {"w SPY" if gs else "0 %"}: A ≥ B w obu podokresach: {"tak" if a_b else "nie"}; A ≥ C (PEG przy dokupie pomaga): {"tak" if a_c else "nie"}')
out += ['## Reguła z protokołu', ''] + wn
open(os.path.join(HERE, 'wyniki', 'r141_etap116.md'), 'w').write('\n'.join(out) + '\n'); print('\n'.join(out))
