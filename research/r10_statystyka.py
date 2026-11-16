"""Etap 5b: statystyka zachowania ceny (bez formacji). Próba ucząca: miesiące sygnału 1998-01 ... 2012-06,
zwroty przyszłe najwyżej 12 mies. (kończą się przed 2013-07).

A. Przekrój (co miesiąc, spółki płynne): czy cecha z końca miesiąca t porządkuje zwroty w miesiącach t+1..t+H
   (H = 1, 3, 6, 12), po odjęciu średniej przekrojowej (zwrot nadwyżkowy względem rynku równoważonego).
   Miara: IC = korelacja rang Spearmana w każdym miesiącu; średnia IC, t Neweya-Westa (opóźnienia = H),
   odsetek miesięcy z IC > 0, spread decyl 10 - decyl 1 (średni zwrot nadwyżkowy na miesiąc), IC w 3 podokresach.
   Wszystkie testy razem: korekta BH. Tygodniowo: zwrot z ostatniego tygodnia -> tydzień / 4 tygodnie.
B. Profile decylowe najważniejszych cech (czy zależność jest liniowa, czy np. skrajności się odwracają).
C. Konsolidacja: zawężenie zmienności -> przyszła wielkość ruchu (|zwrot|) i kierunek.
D. Rynek (indeks równoważony płynnych spółek, miesięcznie): po miesiącu spadkowym / wzrostowym, nad / pod SMA 10,
   miesiące roku; średnie z przedziałem z bootstrapu blokowego.
"""
import os, warnings, duckdb, numpy as np, pandas as pd
from scipy import stats
from statsmodels.stats.multitest import multipletests
warnings.filterwarnings('ignore')
DB = os.environ.get('RESEARCH_DB', '/home/user/ndx/db/research.duckdb')
WYN = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'wyniki')
SEED = 20261110; rng = np.random.default_rng(SEED)
OD, DO = pd.Timestamp('1998-01-01'), pd.Timestamp('2012-06-01')
con = duckdb.connect(DB, read_only=True)
con.execute(f"SET threads=4; SET memory_limit='10GB'; SET temp_directory='{os.path.dirname(DB)}/duckdb_tmp'")

# cechy dzienne zagregowane do miesiąca: zmienność dzienna, największy dzienny wzrost, odsetek dni wzrostowych
dm = con.execute("""SELECT ticker, date_trunc('month', date)::DATE okres, stddev(r_adj) rv_d, max(r_adj) max_d,
                       avg((r_adj > 0)::INT) up_d, count(*) n_d
                    FROM dc WHERE date BETWEEN '1993-01-01' AND '2013-07-31' GROUP BY 1, 2""").df()
m = con.execute("""SELECT ticker, seria, okres, c, vol, dv, ok FROM m WHERE okres BETWEEN '1993-01-01' AND '2013-07-31'
                   ORDER BY seria, okres""").df()
m = m.merge(dm, on=['ticker', 'okres'], how='left')
m['okres'] = pd.to_datetime(m.okres)
g = m.groupby('seria', sort=False)
lc = np.log(m.c)
m['r1m'] = g.c.pct_change()
for k in (3, 6, 12):
    m[f'r{k}'] = m.c / g.c.shift(k) - 1
