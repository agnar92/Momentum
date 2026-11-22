"""Etap 93: pozostałe reguły Lyncha (gotówka, dług, wskaźnik z dywidendą, tempo wzrostu, „gorące” spółki, P/E vs własna historia, marża, dywidenda, skup, P/FCF).
Protokół: etap 93."""
import os
HERE = os.path.dirname(os.path.abspath(__file__))
_s92 = open(os.path.join(HERE, 'r117_etap92.py')).read()
exec(_s92[:_s92.index("SYG = [")])
exec(_s92[_s92.index("def nadw(h):"):_s92.index("rows = []")])
rng = np.random.default_rng(93)
D = {n: np.full((NT, NS), np.nan) for n in ('yld', 'dyw_rosnie')}
for j in range(NS):
    k = kod[j]
    if k not in ROK or not ROK[k].get('dyw'): continue
    R_ = ROK[k]
    for m in STARTY:
        i = im_[m]
        if not UNI[i, j]: continue
        t = m.to_timestamp(how='end')
        fa = [z for z in R_['fc'] if z[3] <= t]
        if not fa: continue
        e0 = fa[-1][0]
        dv = [przy_rok(R_['dyw'], e0 - n * Y, t) for n in range(6)]
        cp = CAP[k].get(m) if k in CAP.columns else None
        if dv[0] is not None and cp and cp > 0: D['yld'][i, j] = dv[0] / cp
        if all(v is not None for v in dv) and dv[-1] > 0:
            D['dyw_rosnie'][i, j] = float(all(dv[n] > dv[n + 1] for n in range(5)))
ni5 = X['ni_5y']; NC5 = np.where(nz(ni5, -9) > -1, (1 + nz(ni5, 0)) ** 0.2 - 1, np.nan)
LW = np.where(nz(PE, -1) > 0, (100 * NC5 + 100 * nz(D['yld'], 0)) / PE, np.nan)
RET12 = np.full((NT, NS), np.nan); RET12[12:] = Cv[12:] / Cv[:-12] - 1
GOR = np.zeros((NT, NS), bool)
for m in STARTY:
    i = im_[m]; ok = UNI[i] & np.isfinite(RET12[i]) & np.isfinite(PE[i])
    if ok.sum() > 50:
        q1, q2 = np.percentile(RET12[i, ok], 90), np.percentile(PE[i, ok], 90)
        GOR[i] = ok & (RET12[i] >= q1) & (PE[i] >= q2)
NM = X['nm']; NMT = np.zeros((NT, NS)); NMB = np.zeros((NT, NS), bool); NMT = NMT.astype(bool)
for m in STARTY:
    i = im_[m]; ok = UNI[i] & STAB[i] & np.isfinite(NM[i])
    if ok.sum() > 15:
        a, b = np.percentile(NM[i, ok], [33, 67]); NMT[i] = ok & (NM[i] >= b); NMB[i] = ok & (NM[i] <= a)
PFCF = np.where(nz(X['fcf_yield'], 0) > 0, 1 / nz(X['fcf_yield'], 1), np.nan) if 'fcf_yield' in X else np.full((NT, NS), np.nan)
AK = X['C3_akcje_3l']; NCM = X['net_cash_mc']; DE = X['de']
WSZ = UNI.copy()
REG = [  # (nazwa, A = lepsza wg Lyncha, B = gorsza wg Lyncha)
    ('L1 gotówka netto ≥ 10 % kapitalizacji vs dług netto', nz(NCM, -9) >= 0.10, nz(NCM, 9) < 0),
    ('L2 dług / kapitał ≤ 0,33 vs > 1', (nz(DE, 9) >= 0) & (nz(DE, 9) <= 0.33), nz(DE, -9) > 1),
    ('L3 wskaźnik Lyncha z dywidendą ≥ 2 vs < 1', nz(LW, -9) >= 2, np.isfinite(LW) & (nz(LW, 9) < 1)),
    ('L4 szybko rosnące: zysk +20–25 %/rok vs > +50 %/rok', SZYB & (nz(NC5, -9) >= 0.20) & (nz(NC5, 9) <= 0.25), SZYB & (nz(NC5, -9) > 0.50)),
    ('L5 nie „najgorętsza” vs „najgorętsza” (zwrot 12 m i P/E w top 10 %)', np.isfinite(RET12) & np.isfinite(PE) & ~GOR, GOR),
    ('L6 P/E < własna mediana 5 lat vs > 1,3 ×', np.isfinite(PEMED) & (nz(PE, 1e9) < nz(PEMED, 0)), nz(PE, -1) > 1.3 * nz(PEMED, 1e9)),
    ('L7 stabilnie rosnące: marża netto górna vs dolna tercyla', NMT, NMB),
    ('L8 wolno rosnące: dywidenda rośnie 5 lat z rzędu vs nie', WOLN & (nz(D['dyw_rosnie'], 0) == 1), WOLN & (nz(D['dyw_rosnie'], 1) == 0)),
    ('L9 skup akcji (3 lata ≤ −2 %) vs rozwadnianie (> +5 %)', nz(AK, 9) <= -0.02, nz(AK, -9) > 0.05),
    ('L10 P/FCF ≤ 15 vs > 30', (nz(PFCF, 99) > 0) & (nz(PFCF, 99) <= 15), nz(PFCF, -1) > 30),
]
rows = []
for nm, A_, B_ in REG:
    r = {'reguła (A lepsza wg Lyncha vs B)': nm}; wyn = {}
    for h in (12, 36):
        na, nb, d0, lo, hi = test(A_, B_, h); wyn[h] = (d0, lo)
        r[f'n A/B {h} m'] = f'{na}/{nb}'; r[f'A − B {h} m (pp)'] = f'{d0:+.1f} [{lo:+.1f}; {hi:+.1f}]' if d0 == d0 else '–'
    (d36, l36), (d12, l12) = wyn[36], wyn[12]
    ok = (d36 == d36 and d36 > 0 and l36 > 0) or (d12 == d12 and d12 > 0 and l12 > 0 and d36 == d36 and d36 >= 0)
    r['werdykt'] = 'potwierdzona' if ok else 'niepotwierdzona'
    rows.append(r); print(r, flush=True)
out = ['# Etap 93: pozostałe reguły Lyncha z „One Up on Wall Street”', '',
       'Top 500 USA PIT bez wykluczonych sektorów, starty w styczniu 2012–2023; różnica median nadwyżki zwrotu ceny nad medianą zbioru (grupa A — lepsza wg Lyncha — minus B), '
       'pp, w nawiasie 95 % przedział z bootstrapu po latach startowych. Dodatnia = Lynch ma rację.', '', pd.DataFrame(rows).to_markdown(index=False), '']
open(os.path.join(HERE, 'wyniki', 'r118_etap93.md'), 'w').write('\n'.join(out)); print('\n'.join(out))
