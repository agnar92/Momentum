"""Etap 68 (dane, 2. przebieg): rozszerzenie kandydatów do top 1000 obrotów + zapasowa liczba akcji (akcje ważone rozwodnione) dla spółek bez dei; kandydaci 'top 500 USA wg kapitalizacji' z szerokiego zbioru EODHD, CIK i dane SEC (z liczbą akcji) -> /home/user/ndx/szer/."""
import os, re, json, time, shutil, threading, bisect, datetime as dt, requests, numpy as np, pandas as pd
OUT = '/home/user/ndx/szer'; os.makedirs(OUT + '/sec_q', exist_ok=True)
UA = {'User-Agent': 'Momentum research bot admin@example.com'}
DL = '/home/user/ndx/delisted'
DV = pd.read_pickle('/home/user/eodhd-data/szeroki/DV.pkl').loc['2008-01':]
dv12 = DV.rolling(12, min_periods=10).mean().loc['2009-01':]
r = dv12.rank(axis=1, ascending=False)
kod = [c for c in r.columns[(r <= 1000).any()]]
baza = lambda c: re.sub(r'#\d+$', '', c)
ok = lambda c: not re.search(r'-(WS|U|UN|R|RT|P|W)\b|-P-|^\w{5}F$|\.', baza(c)) and len(baza(c)) <= 6
kod = [c for c in kod if ok(c)]
okres = {c: (str(DV[c].first_valid_index()), str(DV[c].last_valid_index())) for c in kod}
M0 = pd.read_csv(f'{OUT}/mapa.csv'); SH0 = json.load(open(f'{OUT}/akcje.json'))
bez_akcji = {c for c in M0.kod if not any(v and v > 0 for _, v, _ in SH0.get(c, []))}
kod = [c for c in kod if c not in set(M0.kod) or c in bez_akcji]
print('kandydatów do pobrania (nowi + bez liczby akcji)', len(kod), 'z czego bez akcji', len(bez_akcji), flush=True)
# --- CIK ---
stare = json.load(open('/home/user/ndx/sec_q/_cik.json'))
mapa_del = pd.read_csv(f'{DL}/mapa_uzyta.csv')
sec_t = {v['ticker'].upper(): int(v['cik_str']) for v in requests.get('https://www.sec.gov/files/company_tickers.json', headers=UA, timeout=60).json().values()}
act = {d['Code']: d['Name'] for d in json.load(open(f'{DL}/eod_active.json'))}
dlist = {}
for d in json.load(open(f'{DL}/eod_delisted.json')): dlist.setdefault(d['Code'], d['Name'])
def norm(n):
    n = n.upper().replace('&', ' AND '); n = re.sub(r'[^A-Z0-9 ]', ' ', n)
    n = re.sub(r'\b(INC|INCORPORATED|CORP|CORPORATION|CO|COMPANY|LTD|LIMITED|PLC|THE|HOLDINGS?|GROUP|NEW|DEL|DE|LP|L P|SA|NV|COM|CL A|CLASS A|PUBLIC|LLC|ORD|SHS|ADR|COMMON STOCK)\b', ' ', n)
    return ' '.join(n.split())
lk = {}
for line in open(f'{DL}/cik_lookup.txt', encoding='latin-1'):
    p = line.rstrip('\n').rsplit(':', 2)
    if len(p) == 3 and p[1].isdigit(): lk.setdefault(norm(p[0]), set()).add(int(p[1]))
klucze = sorted(lk)
def kand_cik(nm):
    k = norm(nm)
    if not k: return []
    if k in lk: return sorted(lk[k])[:6]
    i = bisect.bisect_left(klucze, k); c = set()
    while i < len(klucze) and klucze[i].startswith(k) and len(c) < 6: c |= lk[klucze[i]]; i += 1
    return sorted(c)
CIK, ZRODLO, DO_SPRAW = {}, {}, {}
for c in kod:
    b = baza(c)
    if b in stare: CIK[c] = int(stare[b]); ZRODLO[c] = 'stare'
    elif c in set(mapa_del.code) or b in set(mapa_del.code):
        x = mapa_del[mapa_del.code == b]; CIK[c] = int(x.cik.iloc[0]); ZRODLO[c] = 'usuniete_sp'
    elif okres[c][1] >= '2026-06' and b.replace('.', '-') in sec_t: CIK[c] = sec_t[b.replace('.', '-')]; ZRODLO[c] = 'sec_ticker'
    else:
        nm = dlist.get(b) if okres[c][1] < '2026-06' else (act.get(b) or dlist.get(b))
        if nm: DO_SPRAW[c] = kand_cik(nm)
