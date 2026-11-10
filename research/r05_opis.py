"""Etap 3: opis statystyczny ruchów (P5 czas trwania, P6 wygasanie). Tylko próba ucząca.

Jednostka: ruch w górę z wybiciem (pierwsze zamknięcie tygodnia > max 26 poprzednich tygodni) i płynnością w tygodniu
wybicia. Start zegara = tydzień wybicia (moment widoczny na żywo). Koniec = szczyt ruchu (t1); ruch "żyje", dopóki
nie spadnie o Y od szczytu. Ruchy z wybiciem 1998-01-01 ... 2012-12-31; wszystko po 2013-06-30 jest ucinane
(cenzurowanie), więc nie czytamy cen z okresu walidacji.

Dwie perspektywy:
 (a) bezwarunkowa: WSZYSTKIE wybicia w ruchach w górę (tak widzi je inwestor) -> zysk wybicie->szczyt, czas do szczytu,
     funkcja hazardu końca ruchu w tygodniach od wybicia;
 (b) warunkowa: tylko ruchy, które okazały się duże (zmiana dołek->szczyt >= 30/50/100 %) -> typowy czas i zysk.
Przedziały 95 %: bootstrap blokowy po miesiącach kalendarzowych wybicia (2000 losowań), bo wybicia z tego samego
miesiąca są zależne (wspólny rynek).
"""
import os, warnings, duckdb, numpy as np, pandas as pd
from lifelines import KaplanMeierFitter, WeibullFitter, ExponentialFitter
warnings.filterwarnings('ignore')
DB = os.environ.get('RESEARCH_DB', '/home/user/ndx/db/research.duckdb')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'wyniki', 'r05_opis.md')
KONIEC_UCZ = pd.Timestamp('2013-06-30')
B = 2000
rng = np.random.default_rng(20261110)
con = duckdb.connect(DB, read_only=True)


def blok_ci(df, stat, key='mies', b=B):
    """Bootstrap blokowy: losujemy miesiące wybicia ze zwracaniem i liczymy statystykę na sklejonej próbie."""
    df = df.reset_index(drop=True)
    idx = list(df.groupby(key).indices.values())
    wyn = []
    for _ in range(b):
        wyb = rng.integers(0, len(idx), len(idx))
        wyn.append(stat(df.iloc[np.concatenate([idx[i] for i in wyb])]))
    return np.nanpercentile(wyn, [2.5, 97.5])


def fmt(v, ci, p=1, pct=False):
    m = 100 if pct else 1
    return f'{v*m:.{p}f} ({ci[0]*m:.{p}f}-{ci[1]*m:.{p}f})'


def przygotuj(y):
    r = con.execute("""SELECT r.*, s.is_delisted FROM ruchy r JOIN sec s USING (ticker)
        WHERE y = ? AND kier = 1 AND t_wyb IS NOT NULL AND ok_wyb = 1
          AND t_wyb BETWEEN '1998-01-01' AND '2012-12-31'""", [y]).df()
    for k in ('t0', 't1', 't_kon', 't_wyb'):
        r[k] = pd.to_datetime(r[k])
    # cenzurowanie na końcu próby uczącej: koniec ruchu znany dopiero po 2013-06-30 -> obserwacja ucięta
    po = r.t_kon.isna() | (r.t_kon > KONIEC_UCZ)
    r['zdarzenie'] = (~po & (r.status != 'trwa')).astype(int)
    r.loc[r.status == 'wycofana', 'zdarzenie'] = 1  # koniec notowań = koniec ruchu (wyjście po ostatniej cenie)
    r.loc[po & (r.status != 'wycofana'), 'zdarzenie'] = 0
    # czas od wybicia do szczytu; dla uciętych: do 2013-06-30 albo do szczytu, jeśli wcześniej
    t_end = r.t1.where(r.zdarzenie == 1, np.minimum(r.t1.fillna(KONIEC_UCZ), KONIEC_UCZ))
    r['tyg'] = ((t_end - r.t_wyb).dt.days / 7).round().clip(lower=0)
    r['mies'] = r.t_wyb.dt.to_period('M')
    return r


