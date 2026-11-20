"""Etap 34 (dane): bilans z SEC companyfacts dla spółek z /home/user/ndx/sec_q: kapitał własny, dług, zysk netto (kwartały) z datą złożenia.
Wynik: /home/user/ndx/bilans.json {ticker: {"eq": [[end, val, filed]], "debt": {tag: [[end, val, filed]]}, "ni": [[start, end, val, filed]]}}."""
import json, os, sys, time, requests
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
UA = {"User-Agent": "Momentum research bot admin@example.com"}
SECQ = '/home/user/ndx/sec_q'; OUT = '/home/user/ndx/bilans.json'
EQ = ['StockholdersEquity', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest']
DEBT = ['LongTermDebt', 'LongTermDebtNoncurrent', 'LongTermDebtCurrent', 'DebtCurrent', 'ShortTermBorrowings', 'LongTermDebtAndCapitalLeaseObligations',
        'LongTermDebtAndCapitalLeaseObligationsCurrent', 'CommercialPaper']
NI = ['NetIncomeLoss', 'NetIncomeLossAvailableToCommonStockholdersBasic', 'ProfitLoss']
m = requests.get('https://www.sec.gov/files/company_tickers.json', headers=UA, timeout=30).json()
cik = {v['ticker'].upper().replace('.', '-'): int(v['cik_str']) for v in m.values()}
out = json.load(open(OUT)) if os.path.exists(OUT) else {}
tick = sorted(fn[:-5].replace('.', '-') for fn in os.listdir(SECQ))
for n, t in enumerate(tick, 1):
    if t in out or t not in cik: continue
    try:
        r = requests.get(f'https://data.sec.gov/api/xbrl/companyfacts/CIK{cik[t]:010d}.json', headers=UA, timeout=60)
        if r.status_code != 200: out[t] = {}; continue
        f = r.json().get('facts', {}).get('us-gaap', {})
        def inst(tag): return [[x['end'], x['val'], x['filed']] for x in f.get(tag, {}).get('units', {}).get('USD', []) if 'start' not in x]
        def dur(tag): return [[x['start'], x['end'], x['val'], x['filed']] for x in f.get(tag, {}).get('units', {}).get('USD', []) if 'start' in x]
        eq = next((inst(k) for k in EQ if inst(k)), [])
        ni = next((dur(k) for k in NI if dur(k)), [])
        out[t] = {'eq': eq, 'debt': {k: inst(k) for k in DEBT if inst(k)}, 'ni': ni}
    except Exception as e:
        print(t, e, flush=True)
    if n % 50 == 0:
        print(n, len(tick), flush=True); json.dump(out, open(OUT, 'w'))
    time.sleep(0.12)
json.dump(out, open(OUT, 'w')); print('gotowe', len(out), sum(1 for v in out.values() if v.get('eq')), flush=True)
