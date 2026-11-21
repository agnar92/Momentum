"""Fundamenty spółki z SEC companyfacts i wskaźniki strony „Fundamenta — jakość vs wycena” (czyste funkcje, bez sieci).

Wyciąg z companyfacts (`wyciag`) -> serie kwartalne (przychody, zysk netto, zysk operacyjny, przepływy operacyjne, nakłady inwestycyjne)
i bilansowe (gotówka, dług, kapitał własny, aktywa, zobowiązania bieżące, liczba akcji). Kwartały: wartości 3-miesięczne, a brakujące
(zwykle 4. kwartał i kwartalne przepływy pieniężne) z różnic narastających wartości tego samego roku obrotowego (6 / 9 / 12 mies. minus
poprzednia). Wartość z pierwszego złożenia (bez późniejszych korekt) — tak jak w badaniu (research/)."""
import datetime as dt

def D(s):
    return dt.date.fromisoformat(s)

TAGI = {
    "rev": ("USD", ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "SalesRevenueNet",
                    "RevenueFromContractWithCustomerIncludingAssessedTax", "SalesRevenueGoodsNet", "SalesRevenueServicesNet"]),
    "ni": ("USD", ["NetIncomeLoss", "ProfitLoss", "NetIncomeLossAvailableToCommonStockholdersBasic"]),
    "op": ("USD", ["OperatingIncomeLoss"]),
    "gp": ("USD", ["GrossProfit"]),
    "ocf": ("USD", ["NetCashProvidedByUsedInOperatingActivities", "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations"]),
    "capex": ("USD", ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets"]),
    "sbc": ("USD", ["ShareBasedCompensation", "AllocatedShareBasedCompensationExpense"]),
    "skup": ("USD", ["PaymentsForRepurchaseOfCommonStock"]),
    "emisja": ("USD", ["ProceedsFromIssuanceOfCommonStock"]),
    "dyw": ("USD", ["PaymentsOfDividendsCommonStock", "PaymentsOfDividends"]),
    "eps": ("USD/shares", ["EarningsPerShareDiluted", "EarningsPerShareBasicAndDiluted", "EarningsPerShareBasic"]),
}
CHWILE = {
    "cash": ["CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents", "Cash"],
    "sti": ["ShortTermInvestments", "MarketableSecuritiesCurrent", "AvailableForSaleSecuritiesDebtSecuritiesCurrent"],
    "eq": ["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"],
    "assets": ["Assets"],
    "lc": ["LiabilitiesCurrent"],
    "lease": ["OperatingLeaseLiability"],
    "lease_nc": ["OperatingLeaseLiabilityNoncurrent"],
    "lease_c": ["OperatingLeaseLiabilityCurrent"],
}
# emitenci zagraniczni (20-F) raportujący w MSSF: te same klucze, tagi ifrs-full (tylko lata obrotowe; kwartałów 6-K nie ma w XBRL)
TAGI_IFRS = {
    "rev": ["Revenue", "RevenueFromContractsWithCustomers", "RevenueFromSaleOfGoods"],
    "ni": ["ProfitLossAttributableToOwnersOfParent", "ProfitLoss"],
    "op": ["ProfitLossFromOperatingActivities"],
    "gp": ["GrossProfit"],
    "ocf": ["CashFlowsFromUsedInOperatingActivities"],
    "capex": ["PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities", "PurchaseOfPropertyPlantAndEquipment"],
    "sbc": ["AdjustmentsForSharebasedPayments"],
    "skup": ["PaymentsToAcquireOrRedeemEntitysShares"],
    "emisja": ["ProceedsFromIssuingShares"],
    "dyw": ["DividendsPaidClassifiedAsFinancingActivities", "DividendsPaid"],
    "eps": ["DilutedEarningsLossPerShare", "BasicAndDilutedEarningsLossPerShare", "BasicEarningsLossPerShare"],
}
CHWILE_IFRS = {
    "cash": ["CashAndCashEquivalents"],
    "eq": ["EquityAttributableToOwnersOfParent", "Equity"],
    "assets": ["Assets"],
    "lc": ["CurrentLiabilities"],
    "lease": ["LeaseLiabilities"],
}
DLUG = ["LongTermDebtNoncurrent", "LongTermDebtCurrent", "DebtCurrent", "ShortTermBorrowings", "CommercialPaper",
        "LongTermDebtAndCapitalLeaseObligations", "LongTermDebtAndCapitalLeaseObligationsCurrent", "LongTermDebt"]


