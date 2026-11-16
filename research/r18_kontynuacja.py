"""Etap 11, część D: co odróżnia wzrost, który trwa dalej. Opis z danych 1998-2018 (test 2019+ nietknięty).

Zdarzenie (widoczne na żywo): pierwszy tydzień, w którym zamknięcie >= 1,3 x minimum zamknięć z ostatnich 52 tygodni
(przecięcie progu; kolejne zdarzenie w serii najwcześniej po 26 tyg.), spółka płynna, >= 160 tyg. historii.
Wynik: cena dochodzi do 2,0 x tego minimum (+100 % od dołka), zanim spadnie o 25 % od maksimum po zdarzeniu (do 104 tyg.).
Cechy (tylko przeszłość): tygodnie od dołka, tempo, odsetek tygodni wzrostowych i najgłębsza korekta od dołka,
liczba korekt >= 10 %, wolumen od dołka / przed dołkiem, wolumen ostatnich 4 tyg. / od dołka, zmienność od dołka /
przed dołkiem, głębokość spadku przed dołkiem (dołek / max 3 lat przed nim), odległość od szczytu 52 tyg. i od
rekordu, wybicie ponad max 26 tyg., rynek (SPY / SMA 40, zwrot indeksu 13 tyg.), wielkość (log obrotów), log ceny.
Uczenie: LightGBM, walidacja krzyżowa po grupach lat (5 bloków), prognozy poza blokiem -> AUC; |SHAP| i efekty
w kwintylach; odsetek sukcesu w kwintylach każdej cechy z 95 % z bootstrapu blokowego po miesiącach.
"""
import os, warnings, duckdb, numpy as np, pandas as pd, lightgbm as lgb
from sklearn.metrics import roc_auc_score
warnings.filterwarnings('ignore')
DB = os.environ.get('RESEARCH_DB', '/home/user/ndx/db/research.duckdb')
WYN = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'wyniki')
SEED = 20261110; rng = np.random.default_rng(SEED)
con = duckdb.connect(DB, read_only=True)
rw = con.execute("SELECT okres, ew_r, spy FROM rynek_w ORDER BY okres").df(); rw['okres'] = pd.to_datetime(rw.okres)
rw['spy_sma'] = rw.spy / rw.spy.rolling(40, min_periods=40).mean() - 1
rw['ew13'] = np.exp(np.log1p(rw.ew_r.fillna(0)).rolling(13).sum()) - 1
rw = rw.set_index('okres')
w = con.execute("""SELECT seria, okres, c, vol, dv, ok FROM w WHERE c > 0 AND okres BETWEEN '1995-01-01' AND '2020-12-31' ORDER BY seria, okres""").df()
w['okres'] = pd.to_datetime(w.okres)
print('w', len(w), flush=True)
gr = np.flatnonzero(np.r_[True, w.seria.values[1:] != w.seria.values[:-1], True])
C = w.c.to_numpy(float); V = w.vol.to_numpy(float); D = w.dv.to_numpy(float); OK = w.ok.to_numpy(); O = w.okres.to_numpy(); S = w.seria.to_numpy()
spy = rw.spy_sma.reindex(w.okres).to_numpy(); ew13 = rw.ew13.reindex(w.okres).to_numpy()
ev = []
for a, b in zip(gr[:-1], gr[1:]):
    n = b - a
    if n < 170: continue
    c = C[a:b]; v = V[a:b]
    mn = pd.Series(c).rolling(52, min_periods=52).min().to_numpy()
    ost = -999
    for t in range(160, n):
        if not (c[t] >= 1.3 * mn[t] and c[t - 1] < 1.3 * mn[t - 1]) or t - ost < 26 or not OK[a + t]: continue
        if pd.Timestamp(O[a + t]) < pd.Timestamp('1998-01-01') or pd.Timestamp(O[a + t]) > pd.Timestamp('2018-12-31'): continue
        ost = t
        L = mn[t]; il = t - 51 + int(np.argmin(c[t - 51:t + 1]))
        seg = c[il:t + 1]; k = t - il
        if k < 2: continue
        rm = np.maximum.accumulate(seg); dds = seg / rm - 1
        kor, wk_ = 0, False
        for x, m in zip(dds, seg == rm):
            if m: wk_ = False
            elif x <= -0.10 and not wk_: kor += 1; wk_ = True
        pre = slice(max(il - 26, 0), il)
        r = np.diff(np.log(c))
        f = dict(seria=S[a], okres=pd.Timestamp(O[a + t]),
                 tyg_od_dolka=k, tempo=(c[t] / L) ** (1 / k) - 1, tyg_wzrostowe=(np.diff(seg) > 0).mean(), max_korekta=dds.min(),
                 korekty10=kor, wolumen_od_dolka=np.log((v[il:t + 1].mean() + 1) / (v[pre].mean() + 1)),
                 wolumen_4tyg=np.log((v[t - 3:t + 1].mean() + 1) / (v[il:t + 1].mean() + 1)),
                 zmiennosc_od_dolka=np.log(np.std(r[il:t]) / np.std(r[max(il - 26, 0):max(il - 1, 1)])) if il > 3 and np.std(r[max(il - 26, 0):max(il - 1, 1)]) > 0 else np.nan,
                 spadek_przed_dolkiem=L / c[max(il - 156, 0):il + 1].max() - 1,
                 od_max52=c[t] / c[t - 51:t + 1].max() - 1, od_rekordu=c[t] / c[:t + 1].max() - 1,
                 wybicie26=int(c[t] > c[t - 26:t].max()), spy_sma=spy[a + t], ew13=ew13[a + t],
                 log_obroty=np.log1p(D[a + t - 12:a + t + 1].mean()), log_cena=np.log(c[t]))
        # wynik
        mx, wyn = c[t], 0
        for j in range(t + 1, min(t + 105, n)):
            if c[j] >= 2.0 * L: wyn = 1; break
            mx = max(mx, c[j])
            if c[j] <= 0.75 * mx: break
        f['sukces'] = wyn
        f['zwrot52'] = c[min(t + 52, n - 1)] / c[t] - 1
        ev.append(f)
