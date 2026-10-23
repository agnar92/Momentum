"""EPS actuals, analyst estimates and surprises from yfinance; refreshed weekly with a 7-day cache."""
import datetime as dt
import math
from concurrent.futures import ThreadPoolExecutor, as_completed

FRESH_DAYS = 8  # weekly workflow runs every 7 days; avoid refetching everything on the boundary
KEEP_HIST = 104


def _yf():
    import yfinance as yf
    return yf


def _finite(v):
    try:
        n = float(str(v).strip().replace("%", ""))
        return n if math.isfinite(n) else None
    except (TypeError, ValueError):
        return None


def _eps_history(frame):
    """Compact quarterly EPS series [[period-end, EPS]], tolerant of yfinance schema changes."""
    if frame is None or getattr(frame, "empty", True):
        return []
    for label in ("Diluted EPS", "Basic EPS", "Normalized Diluted EPS"):
        try:
            if label not in frame.index:
                continue
            vals = []
            for stamp, value in frame.loc[label].items():
                n = _finite(value)
                if n is not None:
                    day = stamp.strftime("%Y-%m-%d") if hasattr(stamp, "strftime") else str(stamp)[:10]
                    vals.append([day, round(n, 4)])
            return sorted(vals)[-12:]
        except Exception:
            continue
    return []



def _revenue_surprise(row):
    """Revenue Surprise (%) only when source supplies actual revenue and its consensus."""
    for key in ("Revenue Surprise(%)", "Revenue Surprise (%)"):
        value = _finite(row.get(key))
        if value is not None:
            return round(value, 2)
    actual = next((_finite(row.get(k)) for k in ("Reported Revenue", "Revenue Actual", "Actual Revenue")
                   if _finite(row.get(k)) is not None), None)
    estimate = next((_finite(row.get(k)) for k in ("Revenue Estimate", "Estimated Revenue")
                     if _finite(row.get(k)) is not None), None)
    if actual is None or estimate is None or estimate == 0:
        return None
    return round((actual - estimate) / abs(estimate) * 100, 2)


def _estimate_rows(frame):
    """Serialize earnings_estimate (0q/+1q/0y/+1y) to JSON-safe rows."""
    if frame is None or getattr(frame, "empty", True):
        return []
    out = []
    for period, row in frame.iterrows():
        item = {"period": str(period)}
        for key in ("numberOfAnalysts", "avg", "low", "high", "yearAgoEps", "growth"):
            value = row.get(key)
            if key == "numberOfAnalysts":
                try:
                    item[key] = int(value) if _finite(value) is not None else None
                except (TypeError, ValueError, OverflowError):
                    item[key] = None
            else:
                n = _finite(value)
                if key == "growth" and n is not None and "%" not in str(value):
                    n *= 100
                item[key] = round(n, 4) if n is not None else None
        out.append(item)
    return out


def fetch(t):
    """Return EPS surprises, 90-day revision, quarterly EPS history and analyst estimates."""
    tk = _yf().Ticker(t)
    surp, revenue_surp = [], []
    try:
        d = tk.get_earnings_dates(limit=12)
        if d is not None and len(d):
            for ts, r in d.sort_index().iterrows():
                est, rep, s = r.get("EPS Estimate"), r.get("Reported EPS"), r.get("Surprise(%)")
                values = [_finite(x) for x in (est, rep, s)]
                day = ts.strftime("%Y-%m-%d")
                if all(x is not None for x in values) and abs(values[0]) >= 0.01:
                    surp.append([day, round(values[2], 2)])
                rev_surp = _revenue_surprise(r)
                if rev_surp is not None and day <= dt.date.today().isoformat():
                    revenue_surp.append([day, rev_surp])
    except Exception:
        pass
    rev90 = None
    try:
        tr = tk.eps_trend
        if tr is not None and "+1y" in tr.index:
            cur, old = _finite(tr.loc["+1y", "current"]), _finite(tr.loc["+1y", "90daysAgo"])
            if cur is not None and old is not None and old > 0:
                rev90 = round((cur / old - 1) * 100, 2)
    except Exception:
        pass
    eps_q, eps_est = [], []
    try:
        eps_q = _eps_history(tk.quarterly_income_stmt)
    except Exception:
        pass
    try:
        eps_est = _estimate_rows(tk.earnings_estimate)
    except Exception:
        pass
    return {"surp": surp[-8:], "revenue_surp": revenue_surp[-8:], "rev90": rev90, "eps_q": eps_q, "eps_est": eps_est}


def update(tickers, cache, log=print, today=None, pause=0.1, progress=None, fetch_one=None, max_workers=6):
    """Refresh stale estimates concurrently; preserve prior values when one ticker fails.

    A 7-day scheduled run must still regard data fetched exactly 7 days ago as fresh.
    yfinance requests are independent, so a small worker pool avoids serial network waits.
    """
    today = today or dt.date.today()
    fetch_one = fetch_one or fetch
    todo = [t for t in tickers if not (cache.get(t) and "revenue_surp" in cache[t] and "eps_q" in cache[t] and "eps_est" in cache[t] and (today - dt.date.fromisoformat(cache[t]["at"])).days < FRESH_DAYS)]
    if not todo:
        log("yfinance prognozy EPS: cache aktualny (0 do pobrania)")
        return []

    done = []
    # Store results in the main thread only; worker threads perform network reads.
    with ThreadPoolExecutor(max_workers=max(1, int(max_workers))) as pool:
        futures = {pool.submit(fetch_one, t): t for t in todo}
        for n, future in enumerate(as_completed(futures), 1):
            t = futures[future]
            try:
                e = future.result()
            except Exception as ex:
                log(f"prognozy: {t} — {ex}")
                continue
            old = cache.get(t) or {}
            hist = old.get("hist", [])
            if e.get("rev90") is not None:
                hist = (hist + [[today.isoformat(), e["rev90"]]])[-KEEP_HIST:]
            cache[t] = {"at": today.isoformat(), **{k: e.get(k, old.get(k)) for k in ("surp", "rev90", "eps_q", "eps_est")}, "hist": hist}
            done.append(t)
            if progress:
                progress(n, len(todo))
            if n % 25 == 0 or n == len(todo):
                log(f"yfinance prognozy EPS: {n}/{len(todo)}")
    return done
