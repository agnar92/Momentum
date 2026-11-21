"""Etap 87: tezy z kolejnych 4 filmów — przyspieszenie przychodów, ROIC, pułapki wartości, spadki po dobrych wynikach. Protokół: etap 87."""
import os
HERE = os.path.dirname(os.path.abspath(__file__))
_s = open(os.path.join(HERE, 'r111_etap86.py')).read()
exec(_s[:_s.index('# --- F1 rentowność')])
exec(open(os.path.join(HERE, 'r19_cem10.py')).read().split('warianty = {')[0].split("p = pd.read_parquet")[0])
import duckdb
_e = duckdb.connect('/home/user/ndx/db/eodhd.duckdb', read_only=True)
_d = _e.execute("SELECT date_trunc('month', date) m, arg_max(adjusted_close, date) c FROM prices_valid WHERE ticker='SPY.US' GROUP BY 1 ORDER BY 1").df()
SPYm = pd.Series(_d.c.values, index=pd.to_datetime(_d.m).dt.to_period('M'))
A = np.full((NT, NS), np.nan); A[:-120] = Cv[120:] / Cv[:-120] - 1; FW[120] = A; KON[120] = pd.Period('2016-09', 'M')
S5 = {n: np.full((NT, NS), np.nan) for n in ('nachylenie', 'rev_nast', 'roic', 'zysk_co_rok', 'zm_zysku', 'przych_co_rok', 'ni_cagr10', 'akcje_10l')}
for j in range(NS):
    k = kod[j]
    if k not in cache: continue
    sq = cache[k]
    for m in STARTY:
        i = im_[m]
        if not U[i, j]: continue
        t = m.to_timestamp(how='end')
        if 'rev' in sq:
            e0, r0 = sq['rev'].teraz(t)
            if r0 and r0 > 0:
                lt = [sq['rev'].przy(t, e0 - n * Y) if n else r0 for n in range(6)]
                if all(v and v > 0 for v in lt):
                    g = [lt[n] / lt[n + 1] - 1 for n in range(5)][::-1]          # od najstarszego
                    S5['nachylenie'][i, j] = np.polyfit(np.arange(5), g, 1)[0]
                rn = sq['rev'].przy(t + Y + pd.Timedelta(days=200), e0 + Y)
                if rn: S5['rev_nast'][i, j] = rn / r0 - 1
                if m.year <= 2016:
                    tk = t + 11 * Y
                    rv = [sq['rev'].przy(tk, e0 + n * Y) for n in range(11)]
                    if all(v and v > 0 for v in rv): S5['przych_co_rok'][i, j] = float(all(rv[n + 1] > rv[n] for n in range(10)))
        if 'opinc' in sq and 'eq' in sq:
            eo, o0 = sq['opinc'].teraz(t); ee, eqv = sq['eq'].teraz(t)
            if o0 is not None and eqv is not None:
                db = dlug(sq['b'], t, ee, k) or 0; ca = (sq['cash'].przy(t, ee) if 'cash' in sq else 0) or 0
                ic = eqv + db - ca
                if ic > 0: S5['roic'][i, j] = o0 * 0.79 / ic
        if 'ni' in sq and m.year <= 2016:
            e1, n0 = sq['ni'].teraz(t)
            if n0 is not None:
                tk = t + 11 * Y; nv = [sq['ni'].przy(tk, e1 + n * Y) for n in range(1, 11)]
                if all(v is not None for v in nv):
                    S5['zysk_co_rok'][i, j] = float(all(v > 0 for v in nv))
                    mu = np.mean(nv); S5['zm_zysku'][i, j] = np.std(nv) / abs(mu) if mu else np.nan
                    if n0 > 0 and nv[-1] > 0: S5['ni_cagr10'][i, j] = (nv[-1] / n0) ** 0.1 - 1
        if 'sh' in sq and m.year <= 2016:
            es, s0 = sq['sh'].teraz(t, 300)
            if s0:
                s10 = sq['sh'].przy(t + 11 * Y, es + 10 * Y)
                if s10: 
                    zm = s10 * 1.0 / (s0 * podziel(k, es, es + 10 * Y)) - 1
                    if -0.8 < zm < 3: S5['akcje_10l'][i, j] = zm
