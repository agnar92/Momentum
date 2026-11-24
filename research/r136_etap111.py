"""Etap 111: 8 reguł Buffetta (Mary Buffett, „Interpretation of Financial Statements”) — tylko sprawdzenie. Protokół: etap 111."""
import os
HERE = os.path.dirname(os.path.abspath(__file__))
_s = open(os.path.join(HERE, 'r117_etap92.py')).read()
exec(_s[:_s.index("\nrows = []")])
rng = np.random.default_rng(111)
STARTY = [pd.Period(f'{y}-01', 'M') for y in range(2012, 2024)]
KON[60] = pd.Period('2021-09', 'M')
EX[60] = nadw(60)
S111 = json.load(open(f'{SZ}/sec111.json'))


def inst(d):
    """{tag: [[start, end, val, filed]]} -> Seria stanów (pierwszy tag z wartością dla daty)."""
    rows = [[r[1], r[2], r[3]] for r in wiele({t: [[x[1], x[2], x[3]] for x in v] for t, v in (d or {}).items()})] if d else []
    return Seria(stan(rows), 100) if rows else None


def rocz(d):
    return roczne_rows({t: [x for x in v if x[0]] for t, v in (d or {}).items()}) if d else {}


N = ('gm2', 'eps9', 'eps4', 'nm2', 'de_adj', 'ods', 'dlug_ni', 'capex_ni', 'sga_gp')
F = {n: np.full((NT, NS), np.nan) for n in N}
for j in range(NS):
    k = kod[j]
    if k not in cache or k not in ROK: continue
    sq, R_, s1 = cache[k], ROK[k], S111.get(k) or {}
    nia = sq.get('ni_a') or []
    zob, pas, skarb, dl = inst(s1.get('zob')), inst(s1.get('pasywa')), inst(s1.get('skarb')), inst(s1.get('dlug_dl'))
    sga, sm, ga, ods = rocz(s1.get('sga')), rocz(s1.get('sm')), rocz(s1.get('ga')), rocz(s1.get('ods'))
    for m in STARTY:
        i = im_[m]
        if not UNI[i, j]: continue
        t = m.to_timestamp(how='end')
        zn = [z for z in nia if z[2] <= t]
        if not zn or (t - zn[-1][0]).days > 450: continue
        e0 = zn[-1][0]
        ni = lambda n: next((v for e, v, f in zn if abs((e - (e0 - n * Y)).days) <= 45), None)
        rv = lambda n: sq['rev'].przy(t, e0 - n * Y) if 'rev' in sq else None
        gp = lambda n: sq['gp'].przy(t, e0 - n * Y) if 'gp' in sq else None
        # 1, 3: marże 2 FY
        g = [(gp(n), rv(n)) for n in (0, 1)]
        if all(a is not None and b and b > 0 for a, b in g): F['gm2'][i, j] = float(all(a / b > 0.40 for a, b in g))
        nn = [(ni(n), rv(n)) for n in (0, 1)]
        if all(a is not None and b and b > 0 for a, b in nn): F['nm2'][i, j] = float(all(a / b > 0.20 for a, b in nn))
        # 2: EPS (zysk netto ÷ akcje, z podziałami)
        if 'sh' in sq:
            def eps(n):
                a, s_ = ni(n), sq['sh'].przy(t, e0 - n * Y)
                return None if a is None or not s_ or s_ <= 0 else a / (s_ * podziel(k, e0 - n * Y, e0))
            for lat, kl, prog in ((10, 'eps9', 9), (5, 'eps4', 4)):
                ep = [eps(n) for n in range(lat + 1)]
                if all(v is not None for v in ep):
                    F[kl][i, j] = float(all(v > 0 for v in ep) and sum(ep[n] > ep[n + 1] for n in range(lat)) >= prog)
        # 4: skorygowany D/E
        eq = sq['eq'].przy(t, e0) if 'eq' in sq else None
        lb = zob.przy(t, e0) if zob else None
        if lb is None and pas and eq is not None:
            p_ = pas.przy(t, e0); lb = p_ - eq if p_ is not None else None
        if lb is not None and eq is not None:
            tr = (skarb.przy(t, e0) if skarb else None) or 0
            mian = eq + abs(tr)
            F['de_adj'][i, j] = float(mian > 0 and lb / mian < 0.8)
        # 5: odsetki ÷ zysk operacyjny
        op = sq['opinc'].przy(t, e0) if 'opinc' in sq else None
        db = dlug(sq['b'], t, e0, k) if sq.get('b') else None
        iv = przy_rok(ods, e0, t)
        if iv is None and db is not None and db <= 0: iv = 0.0
        if op is not None and iv is not None: F['ods'][i, j] = float(op > 0 and abs(iv) < 0.15 * op)
        # 6: dług długoterminowy ≤ 4 × zysk netto
        dv = dl.przy(t, e0) if dl else None
        if dv is None: dv = db
        n0 = ni(0)
        if dv is not None and n0 is not None: F['dlug_ni'][i, j] = float(dv <= 0 or (n0 > 0 and dv <= 4 * n0))
        # 7: capex ÷ zysk netto, suma 3 FY
        cx = [next((c for e, o, c, f in R_['fc'] if f <= t and abs((e - (e0 - n * Y)).days) <= 45), None) for n in range(3)]
        n3 = [ni(n) for n in range(3)]
        if all(v is not None for v in cx + n3):
            sn = sum(n3); F['capex_ni'][i, j] = 9.0 if sn <= 0 else sum(cx) / sn
        # 8: SG&A ÷ zysk brutto (ostatni FY)
        sv = przy_rok(sga, e0, t)
        if sv is None:
            a_, b_ = przy_rok(sm, e0, t), przy_rok(ga, e0, t)
            sv = a_ + b_ if a_ is not None and b_ is not None else None
        g0 = gp(0)
        if sv is not None and g0 is not None: F['sga_gp'][i, j] = 9.0 if g0 <= 0 else sv / g0
