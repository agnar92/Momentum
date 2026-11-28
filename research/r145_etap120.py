"""Etap 120: strategia z filmu „Zawód Inwestor” — skaner (odpowiednik z historii), momentum, model scoringowy, koncentracja w sektorze. Protokół: etap 120."""
import os
HERE = os.path.dirname(os.path.abspath(__file__))
_s113 = open(os.path.join(HERE, 'r138_etap113.py')).read()
exec(_s113[:_s113.index("print('z DCF")])
exec(_s113[_s113.index("def portfel_k"):_s113.index("POL = {")])
exec(_s113[_s113.index("POL = {"):_s113.index("D10 = ")])
rng = np.random.default_rng(120)
nz = lambda A_, v: np.nan_to_num(A_, nan=v)
WSZ = [pd.Period(f'{y}-01', 'M') for y in range(2012, 2027)]
_s111 = open(os.path.join(HERE, 'r136_etap111.py')).read()
_ST0 = STARTY; STARTY = [m for m in WSZ if m.year <= 2023]
exec(_s111[_s111.index("S111 = json.load"):_s111.index("for n in N: print")])
STARTY = _ST0
# --- cechy skanera: dług ÷ aktywa, przepływy operacyjne ÷ dług, zysk operacyjny ÷ odsetki ---
DA = np.full((NT, NS), np.nan); CFD = np.full((NT, NS), np.nan); ICV = np.full((NT, NS), np.nan)
for j in range(NS):
    k = kod[j]
    if k not in cache or k not in ROK: continue
    sq, R_, s1 = cache[k], ROK[k], S111.get(k) or {}
    ods = rocz(s1.get('ods'))
    for m in WSZ:
        i = im_[m]
        if not UNI[i, j]: continue
        t = m.to_timestamp(how='end')
        zn = [z for z in (sq.get('ni_a') or []) if z[2] <= t]
        if not zn or (t - zn[-1][0]).days > 450: continue
        e0 = zn[-1][0]
        db = dlug(sq['b'], t, e0, k) if sq.get('b') else None
        av = sq['as'].przy(t, e0) if 'as' in sq else None
        op = sq['opinc'].przy(t, e0) if 'opinc' in sq else None
        iv = przy_rok(ods, e0, t)
        fa = [z for z in R_['fc'] if z[3] <= t]
        if db is not None and av and av > 0: DA[i, j] = db / av
        if fa and (t - fa[-1][0]).days <= 450 and db is not None:
            ocf = fa[-1][1]; CFD[i, j] = (ocf / db if ocf > 0 else 0.0) if db > 0 else (99.0 if ocf > 0 else 0.0)
        if op is not None:
            if iv is None and db is not None and db <= 0: iv = 0.0
            if iv is not None: ICV[i, j] = 99.0 if iv == 0 else op / abs(iv)
cr = X['current_ratio']; g5 = X['rev_cagr5']; n5 = np.where(np.isfinite(X['ni_5y']) & (X['ni_5y'] > -1), np.power(1 + np.where(np.isfinite(X['ni_5y']), X['ni_5y'], 0), 0.2) - 1, np.nan)
WAR = {'dług ÷ aktywa ≤ 50 %': np.isfinite(DA) & (DA <= 0.5), 'przepływy operacyjne ÷ dług ≥ 40 % (lub brak długu)': np.isfinite(CFD) & (CFD >= 0.4),
       'zysk operacyjny ÷ odsetki > 2': np.isfinite(ICV) & (ICV > 2), 'current ratio > 1': np.isfinite(cr) & (cr > 1),
       'przychody 5 lat ≥ 8 %/rok': np.isfinite(g5) & (g5 >= 0.08), 'zysk netto 5 lat ≥ 8 %/rok': np.isfinite(n5) & (n5 >= 0.08)}
DAN = {'dług ÷ aktywa ≤ 50 %': np.isfinite(DA), 'przepływy operacyjne ÷ dług ≥ 40 % (lub brak długu)': np.isfinite(CFD), 'zysk operacyjny ÷ odsetki > 2': np.isfinite(ICV),
       'current ratio > 1': np.isfinite(cr), 'przychody 5 lat ≥ 8 %/rok': np.isfinite(g5), 'zysk netto 5 lat ≥ 8 %/rok': np.isfinite(n5)}
L = list(WAR.values())
S_FULL = np.logical_and.reduce(L) & UNI
S_REV = np.logical_and.reduce(L[:5]) & UNI
print('pula S w styczniu:', {m.year: int(S_FULL[im_[m]].sum()) for m in WSZ}, flush=True)
print('pula S-przychody:', {m.year: int(S_REV[im_[m]].sum()) for m in WSZ}, flush=True)
MOM = np.full((NT, NS), np.nan)
for m in WSZ:
    i = im_[m]
    if i >= 12: MOM[i] = Cv[i] / Cv[i - 12] - 1
