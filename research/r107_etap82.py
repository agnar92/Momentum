"""Etap 82: sygnały ostrzegawcze przed załamaniem kursu dobrych spółek; sprzedaż na sygnale w portfelu z etapu 81. Protokół: etap 82."""
import os
HERE = os.path.dirname(os.path.abspath(__file__))
_s = open(os.path.join(HERE, 'r106_etap81.py')).read()
exec(_s[:_s.index("PN = {")])
nz = lambda A_, v: np.nan_to_num(A_, nan=v)
# cele
F12 = np.full((NT, NS), np.nan); F12[:-12] = Cv[12:] / Cv[:-12] - 1
EX = np.full((NT, NS), np.nan)
for m in MI:
    i = im_[m]; ok = ZB[i] & np.isfinite(F12[i])
    if ok.sum() >= 100: EX[i, ok] = F12[i, ok] - F12[i, ok].mean()
DOBRE = ZB & (nz(PCTL, 0) >= 0.70)
# sygnały
sma10 = pd.DataFrame(Cv).rolling(10, min_periods=10).mean().to_numpy()
pe_med = pd.DataFrame(np.where(nz(X['pe'], -1) > 0, X['pe'], np.nan)).rolling(36, min_periods=12).median().to_numpy()
Z = {'Z1 przychody kwartału r/r < 0': nz(X['przych_kw_rr'], 1) < 0,
     'Z2 wzrost przychodów spadł o ≥ 10 pp r/r': nz(X['rev_1y'] - lag(X['rev_1y'], 12), 1) <= -0.10,
     'Z3 marża operacyjna −3 pp r/r': nz(X['d_om_1r'], 1) <= -0.03,
     'Z4 zysk netto r/r < 0': nz(X['ni_1y'], 1) < 0,
     'Z5 ocena ogólna −1,5 pkt w 12 mies.': nz(OG - lag(OG, 12), 0) <= -1.5,
     'Z6 ocena siły −2 pkt w 12 mies.': nz(SILA - SILA12, 0) <= -2,
     'Z7 kurs ≥ 30 % poniżej maks. 12 mies.': nz(X['od_maks_12m'], 0) <= -0.30,
     'Z8 kurs poniżej średniej 10 mies.': nz(Cv < sma10, False).astype(bool) & np.isfinite(sma10),
     'Z9 zwrot 6 mies. ≤ −20 %': nz(X['C6_mom6'], 0) <= -0.20,
     'Z10 PEG > 3': nz(PEG, 0) > 3,
     'Z11 P/E > 1,5 × własna mediana 3 l.': nz(X['pe'] / pe_med, 0) > 1.5,
     'Z12 emisja akcji > 3 % r/r': nz(X['akcje_1r'], 0) < -0.03,
     'Z13 zapasy rosną ≥ 10 pp szybciej niż przychody': nz(X['zapasy_vs_przych'], 0) <= -0.10,
     'Z14 FCF < 0': nz(X['fcf_margin'], 1) < 0,
     'Z15 fundamenty słabną 2 lata (odniesienie)': P1}
WYB = (pd.Period('2013-01', 'M'), pd.Period('2018-12', 'M')); SPR = (pd.Period('2019-01', 'M'), pd.Period('2025-09', 'M'))


def opis(S, okr):
    d_ex, z_s, z_b, n_s = [], [], [], 0
    for m in MI:
        if not (okr[0] <= m <= okr[1]): continue
        i = im_[m]; ok = DOBRE[i] & np.isfinite(EX[i])
        if ok.sum() < 30: continue
        s = ok & S[i]; b = ok & ~S[i]
        if s.sum() == 0 or b.sum() == 0: continue
        d_ex.append(EX[i, s].mean() - EX[i, b].mean()); n_s += s.sum()
        z_s += list(EX[i, s] <= -0.30); z_b += list(EX[i, b] <= -0.30)
    d = np.array(d_ex)
    t = d.mean() / (d.std(ddof=1) / np.sqrt(len(d) / 12)) if len(d) > 12 else np.nan     # błąd ~ niezależne lata (nakładające się 12 mies.)
    return dict(obs=n_s, roznica_pp=100 * d.mean() if len(d) else np.nan, t=t, zalamania_z=np.mean(z_s) if z_s else np.nan, zalamania_bez=np.mean(z_b) if z_b else np.nan)


