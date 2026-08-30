# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A momentum-investing tool for SP500, NASDAQ100, and DOWJONES: a Python pipeline computes an S&P-style
Momentum Index selection/weighting for each universe and publishes the results as a static dashboard
(`docs/`) to GitHub Pages. There is a second page (`rebalance.html`) that lets a user paste in their
current brokerage holdings (or import an XTB export) and get buy/sell suggestions to move toward the
computed target weights.

Code comments and CLI print messages are written in Polish; keep that convention when editing existing
files (English is fine for new, unrelated code).

## Pipeline architecture (the core thing to understand)

There are two Python scripts, run in this order, all operating on a local DuckDB file
`momentum_data.duckdb`. Since a recent change, this file **is committed to git** (repo root, tracked —
not under `docs/`, so it has no effect on the GitHub Pages deployment) and persists across scheduled
runs; `main.yml` commits it back after each run (see CI section below). This is what keeps
`portfolio_history` alive across separate monthly workflow runs, so the buffer rule actually has a
"previous rebalance" to compare against in production.

1. **`fetch_data.py`** — data acquisition only.
   - Loads index composition + weights from the three manually-maintained CSV files at repo root
     (`CSPX_holdings.csv` → SP500, `CNDX_holdings.csv` → NASDAQ100, `CIND_holdings.csv` → DOWJONES;
     these are iShares ETF holdings exports and must be replaced by hand when the index composition
     changes) into the `index_constituents` table. The `Market Value` column from each CSV is stored
     as `fmc_etf` and used as a real-world float-adjusted-market-cap substitute for weighting.
   - Downloads daily prices for every constituent ticker via `yfinance`, in batches of 50, into the
     `prices` table (PK `(Date, Ticker)`). Two modes, chosen automatically by `update_duckdb()`:
     - **Bootstrap** (`bootstrap_prices`) — used only when `prices` doesn't exist yet or is empty.
       Downloads the full `--lookback-months` (default 15) window for every ticker via a
       `prices_staging` table renamed into place. If fetched ticker coverage falls below
       `--min-coverage` (default 80%), the refresh is aborted and nothing is written.
     - **Incremental** (`update_prices_incremental`) — used on every subsequent run, since the DB now
       persists. Tickers already present in `prices` only get a short "catch-up" fetch back to their
       last known date (minus `CATCHUP_OVERLAP_DAYS` for safety); tickers with no rows yet (e.g. a new
       constituent after an index-composition CSV swap) get a full `--lookback-months` backfill.
       Fetched data is upserted (`_upsert_price_rows`: delete-then-insert the affected date range for
       the tickers that actually got fresh data — a ticker whose fetch failed keeps its old rows rather
       than losing them). After fetching, rows older than `--lookback-months` are deleted
       (`DELETE FROM prices WHERE Date < cutoff`), so the table is a rolling window and does not grow
       without bound — it always holds just enough history for the M-14 momentum window plus a margin.
