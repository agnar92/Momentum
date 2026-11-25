"""Zdarzenia w spółce z raportów bieżących SEC (8-K) i spóźnionych / poprawionych raportów okresowych — fakty zgłoszone przez spółkę, bez interpretacji.
Źródło: data.sec.gov/submissions/CIK##########.json (filings.recent: form, filingDate, items, accessionNumber, primaryDocument).
Poziom: 2 = poważne (czerwone, ostrzeżenie na karcie), 1 = istotne (pomarańczowe), 0 = informacyjne. Rutynowe pozycje (wyniki kwartalne 2.02,
prezentacje 7.01, załączniki 9.01, walne zgromadzenia 5.07) są pomijane."""
import datetime as dt

PUNKTY = {
    "1.01": (0, "Zawarcie istotnej umowy"),
    "1.02": (1, "Rozwiązanie istotnej umowy"),
    "1.03": (2, "Upadłość lub zarząd komisaryczny"),
    "1.04": (1, "Wypadek w kopalni"),
    "1.05": (2, "Istotny incydent cyberbezpieczeństwa"),
    "2.01": (0, "Zakończenie przejęcia lub sprzedaży aktywów"),
    "2.03": (0, "Nowe istotne zadłużenie"),
    "2.04": (2, "Zdarzenie przyspieszające spłatę zadłużenia"),
    "2.05": (1, "Koszty restrukturyzacji lub wyjścia z działalności"),
    "2.06": (1, "Istotny odpis wartości aktywów"),
    "3.01": (1, "Notowanie na giełdzie: niespełnianie warunków, wycofanie lub przeniesienie na inną giełdę (często dobrowolne)"),
    "3.02": (0, "Sprzedaż akcji bez rejestracji"),
    "3.03": (1, "Istotna zmiana praw akcjonariuszy"),
    "4.01": (2, "Zmiana audytora"),
    "4.02": (2, "Wcześniejsze sprawozdania finansowe nie są wiarygodne (korekta)"),
    "5.01": (1, "Zmiana kontroli nad spółką"),
    "5.02": (1, "Zmiany w zarządzie lub radzie dyrektorów"),
    "5.03": (0, "Zmiana statutu lub roku obrotowego"),
    "5.05": (0, "Zmiana kodeksu etyki"),
    "8.01": (0, "Inne zdarzenia"),
}
FORMY = {
    "NT 10-K": (2, "Spóźniony raport roczny (NT 10-K)"),
    "NT 10-Q": (2, "Spóźniony raport kwartalny (NT 10-Q)"),
    "NT 20-F": (2, "Spóźniony raport roczny (NT 20-F)"),
    "10-K/A": (1, "Poprawiony raport roczny (10-K/A)"),
    "10-Q/A": (1, "Poprawiony raport kwartalny (10-Q/A)"),
    "20-F/A": (1, "Poprawiony raport roczny (20-F/A)"),
}


def z_submissions(d, cik, dzis=None, dni=365):
    """Lista zdarzeń z ostatnich `dni` dni, najnowsze pierwsze: {d: data, f: formularz, p: [[kod, poziom, opis], …], poz: max poziom, u: link}."""
    dzis = dzis or dt.date.today()
    od = (dzis - dt.timedelta(days=dni)).isoformat()
    r = ((d or {}).get("filings") or {}).get("recent") or {}
    out = []
    for i, f in enumerate(r.get("form") or []):
        data = r["filingDate"][i]
        if data < od:
            continue
        pkt = []
        if f in ("8-K", "8-K/A"):
            for k in (r.get("items") or [""] * (i + 1))[i].split(","):
                k = k.strip()
                if k in PUNKTY:
                    pkt.append([k, *PUNKTY[k]])
        elif f in FORMY:
            pkt.append([f, *FORMY[f]])
        if not pkt:
            continue
        acc = r["accessionNumber"][i]
        doc = (r.get("primaryDocument") or [""] * (i + 1))[i]
        u = f"https://www.sec.gov/Archives/edgar/data/{int(cik)}/{acc.replace('-', '')}/{doc}" if doc else \
            f"https://www.sec.gov/Archives/edgar/data/{int(cik)}/{acc.replace('-', '')}/"
        out.append({"d": data, "f": f, "p": pkt, "poz": max(p[1] for p in pkt), "u": u})
    out.sort(key=lambda x: x["d"], reverse=True)
    return out


def ostrzezenia(zd):
    """Teksty ostrzeżeń dla zdarzeń poważnych (poziom 2) z ostatnich 12 miesięcy."""
    out = []
    for z in zd or []:
        for k, poz, opis in z["p"]:
            if poz == 2:
                out.append(f"Zdarzenie zgłoszone do SEC {z['d']}: {opis} ({'punkt ' + k if '.' in k else k}).")
    return out


def wydzielenie(d):
    """Lynch (13 cech idealnej spółki): spółka wydzielona ze spółki matki — data pierwszego formularza 10-12B (rejestracja akcji przy wydzieleniu)
    w historii raportów; None, gdy brak."""
    r = ((d or {}).get("filings") or {}).get("recent") or {}
    daty = [r["filingDate"][i] for i, f in enumerate(r.get("form") or []) if f in ("10-12B", "10-12B/A", "10-12G", "10-12G/A")]
    return min(daty) if daty else None
