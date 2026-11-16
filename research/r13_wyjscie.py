"""Etap 7: reguły wyjścia i czas trzymania (P6, P7). Wejście = zamknięcie tygodnia świeżego wybicia (tabela zdarzenia),
wybicia 1998-01 ... 2010-12, ścieżka do 130 tygodni, nie dalej niż 2013-06-30 (przymusowe wyjście, oznaczone).

Reguły (decyzja na zamknięciu tygodnia, wyjście po tej cenie; koszt 0,1/0,25/0,5 % na stronę wg obrotów):
  stały czas 13 / 26 / 52 / 104 tyg.; trailing 15 / 25 / 35 % od maksimum zamknięć po wejściu;
  zamknięcie pod SMA 10 / 30 tyg.; stop początkowy -15 % + trailing 25 %; SMA 10 + stop -15 %.
Miary na transakcję: średnia winsoryzowana 1/99 % i mediana zwrotu netto, tygodnie trzymania, zwrot na tydzień
(średni zwrot / średni czas = tempo kapitału), odsetek ruchu do szczytu (zwrot / maksymalny zwrot w oknie trzymania).
Porównanie: różnica średniego zwrotu na tydzień każdej reguły względem najlepszej, bootstrap blokowy po miesiącach
wybicia (2000 losowań), korekta BH. Spółka wycofana = wyjście po ostatniej cenie.
"""
import os, warnings, duckdb, numpy as np, pandas as pd
from statsmodels.stats.multitest import multipletests
warnings.filterwarnings('ignore')
DB = os.environ.get('RESEARCH_DB', '/home/user/ndx/db/research.duckdb')
WYN = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'wyniki')
SEED = 20261110; rng = np.random.default_rng(SEED); B = 2000; HMAX = 130
GRANICA = pd.Timestamp('2013-06-30')
con = duckdb.connect(DB, read_only=True)
z = con.execute("""SELECT seria, okres, cena, log_dv FROM zdarzenia WHERE okres BETWEEN '1998-01-01' AND '2010-12-31'""").df()
z['okres'] = pd.to_datetime(z.okres)
w = con.execute("""SELECT seria, okres, c, dv FROM w WHERE seria IN (SELECT DISTINCT seria FROM zdarzenia
                   WHERE okres BETWEEN '1998-01-01' AND '2010-12-31') AND okres <= '2013-06-30' ORDER BY seria, okres""").df()
w['okres'] = pd.to_datetime(w.okres)
print('zdarzeń', len(z), 'tygodni', len(w), flush=True)
REGULY = ['czas 13', 'czas 26', 'czas 52', 'czas 104', 'trailing 15', 'trailing 25', 'trailing 35', 'SMA 10', 'SMA 30',
          'stop 15 + trailing 25', 'SMA 10 + stop 15']


def wyjscie(c, sma10, sma30, i0, regula):
    """Indeks tygodnia wyjścia (decyzja na zamknięciu) dla wejścia w i0; c = ceny serii."""
    n = len(c); kon = min(n - 1, i0 + HMAX)
    p0 = c[i0]; mx = p0
    for j in range(i0 + 1, kon + 1):
        mx = max(mx, c[j])
        if regula.startswith('czas'):
            if j - i0 >= int(regula.split()[1]): return j
        elif regula.startswith('trailing'):
            if c[j] <= mx * (1 - int(regula.split()[1]) / 100): return j
        elif regula == 'SMA 10':
            if c[j] < sma10[j]: return j
        elif regula == 'SMA 30':
            if c[j] < sma30[j]: return j
        elif regula == 'stop 15 + trailing 25':
            if c[j] <= p0 * 0.85 or c[j] <= mx * 0.75: return j
        elif regula == 'SMA 10 + stop 15':
            if c[j] < sma10[j] or c[j] <= p0 * 0.85: return j
    return kon


rows = []
z = z.sort_values(['seria', 'okres'])
zs = {s: g for s, g in z.groupby('seria')}
for s, g in w.groupby('seria', sort=False):
    if s not in zs: continue
    c = g.c.to_numpy(float); ok = g.okres.to_numpy()
    dvd = g.dv.to_numpy(float) / 5
    sma10 = pd.Series(c).rolling(10).mean().to_numpy(); sma30 = pd.Series(c).rolling(30).mean().to_numpy()
    pos = {t: i for i, t in enumerate(ok)}
    for t in zs[s].okres.to_numpy():
        i0 = pos.get(t)
        if i0 is None: continue
        k_in = 0.001 if dvd[i0] >= 2e7 else (0.0025 if dvd[i0] >= 5e6 else 0.005)
        for r in REGULY:
            j = wyjscie(c, sma10, sma30, i0, r)
            if j <= i0: continue
            k_out = 0.001 if dvd[j] >= 2e7 else (0.0025 if dvd[j] >= 5e6 else 0.005)
            zw = c[j] / c[i0] * (1 - k_in) * (1 - k_out) - 1
            mxz = c[i0:j + 1].max() / c[i0] - 1
            rows.append((s, t, r, zw, j - i0, mxz, int(j == len(c) - 1 and pd.Timestamp(ok[j]) >= GRANICA - pd.Timedelta(days=7))))