m['r12_1'] = g.c.shift(1) / g.c.shift(12) - 1          # momentum z pominięciem ostatniego miesiąca
m['r36_12'] = g.c.shift(12) / g.c.shift(36) - 1        # długoterminowe odwrócenie
mx12 = g.c.transform(lambda s: s.rolling(12, min_periods=12).max())
mn12 = g.c.transform(lambda s: s.rolling(12, min_periods=12).min())
m['od_max12'] = m.c / mx12 - 1; m['od_min12'] = m.c / mn12 - 1
m['od_ath'] = m.c / g.c.cummax() - 1
m['rv1'] = m.rv_d
m['rv12'] = g.rv_d.transform(lambda s: s.rolling(12, min_periods=9).mean())
m['zawezenie'] = m.rv1 / m.rv12                          # konsolidacja: zmienność ostatniego miesiąca / średnia roczna
m['zakres3'] = g.c.transform(lambda s: s.rolling(3).max() / s.rolling(3).min() - 1)   # szerokość ostatnich 3 mies.
m['max_d'] = m.max_d
m['up_d'] = m.up_d
up = (m.r1m > 0).astype(int)
m['seria_wzr'] = up.groupby((up != up.groupby(m.seria).shift()).cumsum()).cumsum() * np.where(up == 1, 1, -1)
m['vol_zm'] = m.vol / g.vol.transform(lambda s: s.shift(1).rolling(12, min_periods=9).mean())
m['log_dv'] = np.log1p(g.dv.transform(lambda s: s.rolling(3, min_periods=1).mean()))
m['mies'] = m.okres.dt.month
# sezonowość własna: średni zwrot tej spółki w tym samym miesiącu kalendarzowym w poprzednich latach (>= 3 lata)
m['sez_wlasna'] = m.groupby(['seria', 'mies']).r1m.transform(lambda s: s.shift(1).expanding(min_periods=3).mean())
m['sez_wlasna'] = m.groupby('seria').sez_wlasna.shift(-1)   # cecha w t dotyczy miesiąca t+1 (znana w t)
# wyniki: zwrot w t+1..t+H (koniec serii = ostatnia cena)
for H in (1, 3, 6, 12):
    fut = g.c.shift(-H)
    last = g.c.transform('last')
    koniec = g.okres.transform('max')
    fut = fut.where(fut.notna() | (m.okres + pd.DateOffset(months=H) <= koniec), last)
    m[f'f{H}'] = fut / m.c - 1
    m.loc[m.okres + pd.DateOffset(months=H) > pd.Timestamp('2013-06-30'), f'f{H}'] = np.nan
m['f3_abs'] = np.nan
P = m[(m.okres >= OD) & (m.okres <= DO) & (m.ok == 1)].copy()
for H in (1, 3, 6, 12):  # nadwyżka nad średnią przekrojową (winsoryzacja 1/99 % w miesiącu)
    w = P.groupby('okres')[f'f{H}'].transform(lambda v: v.clip(v.quantile(0.01), v.quantile(0.99)))
    P[f'x{H}'] = w - w.groupby(P.okres).transform('mean')
P['x3_abs'] = P.x3.abs()
print('panel', len(P), P.okres.nunique(), flush=True)

CECHY = {'r1m': 'zwrot ostatniego miesiąca', 'r3': 'zwrot 3 mies.', 'r6': 'zwrot 6 mies.', 'r12': 'zwrot 12 mies.',
         'r12_1': 'zwrot 12 mies. bez ostatniego', 'r36_12': 'zwrot sprzed 1-3 lat', 'od_max12': 'odległość od szczytu 12 mies.',
         'od_min12': 'wzrost od dołka 12 mies.', 'od_ath': 'odległość od rekordu wszech czasów', 'rv1': 'zmienność dzienna (1 mies.)',
         'zawezenie': 'zawężenie zmienności (1 mies. / 12 mies.)', 'zakres3': 'szerokość zakresu 3 mies.', 'max_d': 'największy dzienny wzrost w mies.',
         'up_d': 'odsetek dni wzrostowych w mies.', 'seria_wzr': 'seria miesięcy wzrostowych (+) / spadkowych (-)',
         'vol_zm': 'wolumen mies. / średnia 12 mies.', 'log_dv': 'wielkość (obroty)', 'sez_wlasna': 'sezonowość własna (ten sam miesiąc w poprzednich latach)'}


def nw_t(x, lags):
    x = np.asarray(x, float); x = x[~np.isnan(x)]; n = len(x); e = x - x.mean()
    s = e @ e / n
    for l in range(1, lags + 1):
        s += 2 * (1 - l / (lags + 1)) * (e[l:] @ e[:-l]) / n
    return x.mean() / np.sqrt(s / n)


def ic_seria(df, cecha, cel):
    d = df[['okres', cecha, cel]].dropna()
    return d.groupby('okres').apply(lambda v: stats.spearmanr(v[cecha], v[cel])[0] if len(v) > 50 else np.nan)


okresy = [(1998, 2002), (2003, 2007), (2008, 2012)]
rows = []
for c, opis in CECHY.items():
    for H in (1, 3, 6, 12):
        ic = ic_seria(P, c, f'x{H}')
        d = P[['okres', c, f'x{H}']].dropna()
        d['dec'] = d.groupby('okres')[c].transform(lambda v: pd.qcut(v.rank(method='first'), 10, labels=False))
        sp = d.groupby(['okres', 'dec'])[f'x{H}'].mean().unstack()
        spread = (sp[9] - sp[0]) / H
        rows.append(dict(cecha=opis, H=H, IC=ic.mean(), t_NW=nw_t(ic, H), IC_dodatnie=(ic > 0).mean(),
                         D10_D1_mies=spread.mean(), t_spread=nw_t(spread, H),
                         IC_98_02=ic[ic.index.year <= 2002].mean(), IC_03_07=ic[(ic.index.year >= 2003) & (ic.index.year <= 2007)].mean(),
                         IC_08_12=ic[ic.index.year >= 2008].mean()))
    print(c, flush=True)