2. **`run_query.py`** — all the calculation logic and static site generation. Nothing about data
   fetching lives here. For each universe (`SP500`, `NASDAQ100`, `DOWJONES`):
   - Computes momentum value `(price[M-2] / price[M-14]) - 1` (falls back to a 9-month window
     `price[M-2]/price[M-11] - 1` when 14 months of history isn't available), annualized volatility
     over the same window, a cross-sectional z-score winsorized to ±3, and a momentum score
     (`1+Z` for Z>0, `1/(1-Z)` for Z<0).
   - Selects constituents into the top quintile using a 20% buffer rule (existing holdings get
     re-included up to 120% of the target count before new names are added) — see `select_with_buffer`.
     **DOWJONES is a special case**: all 30 constituents are used (no quintile selection) and weighted
     equally, since it's a small, price-weighted index — see the `universe == "DOWJONES"` branches in
     `process_universe` and `compute_weights`.
   - Computes weights as `fmc * momentum_score`, normalized, capped at `min(9%, 3x cap-weight *within
     the selected set*)`, with excess iteratively redistributed to uncapped names (`compute_weights`).
     If the sum of individual caps can't reach 100% (mathematically infeasible for small selections),
     all caps are scaled up proportionally — see `cap_scaled_due_to_infeasibility` in the JSON output.
   - Persists results to `portfolio_history` (append-only per `ref_date`/`universe`, never dropped by
     `fetch_data.py`) — this is what makes the buffer rule and the dashboard's added/dropped changelog
     possible across runs.
   - Exports `docs/data/{universe}.json` (per-universe constituent list) and `docs/data/all_prices.json`
     (latest price for every ticker across all three indices, so the rebalance panel can price
     positions that aren't in the current momentum selection).
   - Reference date defaults to `MAX(Date)` in the `prices` table; pass `--ref-date YYYY-MM-DD` to
     recompute for a specific historical date.
   - Also builds a small, low-turnover **"top momentum" basket** (`docs/data/top_basket.json`) — see
     below.

Monthly (not semi-annual, as the official S&P 500 Momentum index does) rebalancing is an intentional
choice here — it matches the cadence used in most academic momentum-return literature — not an attempt
at a literal 1:1 replication of S&P's own rebalance calendar.

### Top-momentum basket (`build_top_basket` / `resolve_top_basket`)

A separate, deliberately concentrated basket — SP500 top `TOP_BASKET_SP500_N` (20) + NASDAQ100 top
`TOP_BASKET_NASDAQ100_N` (5) names by `momentum_score`, DOWJONES excluded (no quintile selection there),
overlapping tickers deduplicated. It's a *quality proxy* without fetching any fundamental data: the idea
is that momentum leaders in large, liquid indices tend to already be large, stable, profitable
companies.

Unlike the three main universes, this basket's **membership** only changes once every
`TOP_BASKET_REBALANCE_MONTHS` (6) months, to keep turnover low — but `run_query.py` still runs monthly
and always refreshes the **displayed metrics** (price, momentum %, volatility) for whichever tickers are
currently held, even between rebalances. This split is implemented via a persisted `top_basket_rebalances`
table (same durability story as `portfolio_history` — committed to git via `momentum_data.duckdb`):
- `resolve_top_basket()` checks the months elapsed since `MAX(ref_date)` in `top_basket_rebalances`. If
  ≥ 6 months (or no rebalance has ever happened), it calls `build_top_basket()` on this month's freshly
  computed SP500/NASDAQ100 selections and persists the new membership (`persist_top_basket_rebalance`).
- Otherwise, it loads the tickers held since the last rebalance and calls `refresh_top_basket_metrics()`,
  which looks up each held ticker's most recent price/momentum/volatility from `portfolio_history` as of
  the current `ref_date`. A ticker that fell out of its universe's quintile selection this month (so it
  has no `portfolio_history` row for the current `ref_date`) falls back to its latest available data and
  is flagged `"stale": true` in the JSON output (shown de-emphasized on the dashboard).
- `docs/data/top_basket.json` carries `rebalanced_today`, `last_rebalance_ref_date`, and
  `next_rebalance_ref_date` so the frontend can show rebalance status without recomputing it.

## Frontend (`docs/`) — deployed as-is to GitHub Pages, no build step

Plain HTML/CSS/vanilla JS, a PWA (`manifest.webmanifest` + `sw.js` service worker caching the app shell,
network-first for `docs/data/*.json`). `docs/data/` is generated by `run_query.py` and is gitignored —
it only exists after the pipeline has run.

- **`index.html` / `js/app.js`** — main dashboard: sidebar of top-10 tickers per universe plus a
  fourth sidebar group for the low-turnover top-momentum basket (`docs/data/top_basket.json`,
  `renderTopBasketTiles()` — shows last/next rebalance date, dims tickers flagged `stale`), a
  full sortable constituents table per universe (with an added/dropped changelog vs. the previous
  rebalance), a Ctrl+K command-palette ticker search, and a full-screen TradingView chart widget
  (loaded from `s3.tradingview.com`, mounted via `TradingView.widget(...)`).
- **`rebalance.html` / `js/rebalance.js`** — rebalance calculator. All user state (holdings,
  exclusions, allocation settings) lives in `localStorage` only — there is no backend. Key pieces:
  - `computeTargets()` allocates target dollar capital per universe by the user's `settings.pct`
    split, normalizes each universe's momentum weights to that bucket, merges tickers across
    universes, then truncates to `settings.maxHoldings` and rescales.
  - Positions can be excluded (`excluded` list) so they're priced but never suggested for
    buy/sell — their value is carved out of the investable capital.
  - `parseXtbOpenPositions()` imports an XTB "Open Positions" `.xlsx` export via SheetJS
    (`XLSX.read`, loaded from a CDN in `rebalance.html`) as a one-shot replacement of the holdings list.
  - A client-side Monte Carlo simulation (`simulateMonteCarlo`, Chart.js) projects portfolio value
    using the capital-weighted average momentum (capped at ±30%/yr) and volatility of the currently
    targeted names — explicitly labeled as illustrative, not a forecast.

## Commands

```bash
pip install -r requirements.txt   # NOTE: this file is UTF-16-encoded; edit with a UTF-16-aware tool
                                   # or regenerate it, don't hand-append plain-ASCII lines

python fetch_data.py [--lookback-months N] [--min-coverage 0.8]   # refresh prices (bootstrap or incremental) + index composition
python run_query.py [--ref-date YYYY-MM-DD] [--min-trading-days 150] [--max-staleness-days 10] [--docs-dir docs]
                                   # compute momentum + regenerate docs/data/*.json

pytest                            # unit tests (tests/test_fetch_data.py, tests/test_run_query.py)
ruff check .                      # linter
```

To sanity-check changes to the frontend, open `docs/index.html` / `docs/rebalance.html` directly (or
serve `docs/` with any static file server) after `docs/data/*.json` has been generated by the pipeline.

## CI (`.github/workflows/`)

- **`main.yml`** — runs monthly (`cron: '0 6 1 * *'`), on push to `main`, and manually. Installs
  `requirements.txt`, runs `fetch_data.py` then `run_query.py` against the persisted DuckDB file (see
  above), then **commits `momentum_data.duckdb` back to the repo** (`contents: write` permission; the
  commit message ends in `[skip ci]` to avoid re-triggering itself via the `push: main` trigger) before
  deploying `docs/` to GitHub Pages.
- **`tests.yml`** — runs `pytest`/`ruff` (Python) and an ESLint check (`docs/js/*.js`, Node-only tooling,
  no effect on the deployed site) on pushes/PRs.
