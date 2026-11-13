"""Ranking jakości (inwestowanie długoterminowe w stylu Buffetta) — czyste funkcje bez sieci.

Sito: link Finviz (QUALITY_FILTERS). Dla każdej spółki z sita historia roczna z SEC (raporty 10-K, do 10 lat): ROIC, marża brutto, marża FCF,
przychody, liczba akcji. Ranking = średnia ważona percentyli w obrębie sita (WEIGHTS, cztery bloki: trwałość i jakość, wycena, wzrost,
kapitał). Wymagane co najmniej MIN_YEARS lat danych; młodsza spółka dostaje mniej punktów, bo licznik lat z ROIC ≥ 15 % jest liczony na 10.
Banki, ubezpieczyciele i REIT-y odpadają (ROIC, current ratio i dług nie mają u nich sensu). Top 10 z limitem SECTOR_CAP spółek na sektor.
ROIC z SEC to PRZYBLIŻENIE: zysk operacyjny × (1 − podatek) / (kapitał własny + dług − gotówka); dług tylko z typowych tagów XBRL.
Nie testowane historycznie — to narzędzie do wyboru spółek do ręcznej analizy, nie rekomendacja."""
import datetime as dt
import statistics

QUALITY_FILTERS = "cap_midover,fa_roic_o15,fa_opermargin_o10,fa_debteq_u1,fa_curratio_o1,fa_sales5years_o5,fa_eps5years_o5,fa_pfcf_u20"
YEARS = 10
MIN_YEARS = 5
ROIC_HIT = 0.15
TOP = 10
SECTOR_CAP = 3
EXCLUDED_SECTORS = ("Financial", "Real Estate")
TAX_DEFAULT = 0.21
STALE_DAYS = 550          # ostatni raport roczny starszy niż ~18 mies. -> brak danych

# (klucz, blok, waga, kierunek: +1 = więcej lepiej, -1 = mniej lepiej)
WEIGHTS = [
    ("roic_hits", "q", 10, 1), ("roic_med", "q", 10, 1), ("roic_recent", "q", 5, 1), ("gm_med", "q", 5, 1),
    ("gm_sd", "q", 5, -1), ("fcfm_med", "q", 5, 1), ("fcf_conv", "q", 5, 1),
    ("fcf_yield", "v", 15, 1), ("fwd_ey", "v", 10, 1), ("ey", "v", 5, 1),
    ("rev_cagr", "g", 10, 1), ("est_lt", "g", 5, 1),
    ("sh_cagr", "b", 4, -1), ("debt_eq", "b", 3, -1), ("cur_ratio", "b", 3, 1),
]
BLOCKS = {"q": "Trwałość i jakość", "v": "Wycena", "g": "Wzrost", "b": "Kapitał i bilans"}

TAGS = {
    "rev": ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "SalesRevenueNet",
            "RevenueFromContractWithCustomerIncludingAssessedTax", "SalesRevenueGoodsNet", "Revenue"],
    "gp": ["GrossProfit"],
    "cogs": ["CostOfRevenue", "CostOfGoodsAndServicesSold", "CostOfGoodsSold", "CostOfSales"],
    "op": ["OperatingIncomeLoss", "ProfitLossFromOperatingActivities"],
    "ni": ["NetIncomeLoss", "ProfitLoss", "NetIncomeLossAvailableToCommonStockholdersBasic"],
    "ocf": ["NetCashProvidedByUsedInOperatingActivities", "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations"],
    "capex": ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets",
              "PaymentsToAcquirePropertyPlantAndEquipmentAndIntangibleAssets"],
    "tax": ["IncomeTaxExpenseBenefit"],
    "pretax": ["IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest",
               "IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments",
               "IncomeLossFromContinuingOperationsBeforeIncomeTaxesDomestic"],
}
SHARE_TAGS = ["WeightedAverageNumberOfDilutedSharesOutstanding", "WeightedAverageNumberOfShareOutstandingBasicAndDiluted",
              "WeightedAverageNumberOfSharesOutstandingBasic"]