KON[60] = pd.Period('2021-09', 'M')
STARTY_T = [m for m in WSZ if m.year <= 2023]


def porown(A_, B_, nazwa, wiersze, uwagi=''):
    for h in (12, 36, 60):
        na, nb, d0, lo, hi = test(A_, B_, h); p1, p2 = polowy(A_, B_, h)
        wiersze.append({'grupa': nazwa, 'horyzont': f'{h} mies.', 'n': f'{na}/{nb}', 'różnica (pp)': f'{d0:+.1f} [{lo:+.1f}; {hi:+.1f}]', 'połowy': f'{p1:+.1f} / {p2:+.1f}',
                        'działa': 'tak' if h >= 36 and lo > 0 and p1 > 0 and p2 > 0 else ''})
        print(wiersze[-1], flush=True)


rowsS = []
for nm, W_ in WAR.items():
    ok = DAN[nm] & UNI
    porown(ok & W_, ok & ~W_, f'warunek: {nm}', rowsS)
anyd = np.logical_and.reduce(list(DAN.values())[:5]) & UNI
porown(S_REV & anyd, anyd & ~S_REV, 'pula S-przychody (5 warunków) vs reszta z danymi', rowsS)
anyf = np.logical_and.reduce(list(DAN.values())) & UNI
porown(S_FULL & anyf, anyf & ~S_FULL, 'pula S (6 warunków) vs reszta z danymi', rowsS)
rowsM = []
okm = UNI & np.isfinite(MOM)
porown(okm & (MOM >= 0.20), okm & (MOM < 0.20), 'momentum 12 mies. ≥ +20 % (cały zbiór)', rowsM)
porown(S_FULL & okm & (MOM >= 0.20), S_FULL & okm & (MOM < 0.20), 'momentum ≥ +20 % w puli S', rowsM)
porown(S_REV & okm & (MOM >= 0.20), S_REV & okm & (MOM < 0.20), 'momentum ≥ +20 % w puli S-przychody', rowsM)
# --- koncentracja w sektorze ---
LID = np.zeros((NT, NS), bool); SEKLID = {}
for m in WSZ:
    i = im_[m]; ok = UNI[i] & np.isfinite(MOM[i]); best, bm = None, -9
    for s_ in set(np.asarray(SEK)[ok]):
        msk = ok & (np.asarray(SEK) == s_)
        if msk.sum() >= 12:
            md = float(np.median(MOM[i, msk]))
            if md > bm: best, bm = s_, md
    if best is not None: LID[i] = UNI[i] & (np.asarray(SEK) == best); SEKLID[m.year] = (best, round(100 * bm))
print('sektor-lider (mediana momentum):', SEKLID, flush=True)
rowsK = []
porown(LID & UNI, UNI & ~LID & np.isin(np.arange(NT), [im_[m] for m in WSZ])[:, None], 'sektor z najwyższym momentum vs reszta', rowsK)


# --- model scoringowy w puli, portfele ---
def pc(v, ok, hi=True):
    P = np.full(NS, 0.5); idx = np.flatnonzero(ok & np.isfinite(v))
    if len(idx) >= 5:
        r = pd.Series(v[idx]).rank(method='average').to_numpy(); p = (r - 0.5) / len(idx); P[idx] = p if hi else 1 - p
    return P


def wyniki_modelu(POOL):
    SC = {}
    for m in WSZ:
        i = im_[m]; ok = POOL[i]
        if ok.sum() < 10: continue
        pe_ = np.where(nz(X['pe'][i], -1) > 0, X['pe'][i], np.nan); ps_ = np.where(nz(X['ps'][i], -1) > 0, X['ps'][i], np.nan)
        wart = (np.where(np.isfinite(pe_), pc(pe_, ok, False), np.where(np.isfinite(X['pe'][i]), 0.0, 0.5)) + pc(ps_, ok, False)) / 2
        wzr = (pc(X['rev_cagr3'][i], ok) + pc(X['rev_cagr5'][i], ok) + pc(X['ni_1y'][i], ok)) / 3
        bez = (pc(X['roce'][i], ok) + pc(X['qr'][i], ok) + pc(np.where(nz(X['de'][i], -1) >= 0, X['de'][i], np.nan), ok, False) + pc(np.minimum(CFD[i], 5.0), ok)) / 4
        sc = 0.25 * pc(MOM[i], ok) + 0.15 * wart + 0.30 * wzr + 0.30 * bez
        SC[m.year] = {int(j): float(sc[j]) for j in np.flatnonzero(ok)}
    return SC


def wybor(SC, histereza):
    SEL, held = {}, []
    for r in LATA:
        if r not in SC: SEL[r] = []; held = []; continue
        rank = sorted(SC[r], key=lambda j: -SC[r][j]); top15 = set(rank[:15])
        keep = [j for j in held if j in top15] if histereza else []
        fill = [j for j in rank if j not in keep][:8 - len(keep)]
        held = keep + fill; SEL[r] = held
    return SEL