T = pd.DataFrame(rows, columns=['seria', 'okres', 'regula', 'zw', 'tyg', 'max_zw', 'przymus'])
T['mies'] = pd.to_datetime(T.okres).dt.to_period('M').astype(str)
print('transakcji', len(T), flush=True)
wm = lambda v: v.clip(v.quantile(0.01), v.quantile(0.99)).mean()
S = T.groupby('regula').agg(n=('zw', 'size'), sr_zwrot_w=('zw', wm), mediana=('zw', 'median'), trafione=('zw', lambda v: (v > 0).mean()),
                            sr_tyg=('tyg', 'mean'), med_tyg=('tyg', 'median'), przymus=('przymus', 'mean')).reindex(REGULY)
S['zwrot_na_tydz_%'] = S.sr_zwrot_w / S.sr_tyg * 100
S['rocznie_przy_ciaglym_inwest_%'] = ((1 + S.sr_zwrot_w / S.sr_tyg) ** 52 - 1) * 100
cap = T[T.max_zw > 0.05].groupby('regula').apply(lambda v: (v.zw.clip(-1, None) / v.max_zw).clip(-2, 1).median()).reindex(REGULY)
S['mediana_czesci_ruchu'] = cap
# bootstrap blokowy: zwrot na tydzień (średnia winsoryzowana zwrotu / średni czas) każdej reguły
piv_z = T.pivot_table(index=['seria', 'okres'], columns='regula', values='zw')
piv_t = T.pivot_table(index=['seria', 'okres'], columns='regula', values='tyg')
piv_z = piv_z.clip(piv_z.quantile(0.01), piv_z.quantile(0.99), axis=1)
mies = pd.to_datetime(piv_z.index.get_level_values(1)).to_period('M').astype(str)
idx = list(pd.Series(range(len(mies))).groupby(mies.to_numpy()).indices.values())
Z, TT = piv_z[REGULY].to_numpy(), piv_t[REGULY].to_numpy()
tempo = lambda ii: np.nanmean(Z[ii], 0) / np.nanmean(TT[ii], 0)
t_all = tempo(slice(None)); best = int(np.nanargmax(t_all))
bs = np.array([tempo(np.concatenate([idx[i] for i in rng.integers(0, len(idx), len(idx))])) for _ in range(B)])
dif = bs - bs[:, [best]]
p = [max(2 * min((dif[:, k] <= 0).mean(), (dif[:, k] >= 0).mean()), 1 / B) if k != best else 1.0 for k in range(len(REGULY))]
S['roznica_vs_najlepsza_pp_tydz'] = (t_all - t_all[best]) * 100
S['ci95_roznicy'] = [f'{np.percentile(dif[:, k], 2.5)*100:.3f}…{np.percentile(dif[:, k], 97.5)*100:.3f}' for k in range(len(REGULY))]
S['q_BH'] = multipletests(p, method='fdr_bh')[1]
# po latach: zwrot na tydzień
L = T.assign(rok=pd.to_datetime(T.okres).dt.year).groupby(['rok', 'regula']).apply(lambda v: wm(v.zw) / v.tyg.mean() * 100).unstack()[REGULY]
out = ['# Etap 7: reguły wyjścia i czas trzymania (wejście = świeże wybicie 1998-2010, próba ucząca)', '',
       f'Wejść: {T.groupby(["seria","okres"]).ngroups:,}; transakcji (wejście × reguła): {len(T):,}. Zwroty netto kosztów; '
       f'przymus = odsetek wyjść wymuszonych granicą 2013-06-30 lub końcem danych serii (wycofanie).', '',
       '"rocznie_przy_ciaglym_inwest" zakłada natychmiastowe ponowne zainwestowanie w podobną transakcję (miara tempa, nie wynik portfela).', '',
       S.round(4).reset_index().to_markdown(index=False), '', f'Najlepsza reguła pod względem zwrotu na tydzień: {REGULY[best]}.', '',
       '## Zwrot na tydzień trzymania (%) po latach wejścia', '', L.round(3).reset_index().to_markdown(index=False), '']
open(os.path.join(WYN, 'r13_wyjscie.md'), 'w').write('\n'.join(out))
print('\n'.join(out))
