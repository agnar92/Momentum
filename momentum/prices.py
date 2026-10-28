"""Ceny z yfinance — tylko dwa rodzaje zapytań i tylko o to, czego jeszcze nie mamy:
  - tygodniowe świece z ostatnich 3 lat (wykres, średnie, MACD, wolumen, obrót oraz rozgrzewka wskaźników 52-tygodniowych): spółka już pobrana dostaje tylko ostatnie tygodnie
    (doklejane do zapisanych), pełne 3 lata pobieramy dla nowej spółki, po długiej przerwie albo gdy ceny wstecz się zmieniły (split / dywidenda),
  - miesięczne HIGH z całej historii (Green Line jak w oryginale Dr. Wisha): zamknięte miesiące się nie zmieniają, więc po zamknięciu
    kolejnego miesiąca dociągamy tylko ostatnie miesiące; całą historię tylko dla nowej spółki albo gdy ceny wstecz się zmieniły.
Ceny NIESKORYGOWANE o dywidendy (tylko o splity, auto_adjust=False) — jak na TradingView. Z korektą o dywidendy dawne szczyty spółek
z dużymi wypłatami (np. MLP: CLMT, szczyt 55,26 z 04.2007 -> ~20) spadały i Green Line wychodziła za nisko. Serie / wpisy bez znacznika
"raw" (pobrane jeszcze ze skorygowanymi cenami) pobieramy raz od nowa w całości.
`progress(zrobione, wszystkie)` (opcjonalnie) dostaje postęp po każdej paczce."""
import datetime as dt
import math

WEEKLY_PERIOD = "3y"
KEEP_WEEKS = 156          # około 3 lata historii: 52 tyg. wskaźników + 52 tyg. widocznego wykresu
BATCH = 100
AUTO_ADJUST = False       # True = ceny skorygowane o dywidendy (Yahoo „Adj”), False = tylko splity (jak TradingView)
ADJ_TOL = 0.015           # różnica cen na wspólnej dacie > 1,5 % = ceny wstecz zmienione (split / dywidenda) -> pełne pobranie


def _yf():
    import yfinance as yf
    return yf


def _frames(df, tickers):
    """Wynik yf.download (jeden albo wiele tickerów) -> {ticker: DataFrame}."""
    if df is None or getattr(df, "empty", True):
        return {}
    if len(tickers) == 1 and "Close" in df.columns:
        return {tickers[0]: df}
    out = {}
    for t in tickers:
        try:
            out[t] = df[t]
        except KeyError:
            continue
    return out


def _clean(x):
    return None if x is None or (isinstance(x, float) and math.isnan(x)) else round(float(x), 4)


def _series(f):
    f = f.dropna(subset=["Close"])
    return {"raw": 1, "d": [d.strftime("%Y-%m-%d") for d in f.index], **{k: [_clean(x) for x in f[col]] for k, col in
                                                              (("o", "Open"), ("h", "High"), ("l", "Low"), ("c", "Close"), ("v", "Volume"))}}


def _same(a, b):
    return a and b and abs(a / b - 1) <= ADJ_TOL


def merge_weekly(old, new, keep=KEEP_WEEKS):
    """Dokleja nowe tygodnie do zapisanych (nowe nadpisują od swojej pierwszej daty). -> seria albo None, gdy ceny na wspólnej dacie
    się różnią (zmienione wstecz — trzeba pobrać całość)."""
    if not new["d"]:
        return old
    first = new["d"][0]
    if first in old["d"] and not _same(old["c"][old["d"].index(first)], new["c"][0]):
        return None
    cut = next((i for i, d in enumerate(old["d"]) if d >= first), len(old["d"]))
    return {"raw": 1, **{k: (old[k][:cut] + new[k])[-keep:] for k in ("d", "o", "h", "l", "c", "v")}}


def _recent_period(last, today):
    """Ile dociągnąć do zapisanej serii: '1mo' / '6mo', albo None = za długa przerwa, całe 3 lata."""
    gap = (today - dt.date.fromisoformat(last)).days
    return "1mo" if gap <= 21 else "6mo" if gap <= 150 else None


def weekly(tickers, log=print, period=WEEKLY_PERIOD, cache=None, today=None, progress=None):
    """-> {ticker: {d: [daty], o, h, l, c, v}} (tydzień = data poniedziałku jak w Yahoo; ostatni tydzień może być w toku).
    cache = zapisane serie {ticker: seria}: dla nich pobieramy tylko ostatnie tygodnie i doklejamy."""
    cache, today = cache or {}, today or dt.date.today()
    update, full = {}, []
    for t in tickers:
        old = cache.get(t) if (cache.get(t) or {}).get("raw") else None   # seria ze skorygowanymi cenami -> pełne pobranie
        # Cache krótszy niż 130 tygodni nie daje wystarczającej historii dla wskaźników 52-tygodniowych i rocznego okna wykresu; pobierz pełne 3 lata.
        if old and len(old.get("d") or []) < 130:
            old = None
        p = _recent_period(old["d"][-1], today) if old and old.get("d") else None
        (update.setdefault(p, []) if p else full).append(t)
    total, done, out = len(tickers), 0, {}

    def fetch(part, per):
        nonlocal done
        df = _yf().download(part, period=per, interval="1wk", auto_adjust=AUTO_ADJUST, group_by="ticker", progress=False, threads=True)
        done += len(part)
        if progress:
            progress(done, total)
        log(f"yfinance tygodniowe ({'3 lata' if per == period else 'aktualizacja'}): {done}/{total}")
        return {t: _series(f) for t, f in _frames(df, part).items()}

    for per, ts in update.items():
        for i in range(0, len(ts), BATCH):
            part = ts[i:i + BATCH]
            got = fetch(part, per)
            for t in part:
                m = merge_weekly(cache[t], got[t]) if t in got else cache[t]   # brak nowych danych: zostaje zapisana seria
                if m is None:   # ceny wstecz zmienione — ta spółka w pełnym pobraniu
                    full.append(t)
                    total += 1
                else:
                    out[t] = m
    for i in range(0, len(full), BATCH):
        for t, s in fetch(full[i:i + BATCH], period).items():
            if len(s["d"]) >= 10:
                out[t] = {"raw": 1, **{k: s[k][-KEEP_WEEKS:] for k in ("d", "o", "h", "l", "c", "v")}}
    return out