def portfel_sel(SEL):
    wart, liczba, pop = [1.0], [], set()
    for r in LATA:
        m0 = pd.Period(f'{r}-01', 'M'); i0 = im_[m0]
        kand = [j for j in SEL.get(r, []) if np.isfinite(Cv[i0, j]) and Cv[i0, j] > 0]
        liczba.append(len(kand)); nowe = set(kand)
        obrot = 1.0 if not pop else (len(nowe - pop) / max(1, len(nowe)) if nowe else 1.0)
        v = wart[-1] * (1 - KOSZT * 2 * obrot); pop = nowe
        konc = min(pd.Period(f'{r + 1}-01', 'M'), DO); okres = pd.period_range(m0 + 1, konc, freq='M')
        if kand:
            q = {j: v / len(kand) / Cv[i0, j] for j in kand}
            for mm in okres:
                tot = 0.0
                for j, qq in q.items():
                    kol = Cv[im_[m0]:im_[mm] + 1, j]; okk = np.flatnonzero(np.isfinite(kol) & (kol > 0)); tot += qq * kol[okk[-1]]
                wart.append(tot)
        else:
            for mm in okres: wart.append(v * SPY[mm] / SPY[m0])
        if konc >= DO: break
    return pd.Series(wart, index=[pd.Period('2012-01', 'M')] + list(pd.period_range('2012-02', DO, freq='M'))[:len(wart) - 1]), liczba


S0 = SPY.loc[pd.Period('2012-01', 'M'):DO]; S0 = S0 / S0.iloc[0]
cs, dds, s1, s2, rs = opis(S0)
rowsP = [{'portfel': 'SPY (S&P 500)', 'rocznie': f'{100 * cs:.1f} %', 'obsunięcie': f'{100 * dds:.0f} %', '2012–18': f'{100 * s1:.1f} %', '2019–26': f'{100 * s2:.1f} %', 'bije SPY w obu połowach': '—', 'spółek': '—'}]
sU, lU, _ = portfel_k(UNI, np.where(UNI, 0.0, np.nan), None)
c, dd, h1, h2, ro = opis(sU)
rowsP.append({'portfel': 'Równe wagi całego zbioru', 'rocznie': f'{100 * c:.1f} %', 'obsunięcie': f'{100 * dd:.0f} %', '2012–18': f'{100 * h1:.1f} %', '2019–26': f'{100 * h2:.1f} %',
              'bije SPY w obu połowach': 'tak' if h1 > s1 and h2 > s2 else 'nie', 'spółek': f'{np.mean(lU):.0f}'})
for pn, POOL in (('S', S_FULL), ('S-przychody', S_REV)):
    SC = wyniki_modelu(POOL)
    for nm, SEL in ((f'P1 film: top 8, wymiana poza top 15 · {pn}', wybor(SC, True)), (f'P2 top 8 co roku · {pn}', wybor(SC, False)),
                    (f'P3 cała pula {pn}, równe wagi', {r: list(SC[r]) for r in SC})):
        s, lc = portfel_sel(SEL); c, dd, h1, h2, ro = opis(s)
        rowsP.append({'portfel': nm, 'rocznie': f'{100 * c:.1f} %', 'obsunięcie': f'{100 * dd:.0f} %', '2012–18': f'{100 * h1:.1f} %', '2019–26': f'{100 * h2:.1f} %',
                      'bije SPY w obu połowach': 'tak' if h1 > s1 and h2 > s2 else 'nie', 'spółek': f'{np.mean(lc):.0f}'})
        print(rowsP[-1], flush=True)
out = ['# Etap 120: strategia z filmu „Zawód Inwestor” (odpowiedniki z danych historycznych)', '',
       'Top 500 USA PIT bez wykluczonych sektorów, starty w styczniu 2012–2023; nadwyżka nad medianą zbioru. Brak historycznych prognoz → przeszły wzrost i momentum zamiast prognoz.', '',
       '## 1. Skaner: warunki osobno i razem', '', pd.DataFrame(rowsS).to_markdown(index=False), '', '## 2. Momentum 12 mies. ≥ +20 %', '', pd.DataFrame(rowsM).to_markdown(index=False), '',
       '## 3. Koncentracja w sektorze z najwyższym momentum', '', pd.DataFrame(rowsK).to_markdown(index=False), '', f'Sektory-liderzy: {SEKLID}', '',
       '## 4. Portfele (równe wagi, przegląd w styczniu, koszt 0,1 %), 2012-01 → 2026-09', '', pd.DataFrame(rowsP).to_markdown(index=False)]
open(os.path.join(HERE, 'wyniki', 'r145_etap120.md'), 'w').write('\n'.join(out) + '\n'); print('\n'.join(out[-8:]))
