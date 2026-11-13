"""Etap 3: opis statystyczny ruchów (P5 czas trwania, P6 wygasanie). Tylko próba ucząca.

Jednostka: ruch w górę z wybiciem (pierwsze zamknięcie tygodnia > max 26 poprzednich tygodni) i płynnością w tygodniu
wybicia. Start zegara = tydzień wybicia (moment widoczny na żywo). Koniec = szczyt ruchu (t1); ruch "żyje", dopóki
nie spadnie o Y od szczytu. Ruchy z wybiciem 1998-01-01 ... 2012-12-31; wszystko po 2013-06-30 jest ucinane
(cenzurowanie), więc nie czytamy cen z okresu walidacji.

Dwie perspektywy:
 (a) bezwarunkowa: WSZYSTKIE świeże wybicia (tabela zdarzenia, r06) -> ruch trwa, dopóki cena nie spadnie o Y od maksimum
     po wybiciu; czas życia = wybicie -> tydzień tego spadku (czas trzymania z trailing stopem Y), zysk i czas do szczytu,
     hazard końca w tygodniach od wybicia, Weibull.
 (b) warunkowa: ruchy potwierdzone zygzakiem (tabela ruchy). Zygzak potwierdza ruch w górę dopiero po wzroście o
     -ln(1-Y) od dołka, więc te ruchy są z definicji udane; to opis "jak wyglądają duże ruchy", nie szansa sukcesu.
     (Pierwsza wersja tego skryptu nazywała (b) bezwarunkową; błąd selekcji poprawiony, protokół: odstępstwo 5.)
Przedziały 95 %: bootstrap blokowy po miesiącach kalendarzowych wybicia (2000 losowań), bo wybicia z tego samego
miesiąca są zależne (wspólny rynek).
"""
import os, warnings, duckdb, numpy as np, pandas as pd
from przezycie import km, km_mediana, weibull
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
    r = con.execute("""SELECT r.* FROM ruchy r
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
z = con.execute("""SELECT * FROM zdarzenia WHERE okres BETWEEN '1998-01-01' AND '2012-12-31'""").df()
for k in ('okres', 'kon15', 'kon25', 'kon35', 'ost_tydz'):
    z[k] = pd.to_datetime(z[k])
z['mies'] = z.okres.dt.to_period('M')
for y in [25, 15, 35]:
    d = z.copy()
    kon = d[f'kon{y}']
    # koniec przez wycofanie z notowań = koniec ruchu w ostatnim tygodniu notowań
    kon = kon.where(kon.notna() | (d.wycofana == 0), d.ost_tydz)
    d['zdarzenie'] = (kon.notna() & (kon <= KONIEC_UCZ)).astype(int)
    koniec = kon.where(d.zdarzenie == 1, KONIEC_UCZ)
    d['zycie'] = ((koniec - d.okres).dt.days / 7).round().clip(lower=1)
    d['tpk'] = d[f'tpk{y}']; d['zpk'] = d[f'zpk{y}']
    zak = d[d.zdarzenie == 1]
    out += [f'## Próg trailing stopu / końca ruchu Y = {y} %', '',
            f'Świeżych wybić (płynnych): {len(d):,}; zakończonych w próbie: {len(zak):,}; uciętych na 2013-06-30: {len(d)-len(zak):,}; '
            f'niezależnych miesięcy: {d.mies.nunique()}.', '']
    q = [0.1, 0.25, 0.5, 0.75, 0.9]
    rows = []
    for nm, col, pct in [('zysk wybicie->szczyt [%]', 'zpk', True), ('tygodnie wybicie->szczyt', 'tpk', False)]:
        for qq in q:
            rows.append((nm, f'{int(qq*100)}. percentyl', fmt(zak[col].quantile(qq), blok_ci(zak, lambda e, c=col, qq=qq: e[c].quantile(qq)), 1, pct)))
    wm = lambda v: v.clip(v.quantile(0.01), v.quantile(0.99)).mean()
    rows.append(('zysk wybicie->szczyt [%]', 'średnia winsoryzowana 1/99 %', fmt(wm(zak.zpk), blok_ci(zak, lambda e: wm(e.zpk)), 1, True)))
    for x in [0.3, 0.5, 1.0]:
        rows.append((f'odsetek wybić ze szczytem >= +{int(x*100)} %', '', fmt((zak.zpk >= x).mean(), blok_ci(zak, lambda e, x=x: (e.zpk >= x).mean()), 1, True)))
    out += ['### (a) Wszystkie świeże wybicia: zysk i czas do szczytu (zakończone)', '',
            pd.DataFrame(rows, columns=['miara', '', 'wartość (95 %)']).to_markdown(index=False), '',
            'Zysk do szczytu to górna granica zysku; po szczycie cena spada o Y, zanim ruch uznamy za zakończony.', '']
    tyg = [4, 8, 13, 26, 52, 104]
    s_km = km(d.zycie, d.zdarzenie, tyg)
    nb = 500 if y == 25 else 0
    ci_km = [blok_ci(d, lambda e, t=t: km(e.zycie, e.zdarzenie, [t])[0], 'mies', nb) if nb else (np.nan, np.nan) for t in tyg]
    edges = [0, 4, 8, 13, 26, 52, 104, 1000]
    hz = []
    for a_, b_ in zip(edges[:-1], edges[1:]):
        at = (d.zycie > a_).sum(); ev = ((d.zycie > a_) & (d.zycie <= b_) & (d.zdarzenie == 1)).sum()
        hz.append((f'{a_}-{b_ if b_ < 1000 else "..."}', at, ev, ev / at / (min(b_, 260) - a_) if at else np.nan))
    out += [f'### Czas życia ruchu (trzymanie z trailing stopem {y} %), Kaplan-Meier z ucięciem', '',
            pd.DataFrame({'tygodnie od wybicia': tyg, 'odsetek ruchów wciąż żywych (95 %)': [f'{v*100:.1f}' + (f' ({c[0]*100:.1f}-{c[1]*100:.1f})' if not np.isnan(c[0]) else '') for v, c in zip(s_km, ci_km)]}).to_markdown(index=False), '',
            f'Mediana czasu życia: {km_mediana(d.zycie, d.zdarzenie):.0f} tyg.', '',
            'Hazard końca ruchu (szansa końca na tydzień, jeśli ruch dotrwał do początku przedziału):', '',
            pd.DataFrame(hz, columns=['przedział tygodni', 'w ryzyku', 'końców', 'hazard na tydzień']).round(4).to_markdown(index=False), '']
    k_w, lam_w, ll_w, ll_1 = weibull(d.zycie, d.zdarzenie)
    k_ci = blok_ci(d, lambda e: weibull(e.zycie, e.zdarzenie)[0], 'mies', 300) if y == 25 else (np.nan, np.nan)
    out += [f'Weibull: kształt k = {k_w:.3f}' + (f' (95 % blokowo: {k_ci[0]:.3f}-{k_ci[1]:.3f})' if not np.isnan(k_ci[0]) else '') +
            f', skala = {lam_w:.1f} tyg.; LR vs wykładniczy = {2*(ll_w-ll_1):.1f}. k < 1: im dłużej ruch trwa, tym mniejsza szansa końca w kolejnym tygodniu.', '']
    if y == 25:
        rok = zak.assign(rok=zak.okres.dt.year).groupby('rok').agg(wybic=('ticker', 'size'), szczyt50=('zpk', lambda v: (v >= 0.5).mean()),
              mediana_zysku=('zpk', 'median'), mediana_zycia=('zycie', 'median')).reset_index()
        out += ['### Po latach (Y = 25 %, zakończone)', '', rok.round(3).to_markdown(index=False), '']
    print(f'(a) Y={y} gotowe', flush=True)

# (b) ruchy potwierdzone zygzakiem (warunkowo)
for yy in [0.25]:
    r = przygotuj(yy)
    zak = r[r.zdarzenie == 1]
    rows = []
    for x in [0.5, 1.0, 2.0]:
        e = zak[zak.zmiana >= x]
        rows.append((f'>= {int(x*100)} %', len(e), fmt(e.tyg.median(), blok_ci(e, lambda f: f.tyg.median()), 0),
                     fmt(e.zysk_wyb.median(), blok_ci(e, lambda f: f.zysk_wyb.median()), 1, True),
                     f'{(e.t_wyb - e.t0).dt.days.median()/7:.0f}', f'{(e.t1 - e.t0).dt.days.median()/7:.0f}'))
    out += ['## (b) Warunkowo: ruchy potwierdzone zygzakiem (Y = 25 %), wybicie 1998-2012', '',
            'Opis "jak wyglądają duże ruchy", które już się wydarzyły; nie jest to szansa sukcesu wybicia.', '',
            pd.DataFrame(rows, columns=['ruch dołek->szczyt', 'n', 'mediana tyg. wybicie->szczyt (95 %)', 'mediana zysku wybicie->szczyt (95 %)',
                                        'mediana tyg. dołek->wybicie', 'mediana tyg. dołek->szczyt']).to_markdown(index=False), '']

open(OUT, 'w').write('\n'.join(out))
print('\n'.join(out))