A = pd.DataFrame(rows)
A['p'] = 2 * stats.norm.sf(A.t_NW.abs()); A['q_BH'] = multipletests(A.p, method='fdr_bh')[1]
A['ten_sam_znak_3_okresy'] = np.sign(A[['IC_98_02', 'IC_03_07', 'IC_08_12']]).nunique(axis=1).eq(1)
A['stabilny'] = (A.q_BH < 0.05) & (A.t_NW.abs() > 3) & A.ten_sam_znak_3_okresy

# tygodniowo: krótkoterminowe odwrócenie
w = con.execute("""SELECT seria, okres, c, ok FROM w WHERE okres BETWEEN '1997-06-01' AND '2013-06-30' ORDER BY seria, okres""").df()
w['okres'] = pd.to_datetime(w.okres); gw = w.groupby('seria', sort=False)
w['r1w'] = gw.c.pct_change()
for H in (1, 4):
    w[f'f{H}w'] = gw.c.shift(-H) / w.c - 1
W = w[(w.okres >= OD) & (w.okres <= pd.Timestamp('2012-12-31')) & (w.ok == 1)].dropna(subset=['r1w', 'f1w', 'f4w']).copy()
for H in (1, 4):
    v = W.groupby('okres')[f'f{H}w'].transform(lambda s: s.clip(s.quantile(0.01), s.quantile(0.99)))
    W[f'x{H}w'] = v - v.groupby(W.okres).transform('mean')
roww = []
for H in (1, 4):
    ic = W.groupby('okres').apply(lambda v: stats.spearmanr(v.r1w, v[f'x{H}w'])[0])
    W['dec'] = W.groupby('okres').r1w.transform(lambda v: pd.qcut(v.rank(method='first'), 10, labels=False))
    sp = W.groupby(['okres', 'dec'])[f'x{H}w'].mean().unstack(); spread = sp[9] - sp[0]
    roww.append(dict(cecha='zwrot ostatniego tygodnia', H=f'{H} tyg.', IC=ic.mean(), t_NW=nw_t(ic, H), IC_dodatnie=(ic > 0).mean(),
                     D10_D1_okres=spread.mean(), t_spread=nw_t(spread, H)))
Aw = pd.DataFrame(roww)

# B. profile decylowe
prof = []
for c in ['r1m', 'r12_1', 'r36_12', 'od_max12', 'od_min12', 'max_d', 'zawezenie', 'seria_wzr', 'rv1']:
    d = P[['okres', c, 'x1', 'x12']].dropna().copy()
    d['dec'] = d.groupby('okres')[c].transform(lambda v: pd.qcut(v.rank(method='first'), 10, labels=False))
    t = d.groupby('dec').agg(cecha_med=(c, 'median'), x1=('x1', 'mean'), x12=('x12', 'mean'))
    t.insert(0, 'cecha', CECHY[c]); prof.append(t.reset_index())
B = pd.concat(prof)

# C. konsolidacja: czy zawężenie zmienności zapowiada większy ruch (|x3|) i w którą stronę
d = P[['okres', 'zawezenie', 'x3', 'x3_abs', 'rv1', 'rv12']].dropna().copy()
d['dec'] = d.groupby('okres').zawezenie.transform(lambda v: pd.qcut(v.rank(method='first'), 10, labels=False))
C = d.groupby('dec').agg(zawezenie_med=('zawezenie', 'median'), ruch_abs_3m=('x3_abs', 'mean'), kierunek_3m=('x3', 'mean'),
                         zmiennosc_roczna=('rv12', 'median')).reset_index()
ic_abs = ic_seria(P.assign(rel_abs=P.x3_abs), 'zawezenie', 'rel_abs')

