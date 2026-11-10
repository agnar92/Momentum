"""Etap 4a: zdarzenia = świeże wybicia na wykresie tygodniowym, z cechami (tylko przeszłość) i wynikami (przyszłość).

Wybicie: zamknięcie tygodnia t > max zamknięć z 26 poprzednich tygodni, w tygodniach t-4..t-1 nie było wybicia,
spółka płynna w tygodniu t (ok = 1), co najmniej 60 tygodni historii.
Cechy (dane do t włącznie): zwroty 4/13/26/52 tyg., odległość od szczytu/dołka 52 tyg. i szczytu wszech czasów, długość
i głębokość bazy, zawężanie zmienności, wolumen wybicia i bazy, akumulacja (wolumen tygodni wzrostowych / spadkowych),
siła zamknięcia tygodnia, rynek (SPY nad SMA 40 tyg., zwrot indeksu równoważonego 13 tyg.), wielkość (obroty).
Kształt do grupowania: 13 punktów log(c[t-k]/c[t]) (średnie z 4 tygodni) i 13 punktów log wolumenu względem średniej 52 tyg.
Wyniki: zwrot 4/13/26/52 tyg. (spółka wycofana: ostatnia cena), MFE/MAE 52 tyg., sukces = cena dochodzi do +50 % nad
zamknięciem wybicia, zanim spadnie o 25 % od bieżącego maksimum (horyzont 52 tyg.); warianty 30/15 i 100/35.
"""
import os, time, duckdb, numpy as np, pandas as pd
DB = os.environ.get('RESEARCH_DB', '/home/user/ndx/db/research.duckdb')
H = 52


def sukces(c, i, cel, dd, h=H):
    """Czy od zamknięcia c[i] cena osiągnie (1+cel)*c[i], zanim spadnie o dd od bieżącego maksimum (w h tygodniach)."""
    p0 = c[i]; mx = p0
    for j in range(i + 1, min(i + h + 1, len(c))):
        if c[j] >= p0 * (1 + cel): return 1
        mx = max(mx, c[j])
        if c[j] <= mx * (1 - dd): return 0
    return 0


def spolka(tk, okres, o, h, l, c, vol, dv, ok, spy_ok, ew13, wycofana):
    n = len(c)
    s = pd.Series(c)
    max26 = s.shift(1).rolling(26, min_periods=26).max().to_numpy()
    wyb = c > max26
    lc = np.log(c)
    r = np.r_[np.nan, np.diff(lc)]
    vs = pd.Series(vol.astype(float))
    out = []
    ost = -100
    for t in range(60, n):
        if not wyb[t]:
            continue
        if t - ost <= 4:
            ost = t; continue
        ost = t
        if not ok[t]:
            continue
        w52 = slice(t - 52, t)
        c52 = c[w52]
        mx52, mn52 = c52.max(), c52.min()
        ath = c[:t].max()
        # baza: tygodnie od ostatniego zamknięcia >= max26 (poprzedni szczyt) i głębokość od tego szczytu
        prev_hi = t - 1 - int(np.argmax(c[t - 26:t][::-1] == max26[t]))
        dl_bazy = t - prev_hi
        gl_bazy = max26[t] / c[prev_hi:t].min() - 1 if dl_bazy > 0 else 0.0
        rr = r[t - 52 + 1:t + 1]
        v10 = vol[t - 10:t].mean(); v52 = vol[t - 52:t].mean()
        up = r[t - 10:t] > 0
        vu, vd = vol[t - 10:t][up].sum(), vol[t - 10:t][~up].sum()
        ksz_c = np.log(c[t - 52:t].reshape(13, 4).mean(1) / c[t])
        ksz_v = np.log((vol[t - 52:t].reshape(13, 4).mean(1) + 1) / (v52 + 1))
        f = dict(ticker=tk, okres=okres[t], cena=c[t],
                 r4=c[t] / c[t - 4] - 1, r13=c[t] / c[t - 13] - 1, r26=c[t] / c[t - 26] - 1, r52=c[t] / c[t - 52] - 1,
                 od_max52=c[t] / mx52 - 1, od_min52=c[t] / mn52 - 1, od_ath=c[t] / ath - 1, nowy_ath=int(c[t] > ath),
                 dl_bazy=dl_bazy, gl_bazy=gl_bazy,
                 zmn_10_52=np.nanstd(r[t - 9:t + 1]) / np.nanstd(rr) if np.nanstd(rr) > 0 else np.nan,
                 zmn_52=np.nanstd(rr),
                 vol_wyb=vol[t] / v10 if v10 > 0 else np.nan, vol_baza=v10 / v52 if v52 > 0 else np.nan,
                 akum=np.log((vu + 1) / (vd + 1)),
                 sila=(c[t] - l[t]) / (h[t] - l[t]) if h[t] > l[t] else 0.5,
                 wyb_proc=c[t] / max26[t] - 1,
                 spy_ok=spy_ok[t], ew13=ew13[t], log_dv=np.log(dv[t - 10:t + 1].mean() + 1))
        for k in range(13):
            f[f'kc{k}'] = ksz_c[k]; f[f'kv{k}'] = ksz_v[k]
        # wyniki
        for hh in (4, 13, 26, 52):
            j = min(t + hh, n - 1)
            f[f'f{hh}'] = c[j] / c[t] - 1 if (t + hh < n or wycofana) and j > t else np.nan
        fut = c[t + 1:t + H + 1]
        f['mfe52'] = fut.max() / c[t] - 1 if len(fut) else np.nan
        f['mae52'] = fut.min() / c[t] - 1 if len(fut) else np.nan
        f['pelny_h'] = int(t + H < n or wycofana)
        f['s50'] = sukces(c, t, 0.5, 0.25); f['s30'] = sukces(c, t, 0.3, 0.15); f['s100'] = sukces(c, t, 1.0, 0.35)
        out.append(f)
    return out


