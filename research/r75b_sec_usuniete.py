"""Dane SEC (EPS/przychody/zysk oper., bilans, FCF, dodatkowe pozycje, SIC) dla spółek usuniętych z S&P 500 / bez CIK -> dopisane do plików badania.
Kopia zapasowa oryginałów w backup/. Dla tickerów użytych ponownie (kod0 już ma plik innej spółki) dopisujemy wiersze starej spółki tylko do jej daty końca."""
import json, os, re, sys, time, shutil, datetime as dt, requests, pandas as pd
UA = {'User-Agent': 'Momentum research bot admin@example.com'}
ND = '/home/user/ndx'
CIK_RECZNIE = {'KRFT': 1545158, 'AET': 1122304, 'ACAS': 817473, 'CVC': 1053112}
W = pd.read_csv('mapa_cik.csv')
W['kod0'] = W.seria.str.split('.US').str[0].str.replace(r'_old\d*$', '', regex=True)
for k, v in CIK_RECZNIE.items(): W.loc[W.code == k, 'cik'] = v; W.loc[W.code == k, 'n_okresow'] = 99
W = W[W.cik.notna() & (W.n_okresow > 0)]
os.makedirs('backup', exist_ok=True)
for f in ('bilans.json', 'fcf.json', 'sec_extra.json', 'sic.json'):
    if not os.path.exists('backup/' + f): shutil.copy(f'{ND}/{f}', 'backup/' + f)
if not os.path.exists('backup/sec_q'): shutil.copytree(f'{ND}/sec_q', 'backup/sec_q')
have = set(f[:-5] for f in os.listdir('backup/sec_q'))
BIL, FCF, EX, SIC = (json.load(open(f'{ND}/{f}')) for f in ('bilans.json', 'fcf.json', 'sec_extra.json', 'sic.json'))
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
INST = {'assets': ['Assets'], 'assets_cur': ['AssetsCurrent'], 'liab_cur': ['LiabilitiesCurrent'], 'inventory': ['InventoryNet'],
        'cash': ['CashAndCashEquivalentsAtCarryingValue', 'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents', 'Cash'],
        'sti': ['ShortTermInvestments', 'MarketableSecuritiesCurrent', 'AvailableForSaleSecuritiesDebtSecuritiesCurrent'],
        'ltd_nc': ['LongTermDebtNoncurrent', 'LongTermDebtAndCapitalLeaseObligations'], 'shares': ['CommonStockSharesOutstanding']}
DUR = {'gross': ['GrossProfit'], 'da': ['DepreciationDepletionAndAmortization', 'DepreciationAndAmortization', 'DepreciationAmortizationAndAccretionNet'],
       'div': ['PaymentsOfDividends', 'PaymentsOfDividendsCommonStock'], 'cogs': ['CostOfRevenue', 'CostOfGoodsAndServicesSold']}
def get(url):
    for i in range(5):
        try:
            r = requests.get(url, headers=UA, timeout=90)
            if r.status_code == 404: return None
            if r.status_code == 200: return r.json()
        except Exception: pass
        time.sleep(2 ** i)
def wyciag(f):
    g = f.get('us-gaap', {})
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
    o, c = ann(OCF), ann(CAPEX)
    fcf = [[s, e, v, c.get((s, e), (0.0, f_))[0], f_] for (s, e), (v, f_) in o.items()]
    ex = {}
    for k, tags in INST.items():
        for tg in tags:
            un = g.get(tg, {}).get('units', {}); un = un.get('USD') or un.get('shares') or []
            rows = [[None, x['end'], x['val'], x['filed']] for x in un if 'start' not in x]
            if rows: ex[k] = rows; break
    for k, tags in DUR.items():
        for tg in tags:
            rows = [[x['start'], x['end'], x['val'], x['filed']] for x in g.get(tg, {}).get('units', {}).get('USD', []) if 'start' in x]
            if rows: ex[k] = rows; break
    return q, bil, fcf, ex
def tnij(rows, ie, do):          # tylko okresy kończące się przed końcem notowań starej spółki
    return [r for r in rows if r[ie] <= do]
gics = set(pd.read_csv('/home/user/eodhd-data/gics.csv').Symbol.str.replace('.', '-'))
nowe = dopis = 0
for n, r in enumerate(W.itertuples(), 1):
    k = r.kod0.replace('/', '_'); cik = int(r.cik)
    d = get(f'https://data.sec.gov/api/xbrl/companyfacts/CIK{cik:010d}.json')
    if not d or 'facts' not in d: print('brak', r.seria, cik, flush=True); continue
    q, bil, fcf, ex = wyciag(d['facts'])
    fn = f'{ND}/sec_q/{k}.json'
    if k not in have and not os.path.exists(fn):
        json.dump(q, open(fn, 'w')); BIL[k] = bil; FCF[k] = fcf; EX[k] = ex; nowe += 1
    else:
        do = (pd.Period(r.do, 'M') + 1).to_timestamp(how='end').date().isoformat()
        old = json.load(open(fn))
        for kk, v in q.items():
            old.setdefault(kk, {'rows': []})['rows'] += tnij(v['rows'], 1, do)
        json.dump(old, open(fn, 'w'))
        b = BIL.setdefault(k, {'eq': [], 'debt': {}, 'ni': []}) or {'eq': [], 'debt': {}, 'ni': []}; BIL[k] = b
        b.setdefault('eq', []).extend(tnij(bil['eq'], 0, do)); b.setdefault('ni', []).extend(tnij(bil['ni'], 1, do))
        for t, rows in bil['debt'].items(): b.setdefault('debt', {}).setdefault(t, []).extend(tnij(rows, 0, do))
        FCF[k] = (FCF.get(k) or []) + tnij(fcf, 1, do)
        e = EX.setdefault(k, {}) or {}; EX[k] = e
        for t, rows in ex.items(): e.setdefault(t, []).extend(tnij(rows, 1, do))
        dopis += 1
    if k not in gics and k not in SIC:
        s = get(f'https://data.sec.gov/submissions/CIK{cik:010d}.json'); SIC[k] = (s or {}).get('sic')
    if n % 25 == 0: print(n, len(W), flush=True)
    time.sleep(0.12)
for f, D in (('bilans.json', BIL), ('fcf.json', FCF), ('sec_extra.json', EX), ('sic.json', SIC)): json.dump(D, open(f'{ND}/{f}', 'w'))
W.to_csv(f'{ND}/delisted/mapa_uzyta.csv', index=False)
print('gotowe: nowe', nowe, 'dopisane', dopis, flush=True)