def _okres(r):
    return (D(r[1]) - D(r[0])).days


def kwartalne(rows):
    """[[start, end, val, filed], ...] -> {end: val} kwartały (80-120 dni: także 16-tygodniowe kwartały COST / PEP / KR) z wartości kwartalnych
    i różnic narastających w roku obrotowym."""
    pierwsze = {}
    for s, e, v, f in rows:
        k = (s, e)
        if k not in pierwsze or f < pierwsze[k][1]:
            pierwsze[k] = (v, f)
    q = {}
    for (s, e), (v, _) in pierwsze.items():
        if 80 <= (D(e) - D(s)).days <= 120:
            q.setdefault(e, v)
    grupy = {}
    for (s, e), (v, _) in pierwsze.items():
        n = (D(e) - D(s)).days
        if 80 <= n <= 380:
            grupy.setdefault(s, []).append((e, n, v))
    for s, lst in grupy.items():
        lst.sort()
        for (e0, n0, v0), (e1, n1, v1) in zip(lst, lst[1:]):
            if 80 <= n1 - n0 <= 120 and e1 not in q:
                q[e1] = v1 - v0
    return dict(sorted(q.items()))


def ttm(q):
    """{end: val} kwartały -> [(end, suma 4 kolejnych)] (odstępy 75-125 dni, razem 350-380 dni)."""
    e = sorted(q)
    out = []
    for i in range(3, len(e)):
        z = e[i - 3:i + 1]
        if all(75 <= (D(z[k + 1]) - D(z[k])).days <= 125 for k in range(3)) and 250 <= (D(z[-1]) - D(z[0])).days <= 300:
            out.append((z[-1], sum(q[x] for x in z)))
    return out


def roczne(rows):
    """Wartości roczne (350-380 dni) z pierwszego złożenia: {end: val}."""
    out = {}
    for s, e, v, f in sorted(rows, key=lambda r: r[3]):
        if 350 <= (D(e) - D(s)).days <= 380:
            out.setdefault(e, v)
    return dict(sorted(out.items()))


def chwilowe(rows):
    """[[end, val, filed]] -> {end: val} (pierwsze złożenie)."""
    out = {}
    for e, v, f in sorted(rows, key=lambda r: r[2]):
        out.setdefault(e, v)
    return dict(sorted(out.items()))


def _waluta(g, tags):
    """Waluta sprawozdań: jednostka (kod ISO) z największą liczbą wierszy przychodów (np. ASML: EUR w us-gaap, TSM: TWD w ifrs-full)."""
    licz = {}
    for t in tags:
        for u, rows in (g.get(t) or {}).get("units", {}).items():
            if len(u) == 3 and u.isalpha() and u.isupper():
                licz[u] = licz.get(u, 0) + len(rows)
    return max(licz, key=licz.get) if licz else None


