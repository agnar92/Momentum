"""Etap 100: propozycja portfela 6 / 2 / 2 (2 wolno rosnące) z potwierdzonych cech. Protokół: etap 100."""
import os
HERE = os.path.dirname(os.path.abspath(__file__))
_s95 = open(os.path.join(HERE, 'r120_etap95.py')).read()
exec(_s95[:_s95.index("L = sum(")])
rng = np.random.default_rng(100)
DR = np.zeros((NT, NS), bool)
for j in range(NS):
    k = kod[j]
    if k not in ROK or not ROK[k].get('dyw'): continue
    R_ = ROK[k]
    for m in STARTY:
        i = im_[m]
        if not UNI[i, j]: continue
        t = m.to_timestamp(how='end'); fa = [z for z in R_['fc'] if z[3] <= t]
        if not fa: continue
        e0 = fa[-1][0]; dv = [przy_rok(R_['dyw'], e0 - n * Y, t) for n in range(6)]
        if all(v is not None for v in dv) and dv[-1] > 0 and all(dv[n] > dv[n + 1] for n in range(5)): DR[i, j] = True
JAK, SIL = PKT['P1 Jakość 7/7'], PKT['P2 Siła ≥ 7']
FCFP = nz(X['fcf_margin'], -1) > 0
BAZA = UNI & ~SPADEK & FCFP
NM = X['nm']


def wybor(i):
    out = []
    for M, n, klucz in ((STAB & (JAK | SIL), 6, NM), (SZYB & (JAK | SIL), 2, SILA), (WOLN & DR, 2, SILA)):
        k_ = np.flatnonzero(BAZA[i] & M[i] & np.isfinite(klucz[i]))
        out += list(k_[np.argsort(-klucz[i, k_])][:n])
    return out


rows, szcz = [], []
for h in (12, 36):
    for m in [m for m in STARTY if m <= KON[h]]:
        i = im_[m]; w = [j for j in wybor(i) if np.isfinite(FW[h][i, j])]
        ok = UNI[i] & np.isfinite(FW[h][i])
        if not w: continue
        szcz.append(dict(h=h, rok=m.year, n=len(w), portfel=np.mean(FW[h][i, w]), zbior=np.mean(FW[h][i, ok]), mediana=np.median(FW[h][i, ok]),
                         strata=np.mean(FW[h][i, w] < 0), strata_z=np.mean(FW[h][i, ok] < 0), sklad=', '.join(kod[j] for j in w)))
S = pd.DataFrame(szcz)
for h in (12, 36):
    s = S[S.h == h]; d = (s.portfel - s.zbior).to_numpy()
    bs = [d[rng.choice(len(d), len(d))].mean() for _ in range(2000)]; lo, hi = np.percentile(bs, [2.5, 97.5])
    for nm_, a, b in (('2012–2023', 2012, 2023), ('2012–2017', 2012, 2017), ('2018–2023', 2018, 2023)):
        x = s[(s.rok >= a) & (s.rok <= b)]
        if not len(x): continue
        rows.append({'horyzont': f'{h} mies.', 'okres': nm_, 'startów': len(x), 'średnio spółek': round(x.n.mean(), 1), 'portfel (średnio)': f'{100 * x.portfel.mean():+.1f} %',
                     'zbiór (średnio)': f'{100 * x.zbior.mean():+.1f} %', 'różnica': f'{100 * (x.portfel - x.zbior).mean():+.1f} pp', 'lepiej niż zbiór': f'{int((x.portfel > x.zbior).sum())}/{len(x)}',
                     'najgorszy start portfel / zbiór': f'{100 * x.portfel.min():+.0f} / {100 * x.zbior.min():+.0f} %', 'spółek ze stratą portfel / zbiór': f'{100 * x.strata.mean():.0f} / {100 * x.strata_z.mean():.0f} %'})
    rows[-3]['95 % przedział różnicy'] = f'{100 * lo:+.1f} … {100 * hi:+.1f} pp'
T = pd.DataFrame(rows)
s12 = S[S.h == 12][['rok', 'n', 'portfel', 'zbior', 'sklad']].copy(); s12['portfel'] = (100 * s12.portfel).round(1); s12['zbior'] = (100 * s12.zbior).round(1)
out = ['# Etap 100: propozycja portfela 6 / 2 / 2 wg typów Lyncha', '',
       'Top 500 USA PIT bez wykluczonych sektorów; co roku w styczniu wybór wg reguły z protokołu, równe wagi, zwrot ceny. Zbiór = średnia wszystkich spółek (równe wagi).', '',
       T.to_markdown(index=False), '', '## Skład i wynik 12 mies. wg roku', '', s12.to_markdown(index=False), '']
open(os.path.join(HERE, 'wyniki', 'r125_etap100.md'), 'w').write('\n'.join(out)); print('\n'.join(out))