for n in N: print(n, int(np.isfinite(F[n]).sum()), flush=True)

POL = {36: ((2012, 2017), (2018, 2023)), 60: ((2012, 2016), (2017, 2021))}


def polowy(A_, B_, h):
    out = []
    for a, b in POL[h]:
        ea, eb = [], []
        for m in [m for m in STARTY if a <= m.year <= b and m <= KON[h]]:
            i = im_[m]
            ea += list(EX[h][i, A_[i] & UNI[i] & np.isfinite(EX[h][i])]); eb += list(EX[h][i, B_[i] & UNI[i] & np.isfinite(EX[h][i])])
        out.append(100 * (np.median(ea) - np.median(eb)) if len(ea) >= 10 and len(eb) >= 10 else np.nan)
    return out


def med(M, h):
    v = np.concatenate([FW[h][im_[m], M[im_[m]] & UNI[im_[m]] & np.isfinite(FW[h][im_[m]])] for m in STARTY if m <= KON[h]])
    return 100 * np.median(v) if len(v) else np.nan


b = lambda a, w: np.isfinite(a) & (np.nan_to_num(a, nan=-1) == w)
cx, sg = F['capex_ni'], F['sga_gp']
fin = np.isfinite
R3 = {'Siła': b(F['nm2'], 1) & b(F['dlug_ni'], 1) & fin(sg) & (sg < 0.3)}
ZADNA = b(F['nm2'], 0) & b(F['dlug_ni'], 0) & fin(sg) & (sg >= 0.3)
TESTY = [
    ('1. marża brutta > 40 % (2 FY)', 'Buffett / film: 70 vs 65 %', b(F['gm2'], 1), b(F['gm2'], 0)),
    ('2. EPS rośnie 9 z 10 lat, zawsze zysk', 'film: 74 vs 67 %', b(F['eps9'], 1), b(F['eps9'], 0)),
    ('2b. EPS rośnie 4 z 5 lat, zawsze zysk (wariant)', '—', b(F['eps4'], 1), b(F['eps4'], 0)),
    ('3. marża netto > 20 % (2 FY)', 'film: 81 vs 67 %', b(F['nm2'], 1), b(F['nm2'], 0)),
    ('4. zobowiązania ÷ (kapitał + akcje własne) < 0,8', 'film: 77 vs 63 %', b(F['de_adj'], 1), b(F['de_adj'], 0)),
    ('5. odsetki < 15 % zysku operacyjnego', 'film: 72 vs 56 %', b(F['ods'], 1), b(F['ods'], 0)),
    ('6. dług długoterminowy ≤ 4 × zysk netto', 'film: 73 vs 56 %', b(F['dlug_ni'], 1), b(F['dlug_ni'], 0)),
    ('7. capex < 25 % zysku (3 FY) vs > 50 %', 'film: 89 vs 62 %', fin(cx) & (cx < 0.25), fin(cx) & (cx > 0.5)),
    ('7b. capex 25–50 % vs > 50 %', 'film: 65 vs 62 %', fin(cx) & (cx >= 0.25) & (cx <= 0.5), fin(cx) & (cx > 0.5)),
    ('8. SG&A < 30 % zysku brutto vs reszta', 'film: 93 vs 65 %', fin(sg) & (sg < 0.3), fin(sg) & (sg >= 0.3)),
    ('8b. SG&A < 30 % vs > 80 %', 'film: 93 vs 29 %', fin(sg) & (sg < 0.3), fin(sg) & (sg > 0.8)),
    ('Łącznie 3 + 6 + 8: wszystkie vs żadna', 'film: 91 vs 48 %', R3['Siła'], ZADNA),
]
rows = []
for nm, film, A_, B_ in TESTY:
    r = {'reguła': nm, 'film (5 l., mediana)': film}
    for h in (60, 36):
        na, nb, d0, lo, hi = test(A_, B_, h); p1, p2 = polowy(A_, B_, h)
        if h == 60:
            r['u nas 5 l.: spełnia / nie'] = f'{med(A_, 60):+.0f} % / {med(B_, 60):+.0f} %'; r['n'] = f'{na}/{nb}'
            r['różnica nadwyżki 5 l. (pp)'] = f'{d0:+.1f} [{lo:+.1f}; {hi:+.1f}]'; r['połowy 5 l.'] = f'{p1:+.1f} / {p2:+.1f}'
            r['potwierdzone'] = 'tak' if d0 > 0 and lo > 0 and p1 > 0 and p2 > 0 else 'nie'
        else:
            r['różnica 3 l. (pp)'] = f'{d0:+.1f} [{lo:+.1f}; {hi:+.1f}]'
    rows.append(r); print(r, flush=True)
out = ['# Etap 111: 8 reguł Buffetta — sprawdzenie', '', 'Top 500 USA PIT bez wykluczonych sektorów, starty w styczniu 2012–2021 (5 lat) / 2012–2023 (3 lata). Różnica nadwyżki = różnica median '
       '(zwrot minus mediana zbioru), 95 % przedział z bootstrapu po latach startu. Reguła 2 (10 lat EPS) — dane SEC od ~2008, więc tylko starty od ~2019.', '',
       pd.DataFrame(rows).to_markdown(index=False), '']
open(os.path.join(HERE, 'wyniki', 'r136_etap111.md'), 'w').write('\n'.join(out)); print('\n'.join(out))
