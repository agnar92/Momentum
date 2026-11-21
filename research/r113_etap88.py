"""Etap 88: bootstrap blokowy po latach startowych dla spornych tez autora. Protokół: etap 88."""
import os
HERE = os.path.dirname(os.path.abspath(__file__))
_s = open(os.path.join(HERE, 'r112_etap87.py')).read()
exec(_s[:_s.index("out = ['# Etap 87")])
rng = np.random.default_rng(88)
# grupy (jak w etapach 86–87)
R1 = nz(X['roe'], -9) >= 0.15; R2 = R1 & (nz(X['roa'], -9) >= 0.10); R3 = R2 & (nz(X['d_roe_3l'], -9) > 0); R4 = R3 & (nz(X['roce'], -9) >= 0.30)
P1 = nz(C['ocf_dlug'], -9) >= 0.30; P2 = P1 & (nz(C['capex_ocf'], 9) < 0.35); P3 = P2 & (nz(C['skup_mc'], -9) > 0.02); P4 = P3 & (nz(C['fcf_akt'], -9) > 0.12)
Q = np.full((NT, NS), np.nan)
for m in STARTY:
    i = im_[m]; ok = UNI[i] & np.isfinite(S5['roic'][i])
    if ok.sum() > 50: Q[i, ok] = pd.qcut(pd.Series(S5['roic'][i, ok]).rank(method='first'), 5, labels=False).to_numpy()
CYK = nz(X['najgorszy_rok_przych'], 9) <= -0.10
PEc = np.where(nz(X['pe'], -1) > 0, X['pe'], np.nan); lo, hi = np.zeros((NT, NS), bool), np.zeros((NT, NS), bool)
for m in STARTY:
    i = im_[m]; ok = CYK[i] & UNI[i] & np.isfinite(PEc[i])
    if ok.sum() > 9:
        q1, q2 = np.percentile(PEc[i, ok], [33, 67]); lo[i] = ok & (PEc[i] <= q1); hi[i] = ok & (PEc[i] >= q2)
WOLN = (nz(X['rev_cagr5'], 9) < 0.08) & (nz(C['dyw'], 0) == 1)
ACC = nz(S5['nachylenie'], -9) > 0
POR = [('ROIC K5 vs K1, 5 lat', Q == 4, Q == 0, 60, None, 'sporna'), ('ROIC K5 vs K1, 10 lat', Q == 4, Q == 0, 120, 59.0, 'sporna'),
       ('FCF > 12 % aktywów: P1–P4 vs odpadłe na P4', P4, P3 & ~P4, 60, 4.0, 'sporna'),
       ('cykliczne: niskie vs wysokie P/E (tercyle)', lo, hi, 60, None, 'sporna'), ('wolno rosnące: P/E ≤ 18 vs > 25', WOLN & (nz(PEc, 99) <= 18), WOLN & (nz(PEc, 0) > 25), 60, None, 'sporna'),
       ('ROCE ≥ 30 %: R1–R4 vs odpadłe na R4', R4, R3 & ~R4, 60, 14.0, 'sporna'),
       ('ROA ≥ 10 %: R1–R2 vs odpadłe na R2', R2, R1 & ~R2, 60, 16.0, 'kontrolna'), ('OCF ≥ 30 % długu: P1 vs odpadłe', P1, np.isfinite(C['ocf_dlug']) & ~P1, 60, 26.0, 'kontrolna'),
       ('przychody przyspieszają vs nie', ACC, np.isfinite(S5['nachylenie']) & ~ACC, 60, None, 'kontrolna')]
KIER = {'cykliczne: niskie vs wysokie P/E (tercyle)': '< 0 (pułapka)', 'wolno rosnące: P/E ≤ 18 vs > 25': '> 0', 'ROIC K5 vs K1, 5 lat': '> 0', 'przychody przyspieszają vs nie': '> 0 (64 vs 53 względem wszystkich)'}
rows = []
for nm, A_, B_, h, autor, typ in POR:
    lata = [m for m in STARTY if m <= KON[h]]
    pa = {m: FW[h][im_[m], np.flatnonzero(A_[im_[m]] & UNI[im_[m]] & np.isfinite(FW[h][im_[m]]))] for m in lata}
    pb = {m: FW[h][im_[m], np.flatnonzero(B_[im_[m]] & UNI[im_[m]] & np.isfinite(FW[h][im_[m]]))] for m in lata}
    d0 = 100 * (np.median(np.concatenate(list(pa.values()))) - np.median(np.concatenate(list(pb.values()))))
    bs = []
    for _ in range(2000):
        w = rng.choice(len(lata), len(lata), replace=True)
        a = np.concatenate([pa[lata[k]] for k in w]); b = np.concatenate([pb[lata[k]] for k in w])
        if len(a) and len(b): bs.append(100 * (np.median(a) - np.median(b)))
    lo_, hi_ = np.percentile(bs, [2.5, 97.5])
    if autor is not None:
        w_ = 'zgodne z autorem' if lo_ <= autor <= hi_ and (lo_ > 0 or hi_ < 0) else 'nasze dane nie rozstrzygają' if lo_ <= autor <= hi_ else 'sprzeczne z autorem'
    else:
        k_ = KIER.get(nm, '')
        if k_.startswith('< 0'): w_ = 'zgodne z autorem' if hi_ < 0 else 'sprzeczne z autorem' if lo_ > 0 else 'nasze dane nie rozstrzygają'
        else: w_ = 'zgodne z autorem' if lo_ > 0 else 'sprzeczne z autorem' if hi_ < 0 else 'nasze dane nie rozstrzygają'
    rows.append({'porównanie': nm, 'typ': typ, 'nasza różnica (pp)': f'{d0:+.0f}', '95 % przedział (pp)': f'{lo_:+.0f} … {hi_:+.0f}', 'starty': len(lata),
                 'autor': f'{autor:+.0f}' if autor is not None else KIER.get(nm, '–'), 'werdykt': w_})
    print(nm, flush=True)
out = ['# Etap 88: bootstrap blokowy po latach startowych (B = 2000) dla spornych tez autora', '',
       'Różnica median zwrotu ceny (grupa A − grupa B, pp); przedział 95 % z losowania lat startowych ze zwracaniem. Werdykt: „zgodne” — przedział zawiera wartość autora / ma jego znak i '
       'wyklucza 0; „nie rozstrzygają” — przedział zawiera 0; „sprzeczne” — przedział nie zawiera wartości autora i przeczy kierunkowi.', '', pd.DataFrame(rows).to_markdown(index=False), '']
open(os.path.join(HERE, 'wyniki', 'r113_etap88.md'), 'w').write('\n'.join(out)); print('\n'.join(out))
