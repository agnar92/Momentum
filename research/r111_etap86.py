"""Etap 86: test tez z 4 filmów autora (rentowność, przepływy, typy Lyncha, przewidywanie wzrostu). Protokół: etap 86."""
import os
HERE = os.path.dirname(os.path.abspath(__file__))
_s = open(os.path.join(HERE, 'r104_etap79.py')).read()
exec(_s[:_s.index('# --- cel: nadwyżka nad średnią ---')])
S86 = json.load(open(f'{SZ}/sec86.json')) if os.path.exists(f'{SZ}/sec86.json') else {}
STARTY = [pd.Period(f'{y}-01', 'M') for y in range(2012, 2024)]
FW = {}
for h in (12, 36, 60):
    A = np.full((NT, NS), np.nan); A[:-h] = Cv[h:] / Cv[:-h] - 1; FW[h] = A
KON = {12: pd.Period('2025-09', 'M'), 36: pd.Period('2023-09', 'M'), 60: pd.Period('2021-09', 'M')}
IT = np.array([s == 'Information Technology' for s in SEK])


def roczne_rows(d):
    """{tag: wiersze} -> {end: (val, filed)} roczne (350–380 dni), pierwszy tag z wartością, pierwsze złożenie."""
    out = {}
    for rows in (d or {}).values():
        for s_, e_, v_, f_ in sorted(rows, key=lambda r: r[3]):
            if 350 <= (dd(e_) - dd(s_)).days <= 380 and e_ not in out:
                out[e_] = (v_, f_)
    return out


ROK = {}
for k in set(kod):
    if k not in cache: continue
    f_ = sorted((pd.Timestamp(e), o, c, pd.Timestamp(f)) for s_, e, o, c, f in (FC.get(k) or []) if o is not None and c is not None)
    s8 = S86.get(k) or {}
    ROK[k] = dict(fc=f_, skup=roczne_rows(s8.get('skup')), emis=roczne_rows(s8.get('emisja')), dyw=roczne_rows(s8.get('dyw')))


def przy_rok(slow, e, t):
    best = None
    for ee, (v, f) in slow.items():
        if pd.Timestamp(f) <= t and abs((pd.Timestamp(ee) - e).days) <= 45:
            best = v
    return best


# cechy roczne na start (styczeń)
C = {n: np.full((NT, NS), np.nan) for n in ('ocf_dlug', 'capex_ocf', 'skup_mc', 'fcf_akt', 'dyw', 'ramp', 'bogata', 'zwrot_nowych', 'ni_teraz', 'ni_rok_temu',
                                            'rev_fut', 'ni_fut', 'ni_fut_cagr', 'akcje_3l', 'ni_3l')}
