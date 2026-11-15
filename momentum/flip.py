"""FLIP + TVOD (metoda z filmów Paula) — czyste funkcje bez sieci.

FLIP = cztery litery, każda musi być zielona:
  F – finanse: wolna gotówka (FCF) dodatnia i gotówka ≥ dług albo dług netto ≤ 3 lata FCF.
  L – liderzy: założyciel prowadzi / kontroluje firmę (flip_config.json `founders`) albo insiderzy mają ≥ 10 % akcji.
  I – branża kluczowa: branża Finviz z listy `industries` albo spółka z `include` („test wtorku”).
  P – pozycja i zyski: kapitalizacja co najmniej 1/10 największej spółki tej samej branży (wśród spółek > 10 mld $) albo lider niszy
      z `leaders` (branże Finviz bywają za szerokie), i marża operacyjna albo FCF dodatnie.
Kolejność listy: „zapas wzrostu” = wzrost spółki (średnia: sprzedaż 5 lat i prognoza EPS 5 lat) minus wzrost, który zakłada cena
(`required_growth`); spółki ze słabnącymi raportami (T) na koniec. Pierwsze TOP = 10 to lista do kupna.
Budowanie pozycji: z budżetu spółki FIRST_PCT na start, reszta w TRANCHES równych transzach przy ruchu ±STEP od najwyższego / najniższego
zakupu. Nasz test (520 spółek, 2010–2023): uśrednia wejście bez zgadywania momentu — strata > 20 % 2–3× rzadziej niż przy kupnie
od razu (i rzadziej niż przy DCA w czasie), za cenę średniego zysku niższego o ok. 7–10 %.
TVOD (wyjście): T – teza (raporty słabną), V – wycena (cena zakłada dużo więcej wzrostu niż spółka daje), O – lepsza okazja na liście,
D – pozycja się podwoiła (wyjmij 30–50 % włożonych pieniędzy albo całość)."""

TOP = 10
STEP = 0.07
FIRST_PCT = 0.40          # 200 z 500 zł w filmie
TRANCHES = 10             # 10 × 30 zł
INSIDER_MIN = 10.0        # % akcji u insiderów, gdy założyciel nie prowadzi firmy
LEADER_RATIO = 10.0       # „jeśli konkurent jest 10 razy większy, to nie lider”
REQ_RETURN, EXIT_MULT, YEARS = 0.10, 20.0, 10


def is_founder(cfg, t):
    v = (cfg.get("founders") or {}).get(t)
    return bool(v) and not str(v).lower().startswith("nie")


def required_growth(pfcf):
    """Ile wzrostu wolnej gotówki rocznie przez 10 lat zakłada cena (P/FCF), żeby dać 10 % rocznie przy wycenie 20× FCF na końcu."""
    if not pfcf or pfcf <= 0:
        return None
    return (pfcf * (1 + REQ_RETURN) ** YEARS / EXIT_MULT) ** (1 / YEARS) - 1


def money(r):
    """Gotówka, dług i FCF w $ z pól Finviz (kapitalizacja w mln $, P/C, P/B, Debt/Eq, P/FCF)."""
    m = (r.get("marketCap") or 0) * 1e6
    cash = m / r["PC"] if r.get("PC") else None
    eq = m / r["PB"] if r.get("PB") and r["PB"] > 0 else None
    debt = r["debtEq"] * eq if r.get("debtEq") is not None and eq else None
    fcf = m / r["PFCF"] if r.get("PFCF") and r["PFCF"] > 0 else None
    return m, cash, debt, fcf


def actual_growth(r):
    """Wzrost spółki w ułamku: średnia ze sprzedaży 5 lat i prognozy EPS 5 lat (Finviz, w %); to, co jest."""
    g = [x for x in (r.get("sales5Years"), r.get("estLTGrowth")) if x is not None]
    return sum(g) / len(g) / 100 if g else None


