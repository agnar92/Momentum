"""Etap 45 (dane): kody SIC z SEC submissions dla spółek z sec_q spoza gics.csv -> /home/user/ndx/sic.json."""
import json, os, time, requests, pandas as pd
UA = {"User-Agent": "Momentum research bot admin@example.com"}
g = pd.read_csv('/home/user/eodhd-data/gics.csv'); znane = set(g.Symbol.str.replace('.', '-'))
m = requests.get('https://www.sec.gov/files/company_tickers.json', headers=UA, timeout=30).json()
cik = {v['ticker'].upper().replace('.', '-'): int(v['cik_str']) for v in m.values()}
tick = sorted(fn[:-5].replace('.', '-') for fn in os.listdir('/home/user/ndx/sec_q'))
out = {}
for t in tick:
    if t in znane or t not in cik: continue
    try:
        r = requests.get(f'https://data.sec.gov/submissions/CIK{cik[t]:010d}.json', headers=UA, timeout=30)
        if r.status_code == 200: out[t] = r.json().get('sic')
    except Exception as e: print(t, e)
    time.sleep(0.12)
json.dump(out, open('/home/user/ndx/sic.json', 'w')); print('SIC', len(out), 'bez GICS i CIK:', len([t for t in tick if t not in znane and t not in cik]))
