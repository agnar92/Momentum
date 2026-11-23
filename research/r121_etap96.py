"""Etap 96: dywidenda 5 lat z rzędu a jakość; PEGY vs PEG (przeszły wzrost zysku). Protokół: etap 96."""
import os
HERE = os.path.dirname(os.path.abspath(__file__))
_s95 = open(os.path.join(HERE, 'r120_etap95.py')).read()
exec(_s95[:_s95.index("L = sum(")])
rng = np.random.default_rng(96)
D5 = np.zeros((NT, NS), bool); D0 = np.zeros((NT, NS), bool); YLD = np.full((NT, NS), np.nan)
for j in range(NS):
    k = kod[j]
    if k not in ROK: continue
    R_ = ROK[k]
    for m in STARTY:
        i = im_[m]
        if not UNI[i, j]: continue
        t = m.to_timestamp(how='end')
        fa = [z for z in R_['fc'] if z[3] <= t]
        if not fa: continue
        e0 = fa[-1][0]
        dv = [przy_rok(R_['dyw'], e0 - n * Y, t) if R_.get('dyw') else None for n in range(5)]
        if all(v is not None and v > 0 for v in dv): D5[i, j] = True
        if dv[0] is None or dv[0] <= 0: D0[i, j] = True
        cp = CAP[k].get(m) if k in CAP.columns else None
        if cp and cp > 0: YLD[i, j] = (dv[0] or 0) / cp
JAK, SIL = PKT['P1 Jakość 7/7'], PKT['P2 Siła ≥ 7']


def ogon(M, h=36):
    v = []; st = []
    for m in [m for m in STARTY if m <= KON[h]]:
        i = im_[m]; ok = UNI[i] & M[i] & np.isfinite(EX[h][i])
        v += list(EX[h][i, ok]); st += list(FW[h][i, ok] < 0)
    return (f"{100 * np.mean(st):.0f} %", f"{100 * np.percentile(v, 10):+.0f} pp", len(v)) if v else ('–', '–', 0)


rows = []
for nm, G in (('wszystkie spółki', np.ones((NT, NS), bool)), ('Jakość 7/7', JAK), ('Siła ≥ 7', SIL), ('Jakość 7/7 lub Siła ≥ 7', JAK | SIL)):
    r = {'grupa': nm}
    for h in (12, 36):
        na, nb, d0, lo, hi = test(G & D5, G & D0, h)
        r[f'n D5/bez {h} m'] = f'{na}/{nb}'; r[f'D5 − bez dywidendy {h} m (pp)'] = f'{d0:+.1f} [{lo:+.1f}; {hi:+.1f}]' if d0 == d0 else '–'
    a, b = ogon(G & D5), ogon(G & D0)
    r['strata po 36 m: D5 / bez'] = f'{a[0]} / {b[0]}'; r['najgorsze 10 % (nadwyżka): D5 / bez'] = f'{a[1]} / {b[1]}'
    rows.append(r); print(r, flush=True)
TA = pd.DataFrame(rows)
PE_ = np.where(nz(X['pe'], -1) > 0, X['pe'], np.nan)
ni5 = X["ni_5y"]; NC5 = np.where(nz(ni5, -9) > -1, (1 + nz(ni5, 0)) ** 0.2 - 1, np.nan)
OKG = np.isfinite(PE_) & (nz(NC5, -1) > 0)
PEG_ = np.where(OKG, PE_ / (100 * nz(NC5, 1)), np.nan)
PEGY_ = np.where(OKG, PE_ / (100 * nz(NC5, 1) + 100 * nz(YLD, 0)), np.nan)


def ic(A_, h):
    v = []
    for m in [m for m in STARTY if m <= KON[h]]:
        i = im_[m]; ok = UNI[i] & np.isfinite(A_[i]) & np.isfinite(EX[h][i])
        if ok.sum() > 30: v.append(pd.Series(A_[i, ok]).rank().corr(pd.Series(EX[h][i, ok]).rank()))
    return np.mean(v), len(v)


def tercyle(A_):
    lo_ = np.zeros((NT, NS), bool); hi_ = np.zeros((NT, NS), bool)
    for m in STARTY:
        i = im_[m]; ok = UNI[i] & np.isfinite(A_[i])
        if ok.sum() > 30:
            a, b = np.percentile(A_[i, ok], [33.3, 66.7]); lo_[i] = ok & (A_[i] <= a); hi_[i] = ok & (A_[i] >= b)
    return lo_, hi_


rows = []
for nm, A_ in (('PEG', PEG_), ('PEGY', PEGY_)):
    lo_, hi_ = tercyle(A_)
    r = {'wskaźnik': nm}
    for h in (12, 36):
        c, n = ic(A_, h); na, nb, d0, l_, h_ = test(lo_, hi_, h)
        r[f'korelacja rang {h} m'] = f'{c:+.3f}'; r[f'tani − drogi (tercyle) {h} m (pp)'] = f'{d0:+.1f} [{l_:+.1f}; {h_:+.1f}]'
    rows.append(r); print(r, flush=True)
lp, _ = tercyle(PEG_); ly, _ = tercyle(PEGY_)
zg = np.mean([((lp[im_[m]] & ly[im_[m]]).sum()) / max(1, (lp[im_[m]] | ly[im_[m]]).sum()) for m in STARTY])
na, nb, d0, l_, h_ = test(ly & ~lp, lp & ~ly, 36)
TB = pd.DataFrame(rows)
out = ['# Etap 96: dywidenda 5 lat z rzędu a jakość; PEGY vs PEG', '',
       'Top 500 USA PIT bez wykluczonych sektorów, starty w styczniu 2012–2023. Nadwyżka = zwrot ceny minus mediana zbioru w tym samym starcie; różnice median z 95 % '
       'przedziałem (bootstrap po latach).', '', '## A. Dywidenda wypłacana w każdym z 5 lat (D5) vs brak dywidendy', '', TA.to_markdown(index=False), '',
       '## B. PEGY vs PEG (oba z przeszłego wzrostu zysku 5 lat)', '', 'Korelacja rang ujemna = niższy wskaźnik → lepszy zwrot (tak powinno być).', '', TB.to_markdown(index=False), '',
       f'Tania tercyla PEG i PEGY pokrywa się średnio w {100 * zg:.0f} %. Spółki tanie tylko wg PEGY minus tanie tylko wg PEG (36 mies.): {d0:+.1f} [{l_:+.1f}; {h_:+.1f}] pp '
       f'(n {na}/{nb}).', '']
open(os.path.join(HERE, 'wyniki', 'r121_etap96.md'), 'w').write('\n'.join(out)); print('\n'.join(out))