def last_closed_month(today=None):
    today = today or dt.date.today()
    first = today.replace(day=1)
    return (first - dt.timedelta(days=1)).strftime("%Y-%m")


def _months(f, upto):
    """Zamknięte miesiące (YYYY-MM <= upto) -> [[YYYY-MM, open, high, low, close, volume]] (ceny bez korekty o dywidendy)."""
    f = f.dropna(subset=["Close"])
    out = []
    for d, o, h, lo, c, v in zip(f.index, f["Open"], f["High"], f["Low"], f["Close"], f["Volume"]):
        ym = d.strftime("%Y-%m")
        if ym <= upto:
            out.append([ym] + [_clean(x) for x in (o, h, lo, c)] + [_clean(v) or 0])
    return out


def merge_monthly(old, new):
    """Dokleja nowe zamknięte miesiące. -> lista albo None, gdy High na wspólnym miesiącu się różni (ceny zmienione wstecz)."""
    known = {r[0]: r for r in old}
    for r in new:
        if r[0] in known and not _same(known[r[0]][2], r[2]):
            return None
    last = old[-1][0] if old else ""
    return old + [r for r in new if r[0] > last]


def monthly(tickers, cache, log=print, today=None, progress=None):
    """Uzupełnia `cache` {ticker: {"r": [[YYYY-MM, o, h, l, c, v]...], "upto": YYYY-MM, "raw": 1}} o miesięczne świece z całej historii (tylko ZAMKNIĘTE miesiące):
    High liczy Green Line, całość rysuje wykres M. Spółka z zapisem sprzed ostatniego zamkniętego miesiąca dostaje tylko ostatnie miesiące; całą historię —
    nowa spółka albo zmienione ceny. Wpisy w starym formacie (same High, zamknięcia "m", bez "raw") traktujemy jak brak. -> lista pobranych tickerów."""
    need = last_closed_month(today)

    def fresh(t):
        e = cache.get(t) or {}
        return bool(e.get("r")) and e.get("raw")

    todo = [t for t in tickers if not fresh(t) or cache[t].get("upto") != need]
    update = [t for t in todo if fresh(t)]
    full = [t for t in todo if t not in update]
    total, done = len(todo), 0

    def step(part, per, label):
        nonlocal done
        df = _yf().download(part, period=per, interval="1mo", auto_adjust=AUTO_ADJUST, group_by="ticker", progress=False, threads=True)
        redo = []
        for t, f in _frames(df, part).items():
            rows = _months(f, need)
            if per == "max":
                if rows:
                    cache[t] = {"r": rows, "upto": need, "raw": 1}
                continue
            m = merge_monthly(cache[t]["r"], rows)
            if m is None:
                redo.append(t)
            else:
                cache[t] = {"r": m, "upto": need, "raw": 1}
        done += len(part)
        if progress:
            progress(min(done, total), total)
        log(f"yfinance miesięczne ({label}): {min(done, total)}/{total}")
        return redo

    for i in range(0, len(update), BATCH):
        redo = step(update[i:i + BATCH], "6mo", "aktualizacja")
        full += redo
        total += len(redo)
    for i in range(0, len(full), BATCH):
        step(full[i:i + BATCH], "max", "cała historia")
    return todo


def monthly_highs(entry):
    """High zamkniętych miesięcy (do Green Line); wpis bez "raw" (stare ceny skorygowane o dywidendy) albo w starym formacie traktujemy jak brak —
    inaczej w tabeli zostawałaby za niska Green Line."""
    e = entry or {}
    if not e.get("raw"):
        return []
    return [r[2] for r in e["r"]] if e.get("r") else [h for _, h in e.get("h", [])]   # stary format (same High) działa do pierwszego pełnego odświeżenia


def monthly_series(entry):
    """Zamknięte miesiące wpisu cache -> {d: [YYYY-MM-01], o, h, l, c, v} (plik docs/data/monthly/<ticker>.json) albo None."""
    e = entry or {}
    rows = e.get("r") if e.get("raw") else None
    if not rows or len(rows) < 2:
        return None
    return {"d": [r[0] + "-01" for r in rows], **{k: [r[i] for r in rows] for k, i in (("o", 1), ("h", 2), ("l", 3), ("c", 4), ("v", 5))}}