print('CIK od razu', len(CIK), 'do sprawdzenia po nazwie', len(DO_SPRAW), 'bez nazwy', len(kod) - len(CIK) - len(DO_SPRAW), flush=True)
# --- pobieranie companyfacts ---
dd = lambda s: dt.date.fromisoformat(s)
TAGS = {'eps': ('USD/shares', ['EarningsPerShareDiluted', 'EarningsPerShareBasicAndDiluted', 'EarningsPerShareBasic']), 'opinc': ('USD', ['OperatingIncomeLoss']),
        'rev': ('USD', ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'SalesRevenueNet', 'RevenueFromContractWithCustomerIncludingAssessedTax',
                        'SalesRevenueGoodsNet', 'SalesRevenueServicesNet', 'RevenuesNetOfInterestExpense', 'RevenueFromContractWithCustomerBeforeAssessedTax'])}
EQ = ['StockholdersEquity', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest']
DEBT = ['LongTermDebt', 'LongTermDebtNoncurrent', 'LongTermDebtCurrent', 'DebtCurrent', 'ShortTermBorrowings', 'LongTermDebtAndCapitalLeaseObligations',
        'LongTermDebtAndCapitalLeaseObligationsCurrent', 'CommercialPaper']
NI = ['NetIncomeLoss', 'NetIncomeLossAvailableToCommonStockholdersBasic', 'ProfitLoss']
OCF = ['NetCashProvidedByUsedInOperatingActivities', 'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations']
CAPEX = ['PaymentsToAcquirePropertyPlantAndEquipment', 'PaymentsToAcquireProductiveAssets', 'PaymentsForCapitalImprovements']
def get(url):
    for i in range(5):
        try:
            x = requests.get(url, headers=UA, timeout=90)
            if x.status_code == 404: return None
            if x.status_code == 200: return x.json()
        except Exception: pass
        time.sleep(2 ** i)
def wyciag(facts):
    g = facts.get('us-gaap', {})
    q = {}
    for k, (unit, tags) in TAGS.items():
        rows = [[x['start'], x['end'], float(x['val']), x['filed'], x.get('form', ''), ti] for ti, tag in enumerate(tags)
                for x in (g.get(tag) or {}).get('units', {}).get(unit, []) if 'start' in x]
        if rows: q[k] = {'rows': rows}
    inst = lambda tag: [[x['end'], x['val'], x['filed']] for x in g.get(tag, {}).get('units', {}).get('USD', []) if 'start' not in x]
    dur = lambda tag: [[x['start'], x['end'], x['val'], x['filed']] for x in g.get(tag, {}).get('units', {}).get('USD', []) if 'start' in x]
    bil = {'eq': next((inst(k) for k in EQ if inst(k)), []), 'debt': {k: inst(k) for k in DEBT if inst(k)}, 'ni': next((dur(k) for k in NI if dur(k)), [])}
    def ann(tags):
        for k in tags:
            rows = {}
            for x in g.get(k, {}).get('units', {}).get('USD', []):
                if 'start' in x and 350 <= (dd(x['end']) - dd(x['start'])).days <= 380:
                    key = (x['start'], x['end'])
                    if key not in rows or x['filed'] < rows[key][1]: rows[key] = (x['val'], x['filed'])
            if rows: return rows
        return {}
    o, cx = ann(OCF), ann(CAPEX)
    fcf = [[s, e, v, cx.get((s, e), (0.0, f_))[0], f_] for (s, e), (v, f_) in o.items()]
    sh = [[x['end'], x['val'], x['filed']] for x in facts.get('dei', {}).get('EntityCommonStockSharesOutstanding', {}).get('units', {}).get('shares', [])]
    sh = [r_ for r_ in sh if r_[1] and r_[1] > 0]
    if not sh: sh = [[x['end'], x['val'], x['filed']] for x in g.get('CommonStockSharesOutstanding', {}).get('units', {}).get('shares', []) if 'start' not in x and x['val'] > 0]
    if not sh:
        w = [x for x in g.get('WeightedAverageNumberOfDilutedSharesOutstanding', {}).get('units', {}).get('shares', []) if 'start' in x and x['val'] > 0
             and 80 <= (dd(x['end']) - dd(x['start'])).days <= 100]
        sh = [[x['end'], x['val'], x['filed']] for x in w]
    ends = sorted({r[1] for v in q.values() for r in v['rows']})
    return q, bil, fcf, sh, ends, facts
WYN = {}; lock = threading.Lock()
zad = [(c, CIK[c]) for c in kod if c in CIK] + [(c, k) for c in DO_SPRAW for k in DO_SPRAW[c]]
FCACHE = {}
def worker():
    while True:
        with lock:
            if not zad: return
            c, k = zad.pop()
        if k in FCACHE: continue
        d = get(f'https://data.sec.gov/api/xbrl/companyfacts/CIK{k:010d}.json')
        res = wyciag(d['facts']) if d and 'facts' in d else None
        nm = d.get('entityName') if d else None
        with lock:
            FCACHE[k] = (res[:5] if res else None, nm)
            if len(FCACHE) % 100 == 0: print('pobrano', len(FCACHE), 'zostało', len(zad), flush=True)
        time.sleep(0.25)
th = [threading.Thread(target=worker) for _ in range(4)]; [t.start() for t in th]; [t.join() for t in th]
# wybór CIK po nazwie: najwięcej końców okresów w czasie notowań
for c, ks in DO_SPRAW.items():
    od, do = okres[c]; best, bs = None, 0
    for k in ks:
        r_ = FCACHE.get(k, (None,))[0]
        if not r_: continue
        n = sum(od <= e[:7] <= do for e in r_[4])
        if n > bs: best, bs = k, n
    if best and bs >= 4: CIK[c] = best; ZRODLO[c] = 'nazwa'
BIL, FCF_, SH, SIC = (json.load(open(f'{OUT}/{f}')) for f in ('bilans.json', 'fcf.json', 'akcje.json', 'sic.json')); MAPA = [m for m in M0.to_dict('records') if m['kod'] not in set(kod)]
gics = set(pd.read_csv('/home/user/eodhd-data/gics.csv').Symbol.str.replace('.', '-'))
sic_old = json.load(open('/home/user/ndx/sic.json'))
stare_q = set(f[:-5] for f in os.listdir('/home/user/ndx/sec_q'))
B_old, F_old = json.load(open('/home/user/ndx/bilans.json')), json.load(open('/home/user/ndx/fcf.json'))
for c in kod:
    k = CIK.get(c)
    if not k or not FCACHE.get(k, (None,))[0]: continue
    q, bil, fcf, sh, ends = FCACHE[k][0]
    b = baza(c)
    if os.path.exists(f'{OUT}/sec_q/{b}.json') and c in bez_akcji:
        pass                                      # dane już są (pod kodem bazowym), uzupełniamy tylko liczbę akcji
    elif b in stare_q:                      # dane z dotychczasowego badania (z dopisanymi spółkami usuniętymi) + liczba akcji
        shutil.copy(f'/home/user/ndx/sec_q/{b}.json', f'{OUT}/sec_q/{c}.json'); BIL[c] = B_old.get(b, bil); FCF_[c] = F_old.get(b, fcf)
    else:
        json.dump(q, open(f'{OUT}/sec_q/{c}.json', 'w')); BIL[c] = bil; FCF_[c] = fcf
    SH[c] = sh; MAPA.append(dict(kod=c, cik=k, zrodlo=ZRODLO.get(c), nazwa_sec=FCACHE[k][1], od=okres[c][0], do=okres[c][1]))
    if b in sic_old: SIC[c] = sic_old[b]
for c in [m['kod'] for m in MAPA if baza(m['kod']) not in gics and m['kod'] not in SIC and baza(m['kod']) not in SIC and m['kod'] in CIK]:
    s = get(f'https://data.sec.gov/submissions/CIK{CIK[c]:010d}.json'); SIC[c] = (s or {}).get('sic'); time.sleep(0.12)
for f, D in (('bilans.json', BIL), ('fcf.json', FCF_), ('akcje.json', SH), ('sic.json', SIC)): json.dump(D, open(f'{OUT}/{f}', 'w'))
pd.DataFrame(MAPA).to_csv(f'{OUT}/mapa.csv', index=False)
print('gotowe: spółek z danymi SEC', len(MAPA), 'z', len(kod), pd.DataFrame(MAPA).zrodlo.value_counts().to_dict(), flush=True)