def wyciag(facts):
    """companyfacts['facts'] -> {klucz: {tag: wiersze}} dla przepływów (start, end, val, filed) i stanów (end, val, filed), dług osobno, liczba akcji.
    Spółki zmieniają tagi w czasie (np. Revenues -> RevenueFromContract...), więc zapisujemy wszystkie tagi z listy i wybieramy wartość dla
    każdej daty z pierwszego tagu, który ją ma (`polacz`). Bez us-gaap -> ifrs-full (MSSF). Kwoty w walucie sprawozdań (`waluta`);
    przeliczenie na USD: `przelicz`."""
    g = facts.get("us-gaap", {})
    tagi, chwile, dlug_t = {k: t for k, (_, t) in TAGI.items()}, CHWILE, DLUG
    if not any(t in g for t in TAGI["rev"][1]) and "ifrs-full" in facts:
        g, tagi, chwile, dlug_t = facts["ifrs-full"], TAGI_IFRS, CHWILE_IFRS, []
    cur = _waluta(g, tagi["rev"]) or "USD"
    out = {"waluta": cur}
    for k, tags in tagi.items():
        unit = f"{cur}/shares" if k == "eps" else cur
        d = {}
        for t in tags:
            rows = [[x["start"], x["end"], x["val"], x["filed"]] for x in (g.get(t) or {}).get("units", {}).get(unit, []) if "start" in x]
            if rows:
                d[t] = rows
        if d:
            out[k] = d
    for k, tags in chwile.items():
        d = {}
        for t in tags:
            rows = [[x["end"], x["val"], x["filed"]] for x in (g.get(t) or {}).get("units", {}).get(cur, []) if "start" not in x]
            if rows:
                d[t] = rows
        if d:
            out[k] = d
    dl = {}
    for t in dlug_t:
        rows = [[x["end"], x["val"], x["filed"]] for x in (g.get(t) or {}).get("units", {}).get(cur, []) if "start" not in x]
        if rows:
            dl[t] = rows
    out["debt"] = dl
    sh = [[x["end"], x["val"], x["filed"]] for x in facts.get("dei", {}).get("EntityCommonStockSharesOutstanding", {}).get("units", {}).get("shares", [])]
    out["shares"] = [r for r in sh if r[1] and r[1] > 0]
    # zapas dla spółek z kilkoma klasami akcji (META, PLTR: brak dei): średnia rozwodniona liczba akcji z rachunku zysków
    out["sh_dil"] = [[x["start"], x["end"], x["val"], x["filed"]] for x in (g.get("WeightedAverageNumberOfDilutedSharesOutstanding") or {}).get("units", {}).get("shares", [])
                     if "start" in x and x["val"]]
    out["v"] = 5
    return out


def przelicz(ex, kurs):
    """Kwoty wyciągu × kurs (waluta -> USD, jeden bieżący kurs dla całej historii: dynamika wzrostu jak w walucie spółki)."""
    if not kurs or kurs == 1:
        return ex
    bez = ("waluta", "waluta_zrodlo", "kurs", "shares", "sh_dil", "v")      # bez przeliczania (liczby akcji, metadane)
    out = {k: ex[k] for k in bez if k in ex}
    out.update(waluta="USD", waluta_zrodlo=ex.get("waluta"), kurs=kurs)
    for k, d in ex.items():
        if k in bez:
            continue
        out[k] = {t: [r[:-2] + [r[-2] * kurs, r[-1]] for r in rows] for t, rows in d.items()}
    return out


def polacz(d, fn, najwieksza=False):
    """{tag: wiersze} -> {data: wartość}: fn(wiersze) każdego tagu, dla każdej daty pierwszy tag (wg kolejności listy), który ją ma;
    `najwieksza` = największa wartość spośród tagów (przychody: inne tagi bywają częścią przychodów, np. segment). Przyjmuje też samą listę wierszy."""
    if isinstance(d, list):
        return fn(d)
    out = {}
    for rows in d.values():
        for e, v in fn(rows).items():
            if e not in out or (najwieksza and v is not None and v > out[e]):
                out[e] = v
    return dict(sorted(out.items()))


def dlug(d, end):
    """Dług na dzień `end`: suma części długoterminowej i bieżącej (bez podwójnego liczenia), zapas: LongTermDebt."""
    w = {t: chwilowe(rows).get(end) for t, rows in d.items()}
    nc = w.get("LongTermDebtNoncurrent") or w.get("LongTermDebtAndCapitalLeaseObligations")
    cur = w.get("LongTermDebtCurrent") or w.get("DebtCurrent") or w.get("LongTermDebtAndCapitalLeaseObligationsCurrent")
    st = (w.get("ShortTermBorrowings") or 0) + (w.get("CommercialPaper") or 0)
    if nc is not None:
        return nc + (cur or 0) + st
    if w.get("LongTermDebt") is not None:
        return w["LongTermDebt"] + st
    return (cur or 0) + st if (cur or st) else 0.0


def cagr(a, b, lat):
    return (b / a) ** (1 / lat) - 1 if a and b and a > 0 and b > 0 else None


def wartosc_lata_temu(seria, end, lat):
    """[(end, val)] -> wartość z punktu ok. `lat` lat przed `end` (± 45 dni)."""
    cel = D(end) - dt.timedelta(days=round(365.25 * lat))
    best = None
    for e, v in seria:
        if abs((D(e) - cel).days) <= 45:
            best = v
    return best
