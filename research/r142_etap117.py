"""Etap 117: szukanie sposobu wyboru „dobra spółka w dobrej cenie” — odkrywanie 2012–2017, sprawdzenie 2018–2023. Protokół: etap 117."""
import os
HERE = os.path.dirname(os.path.abspath(__file__))
_s113 = open(os.path.join(HERE, 'r138_etap113.py')).read()
exec(_s113[:_s113.index("print('z DCF")])                        # dane, SILA, J7, POT, EX[12/36/60], test, opis
exec(_s113[_s113.index("def portfel_k("):_s113.index("nz = lambda")])
rng = np.random.default_rng(117)
nz = lambda A_, v: np.nan_to_num(A_, nan=v)
WSZ = [pd.Period(f'{y}-01', 'M') for y in range(2012, 2027)]
ODK = [m for m in WSZ if m.year <= 2017]
SPR = {36: [m for m in WSZ if 2018 <= m.year <= 2023], 60: [m for m in WSZ if 2018 <= m.year <= 2021]}
# reguły Buffetta (etap 111) dla wszystkich styczni 2012–2026
_s111 = open(os.path.join(HERE, 'r136_etap111.py')).read()
_STARTY0 = STARTY; STARTY = WSZ
exec(_s111[_s111.index("S111 = json.load"):_s111.index("for n in N: print")])
STARTY = _STARTY0
# --- cechy ---
R_, T_ = 0.10, 10


def v_b(roe0, roe_dl):
    b, v, ri = 1.0, 1.0, 0.0
    for t in range(1, T_ + 1):
        roe = roe0 + (roe_dl - roe0) * (t - 1) / (T_ - 1); ri = (roe - R_) * b; v += ri / (1 + R_) ** t; b *= 1 + roe * 0.6
    return v + ri / (R_ * (1 + R_) ** T_)


VP = np.full((NT, NS), np.nan); EE = np.full((NT, NS), np.nan); PEH = np.full((NT, NS), np.nan); IPEG = np.full((NT, NS), np.nan)
for m in WSZ:
    i = im_[m]; u = UNI[i]
    roe, bm = X['roe'][i], X['ksiegowa_rynkowa'][i]
    med = np.nanmedian(np.where(u & np.isfinite(roe), roe, np.nan))
    for j in np.flatnonzero(u):
        if np.isfinite(roe[j]) and np.isfinite(bm[j]) and bm[j] > 0: VP[i, j] = bm[j] * v_b(float(np.clip(roe[j], -0.3, 0.6)), float(med))
        om, evs = X['om'][i, j], X['ev_przych'][i, j]
        if np.isfinite(om) and np.isfinite(evs) and evs > 0: EE[i, j] = om / evs
        p0 = X['pe'][i, j]
        if np.isfinite(p0) and p0 > 0:
            h = X['pe'][max(0, i - 60):i, j]; h = h[np.isfinite(h) & (h > 0)]
            if len(h) >= 24: PEH[i, j] = p0 / np.median(h)
        pg = X['peg'][i, j]
        if np.isfinite(pg) and pg > 0: IPEG[i, j] = 1 / pg
inv = lambda A_: np.where(nz(A_, -1) > 0, 1 / np.where(nz(A_, -1) > 0, A_, 1), np.nan)
JAK = {'Siła': (SILA, 1), 'Jakość 7 (liczba)': (J7.astype(float), 1), 'ROE': (X['roe'], 1), 'ROA': (X['roa'], 1), 'ROCE': (X['roce'], 1), 'marża brutto': (X['gm'], 1),
       'marża operacyjna': (X['om'], 1), 'marża netto': (X['nm'], 1), 'marża FCF': (X['fcf_margin'], 1), 'D/E': (np.where(nz(X['de'], -1) >= 0, X['de'], np.nan), -1),
       'akcje 3 lata (jak Siła)': (X['C3_akcje_3l'], 1), 'przychody 3 lata': (X['rev_cagr3'], 1), 'przychody 5 lat': (X['rev_cagr5'], 1),
       'lata przychody > 10 %': (X['rev_lata_10'], 1), 'lata wzrostu zysku': (X['C1_lata_zysk'], 1), 'lata wysokiego ROIC': (X['C2_lata_roic'], 1),
       'zmiana ROE 3 lata': (X['d_roe_3l'], 1), 'zmienność zysku': (X['zm_zysku'], -1),
       'B: marża brutto > 40 %': (F['gm2'], 1), 'B: marża netto > 20 %': (F['nm2'], 1), 'B: EPS 4 z 5 lat': (F['eps4'], 1), 'B: skoryg. D/E < 0,8': (F['de_adj'], 1),
       'B: dług ≤ 4 × zysk': (F['dlug_ni'], 1), 'B: capex ÷ zysk': (F['capex_ni'], -1), 'B: SG&A ÷ zysk brutto': (F['sga_gp'], -1)}