def checks(r, cfg, ind_max):
    """-> {F, L, I, P: (ok, opis)} dla wiersza Finviz r; ind_max = {branża: największa kapitalizacja}."""
    t = r["ticker"]
    m, cash, debt, fcf = money(r)
    if fcf is None:
        f = (False, "wolna gotówka ujemna lub brak (spala gotówkę)")
    elif cash is None or debt is None:
        f = (True, "FCF dodatni, brak danych o długu")
    elif cash >= debt:
        f = (True, f"gotówka {cash / 1e9:.0f} ≥ dług {debt / 1e9:.0f} mld $, FCF {fcf / 1e9:.1f} mld $")
    elif debt - cash <= 3 * fcf:
        f = (True, f"dług netto {(debt - cash) / 1e9:.0f} mld $ ≤ 3 lata FCF ({fcf / 1e9:.1f} mld $)")
    else:
        f = (False, f"dług netto {(debt - cash) / 1e9:.0f} mld $ > 3 lata FCF ({fcf / 1e9:.1f} mld $)")
    ins = r.get("insiderOwn") or 0
    if is_founder(cfg, t):
        lead = (True, f"{cfg['founders'][t]}; insiderzy {ins:.1f} %")
    elif ins >= INSIDER_MIN:
        lead = (True, f"insiderzy mają {ins:.1f} % akcji")
    else:
        lead = (False, f"brak założyciela, insiderzy {ins:.1f} %")
    inc = (cfg.get("include") or {}).get(t)
    ind = r.get("industry") or ""
    i = (True, inc) if inc else ((True, ind) if ind in (cfg.get("industries") or []) else (False, f"{ind} — poza listą kluczowych branż"))
    big = ind_max.get(ind) or m
    prof = (r.get("operMargin") or 0) > 0 or fcf is not None
    niche = (cfg.get("leaders") or {}).get(t)
    if not prof:
        p = (False, "brak zysku operacyjnego i FCF")
    elif niche:
        p = (True, niche)
    elif m * LEADER_RATIO < big:
        p = (False, f"największa w branży jest {big / m:.0f}× większa")
    else:
        p = (True, "lider branży" if m >= big else f"największa w branży jest {big / m:.1f}× większa (mniej niż 10×)")
    return {"F": f, "L": lead, "I": i, "P": p}


def report_state(sec):
    """T z TVOD na podstawie ostatniego kwartału z SEC: przychody r/r (%) i zmiana marży operacyjnej r/r (pkt proc.)."""
    if not sec or sec.get("rev_rr") is None:
        return "brak", "brak danych kwartalnych"
    rr, dm = sec["rev_rr"], sec.get("dopm")
    txt = f"przychody {rr:+.0f} % r/r" + (f", marża op. {dm:+.1f} pp" if dm is not None else "")
    if rr < 10 or (dm is not None and dm < -2):
        return "słabnie", txt
    if rr >= 15 and (dm is None or dm >= 0):
        return "dobre", txt
    return "neutralne", txt


def rank(rows, top=TOP):
    """Spółki z zielonym FLIP: najpierw raporty nie słabną, potem największy zapas wzrostu. Ustawia `pick` i `rank`."""
    def key(r):
        return (r.get("t_state") == "słabnie", -(r.get("margin") if r.get("margin") is not None else -9))
    ok = sorted((r for r in rows if r["flip"]), key=key)
    for n, r in enumerate(ok, 1):
        r["rank"], r["pick"] = n, n <= top and r.get("t_state") != "słabnie"
    for r in rows:
        r.setdefault("rank", None)
        r.setdefault("pick", False)
    return rows


def ladder(buys, budget, first=FIRST_PCT, tranches=TRANCHES, step=STEP):
    """Plan budowania pozycji. buys = [(cena, kwota)] w kolejności zakupów. -> zainwestowano, zostało, transza, poziomy następnego zakupu."""
    spent = sum(a for _, a in buys)
    tr = budget * (1 - first) / tranches
    left = max(budget - spent, 0.0)
    if not buys:
        return dict(spent=0.0, left=budget, tranche=tr, first=budget * first, up=None, down=None)
    prices = [p for p, _ in buys]
    return dict(spent=spent, left=left, tranche=min(tr, left), first=budget * first,
                up=max(prices) * (1 + step) if left > 0.01 else None, down=min(prices) * (1 - step) if left > 0.01 else None)
