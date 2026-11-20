"""Etap 79: szukanie bez założeń — ok. 50 cech, wybór 2012–2016, sprawdzian 2017+, model LightGBM. Protokół: etap 79."""
import os
HERE = os.path.dirname(os.path.abspath(__file__))
_s = open(os.path.join(HERE, 'r101_etap76.py')).read()
exec(_s[:_s.index('# --- ocena jak na stronie ---')].replace("if not TEST: np.savez_compressed", "if False: np.savez_compressed"))
NOWE = ['log_kap', 'aktywa_1r', 'kapital_3l', 'zb_aktywa', 'narosty', 'capex_przych', 'zapasy_vs_przych', 'gotowka_aktywa', 'current_ratio', 'ksiegowa_rynkowa',
        'ev_przych', 'stopa_zysku', 'd_om_1r', 'd_om_3l', 'd_gm_3l', 'd_roe_3l', 'przysp_przych', 'przysp_zysku', 'najgorszy_rok_przych', 'zm_wzrostu_przych',
        'spadek_przych_5l', 'zm_zysku', 'dzwignia_oper', 'zysk_3l', 'przych_kw_rr', 'przysp_kw', 'akcje_1r', 'zwrot_3l', 'zwrot_5l', 'zmiennosc_12m', 'od_maks_12m']