WYC = {'V/P dochód rezydualny': (VP, 1), 'EBIT/EV': (EE, 1), 'potencjał DCF': (POT, 1), '1/PEG': (IPEG, 1), 'E/P': (X['stopa_zysku'], 1),
       'FCF / kapitalizacja': (X['fcf_yield'], 1), 'B/P': (X['ksiegowa_rynkowa'], 1), 'S/P': (inv(X['ps']), 1), 'sprzedaż / EV': (inv(X['ev_przych']), 1),
       'P/E vs własne 5 lat': (PEH, -1)}
MOM = {'zwrot 12-1 mies.': (X['C6_mom12_1'], 1), 'zwrot 3 lata (odwrócenie)': (X['zwrot_3l'], -1)}
CECHY = {**JAK, **WYC, **MOM}
P = {}
for nm, (A_, k) in CECHY.items():
    Pm = np.full((NT, NS), np.nan)
    for m in WSZ:
        i = im_[m]; ok = UNI[i] & np.isfinite(A_[i])
        if ok.sum() >= 20:
            r = pd.Series(A_[i, ok]).rank(method='average').to_numpy(); Pm[i, ok] = (r - 0.5) / ok.sum() if k > 0 else 1 - (r - 0.5) / ok.sum()
    P[nm] = Pm
print('pokrycie cech (średnio w styczniu):', {nm: int(np.mean([np.isfinite(P[nm][im_[m]]).sum() for m in WSZ])) for nm in P}, flush=True)
sr = lambda names: np.mean(np.stack([nz(P[n], 0.5) for n in names]), 0)
Q, V = sr(JAK), sr(WYC)
QV, QVM = (Q + V) / 2, (Q + V + nz(P['zwrot 12-1 mies.'], 0.5)) / 3
# model grzbietowy na latach odkrywania (cel: percentyl zwrotu 60 mies.)
NAZ = list(P)
def macierz(i, ok): return np.stack([nz(P[n][i, ok], 0.5) - 0.5 for n in NAZ], 1)
Xs, ys = [], []
for m in ODK:
    i = im_[m]; ok = UNI[i] & np.isfinite(FW[60][i])
    if ok.sum() < 30: continue
    Xs.append(macierz(i, ok)); r = pd.Series(FW[60][i, ok]).rank().to_numpy(); ys.append((r - 0.5) / ok.sum() - 0.5)
Xa, ya = np.vstack(Xs), np.concatenate(ys)
beta = np.linalg.solve(Xa.T @ Xa + 10 * np.eye(len(NAZ)), Xa.T @ ya)
MOD = np.full((NT, NS), np.nan)
for m in WSZ:
    i = im_[m]; ok = UNI[i]
    if ok.sum(): MOD[i, ok] = macierz(i, ok) @ beta
for A_ in (Q, V, QV, QVM): A_[~UNI] = np.nan
# --- miary ---


def ocen(S, h, lata):
    """średnia po latach mediany nadwyżki wybranych spółek; lista lat; średnio spółek"""
    med_, n_ = [], []
    for m in lata:
        if m > KON[h]: continue
        i = im_[m]; v = EX[h][i, S[i] & UNI[i] & np.isfinite(EX[h][i])]
        if len(v) >= 3: med_.append(np.median(v)); n_.append(len(v))
    return (100 * np.mean(med_) if med_ else np.nan), med_, (np.mean(n_) if n_ else 0)


def ci(med_):
    if len(med_) < 3: return np.nan, np.nan
    bs = [100 * np.mean(rng.choice(med_, len(med_))) for _ in range(4000)]
    return tuple(np.percentile(bs, [2.5, 97.5]))


