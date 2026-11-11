"""Etap 11: anatomia dużych wzrostów (opis z danych, bez strategii). Ruchy w górę z zygzaka Y = 25 % (tabela ruchy),
zakończone, dołek w latach 1998-2018 (okres walidacji jest już wykorzystany; test 2019+ nietknięty), co najmniej +50 %
od dołka do szczytu, spółka płynna w tygodniu, w którym cena po raz pierwszy była +30 % nad dołkiem.

A. Statystyka według wielkości ruchu: czas dołek -> szczyt, tempo, liczba i głębokość korekt w trakcie, udział zysku
   w pierwszej i drugiej połowie czasu (przyspieszanie), wolumen i zmienność w ostatniej ćwiartce vs pierwszej,
   oddanie po szczycie (cena 26 i 52 tyg. po szczycie względem szczytu i jaka część wzrostu zostaje), szybkość spadku.
B. Typy przebiegów: ścieżka log ceny od dołka (0) do szczytu (1) w 20 punktach równo rozłożonych w czasie,
   k-średnie (k z sylwetki i stabilności); opis grup tymi samymi miarami.
C. Szczyt: średnie profile (mediany) ceny, wolumenu i zmienności od 26 tyg. przed do 26 tyg. po szczycie.
Przedziały 95 % dla median: bootstrap blokowy po miesiącach dołka (1000 losowań).
"""
import os, warnings, duckdb, numpy as np, pandas as pd
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score, adjusted_rand_score
warnings.filterwarnings('ignore')
DB = os.environ.get('RESEARCH_DB', '/home/user/ndx/db/research.duckdb')
WYN = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'wyniki')
SEED = 20261110; rng = np.random.default_rng(SEED)
con = duckdb.connect(DB, read_only=True)
R = con.execute("""SELECT ticker AS seria, t0, t1, t_kon, p0, p1, zmiana FROM ruchy WHERE y = 0.25 AND kier = 1 AND status = 'zakonczony'
                   AND zmiana >= 0.5 AND t0 BETWEEN '1998-01-01' AND '2018-12-31'""").df()
for k in ('t0', 't1', 't_kon'): R[k] = pd.to_datetime(R[k])
w = con.execute("""SELECT seria, okres, c, vol, ok FROM w WHERE seria IN (SELECT DISTINCT ticker FROM ruchy WHERE y = 0.25 AND kier = 1
                   AND zmiana >= 0.5 AND t0 BETWEEN '1998-01-01' AND '2018-12-31') ORDER BY seria, okres""").df()
w['okres'] = pd.to_datetime(w.okres)
print('ruchy', len(R), 'tygodnie', len(w), flush=True)
dd = con.execute("""SELECT seria, okres, rv_t FROM (SELECT d.ticker, date_trunc('week', date)::DATE okres, stddev(r_adj) rv_t FROM dc d
                    WHERE date BETWEEN '1996-01-01' AND '2020-12-31' GROUP BY 1, 2) x JOIN (SELECT DISTINCT ticker, seria, okres FROM w) y USING (ticker, okres)""").df()