# D. rynek
rw = con.execute("SELECT okres, ew_r, spy FROM rynek_w WHERE okres BETWEEN '1990-01-01' AND '2013-06-30' ORDER BY okres").df()
rw['okres'] = pd.to_datetime(rw.okres)
mi = rw.set_index('okres').ew_r.fillna(0).add(1).resample('ME').prod().sub(1).to_frame('r')
mi['idx'] = (1 + mi.r).cumprod(); mi['sma10'] = mi.idx.rolling(10).mean()
mi['f1'] = mi.r.shift(-1); mi['f3'] = mi.idx.shift(-3) / mi.idx - 1; mi['f12'] = mi.idx.shift(-12) / mi.idx - 1
mi = mi[(mi.index >= OD) & (mi.index <= DO)]


def blok_ci_mean(x, blok=12, B_=2000):
    x = np.asarray(x.dropna()); n = len(x); nb = int(np.ceil(n / blok))
    st = [np.concatenate([x[s:s + blok] for s in rng.integers(0, max(n - blok, 1), nb)])[:n].mean() for _ in range(B_)]
    return f'{x.mean()*100:.2f} ({np.percentile(st,2.5)*100:.2f}…{np.percentile(st,97.5)*100:.2f})', len(x)


Drows = []
for nm, mask in [('wszystkie miesiące', mi.r.notna()), ('po miesiącu spadkowym', mi.r < 0), ('po miesiącu wzrostowym', mi.r > 0),
                 ('po spadku > 5 %', mi.r < -0.05), ('po wzroście > 5 %', mi.r > 0.05),
                 ('indeks nad SMA 10 mies.', mi.idx > mi.sma10), ('indeks pod SMA 10 mies.', mi.idx < mi.sma10)]:
    for H in ('f1', 'f3', 'f12'):
        s, n = blok_ci_mean(mi.loc[mask, H]); Drows.append((nm, H, n, s))
D = pd.DataFrame(Drows, columns=['warunek', 'horyzont', 'n mies.', 'średni zwrot indeksu % (95 %)']).pivot(index=['warunek', 'n mies.'], columns='horyzont', values='średni zwrot indeksu % (95 %)').reset_index()
mies_rok = mi.groupby(mi.index.month + 0).f1.agg(['mean', 'count']); mies_rok.index = [(i % 12) + 1 for i in mies_rok.index]
mies_rok = mies_rok.sort_index().rename_axis('miesiąc').reset_index().rename(columns={'mean': 'średni zwrot %', 'count': 'n'})
mies_rok['średni zwrot %'] = (mies_rok['średni zwrot %'] * 100).round(2)

fmt = lambda df: df.round(4).to_markdown(index=False)
out = ['# Etap 5b: statystyka zachowania ceny (miesiące sygnału 1998-01 ... 2012-06)', '',
       f'Panel: {len(P):,} obserwacji spółka-miesiąc, {P.okres.nunique()} miesięcy, spółki płynne. Zwroty przyszłe jako nadwyżka '
       'nad średnią przekrojową (winsoryzacja 1/99 % w miesiącu). IC = korelacja rang cechy i przyszłego zwrotu w danym miesiącu.', '',
       '## A. Co przewiduje przyszły zwrot względem rynku', '',
       'stabilny = q_BH < 0,05, |t_NW| > 3 i ten sam znak IC w trzech podokresach. D10_D1_mies = różnica średniego zwrotu '
       'nadwyżkowego najwyższego i najniższego decyla cechy, na miesiąc.', '',
       fmt(A.sort_values('t_NW', key=abs, ascending=False)), '',
       '### Tydzień do tygodnia', '', fmt(Aw), '',
       '## B. Profile decylowe (0 = najniższa wartość cechy, x1 / x12 = średni zwrot nadwyżkowy za 1 / 12 mies.)', '', fmt(B), '',
       '## C. Konsolidacja: zawężenie zmienności a przyszły ruch (3 mies.)', '',
       f'IC zawężenia z wielkością przyszłego ruchu |x3|: {ic_abs.mean():.4f}, t_NW = {nw_t(ic_abs, 3):.2f}.', '', fmt(C), '',
       '## D. Rynek: indeks równoważony płynnych spółek (zwrot w %, 95 % z bootstrapu blokowego 12 mies.)', '',
       D.to_markdown(index=False), '', 'Miesiąc roku (zwrot w następnym miesiącu przypisany do miesiąca kalendarzowego; 14-15 obserwacji na miesiąc, bez wniosków):', '',
       mies_rok.to_markdown(index=False), '']
open(os.path.join(WYN, 'r10_statystyka.md'), 'w').write('\n'.join(out))
print('\n'.join(out))