E = pd.DataFrame(ev); E['rok'] = E.okres.dt.year; E['mies'] = E.okres.dt.to_period('M').astype(str)
print('zdarzeń', len(E), 'sukces', E.sukces.mean(), flush=True)
CE = ['tyg_od_dolka', 'tempo', 'tyg_wzrostowe', 'max_korekta', 'korekty10', 'wolumen_od_dolka', 'wolumen_4tyg', 'zmiennosc_od_dolka',
      'spadek_przed_dolkiem', 'od_max52', 'od_rekordu', 'wybicie26', 'spy_sma', 'ew13', 'log_obroty', 'log_cena']
OPIS = {'tyg_od_dolka': 'tygodnie od dołka do +30 %', 'tempo': 'tempo od dołka (% / tydz.)', 'tyg_wzrostowe': 'odsetek tygodni wzrostowych od dołka',
        'max_korekta': 'najgłębsza korekta od dołka', 'korekty10': 'liczba korekt >= 10 % od dołka', 'wolumen_od_dolka': 'log wolumen od dołka / 26 tyg. przed',
        'wolumen_4tyg': 'log wolumen 4 tyg. / od dołka', 'zmiennosc_od_dolka': 'log zmienność od dołka / przed', 'spadek_przed_dolkiem': 'spadek przed dołkiem (od max 3 lat)',
        'od_max52': 'odległość od szczytu 52 tyg.', 'od_rekordu': 'odległość od rekordu', 'wybicie26': 'wybicie ponad max 26 tyg.', 'spy_sma': 'SPY / SMA 40 - 1',
        'ew13': 'zwrot rynku 13 tyg.', 'log_obroty': 'log obrotów (wielkość)', 'log_cena': 'log ceny'}
