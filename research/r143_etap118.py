"""Etap 118: wagi ogólnej oceny — warianty O0–O5, odkrywanie 2012–17, sprawdzenie 2018–23. Protokół: etap 118."""
import os
HERE = os.path.dirname(os.path.abspath(__file__))
_s113 = open(os.path.join(HERE, 'r138_etap113.py')).read()
exec(_s113[:_s113.index("print('z DCF")])
exec(_s113[_s113.index("def portfel_k("):_s113.index("nz = lambda")])
rng = np.random.default_rng(118)
nz = lambda A_, v: np.nan_to_num(A_, nan=v)
WSZ = [pd.Period(f'{y}-01', 'M') for y in range(2012, 2027)]
ODK = [m for m in WSZ if m.year <= 2017]
SPR = {36: [m for m in WSZ if 2018 <= m.year <= 2023], 60: [m for m in WSZ if 2018 <= m.year <= 2021]}
_s111 = open(os.path.join(HERE, 'r136_etap111.py')).read()
_ST0 = STARTY; STARTY = WSZ
exec(_s111[_s111.index("S111 = json.load"):_s111.index("for n in N: print")])
STARTY = _ST0
dod = lambda A_: np.where(nz(A_, -1) > 0, A_, np.nan)
GW = [('rev_1y', 1), ('rev_cagr3', 1), ('rev_cagr5', 1), ('ni_1y', 1), ('ni_5y', 1), ('rev_lata_10', 1), ('C1_lata_zysk', 1), ('przysp_przych', 1), (None, 1)]
GS = [('gm', 1), ('om', 1), ('nm', 1), ('roe', 1), ('roa', 1), ('roce', 1), ('fcf_margin', 1), ('de', -1), ('qr', 1), ('net_cash_mc', 1), ('C3_akcje_3l', 1),
      ('capex_przych', -1), ('kapital_3l', -1), (None, 1)]
GWY = [(dod(X['pe']), -1), (dod(X['peg']), -1), (dod(X['ps']), -1), (dod(X['pfcf']), -1), ('fcf_yield', 1), (POT, 1)]
GSB = GS + [(F['sga_gp'], -1), (F['capex_ni'], -1)]


def grupa(lista):
    """ocena 0–10 jak ocena.oceny: średnia percentyli, brak = 0,5 (None = miara bez historii, zawsze 0,5)"""
    out = np.full((NT, NS), np.nan)
    for m in WSZ:
        i = im_[m]; u = UNI[i]; cols = []
        for p, k in lista:
            P_ = np.full(NS, 0.5)
            if p is not None:
                v = (X[p] if isinstance(p, str) else p)[i].copy()
                if isinstance(p, str) and p == 'de': v = np.where(v >= 0, v, np.nan)
                ok = u & np.isfinite(v)
                if ok.sum() >= 20:
                    r = pd.Series(v[ok]).rank(method='average').to_numpy(); P_[ok] = (r - 0.5) / ok.sum() if k > 0 else 1 - (r - 0.5) / ok.sum()
            cols.append(P_)
        out[i, u] = 10 * np.mean(np.stack(cols), 0)[u]
    return out


W_, S_, WY, SB = grupa(GW), grupa(GS), grupa(GWY), grupa(GSB)
WAR = {'O0 obecny: 0,4 W + 0,35 S + 0,25 Wy': 0.4 * W_ + 0.35 * S_ + 0.25 * WY, 'O1: 0,6 S + 0,4 W': 0.6 * S_ + 0.4 * W_, 'O2: sama Siła': S_,
       'O3: Siła + Buffett (SB)': SB, 'O4: 0,6 SB + 0,4 W': 0.6 * SB + 0.4 * W_, 'O5: 0,5 S + 0,3 W + 0,2 Wy': 0.5 * S_ + 0.3 * W_ + 0.2 * WY}
GRUPY_ = {'Wzrost (W)': W_, 'Siła (S)': S_, 'Wycena (Wy)': WY, 'SB': SB}


def ic(A_, h, lata):
    w = []
    for m in lata:
        if m > KON[h]: continue
        i = im_[m]; ok = UNI[i] & np.isfinite(A_[i]) & np.isfinite(FW[h][i])
        if ok.sum() >= 30: w.append(pd.Series(A_[i, ok]).corr(pd.Series(FW[h][i, ok]), method='spearman'))
    return np.mean(w) if w else np.nan


