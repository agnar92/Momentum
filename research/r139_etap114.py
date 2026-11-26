"""Etap 114: model dochodu rezydualnego (V/P) i EBIT/EV — czy wycena przewiduje zwroty w długim okresie. Protokół: etap 114."""
import os
HERE = os.path.dirname(os.path.abspath(__file__))
_s113 = open(os.path.join(HERE, 'r138_etap113.py')).read()
exec(_s113[:_s113.index("print('z DCF")])
exec(_s113[_s113.index("def portfel_k("):_s113.index("nz = lambda")])
exec(_s113[_s113.index("POL = {"):_s113.index("D10 = ")])
rng = np.random.default_rng(114)
nz = lambda A_, v: np.nan_to_num(A_, nan=v)
ZDR = (nz(X['fcf_margin'], -1) > 0) & (nz(X['de'], 9) >= 0) & (nz(X['de'], 9) < 1)
R_, T_ = 0.10, 10


def v_b(roe0, roe_dl):
    """V/B modelu dochodu rezydualnego: ROE liniowo od roe0 do roe_dl w 10 lat, wypłata 40 %, po 10 latach renta bez wzrostu."""
    b, v, ri = 1.0, 1.0, 0.0
    for t in range(1, T_ + 1):
        roe = roe0 + (roe_dl - roe0) * (t - 1) / (T_ - 1)
        ri = (roe - R_) * b
        v += ri / (1 + R_) ** t
        b *= 1 + roe * 0.6
    return v + ri / (R_ * (1 + R_) ** T_)


VP = np.full((NT, NS), np.nan); EE = np.full((NT, NS), np.nan); GB = np.full((NT, NS), np.nan)
for m in STARTY:
    i = im_[m]; u = UNI[i]
    roe, bm, om, evs, roce = X['roe'][i], X['ksiegowa_rynkowa'][i], X['om'][i], X['ev_przych'][i], X['roce'][i]
    med = np.nanmedian(np.where(u & np.isfinite(roe), roe, np.nan))
    for j in np.flatnonzero(u):
        if np.isfinite(roe[j]) and np.isfinite(bm[j]) and bm[j] > 0:
            VP[i, j] = bm[j] * v_b(float(np.clip(roe[j], -0.3, 0.6)), float(med))
        if np.isfinite(om[j]) and np.isfinite(evs[j]) and evs[j] > 0:
            EE[i, j] = om[j] / evs[j]
    ok = u & np.isfinite(EE[i]) & np.isfinite(roce)
    if ok.sum() > 50:   # Greenblatt: suma miejsc (wyżej = lepiej), zapisane jako ujemna suma
        idx = np.flatnonzero(ok)
        r1 = pd.Series(EE[i, idx]).rank(ascending=False).values; r2 = pd.Series(roce[idx]).rank(ascending=False).values
        GB[i, idx] = -(r1 + r2)
    print(m, 'mediana ROE', round(float(med), 3), 'V/P n', int(np.isfinite(VP[i]).sum()), 'mediana V/P', round(float(np.nanmedian(VP[i])), 2),
          'EBIT/EV n', int(np.isfinite(EE[i]).sum()), 'mediana', round(float(np.nanmedian(EE[i])), 3), flush=True)

CECHY = {'V/P (dochód rezydualny)': VP, 'EBIT/EV': EE, 'Greenblatt (EBIT/EV + ROCE)': GB}


def grupy(K, gora, dol=None, pula=None):
    A_ = np.zeros((NT, NS), bool); B_ = np.zeros((NT, NS), bool)
    for m in STARTY:
        i = im_[m]; ok = np.isfinite(K[i]) & UNI[i] & (pula[i] if pula is not None else True)
        if ok.sum() < 30: continue
        v = K[i]; pg = np.nanpercentile(v[ok], 100 - gora)
        A_[i] = ok & (v >= pg)
        B_[i] = ok & (v <= np.nanpercentile(v[ok], dol)) if dol else ok & (v < pg)
    return A_, B_