BAL = {
    "eq": ["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"],
    "cash": ["CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"],
    "debt": ["LongTermDebt", "LongTermDebtAndCapitalLeaseObligationsIncludingCurrentMaturities", "DebtLongtermAndShorttermCombinedAmount"],
    "debt_nc": ["LongTermDebtNoncurrent", "LongTermDebtAndCapitalLeaseObligations"],
    "debt_c": ["LongTermDebtCurrent", "LongTermDebtAndCapitalLeaseObligationsCurrent", "DebtCurrent"],
    "st": ["ShortTermBorrowings"],
    "cp": ["CommercialPaper"],
}


def _facts(facts, tag, unit):
    """Fakty tagu w jednostce `unit`; dla USD spółki zagraniczne (20-F, IFRS) mają walutę lokalną — bierzemy ją (liczymy tylko proporcje)."""
    for tax in ("us-gaap", "ifrs-full"):
        units = (facts.get(tax, {}).get(tag) or {}).get("units", {})
        if units.get(unit):
            return units[unit]
        if unit == "USD":
            cur = [u for u in units if len(u) == 3 and u.isupper()]
            if len(cur) == 1:
                return units[cur[0]]
    return []


def annual(facts, tags, unit="USD"):
    """Wartości za rok obrotowy (okres 350–380 dni) -> {koniec roku: wartość}. Przy korektach wygrywa najpóźniej złożony raport;
    kolejne tagi uzupełniają lata, których brakuje w poprzednich (spółki zmieniały tag przychodów w 2018)."""
    out = {}
    for tag in tags:
        best = {}
        for x in _facts(facts, tag, unit):
            if "start" not in x:
                continue
            s, e = dt.date.fromisoformat(x["start"]), dt.date.fromisoformat(x["end"])
            if 350 <= (e - s).days <= 380 and (e not in best or x.get("filed", "") >= best[e][0]):
                best[e] = (x.get("filed", ""), float(x["val"]))
        for e, (_, v) in best.items():
            out.setdefault(e, v)
    return out


def instant(facts, tags, unit="USD"):
    """Stany bilansowe -> {data: wartość}; pierwszy tag z daną datą wygrywa, w obrębie tagu najpóźniej złożony raport."""
    out = {}
    for tag in tags:
        best = {}
        for x in _facts(facts, tag, unit):
            if "start" in x:
                continue
            e = dt.date.fromisoformat(x["end"])
            if e not in best or x.get("filed", "") >= best[e][0]:
                best[e] = (x.get("filed", ""), float(x["val"]))
        for e, (_, v) in best.items():
            out.setdefault(e, v)
    return out


def _near(d, e, days=10):
    """Wartość z datą w odległości ≤ days od e (koniec roku obrotowego bywa przesunięty o kilka dni między tagami)."""
    if e in d:
        return d[e]
    for x, v in d.items():
        if abs((x - e).days) <= days:
            return v
    return None


def _debt(bal, e):
    total = _near(bal["debt"], e)
    if total is None:
        nc, c = _near(bal["debt_nc"], e), _near(bal["debt_c"], e)
        total = (nc or 0) + (c or 0) if nc is not None or c is not None else None
    extra = (_near(bal["st"], e) or 0) + (_near(bal["cp"], e) or 0)
    return (total or 0) + extra


