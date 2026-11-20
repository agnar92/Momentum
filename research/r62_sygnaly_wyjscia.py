"""Etap 41: fundamenty jako sygnał sprzedaży (z cache wskaźników r59 + marża operacyjna z SEC)."""
import os, json, datetime as dt, numpy as np, pandas as pd, statsmodels.api as sm
from scipy import stats
HERE = os.path.dirname(os.path.abspath(__file__))
exec(open(os.path.join(HERE, 'r19_cem10.py')).read().split('warianty = {')[0])   # best_map, rng, B (bootstrap)
Z = np.load('/home/user/ndx/wskazniki_cache.npz', allow_pickle=True)
Cv, U, EPS0, PE_, G1, GRW, RQ, MPE, ROE, DE, FCF, S10 = (Z[k] for k in ('Cv', 'U', 'EPS0', 'PE_', 'G1', 'GRW', 'RQ', 'MPE', 'ROE', 'DE', 'FCF', 'S10'))
ms = [pd.Period(x, 'M') for x in Z['mies']]; ser = list(Z['seria']); im_ = {m: i for i, m in enumerate(ms)}; cols = {s: j for j, s in enumerate(ser)}
NT, NS = Cv.shape
dd = lambda s: dt.date.fromisoformat(s)
r25 = open(os.path.join(HERE, 'r25_cem10_eps.py')).read(); exec(r25[r25.index('def kwartaly'):r25.index('\n\n\ncechy = {}')])
r39 = open(os.path.join(HERE, 'r39_peg.py')).read(); exec(r39[r39.index('def ttm_serie'):r39.index('\n\n\nTT = {k:')])
# marża operacyjna TTM znana na koniec miesiąca
OPM = np.full((NT, NS), np.nan); SECQ = '/home/user/ndx/sec_q'
M0 = [m for m in ms if pd.Period('2010-06', 'M') <= m <= pd.Period('2026-09', 'M')]
for fn in os.listdir(SECQ):
    d = json.load(open(os.path.join(SECQ, fn)))
    if not d or 'rev' not in d or 'opinc' not in d: continue
    tt = {}
    for kk in ('rev', 'opinc'):
        q = kwartaly(d[kk]['rows'])
        if len(q) < 4: break
        g = pd.DataFrame([(pd.Timestamp(e), v, pd.Timestamp(f)) for e, (v, f) in q.items()], columns=['end', 'eps', 'filed']).sort_values('end')
        tt[kk] = ttm_serie(g).set_index('end')
    if len(tt) < 2: continue
    J = tt['rev'].join(tt['opinc'], lsuffix='_r', rsuffix='_o', how='inner')
    J = J[J.ttm_r > 0]
    if J.empty: continue
    J['zn'] = J[['zn_r', 'zn_o']].max(axis=1); J['m'] = J.ttm_o / J.ttm_r; J = J.sort_values('zn')
    k = fn[:-5].replace('.', '-')
    for m in M0:
        s_ = best_map.get((m, k))
        if s_ not in cols: continue
        t = m.to_timestamp(how='end'); z = J[J.zn <= t]
        if len(z) and (t - z.index.max()).days <= 250: OPM[im_[m], cols[s_]] = z.loc[z.index.max(), 'm']
print('marża', np.isfinite(OPM).sum(), flush=True)
lag = lambda X, k: np.vstack([np.full((k, NS), np.nan), X[:-k]])
fwd = lambda k: np.vstack([Cv[k:] / Cv[:-k] - 1, np.full((k, NS), np.nan)])
F6, F12 = fwd(6), fwd(12)
MIN6 = np.full((NT, NS), np.nan)
for i in range(NT - 6): MIN6[i] = np.nanmin(Cv[i + 1:i + 7], axis=0) / Cv[i] - 1
R6 = Cv / lag(Cv, 6) - 1
MI = [m for m in ms if pd.Period('2012-01', 'M') <= m <= pd.Period('2025-09', 'M')]; IDX = np.array([im_[m] for m in MI])
# nadwyżka nad równymi wagami uniwersum (średnia w miesiącu)
def nadwyzka(F):
    X = np.where(U, F, np.nan); return F - np.nanmean(X, axis=1, keepdims=True)