print('cechy F5/F6', {n: int(np.isfinite(v).sum()) for n, v in S5.items()}, flush=True)
out = ['# Etap 87: tezy z kolejnych 4 filmów (starty w styczniu; mediana zwrotu ceny)', '']
def tab(rows): return pd.DataFrame(rows).to_markdown(index=False)
def sr(M, h, zb, okres=None):
    v = []
    for m in STARTY:
        if m > KON[h] or (okres and not (okres[0] <= m.year <= okres[1])): continue
        i = im_[m]; s = zb[i] & M[i] & np.isfinite(FW[h][i]); v += list(FW[h][i, s])
    return np.mean(v) if v else np.nan
# --- F5
ACC = nz(S5['nachylenie'], -9) > 0; R50 = nz(X['rev_cagr5'], -9) >= 1.5 ** 0.2 - 1
for nm_zb, zb in (('bez wykluczonych sektorów (cechy liczone tylko dla tego zbioru)', UNI),):
    rows = []
    for nm, M in (('wszystkie spółki', WSZ), ('przychody przyspieszają (5 lat)', ACC), ('przyspieszają + przychody 5 l. ≥ +50 %', ACC & R50), ('nie przyspieszają', np.isfinite(S5['nachylenie']) & ~ACC)):
        r = {'grupa': nm}
        for okr, a_ in (('2016–2021 (autor)', (2016, 2021)), ('2012–2021', (2012, 2021))):
            m1, n1, _ = grupa(M, 12, a_, zb); m5, n5, _ = grupa(M, 60, a_, zb)
            r[f'1 rok, {okr}'] = f'{100 * m1:+.1f} %'; r[f'5 lat, {okr}'] = f'{100 * m5:+.0f} %'
        r['5 lat średnia (2012–2021)'] = f'{100 * sr(M, 60, zb):+.0f} %'; r['obs 5 l.'] = grupa(M, 60, None, zb)[1]
        rows.append(r)
    out += [f'## Film 5: przyspieszenie przychodów — {nm_zb} (autor: 1 rok 11 vs 9 %, 5 lat 64 vs 53 %; z ≥ +50 %: 12,4 vs 8,9 % i 72,6 vs 53 %)', '', tab(rows), '']
lep = []
for s_ in sorted({x for x in SEK if x}):
    zb = UNI & (SEK == s_)[None, :]
    a, n_, _ = grupa(ACC & R50, 60, None, zb); b, _, _ = grupa(WSZ, 60, None, zb)
    if n_ >= 10: lep.append((s_, a, b, n_))
out += [f'Sektory (5 lat, przyspieszają + ≥ +50 % vs wszystkie w sektorze): lepiej w {sum(a > b for _, a, b, _ in lep)} z {len(lep)} — ' +
        '; '.join(f'{s_} {100 * a:+.0f} vs {100 * b:+.0f} % (n {n_})' for s_, a, b, n_ in lep), '']
PREV5 = np.where(np.isfinite(X['rev_cagr5']), (1 + X['rev_cagr5']) ** 5 - 1, np.nan)
rows = []
for a, b_, nm in ((-9, 0, '< 0 %'), (0, 0.25, '0–25 %'), (0.25, 0.5, '25–50 %'), (0.5, 1, '50–100 %'), (1, 99, '> 100 %')):
    v = np.concatenate([S5['rev_nast'][im_[m], np.flatnonzero(UNI[im_[m]] & (PREV5[im_[m]] >= a) & (PREV5[im_[m]] < b_) & np.isfinite(S5['rev_nast'][im_[m]]))] for m in STARTY if m <= pd.Period('2025-01', 'M')])
    rows.append({'przeszły wzrost przychodów 5 l.': nm, 'mediana wzrostu przychodów w następnym roku': f'{100 * np.median(v):+.1f} %', 'obs': len(v)})
out += ['Przeszły wzrost przychodów 5 l. → wzrost w następnym roku (bez wykluczonych sektorów, starty 2012–2025):', '', tab(rows), '']
print('F5', flush=True)
# --- F6 ROIC
Q = np.full((NT, NS), np.nan)
for m in STARTY:
    i = im_[m]; ok = UNI[i] & np.isfinite(S5['roic'][i])
    if ok.sum() > 50: Q[i, ok] = pd.qcut(pd.Series(S5['roic'][i, ok]).rank(method='first'), 5, labels=False).to_numpy()