# walidacja krzyżowa po blokach lat
bloki = np.array_split(np.arange(1998, 2019), 5)
E['p'] = np.nan; SH = []
for bl in bloki:
    te = E.rok.isin(bl); tr = ~te
    m = lgb.LGBMClassifier(n_estimators=300, learning_rate=0.03, num_leaves=15, min_child_samples=300, subsample=0.8, subsample_freq=1,
                           colsample_bytree=0.8, reg_lambda=5, verbose=-1, random_state=SEED).fit(E.loc[tr, CE], E.loc[tr, 'sukces'])
    E.loc[te, 'p'] = m.predict_proba(E.loc[te, CE])[:, 1]
    SH.append((E.loc[te, CE], m.predict(E.loc[te, CE], pred_contrib=True)[:, :-1]))
auc = roc_auc_score(E.sukces, E.p)
auc_rok = E.groupby('rok').apply(lambda g: roc_auc_score(g.sukces, g.p) if g.sukces.nunique() > 1 else np.nan)
X = pd.concat([s for s, _ in SH]); Sv = np.vstack([v for _, v in SH])
imp = pd.Series(np.abs(Sv).mean(0), index=CE).sort_values(ascending=False)
gi = list(E.reset_index(drop=True).groupby('mies').indices.values())


def kw_tab(col):
    q = pd.qcut(E[col].rank(method='first'), 5, labels=False).to_numpy(); y = E.sukces.to_numpy(); x = E[col].to_numpy()
    rows = []
    for k in range(5):
        m = q == k
        bs = []
        for _ in range(500):
            ii = np.concatenate([gi[i] for i in rng.integers(0, len(gi), len(gi))]); mm = m[ii]
            bs.append(y[ii][mm].mean())
        lo, hi = np.percentile(bs, [2.5, 97.5])
        rows.append(f'K{k+1} (mediana {np.nanmedian(x[m]):.3g}): {y[m].mean()*100:.1f} % ({lo*100:.1f}…{hi*100:.1f})')
    return rows


Q = pd.qcut(E.p.rank(method='first'), 5, labels=False)
kw_p = E.groupby(Q.to_numpy()).agg(sukces=('sukces', 'mean'), zwrot52_mediana=('zwrot52', 'median'), n=('sukces', 'size')).round(3)
out = ['# Etap 11 D: co odróżnia wzrost, który trwa dalej (zdarzenia 1998-2018)', '',
       f'Zdarzeń (cena po raz pierwszy +30 % nad dołkiem 52 tyg.): {len(E):,}; dojście do +100 % od dołka przed spadkiem o 25 % od szczytu: '
       f'{E.sukces.mean()*100:.1f} %.', '',
       f'Trafność modelu poza blokiem lat: AUC = {auc:.3f}; AUC w latach: od {auc_rok.min():.3f} do {auc_rok.max():.3f}, mediana {auc_rok.median():.3f}.', '',
       'Odsetek sukcesu i mediana zwrotu 52 tyg. w kwintylach prognozy modelu (0 = najniższa):', '', kw_p.reset_index(names='kwintyl').to_markdown(index=False), '',
       '## Czego model się nauczył: cechy od najważniejszej', '',
       'Dla każdej cechy: ważność (średnie |SHAP|), kierunek wpływu na prognozę w kwintylach cechy (średni SHAP, log-szanse) oraz '
       'surowy odsetek sukcesu w kwintylach cechy z 95 % z bootstrapu blokowego po miesiącach.', '']
for f_ in imp.index:
    q = pd.qcut(X[f_].rank(method='first'), 5, labels=False).to_numpy()
    s = pd.Series(Sv[:, CE.index(f_)]).groupby(q).mean()
    out += [f'### {OPIS[f_]} (ważność {imp[f_]:.3f})', '', 'Wpływ w modelu (K1 → K5): ' + ', '.join(f'{x:+.3f}' for x in s), '',
            'Odsetek sukcesu: ' + '; '.join(kw_tab(f_)), '']
    print(f_, flush=True)
open(os.path.join(WYN, 'r18_kontynuacja.md'), 'w').write('\n'.join(out))
print('\n'.join(out))