rowsC = []
for nm, K in CECHY.items():
    for opis_, gora, dol, pula in (('górne 10 % vs reszta', 10, None, None), ('kwintyl 5 vs 1', 20, 20, None),
                                   ('górne 20 % vs reszta, wśród FCF > 0 i D/E < 1', 20, None, ZDR)):
        A_, B_ = grupy(K, gora, dol, pula)
        for h in (12, 36, 60):
            na, nb, d0, lo, hi = test(A_, B_, h); p1, p2 = polowy(A_, B_, h)
            rowsC.append({'model': nm, 'porównanie': opis_, 'horyzont': f'{h} mies.', 'n': f'{na}/{nb}', 'różnica nadwyżki (pp)': f'{d0:+.1f} [{lo:+.1f}; {hi:+.1f}]',
                          'połowy': f'{p1:+.1f} / {p2:+.1f}', 'potwierdzone': 'tak' if h >= 36 and lo > 0 and p1 > 0 and p2 > 0 else ''})
            print(rowsC[-1], flush=True)

S = SPY.loc[pd.Period('2012-01', 'M'):DO]; S = S / S.iloc[0]
cs, dds, s1, s2, rs = opis(S)
rows = [{'portfel': 'SPY (S&P 500)', 'rocznie': f'{100 * cs:.1f} %', '10 tys. →': f'{10000 * S.iloc[-1]:,.0f}'.replace(',', ' '), 'obsunięcie': f'{100 * dds:.0f} %',
         '2012–18': f'{100 * s1:.1f} %', '2019–26': f'{100 * s2:.1f} %', 'lata lepsze od SPY': '—', 'spółek': '—'}]
SKL = {}
for nm, M, kl, n in [('Równe wagi całego zbioru', UNI, np.where(UNI, 0.0, np.nan), None)] + \
        [(f'top {n_} {c}{" (FCF > 0, D/E < 1)" if p_ is ZDR else ""}', p_, K, n_) for c, K in CECHY.items() for p_ in (UNI, ZDR) for n_ in (10, 30)]:
    s, liczba, sk = portfel_k(M, kl, n); SKL[nm] = sk
    c, dd, h1, h2, ro = opis(s)
    lep = sum(1 for y in ro.index if y in rs.index and ro[y] > rs[y])
    rows.append({'portfel': nm, 'rocznie': f'{100 * c:.1f} %', '10 tys. →': f'{10000 * s.iloc[-1]:,.0f}'.replace(',', ' '), 'obsunięcie': f'{100 * dd:.0f} %',
                 '2012–18': f'{100 * h1:.1f} %', '2019–26': f'{100 * h2:.1f} %', 'lata lepsze od SPY': f'{lep} z {len(ro)}', 'spółek': f'{np.mean(liczba):.0f}'})
    print(rows[-1], flush=True)

out = ['# Etap 114: model dochodu rezydualnego (V/P) i EBIT/EV', '', 'Top 500 USA PIT bez wykluczonych sektorów, starty w styczniu 2012–2023; nadwyżka nad medianą zbioru,'
       ' bootstrap po latach startu; „potwierdzone” = 36/60 mies., przedział bez 0 i obie połowy dodatnie.', '',
       pd.DataFrame(rowsC).to_markdown(index=False), '', '## Portfele (równe wagi, przegląd w styczniu, koszt 0,1 % obrotu, 2012-01 → 2026-09)', '',
       pd.DataFrame(rows).to_markdown(index=False), '', '## Skład top 10 (ticker, wartość cechy × 100)', '']
for nm in ('top 10 V/P (dochód rezydualny)', 'top 10 EBIT/EV'):
    out += [f'### {nm}', ''] + [f'- {r}: ' + ', '.join(f'{t} {p:+d}' for t, p in v) for r, v in SKL[nm].items()] + ['']
open(os.path.join(HERE, 'wyniki', 'r139_etap114.md'), 'w').write('\n'.join(out) + '\n'); print('\n'.join(out))
