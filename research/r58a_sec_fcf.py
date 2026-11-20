"""Etap 37 (dane): roczne przepływy z działalności operacyjnej i nakłady inwestycyjne (capex) z SEC companyfacts -> /home/user/ndx/fcf.json
{ticker: [[start, end, ocf, capex, filed]]} (tylko okresy 350-380 dni; capex = PaymentsToAcquirePropertyPlantAndEquipment albo ProductiveAssets, brak = 0)."""
import json, os, time, datetime as dt, requests
UA = {"User-Agent": "Momentum research bot admin@example.com"}
SECQ = '/home/user/ndx/sec_q'; OUT = '/home/user/ndx/fcf.json'
OCF = ['NetCashProvidedByUsedInOperatingActivities', 'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations']
CAPEX = ['PaymentsToAcquirePropertyPlantAndEquipment', 'PaymentsToAcquireProductiveAssets', 'PaymentsForCapitalImprovements']
m = requests.get('https://www.sec.gov/files/company_tickers.json', headers=UA, timeout=30).json()
cik = {v['ticker'].upper().replace('.', '-'): int(v['cik_str']) for v in m.values()}
out = json.load(open(OUT)) if os.path.exists(OUT) else {}
dd = lambda s: dt.date.fromisoformat(s)
tick = sorted(fn[:-5].replace('.', '-') for fn in os.listdir(SECQ))
for n, t in enumerate(tick, 1):
    if t in out or t not in cik: continue
    try:
        r = requests.get(f'https://data.sec.gov/api/xbrl/companyfacts/CIK{cik[t]:010d}.json', headers=UA, timeout=60)
        if r.status_code != 200: out[t] = []; continue
        f = r.json().get('facts', {}).get('us-gaap', {})
        def ann(tags):
            for k in tags:
                rows = {}
                for x in f.get(k, {}).get('units', {}).get('USD', []):
                    if 'start' in x and 350 <= (dd(x['end']) - dd(x['start'])).days <= 380:
                        key = (x['start'], x['end'])
                        if key not in rows or x['filed'] < rows[key][1]: rows[key] = (x['val'], x['filed'])
                if rows: return rows
            return {}
        o, c = ann(OCF), ann(CAPEX)
        out[t] = [[s, e, v, c.get((s, e), (0.0, f_))[0], f_] for (s, e), (v, f_) in o.items()]
    except Exception as e:
        print(t, e, flush=True)
    if n % 100 == 0:
        print(n, len(tick), flush=True); json.dump(out, open(OUT, 'w'))
    time.sleep(0.12)
json.dump(out, open(OUT, 'w')); print('gotowe', len(out), sum(1 for v in out.values() if v), flush=True)
