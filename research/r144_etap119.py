"""Etap 119: momentum 12 mies. jako filtr pułapki fundamentów w pulach jakości. Protokół: etap 119."""
import os
HERE = os.path.dirname(os.path.abspath(__file__))
_s113 = open(os.path.join(HERE, 'r138_etap113.py')).read()
exec(_s113[:_s113.index("print('z DCF")])
rng = np.random.default_rng(119)
nz = lambda A_, v: np.nan_to_num(A_, nan=v)
WSZ = [pd.Period(f'{y}-01', 'M') for y in range(2012, 2024)]
_s111 = open(os.path.join(HERE, 'r136_etap111.py')).read()
_ST0 = STARTY; STARTY = WSZ
exec(_s111[_s111.index("S111 = json.load"):_s111.index("for n in N: print")])
STARTY = _ST0
b = lambda a, w: np.isfinite(a) & (nz(a, -1) == w)
MOM = np.full((NT, NS), np.nan)
for m in WSZ:
    i = im_[m]
    if i >= 12: MOM[i] = Cv[i] / Cv[i - 12] - 1
POOL = {'Siła ≥ 7': (nz(SILA, 0) >= 7) & UNI, 'Jakość 7/7': (J7 == 7) & UNI,
        'Buffett 3+6+8 (🏰)': b(F['nm2'], 1) & b(F['dlug_ni'], 1) & np.isfinite(F['sga_gp']) & (nz(F['sga_gp'], 9) < 0.3) & UNI}
GR = {'≥ +5 %': 0.05, '≥ 0 %': 0.0, '≥ +20 %': 0.20}
POL = {12: ((2012, 2017), (2018, 2023)), 36: ((2012, 2017), (2018, 2023)), 60: ((2012, 2016), (2017, 2021))}
KON[60] = pd.Period('2021-09', 'M')


def polowy(A_, B_, h):
    out = []
    for a, bb in POL[h]:
        ea, eb = [], []
        for m in [m for m in WSZ if a <= m.year <= bb and m <= KON[h]]:
            i = im_[m]
            ea += list(EX[h][i, A_[i] & np.isfinite(EX[h][i])]); eb += list(EX[h][i, B_[i] & np.isfinite(EX[h][i])])
        out.append(100 * (np.median(ea) - np.median(eb)) if len(ea) >= 8 and len(eb) >= 8 else np.nan)
    return out


def strata(M, h):
    v = np.concatenate([FW[h][im_[m], M[im_[m]] & np.isfinite(FW[h][im_[m]])] for m in WSZ if m <= KON[h]])
    return 100 * np.mean(v < 0) if len(v) else np.nan


rows = []
for pn, P_ in POOL.items():
    ok = P_ & np.isfinite(MOM)
    for gn, th in GR.items():
        A_ = ok & (MOM >= th); B_ = ok & (MOM < th)
        for h in (12, 36, 60):
            na, nb, d0, lo, hi = test(A_, B_, h); p1, p2 = polowy(A_, B_, h)
            rows.append({'pula': pn, 'momentum 12 m': gn, 'horyzont': f'{h} mies.', 'n rośnie/reszta': f'{na}/{nb}', 'różnica (pp)': f'{d0:+.1f} [{lo:+.1f}; {hi:+.1f}]',
                         'połowy': f'{p1:+.1f} / {p2:+.1f}', 'strata rośnie / reszta (%)': f'{strata(A_, h):.0f} / {strata(B_, h):.0f}' if h == 36 else '',
                         'działa': 'tak' if h >= 36 and lo > 0 and p1 > 0 and p2 > 0 else ''})
            print(rows[-1], flush=True)
out = ['# Etap 119: momentum 12 mies. w pulach jakości', '', 'Różnica = mediana nadwyżki spółek z rosnącym kursem minus reszta puli; start w styczniu 2012–2023.', '', pd.DataFrame(rows).to_markdown(index=False)]
open(os.path.join(HERE, 'wyniki', 'r144_etap119.md'), 'w').write('\n'.join(out) + '\n'); print('\n'.join(out))
