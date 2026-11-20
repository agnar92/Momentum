"""Etap 48: kombinacje filtrów a nadwyżka 5 lat (panel etapu 47)."""
import os, json, itertools, numpy as np, pandas as pd, statsmodels.api as sm
HERE = os.path.dirname(os.path.abspath(__file__))
D = pd.read_parquet('/home/user/ndx/panel_finviz.parquet'); D['mp'] = pd.PeriodIndex(D.m, freq='M')
D = D[(D.mp <= pd.Period('2021-09', 'M')) & D.e60.notna()].copy()
f = lambda s: s.fillna(False)
FIL = {'A przychody 5 l. > +50 %': f(D['przychody 5 lat (CAGR)'] > 1.5 ** 0.2 - 1), 'B przychody 5 l. > 20 %/rok': f(D['przychody 5 lat (CAGR)'] > 0.20),
       'C EPS 5 l. > 10 %/rok': f(D['EPS 5 lat (CAGR)'] > 0.10), 'D dług / kapitał < 0,5': f((D['dług / kapitał'] >= 0) & (D['dług / kapitał'] < 0.5)),
       'E marża operacyjna > 25 %': f(D['marża operacyjna'] > 0.25), 'F quick ratio > 1,5': f(D['quick ratio'] > 1.5), 'G ROE > 15 %': f(D['ROE'] > 0.15),
       'H PEG < 2': f((D['PEG (EPS 5 lat)'] > 0) & (D['PEG (EPS 5 lat)'] < 2)), 'I zwrot 3 mies. > 0': f(D['zwrot 3 mies.'] > 0), 'J current ratio > 1,5': f(D['current ratio'] > 1.5)}
POL = pd.Period('2016-09', 'M')
grp = D.groupby('mp').indices
e60 = D.e60.values; mpv = D.mp.values


def ocen(mask):
    m = mask.values; v = []; n = []
    for mp, ix in grp.items():
        sel = ix[m[ix]]
        if len(sel) >= 1: v.append((mp, e60[sel].mean())); n.append(len(sel))
        else: n.append(0)
    if len(v) < 24: return None
    s = pd.Series(dict(v)); fit = sm.OLS(s.values, np.ones(len(s))).fit(cov_type='HAC', cov_kwds={'maxlags': 60})
    a, b = s[s.index <= POL], s[s.index > POL]
    return dict(nadwyzka_5l=float(s.mean()), t=float(fit.tvalues[0]), pol1=float(a.mean()) if len(a) else np.nan, pol2=float(b.mean()) if len(b) else np.nan,
                sr_spolek=float(np.mean(n)), miesiecy_z_spolkami=len(s))


rows = []
for k in (1, 2, 3):
    for combo in itertools.combinations(FIL, k):
        mk = FIL[combo[0]].copy()
        for c in combo[1:]: mk &= FIL[c]
        r = ocen(mk)
        if r: rows.append(dict(kombinacja=' + '.join(combo), k=k, **r))
    print(k, len(rows), flush=True)
R = pd.DataFrame(rows)
poj = {r.kombinacja: r.nadwyzka_5l for r in R[R.k == 1].itertuples()}
R['interakcja_vs_lepszy_skladnik'] = [r.nadwyzka_5l - max(poj[x] for x in r.kombinacja.split(' + ')) if r.k > 1 else np.nan for r in R.itertuples()]
R['stabilna'] = (R.pol1 > 0) & (R.pol2 > 0) & (R.sr_spolek >= 10)
# czwórki z 10 najlepszych stabilnych trójek
top3 = R[(R.k == 3) & R.stabilna].sort_values('nadwyzka_5l', ascending=False).head(10)
r4 = []
for kb in top3.kombinacja:
    for c in FIL:
        if c in kb: continue
        combo = sorted(kb.split(' + ') + [c]); nm = ' + '.join(combo)
        if any(x['kombinacja'] == nm for x in r4): continue
        mk = FIL[combo[0]].copy()
        for x in combo[1:]: mk &= FIL[x]
        r = ocen(mk)
        if r: r4.append(dict(kombinacja=nm, k=4, **r))
R4 = pd.DataFrame(r4); R4['stabilna'] = (R4.pol1 > 0) & (R4.pol2 > 0) & (R4.sr_spolek >= 10)
ALL = pd.concat([R, R4], ignore_index=True)
ALL.to_csv(os.path.join(HERE, 'wyniki', 'r70_kombinacje.csv'), index=False)
kol = ['kombinacja', 'nadwyzka_5l', 't', 'pol1', 'pol2', 'sr_spolek', 'interakcja_vs_lepszy_skladnik']
# macierz par
nm = list(FIL); M = pd.DataFrame(index=[x.split(' ', 1)[0] for x in nm], columns=[x.split(' ', 1)[0] for x in nm], dtype=float)
for r in R[R.k <= 2].itertuples():
    xs = r.kombinacja.split(' + '); a = xs[0].split(' ', 1)[0]; b = xs[-1].split(' ', 1)[0]; M.loc[a, b] = M.loc[b, a] = r.nadwyzka_5l
json.dump(dict(filtry=nm, macierz=M.round(4).where(M.notna(), None).values.tolist(), lit=list(M.index),
               pary=R[R.k == 2][kol + ['stabilna']].round(4).to_dict('records'), trojki=R[R.k == 3].sort_values('nadwyzka_5l', ascending=False).head(25)[kol + ['stabilna']].round(4).to_dict('records'),
               czworki=R4.sort_values('nadwyzka_5l', ascending=False).head(15)[kol[:-1] + ['stabilna']].round(4).to_dict('records'),
               pojedyncze=R[R.k == 1][kol[:-1]].round(4).to_dict('records')),
          open(os.path.join(HERE, 'wyniki', 'r70_kombinacje.json'), 'w'), ensure_ascii=False, indent=1)
fmt = lambda X: X.round(3).to_markdown(index=False)
out = ['# Etap 48: kombinacje filtrów a nadwyżka 5 lat (S&P 500 z danymi SEC, starty 2012-2021)', '',
       'nadwyzka_5l = średnia nadwyżka 5-letnia spółek spełniających kombinację nad średnią wszystkich (0,20 = +20 pp); pol1 / pol2 = starty 2012-2016 / 2016-2021.', '',
       '## Pojedyncze', '', fmt(R[R.k == 1][kol[:-1]].sort_values('nadwyzka_5l', ascending=False)), '',
       '## Pary (stabilne, wg nadwyżki)', '', fmt(R[(R.k == 2) & R.stabilna][kol].sort_values('nadwyzka_5l', ascending=False)), '',
       '## Trójki (stabilne, top 20)', '', fmt(R[(R.k == 3) & R.stabilna][kol].sort_values('nadwyzka_5l', ascending=False).head(20)), '',
       '## Czwórki (z najlepszych trójek, stabilne)', '', fmt(R4[R4.stabilna][kol[:-1]].sort_values('nadwyzka_5l', ascending=False).head(15)), '',
       '## Macierz par (nadwyżka 5 lat; przekątna = filtr sam)', '', M.round(3).to_markdown(), '']
open(os.path.join(HERE, 'wyniki', 'r70_kombinacje.md'), 'w').write('\n'.join(out)); print('\n'.join(out))