for j in range(NS):
    k = kod[j]
    if k not in ROK: continue
    sq, R_ = cache[k], ROK[k]
    for m in STARTY:
        i = im_[m]
        if not U[i, j]: continue
        t = m.to_timestamp(how='end')
        fa = [z for z in R_['fc'] if z[3] <= t]
        if fa and (t - fa[-1][0]).days <= 450:
            e0, ocf0, cx0, _ = fa[-1]
            db = dlug(sq['b'], t, e0, k) if sq.get('b') else None
            if db is not None: C['ocf_dlug'][i, j] = ocf0 / db if db > 0 else (9.99 if ocf0 > 0 else np.nan)
            if ocf0 > 0: C['capex_ocf'][i, j] = cx0 / ocf0
            av = sq['as'].przy(t, e0) if 'as' in sq else None
            if av and av > 0: C['fcf_akt'][i, j] = (ocf0 - cx0) / av
            cp = CAP[k].get(m) if k in CAP.columns else None
            sk, em = przy_rok(R_['skup'], e0, t), przy_rok(R_['emis'], e0, t)
            if cp and np.isfinite(cp) and cp > 0 and (sk is not None or em is not None) and R_['skup']:
                C['skup_mc'][i, j] = ((sk or 0) - (em or 0)) / cp
            dv = przy_rok(R_['dyw'], e0, t); C['dyw'][i, j] = 1.0 if dv and dv > 0 else 0.0
            f2 = [z for z in fa if abs((z[0] - (e0 - 2 * Y)).days) <= 60]
            rv = sq['rev'].przy(t, e0) if 'rev' in sq else None
            if f2 and rv and rv > 0:
                _, ocf2, cx2, _ = f2[-1]
                C['ramp'][i, j] = 1.0 if (cx2 > 0 and cx0 >= 2 * cx2 and cx0 >= 0.05 * rv) else 0.0
                C['bogata'][i, j] = 1.0 if cx2 > 0 and ocf2 >= 3 * cx2 else 0.0
                a2 = sq['as'].przy(t, e0 - 2 * Y) if 'as' in sq else None
                if av and a2 and av - a2 > 0: C['zwrot_nowych'][i, j] = (ocf0 - ocf2) / (av - a2)
        if 'ni' in sq:
            e1, n0 = sq['ni'].teraz(t)
            if n0 is not None:
                C['ni_teraz'][i, j] = n0; nr = sq['ni'].przy(t, e1 - Y)
                if nr is not None: C['ni_rok_temu'][i, j] = nr
                t5 = t + 5 * Y
                nf = sq['ni'].przy(t5 + pd.Timedelta(days=200), e1 + 5 * Y)
                if nf is not None and n0 > 0:
                    C['ni_fut'][i, j] = nf / n0 - 1
                    if nf > 0: C['ni_fut_cagr'][i, j] = (nf / n0) ** 0.2 - 1
                n3 = sq['ni'].przy(t, e1 - 3 * Y)
                if n3 and n3 > 0 and n0 > 0: C['ni_3l'][i, j] = (n0 / n3) ** (1 / 3) - 1
        if 'rev' in sq:
            e0r, r0 = sq['rev'].teraz(t)
            if r0 and r0 > 0:
                rf = sq['rev'].przy(t + 5 * Y + pd.Timedelta(days=200), e0r + 5 * Y)
                if rf: C['rev_fut'][i, j] = rf / r0 - 1
print('cechy roczne', {n: int(np.isfinite(v).sum()) for n, v in C.items()}, flush=True)
C['akcje_3l'] = X['C3_akcje_3l']


def grupa(M, h, okres=None, zb=None):
    """mediana zwrotu h mies. w grupie M (starty w styczniu), liczba, odsetek bijących medianę zbioru."""
    zb = UNI if zb is None else zb; vals, bij = [], []
    for m in STARTY:
        if m > KON[h] or (okres and not (okres[0] <= m.year <= okres[1])): continue
        i = im_[m]; ok = zb[i] & np.isfinite(FW[h][i])
        if ok.sum() < 50: continue
        med = np.median(FW[h][i, ok]); s = ok & M[i]
        vals += list(FW[h][i, s]); bij += list(FW[h][i, s] > med)
    return (np.median(vals) if vals else np.nan, len(vals), np.mean(bij) if bij else np.nan)


def wiersz(nm, M, zb=None, h=60):
    a, b_, c = grupa(M, h, zb=zb); a1, n1, _ = grupa(M, h, (2012, 2016), zb); a2, n2, _ = grupa(M, h, (2017, 2021 if h == 60 else 2023), zb)
    return {'grupa': nm, 'mediana_zwrotu': f'{100 * a:+.0f} %' if a == a else '–', 'obs': b_, 'bije_mediane': f'{100 * c:.0f} %' if c == c else '–',
            'mediana_2012_16': f'{100 * a1:+.0f} %' if a1 == a1 else '–', 'mediana_2017p': f'{100 * a2:+.0f} %' if a2 == a2 else '–'}


