"""Wycena (arkusz użytkownika): PEG i wartość wewnętrzna z prognozy wzrostu EPS analityków — czyste funkcje bez sieci.

Wzory jak w arkuszu (Google Sheets użytkownika, listopad 2026):
  P/E = cena / EPS (TTM), wzrost g = prognoza wzrostu EPS na następny rok („Growth Estimates → Next Year”, yfinance `+1y`),
  PEG = P/E / (100 g), wartość wewnętrzna (fair value, „cena za rok”) = EPS x 100 g (Peter Lynch: uczciwe P/E = tempo wzrostu),
  potencjał = wartość / cena - 1 (= 1 / PEG - 1). Dodatkowo forward PEG = cena / (EPS x (1 + g)) / (100 g).
Lista „tanich”: PEG <= 1 i wartość > cena, sortowanie po potencjale malejąco.
Tryb DCF (dwa etapy): FCF TTM rośnie przez `years` lat w tempie min(max(g, 0), gmax), potem przez `fade` lat tempo spada liniowo do
wzrostu końcowego tg; wartość końcowa = FCF_N x (1 + tg) / (r - tg); dyskonto r; wartość akcji = (suma PV + gotówka - dług) / liczba akcji.
Parametry da się zmieniać na stronie (docs/js/wycena.js liczy to samo). DCF NIE był testowany historycznie (brak historii FCF w danych badania).
Badanie (research/wyniki/r42-r50): z historycznym wzrostem EPS metoda nie bije rynku; z trafną prognozą (symulacja) tak.
Prognozy analityków są publiczne i już w cenie — strona jest sitem do analizy, nie sygnałem kupna."""

PEG_MAX = 1.0
MIN_ANALYSTS = 3


def _f(x):
    """Liczba albo None (NaN, None, tekst -> None)."""
    try:
        x = float(x)
    except (TypeError, ValueError):
        return None
    return x if x == x and abs(x) != float("inf") else None


def _rnd(x, n=4):
    return None if x is None else round(x, n)


def value_row(ticker, name, price, eps, g, g0=None, analysts=None, fwd_eps=None, fcf=None, shares=None, cash=None, debt=None, **flags):
    """Wiersz wyceny. g, g0 = wzrost EPS (ułamek) na następny / bieżący rok. Bez dodatniego EPS lub wzrostu PEG i wartość = None."""
    price, eps, g, g0, fwd_eps = _f(price), _f(eps), _f(g), _f(g0), _f(fwd_eps)
    pe = price / eps if price and eps and eps > 0 else None
    ok = pe is not None and g is not None and g > 0
    peg = pe / (100 * g) if ok else None
    iv = eps * 100 * g if ok else None
    pot = iv / price - 1 if ok else None
    fpeg = price / (eps * (1 + g)) / (100 * g) if ok else None
    dv = dcf_value(fcf, shares, cash, debt, g)
    fcf, shares = _f(fcf), _f(shares)
    return dict(fcf=_rnd(fcf / 1e6, 1) if fcf is not None else None, sh=_rnd(shares / 1e6, 2) if shares else None,
                cash=_rnd((_f(cash) or 0) / 1e6, 1), debt=_rnd((_f(debt) or 0) / 1e6, 1),
                dcf=_rnd(dv, 2), dpot=_rnd(dv / price - 1 if dv is not None and price else None), t=ticker, n=name, c=_rnd(price, 2), eps=_rnd(eps, 2), pe=_rnd(pe, 2), g=_rnd(g), g0=_rnd(g0),
                peg=_rnd(peg, 3), fpeg=_rnd(fpeg, 3), iv=_rnd(iv, 2), pot=_rnd(pot), na=analysts, fpe=_rnd(price / fwd_eps if price and fwd_eps and fwd_eps > 0 else None, 2), **flags)


def dcf_inputs(d):
    """(fcf, shares, cash, debt) do DCF; raport w innej walucie niż notowanie (np. ADR z Chin: CNY vs USD) = brak DCF."""
    fc, cur = d.get("fin_cur"), d.get("cur")
    if fc and cur and fc != cur:
        return None, None, None, None
    return d.get("fcf"), d.get("shares"), d.get("cash"), d.get("debt")


DCF = dict(r=0.09, tg=0.025, years=5, fade=5, gmax=0.25)


def dcf_value(fcf, shares, cash, debt, g, r=DCF["r"], tg=DCF["tg"], years=DCF["years"], fade=DCF["fade"], gmax=DCF["gmax"]):
    """Wartość DCF na akcję albo None (brak / ujemny FCF, brak akcji, r <= tg)."""
    fcf, shares, cash, debt, g = _f(fcf), _f(shares), _f(cash) or 0.0, _f(debt) or 0.0, _f(g)
    if not fcf or fcf <= 0 or not shares or shares <= 0 or r <= tg:
        return None
    g1 = min(max(g if g is not None else 0.0, 0.0), gmax)
    pv, f = 0.0, fcf
    for t in range(1, years + fade + 1):
        gt = g1 if t <= years else g1 + (tg - g1) * (t - years) / fade
        f *= 1 + gt
        pv += f / (1 + r) ** t
    n = years + fade
    pv += f * (1 + tg) / (r - tg) / (1 + r) ** n
    return (pv + cash - debt) / shares


def cheap(rows, peg_max=PEG_MAX, min_analysts=MIN_ANALYSTS):
    """„Tanie”: PEG <= peg_max i wartość > cena (potencjał > 0), min. liczba analityków; sortowanie po potencjale malejąco."""
    c = [r for r in rows if r["peg"] is not None and r["peg"] <= peg_max and r["pot"] is not None and r["pot"] > 0
         and (r.get("na") or 0) >= min_analysts]
    return sorted(c, key=lambda r: -r["pot"])