if __name__ == '__main__':
    t0 = time.time()
    con = duckdb.connect(DB)
    con.execute("SET threads=4; SET memory_limit='11GB'")
    koniec = pd.Timestamp(con.execute("SELECT max(okres) FROM w").fetchone()[0])
    rw = con.execute("""SELECT okres, spy, ew_r FROM rynek_w ORDER BY okres""").df()
    rw['spy_ok'] = (rw.spy > rw.spy.rolling(40, min_periods=40).mean()).astype(float)
    rw.loc[rw.spy.isna(), 'spy_ok'] = np.nan
    rw['ew13'] = np.exp(np.log1p(rw.ew_r.fillna(0)).rolling(13).sum()) - 1
    rw = rw.set_index('okres')
    w = con.execute("""SELECT ticker, okres, o, h, l, c, vol, dv, ok, ostatni FROM w WHERE c > 0 ORDER BY ticker, okres""").df()
    print('wczytano', len(w), f'{time.time()-t0:.0f} s')
    spy_ok = rw.spy_ok.reindex(w.okres).to_numpy(); ew13 = rw.ew13.reindex(w.okres).to_numpy()
    gr = np.flatnonzero(np.r_[True, w.ticker.values[1:] != w.ticker.values[:-1], True])
    kol = {k: w[k].to_numpy() for k in ['o', 'h', 'l', 'c', 'vol', 'dv', 'ok']}
    okres = w.okres.values; tick = w.ticker.values
    wyn = []
    for i, (a, b) in enumerate(zip(gr[:-1], gr[1:])):
        if b - a < 70: continue
        wycofana = pd.Timestamp(okres[b - 1]) < koniec - pd.Timedelta(days=21)
        wyn += spolka(tick[a], okres[a:b], *(kol[k][a:b].astype(float) for k in ['o', 'h', 'l', 'c', 'vol', 'dv']),
                      kol['ok'][a:b], spy_ok[a:b], ew13[a:b], wycofana)
        if i % 5000 == 0: print(i, len(wyn), f'{time.time()-t0:.0f} s', flush=True)
    df = pd.DataFrame(wyn)
    con.execute("CREATE OR REPLACE TABLE zdarzenia AS SELECT * FROM df")
    print('zdarzenia', len(df), f'{time.time()-t0:.0f} s')
    # tylko próba ucząca (protokół: wyniki z okresu walidacji i testu nie są oglądane)
    df['rok'] = pd.to_datetime(df.okres).dt.year
    u = df[(df.rok >= 1998) & (pd.to_datetime(df.okres) <= '2012-06-30')]
    print(u.groupby('rok').agg(n=('ticker', 'size'), s50=('s50', 'mean'), f52=('f52', 'median')).round(3).to_string())
