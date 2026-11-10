"""Etap 2b: tabela ruchów (zygzak na tygodniowych zamknięciach skorygowanych).

Dla progu odwrócenia Y (15/25/35 %): szczyt jest potwierdzony, gdy cena spadnie o Y od maksimum; dołek, gdy wzrośnie
o -ln(1-Y) w logarytmie (symetrycznie: 25 % spadku <-> 33,3 % wzrostu). Ruch w górę = dołek -> szczyt, w dół = szczyt -> dołek.
Wewnątrz ruchu w górę z definicji nie ma obsunięcia >= Y od bieżącego maksimum.

Kolumny: ticker, y, kier (+1/-1), t0 (tydzień dołka/szczytu startu), p0, t1 (tydzień ekstremum końca), p1, zmiana = p1/p0-1,
tyg = tygodnie t0->t1, t_wyb = pierwszy tydzień po t0 z zamknięciem > max zamknięć z 26 poprzednich tygodni (tylko kier=+1),
p_wyb, zysk_wyb = p1/p_wyb-1, tyg_wyb = tygodnie t_wyb->t1, t_kon = tydzień potwierdzenia końca (odwrócenie o Y),
status: 'zakonczony' | 'trwa' (ostatni ruch spółki notowanej na końcu danych = obserwacja ucięta) |
        'wycofana' (ostatni ruch spółki, która zniknęła z notowań; koniec = ostatnia cena), ok_t0 / ok_wyb = płynność.
Uwaga: t1 i t_kon są znane dopiero po fakcie; ta tabela służy do OPISU ruchów (etap 3), nie do sygnałów.
"""
import os, time, duckdb, numpy as np, pandas as pd
DB = os.environ.get('RESEARCH_DB', '/home/user/ndx/db/research.duckdb')
PROGI = [0.15, 0.25, 0.35]


def zygzak(lp, y):
    """lp: log ceny. Zwraca pivoty (indeks ekstremum, typ: +1 szczyt / -1 dołek, indeks potwierdzenia)
    i ostatnie, jeszcze niepotwierdzone ekstremum (indeks, typ) albo None."""
    dn = np.log(1 - y); up = -dn
    piv = []; kier = 0; hi_i = lo_i = 0
    for i in range(1, len(lp)):
        if kier == 0:
            if lp[i] > lp[hi_i]: hi_i = i
            if lp[i] < lp[lo_i]: lo_i = i
            if lp[i] - lp[hi_i] <= dn: piv.append((hi_i, 1, i)); kier = -1; lo_i = i
            elif lp[i] - lp[lo_i] >= up: piv.append((lo_i, -1, i)); kier = 1; hi_i = i
        elif kier == 1:
            if lp[i] > lp[hi_i]: hi_i = i
            elif lp[i] - lp[hi_i] <= dn: piv.append((hi_i, 1, i)); kier = -1; lo_i = i
        else:
            if lp[i] < lp[lo_i]: lo_i = i
            elif lp[i] - lp[lo_i] >= up: piv.append((lo_i, -1, i)); kier = 1; hi_i = i
    ostatni = (hi_i, 1) if kier == 1 else ((lo_i, -1) if kier == -1 else None)
    return piv, ostatni


def ruchy_spolki(tk, ok, c, y, koniec_danych, wycofana):
    lp = np.log(c)
    piv, ost = zygzak(lp, y)
    wyn = []
    pts = [(i, typ, kon) for i, typ, kon in piv]
    if ost is not None:
        pts.append((ost[0], ost[1], None))
    runmax = pd.Series(c).shift(1).rolling(26, min_periods=26).max().to_numpy()
    for (i0, typ0, _), (i1, typ1, kon) in zip(pts[:-1], pts[1:]):
        if typ0 == typ1:
            continue
        kier = 1 if typ0 == -1 else -1
        if kon is not None: status = 'zakonczony'
        else: status = 'wycofana' if wycofana else 'trwa'
        r = dict(ticker=tk, y=y, kier=kier, t0=i0, t1=i1, t_kon=kon, status=status, p0=c[i0], p1=c[i1])
        if kier == 1:
            seg = np.arange(i0 + 1, i1 + 1)
            hit = seg[c[seg] > runmax[seg]]
            r['t_wyb'] = int(hit[0]) if len(hit) else -1
        else:
            r['t_wyb'] = -1
        wyn.append(r)
    return wyn


if __name__ == '__main__':
    t0 = time.time()
    con = duckdb.connect(DB)
    con.execute("SET threads=4; SET memory_limit='11GB'")
    koniec = con.execute("SELECT max(okres) FROM w").fetchone()[0]
    w = con.execute("""SELECT w.ticker, w.okres, w.c, w.ok, s.is_delisted, s.last_date FROM w JOIN sec s USING (ticker)
                       WHERE w.c > 0 ORDER BY w.ticker, w.okres""").df()
    print('wczytano', len(w), f'{time.time()-t0:.0f} s')
    gr = np.flatnonzero(np.r_[True, w.ticker.values[1:] != w.ticker.values[:-1], True])
    okres = w.okres.values; c_all = w.c.to_numpy(float); ok_all = w.ok.to_numpy(); tick = w.ticker.values
    ostatni_tydz = pd.Timestamp(koniec) - pd.Timedelta(days=21)
    wszystkie = []
    for y in PROGI:
        for a, b in zip(gr[:-1], gr[1:]):
            if b - a < 30: continue
            c = c_all[a:b]
            wycofana = pd.Timestamp(okres[b - 1]) < ostatni_tydz
            for r in ruchy_spolki(tick[a], ok_all[a:b], c, y, koniec, wycofana):
                for k in ('t0', 't1', 't_kon', 't_wyb'):
                    v = r[k]
                    r[k + '_i'] = v
                    r[k] = okres[a + v] if v is not None and v >= 0 else pd.NaT
                r['ok_t0'] = int(ok_all[a + r['t0_i']])
                r['ok_wyb'] = int(ok_all[a + r['t_wyb_i']]) if r['t_wyb_i'] >= 0 else 0
                r['p_wyb'] = c[r['t_wyb_i']] if r['t_wyb_i'] >= 0 else np.nan
                r['tyg'] = r['t1_i'] - r['t0_i']
                r['tyg_wyb'] = r['t1_i'] - r['t_wyb_i'] if r['t_wyb_i'] >= 0 else -1
                wszystkie.append(r)
        print('prog', y, len(wszystkie), f'{time.time()-t0:.0f} s')
    df = pd.DataFrame(wszystkie)
    df['zmiana'] = df.p1 / df.p0 - 1
    df['zysk_wyb'] = df.p1 / df.p_wyb - 1
    df = df.drop(columns=[c for c in df.columns if c.endswith('_i')])
    con.execute("CREATE OR REPLACE TABLE ruchy AS SELECT * FROM df")
    print(con.execute("SELECT y, kier, status, count(*) FROM ruchy GROUP BY ALL ORDER BY ALL").df().to_string())
