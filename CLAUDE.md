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
     `fetch_data.py`) — this is what makes the buffer rule possible across runs (and lets `export_json`
     compute an `added_tickers`/`dropped_tickers` changelog vs. the previous run, exported in the JSON
     though not currently rendered on the dashboard).
   - Exports `docs/data/{universe}.json` (per-universe constituent list) and `docs/data/all_prices.json`
     (latest price for every ticker across all three indices, so the rebalance panel can price
     positions that aren't in the current momentum selection).
   - Reference date defaults to `MAX(Date)` in the `prices` table; pass `--ref-date YYYY-MM-DD` to
     recompute for a specific historical date.
   - Also computes **Global Equity Momentum** (`docs/data/global_equity_momentum.json`) — see below.

Monthly (not semi-annual, as the official S&P 500 Momentum index does) rebalancing is an intentional
choice here — it matches the cadence used in most academic momentum-return literature — not an attempt
at a literal 1:1 replication of S&P's own rebalance calendar.

### Global Equity Momentum (`compute_index_returns` / `compute_index_leaders`)

Compares the **index level** (not constituents) of SP500/NASDAQ100/DOWJONES against each other over a
trailing `GEM_LOOKBACK_MONTHS` (12) window — the classic dual/global-momentum idea of picking whichever
market currently has the strongest trend. `fetch_data.py::update_index_prices` pulls daily closes for
`^GSPC`/`^NDX`/`^DJI` (`INDEX_LEVEL_SYMBOLS`) into a small `index_prices` table (`Date, Index_Name,
Close, ...`), fully replaced on every run since it's only 3 symbols (no incremental logic needed, unlike
the per-constituent `prices` table). `compute_index_returns()` reads that table and returns each
universe's return over the window, sorted descending; the top one is the `winner`.

For the winner, `compute_index_leaders()` finds the top `GEM_TOP_N` (10) constituents that are actually
**pushing the index to its new highs** — ranked by *contribution to the index's return*
(`weight_in_index_pct * return_pct`, where the weight is the constituent's `fmc_etf` share of the
winning universe and the return is computed over the *same* window as the index return), not by raw
momentum score — a small-cap mover with an extreme return but negligible index weight should not outrank
a mega-cap that is dragging the whole index up. `export_global_equity_momentum()` writes both the ranked
index list and the winner's leader list to `docs/data/global_equity_momentum.json`.

Unlike the three main universes, GEM is refreshed **daily**, not monthly (`daily_gem.yml`, see CI
section) — so `export_global_equity_momentum()`'s `ref_date` is *not* threaded through from the
constituent-price pipeline's `ref_date` (that only moves once a month). When called with `ref_date=None`
(the default), it derives its own from `MAX(Date)` in `index_prices` instead, so a same-day
`fetch_data.py --indices-only` refresh is actually reflected in the output — `compute_index_leaders()`
still gracefully falls back to each constituent's last known price via `ARGMAX(... FILTER WHERE Date <=
ref_date)` even though the per-constituent `prices` table itself is only as fresh as the last monthly run.
`fetch_data.py --indices-only` and `run_query.py --gem-only` are the two flags that make this cheap daily
refresh possible without touching the (expensive, rate-limited) per-constituent price fetch.

### Relative strength YTD (`compute_index_ytd_return` / `compute_relative_strength_leaders`)

A screener for NASDAQ100 and DOWJONES only (SP500 deliberately excluded): for each constituent, compares
its return since the first available trading day of the current calendar year to the *same* YTD return
computed for the index level (`index_prices`, like GEM). Only constituents that are currently
**outperforming their own index** this year are kept — `relative_strength_pct = constituent_return_pct -
index_return_pct`, always positive by construction — sorted descending, so the biggest current outperformers
come first. `export_relative_strength()` writes per-universe results (index YTD return, YTD start date,
outperformer list) to `docs/data/relative_strength.json`; the frontend (`combinedRelativeStrengthLeaders()`
in `app.js`) merges both universes into one ranked list for display. Like GEM, its `ref_date` defaults to
`index_prices`'s own watermark (not the monthly constituent-pipeline `ref_date`), and it's recomputed by
the same `run_query.py --gem-only` daily path as GEM (see `daily_gem.yml`) since it only needs
`index_prices` (daily) + `prices`/`index_constituents` (gracefully stale-tolerant, same as
`compute_index_leaders`).

## Frontend (`docs/`) — deployed as-is to GitHub Pages, no build step

Plain HTML/CSS/vanilla JS, a PWA (`manifest.webmanifest` + `sw.js` service worker caching the app shell,
network-first for `docs/data/*.json`). `docs/data/` is generated by `run_query.py` and is gitignored —
it only exists after the pipeline has run.

- **`index.html` / `js/app.js`** — main dashboard: sidebar of top-10 tickers per universe plus a fourth
  sidebar group for **Global Equity Momentum** (`docs/data/global_equity_momentum.json`,
  `renderGemPanel()` — shows the winning index + its return, a ranked list of all 3 indices' returns, and
  tiles for the winner's top-10 contribution leaders), a full sortable constituents table per universe
  (`added_tickers`/`dropped_tickers` are exported in the JSON but not currently rendered), a Ctrl+K
  command-palette ticker search, and a full-screen TradingView chart widget (loaded from
  `s3.tradingview.com`, mounted via `TradingView.widget(...)`), plus a fifth sidebar group for
  **relative strength YTD** (`docs/data/relative_strength.json`, `renderRelativeStrengthPanel()` — each
  index's own YTD return, and tiles merging NASDAQ100+DOWJONES outperformers via
  `combinedRelativeStrengthLeaders()`, sorted by edge over their index). The sidebar is hidden on phones
  in portrait (`@media max-width:640px`), so the drawer table has a 4th "🚀 GEM" tab (`showDrawerTable()` /
  `renderGemTable()`) and a 5th "💪 RS" tab (`renderRelativeStrengthTable()`) rendering the same lists as
  their own tables — the only way to reach them on mobile, since neither is otherwise duplicated by the
  per-universe tables.
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

python fetch_data.py --indices-only   # daily_gem.yml only: refresh index_prices (^GSPC/^NDX/^DJI), skip constituents
python run_query.py --gem-only        # daily_gem.yml only: regenerate global_equity_momentum.json only

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
- **`daily_gem.yml`** — runs daily (`cron: '30 22 * * *'`) and manually. Unlike `main.yml`, does **not**
  run the full constituent pipeline: `fetch_data.py --indices-only` refreshes just `index_prices` (3
  symbols), then `run_query.py --gem-only` regenerates only `docs/data/global_equity_momentum.json`.
  Because `docs/data/` is gitignored and this job never runs the full `run_query.py`, it first curls the
  other `docs/data/*.json` files off the *currently published* Pages site (`https://<owner>.github.io/
  <repo>/data/...`) before regenerating the GEM file and uploading `docs/` as the Pages artifact —
  otherwise the deploy would replace the whole live site with only the one regenerated file. Also commits
  `momentum_data.duckdb` back (same `[skip ci]` convention as `main.yml`, to avoid triggering a full
  monthly run on every daily push).
- **`tests.yml`** — runs `pytest`/`ruff` (Python) and an ESLint check (`docs/js/*.js`, Node-only tooling,
  no effect on the deployed site) on pushes/PRs.