out = ['# Etap 3: opis statystyczny ruchów (próba ucząca, wybicia 1998-2012)', '']
for y in [0.25, 0.15, 0.35]:
    r = przygotuj(y)
    zak = r[r.zdarzenie == 1]
    out += [f'## Próg odwrócenia Y = {int(y*100)} %', '',
            f'Wybić w ruchach w górę (płynnych w tygodniu wybicia): {len(r):,}; zakończonych w próbie: {len(zak):,}; '
            f'uciętych: {len(r)-len(zak):,}; niezależnych miesięcy wybicia: {r.mies.nunique()}.', '']
    # (a) bezwarunkowo: rozkład zysku wybicie -> szczyt (tylko zakończone; ucięte zaniżałyby zysk)
    q = [0.1, 0.25, 0.5, 0.75, 0.9]
    rows = []
    for nm, col, pct in [('zysk wybicie->szczyt [%]', 'zysk_wyb', True), ('tygodnie wybicie->szczyt', 'tyg', False)]:
        for qq in q:
            v = zak[col].quantile(qq)
            ci = blok_ci(zak, lambda d: d[col].quantile(qq))
            rows.append((nm, f'{int(qq*100)}. percentyl', fmt(v, ci, 1, pct)))
    rows.append(('zysk wybicie->szczyt [%]', 'średnia', fmt(zak.zysk_wyb.mean(), blok_ci(zak, lambda d: d.zysk_wyb.mean()), 1, True)))
    for x in [0.3, 0.5, 1.0]:
        rows.append((f'odsetek wybić kończących się zyskiem >= {int(x*100)} % do szczytu', '', fmt((zak.zysk_wyb >= x).mean(), blok_ci(zak, lambda d: (d.zysk_wyb >= x).mean()), 1, True)))
    out += ['### (a) Wszystkie wybicia (zakończone ruchy)', '', pd.DataFrame(rows, columns=['miara', '', 'wartość (95 %)']).to_markdown(index=False), '',
            'Zysk do szczytu to górna granica: realne wyjście jest zawsze po spadku od szczytu.', '']
    # Kaplan-Meier i hazard (wszystkie, z ucięciem)
    km = KaplanMeierFitter().fit(r.tyg, r.zdarzenie)
    tyg = [4, 8, 13, 26, 52, 104]
    s = km.survival_function_at_times(tyg).to_numpy()
    ci_km = [blok_ci(r, lambda d, t=t: KaplanMeierFitter().fit(d.tyg, d.zdarzenie).survival_function_at_times([t]).iloc[0], 'mies', 500) for t in tyg] if y == 0.25 else [(np.nan, np.nan)] * len(tyg)
    # hazard dyskretny: P(szczyt w tygodniu [t, t+k) | ruch trwał do t)
    edges = [0, 4, 8, 13, 26, 52, 104, 1000]
    hz = []
    for a, b in zip(edges[:-1], edges[1:]):
        at = (r.tyg >= a).sum(); ev = ((r.tyg >= a) & (r.tyg < b) & (r.zdarzenie == 1)).sum()
        hz.append((f'{a}-{b if b < 1000 else "..."}', at, ev, ev / at / (min(b, 260) - a) if at else np.nan))
    out += ['### Jak długo wybicie "żyje" (Kaplan-Meier, z ucięciem)', '',
            pd.DataFrame({'tygodnie od wybicia': tyg, 'odsetek ruchów jeszcze przed szczytem': [f'{v*100:.1f}' + (f' ({c[0]*100:.1f}-{c[1]*100:.1f})' if not np.isnan(c[0]) else '') for v, c in zip(s, ci_km)]}).to_markdown(index=False), '',
            f'Mediana czasu do szczytu: {km.median_survival_time_:.0f} tyg.', '',
            'Hazard (szansa, że szczyt przypada w danym tygodniu, jeśli ruch dotrwał do początku przedziału):', '',
            pd.DataFrame(hz, columns=['przedział tygodni', 'w ryzyku', 'szczytów', 'hazard na tydzień']).round(4).to_markdown(index=False), '']
    # Weibull vs wykładniczy: kształt k < 1 = im dłużej trwa, tym mniejsza szansa końca (ruch się nie starzeje)
    t_pos = r.tyg.clip(lower=0.5)
    wb = WeibullFitter().fit(t_pos, r.zdarzenie); ex = ExponentialFitter().fit(t_pos, r.zdarzenie)
    lr = 2 * (wb.log_likelihood_ - ex.log_likelihood_)
    k_ci = blok_ci(r.assign(t=t_pos), lambda d: WeibullFitter().fit(d.t, d.zdarzenie).rho_, 'mies', 300) if y == 0.25 else (np.nan, np.nan)
    out += [f'Weibull: kształt k = {wb.rho_:.3f}' + (f' (95 % blokowo: {k_ci[0]:.3f}-{k_ci[1]:.3f})' if not np.isnan(k_ci[0]) else '') +
            f'; test ilorazu wiarygodności vs wykładniczy: LR = {lr:.1f} (1 st. swobody). k < 1: hazard maleje z wiekiem ruchu.', '']
    # (b) warunkowo na dużym ruchu
    rows = []
    for x in [0.3, 0.5, 1.0]:
        d = zak[zak.zmiana >= x]
        if len(d) < 30: continue
        rows.append((f'>= {int(x*100)} %', len(d), d.mies.nunique(),
                     fmt(d.tyg.median(), blok_ci(d, lambda e: e.tyg.median()), 0),
                     fmt(d.zysk_wyb.median(), blok_ci(d, lambda e: e.zysk_wyb.median()), 1, True),
                     f'{(d.t_wyb - d.t0).dt.days.median()/7:.0f}'))
    out += ['### (b) Tylko ruchy, które okazały się duże (dołek->szczyt)', '',
            pd.DataFrame(rows, columns=['ruch', 'n', 'miesięcy', 'mediana tygodni wybicie->szczyt (95 %)', 'mediana zysku wybicie->szczyt (95 %)', 'mediana tygodni dołek->wybicie']).to_markdown(index=False), '']
    # liczba dużych ruchów na rok (stabilność w czasie)
    if y == 0.25:
        rok = zak.assign(rok=zak.t_wyb.dt.year).groupby('rok').agg(wybic=('ticker', 'size'), duze50=('zmiana', lambda v: (v >= 0.5).sum()),
                                                                   mediana_zysku=('zysk_wyb', 'median'), mediana_tyg=('tyg', 'median')).reset_index()
        rok['udzial_duzych'] = (rok.duze50 / rok.wybic).round(3)
        out += ['### Po latach (Y = 25 %, zakończone)', '', rok.round(3).to_markdown(index=False), '']
    print(f'Y={y} gotowe')

open(OUT, 'w').write('\n'.join(out))
print('\n'.join(out))
