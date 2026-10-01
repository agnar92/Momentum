# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A simple **daily stock watchlist** published as a static site (`docs/`, GitHub Pages). Finviz does the
pre-filtering of the stock list, yfinance supplies prices, a small Python script computes a few
screening indicators, and a plain HTML/JS page lets the user browse the result. Informational only —
not investment advice.

**History (why the repo looks the way it does):** this used to be a much larger momentum-investing tool
(S&P-style Momentum Index replication for SP500/NASDAQ100/DOWJONES/WIG20/mWIG40/sWIG80, Global Equity
Momentum, Weinstein stage analysis charts, TTM Squeeze/Breakout screeners, two automatic rebalancers,
a sector "Strategia" page, a DuckDB database committed to git). At the user's explicit request all of
that was removed ("całkowicie usuwamy momentum, rebalanser itd. Robimy prosty watchlisty do
przeglądania") and replaced by the watchlist below. It all remains in git history (last full version:
the commit before "Replace momentum/rebalancer app with a Finviz watchlist") if anything is ever needed
again. Only `docs/ep.html` (a standalone, TradingView-widgets-based "Episodic Pivot" helper page that never
touched the pipeline) was kept.

Code comments and CLI print messages are written in Polish; keep that convention when editing existing
files (English is fine for new, unrelated code).

## Data flow (all in `watchlist.py`, run daily)

1. **`finviz.py`** — scrapes the free Finviz screener (`finviz.com/screener.ashx`, 20 rows/page, `r=` offset)
   with the filters in **`finviz_screen.json`** (`filters` = comma-separated Finviz filter codes, copy them
   from a Finviz screener URL; `max_tickers` = cap). Default: market cap ≥ $2B (`cap_midover`), price above
   SMA50 and SMA200 (`ta_sma50_pa`, `ta_sma200_pa`), positive EPS growth past 5 years / this year
   (`fa_eps5years_pos`, `fa_epsyoy_pos`) and positive EPS forecasts next year / next 5 years
   (`fa_epsyoy1_pos`, `fa_estltgrowth_pos`) ≈ 130 stocks. It queries three views (Overview `111`,
   Valuation `121`, Financial `161`) with the same filters and merges rows by ticker, mapping columns by
   header text (`VIEW_COLUMNS`) — sector, industry, market cap, P/E, EPS this Y / next Y / past 5Y / next 5Y,
   ROE, margins, next earnings date. **Finviz silently ignores unknown filter codes** (a typo widens the list
   instead of erroring), so check the stock count after editing filters. Everything Finviz gives for free
   comes from Finviz; everything else comes from yfinance.
2. **yfinance** (`download_prices`) — ~15 months of daily OHLCV (`auto_adjust=True`) in batches of 50. The
   still-open US session is dropped (`drop_incomplete_bar`) so a manual run during trading hours never
   treats an incomplete candle as "yesterday's close".
3. **`compute_metrics`** per stock:
   - `rs_score = 0.4·R3M + 0.2·R6M + 0.2·R9M + 0.2·R12M` (cumulative returns, latest quarter double
     weight — the widely used approximation of IBD's RS Rating; the exact IBD formula and universe are not
     public) and `rs_rating` 1–99 = percentile of `rs_score` among the watchlist (`add_rs_rating`, average
     rank for ties). Stocks with < 252 bars get no RS (too young for 12M). **The rating is relative to the
     already-filtered list**, not the whole market.
   - Qullamaggie-style inputs: `adr_pct` (100·(mean(High/Low) − 1), last 20 sessions),
     `dollar_volume_avg` (mean Close·Volume, last 20 sessions), `low_ratio_{1,3,6}m` (price /
     lowest Low of the last 1/3/6 months — a plain ratio, NO "− 1": it is only used for ranking, so sorting
     descending is enough).
   - EMA34 trend: `ema34_rising` is true when daily EMA34 now > 5 > 10 > 15 > 20 sessions ago
     (`ema34_trend`; EMA34 checked every 5 sessions over the last 20), plus `ema34_slope_20d_pct`,
     `price_vs_ema34_pct`, `ema34`.
   - `pct_above_sma50/200` (own computation, informational), `spark` (last 26 weekly closes, % vs. first).
4. **Chart data** (`build_charts`, `docs/data/charts.json`, lazily fetched by the chart modal): a shared list of the
   last 104 weeks (`weeks`), the S&P 500 (`^GSPC`, `spx`; benchmark download is non-fatal) and, per stock, weekly OHLC
   + volume (thousands) aligned to those weeks (`weekly_ohlcv`: W-FRI bars, the partial last week is dated with the
   last session) plus SMA10/SMA40 weekly (computed on the full 3-year history, then sliced) and quarterly EPS
   (`eps`: report date, EPS, YoY % = vs. the report ~1 year earlier, `None` if no/zero base; `eps_next` = upcoming
   estimate). EPS comes from Yahoo `get_earnings_dates` (reported/adjusted EPS, ~12 quarters) and is cached in
   **`docs/data/eps_cache.json`** (`update_eps_cache`, refreshed per ticker only when older than 7 days, 4 worker
   threads, 600 s budget, errors never abort the run). Price history is downloaded for `3y`.
