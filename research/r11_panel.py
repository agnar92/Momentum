"""Etap 6a: panel miesięczny spółka-miesiąc na cały okres (cechy z r10 + zwroty przyszłe), zapis do Parquet poza repo.

Zwroty przyszłe f1..f12 policzone dla wszystkich miesięcy; skrypty analizy same pilnują granic prób
(uczenie: sygnał <= 2012-06, walidacja 2013-07 ... 2018-12, test >= 2019-07 dopiero w etapie 10).
koniec1 = 1, gdy seria kończy się w miesiącu t+1 (wycofanie / przerwa): do wariantu z karą za wycofanie.
"""
import os, warnings, duckdb, numpy as np, pandas as pd
warnings.filterwarnings('ignore')
DB = os.environ.get('RESEARCH_DB', '/home/user/ndx/db/research.duckdb')
OUT = os.path.join(os.path.dirname(DB), 'panel_m.parquet')
con = duckdb.connect(DB, read_only=True)
con.execute(f"SET threads=4; SET memory_limit='10GB'; SET temp_directory='{os.path.dirname(DB)}/duckdb_tmp'")
# cechy dzienne zagregowane do miesiąca: zmienność dzienna, największy dzienny wzrost, odsetek dni wzrostowych
dm = con.execute("""SELECT ticker, date_trunc('month', date)::DATE okres, stddev(r_adj) rv_d, max(r_adj) max_d,
                       avg((r_adj > 0)::INT) up_d, count(*) n_d
                    FROM dc WHERE date BETWEEN '1993-01-01' AND '2026-12-31' GROUP BY 1, 2""").df()
m = con.execute("""SELECT ticker, seria, okres, c, vol, dv, ok FROM m WHERE okres BETWEEN '1993-01-01' AND '2026-12-31'
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
m['f3_abs'] = np.nan
koniec = g.okres.transform('max')
m['koniec1'] = ((m.okres + pd.DateOffset(months=1)) >= koniec).astype(int) & (koniec < m.okres.max())
m['koniec1'] = m.koniec1.astype(int)
m['dv1'] = m.dv
kol = ['ticker', 'seria', 'okres', 'c', 'ok', 'dv1', 'koniec1', 'r1m', 'r3', 'r6', 'r12', 'r12_1', 'r36_12', 'od_max12', 'od_min12', 'od_ath',
       'rv1', 'rv12', 'zawezenie', 'zakres3', 'max_d', 'up_d', 'seria_wzr', 'vol_zm', 'log_dv', 'sez_wlasna', 'f1', 'f3', 'f6', 'f12']
m[kol].to_parquet(OUT)
print('panel', len(m), 'ok', int(m.ok.sum()), OUT)