nz = lambda A_, v: np.nan_to_num(A_, nan=v)
WSZ = np.ones((NT, NS), bool)
out = ['# Etap 86: test tez z 4 filmów autora (starty w styczniu; mediana zwrotu ceny w 5 lat, jak u autora)', '']
# --- F1 rentowność
R1 = nz(X['roe'], -9) >= 0.15; R2 = R1 & (nz(X['roa'], -9) >= 0.10); R3 = R2 & (nz(X['d_roe_3l'], -9) > 0)
R4 = R3 & (nz(X['roce'], -9) >= 0.30); R4b = R3 & (nz(X['roce'], -9) >= 0.25)
for nm_zb, zb in (('wszystkie sektory filmu (bez wykluczonych)', UNI), ('bez technologii', UNI & ~IT[None, :])):
    rows = [wiersz('wszystkie spółki', WSZ, zb), wiersz('R1 ROE ≥ 15 %', R1, zb), wiersz('  odpadły na R1', ~R1, zb), wiersz('R2 + ROA ≥ 10 %', R2, zb),
            wiersz('  przeszły R1, odpadły na R2', R1 & ~R2, zb), wiersz('R3 + ROE wyższe niż 3 lata temu', R3, zb), wiersz('  przeszły R2, odpadły na R3', R2 & ~R3, zb),
            wiersz('R4 + ROCE ≥ 30 %', R4, zb), wiersz('  przeszły R3, odpadły na R4', R3 & ~R4, zb), wiersz("R4' + ROCE ≥ 25 %", R4b, zb)]
    out += [f'## Film 1: rentowność — {nm_zb} (autor: 63 → 68 → 78 → 82 → 91 %; bez technologii 61 → 83 %)', '', pd.DataFrame(rows).to_markdown(index=False), '']
print('F1', flush=True)
# --- F2 przepływy
P1 = nz(C['ocf_dlug'], -9) >= 0.30; P2 = P1 & (nz(C['capex_ocf'], 9) < 0.35); P3 = P2 & (nz(C['skup_mc'], -9) > 0.02); P4 = P3 & (nz(C['fcf_akt'], -9) > 0.12)
for nm_zb, zb in (('bez wykluczonych sektorów', UNI), ('bez technologii', UNI & ~IT[None, :])):
    rows = [wiersz('wszystkie spółki (z danymi przepływów)', np.isfinite(C['ocf_dlug']), zb), wiersz('P1 przepływy oper. ≥ 30 % długu', P1, zb),
            wiersz('  odpadły na P1', np.isfinite(C['ocf_dlug']) & ~P1, zb), wiersz('P2 + capex < 35 % przepływów', P2, zb), wiersz('  przeszły P1, odpadły na P2', P1 & ~P2, zb),
            wiersz('P3 + skup netto > 2 % kapitalizacji', P3, zb), wiersz('  przeszły P2, odpadły na P3', P2 & ~P3, zb), wiersz('P4 + FCF > 12 % aktywów', P4, zb),
            wiersz('  przeszły P3, odpadły na P4', P3 & ~P4, zb)]
    out += [f'## Film 2: przepływy pieniężne — {nm_zb} (autor: 51 / 77 → 80 → 82 → 86 %, wszystkie 66 %)', '', pd.DataFrame(rows).to_markdown(index=False), '']
RAMP = nz(C['ramp'], 0) == 1; BOG = nz(C['bogata'], 0) == 1; ZN = C['zwrot_nowych']
rows = [wiersz('rampa capex (≥ 2 × w 2 lata, ≥ 5 % przychodów)', RAMP), wiersz('bez rampy', np.isfinite(C['ramp']) & ~RAMP),
        wiersz('rampa, bogate w gotówkę przed (OCF ≥ 3 × capex)', RAMP & BOG), wiersz('rampa, niebogate', RAMP & ~BOG),
        wiersz('rampa bogata, zwrot z nowych aktywów ≥ 0,20', RAMP & BOG & (nz(ZN, -9) >= 0.20)), wiersz('rampa bogata, zwrot z nowych aktywów < 0,10', RAMP & BOG & (nz(ZN, 9) < 0.10))]
# odsetek spełniających P1–P4 po 3 latach
lag36 = lambda A_: np.vstack([A_[36:], np.zeros((36, NS), bool)])
P4za3 = lag36(P4)
def odsetek(M):
    v = [P4za3[im_[m], np.flatnonzero(M[im_[m]] & UNI[im_[m]])] for m in STARTY if m <= pd.Period('2023-01', 'M')]
    v = np.concatenate(v) if v else np.array([]); return f'{100 * v.mean():.0f} % (n {len(v)})' if len(v) else '–'