def history(facts, years=YEARS):
    """Ostatnie `years` lat obrotowych (y = rok, w którym kończy się rok obrotowy) -> lista [{y, end, rev, gm, opm, roic, fcfm, fcf, ni, sh}] (najstarsze pierwsze)."""
    a = {k: annual(facts, t) for k, t in TAGS.items()}
    sh = annual(facts, SHARE_TAGS, "shares")
    bal = {k: instant(facts, t) for k, t in BAL.items()}
    rev = {e: v for e, v in a["rev"].items() if v > 0}
    out = []
    for e in sorted(rev)[-years:]:
        r = rev[e]
        gp = _near(a["gp"], e)
        if gp is None and _near(a["cogs"], e) is not None:
            gp = r - _near(a["cogs"], e)
        op, ni, ocf, capex = (_near(a[k], e) for k in ("op", "ni", "ocf", "capex"))
        tax, pre = _near(a["tax"], e), _near(a["pretax"], e)
        t = tax / pre if tax is not None and pre and pre > 0 and 0 <= tax / pre <= 0.5 else TAX_DEFAULT
        eq, cash = _near(bal["eq"], e), _near(bal["cash"], e) or 0
        roic = None
        if op is not None and eq is not None:
            ic = eq + _debt(bal, e) - cash
            nopat = op * (1 - t)
            if ic > 0:
                roic = max(min(nopat / ic, 1.0), -1.0)
            elif nopat > 0:
                roic = 1.0     # kapitał zainwestowany ≤ 0 (gotówka > kapitał + dług) przy zysku: zwrot „nieskończony”, obcinamy do 100 %
        fcf = ocf - (capex or 0) if ocf is not None else None
        out.append(dict(y=e.year, end=e.isoformat(), rev=r, gm=None if gp is None else gp / r,
                        opm=None if op is None else op / r, roic=roic, fcf=fcf, fcfm=None if fcf is None else fcf / r, ni=ni,
                        sh=_near(sh, e)))
    idx = [i for i, h in enumerate(out) if h["sh"]]
    for i, v in zip(idx, split_adjust([out[i]["sh"] for i in idx])):
        out[i]["sh"] = v
    return out


def split_adjust(shares):
    """Liczba akcji rok po roku -> skorygowana o splity: skok ×k albo ÷k (k ≥ 2 całkowite, ±6 % — split bywa w roku ze skupem akcji) między latami to split,
    wcześniejsze lata przeliczamy tym samym czynnikiem (SEC nie przelicza starszych raportów)."""
    out = list(shares)
    for i in range(1, len(out)):
        r = out[i] / out[i - 1]
        k = r if r > 1 else 1 / r
        if round(k) >= 2 and abs(k - round(k)) < 0.06 * k:
            f = round(k) if r > 1 else 1 / round(k)
            out[:i] = [x * f for x in out[:i]]
    return out


def _r(x, n=4):
    return None if x is None else round(x, n)


def fresh(hist, today):
    """Czy ostatni raport roczny nie jest starszy niż STALE_DAYS."""
    return bool(hist) and (today - dt.date.fromisoformat(hist[-1]["end"])).days <= STALE_DAYS


def summary(hist, today=None):
    """Historia roczna -> cechy trwałości (None, gdy za mało lat albo ostatni raport jest stary)."""
    today = today or dt.date.today()
    if not fresh(hist, today) or len(hist) < MIN_YEARS:
        return None
    roic = [h["roic"] for h in hist if h["roic"] is not None]
    gm = [h["gm"] for h in hist if h["gm"] is not None]
    fcfm = [h["fcfm"] for h in hist if h["fcfm"] is not None]
    n = len(hist)
    fcf_sum = sum(h["fcf"] for h in hist if h["fcf"] is not None and h["ni"] is not None)
    ni_sum = sum(h["ni"] for h in hist if h["fcf"] is not None and h["ni"] is not None)
    shs = [h["sh"] for h in hist if h["sh"]]
    return dict(
        years=n,
        roic_hits=sum(1 for x in roic if x >= ROIC_HIT),
        roic_n=len(roic),
        roic_med=_r(statistics.median(roic)) if roic else None,
        roic_recent=_r(statistics.mean(roic[-3:])) if roic else None,
        gm_med=_r(statistics.median(gm)) if gm else None,
        gm_sd=_r(statistics.pstdev(gm)) if len(gm) >= 3 else None,
        fcfm_med=_r(statistics.median(fcfm)) if fcfm else None,
        fcf_pos=sum(1 for x in fcfm if x > 0),
        fcf_conv=_r(max(min(fcf_sum / ni_sum, 2.0), 0.0)) if ni_sum > 0 else None,
        rev_cagr=_r((hist[-1]["rev"] / hist[0]["rev"]) ** (1 / (n - 1)) - 1),
        sh_cagr=_r((shs[-1] / shs[0]) ** (1 / (len(shs) - 1)) - 1) if len(shs) >= 3 and shs[0] > 0 else None,
    )


