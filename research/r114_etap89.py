"""Etap 89: jak budować pozycję — wpłaty co miesiąc, przechył wg wyceny / spadku a stałe kwoty; jednorazowo od razu a w 12 transzach. Protokół: etap 89."""
import os
HERE = os.path.dirname(os.path.abspath(__file__))
_s = open(os.path.join(HERE, 'r108_etap83.py')).read()
exec(_s[:_s.index("out = ['# Etap 83")])
rng = np.random.default_rng(89)
LISTA = (J7k == 7) & ZB                       # Jakość 7/7 (bez kryterium wyceny)
PE_ = np.where(np.nan_to_num(X['pe'], nan=-1) > 0, X['pe'], np.nan)
PE_MED = pd.DataFrame(PE_).rolling(60, min_periods=36).median().to_numpy()
MAX12 = pd.DataFrame(Cv).rolling(12, min_periods=6).max().to_numpy()
MM = [m for m in MI if pd.Period('2013-01', 'M') <= m <= pd.Period('2026-09', 'M')]
KOSZT = 0.999


def wagi(metoda, i, k_):
    if metoda == 'M0':
        return np.ones(len(k_))
    if metoda == 'M1':
        pg = PEG[i, k_]
        w = np.where((pg > 0) & (pg < 1), 2.0, np.where((pg >= 1) & (pg < 2), 1.0, np.where((pg >= 2) & (pg < 3), 0.5, 0.0)))
        return w if w.sum() > 0 else np.ones(len(k_))
    if metoda == 'M2':
        return np.where(Cv[i, k_] <= 0.85 * MAX12[i, k_], 2.0, 1.0)
    if metoda == 'M3':
        r = PE_[i, k_] / PE_MED[i, k_]
        return np.where(r < 0.8, 2.0, np.where(r > 1.2, 0.5, 1.0))
    pg = PEG[i, k_]                                # M4 / M5: tylko okazje PEG 0–1
    return np.where((pg > 0) & (pg < 1), 1.0, 0.0)


def irr(n, koniec):
    """Miesięczne wpłaty 1 przez n miesięcy (na początku), wartość `koniec` po n miesiącach -> roczna stopa."""
    lo, hi = -0.99, 1.0
    for _ in range(100):
        r = (lo + hi) / 2
        fv = sum((1 + r) ** (n - k) for k in range(n))
        lo, hi = (r, hi) if fv < koniec else (lo, r)
    return (1 + r) ** 12 - 1


def symuluj(metoda, od, do, bez=()):
    mm = [m for m in MM if pd.Period(od, 'M') <= m <= pd.Period(do, 'M')]
    wyl = np.isin(kod, list(bez))
    poz, wolne, czeka, twr, wpl = {}, 0.0, 0.0, [1.0], 0
    kosz_k, kosz_c = {}, {}                         # koszt zakupów i suma cen w miesiącach na liście (do średniego kosztu)
    for a, m in enumerate(mm[:-1]):
        i, i1 = im_[m], im_[mm[a + 1]]
        wpl += 1
        V = sum(poz.values()) + czeka + wolne + 1
        k_ = np.flatnonzero(LISTA[i] & ~wyl & np.isfinite(Cv[i]) & (Cv[i] > 0))
        do_wyd = 1 + wolne; wolne = 0.0
        if metoda in ('M4', 'M5'):
            do_wyd += czeka; czeka = 0.0
        if len(k_):
            for j in k_:
                kosz_c.setdefault(j, []).append(Cv[i, j])
            pod_lim = np.array([poz.get(j, 0) <= 0.15 * V for j in k_])
            w = wagi(metoda, i, k_) * (pod_lim if pod_lim.any() else 1)
            if w.sum() == 0:
                if metoda in ('M4', 'M5'):
                    czeka, do_wyd = do_wyd, 0.0
                else:
                    w = np.ones(len(k_))
            if do_wyd > 0:
                w = w / w.sum()
                for j, x in zip(k_, w):
                    if x > 0:
                        poz[j] = poz.get(j, 0) + do_wyd * x * KOSZT
                        kk = kosz_k.setdefault(j, [0.0, 0.0]); kk[0] += do_wyd * x; kk[1] += do_wyd * x / Cv[i, j]
        else:
            czeka += do_wyd
        przed = sum(poz.values()) + czeka
        for j in list(poz):
            if np.isfinite(Cv[i1, j]) and Cv[i, j] > 0:
                poz[j] *= Cv[i1, j] / Cv[i, j]
            else:
                wolne += poz.pop(j) * KOSZT
        if metoda == 'M5' and czeka:
            czeka *= spy[mm[a + 1]] / spy[m]
        po = sum(poz.values()) + czeka + wolne
        twr.append(twr[-1] * (po / przed if przed > 0 else 1))
    V = sum(poz.values()) + czeka + wolne
    t = pd.Series(twr); dd = (t / t.cummax() - 1).min()
    # średni koszt względem średniej ceny w miesiącach na liście (ważone kwotą zakupów)
    sk = [(kk[0], (kk[0] / kk[1]) / np.mean(kosz_c[j]) - 1) for j, kk in kosz_k.items() if kk[1] > 0 and len(kosz_c.get(j, [])) >= 3]
    kz = sum(a * b for a, b in sk) / sum(a for a, _ in sk) if sk else np.nan
    return dict(wplaty=wpl, wartosc_do_wplat=V / wpl, IRR=irr(wpl, V), maxDD=dd, koszt_vs_srednia=kz)