rows = []
for q in range(5):
    M = Q == q; r = {'kwintyl ROIC': f'K{q + 1}' + (' (najniższy)' if q == 0 else ' (najwyższy)' if q == 4 else '')}
    for h, nm in ((12, '1 rok'), (36, '3 lata'), (60, '5 lat'), (120, '10 lat')):
        a, n_, _ = grupa(M, h, None, UNI); r[nm] = f'{100 * a:+.0f} %' if a == a else '–'
    def frac(A_):
        v = np.concatenate([A_[im_[m], np.flatnonzero(M[im_[m]] & UNI[im_[m]] & np.isfinite(A_[im_[m]]))] for m in STARTY if m.year <= 2016]); return v
    for nm, A_, f in (('zysk co rok 10 l.', S5['zysk_co_rok'], lambda v: f'{100 * v.mean():.0f} %'), ('zmienność zysku', S5['zm_zysku'], lambda v: f'{np.median(v):.2f}'),
                      ('przychody rosną co rok 10 l.', S5['przych_co_rok'], lambda v: f'{100 * v.mean():.0f} %'), ('CAGR zysku 10 l.', S5['ni_cagr10'], lambda v: f'{100 * np.median(v):.1f} %'),
                      ('zmiana liczby akcji 10 l.', S5['akcje_10l'], lambda v: f'{100 * np.median(v):+.0f} %')):
        v = frac(A_); r[nm] = f(v) if len(v) else '–'
    r['mediana ROIC'] = f'{100 * np.nanmedian(np.where(M & UNI, S5["roic"], np.nan)):.0f} %'
    rows.append(r)
out += ['## Film 6: ROIC — kwintyle (bez wykluczonych sektorów; 10 lat i cechy 10-letnie: starty 2012–2016) (autor: +59 pp K5 vs K1 w 10 lat, zysk co rok 74 vs 59 %, 1 na 6 rośnie co rok, akcje −17 %)', '',
        tab(rows), '']
rows = [dict(grupa=f'K{q + 1}', **{f'5 lat {o}': f'{100 * grupa(Q == q, 60, a_, UNI)[0]:+.0f} %' for o, a_ in (('2012–2016', (2012, 2016)), ('2017–2021', (2017, 2021)))}) for q in range(5)]
out += ['ROIC — połowy (5 lat):', '', tab(rows), '']
print('F6', flush=True)
# --- F7 pułapki wartości
lag12 = lambda A_: np.vstack([np.full((12, NS), np.nan), A_[:-12]])
CYK = nz(X['najgorszy_rok_przych'], 9) <= -0.10
ZWOL = CYK & (nz(X['rev_1y'], -9) > 0) & (nz(X['rev_1y'] - lag12(X['rev_1y']), 9) <= -0.10)
PB1 = nz(X['ksiegowa_rynkowa'], 0) > 1
SPAD = nz(X['od_maks_12m'], 0) <= -0.40
PEc = np.where(nz(X['pe'], -1) > 0, X['pe'], np.nan); dro, tan = np.zeros((NT, NS), bool), np.zeros((NT, NS), bool)
for m in STARTY:
    i = im_[m]; ok = UNI[i] & np.isfinite(PEc[i])
    if ok.sum() > 50:
        q1, q2 = np.percentile(PEc[i, ok], [33, 67]); dro[i] = ok & (PEc[i] >= q2); tan[i] = ok & (PEc[i] <= q1)
rows = [wiersz('cykliczne, przychody rosną, ale wzrost zwolnił ≥ 10 pp (1 rok)', ZWOL, UNI, 12), wiersz('pozostałe cykliczne (1 rok)', CYK & ~ZWOL, UNI, 12),
        wiersz('cykliczne zwalniające (3 lata)', ZWOL, UNI, 36), wiersz('pozostałe cykliczne (3 lata)', CYK & ~ZWOL, UNI, 36),
        wiersz('P/B < 1 (1 rok)', PB1, UNI, 12), wiersz('P/B ≥ 1 (1 rok)', ~PB1 & np.isfinite(X['ksiegowa_rynkowa']), UNI, 12), wiersz('P/B < 1 (5 lat)', PB1, UNI), wiersz('P/B ≥ 1 (5 lat)', ~PB1 & np.isfinite(X['ksiegowa_rynkowa']), UNI),
        wiersz('kurs −40 % od szczytu, P/E w górnej tercyli (1 rok)', SPAD & dro, UNI, 12), wiersz('kurs −40 % od szczytu, P/E w dolnej tercyli (1 rok)', SPAD & tan, UNI, 12),
        wiersz('kurs −40 %, drogie (3 lata)', SPAD & dro, UNI, 36), wiersz('kurs −40 %, tanie (3 lata)', SPAD & tan, UNI, 36)]