for p in NOWE: X[p] = np.full((NT, NS), np.nan)
for j in range(NS):
    k = kod[j]
    if k not in cache: continue
    sq = cache[k]; capk = CAP[k] if k in CAP.columns else None
    rq = None
    fn = f'{SZ}/sec_q/{k}.json'
    if os.path.exists(fn) and (json.load(open(fn)) or {}).get('rev'):
        rq = Seria([(pd.Timestamp(e), v, pd.Timestamp(f)) for e, (v, f) in kwartaly(json.load(open(fn))['rev']['rows']).items()])
    c = Cv[:, j]
    for m in MI:
        i = im_[m]
        if not UNI[i, j]: continue
        t = m.to_timestamp(how='end'); x = {}
        mc = capk.get(m) if capk is not None else None
        mc = mc if mc is not None and np.isfinite(mc) and mc > 0 else None
        if mc: x['log_kap'] = np.log(mc)
        r0 = e0 = None
        if 'rev' in sq:
            e0, r0 = sq['rev'].teraz(t)
            if r0 and r0 > 0:
                lt = [sq['rev'].przy(t, e0 - n * Y) if n else r0 for n in range(6)]
                g = [lt[n] / lt[n + 1] - 1 for n in range(5) if lt[n] and lt[n + 1] and lt[n + 1] > 0]
                if len(g) == 5: x['najgorszy_rok_przych'] = min(g); x['zm_wzrostu_przych'] = -np.std(g)
                if X['rev_1y'][i, j] == X['rev_1y'][i, j] and X['rev_cagr3'][i, j] == X['rev_cagr3'][i, j]: x['przysp_przych'] = X['rev_1y'][i, j] - X['rev_cagr3'][i, j]
                pts = [p_ for p_ in sq['rev'].p if p_[2] <= t and (e0 - p_[0]).days <= 5 * 366]
                if len(pts) >= 12:
                    vv = np.array([p_[1] for p_ in pts]); x['spadek_przych_5l'] = (vv / np.maximum.accumulate(vv) - 1).min()
                if mc:
                    x['ev_przych'] = mc / r0
        if 'ni' in sq:
            e1, n0 = sq['ni'].teraz(t)
            if n0 is not None:
                if mc: x['stopa_zysku'] = n0 / mc
                a3 = sq['ni'].przy(t, e1 - 3 * Y)
                if a3 and a3 > 0 and n0 > 0: x['zysk_3l'] = (n0 / a3) ** (1 / 3) - 1
                if x.get('zysk_3l') is not None and X['ni_1y'][i, j] == X['ni_1y'][i, j]: x['przysp_zysku'] = X['ni_1y'][i, j] - x['zysk_3l']
                lt = [sq['ni'].przy(t, e1 - n * Y) if n else n0 for n in range(6)]
                if all(v_ is not None for v_ in lt) and r0: x['zm_zysku'] = -np.std(np.array(lt) / r0)
        if 'opinc' in sq and r0 and e0 is not None:
            eo, o0 = sq['opinc'].teraz(t)
            if o0 is not None:
                for lat, kk in ((1, 'd_om_1r'), (3, 'd_om_3l')):
                    oa, ra = sq['opinc'].przy(t, eo - lat * Y), sq['rev'].przy(t, eo - lat * Y)
                    if oa is not None and ra and ra > 0: x[kk] = o0 / r0 - oa / ra
                o3, r3 = sq['opinc'].przy(t, eo - 3 * Y), sq['rev'].przy(t, eo - 3 * Y)
                if o3 and o3 > 0 and o0 > 0 and r3 and r3 > 0: x['dzwignia_oper'] = (o0 / o3) ** (1 / 3) - (r0 / r3) ** (1 / 3)
        if 'gp' in sq and r0:
            eg, g0 = sq['gp'].teraz(t)
            if g0 is not None:
                g3, r3 = sq['gp'].przy(t, eg - 3 * Y), sq['rev'].przy(t, eg - 3 * Y)
                if g3 is not None and r3 and r3 > 0: x['d_gm_3l'] = g0 / r0 - g3 / r3
        if 'as' in sq:
            ea, av = sq['as'].teraz(t, 400)
            if av and av > 0:
                a1 = sq['as'].przy(t, ea - Y)
                if a1 and a1 > 0: x['aktywa_1r'] = av / a1 - 1
                if 'gp' in sq:
                    _, g0 = sq['gp'].teraz(t)
                    if g0 is not None: x['zb_aktywa'] = g0 / av
                if 'cash' in sq:
                    cv_ = sq['cash'].przy(t, ea)
                    if cv_ is not None: x['gotowka_aktywa'] = (cv_ + ((sq['sti'].przy(t, ea) or 0) if 'sti' in sq else 0)) / av
                fa = [z for z in sq['fcf_a'] if z[2] <= t]
                na = {e: v for e, v, f in sq.get('ni_a', []) if f <= t}
                if fa and (t - fa[-1][0]).days <= 450:
                    fr = [r for r in (FC.get(k) or []) if pd.Timestamp(r[1]) == fa[-1][0]]
                    if fr and na.get(fa[-1][0]) is not None and fr[0][2] is not None: x['narosty'] = -(na[fa[-1][0]] - fr[0][2]) / av
                    if fr and fr[0][3] is not None and r0: x['capex_przych'] = fr[0][3] / r0
        if 'eq' in sq:
            ee, eqv = sq['eq'].teraz(t)
            if eqv:
                e3 = sq['eq'].przy(t, ee - 3 * Y)
                if e3 and e3 > 0 and eqv > 0: x['kapital_3l'] = (eqv / e3) ** (1 / 3) - 1
                if mc: x['ksiegowa_rynkowa'] = eqv / mc
                r_now, r_3 = X['roe'][i, j], None
                n3, q3 = (sq['ni'].przy(t, ee - 3 * Y) if 'ni' in sq else None), e3
                if r_now == r_now and n3 is not None and q3 and q3 > 0: x['d_roe_3l'] = r_now - n3 / q3
        if 'ca' in sq and 'lc' in sq:
            ec, cav = sq['ca'].teraz(t, 400)
            lcv = sq['lc'].przy(t, ec) if ec is not None else None
            if cav is not None and lcv and lcv > 0: x['current_ratio'] = cav / lcv
            if 'inv' in sq and ec is not None:
                i0, i1 = sq['inv'].przy(t, ec), sq['inv'].przy(t, ec - Y)
                if i0 is not None and i1 and i1 > 0 and X['rev_1y'][i, j] == X['rev_1y'][i, j]: x['zapasy_vs_przych'] = -((i0 / i1 - 1) - X['rev_1y'][i, j])
        if rq is not None:
            eq_, q0 = rq.teraz(t, 200)
            if q0:
                q1, q4, q5 = rq.przy(t, eq_ - Y), rq.przy(t, eq_ - Y), None
                if q1 and q1 > 0:
                    x['przych_kw_rr'] = q0 / q1 - 1
                    pk = [p_ for p_ in rq.p if p_[2] <= t and p_[0] < eq_]
                    if len(pk) >= 5:
                        eprev = pk[-3][0] if len(pk) >= 3 else None
                        a, b = rq.przy(t, eq_ - Y / 4 * 4), rq.przy(t, eq_ - 2 * Y)
                        if a and b and b > 0: x['przysp_kw'] = x['przych_kw_rr'] - (a / b - 1)
        if 'sh' in sq:
            es, s0 = sq['sh'].teraz(t, 300)
            if s0:
                s1 = sq['sh'].przy(t, es - Y)
                if s1 and s1 > 0:
                    zm = s0 / (s1 * podziel(k, es - Y, es)) - 1
                    if -0.5 < zm < 2: x['akcje_1r'] = -zm
        for h, kk in ((36, 'zwrot_3l'), (60, 'zwrot_5l')):
            if i >= h and c[i - h] > 0 and np.isfinite(c[i]): x[kk] = c[i] / c[i - h] - 1
        if i >= 12 and np.all(np.isfinite(c[i - 12:i + 1])) and np.all(c[i - 12:i + 1] > 0):
            lr = np.diff(np.log(c[i - 12:i + 1])); x['zmiennosc_12m'] = -lr.std(); x['od_maks_12m'] = c[i] / c[i - 12:i + 1].max() - 1
        for p, v in x.items():
            if v is not None and np.isfinite(v): X[p][i, j] = v