def gora(A_, frac, maska=None):
    S = np.zeros((NT, NS), bool)
    for m in WSZ:
        i = im_[m]; ok = np.isfinite(A_[i]) & UNI[i] & (maska[i] if maska is not None else True)
        if ok.sum() >= 3: S[i] = ok & (A_[i] >= np.percentile(A_[i, ok], 100 * (1 - frac)))
    return S


# 1. cechy pojedynczo: średni IC (Spearman z percentylem zwrotu 60 i 36 mies.) w odkrywaniu i sprawdzeniu
def ic(A_, h, lata):
    w = []
    for m in lata:
        if m > KON[h]: continue
        i = im_[m]; ok = UNI[i] & np.isfinite(A_[i]) & np.isfinite(FW[h][i])
        if ok.sum() >= 30: w.append(pd.Series(A_[i, ok]).corr(pd.Series(FW[h][i, ok]), method='spearman'))
    return np.mean(w) if w else np.nan


rowsI = []
for nm, A_ in list(P.items()) + [('Q (jakość razem)', Q), ('V (wycena razem)', V), ('QV', QV), ('QVM', QVM), ('model (uczony 2012–17)', MOD)]:
    rowsI.append({'cecha': nm, 'grupa': 'jakość' if nm in JAK else 'wycena' if nm in WYC else 'moment' if nm in MOM else 'złożona',
                  'IC 60 m odkr.': round(ic(A_, 60, ODK), 3), 'IC 60 m spr.': round(ic(A_, 60, SPR[60]), 3),
                  'IC 36 m odkr.': round(ic(A_, 36, ODK), 3), 'IC 36 m spr.': round(ic(A_, 36, SPR[36]), 3)})
print(pd.DataFrame(rowsI).to_string(), flush=True)
# 2. kombinacje (odkrywanie)
b = lambda a, w: np.isfinite(a) & (nz(a, -1) == w)
FILTRY = {'wszystkie': UNI.copy(), 'Siła ≥ 7': nz(SILA, 0) >= 7, 'Jakość 7/7': J7 == 7, 'górne 30 % Q': gora(Q, 0.3),
          'Buffett 3+6+8': b(F['nm2'], 1) & b(F['dlug_ni'], 1) & np.isfinite(F['sga_gp']) & (nz(F['sga_gp'], 9) < 0.3)}
CENA = {'bez warunku ceny': None, **{f'tanio: {k}': P[k] for k in WYC}, 'tanio: V razem': V}
MOMF = nz(P['zwrot 12-1 mies.'], 0) >= 0.5
KOMB = {}
for fn, Fm in FILTRY.items():
    for cn, C_ in CENA.items():
        S0 = Fm & UNI if C_ is None else gora(C_, 0.3, Fm)
        for tn, S in (('', S0), (' + zwrot 12-1 w górnej połowie', S0 & MOMF)):
            KOMB[f'{fn} · {cn}{tn}'] = S
rowsK = []
for nm, S in KOMB.items():
    w60, l60, n60 = ocen(S, 60, ODK); w36, l36, _ = ocen(S, 36, ODK)
    rowsK.append({'kombinacja': nm, 'nadwyżka 60 m (odkr.)': w60, 'nadwyżka 36 m (odkr.)': w36, 'lata > 0 (60 m)': f'{sum(x > 0 for x in l60)} z {len(l60)}', 'spółek': round(n60, 1)})
K = pd.DataFrame(rowsK)
K = K[K['spółek'] >= 5].sort_values('nadwyżka 60 m (odkr.)', ascending=False)
print(K.head(20).to_string(), flush=True)
WYB = list(K.head(5)['kombinacja'])
# 3. sprawdzenie (2018–2023) — tylko wybrane z góry + 5 najlepszych z odkrywania
SPRAW = {**{f'[odkr. #{k + 1}] {n}': KOMB[n] for k, n in enumerate(WYB)},
         'górne 20 % Q (jakość)': gora(Q, 0.2), 'górne 20 % V (wycena)': gora(V, 0.2), 'górne 20 % QV': gora(QV, 0.2), 'górne 20 % QVM': gora(QVM, 0.2),
         'górne 20 % modelu': gora(MOD, 0.2), 'Siła ≥ 7 (etap 95, odniesienie)': (nz(SILA, 0) >= 7) & UNI}