5. Output **`docs/data/watchlist.json`** (`generated_at`, `data_as_of` = last session date, `finviz_filters`,
   `finviz_total`, `finviz_stale`, `n_stocks`, `stocks[]`). If Finviz fails or returns suspiciously few rows
   (`MIN_TICKERS`), the previous file's stock list (and its Finviz fields) is reused and `finviz_stale` is
   set; if price coverage is below `MIN_COVERAGE` (70%) nothing is written and the script exits 1.

Run it: `python watchlist.py` (`--skip-finviz` reuses the previous list and only refreshes prices;
`--max-tickers N`; `--output PATH`). No database — every run recomputes from scratch.

## CI (`.github/workflows/`)

- **`daily_watchlist.yml`** — runs `watchlist.py` every Tuesday–Saturday at 05:30 UTC (morning in Poland, after
  the previous US session closed, so the data is "yesterday's close for today's open") and on
  `workflow_dispatch` (**manual refresh**: Actions → "Daily Watchlist Refresh" → Run workflow; the page's
  "🔄 Odśwież dane" button links there). It commits `docs/data/` back (rebasing onto the current `origin/main`
  first, `git reset --mixed`, with a retry loop; commit message ends in `[skip ci]`) and deploys `docs/` to
  Pages. Finviz may block datacenter IPs — in that case the previous list is reused (see above), and the page
  shows a warning when `finviz_stale` is true. **Never use "Re-run jobs" on an old run once `main` moved on**
  (GitHub re-runs against the original trigger SHA, i.e. old code); trigger a fresh `workflow_dispatch`.
- **`deploy.yml`** — plain Pages deploy of `docs/` on every push to `main` (no data fetch).
- **`tests.yml`** — `ruff` + `pytest` (Python) and ESLint + `node --test` (JS) on pushes/PRs.
- `feature-branch-check.yml` is a leftover temporary workflow for an old branch; safe to delete.

## Frontend (`docs/`) — plain HTML/CSS/vanilla JS, no build step

- **`index.html` + `js/watchlist.js`** — the only data page. Four tabs over the same `watchlist.json`:
  - **📋 Lista** — every stock that passed Finviz (EPS columns from Finviz, SMA distances/RS from our data).
  - **📊 RS Ranking** — `rs_rating ≥` a user-entered minimum (default 80), best first (`rsLeaders`).
  - **🎯 Qullamaggie** — user-entered min daily dollar volume (default 20 mln $), min ADR % (default 4) and
    **top X %** (default 10); stocks failing the liquidity thresholds are dropped, then for EACH of the 1/3/6
    month windows the top X % by `low_ratio_*` (price / minimum) are taken and the result is the UNIQUE union (each row
    remembers which windows it made; `qullamaggieRows`).
  - **📈 Trend EMA34** — a SEPARATE filter, deliberately independent of RS and Qullamaggie
    (`ema34_rising === true`, sorted by 20-session slope; `ema34Rows`).
  **Clicking a row opens a MarketSmith-style chart** (`js/chart.js`, pure SVG, no libraries; model/scales are unit
  tested in `tests/js/chart.test.js`): S&P 500 strip on top; weekly OHLC bars + SMA10 (green) / SMA40 (red) + the RS
  line (stock / S&P 500, blue, own scale in the lower third, labelled with the RS Rating); weekly volume; quarterly
  EPS line with YoY % under each point; small triangles at report weeks; crosshair readout on hover. The link
  button inside a row still opens TradingView and does not open the chart.
  Common search box + sector select; table headers sort (empty values always last); settings persist in
  `localStorage` (`momentum_watchlist_settings`). Rows link out to TradingView (`tvUrlFor`) — there is no
  in-app chart any more. Pure logic is covered by `tests/js/watchlist.test.js`.
- **`ep.html` + `js/ep.js`** — standalone Episodic Pivot helper (TradingView gap-scanner link, volume-breakout
  screener widget, news widget, localStorage journal). Unrelated to the watchlist data.
- **`js/shared.js`** (`tvUrlFor`, `compareRows`, TradingView embed helpers), **`js/qol.js`** (toasts, offline
  badge, loading overlay), **`js/pull-to-refresh.js`**; `sw.js` is a network-first PWA service worker (bump
  `CACHE` and keep `SHELL` in sync when files are added/removed). Files are plain `<script>` tags sharing
  globals; for Node tests each file re-attaches the shared globals via the `typeof require` block at its top.
  `css/style.css` still contains a lot of CSS from the removed pages.

## Commands

```bash
pip install -r requirements.txt -r requirements-dev.txt   # requirements.txt is plain UTF-8 now
python watchlist.py [--skip-finviz] [--max-tickers N]     # refresh docs/data/watchlist.json
pytest                                                     # tests/test_watchlist.py (no network)
ruff check .
npm ci && npm test && npm run lint                         # JS tests (node --test) + ESLint
```

To look at the page locally: `cd docs && python3 -m http.server`, then open `http://localhost:8000`.
`docs/data/watchlist.json` is committed, so the page works from a fresh checkout.
