# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A momentum-investing tool for SP500, NASDAQ100, DOWJONES, WIG20, and mWIG40: a Python pipeline computes
an S&P-style Momentum Index selection/weighting for each universe and publishes the results as a static
dashboard (`docs/`) to GitHub Pages. There is a second page (`rebalance.html`) that lets a user paste in
their current brokerage holdings (or import an XTB export) and get buy/sell suggestions to move toward
the computed target weights. SP500 is a momentum + relative-strength screener universe only — it is
**not** wired into the rebalance calculator (`rebalance.js`'s `REGIONS` doesn't reference it) — it was
brought back specifically as a screener (see below), not to resume rebalancing against it. WIG20/mWIG40
**are** wired into the rebalance calculator, but as their own separate region, not merged with NASDAQ100/
DOWJONES: `rebalance.js`'s `REGIONS` splits the whole calculator into two fully independent halves — `USA`
(NASDAQ100 + DOWJONES, USD) and `GPW` (WIG20 + MWIG40, PLN) — each with its own contribution amount, own
TOP N picker per index, own suggestion table, own Monte Carlo simulation, own historical-equity-curve
chart, and own portfolio-analysis donut chart. This sidesteps the FX problem that originally kept WIG20/
mWIG40 out entirely (mixing a PLN-denominated capital bucket into a USD-denominated allocation/weighting
pool would need an FX rate this tool doesn't fetch): nothing ever sums a PLN amount and a USD amount
together, because the two regions never share a capital pool, only the underlying holdings list and
exclusion list (both currency-agnostic — see `rebalance.js` below). A position in any of the five
universes is still priced correctly via `docs/data/all_prices.json`, which is universe-agnostic, if
pasted into holdings — `regionOf(ticker)` (in `rebalance.js`) then buckets it into USA or GPW for display
and rebalancing purposes based on which universe(s) its price was sourced from.

SP500 was removed once (dashboard, rebalance calculator, GEM, all pipeline tables/data) because the user
held a dedicated S&P 500 ETF elsewhere and didn't need this tool tracking it too — then brought back
later, once the tool grew the Weinstein stage-analysis 10:30/Mansfield charts, specifically to get those
charts and the Relative Strength screener for S&P names, **not** to resume rebalancing against it. So
this second pass is deliberately narrower than the original: SP500 is back in `UNIVERSES` (full
momentum selection/weighting, its own dashboard tab) and `RELATIVE_STRENGTH_UNIVERSES` (screener + 10:30/
Mansfield charts) — but it stays **out** of `GEM_UNIVERSES` (Global Equity Momentum keeps comparing only
NASDAQ100/DOWJONES, unchanged from before this second pass) and **out** of `rebalance.js`'s `REGIONS` (see
above) — unlike WIG20/mWIG40, which did later get wired into `rebalance.js` as their own `GPW` region.
`CSPX_holdings.csv` (iShares Core S&P 500 UCITS ETF
holdings, same format/convention as `CNDX_holdings.csv`/`CIND_holdings.csv`) was restored from git
history (the exact file present right before the original removal) as the starting holdings snapshot —
replace it by hand like the other two CSVs when the index composition changes.

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
   - `update_earnings()` fetches quarterly earnings history (report date, consensus EPS estimate, reported
     EPS, surprise %) into the `earnings` table (PK `(Ticker, Report_Date)`) — feeds the EPS chart in
     `run_query.py` (`compute_eps_chart`), styled after MarketSmith/IBD's EPS line. Unlike prices, yfinance
     has **no batched call** for this — `yf.Ticker(symbol).get_earnings_dates()` is one network request
     per ticker, so this is `len(tickers)` sequential requests with a short sleep between them
     (`EARNINGS_FETCH_SLEEP_SECONDS`), noticeably lengthening the monthly full run; `--skip-earnings` skips
     it entirely (e.g. for a quick local pipeline test) and `--indices-only` (the daily GEM workflow) always
     skips it regardless, since it only needs `index_prices`. Upserted **per ticker** (delete then insert
     that ticker's rows) so a ticker whose fetch fails this run keeps its previously-fetched history instead
     of losing it — same failure-tolerance convention as `prices`. Unlike `prices`, there's **no rolling
     retention/trim** here: the table is tiny (a handful of rows per ticker) and, unlike price history, more
     history is exactly what the EPS chart wants (multi-year context, like MarketSmith/IBD show) rather than
     something to bound. Each ticker's fetch keeps every historical row with a `Reported EPS` value, plus —
     separately — only the single *nearest upcoming* row that has an estimate but no report yet (Yahoo
     publishes the next scheduled earnings date/consensus ahead of time); older/farther future rows
     `get_earnings_dates()` may also return are dropped, since only the next date is surfaced on the
     dashboard (`next_earnings_date`/`next_eps_estimate`).
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
   - Reference date defaults to `MAX(Date)` in the `prices` table; pass `--ref-date YYYY-MM-DD` to
     recompute for a specific historical date.
   - Also computes **Global Equity Momentum** (`docs/data/global_equity_momentum.json`) — see below.

Monthly (not semi-annual, as the official S&P 500 Momentum index does) rebalancing is an intentional
choice here — it matches the cadence used in most academic momentum-return literature — not an attempt
at a literal 1:1 replication of S&P's own rebalance calendar.

### Global Equity Momentum (`compute_index_returns` / `compute_index_leaders`)

Compares the **index level** (not constituents) of NASDAQ100/DOWJONES (`GEM_UNIVERSES` — deliberately
**not** SP500/WIG20/mWIG40, see below) against each other over a trailing `GEM_LOOKBACK_MONTHS` (12)
window — the classic dual/global-momentum idea of picking whichever market currently has the strongest
trend. SP500 stays out of `GEM_UNIVERSES` even though it (unlike WIG20/mWIG40) has full yfinance history
and could technically join: it was brought back specifically as a momentum + Relative Strength screener
universe (see "What this repo is" above), and widening the GEM race was never asked for, so `GEM_UNIVERSES`
stays exactly `["NASDAQ100", "DOWJONES"]`, unchanged since before SP500 came back.
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
reads `index_prices` — filtered to `GEM_UNIVERSES` only — and returns each universe's return over the
window, sorted descending; the top one is the `winner`. SP500/WIG20/mWIG40 price data still lands in
`index_prices` (needed for their own Relative Strength, below) but is excluded from this specific
cross-market race by that filter, so adding any of them didn't silently change who can win Global Equity
Momentum — and WIG20/mWIG40's synthetic (not real-index) nature is one more reason they in particular
should stay out of that race.

For the winner, `compute_index_leaders()` finds the top `GEM_TOP_N` (10) constituents that are actually
**pushing the index to its new highs** — ranked by *contribution to the index's return*
(`weight_in_index_pct * return_pct`, where the weight is the constituent's `fmc_etf` share of the
winning universe and the return is computed over the *same* window as the index return), not by raw
momentum score — a small-cap mover with an extreme return but negligible index weight should not outrank
a mega-cap that is dragging the whole index up. `export_global_equity_momentum()` writes both the ranked
index list and the winner's leader list to `docs/data/global_equity_momentum.json`.

Unlike the main constituent-selection universes (`UNIVERSES`), GEM is refreshed **daily**, not monthly (`daily_gem.yml`, see CI
section) — so `export_global_equity_momentum()`'s `ref_date` is *not* threaded through from the
constituent-price pipeline's `ref_date` (that only moves once a month). When called with `ref_date=None`
(the default), it derives its own from `MAX(Date)` in `index_prices` instead, so a same-day
`fetch_data.py --indices-only` refresh is actually reflected in the output — `compute_index_leaders()`
still gracefully falls back to each constituent's last known price via `ARGMAX(... FILTER WHERE Date <=
ref_date)` even though the per-constituent `prices` table itself is only as fresh as the last monthly run.
`fetch_data.py --indices-only` and `run_query.py --gem-only` are the two flags that make this cheap daily
refresh possible without touching the (expensive, rate-limited) per-constituent price fetch.

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
`docs/data/relative_strength.json`; the frontend (`combinedRelativeStrengthLeaders()` in `app.js`) merges
all universes into one ranked list for display, tagging each row with its own currency-aware price
formatting (`formatPrice()` — WIG20/mWIG40 render `zł`, the rest `$`). Like GEM, its `ref_date` defaults
to `index_prices`'s own
watermark (not the monthly constituent-pipeline `ref_date`), and it's recomputed by the same
`run_query.py --gem-only` daily path as GEM (see `daily_gem.yml`) since it only needs `index_prices`
(daily) + `prices`/`index_constituents` (gracefully stale-tolerant, same as `compute_index_leaders`).

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

Each ticker (not just Relative Strength leaders — same "every constituent gets one" pattern as
`weekly_chart`/`mansfield_chart`, see `process_universe`) also carries an `eps_chart`
(`compute_eps_chart()`) — a MarketSmith/IBD-style EPS chart: the line of **reported EPS** across recent
quarters, with each reported quarter tagged `beat` (`Reported EPS > EPS Estimate`, `None` when Yahoo has no
consensus for that quarter — common for less-covered names) so the frontend can color-code it (see
`renderEpsChart()` below). Deliberately **not** clipped to the momentum window like `weekly_chart`/
`mansfield_chart` — earnings are quarterly (4/year), so a 12-14 month momentum window would only ever show
4-5 points; `EPS_CHART_MAX_QUARTERS` (12, ~3 years) instead gives the multi-year context MarketSmith/IBD
charts are known for, independent of `start_date`. Also independent of `index_prices`/`compute_index_momentum`
entirely (unlike every other per-ticker chart here) — it's computed straight off the `earnings` table, so it
populates even when `index_mom` comes back `None` (e.g. before `index_prices` has any rows for that universe
yet). Returns `None` when the `earnings` table doesn't exist yet (a checkout/DB predating this feature) or
the ticker has no reported rows in it (yfinance coverage gap, or genuinely no earnings history yet). Also
carries `next_earnings_date`/`next_eps_estimate` — the nearest *upcoming* scheduled report Yahoo already
publishes an estimate for, `None` when unknown — surfaced as a small "next earnings" caption above the chart.

## Frontend (`docs/`) — deployed as-is to GitHub Pages, no build step

Plain HTML/CSS/vanilla JS, a PWA (`manifest.webmanifest` + `sw.js` service worker caching the app shell,
network-first for `docs/data/*.json`). `docs/data/` is generated by `run_query.py`; since a recent change
(mirroring the already-committed `momentum_data.duckdb`, see above) it **is committed to git** too, so the
site's data survives independently of any given Pages deploy and a fresh checkout of `docs/` is
immediately servable without having to run the pipeline first. CI still regenerates and re-commits it on
every run (see CI section below) — it isn't hand-maintained.

- **`index.html` / `js/app.js`** — main dashboard: sidebar of top-10 tickers per universe (`UNIVERSES` in
  `app.js`, kept in sync with `run_query.py`'s own `UNIVERSES` — currently SP500/NASDAQ100/DOWJONES/
  WIG20/mWIG40) plus a sidebar group for **Global Equity Momentum** (`docs/data/global_equity_momentum.json`,
  `renderGemPanel()` — shows the winning index + its return, a ranked list of the (US-only) indices'
  returns, and tiles for the winner's top-10 contribution leaders), a full sortable constituents table per
  universe (`renderTable()` — `added_tickers`/`dropped_tickers` are exported in the JSON but not currently
  rendered), and a Ctrl+K command-palette ticker search. That per-universe table also carries an "Etap"
  (Stage) column (`stageCellHtml()`, reading `constituent.weekly_chart.current_stage`) and a **stage filter
  bar** above it (`#stageFilterBar`, `initStageFilter()`/`matchesStageFilter()`) — "Wszystkie" (all),
  "Etap 1", "Etap 2" (matches *both* `2A` and `2B` — a user thinks of Stage 2 as one thing, not two), "Etap 3",
  "Etap 4"; `state.stageFilter` persists across universe tabs but the bar itself is hidden for the GEM/RS tabs
  (`showDrawerTable()`) since those are already-filtered, different-shaped lists, not a full per-universe
  constituent table. The drawer meta line reports `N z M spółek (etap ...)` when a filter is active, and the
  empty-state row distinguishes "no data at all" from "no constituent matches this stage". There is
  **no embedded TradingView chart widget** —
  it was tried and then removed in favor of always showing the own weekly stage-analysis chart (below) for
  whichever ticker is selected, with a single `#openTvBtn` button ("📈 Otwórz w TradingView ↗",
  `initOpenTvButton()` in `app.js`) that opens the *full* tradingview.com chart page for that ticker in a new
  tab instead (`tvUrlFor()`, built from `tvSymbolFor()` — `https://www.tradingview.com/chart/?symbol=...`) —
  no `s3.tradingview.com` widget script is loaded at all any more. Every ticker row across the dashboard's
  tables (the main per-universe table, the GEM table, the RS table — `tvRowButtonHtml()`/`bindTvRowButtons()`)
  also carries its own small "TV" button doing the same, independent of selecting the row (it stops click
  propagation so it doesn't also call `selectTicker()`); plus a sidebar group for
  **relative strength** (`docs/data/relative_strength.json`, `renderRelativeStrengthPanel()` — each
  index's own return, and tiles merging SP500+NASDAQ100+DOWJONES+WIG20+mWIG40 outperformers via
  `combinedRelativeStrengthLeaders()`, sorted by edge over their index). The sidebar is hidden on phones
  in portrait (`@media max-width:640px`), so the drawer table has a "🚀 GEM" tab (`showDrawerTable()` /
  `renderGemTable()`) and a "💪 RS" tab (`renderRelativeStrengthTable()`) rendering the same lists as
  their own tables — the only way to reach them on mobile, since neither is otherwise duplicated by the
  per-universe tables. Every ticker in the main per-universe exports
  (`docs/data/{universe}.json`'s `constituents`, see `process_universe`/`export_json` above) carries its own
  `weekly_chart`/`mansfield_chart`/`eps_chart` too, not just the relative-strength panel's leaders — so the
  own chart is available for any stock, however it was selected (per-universe tables, GEM, Ctrl+K search,
  the relative-strength panel/table). `findRsEntry()` in `app.js` just looks a ticker up in its own record in
  `state.data[universe].constituents` — it used to gate on `weekly_chart` being present (returning `null`
  otherwise), but that gate was removed once `eps_chart` needed to work independently of `weekly_chart` (see
  `compute_eps_chart` above — different data source, `earnings` vs. `prices`/`index_prices`, so one can be
  present without the other). Whatever `findRsEntry()` finds becomes `state.currentRsEntry`;
  `updateChartArea()` then computes `hasRsChart` and `hasEpsChart` **separately** from it (`.weekly_chart`/
  `.eps_chart` presence) and shows/hides each chart's panels independently — when NEITHER is present (e.g. a
  ticker whose momentum fell back to the 9-month window with too little extra price history, and whose
  `earnings` table has no rows either), `#noChartMessage` is shown instead, pointing at the "Otwórz w
  TradingView" button as the fallback; that button itself is never disabled, since it works for every ticker
  regardless of chart-data availability. When `hasRsChart` is true, it's **three stacked Chart.js panels**
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

  A 4th panel, `#rsEpsPanel`/`renderEpsChart()`, renders independently whenever `hasEpsChart` is true
  (regardless of whether panels 1-3 above are shown) — the MarketSmith/IBD-style EPS chart: a line of
  `eps_reported` across quarters, each point colored green/red/gray by that quarter's `beat` flag
  (`EPS_BEAT_COLOR`/`EPS_MISS_COLOR`/`EPS_UNKNOWN_COLOR` — must stay visually distinct from, but doesn't need
  to literally match, `STAGE_COLORS`), plus a full-height dashed vertical line (`chartjs-plugin-annotation`,
  same mechanism as the Darvas boxes in panel 1) at each report date in that same color — the "pionowe kreski
  kiedy były earnings" the feature was asked for. A `#rsEpsCaption` above the canvas shows
  `next_earnings_date`/`next_eps_estimate` when known ("Najbliższe wyniki: ..."). Its x-axis is its own
  quarterly date list (`eps_chart.dates`), **not** shared with panels 1-3's weekly dates, so it is
  deliberately left out of `syncChartsCrosshair()` (a shared crosshair would highlight unrelated
  weeks/quarters against each other) and has no zoom/pan (a handful of points doesn't need it).

  (`.rs-chart-container` / `.rs-chart-panel` / `.rs-chart-panel-volume` / `.rs-chart-panel-small` in
  `style.css` — the EPS panel reuses `.rs-chart-panel-small`, same as the Mansfield panel, rather than
  adding a new CSS class.) **Version history**: an earlier version put entry/exit signal markers (`ENTRY_2A`/`ENTRY_2B`/
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
  `height: calc(100vh - 48px)` (see the mobile media query below) shared across the badge + up to 4 chart
  panels + legend text, so without generous `min-height` floors on each panel, four stacked charts plus a
  stage badge and legend can squeeze one or more panels below that threshold and render as a flat,
  broken-looking line — `.rs-chart-container` also has `overflow-y: auto` as a safety net (scroll rather
  than squeeze, on the shortest phones) since even a floor that's *usually* enough can't be a hard guarantee
  for every device.
  WIG20/mWIG40 are PLN-denominated and
  GPW-listed, unlike the rest (USD, NYSE/Nasdaq):
  prices render via `formatPrice()` (`$` vs `zł` by universe, `PLN_UNIVERSES`) and the TradingView symbol
  used by `tvUrlFor()`/`tvRowButtonHtml()` gets a `GPW:` prefix via `tvSymbolFor()` (tracked through
  `state.selectedUniverse`, set alongside `state.selectedTicker` in `selectTicker()`) so the "Otwórz w
  TradingView" link resolves to the correct Warsaw-listed instrument instead of clashing with an unrelated
  ticker on another exchange.
- **`rebalance.html` / `js/rebalance.js`** — rebalance calculator. All user state (holdings,
  exclusions, per-region settings) lives in `localStorage` only — there is no backend. The page is split
  into two fully independent regions (`REGIONS`/`REGION_LIST` — `USA`: NASDAQ100+DOWJONES/USD, `GPW`:
  WIG20+MWIG40/PLN — see "What this repo is" above for why they're kept separate rather than merged), each
  rendered as its own repeated block of panel-cards (settings, stat-cards, suggestion table, Monte Carlo,
  equity curve, portfolio-analysis donut) with DOM ids suffixed `-USA`/`-GPW` (`renderRegion(region)`,
  called for both by `renderRegions()`/`renderAll()`). Key pieces:
  - **No more manual capital-split %.** An earlier version had the user set a `settings.pct` split
    between Nasdaq/Dow (and a global `settings.maxHoldings` cap) — both were removed in favor of
    `settings.regions[region].topN[universe]`: the user just says how many top-momentum names to take
    from each index (e.g. "top 5 from Nasdaq 100, top 5 from Dow Jones"); `selectedConstituents(region, u)`
    slices the already momentum-sorted `{universe}.json` constituents list to that count (after removing
    manually excluded tickers first, so TOP N is filled from what remains). `computeTargets(region,
    totalCapital)` then merges the TOP N from every universe in that region into one pool and weights each
    ticker by its own raw `weight_pct` normalized across that whole pool (not per-universe) — an index
    whose TOP N picks currently have stronger momentum naturally gets a bigger share of the region's
    capital, with no separate % dial. `universeWeightSharePct(region)` derives the equivalent per-universe
    split (purely for weighting the "Wynik historyczny" equity-curve blend below) from that same TOP N
    selection.
  - **Holdings and exclusions are shared across both regions** — one flat `holdings` list (ticker +
    shares) and one `excluded` list of tickers, exactly as before; `regionOf(ticker)` (via
    `priceMap[ticker].sources`, defaulting to `USA` for an unrecognized ticker) is what buckets a given
    holding into the USA or GPW section for display and rebalancing math. `regionHoldingsValue`/
    `regionExcludedValue`/`regionHoldingShares` are the per-region filtered views over that shared state.
  - **Currency-aware formatting**: `fmtMoney` (USD, `$`) and `fmtMoneyPln` (PLN, `zł`, `pl-PL` locale) are
    two separate formatters — `moneyFmtFor(region)` picks the right one, threaded through every per-region
    render function (suggestion table, stat-cards, Monte Carlo axis/tooltip/caption, portfolio-analysis
    donut tooltip) and through the shared holdings table's price/value cells (via `regionOf(ticker)`) so a
    GPW position always reads in złoty even though the table itself isn't split.
  - Positions can be excluded (`excluded` list) so they're priced but never suggested for
    buy/sell — their value is carved out of the investable capital of whichever region they belong to.
  - `parseXtbOpenPositions()` imports an XTB "Open Positions" `.xlsx` export via SheetJS
    (`XLSX.read`, loaded from a CDN in `rebalance.html`) as a one-shot replacement of the holdings list.
  - A client-side Monte Carlo simulation (`simulateMonteCarlo`, Chart.js), run separately per region, projects
    that region's portfolio value using the capital-weighted average momentum (capped at ±30%/yr) and
    volatility of that region's currently targeted names — explicitly labeled as illustrative, not a forecast.
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

python fetch_data.py [--lookback-months N] [--min-coverage 0.8] [--skip-earnings]
                                   # refresh prices (bootstrap or incremental) + index composition + quarterly
                                   # earnings history (`earnings` table, feeds the EPS chart); --skip-earnings
                                   # skips only the earnings fetch (one yfinance request per ticker, no
                                   # batching — noticeably slower), for a quicker local pipeline run
python run_query.py [--ref-date YYYY-MM-DD] [--min-trading-days 150] [--max-staleness-days 10] [--docs-dir docs]
                                   # compute momentum + regenerate docs/data/*.json

python fetch_data.py --indices-only   # daily_gem.yml only: refresh index_prices (^NDX/^DJI from yfinance;
                                   # WIG20/mWIG40 synthetic level rebuilt from last-known constituent prices,
                                   # not fetched — see Global Equity Momentum section), skip constituents
python run_query.py --gem-only        # daily_gem.yml only: regenerate global_equity_momentum.json only

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
- **`tests.yml`** — runs `pytest`/`ruff` (Python) and an ESLint check (`docs/js/*.js`, Node-only tooling,
  no effect on the deployed site) on pushes/PRs.