rowsS = []
for nm, S in SPRAW.items():
    o60, l60, _ = ocen(S, 60, ODK); s36, ls36, n36 = ocen(S, 36, SPR[36]); s60, ls60, _ = ocen(S, 60, SPR[60]); lo, hi = ci(ls36)
    ok_ = np.isfinite(lo) and lo > 0 and np.isfinite(s60) and s60 > 0
    rowsS.append({'sposób': nm, 'odkr. 60 m': f'{o60:+.1f}', 'spr. 36 m': f'{s36:+.1f} [{lo:+.1f}; {hi:+.1f}]', 'spr. 60 m': f'{s60:+.1f}',
                  'lata > 0 (spr. 36 m)': f'{sum(x > 0 for x in ls36)} z {len(ls36)}', 'spółek': round(n36, 1), 'działa': 'tak' if ok_ else ''})
    print(rowsS[-1], flush=True)
# 4. portfele top 20
S = SPY.loc[pd.Period('2012-01', 'M'):DO]; S = S / S.iloc[0]
cs, dds, s1, s2, rs = opis(S)
rowsP = [{'portfel': 'SPY (S&P 500)', 'rocznie': f'{100 * cs:.1f} %', 'obsunięcie': f'{100 * dds:.0f} %', '2012–18': f'{100 * s1:.1f} %', '2019–26': f'{100 * s2:.1f} %', 'lata lepsze od SPY': '—'}]
PORT = {'Q — top 20 jakości': (UNI, Q), 'QV — top 20 jakość + wycena': (UNI, QV), 'QVM — top 20 jakość + wycena + moment': (UNI, QVM),
        'model — top 20': (UNI, MOD), 'V — top 20 wyceny': (UNI, V), 'Siła ≥ 7 — top 20 wg QV': ((nz(SILA, 0) >= 7), QV)}
for k, n in enumerate(WYB[:3]):
    PORT[f'odkr. #{k + 1} — top 20 wg QV: {n}'] = (KOMB[n], QV)
for nm, (M, kl) in PORT.items():
    s, liczba, _ = portfel_k(M, np.where(np.isfinite(kl), kl, np.nan), 20)
    c, dd, h1, h2, ro = opis(s); lep = sum(1 for y in ro.index if y in rs.index and ro[y] > rs[y])
    rowsP.append({'portfel': nm, 'rocznie': f'{100 * c:.1f} %', 'obsunięcie': f'{100 * dd:.0f} %', '2012–18': f'{100 * h1:.1f} %', '2019–26': f'{100 * h2:.1f} %',
                  'lata lepsze od SPY': f'{lep} z {len(ro)}'})
    print(rowsP[-1], flush=True)
waga = pd.Series(beta, index=NAZ).sort_values()
out = ['# Etap 117: dobra spółka w dobrej cenie — odkrywanie 2012–2017, sprawdzenie 2018–2023', '',
       'Nadwyżka = mediana zwrotu wybranych spółek minus mediana zbioru (top 500 USA PIT bez wykluczonych sektorów), średnia po latach startu, w punktach procentowych.', '',
       '## 1. Cechy pojedynczo — korelacja rang z przyszłym zwrotem (IC)', '', pd.DataFrame(rowsI).to_markdown(index=False), '',
       '## 2. Kombinacje — 20 najlepszych w latach odkrywania (z ' + str(len(K)) + ')', '', K.head(20).round(1).to_markdown(index=False), '',
       '## 3. Sprawdzenie na latach 2018–2023 (nieoglądanych przy wyborze)', '', pd.DataFrame(rowsS).to_markdown(index=False), '',
       '## 4. Portfele top 20 (równe wagi, przegląd w styczniu, koszt 0,1 %), 2012-01 → 2026-09', '', pd.DataFrame(rowsP).to_markdown(index=False), '',
       '## Wagi modelu (uczony 2012–2017)', '', waga.round(3).to_frame('waga').to_markdown()]
open(os.path.join(HERE, 'wyniki', 'r142_etap117.md'), 'w').write('\n'.join(out) + '\n'); print('\n'.join(out[-3:]))