rows = []; ostrz = []
for nm, S in Z.items():
    a, b = opis(S, WYB), opis(S, SPR)
    ok = a['roznica_pp'] <= -5 and a['t'] <= -2 and b['roznica_pp'] < 0
    if ok and not nm.startswith('Z15'): ostrz.append(nm)
    rows.append(dict(sygnal=nm, obs_wybor=a['obs'], roznica_12m_wybor_pp=a['roznica_pp'], t_wybor=a['t'], zalamania_z_wybor=a['zalamania_z'], zalamania_bez_wybor=a['zalamania_bez'],
                     roznica_12m_sprawdzian_pp=b['roznica_pp'], zalamania_z_spr=b['zalamania_z'], zalamania_bez_spr=b['zalamania_bez'], ostrzegawczy=ok))
T = pd.DataFrame(rows)
out = ['# Etap 82: sygnały ostrzegawcze przed załamaniem kursu dobrych spółek (ocena w top 30 %)', '',
       'Różnica = średnia nadwyżka 12 mies. spółek z sygnałem minus bez sygnału (pp). Załamanie = nadwyżka 12 mies. ≤ −30 pp (odsetek obserwacji). Wybór 2013–2018, sprawdzian 2019–2025.', '',
       T.round(3).to_markdown(index=False), '', 'Ostrzegawcze (reguła z protokołu): ' + (', '.join(ostrz) or 'żaden'), '']
rows = [dict(wariant='SPY', **bench(spy)), dict(wariant='QQQ', **bench(qqq)), dict(wariant='P1 (etap 81, bez dokupowania)', **strategia(P1, dokup=False))]
for nm in list(Z)[:-1]:
    rows.append(dict(wariant=f'P1 + {nm}', **strategia(P1 | Z[nm], dokup=False))); print(nm, flush=True)
if len(ostrz) >= 2:
    naj = sorted(ostrz, key=lambda n: T.set_index('sygnal').roznica_12m_wybor_pp[n])[:2]
    rows.append(dict(wariant='P1 + ' + ' lub '.join(naj), **strategia(P1 | Z[naj[0]] | Z[naj[1]], dokup=False)))
out += ['## Portfel (etap 81, bez dokupowania): sprzedaż przy P1 + sygnał', '', pd.DataFrame(rows).round(3).to_markdown(index=False), '']
rows = []
for od, do, nm in ((pd.Period('2013-01', 'M'), pd.Period('2019-12', 'M'), '2013–2019'), (pd.Period('2020-01', 'M'), pd.Period('2026-09', 'M'), '2020–2026')):
    rows += [dict(okres=nm, wariant='SPY', **bench(spy, od, do)), dict(okres=nm, wariant='P1', **strategia(P1, dokup=False, od=od, do=do))]
    for s_ in ostrz: rows.append(dict(okres=nm, wariant=f'P1 + {s_}', **strategia(P1 | Z[s_], dokup=False, od=od, do=do)))
rows += [dict(okres='całość bez NVDA', wariant='P1', **strategia(P1, dokup=False, bez=('NVDA',)))]
rows += [dict(okres='całość bez NVDA', wariant=f'P1 + {s_}', **strategia(P1 | Z[s_], dokup=False, bez=('NVDA',))) for s_ in ostrz]
out += ['## Połowy i bez NVDA (sygnały ostrzegawcze)', '', pd.DataFrame(rows).round(3).to_markdown(index=False), '']
open(os.path.join(HERE, 'wyniki', 'r107_etap82.md'), 'w').write('\n'.join(out)); print('\n'.join(out))