def finviz_metrics(fv):
    """Wiersz Finviz (widoki 111 / 121 / 161) -> metryki wyceny i bilansu w ułamkach (FCF yield = 1 / P/FCF itd.)."""
    def inv(x):
        return 1 / x if x and x > 0 else None

    def pct(x):
        return None if x is None else x / 100
    return dict(fcf_yield=_r(inv(fv.get("PFCF"))), fwd_ey=_r(inv(fv.get("forwardPE"))), ey=_r(inv(fv.get("PE"))),
                est_lt=_r(pct(fv.get("estLTGrowth"))), debt_eq=_r(fv.get("debtEq")), cur_ratio=_r(fv.get("curRatio")),
                pfcf=_r(fv.get("PFCF"), 2), fwd_pe=_r(fv.get("forwardPE"), 2), pe=_r(fv.get("PE"), 2), ps=_r(fv.get("PS"), 2),
                roic_fv=_r(pct(fv.get("roi"))), gm_fv=_r(pct(fv.get("grossMargin"))), opm_fv=_r(pct(fv.get("operMargin"))),
                sales5=_r(pct(fv.get("sales5Years"))), eps5=_r(pct(fv.get("eps5Years"))), mcap=fv.get("marketCap"), price=fv.get("price"))


def percentiles(values):
    """Lista liczb / None -> percentyle 0–100 (remisy = średnia pozycja; jedna wartość = 50); None zostaje None."""
    idx = sorted((v, i) for i, v in enumerate(values) if v is not None)
    out = [None] * len(values)
    n = len(idx)
    k = 0
    while k < n:
        j = k
        while j + 1 < n and idx[j + 1][0] == idx[k][0]:
            j += 1
        p = 50.0 if n == 1 else (k + j) / 2 / (n - 1) * 100
        for m in range(k, j + 1):
            out[idx[m][1]] = p
        k = j + 1
    return out


def score(rows, weights=WEIGHTS):
    """Dodaje do wierszy `pts` {blok: 0–100}, `score` 0–100 i `rank`. Brak metryki -> waga rozkłada się na pozostałe w bloku;
    brak całego bloku -> na pozostałe bloki. Wiersze bez score (None) idą na koniec."""
    pct = {k: percentiles([r.get(k) for r in rows]) for k, _, _, _ in weights}
    bw = {}
    for _, b, w, _ in weights:
        bw[b] = bw.get(b, 0) + w
    for i, r in enumerate(rows):
        acc = {}
        for k, b, w, d in weights:
            p = pct[k][i]
            if p is not None:
                s, ws = acc.get(b, (0.0, 0.0))
                acc[b] = (s + w * (p if d > 0 else 100 - p), ws + w)
        r["pts"] = {b: round(s / ws, 1) for b, (s, ws) in acc.items() if ws}
        tot = sum(bw[b] for b in r["pts"])
        r["score"] = round(sum(r["pts"][b] * bw[b] for b in r["pts"]) / tot, 1) if tot else None
    rows.sort(key=lambda r: (r["score"] is None, -(r["score"] or 0)))
    for n, r in enumerate(rows, 1):
        r["rank"] = n
    return rows


def pick_top(rows, top=TOP, cap=SECTOR_CAP):
    """Pierwsze `top` wierszy z rankingu, najwyżej `cap` z jednego sektora -> ustawia r["top"] i zwraca listę tickerów."""
    used, out = {}, []
    for r in rows:
        r["top"] = False
        if len(out) >= top or r.get("score") is None:
            continue
        s = r.get("sector") or "?"
        if used.get(s, 0) >= cap:
            continue
        used[s] = used.get(s, 0) + 1
        r["top"] = True
        out.append(r["t"])
    return out
