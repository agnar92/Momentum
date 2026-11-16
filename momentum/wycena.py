"""Wycena (arkusz użytkownika): PEG i wartość wewnętrzna z prognozy wzrostu EPS analityków — czyste funkcje bez sieci.

Wzory jak w arkuszu (Google Sheets użytkownika, listopad 2026):
  P/E = cena / EPS (TTM), wzrost g = prognoza wzrostu EPS na następny rok („Growth Estimates → Next Year”, yfinance `+1y`),
  PEG = P/E / (100 g), wartość wewnętrzna (fair value, „cena za rok”) = EPS x 100 g (Peter Lynch: uczciwe P/E = tempo wzrostu),
  potencjał = wartość / cena - 1 (= 1 / PEG - 1). Dodatkowo forward PEG = cena / (EPS x (1 + g)) / (100 g).
Lista „tanich”: PEG <= 1 i wartość > cena, sortowanie po potencjale malejąco.
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


def value_row(ticker, name, price, eps, g, g0=None, analysts=None, fwd_eps=None, **flags):
    """Wiersz wyceny. g, g0 = wzrost EPS (ułamek) na następny / bieżący rok. Bez dodatniego EPS lub wzrostu PEG i wartość = None."""
    price, eps, g, g0, fwd_eps = _f(price), _f(eps), _f(g), _f(g0), _f(fwd_eps)
    pe = price / eps if price and eps and eps > 0 else None
    ok = pe is not None and g is not None and g > 0
    peg = pe / (100 * g) if ok else None
    iv = eps * 100 * g if ok else None
    pot = iv / price - 1 if ok else None
    fpeg = price / (eps * (1 + g)) / (100 * g) if ok else None
    return dict(t=ticker, n=name, c=_rnd(price, 2), eps=_rnd(eps, 2), pe=_rnd(pe, 2), g=_rnd(g), g0=_rnd(g0),
                peg=_rnd(peg, 3), fpeg=_rnd(fpeg, 3), iv=_rnd(iv, 2), pot=_rnd(pot), na=analysts, fpe=_rnd(price / fwd_eps if price and fwd_eps and fwd_eps > 0 else None, 2), **flags)


def cheap(rows, peg_max=PEG_MAX, min_analysts=MIN_ANALYSTS):
    """„Tanie”: PEG <= peg_max i wartość > cena (potencjał > 0), min. liczba analityków; sortowanie po potencjale malejąco."""
    c = [r for r in rows if r["peg"] is not None and r["peg"] <= peg_max and r["pot"] is not None and r["pot"] > 0
         and (r.get("na") or 0) >= min_analysts]
    return sorted(c, key=lambda r: -r["pot"])