def gora(A_, frac=0.2):
    S = np.zeros((NT, NS), bool)
    for m in WSZ:
        i = im_[m]; ok = np.isfinite(A_[i]) & UNI[i]
        if ok.sum() >= 20: S[i] = ok & (A_[i] >= np.percentile(A_[i, ok], 100 * (1 - frac)))
    return S


def nadw(S, h, lata):
    md = []
    for m in lata:
        if m > KON[h]: continue
        i = im_[m]; v = EX[h][i, S[i] & UNI[i] & np.isfinite(EX[h][i])]
        if len(v) >= 3: md.append(np.median(v))
    if len(md) < 3: return np.nan, np.nan, np.nan
    bs = [100 * np.mean(rng.choice(md, len(md))) for _ in range(4000)]
    return 100 * np.mean(md), *np.percentile(bs, [2.5, 97.5])


rows = []
for nm, A_ in {**GRUPY_, **WAR}.items():
    S = gora(A_); n36 = nadw(S, 36, SPR[36]); o36 = nadw(S, 36, ODK)
    rows.append({'ocena': nm, 'IC 60 odkr.': ic(A_, 60, ODK), 'IC 36 odkr.': ic(A_, 36, ODK), 'IC 60 spr.': ic(A_, 60, SPR[60]), 'IC 36 spr.': ic(A_, 36, SPR[36]),
                 'górne 20 % 36 m odkr.': f'{o36[0]:+.1f}', 'górne 20 % 36 m spr.': f'{n36[0]:+.1f} [{n36[1]:+.1f}; {n36[2]:+.1f}]', '_lo': n36[1]})
    print({k: (round(v, 3) if isinstance(v, float) else v) for k, v in rows[-1].items()}, flush=True)
T = pd.DataFrame(rows)
w = T[T.ocena.isin(WAR)].copy()
o0 = w[w.ocena.str.startswith('O0')].iloc[0]
w['spełnia'] = (w['IC 36 spr.'] > o0['IC 36 spr.']) & (w['IC 60 spr.'] > o0['IC 60 spr.']) & (w['_lo'] > 0)
naj = w.sort_values('IC 60 odkr.', ascending=False).iloc[0]
if bool(naj['spełnia']):
    wybor = naj.ocena
else:
    ok_ = w[w['spełnia']].sort_values('IC 60 odkr.', ascending=False)
    wybor = ok_.iloc[0].ocena if len(ok_) else 'O0 obecny: 0,4 W + 0,35 S + 0,25 Wy (bez zmian)'
print('WYBÓR:', wybor, flush=True)
S0 = SPY.loc[pd.Period('2012-01', 'M'):DO]; S0 = S0 / S0.iloc[0]
cs, dds, s1, s2, rs = opis(S0)
rowsP = [{'portfel top 20': 'SPY (S&P 500)', 'rocznie': f'{100 * cs:.1f} %', 'obsunięcie': f'{100 * dds:.0f} %', '2012–18': f'{100 * s1:.1f} %', '2019–26': f'{100 * s2:.1f} %', 'lata lepsze od SPY': '—'}]
for nm, A_ in WAR.items():
    s, liczba, _ = portfel_k(UNI, A_, 20)
    c, dd, h1, h2, ro = opis(s); lep = sum(1 for y in ro.index if y in rs.index and ro[y] > rs[y])
    rowsP.append({'portfel top 20': nm, 'rocznie': f'{100 * c:.1f} %', 'obsunięcie': f'{100 * dd:.0f} %', '2012–18': f'{100 * h1:.1f} %', '2019–26': f'{100 * h2:.1f} %',
                  'lata lepsze od SPY': f'{lep} z {len(ro)}'}); print(rowsP[-1], flush=True)
out = ['# Etap 118: wagi ogólnej oceny', '', 'Oceny grup odtworzone jak na stronie; IC = korelacja rang ze zwrotem; górne 20 % = mediana nadwyżki nad medianą zbioru (pp, średnio po latach, bootstrap).', '',
       T.drop(columns='_lo').round(3).to_markdown(index=False), '', f'**Spełnia warunek w sprawdzeniu:** ' + ', '.join(w[w['spełnia']].ocena) if w['spełnia'].any() else '**Żaden wariant nie spełnia warunku.**',
       '', f'**Wybór wg protokołu: {wybor}**', '', '## Portfele top 20 wg oceny (równe wagi, przegląd w styczniu, koszt 0,1 %), 2012-01 → 2026-09', '', pd.DataFrame(rowsP).to_markdown(index=False)]
open(os.path.join(HERE, 'wyniki', 'r143_etap118.md'), 'w').write('\n'.join(out) + '\n'); print('\n'.join(out))