E6, E12 = nadwyzka(F6), nadwyzka(F12)
RQ3, G13, GRW3 = lag(RQ, 3), lag(G1, 3), lag(GRW, 3)
SYG = {'przychody: ostatni kwartał r/r < 0': RQ < 0,
       'przychody: hamowanie r/r o >= 10 pp (vs 3 mies.)': (RQ - RQ3) <= -0.10,
       'przychody: estymata użytkownika niższa niż 3 mies. temu': GRW < GRW3,
       'EPS TTM r/r < 0': G1 < 0,
       'EPS: hamowanie wzrostu r/r o >= 10 pp (vs 3 mies.)': (G1 - G13) <= -0.10,
       'marża operacyjna niższa o >= 2 pp r/r': (OPM - lag(OPM, 12)) <= -0.02,
       'ROE niższe o >= 5 pp r/r': (ROE - lag(ROE, 12)) <= -0.05,
       'dług / kapitał wyższy o >= 0,2 r/r': (DE - lag(DE, 12)) >= 0.2,
       'FCF niższy niż rok wcześniej': FCF < lag(FCF, 12),
       'FCF < 0': FCF < 0,
       'P/E > 1,5 x mediana P/E z 36 mies.': PE_ > 1.5 * MPE,
       'technicznie: zamknięcie pod SMA 10': Cv < S10}
DOST = {'przychody: ostatni kwartał r/r < 0': np.isfinite(RQ), 'przychody: hamowanie r/r o >= 10 pp (vs 3 mies.)': np.isfinite(RQ) & np.isfinite(RQ3),
        'przychody: estymata użytkownika niższa niż 3 mies. temu': np.isfinite(GRW) & np.isfinite(GRW3), 'EPS TTM r/r < 0': np.isfinite(G1),
        'EPS: hamowanie wzrostu r/r o >= 10 pp (vs 3 mies.)': np.isfinite(G1) & np.isfinite(G13), 'marża operacyjna niższa o >= 2 pp r/r': np.isfinite(OPM) & np.isfinite(lag(OPM, 12)),
        'ROE niższe o >= 5 pp r/r': np.isfinite(ROE) & np.isfinite(lag(ROE, 12)), 'dług / kapitał wyższy o >= 0,2 r/r': np.isfinite(DE) & np.isfinite(lag(DE, 12)),
        'FCF niższy niż rok wcześniej': np.isfinite(FCF) & np.isfinite(lag(FCF, 12)), 'FCF < 0': np.isfinite(FCF),
        'P/E > 1,5 x mediana P/E z 36 mies.': np.isfinite(PE_) & np.isfinite(MPE), 'technicznie: zamknięcie pod SMA 10': np.isfinite(S10)}