out += ['## Film 2: rampy capex (autor: rampy 56 % vs reszta 67 %; bogate 82 % vs 28 %; wysoki zwrot 149 % vs niski 20 %)', '', pd.DataFrame(rows).to_markdown(index=False), '',
        f'Spełnia P1–P4 po 3 latach: rampa bogata z wysokim zwrotem {odsetek(RAMP & BOG & (nz(ZN, -9) >= 0.20))}, pozostałe rampy {odsetek(RAMP & ~(BOG & (nz(ZN, -9) >= 0.20)))}, '
        f'wszystkie spółki {odsetek(np.isfinite(C["ramp"]))} (autor: 3 × częściej)', '']
print('F2', flush=True)
# --- F3 typy Lyncha
CAPm = np.full((NT, NS), np.nan)
for j in range(NS):
    if kod[j] in CAP.columns:
        s = CAP[kod[j]]
        for m in STARTY: CAPm[im_[m], j] = s.get(m, np.nan)
NI5c = np.where(nz(X['ni_5y'], -9) > -1, (1 + nz(X['ni_5y'], -0.99)) ** 0.2 - 1, np.nan)
PEGh = np.where((nz(X['pe'], -1) > 0) & (nz(NI5c, -1) > 0), X['pe'] / (100 * NI5c), np.nan)
STAB = (nz(X['rev_cagr5'], -9) >= 0.08) & (nz(X['rev_cagr5'], 9) <= 0.18) & (nz(CAPm, 0) >= 20e9)
SZYB = (nz(X['rev_cagr5'], -9) >= 0.20) | (nz(NI5c, -9) >= 0.20)
WOLN = (nz(X['rev_cagr5'], 9) < 0.08) & (nz(C['dyw'], 0) == 1)
CYK = nz(X['najgorszy_rok_przych'], 9) <= -0.10
ZKL = (nz(C['ni_teraz'], -1) > 0) & (nz(C['ni_rok_temu'], 1) < 0)
rows = []
for nm, M in (('stabilnie rosnąca', STAB), ('szybko rosnąca', SZYB), ('wolno rosnąca (z dywidendą)', WOLN), ('cykliczna', CYK), ('wychodząca z kłopotów', ZKL), ('wszystkie', WSZ)):
    r5 = wiersz(nm, M); r3 = wiersz(nm, M, h=36); r5['mediana_3l'] = r3['mediana_zwrotu']; rows.append(r5)
# stabilne: odsetek z ≥ +50 % w 3 lata
v = np.concatenate([FW[36][im_[m], np.flatnonzero(STAB[im_[m]] & UNI[im_[m]] & np.isfinite(FW[36][im_[m]]))] for m in STARTY if m <= KON[36]])
vz = np.concatenate([FW[36][im_[m], np.flatnonzero(UNI[im_[m]] & np.isfinite(FW[36][im_[m]]))] for m in STARTY if m <= KON[36]])
out += ['## Film 3: typy spółek (Lynch) — mediana 5 i 3 lat', '', pd.DataFrame(rows).to_markdown(index=False), '',
        f'Stabilnie rosnące z ≥ +50 % w 3 lata: {100 * np.mean(v >= 0.5):.0f} % (wszystkie spółki {100 * np.mean(vz >= 0.5):.0f} %)', '']
tP = lambda A_, q: np.nanpercentile(A_[UNI & np.isfinite(A_)], q)
rows = [wiersz('stabilne, PEG ≤ 1,5', STAB & (nz(PEGh, 9) <= 1.5) & (nz(PEGh, -1) > 0)), wiersz('stabilne, PEG > 1,5', STAB & (nz(PEGh, 0) > 1.5)),
        wiersz('szybkie, PEG < 1', SZYB & (nz(PEGh, 9) < 1) & (nz(PEGh, -1) > 0)), wiersz('szybkie, PEG 1–1,6', SZYB & (nz(PEGh, 0) >= 1) & (nz(PEGh, 9) <= 1.6)),
        wiersz('szybkie, PEG > 1,6', SZYB & (nz(PEGh, 0) > 1.6))]
