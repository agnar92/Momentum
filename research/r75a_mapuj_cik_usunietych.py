import json, re, os, time, urllib.request, pandas as pd
O = pd.read_json('mapa.json')
RECZNE = {'AET': 'Aetna Inc', 'ACAS': 'American Capital Ltd', 'ALTR': 'Altera Corp', 'CVC': 'Cablevision Systems Corp', 'EP': 'El Paso Corp', 'FRX': 'Forest Laboratories Inc', 'HCP': 'HCP, Inc.', 'HNZ': 'Heinz H J Co', 'LLL': 'L 3 Communications Holdings', 'MON': 'Monsanto Co', 'PGN': 'Progress Energy Inc', 'PLL': 'Pall Corp', 'STR': 'Questar Corp', 'XL': 'XL Group plc', 'CEG': 'Constellation Energy Group Inc', 'MMI': 'Motorola Mobility Holdings', 'KRFT': 'Kraft Foods Group Inc', 'ADT': 'ADT Corp', 'AIV': 'Apartment Investment & Management Co', 'APC': 'Anadarko Petroleum Corp', 'BCR': 'Bard C R Inc',
          'BEAM': 'Beam Inc', 'CAM': 'Cameron International Corp', 'CA': 'CA, Inc.', 'CCEP': 'Coca-Cola Enterprises Inc', 'CPWR': 'Compuware Corp',
          'CSRA': 'CSRA Inc.', 'DELL': 'Dell Inc', 'DOW': 'Dow Chemical Co', 'DYN': 'Dynegy Inc', 'EMC': 'EMC Corp', 'ETFC': 'E Trade Financial Corp',
          'FB': 'Facebook Inc', 'HOT': 'Starwood Hotels & Resorts Worldwide', 'INFO': 'IHS Markit Ltd', 'JEF': 'Jefferies Group Inc', 'KDP': 'Dr Pepper Snapple Group',
          'LB': 'L Brands, Inc.', 'LDOS': 'SAIC, Inc.', 'LLTC': 'Linear Technology Corp', 'NFX': 'Newfield Exploration Co', 'PARA': 'Paramount Global',
          'PCL': 'Plum Creek Timber Co Inc', 'POM': 'Pepco Holdings Inc', 'RRD': 'Donnelley R R & Sons Co', 'SATS': 'EchoStar Corp', 'SE': 'Spectra Energy Corp',
          'SNDK': 'SanDisk Corp', 'SPLS': 'Staples Inc', 'SUN': 'Sunoco Inc', 'S': 'Sprint Corp', 'TE': 'TECO Energy Inc', 'WLTW': 'Willis Towers Watson plc'}
def norm(n):
    n = n.upper().replace('&', ' AND ')
    n = re.sub(r'[^A-Z0-9 ]', ' ', n)
    n = re.sub(r'\b(INC|INCORPORATED|CORP|CORPORATION|CO|COMPANY|LTD|LIMITED|PLC|THE|HOLDINGS?|GROUP|NEW|DEL|DE|LP|L P|SA|NV|COM|CL A|CLASS A|PUBLIC|LLC)\b', ' ', n)
    return ' '.join(n.split())
lk = {}
for line in open('cik_lookup.txt', encoding='latin-1'):
    p = line.rstrip('\n').rsplit(':', 2)
    if len(p) == 3 and p[1].isdigit():
        lk.setdefault(norm(p[0]), set()).add(int(p[1]))
klucze = sorted(lk)
import bisect
def kandydaci(nm):
    k = norm(nm)
    if k in lk: return sorted(lk[k])
    i = bisect.bisect_left(klucze, k); c = set()
    while i < len(klucze) and klucze[i].startswith(k) and len(c) < 15: c |= lk[klucze[i]]; i += 1
    return sorted(c)
UA = {'User-Agent': 'Momentum research bot admin@example.com'}
os.makedirs('facts', exist_ok=True)
def facts(cik):
    f = f'facts/{cik}.json'
    if os.path.exists(f): return json.load(open(f))
    for i in range(4):
        try:
            d = json.loads(urllib.request.urlopen(urllib.request.Request(f'https://data.sec.gov/api/xbrl/companyfacts/CIK{cik:010d}.json', headers=UA), timeout=60).read()); break
        except Exception as e:
            if '404' in str(e): d = {}; break
            time.sleep(2 ** i)
    else: d = {}
    # tylko potrzebne: nazwa + daty końca okresów EPS
    g = d.get('facts', {}).get('us-gaap', {})
    ends = sorted({x['end'] for t in ('EarningsPerShareDiluted', 'EarningsPerShareBasic', 'Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'SalesRevenueNet')
                   for u in g.get(t, {}).get('units', {}).values() for x in u})
    out = dict(name=d.get('entityName'), ends=ends); json.dump(out, open(f, 'w')); time.sleep(0.12); return out
wyn = []
for r in O.itertuples():
    nm = RECZNE.get(r.code) or r.nazwa
    if r.src == 'sec_ticker': c = [int(r.cik)]
    elif isinstance(nm, str) and nm: c = kandydaci(nm)
    else: c = []
    best, bs = None, 0
    for cik in c[:15]:
        f = facts(cik); n = sum(r.od <= e[:7] <= r.do for e in f['ends'])
        if n > bs: best, bs = cik, n
    wyn.append(dict(seria=r.seria, code=r.code, od=r.od, do=r.do, nazwa=nm, cik=best, n_okresow=bs, sec_nazwa=facts(best)['name'] if best else None))
W = pd.DataFrame(wyn); W.to_csv('mapa_cik.csv', index=False)
print((W.n_okresow > 0).sum(), 'z', len(W)); print(W[W.do >= '2012-06'].to_string())
