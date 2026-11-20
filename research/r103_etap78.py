"""Etap 78: każdy parametr osobno — 5 grup i zwrot w 3 / 5 lat (nadwyżka nad średnią spółek, odsetek pobić). Protokół: etap 78."""
import os
HERE = os.path.dirname(os.path.abspath(__file__))
_s = open(os.path.join(HERE, 'r101_etap76.py')).read()
exec(_s[:_s.index('# --- ocena jak na stronie ---')].replace("if not TEST: np.savez_compressed", "if False: np.savez_compressed"))
R = {}
for h in (36, 60):
    A = np.full((NT, NS), np.nan); A[:-h] = Cv[h:] / Cv[:-h] - 1; R[h] = A
KON = {36: pd.Period('2023-09', 'M'), 60: pd.Period('2021-09', 'M')}
NAZWY = {'rev_1y': 'Przychody 1 rok', 'rev_cagr3': 'Przychody 3 lata (rocznie)', 'rev_cagr5': 'Przychody 5 lat (rocznie)', 'rev_lata_10': 'Lata z przychodami > 10 % (z 5)',
         'ni_1y': 'Zysk netto 1 rok', 'ni_5y': 'Zysk netto 5 lat (łącznie)', 'C1_lata_zysk': 'Lata ze wzrostem zysku (z 5)', 'gm': 'Marża brutto', 'om': 'Marża operacyjna',
         'nm': 'Marża netto', 'roe': 'ROE', 'roa': 'ROA', 'roce': 'ROCE', 'fcf_margin': 'Marża FCF', 'de': 'Dług / kapitał', 'qr': 'Quick ratio',
         'net_cash_mc': 'Gotówka − dług / kapitalizacja', 'C3_akcje_3l': 'Spadek liczby akcji 3 lata (więcej = większy skup)', 'C4_fcf_zysk': 'FCF ÷ zysk netto',
         'pe': 'P/E', 'peg': 'PEG (P/E ÷ wzrost zysku 5 l.)', 'ps': 'P/S', 'pfcf': 'P/FCF', 'fcf_yield': 'Stopa FCF', 'C6_mom12_1': 'Zwrot ceny 12 mies. (momentum)'}
DOD = {'pe', 'peg', 'ps', 'pfcf'}


def grupy(p, h, a_='2012-01', b_=None):
    b_ = min(pd.Period(b_, 'M'), KON[h]) if b_ else KON[h]
    zw = [[] for _ in range(5)]; nad = [[] for _ in range(5)]; gr = [[] for _ in range(5)]
    for m in MI:
        if not (pd.Period(a_, 'M') <= m <= b_): continue
        i = im_[m]; uni = UNI[i] & np.isfinite(R[h][i])
        if uni.sum() < 100: continue
        avg = R[h][i, uni].mean(); v = X[p][i]; ok = uni & np.isfinite(v)
        if p in DOD: ok &= v > 0
        if ok.sum() < 50: continue
        q = pd.qcut(pd.Series(v[ok]).rank(method='first'), 5, labels=False).to_numpy(); r = R[h][i, ok]; vv = v[ok]
        for k in range(5):
            zw[k] += list(r[q == k]); nad[k] += list(r[q == k] - avg); gr[k].append((vv[q == k].min(), vv[q == k].max()))
    return zw, nad, gr


PROC = {'rev_1y', 'rev_cagr3', 'rev_cagr5', 'ni_1y', 'ni_5y', 'gm', 'om', 'nm', 'roe', 'roa', 'roce', 'fcf_margin', 'net_cash_mc', 'C3_akcje_3l', 'fcf_yield', 'C6_mom12_1'}
fmt = lambda p, x: (f'{100 * x:.0f} %' if p in PROC else f'{x:.2f}'.replace('.', ','))
out = ['# Etap 78: każdy parametr osobno — 5 grup (G1 najniższa … G5 najwyższa wartość)', '',
       'Zwrot = średni zwrot spółki w grupie (cena, z dywidendami w kursie skorygowanym). Nadwyżka = zwrot − średnia wszystkich spółek zbioru w tym samym okresie (pp). '
       'Bije = odsetek spółek z grupy lepszych od średniej. Zakres = typowe granice grupy (mediana z miesięcy). Połowy: G5 − G1 dla startów 2012–2016 / 2017+.', '']
pod = []
for h in (60, 36):
    out += [f'## Horyzont {h // 12} lat', '']
    for p, nm in NAZWY.items():
        zw, nad, gr = grupy(p, h); _, n1, _ = grupy(p, h, b_='2016-12'); _, n2, _ = grupy(p, h, a_='2017-01')
        if not zw[0]: continue
        rows = []
        for k in range(5):
            lo, hi = np.median([g[0] for g in gr[k]]), np.median([g[1] for g in gr[k]])
            rows.append({'grupa': f'G{k + 1}', 'zakres': f'{fmt(p, lo)} … {fmt(p, hi)}', 'zwrot_sr': f'{100 * np.mean(zw[k]):+.0f} %',
                         'nadwyzka_pp': f'{100 * np.mean(nad[k]):+.1f}', 'bije_srednia': f'{100 * np.mean(np.array(nad[k]) > 0):.0f} %'})
        d = 100 * (np.mean(nad[4]) - np.mean(nad[0])); d1 = 100 * (np.mean(n1[4]) - np.mean(n1[0])); d2 = 100 * (np.mean(n2[4]) - np.mean(n2[0]))
        b5, b1 = 100 * np.mean(np.array(nad[4]) > 0), 100 * np.mean(np.array(nad[0]) > 0)
        pod.append(dict(horyzont=f'{h // 12} l.', parametr=nm, G1_pp=round(100 * np.mean(nad[0]), 1), G2_pp=round(100 * np.mean(nad[1]), 1), G3_pp=round(100 * np.mean(nad[2]), 1),
                        G4_pp=round(100 * np.mean(nad[3]), 1), G5_pp=round(100 * np.mean(nad[4]), 1), G5_minus_G1=round(d, 1), pol_2012_16=round(d1, 1), pol_2017p=round(d2, 1),
                        bije_G5=f'{b5:.0f} %', bije_G1=f'{b1:.0f} %', zgodne_polowy='tak' if np.sign(d1) == np.sign(d2) == np.sign(d) else 'nie'))
        out += [f'### {nm}', '', pd.DataFrame(rows).to_markdown(index=False), f'G5 − G1: {d:+.1f} pp (2012–2016 {d1:+.1f}, 2017+ {d2:+.1f})', '']
T = pd.DataFrame(pod)
podsum = ['## Podsumowanie: nadwyżka nad średnią (pp) w każdej z 5 grup, G5 − G1 i zgodność połówek', '']
for h in ('5 l.', '3 l.'):
    z = T[T.horyzont == h].sort_values('G5_minus_G1', key=lambda s: -s.abs())
    podsum += [f'### {h}', '', z.drop(columns='horyzont').to_markdown(index=False), '']
out = out[:3] + podsum + out[3:]
open(os.path.join(HERE, 'wyniki', 'r103_etap78.md'), 'w').write('\n'.join(out)); print('\n'.join(podsum))