PEc = np.where(nz(X['pe'], -1) > 0, X['pe'], np.nan)
lo, hi = np.full((NT, NS), False), np.full((NT, NS), False)
for m in STARTY:
    i = im_[m]; ok = CYK[i] & UNI[i] & np.isfinite(PEc[i])
    if ok.sum() > 9:
        q1, q2 = np.percentile(PEc[i, ok], [33, 67]); lo[i] = ok & (PEc[i] <= q1); hi[i] = ok & (PEc[i] >= q2)
rows += [wiersz('cykliczne, P/E w dolnej tercyli', lo), wiersz('cykliczne, P/E w górnej tercyli', hi),
         wiersz('wolno rosnące, P/E ≤ 18', WOLN & (nz(PEc, 99) <= 18)), wiersz('wolno rosnące, P/E > 25', WOLN & (nz(PEc, 0) > 25))]
vt = np.concatenate([FW[60][im_[m], np.flatnonzero(ZKL[im_[m]] & UNI[im_[m]] & np.isfinite(FW[60][im_[m]]))] for m in STARTY if m <= KON[60]])
va = np.concatenate([FW[60][im_[m], np.flatnonzero(UNI[im_[m]] & np.isfinite(FW[60][im_[m]]))] for m in STARTY if m <= KON[60]])
out += ['## Film 3: wycena w typach (PEG historyczny = P/E ÷ CAGR zysku 5 lat)', '', pd.DataFrame(rows).to_markdown(index=False), '',
        f'Wychodzące z kłopotów: spadek > 50 % w 5 lat — {100 * np.mean(vt <= -0.5):.0f} % (wszystkie {100 * np.mean(va <= -0.5):.0f} %); wzrost > 100 % — {100 * np.mean(vt >= 1):.0f} % (wszystkie {100 * np.mean(va >= 1):.0f} %). '
        'Uwaga: spółki wycofane z obrotu bez ceny końcowej nie liczą się (zaniża bankructwa).', '']
print('F3', flush=True)
# --- F4 przewidywanie wzrostu (wszystkie sektory)
PREV5 = np.where(np.isfinite(X['rev_cagr5']), (1 + X['rev_cagr5']) ** 5 - 1, np.nan)
pasma = [(-9, 0, '< 0 %'), (0, 0.25, '0–25 %'), (0.25, 0.5, '25–50 %'), (0.5, 1.0, '50–100 %'), (1.0, 99, '> 100 %')]
rows = []
for a, b_, nm in pasma:
    rv, nv, ncg = [], [], []
    for m in STARTY:
        if m > pd.Period('2021-01', 'M'): continue
        i = im_[m]; s = U[i] & (PREV5[i] >= a) & (PREV5[i] < b_)
        rv += list(C['rev_fut'][i, s & np.isfinite(C['rev_fut'][i])]); nv += list(C['ni_fut'][i, s & np.isfinite(C['ni_fut'][i])])
    rows.append({'przeszły wzrost przychodów 5 l.': nm, 'mediana przyszłych przychodów 5 l.': f'{100 * np.median(rv):+.0f} %' if rv else '–', 'obs': len(rv),
                 'mediana przyszłego zysku 5 l.': f'{100 * np.median(nv):+.0f} %' if nv else '–', 'obs_zysk': len(nv)})
out += ['## Film 4: przeszły wzrost przychodów → przyszły wzrost przychodów i zysku (5 lat; wszystkie sektory, starty 2012–2021)', '', pd.DataFrame(rows).to_markdown(index=False), '']
# cykliczne: korelacja rang przeszłego i przyszłego wzrostu
def kor(M):
    x, y = [], []
    for m in STARTY:
        if m > pd.Period('2021-01', 'M'): continue
        i = im_[m]; s = U[i] & M[i] & np.isfinite(PREV5[i]) & np.isfinite(C['rev_fut'][i]); x += list(PREV5[i, s]); y += list(C['rev_fut'][i, s])
    return pd.Series(x).rank().corr(pd.Series(y).rank()), len(x)
kc, kn = kor(CYK), kor(~CYK & np.isfinite(X['najgorszy_rok_przych']))
# wielkość
big, rest = [], []
for m in STARTY:
    if m > pd.Period('2021-01', 'M'): continue
    i = im_[m]; ok = U[i] & np.isfinite(CAPm[i]) & np.isfinite(C['ni_fut_cagr'][i])
    if ok.sum() < 100: continue
    thr = np.sort(CAPm[i, U[i] & np.isfinite(CAPm[i])])[-100]
    big += list(C['ni_fut_cagr'][i, ok & (CAPm[i] >= thr)]); rest += list(C['ni_fut_cagr'][i, ok & (CAPm[i] < thr)])
