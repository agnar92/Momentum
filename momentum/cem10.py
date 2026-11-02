"""CEM10 — miesięczna lista zakupów (USA + GPW), czyste funkcje bez sieci.

Reguły (rekomendacja po badaniach, listopad 2026):
  USA: lider = SPY albo QQQ z wyższym zwrotem 5M; kandydaci z indeksu lidera (S&P 500 albo Nasdaq-100): zwrot 6M > +30 % i zamknięcie
       miesiąca nad SMA 10; ranking po 6M malejąco, 10 pozycji; brak zakupów, gdy SPY zamyka miesiąc pod SMA 12.
  GPW: bez lidera, pula WIG20 + mWIG40 razem; C-8: zwrot 3M > 0 %, 12M > +30 %, zamknięcie nad SMA 10; ranking po 6M, 5 pozycji;
       brak zakupów, gdy równo ważony indeks składników (średni miesięczny zwrot) jest pod SMA 12.
  Wyjście (oba rynki): zamknięcie miesiąca pod SMA 10 (w USA także wypadnięcie z S&P 500 i Nasdaq-100); awaryjny stop -40 %.
Zwroty i SMA liczone na zamknięciach skorygowanych o dywidendy; ceny pokazywane na stronie są surowe (jak w notowaniach)."""

N_USA = 10
N_GPW = 5
THR_USA = 0.30          # zwrot 6M
THR_GPW_12M = 0.30      # C-8: 12M
LEAD_MONTHS = 5         # okno lidera SPY / QQQ
SMA_N = 10
MKT_N = 12


def month_closes(dates, values, upto):
    """(data 'YYYY-MM-DD', wartość) -> {YYYY-MM: ostatnia wartość miesiąca} dla zamkniętych miesięcy <= upto (świece miesięczne albo dzienne)."""
    out = {}
    for d, v in zip(dates, values):
        if v is None or v != v:
            continue
        ym = d[:7]
        if ym <= upto:
            out[ym] = float(v)
    return out


def ret(closes, k):
    """Zwrot z k miesięcy z listy zamknięć miesięcznych (najstarsze pierwsze); None, gdy za krótko."""
    if len(closes) <= k or not closes[-1 - k]:
        return None
    return closes[-1] / closes[-1 - k] - 1


def sma(closes, n):
    return sum(closes[-n:]) / n if len(closes) >= n else None


def ew_level(series_by_ticker, months):
    """Równo ważony indeks koszyka: średni miesięczny zwrot składników (|r| < 150 %, błędne skoki pomijane) -> poziomy od 1,0."""
    lv, cur = [1.0], 1.0
    for a, b in zip(months, months[1:]):
        rs = []
        for s in series_by_ticker.values():
            if a in s and b in s and s[a]:
                r = s[b] / s[a] - 1
                if abs(r) < 1.5:
                    rs.append(r)
        cur *= 1 + (sum(rs) / len(rs) if rs else 0.0)
        lv.append(cur)
    return lv


def _rnd(x, n=4):
    return None if x is None else round(x, n)


def stock_row(ticker, name, adj, raw, **flags):
    """Wiersz spółki z zamknięć miesięcznych (adj = skorygowane, raw = surowe; ta sama długość, najstarsze pierwsze)."""
    s = sma(adj, SMA_N)
    k = raw[-1] / adj[-1] if adj and adj[-1] else 1.0
    return dict(t=ticker, n=name, c=_rnd(raw[-1], 2), sma=_rnd(None if s is None else s * k, 2),
                dist=_rnd(None if s is None else adj[-1] / s - 1), r3=_rnd(ret(adj, 3)), r6=_rnd(ret(adj, 6)), r12=_rnd(ret(adj, 12)), **flags)


def usa_candidates(rows, lead):
    """Kandydaci USA: indeks lidera ('SP' / 'NDX'), 6M > +30 %, nad SMA 10; sortowanie po 6M malejąco."""
    key = "nq" if lead == "NDX" else "sp"
    c = [r for r in rows if r.get(key) and r["r6"] is not None and r["r6"] > THR_USA and r["dist"] is not None and r["dist"] > 0]
    return sorted(c, key=lambda r: -r["r6"])


def gpw_candidates(rows):
    """Kandydaci GPW (C-8, WIG20 + mWIG40 razem): 3M > 0, 12M > +30 %, nad SMA 10; sortowanie po 6M malejąco."""
    c = [r for r in rows if r["r3"] is not None and r["r12"] is not None and r["r3"] > 0 and r["r12"] > THR_GPW_12M
         and r["dist"] is not None and r["dist"] > 0]
    return sorted(c, key=lambda r: -(r["r6"] if r["r6"] is not None else -9))