print('nowe cechy, pokrycie:', {p: round(float(np.isfinite(X[p][UNI]).mean()), 2) for p in NOWE}, flush=True)

# --- cel: nadwyżka nad średnią ---
EXC, KON = {}, {36: pd.Period('2023-09', 'M'), 60: pd.Period('2021-09', 'M')}
for h in (36, 60):
    R = np.full((NT, NS), np.nan); R[:-h] = Cv[h:] / Cv[:-h] - 1; E_ = np.full((NT, NS), np.nan)
    for m in MI:
        i = im_[m]; ok = UNI[i] & np.isfinite(R[i])
        if ok.sum() >= 100: E_[i, ok] = R[i, ok] - R[i, ok].mean()
    EXC[h] = E_
WYB, SPR = (pd.Period('2012-01', 'M'), pd.Period('2016-12', 'M')), (pd.Period('2017-01', 'M'), None)
DOD = {'pe', 'peg', 'ps', 'pfcf', 'ev_przych'}


def nw_t(x, lag):
    x = np.asarray(x); n = len(x)
    if n < 10: return np.nan
    e = x - x.mean(); s = e @ e / n
    for l in range(1, min(lag, n - 1) + 1): s += 2 * (1 - l / (lag + 1)) * (e[l:] @ e[:-l]) / n
    return x.mean() / np.sqrt(s / n)


def ocen(F, h, okr):
    a_, b_ = okr[0], min(okr[1], KON[h]) if okr[1] else KON[h]; ic, d = [], []
    for m in MI:
        if not (a_ <= m <= b_): continue
        i = im_[m]; ok = np.isfinite(F[i]) & np.isfinite(EXC[h][i])
        if ok.sum() < 50: continue
        f, e = pd.Series(F[i, ok]).rank().to_numpy(), pd.Series(EXC[h][i, ok]).rank().to_numpy()
        ic.append(np.corrcoef(f, e)[0, 1])
        q = pd.qcut(pd.Series(F[i, ok]).rank(method='first'), 5, labels=False).to_numpy(); ex = EXC[h][i, ok]
        d.append(ex[q == 4].mean() - ex[q == 0].mean())
    ic = np.array(ic)
    return ic.mean() if len(ic) else np.nan, nw_t(ic, h - 1), 100 * np.mean(d) if d else np.nan


CECHY = [p for p in X if p not in ('C5_gm',)]
rows = []
for p in CECHY:
    F = np.where(X[p] > 0, X[p], np.nan) if p in DOD else X[p]
    for h in (60, 36):
        ic1, t1, d1 = ocen(F, h, WYB); ic2, t2, d2 = ocen(F, h, SPR)
        odk = abs(t1) >= 2 and np.sign(ic1) == np.sign(ic2) and abs(ic2) >= 0.5 * abs(ic1)
        rows.append(dict(cecha=p, h=f'{h // 12} l.', IC_wybor=ic1, t_wybor=t1, G5_G1_wybor_pp=d1, IC_sprawdzian=ic2, t_sprawdzian=t2, G5_G1_sprawdzian_pp=d2, odkrycie=odk,
                         pokrycie=float(np.isfinite(X[p][UNI]).mean())))
T = pd.DataFrame(rows)
out = ['# Etap 79: szukanie bez założeń — każda cecha osobno (wybór 2012–2016, sprawdzian 2017+) i model LightGBM', '',
       'IC = średnia miesięczna korelacja rang cechy z nadwyżką zwrotu nad średnią spółek (dodatni = więcej cechy → lepszy zwrot). G5 − G1 = nadwyżka 20 % spółek z',
       'najwyższą wartością minus 20 % z najniższą (pp). Odkrycie = |t| ≥ 2 w wyborze i ten sam znak w sprawdzianie z |IC| ≥ połowa IC z wyboru.', '']
for h in ('5 l.', '3 l.'):
    z = T[T.h == h].sort_values('IC_sprawdzian', key=lambda s: -s.abs())
    out += [f'## Każda cecha osobno — horyzont {h} (sortowane wg |IC| w sprawdzianie)', '', z.drop(columns='h').round(3).to_markdown(index=False), '',
            'Odkrycia: ' + ', '.join(z[z.odkrycie].cecha), '']

