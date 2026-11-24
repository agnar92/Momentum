"""Etap 112: dług w kwintylach, skrajne wyceny, rozkład zwrotu 5 lat (BCG) — tylko sprawdzenie. Protokół: etap 112."""
import os
HERE = os.path.dirname(os.path.abspath(__file__))
_s = open(os.path.join(HERE, 'r117_etap92.py')).read()
exec(_s[:_s.index("\nrows = []")])
rng = np.random.default_rng(112)
STARTY = [pd.Period(f'{y}-01', 'M') for y in range(2012, 2026)]
KON[60] = pd.Period('2021-09', 'M'); KON[120] = pd.Period('2016-09', 'M')
for h in (60, 120):
    A = np.full((NT, NS), np.nan); A[:-h] = Cv[h:] / Cv[:-h] - 1; FW[h] = A
EX[60] = nadw(60)
NEG = np.zeros((NT, NS), bool); STR = np.zeros((NT, NS), bool)
for j in range(NS):
    k = kod[j]
    if k not in cache: continue
    sq = cache[k]
    for m in STARTY:
        i = im_[m]
        if not UNI[i, j]: continue
        t = m.to_timestamp(how='end')
        if 'eq' in sq:
            _, e = sq['eq'].teraz(t)
            if e is not None and e <= 0: NEG[i, j] = True
        if 'ni' in sq:
            _, n = sq['ni'].teraz(t)
            if n is not None and n <= 0: STR[i, j] = True
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


def wiersz(nm, A_, B_):
    r = {'porównanie': nm}
    for h in (36, 60):
        na, nb, d0, lo, hi = test(A_, B_, h); p1, p2 = polowy(A_, B_, h)
        r[f'{h // 12} l. (pp)'] = f'{d0:+.1f} [{lo:+.1f}; {hi:+.1f}]'; r[f'połowy {h // 12} l.'] = f'{p1:+.1f} / {p2:+.1f}'; r[f'n {h // 12} l.'] = f'{na}/{nb}'
    print(r, flush=True); return r


# 1. kwintyle długu
DE = X['de']; Q = np.full((NT, NS), np.nan)
for m in STARTY:
    i = im_[m]; ok = UNI[i] & np.isfinite(DE[i]) & ~NEG[i]
    if ok.sum() > 50: Q[i, ok] = pd.qcut(pd.Series(DE[i, ok]).rank(method='first'), 5, labels=False).to_numpy()
rq = []
for q, nm in [(0, 'Q1 najniższy dług'), (1, 'Q2'), (2, 'Q3'), (3, 'Q4'), (4, 'Q5 najwyższy dług'), (-1, 'ujemny kapitał')]:
    sr, med_de = [], []
    for m in STARTY:
        i = im_[m]
        if m > KON[12]: continue
        M = (NEG[i] & UNI[i]) if q < 0 else (Q[i] == q)
        v = FW[12][i, M & np.isfinite(FW[12][i])]
        if len(v): sr.append(np.mean(v))
        if q >= 0: med_de.append(np.median(DE[i, M]))
    rq.append({'grupa': nm, 'D/E (mediana)': f'{np.median(med_de):.2f}' if med_de else '—', 'średni zwrot 12 mies. (równe wagi, średnia startów 2012–2025)': f'{100 * np.mean(sr):.1f} %'})
print(rq)
rows1 = [wiersz('Q1 (najniższy dług) vs Q5 (najwyższy)', Q == 0, Q == 4), wiersz('Q1+Q2 vs Q4+Q5', (Q == 0) | (Q == 1), (Q == 3) | (Q == 4))]
# 2. skrajne wyceny
PE, PG = X['pe'], X['peg']
fin = np.isfinite
NORM = fin(PE) & (PE < 50) & fin(PG) & (PG < 3)
SKR = fin(PE) & ((PE >= 50) | (fin(PG) & (PG >= 3)))
rows2 = [wiersz('P/E < 50 i PEG < 3 vs P/E ≥ 50 lub PEG ≥ 3', NORM, SKR), wiersz('P/E < 50 i PEG < 3 vs strata', NORM, STR & UNI),
         wiersz('P/E < 50 (bez PEG) vs P/E ≥ 50', fin(PE) & (PE < 50), fin(PE) & (PE >= 50))]
# 3. rozkład zwrotu (BCG)
def rozklad(h):
    rec = []
    for j in range(NS):
        k = kod[j]
        if k not in cache: continue
        sq = cache[k]
        if not all(x in sq for x in ('rev', 'ni', 'sh')): continue
        for m in STARTY:
            i = im_[m]
            if not UNI[i, j] or i + h >= NT or m > KON[h]: continue
            t0 = m.to_timestamp(how='end'); t1 = (m + h).to_timestamp(how='end')
            e0, r0 = sq['rev'].teraz(t0); e1, r1 = sq['rev'].teraz(t1)
            if not r0 or not r1 or r0 <= 0 or r1 <= 0: continue
            n0, n1 = sq['ni'].przy(t0, e0), sq['ni'].przy(t1, e1)
            s0, s1 = sq['sh'].przy(t0, e0), sq['sh'].przy(t1, e1)
            c0, c1 = Cv[i, j], Cv[i + h, j]
            if None in (n0, n1, s0, s1) or n0 <= 0 or n1 <= 0 or s0 <= 0 or s1 <= 0 or not (fin(c0) and fin(c1) and c0 > 0 and c1 > 0): continue
            s0a = s0 * podziel(k, e0, e1)  # liczba akcji na starcie w jednostkach po splitach
            lr = np.log(c1 / c0); lrev = np.log(r1 / r0); lsh = -np.log(s1 / s0a); lm = np.log((n1 / r1) / (n0 / r0))
            rec.append((i, lr, lrev, lsh, lm, lr - lrev - lsh - lm))
    D = pd.DataFrame(rec, columns=['i', 'lr', 'przychody', 'akcje', 'marża', 'P/E i dywidendy'])
    out = []
    for nm, sel in (('górne 25 % (w każdym starcie)', D.groupby('i')['lr'].transform(lambda s: s >= s.quantile(0.75))), ('wszystkie', D['lr'] == D['lr'])):
        d = D[sel]; tot = d['lr'].mean()
        r = {'horyzont': f'{h // 12} l.', 'grupa': nm, 'n': len(d), 'zwrot roczny (średnia log)': f'{100 * (np.exp(tot * 12 / h) - 1):.1f} %'}
        for c in ('przychody', 'akcje', 'marża', 'P/E i dywidendy'): r[c] = f'{100 * d[c].mean() / tot:.0f} %'
        out.append(r)
    return out
rows3 = rozklad(60) + rozklad(120) + rozklad(12)
print(rows3)
out = ['# Etap 112: dług w kwintylach, skrajne wyceny, rozkład zwrotu (BCG)', '',
       '## 1. Kwintyle D/E (dług ÷ kapitał, w każdym starcie)', '', pd.DataFrame(rq).to_markdown(index=False), '', pd.DataFrame(rows1).to_markdown(index=False), '',
       '## 2. Skrajne wyceny (PEG z przeszłego wzrostu zysku 5 lat)', '', pd.DataFrame(rows2).to_markdown(index=False), '',
       '## 3. Skąd zwrot: udział w średnim log-zwrocie (przychody + skup akcji = przychody na akcję; marża netto; reszta = P/E i dywidendy)', '',
       pd.DataFrame(rows3).to_markdown(index=False), '']
open(os.path.join(HERE, 'wyniki', 'r137_etap112.md'), 'w').write('\n'.join(out)); print('\n'.join(out))
