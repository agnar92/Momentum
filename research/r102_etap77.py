"""Etap 77: ocena z percentylami w całym zbiorze (z cechami etapu 76) vs w sektorze; flaga SPADEK (2 lata z rzędu); spółki silne i stabilne. Protokół: etap 77."""
import os
HERE = os.path.dirname(os.path.abspath(__file__))
_s = open(os.path.join(HERE, 'r101_etap76.py')).read()
exec(_s[:_s.index('# --- ocena jak na stronie ---')].replace("if not TEST: np.savez_compressed", "if False: np.savez_compressed"))
_a = _s.index('# --- zwroty naprzód'); exec(_s[_a:_s.index('out = [', _a)])
GRUPY = {'wzrost': [('rev_1y', 1), ('rev_cagr3', 1), ('rev_cagr5', 1), ('ni_1y', 1), ('ni_5y', 1), ('rev_lata_10', 1), ('C1_lata_zysk', 1)],
         'sila': [('gm', 1), ('om', 1), ('nm', 1), ('roe', 1), ('roa', 1), ('roce', 1), ('fcf_margin', 1), ('de', -1), ('qr', 1), ('net_cash_mc', 1), ('C3_akcje_3l', 1)],
         'wycena': [('pe', -1), ('peg', -1), ('ps', -1), ('pfcf', -1), ('fcf_yield', 1)]}
DOD = {'pe', 'peg', 'ps', 'pfcf'}


def oceny(w_sektorze):
    PCT = {}
    for gr, pola in GRUPY.items():
        for p, kier in pola:
            P = np.full((NT, NS), np.nan)
            for m in MI:
                i = im_[m]; v = X[p][i].copy(); ok = UNI[i] & np.isfinite(v)
                if p in DOD: ok &= v > 0
                if p == 'de': ok &= v >= 0
                if ok.sum() < 20: continue
                df = pd.DataFrame({'v': v[ok], 's': SEK[ok] if w_sektorze else 'x'}); gb = df.groupby('s').v
                r = gb.rank(method='average'); n = gb.transform('count'); pc = ((r - 0.5) / n).where(n >= 5)
                P[i, np.flatnonzero(ok)] = pc.to_numpy() if kier > 0 else 1 - pc.to_numpy()
            PCT[p] = P
    O = {}
    for gr, pola in GRUPY.items():
        A = np.stack([PCT[p] for p, _ in pola]); n_ = np.isfinite(A).sum(0)
        O[gr] = np.where(n_ >= 2, 10 * (np.nansum(A, 0) + 0.5 * (len(pola) - n_)) / len(pola), np.nan)
    T_ = np.zeros((NT, NS)); W_ = np.zeros((NT, NS))
    for a, wg in ((O['wzrost'], 0.4), (O['sila'], 0.35), (O['wycena'], 0.25)):
        f = np.isfinite(a); T_ += np.where(f, a * wg, 0); W_ += np.where(f, wg, 0)
    ok = np.isfinite(O['wzrost']) & (np.isfinite(O['sila']) | np.isfinite(O['wycena'])) & (W_ > 0)
    O['ogolna'] = np.where(ok, T_ / np.where(W_ > 0, W_, 1), np.nan)
    return O


def grupa(M, h, a_='2012-01', b_=None):
    b_ = min(pd.Period(b_, 'M'), KON[h]) if b_ else KON[h]; ex = []
    for m in MI:
        if pd.Period(a_, 'M') <= m <= b_:
            i = im_[m]; s_ = M[i] & np.isfinite(EXC[h][i]); ex += list(EXC[h][i, s_])
    ex = np.array(ex)
    return dict(obs=len(ex), srednia_pp=100 * ex.mean() if len(ex) else np.nan, mediana_pp=100 * np.median(ex) if len(ex) else np.nan,
                bije_srednia=(ex > 0).mean() if len(ex) else np.nan)


out = ['# Etap 77: ocena na tle całego zbioru vs sektora; flaga SPADEK (2 lata z rzędu); spółki silne i stabilne', '']
rows, top = [], []
for nm, ws in (('w sektorze', True), ('w całym zbiorze', False)):
    O = oceny(ws)
    for g_ in ('ogolna', 'wzrost', 'sila', 'wycena'):
        for h in (12, 36, 60): rows.append(wiersz(f'{nm}: {g_}', O[g_], h))
    for h in (12, 36, 60):
        T10 = np.zeros((NT, NS), bool)
        for m in MI:
            i = im_[m]; ok = np.isfinite(O['ogolna'][i])
            if ok.sum() > 50: T10[i] = ok & (O['ogolna'][i] >= np.nanpercentile(O['ogolna'][i, ok], 90))
        for okr, a_, b_ in (('całość', '2012-01', None), ('2012-2016', '2012-01', '2016-12'), ('2017+', '2017-01', None)):
            top.append(dict(ocena=nm, h=f'{h // 12} l.', starty=okr, **grupa(T10, h, a_, b_)))
out += ['## (A) Ocena: percentyle w sektorze vs w całym zbiorze (wagi 0,4 / 0,35 / 0,25, z cechami etapu 76)', '', pd.DataFrame(rows).round(3).to_markdown(index=False), '',
        'Top 10 % wg oceny ogólnej:', '', pd.DataFrame(top).round(3).to_markdown(index=False), '']
lag12 = lambda A_: np.vstack([np.full((12, NS), np.nan), A_[:-12]])
R1, N1 = X['rev_1y'], X['ni_1y']
NIt = X['ni_1y']
SPADEK = UNI & (((np.nan_to_num(R1, nan=1) < 0) & (np.nan_to_num(lag12(R1), nan=1) < 0)) | ((np.nan_to_num(N1, nan=1) < 0) & (np.nan_to_num(lag12(N1), nan=1) < 0)))
RESZTA = UNI & ~SPADEK & np.isfinite(R1)
SILNE = UNI & ~SPADEK & (np.nan_to_num(X['rev_lata_10'], nan=0) >= 4) & (np.nan_to_num(X['C1_lata_zysk'], nan=0) >= 4)
rows = []
for nm, M in (('SPADEK (przychody lub zysk r/r < 0 dwa lata z rzędu)', SPADEK), ('bez flagi SPADEK', RESZTA), ('silne i stabilne (przychody > 10 % w ≥ 4 z 5 lat, zysk rósł w ≥ 4 z 5)', SILNE)):
    for h in (12, 36, 60):
        for okr, a_, b_ in (('całość', '2012-01', None), ('2012-2016', '2012-01', '2016-12'), ('2017+', '2017-01', None)):
            rows.append(dict(grupa=nm, h=f'{h // 12} l.', starty=okr, **grupa(M, h, a_, b_)))
out += ['## (B, C) Flaga SPADEK i spółki silne i stabilne: nadwyżka nad średnią spółek zbioru', '',
        f'Spółek w miesiącu (mediana): SPADEK {int(np.median([SPADEK[im_[m]].sum() for m in MI]))}, silne i stabilne {int(np.median([SILNE[im_[m]].sum() for m in MI]))}', '',
        pd.DataFrame(rows).round(3).to_markdown(index=False), '']
open(os.path.join(HERE, 'wyniki', 'r102_etap77.md'), 'w').write('\n'.join(out)); print('\n'.join(out))