MET = {'M0': 'M0 równe kwoty (uśrednianie)', 'M1': 'M1 przechył wg PEG', 'M2': 'M2 przechył wg spadku ≥ 15 %', 'M3': 'M3 przechył wg P/E vs własna mediana 5 lat',
       'M4': 'M4 czekanie na PEG < 1 (gotówka 0 %)', 'M5': 'M5 czekanie na PEG < 1 (gotówka w SPY)'}
out = ['# Etap 89: budowanie pozycji — wpłata 1 jednostki co miesiąc w spółki Jakość 7/7, różne sposoby podziału wpłaty', '',
       'Spółek nie sprzedajemy; wpłaty tylko do spółek na liście w danym miesiącu; limit 15 % portfela; koszt 0,1 %. PEG historyczny (P/E ÷ przeszły wzrost EPS).', '']
rows = []
for k, nm in MET.items():
    rows.append(dict(sposób=nm, **symuluj(k, '2013-01', '2026-09'))); print(k, flush=True)
print('lista (spółek w styczniu):', {y: int(LISTA[im_[pd.Period(f'{y}-01', 'M')]].sum()) for y in range(2013, 2027)})
for k in ('M0', 'M1', 'M2'):
    rows.append(dict(sposób=MET[k] + ', BEZ NVDA', **symuluj(k, '2013-01', '2026-09', bez=('NVDA',))))
out += ['## Cały okres 2013-01..2026-09', '', pd.DataFrame(rows).round(3).to_markdown(index=False), '']
# okna 5-letnie
START = list(range(2013, 2022))
OK = {k: {y: symuluj(k, f'{y}-01', f'{y + 5}-01') for y in START} for k in MET}
print('okna', flush=True)
rows = []
for k, nm in MET.items():
    ir = np.array([OK[k][y]['IRR'] for y in START]); d = ir - np.array([OK['M0'][y]['IRR'] for y in START])
    bs = [d[rng.choice(len(d), len(d))].mean() for _ in range(2000)]
    lo, hi = np.percentile(bs, [2.5, 97.5])
    rows.append({'sposób': nm, 'IRR mediana': round(float(np.median(ir)), 3), 'IRR min': round(float(ir.min()), 3), 'maxDD mediana': round(float(np.median([OK[k][y]['maxDD'] for y in START])), 3),
                 'różnica vs M0 (pp/rok)': round(100 * d.mean(), 2), '95 % przedział': f'{100 * lo:+.2f} … {100 * hi:+.2f}', 'lepiej niż M0 (startów)': f'{int((d > 0).sum())}/{len(d)}'})
