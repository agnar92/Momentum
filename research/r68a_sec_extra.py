"""Etap 47 (dane): dodatkowe pozycje SEC companyfacts -> /home/user/ndx/sec_extra.json
inst: Assets, AssetsCurrent, LiabilitiesCurrent, Cash, InventoryNet, LongTermDebtNoncurrent; dur: GrossProfit, D&A, Dividends, Revenue (gdy brak w sec_q), NetIncome.
Format: {ticker: {tag: [[start|None, end, val, filed]]}} (start tylko dla okresów)."""
import json, os, time, requests
UA = {"User-Agent": "Momentum research bot admin@example.com"}
OUT = '/home/user/ndx/sec_extra.json'
INST = {'assets': ['Assets'], 'assets_cur': ['AssetsCurrent'], 'liab_cur': ['LiabilitiesCurrent'], 'inventory': ['InventoryNet'],
        'cash': ['CashAndCashEquivalentsAtCarryingValue', 'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents', 'Cash'],
        'sti': ['ShortTermInvestments', 'MarketableSecuritiesCurrent', 'AvailableForSaleSecuritiesDebtSecuritiesCurrent'],
        'ltd_nc': ['LongTermDebtNoncurrent', 'LongTermDebtAndCapitalLeaseObligations'], 'shares': ['CommonStockSharesOutstanding']}
DUR = {'gross': ['GrossProfit'], 'da': ['DepreciationDepletionAndAmortization', 'DepreciationAndAmortization', 'DepreciationAmortizationAndAccretionNet'],
       'div': ['PaymentsOfDividends', 'PaymentsOfDividendsCommonStock'], 'cogs': ['CostOfRevenue', 'CostOfGoodsAndServicesSold']}
m = requests.get('https://www.sec.gov/files/company_tickers.json', headers=UA, timeout=30).json()
cik = {v['ticker'].upper().replace('.', '-'): int(v['cik_str']) for v in m.values()}
out = json.load(open(OUT)) if os.path.exists(OUT) else {}
tick = sorted(fn[:-5].replace('.', '-') for fn in os.listdir('/home/user/ndx/sec_q'))
for n, t in enumerate(tick, 1):
    if t in out or t not in cik: continue
    try:
        r = requests.get(f'https://data.sec.gov/api/xbrl/companyfacts/CIK{cik[t]:010d}.json', headers=UA, timeout=60)
        if r.status_code != 200: out[t] = {}; continue
        f = r.json().get('facts', {}).get('us-gaap', {}); d = {}
        for k, tags in INST.items():
            for tg in tags:
                un = f.get(tg, {}).get('units', {}); un = un.get('USD') or un.get('shares') or []
                rows = [[None, x['end'], x['val'], x['filed']] for x in un if 'start' not in x]
                if rows: d[k] = rows; break
        for k, tags in DUR.items():
            for tg in tags:
                rows = [[x['start'], x['end'], x['val'], x['filed']] for x in f.get(tg, {}).get('units', {}).get('USD', []) if 'start' in x]
                if rows: d[k] = rows; break
        out[t] = d
    except Exception as e:
        print(t, e, flush=True)
    if n % 100 == 0: print(n, len(tick), flush=True); json.dump(out, open(OUT, 'w'))
    time.sleep(0.12)
json.dump(out, open(OUT, 'w')); print('gotowe', len(out), flush=True)
