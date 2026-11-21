"""Etap 86 (dane): skup akcji, emisja akcji i dywidendy (przepływy) z SEC dla spółek top 500 -> /home/user/ndx/szer/sec86.json
{kod_bazowy: {klucz: {tag: [[start, end, val, filed]]}}}."""
import re, json, time, threading, requests, pandas as pd
UA = {'User-Agent': 'Momentum research bot admin@example.com'}
TAGI = {'skup': ['PaymentsForRepurchaseOfCommonStock'], 'emisja': ['ProceedsFromIssuanceOfCommonStock', 'ProceedsFromStockOptionsExercised'],
        'dyw': ['PaymentsOfDividendsCommonStock', 'PaymentsOfDividends']}
M = pd.read_csv('/home/user/ndx/szer/mapa.csv'); M['b'] = M.kod.map(lambda c: re.sub(r'#\d+$', '', c)); M = M.sort_values('do').drop_duplicates('b', keep='last')
zad = list(zip(M.b, M.cik.astype(int))); OUT = {}; lock = threading.Lock()
def get(url):
    for i in range(5):
        try:
            r = requests.get(url, headers=UA, timeout=90)
            if r.status_code == 404: return None
            if r.status_code == 200: return r.json()
        except Exception: pass
        time.sleep(2 ** i)
def worker():
    while True:
        with lock:
            if not zad: return
            b, k = zad.pop()
        d = get(f'https://data.sec.gov/api/xbrl/companyfacts/CIK{k:010d}.json'); g = (d or {}).get('facts', {}).get('us-gaap', {}); o = {}
        for kl, tags in TAGI.items():
            for t in tags:
                rows = [[x['start'], x['end'], x['val'], x['filed']] for x in ((g.get(t) or {}).get('units', {}).get('USD', [])) if 'start' in x]
                if rows: o.setdefault(kl, {})[t] = rows
        with lock:
            OUT[b] = o
            if len(OUT) % 300 == 0: print('SEC etap 86', len(OUT), flush=True)
        time.sleep(0.25)
th = [threading.Thread(target=worker) for _ in range(4)]; [t.start() for t in th]; [t.join() for t in th]
json.dump(OUT, open('/home/user/ndx/szer/sec86.json', 'w')); print('gotowe', len(OUT), sum(1 for v in OUT.values() if v.get('skup')), flush=True)