LIDER = (R6 > 0.30) & (Cv > S10)
rows = []
for grupa, G in (('wszyscy', np.ones((NT, NS), bool)), ('liderzy (6M > 30 %, nad SMA 10)', LIDER)):
    for nm, S in SYG.items():
        A = np.zeros((NT, NS), bool); A[IDX] = True
        baza = A & U & G & DOST[nm] & np.isfinite(E12) & np.isfinite(E6)
        on, off = baza & S, baza & ~S
        if on.sum() < 50: continue
        # różnica średnich w miesiącach, bootstrap blokowy po miesiącach
        dm = np.array([np.nanmean(E12[i][on[i]]) - np.nanmean(E12[i][off[i]]) for i in IDX if on[i].sum() >= 3 and off[i].sum() >= 3])
        lo, hi = blok(dm) if len(dm) > 24 else (np.nan, np.nan)
        nw = sm.OLS(dm, np.ones(len(dm))).fit(cov_type='HAC', cov_kwds={'maxlags': 12}) if len(dm) > 24 else None
        rows.append(dict(grupa=grupa, sygnal=nm, n_sygnal=int(on.sum()), odsetek=on.sum() / baza.sum(),
                         nadwyzka_6m_przy=np.nanmean(E6[on]), nadwyzka_6m_bez=np.nanmean(E6[off]),
                         nadwyzka_12m_przy=np.nanmean(E12[on]), nadwyzka_12m_bez=np.nanmean(E12[off]),
                         roznica_12m=dm.mean(), ci95=f'{lo*100:.1f}…{hi*100:.1f} pp', t_NW=nw.tvalues[0] if nw is not None else np.nan,
                         P_spadek25_6m_przy=np.mean(MIN6[on] <= -0.25), P_spadek25_6m_bez=np.mean(MIN6[off] <= -0.25),
                         P_strata12m_przy=np.mean(F12[on] < 0), P_strata12m_bez=np.mean(F12[off] < 0)))
    print(grupa, flush=True)
T = pd.DataFrame(rows)
# korelacje ciągłych zmian z nadwyżką 12 mies. i między sobą
CIAG = {'zm. wzrostu przychodów r/r (3 mies.)': RQ - RQ3, 'zm. estymaty użytkownika (3 mies.)': GRW - GRW3, 'zm. wzrostu EPS r/r (3 mies.)': G1 - G13,
        'zm. marży operacyjnej r/r': OPM - lag(OPM, 12), 'zm. ROE r/r': ROE - lag(ROE, 12), 'zm. długu / kapitału r/r': DE - lag(DE, 12),
        'zm. FCF r/r (%)': np.where(lag(FCF, 12) > 0, FCF / lag(FCF, 12) - 1, np.nan), 'P/E / mediana 36 mies.': PE_ / MPE, 'odległość od SMA 10': Cv / S10 - 1}
ic = []
for grupa, G in (('wszyscy', np.ones((NT, NS), bool)), ('liderzy', LIDER)):
    for nm, X in CIAG.items():
        v = []
        for i in IDX:
            ok = U[i] & G[i] & np.isfinite(X[i]) & np.isfinite(E12[i])
            if ok.sum() >= 20: v.append(stats.spearmanr(X[i, ok], E12[i, ok])[0])
        v = np.array(v); nw = sm.OLS(v, np.ones(len(v))).fit(cov_type='HAC', cov_kwds={'maxlags': 12})
        ic.append(dict(grupa=grupa, wielkosc=nm, IC_nadwyzka12m=v.mean(), t_NW=nw.tvalues[0], miesiecy=len(v)))
IC = pd.DataFrame(ic)
pool = {nm: X[IDX][U[IDX]] for nm, X in CIAG.items()}
D = pd.DataFrame(pool).rank(); KOR = D.corr()
out = ['# Etap 41: kiedy sprzedać - pogorszenie fundamentów a dalszy zwrot (S&P 500 z danymi SEC, 2012-2025)', '',
       'nadwyżka = zwrot spółki minus średni zwrot spółek uniwersum w tym samym okresie. roznica_12m = średnia miesięczna różnica nadwyżki 12 mies. (z sygnałem - bez);',
       'ujemna = sygnał zapowiada słabszy dalszy zwrot. P_spadek25_6m = szansa spadku o >= 25 % od ceny w t w ciągu 6 mies.', '',
       '## Sygnały zero-jedynkowe', '', T.round(3).to_markdown(index=False), '',
       '## Wielkości ciągłe: korelacja rang z nadwyżką 12 mies. (średnia po miesiącach)', '', IC.round(3).to_markdown(index=False), '',
       '## Korelacje rang między wskaźnikami (wszyscy, pula obserwacji)', '', KOR.round(2).to_markdown(), '']
open(os.path.join(HERE, 'wyniki', 'r62_sygnaly_wyjscia.md'), 'w').write('\n'.join(out)); print('\n'.join(out))
