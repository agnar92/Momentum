# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A momentum-investing tool for SP500, NASDAQ100, DOWJONES, WIG20, and mWIG40: a Python pipeline computes
an S&P-style Momentum Index selection/weighting for each universe and publishes the results as a static
dashboard (`docs/`) to GitHub Pages. There is a second page (`rebalance.html`) that lets a user paste in
their current brokerage holdings (or import an XTB export) and get buy/sell suggestions to move toward
the computed target weights. `CSPX_holdings.csv` (iShares Core S&P 500 UCITS ETF holdings, same format/
convention as `CNDX_holdings.csv`/`CIND_holdings.csv`) was restored from git history (the exact file
present right before an earlier, temporary removal of SP500 from the tool — see git history) as the
starting holdings snapshot — replace it by hand like the other two CSVs when the index composition
changes.

**The rebalance calculator has no regions any more.** An earlier design split `rebalance.js` into two
fully independent halves — `USA` (NASDAQ100+DOWJONES, USD) and `GPW` (WIG20+MWIG40, PLN), each with its
own contribution amount, own TOP N picker per index, own suggestion table, Monte Carlo, equity curve, and
portfolio donut — specifically to avoid ever summing a PLN amount and a USD amount together (this tool
doesn't fetch an FX rate). That design is gone: the user found running two side-by-side panels more
complex than needed once the dashboard grew a full RSM screener (see below), and asked instead for one
single flow driven directly by Global Equity Momentum (GEM, see the dedicated section below) — the user
picks a total capital contribution and a single "how many companies" (TOP N) number; the calculator itself
decides WHICH ONE of the 5 universes to draw from (whichever is this month's GEM winner) and takes that
universe's own TOP N constituents by momentum. Because only one universe is ever the active source at a
time, there is only one currency in play for the suggestion table/Monte Carlo/equity curve/donut at once
(picked dynamically from the winner via `PLN_UNIVERSES`) — the FX problem never had to be solved, it was
sidestepped again, just via "one universe active at a time" instead of "two separate capital pools."
Existing holdings from a universe that ISN'T the current winner are still priced and shown (so they can be
flagged for sale) — `currencyOf(ticker)` (in `rebalance.js`, the direct replacement for the older,
region-returning `regionOf`) is only used for formatting an individual holding-table row in its own native
currency, independent of which universe currently drives new buy suggestions.

Code comments and CLI print messages are written in Polish; keep that convention when editing existing
files (English is fine for new, unrelated code).

## Pipeline architecture (the core thing to understand)

There are two Python scripts, run in this order, all operating on a local DuckDB file
`momentum_data.duckdb`. Since a recent change, this file **is committed to git** (repo root, tracked —
not under `docs/`, so it has no effect on the GitHub Pages deployment) and persists across scheduled
runs; `main.yml`/`weekly_charts.yml`/`daily_gem.yml` all commit it back after each run (see CI section
below). This is what keeps `portfolio_history` alive across separate monthly workflow runs, so the buffer
rule actually has a "previous rebalance" to compare against in production.

**Selection/weighting is monthly; price/chart freshness is now weekly** — these are two deliberately
decoupled cadences, not one. `fetch_data.py` (full, not `--indices-only`) and `run_query.py --charts-only`
both now also run weekly (`weekly_charts.yml`, see CI section below), on top of `main.yml`'s existing
monthly full run — but `--charts-only` (`process_universe_charts_only()`) recomputes ONLY the current
price + `weekly_chart`/`mansfield_chart` for each ticker in the LAST already-saved `portfolio_history`
snapshot; it never touches selection, weights, or `portfolio_history` itself, which stay exactly as
computed by the last monthly `process_universe()` run. This was a deliberate choice (confirmed with the
user) after establishing that `fetch_data.py` alone never touches `docs/data/*.json` — only `run_query.py`
does — so simply fetching prices more often would not, by itself, have made the SMA10/30/Darvas-box/
Mansfield-oscillator/RSM-screener data on the dashboard any fresher; `--charts-only` is what actually
closes that gap while leaving the monthly rebalance cadence untouched. `portfolio_history` gained a new
persisted `cap_scaled_due_to_infeasibility BOOLEAN` column (added via an idempotent
`ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, same idiom as `_ensure_prices_ohlc_columns` in `fetch_data.py`)
specifically so `--charts-only` can re-export this display flag for the JSON payload without recomputing
weights. The `docs/data/{universe}.json` `"ref_date"` field written by a `--charts-only` run is
deliberately still the LAST MONTHLY REBALANCE date (not today) — it's what the dashboard's "Rebalans: ..."
label reads, and that label is meant to keep showing the actual selection date, not the date the charts
happened to refresh; only the per-constituent `"price"` and chart fields reflect the fresher data. No new
code was needed to keep `prices` from growing unbounded under the new weekly cadence:
`update_prices_incremental()`'s retention trim (`DELETE FROM prices WHERE Date < cutoff`, see below) already
runs unconditionally on every `fetch_data.py` invocation, so a weekly full fetch keeps the rolling window at
exactly `--lookback-months` (22) regardless of how often it's called — this was verified, not assumed, before
being left alone.

1. **`fetch_data.py`** — data acquisition only.
   - Loads index composition + weights from the three manually-maintained CSV files at repo root
     (`CSPX_holdings.csv` → SP500, `CNDX_holdings.csv` → NASDAQ100, `CIND_holdings.csv` → DOWJONES;
     these are iShares ETF holdings exports and must be replaced by hand when the index composition
     changes) into the `index_constituents` table. The `Market Value` column from each CSV is stored
     as `fmc_etf` and used as a real-world float-adjusted-market-cap substitute for weighting.
   - **WIG20/mWIG40** (Warsaw Stock Exchange) have no equivalent ETF publishing holdings in the iShares
     CSV format, so their composition instead comes from two manually-maintained JSON files at repo root
     (`WIG20_holdings.json`, `MWIG40_holdings.json` — `JSON_INDEX_MAP`, loaded by
     `_load_json_constituents()`), each just a list of GPW tickers (optionally with sector) and **no**
     weight data — replace them by hand from GPW Benchmark's quarterly/annual index-revision portfolios.
     `fmc_etf` is set to a dummy `1.0` for every row (satisfies the `NOT NULL` eligibility filter in
     `get_universe_metrics` without implying a real weight); see `run_query.py`'s `EQUAL_WEIGHT_UNIVERSES`
     for how that plays out downstream. Tickers loaded this way are tracked in the module-level
     `GPW_TICKERS` set so `_to_yf_symbol()` can append the `.WA` suffix yfinance needs for GPW listings
     (e.g. `PKN` → `PKN.WA`) — every other ticker only gets translated via the small, explicit
     `YFINANCE_TICKER_OVERRIDES` dict (dual-class US shares like `BRKB` → `BRK-B`).
   - Downloads daily prices for every constituent ticker via `yfinance`, in batches of 50, into the
     `prices` table (PK `(Date, Ticker)`, columns `Close, Adj_Close, Volume, High, Low` — High/Low were
     always present in yfinance's OHLCV response but discarded until `run_query.py` needed them to split
     weekly volume into buying/selling, see below; `_download_price_rows(..., include_ohlc=True)` is what
     appends them, `index_prices` still doesn't carry them since nothing needs them there).
     `_ensure_prices_ohlc_columns()` runs an idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
     migration before every incremental refresh, since the already-committed `momentum_data.duckdb` predates
     these columns — old rows get `NULL` High/Low until they age out of the retention window and get
     replaced by freshly-fetched rows that have them. Two modes, chosen automatically by `update_duckdb()`:
     - **Bootstrap** (`bootstrap_prices`) — used when `prices` doesn't exist yet, is empty, or (see
       `_prices_history_is_shallow()` below) doesn't reach back far enough for the currently configured
       `--lookback-months`. Downloads the full `--lookback-months` (default **22**, raised from an
       original 15 — see below) window for every ticker via a `prices_staging` table renamed into place.
       If fetched ticker coverage falls below `--min-coverage` (default 80%), the refresh is aborted and
       nothing is written.
     - **Incremental** (`update_prices_incremental`) — used on every subsequent run once `prices` already
       has deep-enough history, since the DB now persists. Tickers already present in `prices` only get a
       short "catch-up" fetch back to their last known date (minus `CATCHUP_OVERLAP_DAYS` for safety);
       tickers with no rows yet (e.g. a new constituent after an index-composition CSV swap) get a full
       `--lookback-months` backfill. Fetched data is upserted (`_upsert_price_rows`: delete-then-insert
       the affected date range for the tickers that actually got fresh data — a ticker whose fetch failed
       keeps its old rows rather than losing them). After fetching, rows older than `--lookback-months`
       are deleted (`DELETE FROM prices WHERE Date < cutoff`), so the table is a rolling window and does
       not grow without bound — it always holds just enough history for the M-14 momentum window plus a
       margin (see below for why that margin was widened).
     - **`_prices_history_is_shallow(con, lookback_months)`** — the check that routes a run to Bootstrap
       instead of Incremental even when `prices` already has rows: true when the oldest retained `Date` is
       more than `lookback_months` (plus a 14-day slack for weekend/holiday edge cases) in the past. This
       exists because Incremental only ever fetches *forward* from the watermark — it can never backfill
       older history a raised `--lookback-months` newly requires. It's self-limiting: the one full
       bootstrap this triggers after a `--lookback-months` bump gives `prices` the new depth, so every
       run after that sees a deep-enough table again and returns to the normal Incremental path.
       **`--lookback-months` was raised from 15 to 22** specifically so the ~14-month momentum window
       (`M-14`) leaves a real ~7-8-month buffer in front of its own `start_date` for `SMA30` (Weinstein
       stage analysis) and the Mansfield RS oscillator's 26-week smoothing to warm up in — at 15 months
       there was next to no buffer left once the momentum window itself was subtracted, so those series
       were `null` for a chunk of the displayed window (see `sma10_pct`/`sma30_pct` and `mansfield_chart`
       under Relative strength below). The already-committed `momentum_data.duckdb` predates this bump, so
       its first refresh under the new default goes through exactly this one-time full re-bootstrap.
2. **`run_query.py`** — all the calculation logic and static site generation. Nothing about data
   fetching lives here. For each universe (`SP500`, `NASDAQ100`, `DOWJONES`, `WIG20`, `MWIG40` —
   `UNIVERSES`):
   - Computes momentum value `(price[M-2] / price[M-14]) - 1` (falls back to a 9-month window
     `price[M-2]/price[M-11] - 1` when 14 months of history isn't available), annualized volatility
     over the same window, a cross-sectional z-score winsorized to ±3, and a momentum score
     (`1+Z` for Z>0, `1/(1-Z)` for Z<0).
   - Selects constituents into the top quintile using a 20% buffer rule (existing holdings get
     re-included up to 120% of the target count before new names are added) — see `select_with_buffer`.
     **`EQUAL_WEIGHT_UNIVERSES` (`DOWJONES`, `WIG20`, `MWIG40`) are a special case**: all qualifying
     constituents are used (no quintile selection) and weighted equally — see the
     `universe in EQUAL_WEIGHT_UNIVERSES` branches in `process_universe` and `compute_weights`. DOWJONES
     is there because it's a small, price-weighted index; WIG20/mWIG40 are there because they have no
     real `fmc_etf` weight to select/weight by in the first place (see `fetch_data.py` above) — this is
     the direct consequence of the "just a ticker list, no weights" JSON format chosen for them.
   - Computes weights as `fmc * momentum_score`, normalized, capped at `min(9%, 3x cap-weight *within
     the selected set*)`, with excess iteratively redistributed to uncapped names (`compute_weights`).
     If the sum of individual caps can't reach 100% (mathematically infeasible for small selections),
     all caps are scaled up proportionally — see `cap_scaled_due_to_infeasibility` in the JSON output.
   - Persists results to `portfolio_history` (append-only per `ref_date`/`universe`, never dropped by
     `fetch_data.py`) — this is what makes the buffer rule possible across runs (and lets `export_json`
     compute an `added_tickers`/`dropped_tickers` changelog vs. the previous run, exported in the JSON
     though not currently rendered on the dashboard).
   - Exports `docs/data/{universe}.json` (per-universe constituent list) and `docs/data/all_prices.json`
     (latest price for every ticker across all indices, so the rebalance panel can price
     positions that aren't in the current momentum selection).
   - Each `docs/data/{universe}.json` also carries an `all_constituents` list (`FULL_COVERAGE_UNIVERSES`,
     `_build_full_universe_records`) — for **SP500 and NASDAQ100** specifically (`set(UNIVERSES) -
     EQUAL_WEIGHT_UNIVERSES`), this is every constituent that passes `get_universe_metrics`' eligibility
     filter, each with its own `weekly_chart`/`mansfield_chart`, not just the ones that made the current
     top-quintile `constituents` list. This exists because the dashboard's Ctrl+K search
     (`buildSearchIndex()`) and own-chart lookup (`findRsEntry()`) originally only read `constituents`, so
     a real S&P 500 name outside the current decile (and not currently an outperformer on the Relative
     Strength screener either — that list is *also* narrower, see `compute_relative_strength_leaders`
     below) was simply unfindable anywhere on the site, with no error, no matter how a user tried to look
     it up — the user explicitly asked for every SP500/NASDAQ100 constituent to be searchable/chartable
     regardless of decile membership. `EQUAL_WEIGHT_UNIVERSES` (DOWJONES/WIG20/MWIG40) are excluded from
     this because their `constituents` is already the full universe (no quintile selection to begin with)
     — `export_json`'s `all_constituents` param defaults to the same records as `constituents` for them,
     so the frontend can always read `all_constituents` unconditionally, with a `|| constituents` fallback
     kept only for an older, not-yet-migrated cached JSON. `process_universe_charts_only` (`--charts-only`,
     see below) does the equivalent full-universe `get_universe_metrics` call too, so the weekly chart
     refresh keeps `all_constituents` in step with the monthly `process_universe` run rather than shrinking
     it back down to just the last saved decile selection between rebalances. This roughly 5x's the
     `weekly_chart`/`mansfield_chart` computation (and JSON payload size) for SP500 specifically (~500
     constituents vs. ~100 in the decile) — an accepted, deliberate cost of full searchability, not an
     oversight.
   - Reference date defaults to `MAX(Date)` in the `prices` table; pass `--ref-date YYYY-MM-DD` to
     recompute for a specific historical date.
   - Also computes **Global Equity Momentum** (`docs/data/global_equity_momentum.json`) — see below.

Monthly (not semi-annual, as the official S&P 500 Momentum index does) rebalancing is an intentional
choice here — it matches the cadence used in most academic momentum-return literature — not an attempt
at a literal 1:1 replication of S&P's own rebalance calendar.

### Global Equity Momentum (`compute_index_returns` / `compute_index_leaders`)

Compares the **index level** (not constituents) of ALL FIVE universes — `GEM_UNIVERSES` is now
`["SP500", "NASDAQ100", "DOWJONES", "WIG20", "MWIG40"]`, the same set as `UNIVERSES` — against each other
over a trailing `GEM_LOOKBACK_MONTHS` (12) window — the classic dual/global-momentum idea of picking
whichever market currently has the strongest trend. This used to compare only NASDAQ100/DOWJONES
(SP500/WIG20/mWIG40 were deliberately excluded from the race, even though their index-level data was
already being fetched for Relative Strength) — widened to all 5 specifically because GEM stopped being a
dashboard-only curiosity and became the selection engine for the rebalance calculator (`rebalance.js`, see
"What this repo is" above and the Frontend section below): the calculator needs a winner drawn from the
full set of universes it can rebalance against, not just two of them. `compute_index_returns()` (below)
already computed a straight full-window `price_now/price_start - 1` return — not momentum's M-14/M-2
skip-most-recent-2-months convention, which is reserved for individual stocks — so widening `GEM_UNIVERSES`
required no change to that computation, only to the constant itself.
`fetch_data.py::update_index_prices` maintains a shared `index_prices` table (`Date, Index_Name, Close,
...`), fully replaced on every run (no incremental logic needed, unlike the per-constituent `prices`
table) — but SP500/NASDAQ100/DOWJONES and WIG20/mWIG40 get their rows two entirely different ways:

- **SP500/NASDAQ100/DOWJONES** (`^GSPC`/`^NDX`/`^DJI`, `INDEX_LEVEL_SYMBOLS`,
  `fetch_data.py::YFINANCE_BACKED_INDEX_UNIVERSES`): fetched from yfinance via `_download_price_rows`,
  same as before — these three symbols do have full historical daily data there.
- **WIG20/mWIG40** (`fetch_data.py::SYNTHETIC_INDEX_UNIVERSES`): **not** fetched from yfinance at all —
  `WIG20.WA`/`MWIG40.WA` were tried first (a
  single multi-ticker `_download_price_rows(['^NDX', '^DJI', 'WIG20.WA', 'MWIG40.WA'], ...)` call, then a
  per-symbol solo retry added to `_download_price_rows()` itself to rule out a batching quirk), and both
  consistently came back "possibly delisted; no price data found" — confirmed, via a throwaway diagnostic
  GitHub Actions run, to be a real Yahoo data-availability gap and not a yfinance/batching bug:
  `yf.download`/`Ticker.history` for these two tickers return **at most one row (today's)** no matter the
  requested range or interval (`period="1y"`, `period="1mo"`, `interval="1wk"` over 2 years — all gave 1
  row), while `Ticker(...).fast_info` works fine (current quote, `quoteType: "INDEX"`) and the exact same
  call for an individual constituent (e.g. `PKN.WA`) returns full multi-month history without issue. So
  Yahoo's chart API has no historical series for the WIG20/mWIG40 **index tickers themselves** — only a
  live quote — while it has full history for every individual GPW-listed **stock**, retry or no retry.
  `update_index_prices` instead calls `_compute_synthetic_equal_weight_index()`: an equal-weighted (same
  convention as `EQUAL_WEIGHT_UNIVERSES`) synthetic index level, base 100, built purely from the *already
  fetched* per-constituent closes in `prices` for that universe's tickers in `index_constituents` — daily
  equal-weighted average return across constituents, compounded from the base. This is not a literal
  WIG20/mWIG40 replica, but every consumer (`compute_index_momentum`, `compute_relative_strength_chart`,
  `compute_mansfield_rs_chart`) only ever reads **% change relative to a window's start**, never the
  absolute level, so an arbitrary base is fine. It also works under `--indices-only` (`daily_gem.yml`):
  `index_constituents`/`prices` aren't refreshed there, but persist from the last full run, so the
  synthetic series just doesn't gain new days between monthly runs instead of being empty. Returns an
  empty frame (no exception) when `index_constituents`/`prices` don't exist yet (fresh bootstrap) or have
  no rows for that universe in the window.

Before the synthetic-index fix, `weekly_chart`/`mansfield_chart` were silently `None` for every WIG20/
mWIG40 stock (`compute_relative_strength_chart`/`compute_mansfield_rs_chart` both need their own index's
rows and return `None` without them) — the dashboard showed correct WIG20/mWIG40 constituent/momentum
data but no chart for any of their tickers, with no error anywhere in the pipeline. `compute_index_returns()`
reads `index_prices` filtered to `GEM_UNIVERSES` (now all 5) and returns each universe's return over the
window, sorted descending; the top one is the `winner`. WIG20/mWIG40's synthetic (not real-index) level is
still good enough here, same reasoning as for Relative Strength below: every consumer only ever reads %
change relative to a window's start.

For the winner, `compute_index_leaders()` finds the top `GEM_TOP_N` (10) constituents that are actually
**pushing the index to its new highs** — ranked by *contribution to the index's return*
(`weight_in_index_pct * return_pct`, where the weight is the constituent's `fmc_etf` share of the
winning universe and the return is computed over the *same* window as the index return), not by raw
momentum score — a small-cap mover with an extreme return but negligible index weight should not outrank
a mega-cap that is dragging the whole index up. `export_global_equity_momentum()` writes both the ranked
index list and the winner's leader list to `docs/data/global_equity_momentum.json`. **This `leaders` list
is purely informational** (shown in the small GEM widget on `rebalance.html`, see Frontend section below)
— it is NOT what the rebalance calculator buys. The calculator's own TOP N selection
(`rebalance.js::selectedConstituents`) re-ranks the winning universe's full constituent list by its own
`momentum_score`/`rank` (the same per-constituent momentum ranking `get_universe_metrics` computes for
every universe's selection, exposed on every `all_constituents` record) — a deliberately different,
simpler ranking than `compute_index_leaders`'s index-contribution weighting, chosen because the user
wants TOP N to mean "strongest own momentum," not "biggest driver of the index's return."

Unlike the main constituent-selection universes (`UNIVERSES`), GEM is refreshed **daily**, not monthly (`daily_gem.yml`, see CI
section) — so `export_global_equity_momentum()`'s `ref_date` is *not* threaded through from the
constituent-price pipeline's `ref_date` (that only moves once a month). When called with `ref_date=None`
(the default), it derives its own from `MAX(Date)` in `index_prices` instead, so a same-day
`fetch_data.py --indices-only` refresh is actually reflected in the output — `compute_index_leaders()`
still gracefully falls back to each constituent's last known price via `ARGMAX(... FILTER WHERE Date <=
ref_date)` even though the per-constituent `prices` table itself is only as fresh as the last monthly run.
`fetch_data.py --indices-only` and `run_query.py --gem-only` are the two flags that make this cheap daily
refresh possible without touching the (expensive, rate-limited) per-constituent price fetch.

**GEM has no dashboard tab any more** (`index.html`/`app.js` — it used to have its own sidebar group,
drawer tab, and table, all reading `docs/data/global_equity_momentum.json` via `state.gem`). It was
removed once the rebalance calculator became its actual consumer: a "just to look at" panel on the
dashboard was no longer the point, since the winner it computes now directly drives what the calculator
buys. `global_equity_momentum.json` is still generated by the pipeline exactly as before (daily,
`--gem-only`) — only `app.js` stopped fetching/rendering it; `rebalance.js` fetches it instead (see
Frontend section below).

### Relative strength (`compute_index_momentum` / `compute_relative_strength_leaders`)

A screener for SP500, NASDAQ100, DOWJONES, WIG20, and mWIG40 (`RELATIVE_STRENGTH_UNIVERSES`): for each
constituent, compares its momentum to the *same-window* momentum of the index level
(`index_prices`). Deliberately uses the exact same window as the main universes' `momentum_value`
(`get_universe_metrics`: M-14/M-2, falling
back to M-11/M-2 when 14 months of history isn't available) instead of a calendar-YTD window — YTD would
have too little data right after New Year, and reusing this window means `compute_relative_strength_leaders`
can call `get_universe_metrics()` directly (same eligibility filtering, no separate query/window needed).
`compute_index_momentum()` computes the same M-14/M-2 (or M-11/M-2) momentum for the index level. Only
constituents currently **outperforming their own index** in that window are kept —
`relative_strength_pct = constituent_return_pct - index_return_pct`, always positive by construction —
sorted descending, so the biggest current outperformers come first. `export_relative_strength()` writes
per-universe results (index return, `momentum_window` label, outperformer list) to
`docs/data/relative_strength.json`. **The frontend no longer fetches this file at all** — the dashboard's
RSM screener (see Frontend section below, `combinedRsmCandidates()` in `app.js`) builds its own two lists
directly from the `mansfield_chart` already embedded in every constituent record, rather than from this
outperformers-only export; `docs/data/relative_strength.json` keeps being generated by the daily pipeline
(nothing currently reads it, but it's cheap to keep and not worth a breaking pipeline change to drop).
Like GEM, its `ref_date` defaults to `index_prices`'s own watermark (not the monthly constituent-pipeline
`ref_date`), and it's recomputed by the same `run_query.py --gem-only` daily path as GEM (see
`daily_gem.yml`) since it only needs `index_prices` (daily) + `prices`/`index_constituents` (gracefully
stale-tolerant, same as `compute_index_leaders`).

Each leader also carries a `weekly_chart` (`compute_relative_strength_chart()`) with a classic stage
-analysis view (Stan Weinstein / Dr Eric Wish) the free TradingView widget can't reliably replicate
(adding a compare symbol can hit free-tier account limits): the **"10:30" chart** — the stock's own weekly
price plus its 10-week and 30-week SMA, together with its own index level over the same weeks — with every
series expressed as **% change relative to the first displayed (in-window) week**, not raw values on
separate scales: two raw series on different axes make it hard to judge by eye which one is actually
growing faster, while rebasing both to 0% at the window's start means whichever line ends up higher *is*
the outperformer — directly answering "is this stock stronger than its own market right now" (`close_pct`/
`sma10_pct`/`sma30_pct`/`index_pct`; the SMAs are computed on the raw weekly price first, then rebased by
the same stock-price base as `close_pct` so they still read as a smoothed version of the price line). All
series are resampled from the daily `prices`/`index_prices` tables via `DATE_TRUNC('week', Date)` +
`ARGMAX`, fetching `RS_PRICE_SMA_LONG_WEEKS + 2` (32) extra weeks of history *before* the momentum window's
start purely so SMA30 already has a value at the first displayed (in-window) point, and the series returned
is trimmed to start exactly at that window's start (M-14 or M-11) through to `ref_date`. `prices` retains a
rolling `--lookback-months` window — **22 by default** (bumped up from an original 15; see
`fetch_data.py --lookback-months` below), specifically so the ~14-month momentum window still leaves a real
~7-8-month buffer in front of `start_date` for SMA30 to warm up in — before this bump, the momentum window
alone (~14 months) nearly exhausted the entire retained 15 months, leaving `sma10_pct`/`sma30_pct` (and the
Mansfield oscillator below) `null` for a chunk of the displayed weeks. A `prices` table written under the
old 15-month retention won't retroactively have the deeper history the new default expects — see
`_prices_history_is_shallow()`/the one-time full re-bootstrap it triggers, under `fetch_data.py` below.

A GLB (Green Line Breakout, Dr. Eric Wish) reference line was tried here and then removed: even the current
~22-month `prices` retention isn't deep enough for a "highest price reached" computed from the retained
data to actually correspond to a stock's real, often multi-year, prior high the way TradingView shows it —
the line (and an ATH/confirmed status derived from it) diverged from reality rather than being a trustworthy
signal, so don't reintroduce it without first fixing the underlying retention-window limitation.

`weekly_chart` also carries a full, mechanized **Weinstein stage classification** for every displayed week
(`stage`/`signal`/`volume`/`volume_ratio`/`stop_level_pct`/`base_count`, plus a `current_stage` convenience
field) — `_compute_weinstein_stage_series()` in `run_query.py`. This is a deliberate, documented
simplification of the book's discretionary method ("Secrets for Profiting in Bull and Bear Markets"), not a
literal transcription of it (the book's own text was never available to build this — the methodology comes
from well-established, public trading knowledge plus book diagrams the user shared directly, see also the
"book file" question below).

**Version history matters here**: a first version of this classification identified breakouts purely from a
crossing of SMA30 and had one flat exit rule ("price below SMA30"). After the user showed the actual book
diagrams (a bottoming base with a **resistance zone**, a "1st/2nd/3rd base" sequence within a Stage 2 advance,
and a dedicated "Trailing Stop Loss — Weekly Chart" diagram with a progressively-raised stop), that version
was replaced with a second version (below) that detected a base as "closes over the trailing 8 weeks stay
within a 15% range" — too coarse a simplification of what a real base looks like, but good enough to get the
rest of the stage/signal/stop-loss machinery working. Once the user pointed out that a real base should be a
proper **Darvas box** (Nicolas Darvas, *How I Made $2,000,000 in the Stock Market*) — closing prices only, a
box top confirmed after a fixed number of weeks *without* a new high, a box bottom confirmed the same way
*after* the top — that second version was replaced by the one described below. Read this section, not the
git history, for the current design.

**Base/resistance detection = a real Darvas box** (the mechanism entries are built on), tracked continuously
week-to-week by a small state machine in `_compute_weinstein_stage_series()` (`SEEKING_TOP` → `SEEKING_BOTTOM`
→ `BOXED` → back to `SEEKING_TOP` on breakout or breakdown), using closing prices only — **not** High/Low
OHLC, matching Darvas's own method rather than a "true" chartist's swing-high/swing-low box:
  - **`SEEKING_TOP`**: track the highest close since the last breakout/breakdown. Every *strictly higher*
    close resets the candidate and a "weeks since new high" counter to 0; `DARVAS_BOX_CONFIRM_WEEKS` (3)
    weeks *without* a new high confirms that candidate as the box's top and moves to `SEEKING_BOTTOM`.
  - **`SEEKING_BOTTOM`**: same idea downward, tracking the lowest close since the top was confirmed. A close
    *back above* the confirmed top before the bottom itself confirms means the "box" wasn't real yet — the
    top candidate wasn't actually a peak, so this restarts `SEEKING_TOP` from that week instead of forcing a
    premature box. Otherwise, `DARVAS_BOX_CONFIRM_WEEKS` weeks without a new low confirms the bottom — the
    box is now complete (both edges known) and moves to `BOXED`.
  - **`BOXED`**: the box holds as long as price stays inside it. A close **above** the top is a **breakout**
    (closes this box, immediately starts tracking a new, higher one from that same week — Darvas boxes stack
    upward as a stock makes new highs). A close **below** the bottom is a **breakdown** (the box didn't hold;
    no breakout, restart `SEEKING_TOP` from that week — no separate "minimum gap between bases" constant is
    needed any more, since the box's own top+bottom confirmation cadence already enforces one).

This intentionally does **not** use a multi-year high/support (a `resistance above the prior ATH`) — same
reasoning as the removed GLB line above: the rolling ~22-month `prices` retention can support a box that
spans several months to just under two years, not a genuine multi-year one. It also does **not** require
High/Low OHLC data (unlike the buying-volume CLV split below, which does use it) — Darvas himself worked
from closing prices only, and a
close-only box is simpler to reason about and test than one requiring confirmed intraday/daily swing
extremes. Relative strength vs. the index is still deliberately excluded from the classification itself
(rejected earlier as too hard to implement reliably) — the index stays a plain comparison line on the chart,
unchanged.

Each base is exported once, at the week it gets consumed by a breakout, as a `base_event`
(`base_start_idx`/`base_end_idx`, `resistance`/`support` — the confirmed box top/bottom — `base_count`,
`kind`) — this is what `compute_relative_strength_chart()` turns into the `bases` list (`start_date`/
`end_date`/`resistance_pct`/`support_pct`/`base_count`/`kind`, rebased to the same `close0`-relative % as
`close_pct`) that the frontend draws as rectangles (see `renderRelativeStrengthChart()` below). `kind`
distinguishes the two flavors of base shown in the book's diagrams: `"stage1"` is a genuine bottoming base —
one that actually formed *after* a real Stage 4 decline — versus `"stage2"`, which is every other base:
continuation bases within an already-running Stage 2 advance (2nd/3rd/4th base, "pyramiding" entries), *and*
a first base whose breakout wasn't preceded by a real Stage 4 (e.g. a re-breakout straight out of a Stage 3
top that never fully rolled over into a decline) — treated as a continuation rather than a fresh bottom, per
the same book logic (a `saw_stage4` flag, set on every week actually classified `"4"` and consumed/cleared
the moment a fresh `ENTRY_2A` base is recorded, tracks this).

**Stages**, derived from that breakout signal plus price's position/slope relative to SMA30:
  - **Stage 1** (base): price near/below a not-yet-broken-out base, or (cautiously) above SMA30 while SMA30
    is still falling — not a confirmed advance yet.
  - **Stage 2A** (fresh breakout): the first base breakout since the stock was last *not* in Stage 2.
  - **Stage 2B** (continuation): every subsequent base breakout while already in Stage 2 — the book's
    "1st base / 2nd base / 3rd base..." sequence within one advance (secondary/"pyramiding" entries).
  - **Stage 3** (topping): price dips back under SMA30 after an advance, before SMA30 itself turns down
    (distribution).
  - **Stage 4** (decline): price under a falling SMA30.

**Trailing stop-loss** (`stop_level`, rebased to `stop_level_pct` in the exported chart data the same way
`close_pct` is — same close0 base — so it can be drawn as a line on the price chart): mirrors the book's own
"Trailing Stop Loss — Weekly Chart" diagram.
  - On `ENTRY_2A`: stop = `min(SMA30, breakout base's low)` — below both the whole base and the rising MA
    ("the stop loss should remain below the rising 30-week MA and each significant weekly swing low").
  - On each later base breakout (`ENTRY_2B`/`ENTRY_2B_LATE`): the stop is a *candidate* to raise to
    `min(SMA30, new base's low)`, but it is only actually raised — and only then — once price has already
    moved back within `STAGE_STOP_NEAR_HIGH_PCT` (3%) of the run's swing high since the last raise ("don't
    raise your stop loss until the price moves back near to the prior swing high of the most recent
    advance"). The stop is only ever raised or held, never lowered.
  - `base_count` tracks which base number this is within the current Stage 2 run; from `STAGE_LATE_BASE_
    WARNING_COUNT` (4) onward the entry signal becomes `ENTRY_2B_LATE` instead of `ENTRY_2B` — "4th & 5th
    bases within the Stage 2 advance are more prone to failure. So watch for warning signs."
  - `WARNING_MA_SLOWING` fires once per Stage 2 run, the first week SMA30's own slope (still positive/rising)
    falls under `STAGE_MA_SLOWDOWN_RATIO` (0.5x) of its own peak slope during that run — "30 week MA starting
    to lose momentum. Tactic change to more aggressive SL placement." It is a warning, not an exit.
  - `EXIT_STOP` fires the week price actually closes below the current `stop_level` — "Exit Trade: Stop Loss
    hit as price breaks below support." Firing it resets all run state (`stop_level`/`base_count`/etc. back
    to `None`/0) so the next fresh base breakout starts a clean new run.

**Volume confirmation reads BUYING volume, not total volume** — this is a deliberate refinement made after
the first version used raw `SUM(Volume)`: every trade has a buyer and a seller, so a high-total-volume week
can just as easily be heavy *distribution* (selling) as accumulation, and a breakout should be confirmed by
buying pressure specifically, not by how many shares merely changed hands. `_weekly_close_series(...,
include_buying_volume=True)` computes, per DAY (then sums to the week — more accurate than computing it once
off the aggregated weekly bar), a **Close Location Value** split — the same idea behind Chaikin's
Accumulation/Distribution Line: `buying_share = ((Close-Low) - (High-Close)) / (High-Low)`, rescaled to
`[0,1]` as `(CLV+1)/2`, so a close near the day's high counts most of that day's volume as buying pressure
and a close near the low counts most of it as selling; `High <= Low` or missing High/Low (old pre-migration
rows, see above) falls back to a neutral 50/50 split so `buying_volume` is never `None` and roughly sums to
`Volume`. `ENTRY_2A` requires weekly *buying* volume `>= STAGE_BREAKOUT_VOLUME_RATIO` (1.5x) the trailing
`STAGE_VOLUME_LOOKBACK_WEEKS` (10) average of buying volume — without it the stage is still called 2A but no
entry signal fires. `ENTRY_2B`/`ENTRY_2B_LATE` accept a softer `STAGE_PULLBACK_VOLUME_RATIO` (1.2x) of the
same buying-volume series, or no volume data at all. This is a real, honest approximation, not order-flow/tape
data (yfinance's OHLCV has no per-trade direction) — documented as such on `edukacja.html`. Exported fields:
`volume` (total, `SUM(Volume)` per week — still the bar's total height) and `buying_volume`/
`buying_volume_ratio` (the CLV-derived buying portion and its ratio to trailing average) for every week
regardless of confirmation, so the frontend can render a split bar (buying vs. `volume - buying_volume` as
selling) rather than a single flat-colored one.

All of the above shares the exact same history-buffer dependency already documented for `sma10_pct`/
`sma30_pct` above: every field is `None` until SMA30 (and, separately, `STAGE_VOLUME_LOOKBACK_WEEKS`/
`STAGE_BASE_LOOKBACK_WEEKS` weeks of volume/price history) are available. With the ~22-month `prices`
retention (see above) this is now rare in practice for the primary M-14 window — there's a real buffer in
front of `start_date` — but it can still happen for the M-11 fallback window (less buffer to spare) or
during the one-time transition after a `--lookback-months` bump, before the full re-bootstrap it triggers
has actually completed (see `_prices_history_is_shallow()` in `fetch_data.py`).

One more thing worth knowing if you touch `compute_relative_strength_chart`: `pd.DataFrame.iterrows()`
silently coerces `None` to `NaN` in an object-dtype column (`stage`/`signal`/`stop_level`/`base_count`) when
the same row also has float columns (`close`/`sma10`/...) — a real bug hit once during development, because
a raw `NaN` (not `null`) in the exported JSON is invalid per strict JSON and `JSON.parse` in the browser would
reject the whole file. Every field read off an `in_window.iterrows()` row is therefore guarded with an
explicit `pd.notna(...)` check before being appended, even where it looks redundant.

Each leader also carries a `mansfield_chart` (`compute_mansfield_rs_chart()`) — the classic Mansfield
Relative Strength oscillator, `RSM = (RS / SMA(RS, N weeks) - 1) * 100` where `RS = stock_close /
index_close`, in **two smoothing variants plotted together**: short-term (`rsm_short`,
`RS_MANSFIELD_SHORT_WEEKS` = 13 weeks, ~3 months) and medium-term (`rsm_medium`,
`RS_MANSFIELD_MEDIUM_WEEKS` = 26 weeks, ~6 months) — two deliberately different, non-overlapping horizons
of the same signal (a short-term acceleration/deceleration can lead or diverge from the medium-term trend).
It now displays over **the exact same window as `weekly_chart`** — `start_date` (the M-14/M-2, or M-11
fallback, momentum window) through `ref_date` — taking `start_date` as a parameter exactly like
`compute_relative_strength_chart` does, and fetching its own `RS_MANSFIELD_MEDIUM_WEEKS + 2` weeks of
buffer before it so the 26-week smoothing already has a value at the first displayed point.

**Version history matters here too**: an earlier version deliberately decoupled this chart from the
momentum window — its own display range was just the last `RS_MANSFIELD_DISPLAY_WEEKS` (26 weeks, ~6
months) from `ref_date`, a completely different (and shorter) span than `weekly_chart` above it, so the two
stacked charts didn't even share an x-axis scale. That was a workaround for the same shallow-retention
problem documented throughout this section: at the original 15-month `prices` retention, the standard
52-week Mansfield smoothing on top of the ~12-14-month momentum window would have needed ~26.5 months of
price history in total, and came back empty for most of the range in production (verified against real
data: 51 of 61 weeks null for one ticker). Once `--lookback-months` was raised to 22 specifically to fix
this (and the parallel `sma10_pct`/`sma30_pct` gaps above), the full momentum-window + buffer requirement
(~14 months + 26 weeks ≈ 20 months) fit comfortably, so the short decoupled window was no longer needed and
was replaced by the current same-window design — both charts now share one x-axis scale, which is also
what makes the frontend's synced crosshair between the two panels line up correctly (see
`renderRelativeStrengthChart()`/`syncChartsCrosshair()` below).

## Frontend (`docs/`) — deployed as-is to GitHub Pages, no build step

Plain HTML/CSS/vanilla JS, a PWA (`manifest.webmanifest` + `sw.js` service worker caching the app shell,
network-first for `docs/data/*.json`). `docs/data/` is generated by `run_query.py`; since a recent change
(mirroring the already-committed `momentum_data.duckdb`, see above) it **is committed to git** too, so the
site's data survives independently of any given Pages deploy and a fresh checkout of `docs/` is
immediately servable without having to run the pipeline first. CI still regenerates and re-commits it on
every run (see CI section below) — it isn't hand-maintained.

- **`index.html` / `js/app.js`** — main dashboard. `UNIVERSES` in `app.js` (kept in sync with
  `run_query.py`'s own `UNIVERSES`) stays the full SP500/NASDAQ100/DOWJONES/WIG20/mWIG40 five — every
  universe's JSON is always loaded (`loadData()`), it drives Ctrl+K search and the RSM screener below
  regardless of what has a dashboard tab — but **SP500 and NASDAQ100 no longer have their own sidebar
  group/table/drawer tab**. `SIDEBAR_TAB_UNIVERSES = ["DOWJONES", "WIG20", "MWIG40"]` is the separate,
  smaller list that actually drives sidebar tiles (`renderSidebarTiles()`) and the per-universe drawer
  tabs — removed on the user's request once the dashboard's RSM screener (below) grew broad enough that a
  dedicated SP500/NASDAQ100 momentum table felt redundant; their momentum data is still fully computed by
  the pipeline (`UNIVERSES` unchanged there) and still fully reachable via Ctrl+K search or the RSM
  screener, just not through a dedicated tab. `jumpToTicker()` (used by Ctrl+K's `confirmCmdkSelection()`)
  guards against this: jumping to an SP500/NASDAQ100 ticker updates the chart/selection but does not try to
  switch the drawer to a tab that doesn't exist. **Global Equity Momentum has no dashboard panel/tab at
  all any more** — it moved to being the rebalance calculator's selection engine instead of a
  look-only screen (see the dedicated GEM section above and the `rebalance.html`/`rebalance.js` bullet
  below); `app.js` no longer fetches `global_equity_momentum.json`.

  **RSM (Mansfield Relative Strength) is now two separate, full dashboard tabs** — "📈 RSM Stabilne" and
  "🚀 RSM Wzrostowe" (`data-universe="RSM_STABLE"`/`"RSM_GROWTH"`) — replacing an earlier single "RSM" tab
  that only showed lightweight sidebar-tile previews plus one small, non-sortable, non-stage-filterable
  table. `classifyRsm(ticker, universe, c)` classifies a constituent from its `mansfield_chart`
  (`rsm_short`/`rsm_medium`, the same fields the chart panel plots) into **stable** (`mediumNow > 0 &&
  mediumNow > shortNow` — a durable edge over its own index without a fresh spike) or **accelerating**
  (`shortNow > mediumNow` and both smoothings have been rising for `RSM_TREND_LOOKBACK_WEEKS`, ~1 month —
  a fresh trend acceleration); a constituent can only ever land in one bucket or neither, never both.
  `combinedRsmCandidates()` runs this over **`all_constituents`** (the CALE, full qualifying universe —
  `FULL_COVERAGE_UNIVERSES`/`_build_full_universe_records` in `run_query.py` — not just today's top-decile
  selection or today's Relative Strength outperformers) for all 5 universes and merges into `{stable,
  accelerating}`, each sorted by its own defining metric (`mediumNow`/`shortNow` descending). Each of the
  two new tabs is a real sortable table (`<th data-key="...">` on `ticker`/`universe`/`sector`/`price`/
  `shortNow`/`mediumNow`/`trend`, reusing the generic `compareRows()`) with its own "Etap" column
  (`stageCellHtml()`, now reading `current_stage` — added onto `classifyRsm`'s return value alongside the
  existing RSM fields) **and** the same stage-filter bar as the per-universe tables (see below) — this is
  exactly what the user asked for when requesting the split ("dzięki temu mógłbym filtrować po kolumnach").
  `renderRsmScreenerTable(kind)` is the shared implementation behind both tabs (`renderRsmStableTable`/
  `renderRsmGrowthTable`); rows carry their own real `universe`, so clicking one still calls
  `selectTicker(ticker, universe)` exactly like every other table — the whole chart-rendering pipeline
  below is completely unaware that a click came from an RSM tab rather than a per-universe one.

  The per-universe momentum table (`renderTable()` — `added_tickers`/`dropped_tickers` are exported in the
  JSON but not currently rendered) carries an "Etap" (Stage) column (`stageCellHtml()`, reading
  `constituent.weekly_chart.current_stage`) and a **stage filter bar** above it (`#stageFilterBar`,
  `initStageFilter()`/`matchesStageFilter()`) — "Wszystkie" (all), "Etap 1", "Etap 2" (matches *both* `2A`
  and `2B` — a user thinks of Stage 2 as one thing, not two), "Etap 3", "Etap 4". Since the RSM
  Stabilne/Wzrostowe tabs also cover full universes with a real `current_stage` per row, the stage filter
  bar is now shown for those two tabs too (previously hidden for the single old RSM/GEM tabs, which were
  already-filtered, differently-shaped lists) — `initStageFilter()`'s click handler dispatches to whichever
  table is currently active (`renderActiveDrawerTable()`) rather than always calling `renderTable()`.
  `state.stageFilter` persists across all drawer tabs. The drawer meta line reports `N z M spółek (etap
  ...)` when a filter is active, and the empty-state row distinguishes "no data at all" from "no
  constituent matches this stage". The chart area is
  split into two tabs (`#chartViewTabs`/`initChartViewTabs()` in `app.js`): **"📊 Wykres własny"** (default) —
  the own weekly stage-analysis chart described below, with a single `#openTvBtn` button ("📈 Otwórz w
  TradingView ↗", `initOpenTvButton()`) that opens the *full* tradingview.com chart page for that ticker in a
  new tab (`tvUrlFor()`, built from `tvSymbolFor()` — `https://www.tradingview.com/chart/?symbol=...`) — and
  **"🏢 Dane spółki (TradingView)"** — a full, 1:1 recreation of TradingView's own official "build a page"
  tutorial layout (`tradingview.com/widget-docs/tutorials/iframe/build-page/demo/`, at the user's explicit
  request), stacking free `s3.tradingview.com/external-embedding/embed-widget-*.js` widgets top to bottom —
  Ticker Tape (a fixed benchmark list: `AMEX:SPY`/`NASDAQ:QQQ`/`AMEX:DIA`/`GPW:WIG20`, independent of the
  selected ticker), Symbol Info, **Advanced Chart**, Company Profile, Financials, then a bottom row (Technical
  Analysis + a symbol-scoped news Timeline) side by side — see `TV_PAGE_WIDGETS`/`TV_PAGE_WIDGETS_ROW`/
  `renderTvOverviewPanel()`. Advanced Chart is deliberately back here even though it (as a *different*,
  standalone widget instance) was tried once before on the main chart panel and removed — that removal was
  specifically because adding a *compare* symbol to it could hit free-tier account limits; this instance's
  config never adds a compare symbol, so that failure mode doesn't apply. Since an embedded widget's `<script>`
  has no API to swap its symbol live, `renderTvOverviewPanel()` tears down and rebuilds every block from
  scratch on each ticker change (and each tab switch) rather than trying to update one in place. Every ticker
  row across the dashboard's tables (the per-universe momentum tables and both RSM tables —
  `tvRowButtonHtml()`/`bindTvRowButtons()`) also carries its own small "TV" button doing the same,
  independent of selecting the row (it stops click propagation so it doesn't also call `selectTicker()`).
  The sidebar is hidden on phones in portrait (`@media max-width:640px`), so the drawer's per-universe
  tabs (`DOWJONES`/`WIG20`/`MWIG40`) plus the two RSM tabs are the only way to reach any of this on
  mobile — `showDrawerTable(universe)` dispatches on the tab key. Every ticker in the main per-universe
  exports (`docs/data/{universe}.json`'s `all_constituents`, see `process_universe`/`export_json` above)
  carries its own `weekly_chart`/`mansfield_chart` — so the own chart is available for any stock, however
  it was selected (per-universe tables, either RSM tab, Ctrl+K search). `findRsEntry()` in `app.js` looks
  a ticker up directly in `state.data[universe].all_constituents` (falling back to `.constituents` for an
  older, not-yet-migrated cached JSON) — a simple, single lookup, no separate outperformers-only
  leaderboard to check first (that leaderboard concept, `combinedRelativeStrengthLeaders()`/
  `relative_strength.json`, doesn't exist client-side any more — see the Relative Strength section above).
  Whichever record it finds becomes `state.currentRsEntry` and drives `hasRsChart` in `updateChartArea()`
  — when a ticker has no `weekly_chart` at all (e.g. one whose momentum fell back to the 9-month window
  with too little extra history), the chart panels are hidden and `#noChartMessage` is shown instead,
  pointing at the "Otwórz w TradingView" button as the fallback; that button itself is never disabled,
  since it works for every ticker regardless of chart-data availability. When shown, it's **three stacked
  Chart.js panels**
  (`renderRelativeStrengthChart()`, loaded via CDN, along with `chartjs-plugin-zoom` and
  `chartjs-plugin-annotation` — same CDN, pinned versions):
  1. The "10:30" price+SMA10/SMA30 chart, with the stock's own index level plotted alongside it on the
     *same* % axis (both rebased to 0% at the momentum window's start) so the stock's trend can be read
     directly against its index's trend — whichever line is on top is the outperformer. Darvas boxes (see
     `bases` above) are drawn directly on this chart as rectangles via `chartjs-plugin-annotation`
     (`BASE_BOX_COLORS` — purple for `"stage1"`, gray for `"stage2"`, labeled "Etap 1 (dno)"/"Baza N"), and
     the whole chart is interactive (`chartjs-plugin-zoom`: mouse wheel/pinch to zoom, drag to pan,
     `#resetZoomBtn`/`initResetZoomButton()` to reset). A `#stageBadge` above the chart shows the ticker's
     `current_stage` (`renderStageBadge()`, colored per `STAGE_COLORS`, with a one-line plain-language
     description of what that stage means).
  2. A separate, smaller **volume panel** below it (`#rsVolumePanel`/`rsVolumeChartInstance`) — weekly
     volume as a stacked bar chart (Chart.js `stack: "volume"`) split into `buying_volume` (bottom, brighter
     green when `buying_volume_ratio` clears `STAGE_BREAKOUT_VOLUME_RATIO` — this constant is duplicated
     client-side in `app.js` and must stay in sync with the same constant in `run_query.py`) and
     `volume - buying_volume` (selling, top, red), on its own fully-visible axis. Its X range is kept in
     sync with panel 1 (`syncVolumeXRange()`, called from the zoom/pan plugin's `onZoomComplete`/
     `onPanComplete` callbacks) so both panels always show the same weeks.
  3. The Mansfield RS oscillator (short-term + medium-term lines, its own separate ~6-month window, see
     above) in the shortest panel underneath. Non-interactive — its own short window doesn't need zoom/pan.

  (`.rs-chart-container` / `.rs-chart-panel` / `.rs-chart-panel-volume` / `.rs-chart-panel-small` in
  `style.css`.) **Version history**: an earlier version put entry/exit signal markers (`ENTRY_2A`/`ENTRY_2B`/
  `ENTRY_2B_LATE`/`WARNING_MA_SLOWING`/`EXIT_STOP`) and a dashed `stop_level_pct` trailing-stop line directly
  on panel 1, and volume as bars on a *hidden* secondary axis at the bottom of that same chart — removed
  after user feedback that panel 1 had too many overlapping elements (5 line datasets + 2 bar datasets +
  markers on one canvas). Signal markers and the stop-loss line are gone from the chart entirely (the
  backend still computes and exports `signal`/`stop_level_pct` per week — unused by the chart now, but cheap
  to keep and not worth a breaking schema change); volume got its own panel (2 above); Darvas boxes (1
  above) replaced markers as the visual way to see *why* a stage transition happened. **Mobile rendering
  gotcha**: each chart panel needs a CSS `min-height` of at least ~160-200px — below that, Chart.js's own
  automatic Y-axis tick/range computation degenerates (measured empirically: a canvas ≤120px tall on a
  narrow-range dataset like the Mansfield oscillator can lock onto a nonsensical fixed range like `[-100,
  100]` with a single tick instead of autoscaling to the actual data). On phones, `.charts-area` has a fixed
  `height: calc(100vh - 48px)` (see the mobile media query below) shared across the badge + 3 chart panels +
  legend text, so without generous `min-height` floors on each panel, three stacked charts plus a stage
  badge and legend can squeeze one or more panels below that threshold and render as a flat, broken-looking
  line — `.rs-chart-container` also has `overflow-y: auto` as a safety net (scroll rather than squeeze, on
  the shortest phones) since even a floor that's *usually* enough can't be a hard guarantee for every device.
  WIG20/mWIG40 are PLN-denominated and
  GPW-listed, unlike the rest (USD, NYSE/Nasdaq):
  prices render via `formatPrice()` (`$` vs `zł` by universe, `PLN_UNIVERSES`) and the TradingView symbol
  used by `tvUrlFor()`/`tvRowButtonHtml()` gets a `GPW:` prefix via `tvSymbolFor()` (tracked through
  `state.selectedUniverse`, set alongside `state.selectedTicker` in `selectTicker()`) so the "Otwórz w
  TradingView" link resolves to the correct Warsaw-listed instrument instead of clashing with an unrelated
  ticker on another exchange.
- **`rebalance.html` / `js/rebalance.js`** — rebalance calculator. All user state (holdings, exclusions,
  settings) lives in `localStorage` only — there is no backend. **There are no regions any more** — an
  earlier version split the whole page into two independent halves (`REGIONS`/`REGION_LIST`, `USA`:
  NASDAQ100+DOWJONES/USD vs. `GPW`: WIG20+MWIG40/PLN, each with its own contribution/TOP-N/suggestion
  table/Monte Carlo/equity curve/donut, DOM ids suffixed `-USA`/`-GPW`) specifically to avoid ever summing
  a PLN amount and a USD amount together. That's gone, replaced by one single flow driven by Global Equity
  Momentum (see the dedicated GEM section above): the user sets one capital contribution and one TOP N
  count; the calculator itself decides which ONE of the 5 universes to draw from. Key pieces:
  - **`gemData`** (`loadUniverseData()` fetches `docs/data/global_equity_momentum.json`, now covering all
    5 universes — see GEM section above) is the calculator's selection engine. `renderGemWidget()` renders
    a small, read-only panel (`#gemWidget` in `rebalance.html`) showing the current winner + its 12M
    return and the ranked list of all 5 — this is the direct replacement for the GEM panel that used to
    live on the dashboard (`app.js`, removed — see above): it moved here because this is where the winner
    actually matters now, not just somewhere to look at it.
  - **`selectedConstituents(topN)`** (replacing the old, per-region, per-universe
    `selectedConstituents(region, u)`) reads `universeData[gemData.winner].all_constituents` (the FULL
    qualifying universe of whichever index is this month's GEM winner, not just its current top-decile
    selection — the winner can change month to month, and TOP N is meant to track the winner's own
    momentum ranking directly), filters out manually-excluded tickers, sorts by `rank` (the same
    momentum-score ranking `get_universe_metrics` computes for every universe), and slices to `topN`.
    **`computeTargets(topN, totalCapital)`** then weights that TOP N selection by each constituent's own
    `momentum_score` (not the pipeline's `weight_pct` — deliberately: `weight_pct` is meaningless as a
    momentum signal for `EQUAL_WEIGHT_UNIVERSES`, since it's just `1/n` there, and isn't exported at all
    for tickers outside the pipeline's own current selection). This is a conscious simplification vs. the
    pipeline's own cap-weighting (`compute_weights`'s 9%/3x cap-weight logic) — one simple, consistent
    weighting rule that behaves the same for every universe regardless of how the pipeline itself weights
    it internally, in the same "don't need all that complexity" spirit as dropping the regions.
  - **Holdings and exclusions are one flat, universe-agnostic list**, exactly as before — one `holdings`
    array (ticker + shares) and one `excluded` array of tickers. `currencyOf(ticker)` (via
    `priceMap[ticker].sources`, defaulting to USD for an unrecognized ticker) replaces the old
    region-returning `regionOf` — it's used ONLY to format an individual holding-table row (price/value
    cells) in its own native currency; it has nothing to do with which universe is the active GEM winner,
    so a held position from a non-winning universe still displays correctly. `holdingsValue()`/
    `excludedValue()`/`holdingShares()`/`targetCapital()` are the (now region-less, unfiltered) views over
    that shared state.
  - **Currency-aware formatting for the calculator's own output** (suggestion table, stat-cards, Monte
    Carlo, equity curve, donut, the contribution input's unit label) all comes from **`moneyFmtFor()`**
    (no argument any more) — it picks `fmtMoneyPln` vs. `fmtMoney` from `PLN_UNIVERSES.has(gemData.winner)`,
    i.e. from whichever universe currently wins GEM, not from a region. `moneyFmtForCurrency(currency)` is
    the separate, explicit-currency formatter used for holdings-table rows (via `currencyOf`), since those
    can span both currencies at once even though the calculator's own suggestion output never does.
  - A held position whose own universe is not the current GEM winner is flagged in the suggestion table as
    "poza aktywnym indeksem GEM (obecnie: ...)" rather than "poza TOP N" — it isn't that it fell out of a
    ranking, it's that its whole universe isn't the one being drawn from this month.
  - The "Wynik historyczny" equity-curve panel no longer blends multiple universes by TOP-N-derived weight
    share (`universeWeightSharePct`/`blendEquityCurves` are gone) — with only ever one active universe,
    it's simply that universe's own `docs/data/equity_curve.json` entry, unblended.
  - `parseXtbOpenPositions()` imports an XTB "Open Positions" `.xlsx` export via SheetJS
    (`XLSX.read`, loaded from a CDN in `rebalance.html`) as a one-shot replacement of the holdings list —
    unchanged by any of the above.
  - A client-side Monte Carlo simulation (`simulateMonteCarlo`, Chart.js) projects the portfolio's value
    using the capital-weighted average momentum (capped at ±30%/yr) and volatility of the currently
    targeted TOP N names — explicitly labeled as illustrative, not a forecast; unchanged in spirit, just
    run once instead of once per region.
- **`edukacja.html`** — static, JS-free educational write-up of Stage Analysis in Polish: the 4-stage cycle
  (with a colored `.edu-cycle` diagram matching `STAGE_COLORS` from `app.js`), the role of SMA10/SMA30 and
  the base/resistance breakout mechanism, volume confirmation, the trailing stop-loss rules, the two warning
  signals, a practical "how to use this dashboard" walkthrough (stage filter, the chart, the TradingView
  button), and — deliberately — a section on what this implementation simplifies away from the book (shallow
  price history, relative strength excluded from the stage engine) so the reader can calibrate trust rather
  than take the tool's output as gospel. Written prose, not reference docs — exists because a user asked to
  actually learn the method, not just see it applied. Linked from every page's topbar `<nav>`. Uses `.edu-*`
  CSS classes on top of the existing `.rebalance-page`/`.panel-card` layout (`style.css`) rather than
  `.panel-card h3`'s tiny all-caps settings-label style, which doesn't fit long-form paragraphs.

## Commands

```bash
pip install -r requirements.txt   # NOTE: this file is UTF-16-encoded; edit with a UTF-16-aware tool
                                   # or regenerate it, don't hand-append plain-ASCII lines

python fetch_data.py [--lookback-months N] [--min-coverage 0.8]   # refresh prices (bootstrap or incremental) + index composition
python run_query.py [--ref-date YYYY-MM-DD] [--min-trading-days 150] [--max-staleness-days 10] [--docs-dir docs]
                                   # compute momentum + regenerate docs/data/*.json

python fetch_data.py --indices-only   # daily_gem.yml only: refresh index_prices (^NDX/^DJI from yfinance;
                                   # WIG20/mWIG40 synthetic level rebuilt from last-known constituent prices,
                                   # not fetched — see Global Equity Momentum section), skip constituents
python run_query.py --gem-only        # daily_gem.yml only: regenerate global_equity_momentum.json only

python fetch_data.py                  # weekly_charts.yml: SAME full fetch as main.yml (not --indices-only)
python run_query.py --charts-only     # weekly_charts.yml: refresh ONLY current price + weekly_chart/
                                   # mansfield_chart for each ticker in the LAST already-saved monthly
                                   # portfolio_history selection (+ all_prices.json) — selection/weights/
                                   # portfolio_history stay untouched, see Pipeline architecture above

pytest                            # unit tests (tests/test_fetch_data.py, tests/test_run_query.py)
ruff check .                      # linter
```

To sanity-check changes to the frontend, open `docs/index.html` / `docs/rebalance.html` directly (or
serve `docs/` with any static file server) — `docs/data/*.json` is committed to git (see above), so this
works straight off a checkout even without running the pipeline; run the pipeline first only if you need
genuinely fresh numbers.

## CI (`.github/workflows/`)

- **`main.yml`** — runs monthly (`cron: '0 6 1 * *'`), on push to `main`, and manually. Installs
  `requirements.txt`, runs `fetch_data.py` then `run_query.py` against the persisted DuckDB file (see
  above), then **commits `momentum_data.duckdb` and `docs/data/*.json` back to the repo**
  (`contents: write` permission; the commit message ends in `[skip ci]` to avoid re-triggering itself via
  the `push: main` trigger) before deploying `docs/` to GitHub Pages.
- **`daily_gem.yml`** — runs daily (`cron: '30 22 * * *'`) and manually. Unlike `main.yml`, does **not**
  run the full constituent pipeline: `fetch_data.py --indices-only` refreshes just `index_prices` (4
  symbols), then `run_query.py --gem-only` regenerates only `docs/data/global_equity_momentum.json` and
  `docs/data/relative_strength.json`. Since `docs/data/` is git-tracked (see above), the checkout at the
  start of the job already has the other `docs/data/*.json` files (`nasdaq100.json`, `dowjones.json`,
  `wig20.json`, `mwig40.json`, `all_prices.json`, `equity_curve.json`) from the last full `main.yml` run —
  no need to fetch them from anywhere else before uploading `docs/` as the Pages artifact, so the deploy
  never replaces the whole live site with just the two regenerated files. (An earlier version of this
  workflow curled those files from the *currently published* Pages site instead, back when `docs/data/`
  was gitignored and a `--gem-only` checkout wouldn't have had them; that workaround is gone now that the
  checkout itself carries them.) Also commits `momentum_data.duckdb` plus the two regenerated JSON files
  back (same `[skip ci]` convention as `main.yml`, to avoid triggering a full monthly run on every daily
  push).
- **`weekly_charts.yml`** — runs weekly (`cron: '0 7 * * 6'`, Saturday mornings) and manually. Unlike
  `daily_gem.yml`, this one DOES run the full `fetch_data.py` (not `--indices-only` — real per-constituent
  price data, hundreds of yfinance tickers, same call as `main.yml`), then `run_query.py --charts-only`
  (see Commands above / Pipeline architecture above) to refresh only prices + `weekly_chart`/
  `mansfield_chart` for the already-saved monthly selection, plus `docs/data/all_prices.json`. It
  deliberately does **not** call the full `process_universe()`/selection path, `export_equity_curve()` (its
  output only changes when a NEW `portfolio_history` snapshot is written, which only happens monthly — so
  recomputing it weekly would just reproduce the same numbers), or `export_global_equity_momentum()`/
  `export_relative_strength()` (already handled independently by the daily `daily_gem.yml` path). Commits
  `momentum_data.duckdb` plus `docs/data/*.json` back (same `[skip ci]` convention, to avoid triggering
  `main.yml`'s full monthly rebalance on every weekly push) before deploying `docs/` to GitHub Pages, same
  as the other two workflows. Exists because `fetch_data.py` alone never regenerates `docs/data/*.json` —
  only `run_query.py` does — so a weekly `fetch_data.py` run by itself would not have made the dashboard's
  SMA10/30, Darvas boxes, Mansfield oscillator, or RSM screener any fresher without this second step; the
  `07:00 UTC` Saturday schedule (a weekend morning, matching the user's preference) was picked to fall
  well clear of `daily_gem.yml`'s `22:30 UTC` daily run and `main.yml`'s `06:00 UTC` monthly run, avoiding
  avoidable overlap on the shared `"pages"` concurrency group (a genuine overlap isn't fatal — the group
  just serializes the deploys — but avoiding it means neither run waits on the other). GitHub Actions cron
  is always evaluated in UTC with no daylight-saving shift, so this lands at 08:00 Polish time in winter
  (CET) and 09:00 in summer (CEST).
- **`tests.yml`** — runs `pytest`/`ruff` (Python) and an ESLint check (`docs/js/*.js`, Node-only tooling,
  no effect on the deployed site) on pushes/PRs.