# stopa bazowa
allc = np.concatenate([C['ni_fut'][im_[m], np.flatnonzero(U[im_[m]] & np.isfinite(C['ni_fut'][im_[m]]))] for m in STARTY if m <= pd.Period('2021-01', 'M')])
cg = np.where(allc > -1, np.sign(1 + allc) * np.abs(1 + allc) ** 0.2 - 1, -1)
baza = {'spadek zysku': np.mean(allc < 0), '0–20 %/rok': np.mean((cg >= 0) & (cg < 0.2)), '20–30 %/rok': np.mean((cg >= 0.2) & (cg < 0.3)), '≥ 30 %/rok': np.mean(cg >= 0.3)}
out += [f'Korelacja rang przeszłego i przyszłego wzrostu przychodów 5 l.: cykliczne {kc[0]:.2f} (n {kc[1]}), pozostałe {kn[0]:.2f} (n {kn[1]}).', '',
        f'Wielkość: mediana przyszłego CAGR zysku 5 l. — 100 największych {100 * np.median(big):.1f} % (n {len(big)}), pozostałe {100 * np.median(rest):.1f} % (n {len(rest)}) (autor, 10 lat: 5,7 vs 8,4 %).', '',
        'Stopa bazowa (zysk netto, 5 lat, spółki z dodatnim zyskiem na starcie): ' + ', '.join(f'{k} {100 * v:.0f} %' for k, v in baza.items()) + ' (autor: ~25 % spadek, ~50 % 0–20 %, 13 % ≥ 30 %).', '']
JED = (nz(X['ni_1y'], 0) > 1.0) & (nz(X['rev_1y'], 9) < 0.30)
SKUP_EPS = (nz(C['akcje_3l'], 0) >= 0.09) & (nz(C['ni_3l'], 9) < 0.05)        # akcje −3 %/rok i więcej, zysk < 5 %/rok
rows = [wiersz('skok zysku > +100 % r/r przy przychodach < +30 % (1 rok)', JED, U, 12), wiersz('  pozostałe (1 rok)', ~JED & np.isfinite(X['ni_1y']), U, 12),
        wiersz('skok zysku (3 lata)', JED, U, 36), wiersz('  pozostałe (3 lata)', ~JED & np.isfinite(X['ni_1y']), U, 36),
        wiersz('wzrost EPS „ze skupu” (akcje −3 %/rok, zysk < 5 %/rok), 5 lat', SKUP_EPS, U), wiersz('  pozostałe z danymi, 5 lat', ~SKUP_EPS & np.isfinite(C['ni_3l']), U)]
L = json.load(open('/home/user/Momentum/docs/data/lista.json'))['rows']
mm_ = [json.load(open(f"/home/user/Momentum/docs/data/spolki/{r['t']}.json"))['m'] for r in L]
z15 = [m for m in mm_ if m.get('eps_next5') is not None and m['eps_next5'] >= 0.15]
z15n = [m for m in z15 if m.get('rev_cagr5') is not None and m['rev_cagr5'] < 0.05]
out += ['## Film 4: jednorazowe zyski i skup akcji a EPS (wszystkie sektory)', '', pd.DataFrame(rows).to_markdown(index=False), '',
        f'Migawka dziś (lista strony): prognoza EPS ≥ 15 % ma {len(z15)} spółek, z nich wzrost przychodów < 5 %/rok przez 5 lat: {len(z15n)} ({100 * len(z15n) / max(len(z15), 1):.0f} %; autor: 1 na 7 ≈ 14 %).', '',
        'Nietestowalne na naszych danych: trafność i optymizm prognoz analityków (brak historii prognoz), spółki z ukrytymi aktywami.', '']
open(os.path.join(HERE, 'wyniki', 'r111_etap86' + ('_test' if TEST else '') + '.md'), 'w').write('\n'.join(out)); print('\n'.join(out))