out += ['## Okna 5-letnie (start w styczniu 2013..2021), bootstrap po latach startowych', '', pd.DataFrame(rows).to_markdown(index=False), '',
        '### IRR wg roku startu', '', pd.DataFrame({MET[k][:2]: [round(OK[k][y]['IRR'], 3) for y in START] for k in MET}, index=START).to_markdown(), '']


# jednorazowa kwota: od razu vs 12 transz
def jednorazowo(y, transze):
    mm = [m for m in MM if pd.Period(f'{y}-01', 'M') <= m <= pd.Period(f'{y + 5}-01', 'M')]
    i0 = im_[mm[0]]; k_ = np.flatnonzero(LISTA[i0] & np.isfinite(Cv[i0]) & (Cv[i0] > 0))
    if not len(k_):
        return np.nan                               # pusta lista na starcie (mało danych SEC na początku okresu)
    poz, got, wolne = {}, 12.0, 0.0
    for a, m in enumerate(mm[:-1]):
        i, i1 = im_[m], im_[mm[a + 1]]
        if a < transze:
            kw = 12.0 / transze; got -= kw
            zyw = [j for j in k_ if np.isfinite(Cv[i, j]) and Cv[i, j] > 0]
            for j in zyw:
                poz[j] = poz.get(j, 0) + kw / len(zyw) * KOSZT
        for j in list(poz):
            if np.isfinite(Cv[i1, j]):
                poz[j] *= Cv[i1, j] / Cv[i, j]
            else:
                wolne += poz.pop(j) * KOSZT
    return (sum(poz.values()) + wolne + got) / 12


rows = []
for y in START:
    L, D = jednorazowo(y, 1), jednorazowo(y, 12)
    rows.append({'start': y, 'spółek': int((LISTA[im_[pd.Period(f'{y}-01', 'M')]]).sum()), 'od razu (×)': round(L, 2), '12 transz (×)': round(D, 2),
                 'lepiej': '–' if not np.isfinite(L) else 'od razu' if L > D else '12 transz'})
df = pd.DataFrame(rows).dropna()
out += ['## Jednorazowa kwota w spółki z listy na starcie: od razu vs 12 miesięcznych transz (gotówka 0 %), wynik po 5 latach', '', df.to_markdown(index=False), '',
        f'Od razu lepiej w {int((df["lepiej"] == "od razu").sum())}/{len(df)} startów; najgorszy start: od razu {df["od razu (×)"].min()}, 12 transz {df["12 transz (×)"].min()}.', '']
# kontrolnie (poza protokołem): szersza lista — 10 % spółek z najwyższą oceną ogólną (ok. 40 spółek)
LISTA = (np.nan_to_num(PCTL, nan=0) >= 0.9) & ZB
OK2 = {k: {y: symuluj(k, f'{y}-01', f'{y + 5}-01') for y in START} for k in MET}
rows = []
for k, nm in MET.items():
    ir = np.array([OK2[k][y]['IRR'] for y in START]); d = ir - np.array([OK2['M0'][y]['IRR'] for y in START])
    bs = [d[rng.choice(len(d), len(d))].mean() for _ in range(2000)]
    lo, hi = np.percentile(bs, [2.5, 97.5]); c = symuluj(k, '2013-01', '2026-09')
    rows.append({'sposób': nm, 'IRR 2013–2026': round(c['IRR'], 3), 'maxDD 2013–2026': round(c['maxDD'], 3), 'IRR okien mediana': round(float(np.median(ir)), 3),
                 'różnica vs M0 (pp/rok)': round(100 * d.mean(), 2), '95 % przedział': f'{100 * lo:+.2f} … {100 * hi:+.2f}', 'lepiej niż M0': f'{int((d > 0).sum())}/{len(d)}'})
out += ['## Kontrolnie (poza protokołem): szersza lista — top 10 % oceny ogólnej', '', pd.DataFrame(rows).to_markdown(index=False), '']
open(os.path.join(HERE, 'wyniki', 'r114_etap89.md'), 'w').write('\n'.join(out)); print('\n'.join(out))