# --- model ---
import lightgbm as lgb
CM = [p for p in CECHY]


def macierz(okr, h):
    a_, b_ = okr[0], min(okr[1], KON[h]) if okr[1] else KON[h]; Xs, ys, ms_, js = [], [], [], []
    for m in MI:
        if not (a_ <= m <= b_): continue
        i = im_[m]; ok = UNI[i] & np.isfinite(EXC[h][i])
        if ok.sum() < 50: continue
        cols = []
        for p in CM:
            v = X[p][i, ok].copy()
            if p in DOD: v = np.where(v > 0, v, np.nan)
            cols.append(pd.Series(v).rank(pct=True).to_numpy())
        Xs.append(np.column_stack(cols)); ys.append(pd.Series(EXC[h][i, ok]).rank(pct=True).to_numpy()); ms_ += [m] * ok.sum(); js.append(np.flatnonzero(ok))
    return np.vstack(Xs), np.concatenate(ys), np.array(ms_), np.concatenate(js)


h = 60
Xa, ya, ma, _ = macierz(WYB, h); Xb, yb, mb, jb = macierz(SPR, h)
mod = lgb.LGBMRegressor(n_estimators=200, learning_rate=0.03, num_leaves=15, min_child_samples=200, subsample=0.8, subsample_freq=1, colsample_bytree=0.7, verbose=-1, random_state=1)
mod.fit(Xa, ya)
pb = mod.predict(Xb)


def ic_mies(pred, y, mm):
    df = pd.DataFrame({'p': pred, 'y': y, 'm': mm}); r = df.groupby('m').apply(lambda g: g.p.rank().corr(g.y.rank()))
    return r.mean(), nw_t(r.to_numpy(), h - 1)


ic_m, t_m = ic_mies(pb, yb, mb)
# porównanie z oceną strony (etap 77: percentyle w całym zbiorze)
_r = open(os.path.join(HERE, 'r102_etap77.py')).read(); exec(_r[_r.index('GRUPY = {'):_r.index('\ndef grupa(')])
OGc = oceny(False)['ogolna']
og = np.array([OGc[im_[m], j] for m, j in zip(mb, jb)])
okk = np.isfinite(og); ic_o, t_o = ic_mies(og[okk], yb[okk], mb[okk])
exb = np.array([EXC[h][im_[m], j] for m, j in zip(mb, jb)])
def g5(pred, mm, ex):
    df = pd.DataFrame({'p': pred, 'm': mm, 'e': ex}); v = []
    for _, g in df.groupby('m'):
        q = pd.qcut(g.p.rank(method='first'), 5, labels=False); v.append((g.e[q == 4].mean(), g.e[q == 0].mean(), (g.e[q == 4] > 0).mean()))
    v = np.array(v); return 100 * v[:, 0].mean(), 100 * v[:, 1].mean(), 100 * v[:, 2].mean()
mg5 = g5(pb, mb, exb); og5 = g5(og[okk], mb[okk], exb[okk])
# ważność: przemieszanie cechy w sprawdzianie
rng = np.random.default_rng(1); imp = []
for c_, p in enumerate(CM):
    Xp = Xb.copy(); Xp[:, c_] = rng.permutation(Xp[:, c_]); icp, _ = ic_mies(mod.predict(Xp), yb, mb); imp.append((p, ic_m - icp))
imp.sort(key=lambda x: -x[1])
out += ['## Model LightGBM (uczony na startach 2012–2016, oceniany na 2017–2021, nadwyżka 5 lat)', '',
        f'Model: IC {ic_m:.3f} (t {t_m:.1f}); najlepsza piątka G5 {mg5[0]:+.1f} pp, najgorsza G1 {mg5[1]:+.1f} pp, w G5 bije średnią {mg5[2]:.0f} % spółek.',
        f'Ocena ze strony (etap 77) na tych samych startach: IC {ic_o:.3f} (t {t_o:.1f}); G5 {og5[0]:+.1f} pp, G1 {og5[1]:+.1f} pp, w G5 bije średnią {og5[2]:.0f} %.', '',
        'Ważność cech (spadek IC modelu po przemieszaniu cechy w sprawdzianie; > 0 = cecha pomaga):', '',
        pd.DataFrame(imp[:20], columns=['cecha', 'spadek_IC']).round(4).to_markdown(index=False), '']
open(os.path.join(HERE, 'wyniki', 'r104_etap79.md'), 'w').write('\n'.join(out)); print('\n'.join(out))