out += ['## Film 7: pułapki wartości (bez wykluczonych sektorów; zamiast PEG z prognozą — P/E)', '', tab(rows), '']
print('F7', flush=True)
# --- F8 spadki po dobrych wynikach: zdarzenia z dat złożenia raportów kwartalnych
SPYa = np.array([SPYm.get(m, np.nan) for m in ms])
spy_dd = np.array([SPYa[i] / np.nanmax(SPYa[max(0, i - 12):i + 1]) - 1 if np.isfinite(SPYa[i]) else np.nan for i in range(NT)])
kol = {}
for j in range(NS): kol.setdefault(kod[j], []).append(j)
ev = []
for k, js in kol.items():
    fn = f'{SZ}/sec_q/{k}.json'
    if not os.path.exists(fn): continue
    d = json.load(open(fn)) or {}
    if not d.get('rev'): continue
    q = kwartaly(d['rev']['rows']); ends = sorted(q)
    for e in ends:
        v, f = q[e]; e_ = dd(e)
        prev = [x for x in ends if abs((e_ - dd(x)).days - 365) <= 20]
        if not prev or q[prev[-1]][0] <= 0: continue
        rr = v / q[prev[-1]][0] - 1; fm = pd.Period(f[:7], 'M') - 1
        if fm not in im_ or fm < pd.Period('2012-01', 'M') or fm > pd.Period('2026-06', 'M'): continue
        i0 = im_[fm]
        for j in js:
            if not U[i0, j] or not (np.isfinite(Cv[i0, j]) and np.isfinite(Cv[i0 - 3, j]) and Cv[i0 - 3, j] > 0): continue
            def po(h):
                if i0 + h >= NT or not np.isfinite(Cv[i0 + h, j]) or not np.isfinite(SPYa[i0 + h]): return np.nan
                return (Cv[i0 + h, j] / Cv[i0, j] - 1) - (SPYa[i0 + h] / SPYa[i0] - 1)
            ev.append(dict(rr=rr, przed=Cv[i0, j] / Cv[i0 - 3, j] - 1, p1=po(1), p3=po(3), p12=po(12), strach=spy_dd[i0] <= -0.10, rok=fm.year))
E = pd.DataFrame(ev); D = E[E.rr >= 0.15]
def opis(G, c):
    x = G[c].dropna(); return f'{100 * x.median():+.1f} pp (śr. {100 * x.mean():+.1f}, n {len(x)})'
rows = [{'grupa': 'dobre wyniki (przychody kw. r/r ≥ 15 %), kurs +20 % w 3 mies. przed', '1 mies. po': opis(D[D.przed >= 0.2], 'p1'), '3 mies. po': opis(D[D.przed >= 0.2], 'p3')},
        {'grupa': 'dobre wyniki, bez takiego wzrostu przed', '1 mies. po': opis(D[D.przed < 0.2], 'p1'), '3 mies. po': opis(D[D.przed < 0.2], 'p3')},
        {'grupa': 'dobre wyniki przy rynku w strachu (SPY −10 % od szczytu)', '1 mies. po': opis(D[D.strach], 'p1'), '3 mies. po': opis(D[D.strach], 'p3'), '12 mies. po': opis(D[D.strach], 'p12')},
        {'grupa': 'dobre wyniki przy spokojnym rynku', '1 mies. po': opis(D[~D.strach], 'p1'), '3 mies. po': opis(D[~D.strach], 'p3'), '12 mies. po': opis(D[~D.strach], 'p12')}]
out += ['## Film 8: spadki po dobrych wynikach (wszystkie sektory; zdarzenie = miesiąc publikacji raportu w SEC; nadwyżka nad SPY, mediana)', '', tab(rows), '',
        'Nietestowalne: prognozy spółek (guidance), wyniki względem oczekiwań analityków.', '']
open(os.path.join(HERE, 'wyniki', 'r112_etap87.md'), 'w').write('\n'.join(out)); print('\n'.join(out))