dd['okres'] = pd.to_datetime(dd.okres)
w = w.merge(dd, on=['seria', 'okres'], how='left')
G = {s: g.reset_index(drop=True) for s, g in w.groupby('seria', sort=False)}
rows, paths, prof = [], [], []
for r in R.itertuples():
    g = G.get(r.seria)
    if g is None: continue
    ok_ = g.okres.to_numpy()
    i0 = np.searchsorted(ok_, np.datetime64(r.t0)); i1 = np.searchsorted(ok_, np.datetime64(r.t1))
    if i1 >= len(g) or i1 - i0 < 4: continue
    c = g.c.to_numpy(float); v = g.vol.to_numpy(float); rv = g.rv_t.to_numpy(float)
    seg = c[i0:i1 + 1]
    i30 = np.flatnonzero(seg >= seg[0] * 1.3)
    if not len(i30) or not g.ok.iloc[i0 + i30[0]]: continue
    n = i1 - i0
    runmax = np.maximum.accumulate(seg); dds = seg / runmax - 1
    # korekty >= 10 %: liczymy zejścia poniżej -10 % od bieżącego maksimum (nowa korekta po nowym maksimum)
    kor, w_kor = 0, False
    for x, m in zip(dds, seg == runmax):
        if m: w_kor = False
        elif x <= -0.10 and not w_kor: kor += 1; w_kor = True
    half = i0 + n // 2
    l = np.log(seg); frac_1pol = (np.log(c[half]) - l[0]) / (l[-1] - l[0])
    q = max(n // 4, 1)
    vol_trend = np.log((v[i1 - q + 1:i1 + 1].mean() + 1) / (v[i0 + 1:i0 + 1 + q].mean() + 1))
    rv_trend = np.log(np.nanmean(rv[i1 - q + 1:i1 + 1]) / np.nanmean(rv[i0 + 1:i0 + 1 + q]))
    up_share = (np.diff(seg) > 0).mean()
    after = {}
    for h in (13, 26, 52):
        j = i1 + h
        after[h] = c[j] / c[i1] - 1 if j < len(g) else (c[-1] / c[i1] - 1 if g.okres.iloc[-1] < pd.Timestamp('2026-10-01') else np.nan)
    zost52 = np.log(1 + after[52]) / np.log(seg[-1] / seg[0]) + 1 if not np.isnan(after[52]) else np.nan
    tyg_spadku = (r.t_kon - r.t1).days / 7 if pd.notna(r.t_kon) else np.nan
    rows.append(dict(seria=r.seria, t0=r.t0, zmiana=r.zmiana, tyg=n, tempo_tydz=(seg[-1] / seg[0]) ** (1 / n) - 1, korekty10=kor,
                     max_korekta=dds.min(), czesc_zysku_1pol=frac_1pol, wolumen_trend=vol_trend, zmiennosc_trend=rv_trend,
                     tyg_wzrostowe=up_share, po_szczycie_13=after[13], po_szczycie_26=after[26], po_szczycie_52=after[52],
                     zostaje_po_52=zost52, tyg_szczyt_do_minus25=tyg_spadku))
    tt = np.linspace(0, n, 20)
    paths.append((np.interp(tt, np.arange(n + 1), l) - l[0]) / (l[-1] - l[0]))
    if i1 - 26 >= 0 and i1 + 26 < len(g) and r.zmiana >= 1.0:
        o = np.arange(-26, 27)
        v52 = np.nanmean(v[max(i1 - 78, 0):i1 - 26]) + 1
        prof.append(pd.DataFrame({'tyg': o, 'cena': c[i1 + o] / c[i1], 'wolumen': (v[i1 + o] + 1) / v52, 'zmiennosc': rv[i1 + o]}))
A = pd.DataFrame(rows); X = np.vstack(paths)
A['mies'] = A.t0.dt.to_period('M').astype(str)
A['klasa'] = pd.cut(A.zmiana, [0.5, 1, 2, 5, 1e9], labels=['+50-100 %', '+100-200 %', '+200-500 %', '> +500 %'], right=False)
print('opisane', len(A), flush=True)
MIARY = {'tyg': 'tygodnie dołek->szczyt', 'tempo_tydz': 'tempo (% na tydzień)', 'korekty10': 'liczba korekt >= 10 %',
         'max_korekta': 'najgłębsza korekta w trakcie', 'tyg_wzrostowe': 'odsetek tygodni wzrostowych',
         'czesc_zysku_1pol': 'część wzrostu (log) w 1. połowie czasu', 'wolumen_trend': 'log wolumen: ostatnia / pierwsza ćwiartka',
         'zmiennosc_trend': 'log zmienność: ostatnia / pierwsza ćwiartka', 'po_szczycie_13': 'zmiana ceny 13 tyg. po szczycie',
         'po_szczycie_26': 'zmiana ceny 26 tyg. po szczycie', 'po_szczycie_52': 'zmiana ceny 52 tyg. po szczycie',
         'zostaje_po_52': 'część wzrostu (log), która zostaje 52 tyg. po szczycie', 'tyg_szczyt_do_minus25': 'tygodnie od szczytu do spadku o 25 %'}
idxm = {k: list(v.values()) for k, v in [('x', {})]}


def med_ci(d, col):
    gi = list(d.reset_index(drop=True).groupby('mies').indices.values()); x = d[col].to_numpy()
    b = [np.nanmedian(x[np.concatenate([gi[i] for i in rng.integers(0, len(gi), len(gi))])]) for _ in range(1000)]
    m = np.nanmedian(x); lo, hi = np.percentile(b, [2.5, 97.5])
    pct = col in ('tempo_tydz', 'max_korekta', 'tyg_wzrostowe', 'czesc_zysku_1pol', 'po_szczycie_13', 'po_szczycie_26', 'po_szczycie_52', 'zostaje_po_52')
    f = (lambda z: f'{z*100:.1f}') if pct else (lambda z: f'{z:.2f}')
    return f'{f(m)} ({f(lo)}…{f(hi)})'


tabA = pd.DataFrame({k: {kl: med_ci(A[A.klasa == kl], k) for kl in A.klasa.cat.categories} for k in MIARY}).T
tabA.index = [MIARY[k] for k in tabA.index]
cnt = A.klasa.value_counts().reindex(A.klasa.cat.categories)

# B. typy przebiegów
sub = rng.choice(len(X), min(15000, len(X)), replace=False)
wk = []
for k in range(2, 9):
    km = KMeans(k, n_init=10, random_state=SEED).fit(X)
    ari = np.mean([adjusted_rand_score(km.labels_, KMeans(k, n_init=3, random_state=SEED + i).fit(X[h]).predict(X))
                   for i, h in enumerate([rng.choice(len(X), len(X) // 2, replace=False) for _ in range(10)])])
    wk.append((k, silhouette_score(X[sub], km.labels_[sub]), ari, km))
    print('k', k, wk[-1][1:3], flush=True)
st = [x for x in wk if x[2] >= 0.6]
K, _, _, KM = max(st, key=lambda x: x[1])
A['typ'] = KM.labels_
cen = pd.DataFrame(KM.cluster_centers_.T, columns=[f'typ {j}' for j in range(K)])
cen.insert(0, '% czasu ruchu', np.round(np.linspace(0, 100, 20)))
tabB = pd.DataFrame({k: {f'typ {j}': med_ci(A[A.typ == j], k) for j in range(K)} for k in MIARY}).T
tabB.index = [MIARY[k] for k in tabB.index]
udz = A.groupby('typ').agg(n=('zmiana', 'size'), mediana_wzrostu=('zmiana', 'median'))
udz['udzial'] = udz.n / udz.n.sum()
udz['udzial_wsrod_>200%'] = A[A.zmiana >= 2].groupby('typ').size() / (A.zmiana >= 2).sum()

# C. szczyt
Pr = pd.concat(prof)
tabC = Pr.groupby('tyg').agg(cena=('cena', 'median'), wolumen=('wolumen', 'median'), zmiennosc=('zmiennosc', 'median')).loc[[-26, -13, -8, -4, -2, -1, 0, 1, 2, 4, 8, 13, 26]]
tabC['cena_%_szczytu'] = (tabC.cena * 100).round(1); tabC = tabC.drop(columns='cena')
tabC['zmiennosc_dzienna_%'] = (tabC.zmiennosc * 100).round(2); tabC = tabC.drop(columns='zmiennosc')

out = ['# Etap 11: anatomia dużych wzrostów (ruchy +50 % i więcej, dołek 1998-2018, Y = 25 %)', '',
       f'Ruchów: {len(A):,} (płynnych w chwili osiągnięcia +30 % nad dołkiem). Liczebność klas: ' + ', '.join(f'{k}: {v:,}' for k, v in cnt.items()) + '.',
       'Wartości: mediana (95 % z bootstrapu blokowego po miesiącach dołka). Procenty tam, gdzie miara jest udziałem lub zmianą.', '',
       '## A. Jak wyglądają wzrosty różnej wielkości', '', tabA.reset_index(names='miara').to_markdown(index=False), '',
       '## B. Typy przebiegów znalezione przez grupowanie (bez definicji z góry)', '',
       'Wybór k: ' + ', '.join(f'k={k}: sylwetka {s:.3f}, ARI {a:.2f}' for k, s, a, _ in wk) + f'. Wybrane k = {K}.', '',
       'Ścieżka (0 = dołek, 1 = szczyt, w logarytmie) w 20 punktach czasu ruchu:', '', cen.round(3).to_markdown(index=False), '',
       udz.round(3).reset_index().to_markdown(index=False), '', tabB.reset_index(names='miara').to_markdown(index=False), '',
       '## C. Jak wygląda szczyt dużego ruchu (+100 % i więcej): mediany od 26 tyg. przed do 26 tyg. po szczycie', '',
       f'Ruchów z pełnym oknem: {Pr.groupby("tyg").size().iloc[0]:,}. Wolumen = krotność średniej z tygodni -78..-26 przed szczytem.', '',
       tabC.round(2).reset_index().to_markdown(index=False), '']
open(os.path.join(WYN, 'r17_anatomia.md'), 'w').write('\n'.join(out))
A.drop(columns=['mies']).to_parquet(os.path.join(os.path.dirname(DB), 'anatomia.parquet'))
print('\n'.join(out))
