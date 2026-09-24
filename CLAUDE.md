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

**The rebalance calculator is fully automatic, and now exists as TWO independent pages/pools — "Rebalanser
USA" (`rebalance.html`/`rebalance.js`, SP500+NASDAQ100+DOWJONES, USD) and "Rebalanser PL"
(`rebalance_pl.html`/`rebalance_pl.js`, WIG20+MWIG40, PLN).** Its design history, oldest to newest:
1. Split into two fully independent halves — `USA` (NASDAQ100+DOWJONES, USD) and `GPW` (WIG20+MWIG40,
   PLN), each with its own contribution amount, own TOP N picker per index, own suggestion table, Monte
   Carlo, equity curve, and portfolio donut — specifically to avoid ever summing a PLN amount and a USD
   amount together (this tool doesn't fetch an FX rate).
2. Merged into a single flow with a strategy dropdown (`STRATEGY_GEM`/`STRATEGY_WEIGHTED`) that auto-picked
   TOP N constituents by momentum ranking from whichever of the (then still 5) universes it decided to draw
   from.
3. Replaced by a STEPWISE, manually-driven flow (Krok 1 — click a Global Equity Momentum row to pick which
   universe to browse; Krok 2 — manually "+ Dodaj" individual companies into an accumulating, cross-week
   `picks` list in `localStorage`), at the user's explicit request: they wanted a ~1h/week routine where
   THEY decide which companies go into the portfolio, using the dashboard's own technical data (momentum
   ranking, Weinstein stage) as input, rather than a number (TOP N) picking for them.
4. **Current design**: back to fully automatic, at a later, separate explicit request — the user found the
   manual weekly picking more upkeep than they wanted, and asked instead for one number (how many companies)
   with the rebalancer choosing which ones and at what weight. At the same time, **WIG20/mWIG40 were removed
   from the rebalancer's pool entirely** — the user monitors those two indices themselves and holds them
   through a separate ETF outside this tool. They stay fully computed and shown on the dashboard
   (`index.html`) — only the rebalance calculator stopped drawing from them. Because the pool is now always
   SP500+NASDAQ100+DOWJONES (all three USD-denominated), the currency-mixing machinery that steps 1-3 each
   needed (splitting/blending a portfolio that could span PLN and USD at once) is no longer needed for the
   calculator's own output — see below for what of it survives (for the holdings table specifically) and
   what does not.
5. **Current design: WIG20/mWIG40 got their own, separate automatic rebalancer instead of staying outside
   the tool.** A later, separate explicit request — the user no longer wanted to track WIG20/mWIG40
   manually through an outside ETF (the reasoning behind removing them from the pool in step 4) and instead
   asked for the exact same fully-automatic mechanism applied to them, as its own dedicated page. Rather
   than add a pool/currency switch to the existing rebalancer, `rebalance.html`/`rebalance.js` (renamed
   "Rebalanser USA" in the nav) was left untouched and a byte-for-byte-structural twin,
   `rebalance_pl.html`/`rebalance_pl.js` ("Rebalanser PL"), was added instead — same reasoning as step 1's
   original USA/GPW split: never sum a PLN amount and a USD amount together. The two pages share
   `js/shared.js`/`js/qol.js`/`js/table-render.js` but each has its OWN `localStorage` keys
   (`momentum_rebalance_pl_*` vs. `momentum_rebalance_*`) — two fully independent portfolios, holdings
   lists, exclusion lists, and settings, never merged. See the dedicated `rebalance_pl.html`/
   `rebalance_pl.js` bullet under Frontend below for what's genuinely different (the pool, the money
   formatter) vs. what's a deliberate 1:1 port.
6. **Current design: Rebalanser USA got a Core (60%) / Satellite (40%) split; Rebalanser PL got a
   manually-entered "favor the winning index" tilt.** A later, separate explicit request — the user wanted
   the USA portfolio built from two sleeves (a stable "core" and a faster-growing "satellite"), and the
   same underlying idea ("which index is winning right now, favor its picks") applied to PL. Full mechanism
   for each is documented in the dedicated `rebalance.html`/`rebalance.js` and `rebalance_pl.html`/
   `rebalance_pl.js` bullets under Frontend below — in short:
   - **USA**: `DOWJONES_WEIGHT_MULTIPLIER` (a flat 1.5x weight boost for every Dow pick, from step 4/
     `computeAutoTargets`) was REMOVED and replaced entirely by `CORE_ALLOCATION_PCT` (60%) — a hard
     capital split between a CORE sleeve (Dow blue chips, favoring Stage 2/confirmed-growth-phase names,
     backfilled by SP500 when Dow alone can't fill every core slot — the user's own explicit call, not Dow
     names outside Stage 2 and not leaving slots empty) and a SATELLITE sleeve (everything else, weighted
     by momentum_score, additionally tilted via `WINNER_INDEX_WEIGHT_MULTIPLIER` toward whichever of
     SP500/NASDAQ100/DOWJONES is currently winning the trailing-12-month Global Equity Momentum race).
     This is GEM's return as an actual consumer of `rebalance.js` (via `docs/data/global_equity_momentum.json`,
     fetched again after step 4 removed that fetch entirely) — not as the universe-picker it used to be in
     step 3, but as a pure weight-tilt signal inside the satellite sleeve; real yfinance data for all three
     universes means no manual entry is needed here (unlike PL, next).
   - **PL**: WIG20/mWIG40 have no equivalent real trailing-return data (yfinance has never had history for
     the WIG20.WA/MWIG40.WA index tickers themselves — see the Global Equity Momentum section below), so
     the same "favor the winner" idea needed a manually-entered number instead of an automatic GEM fetch —
     reviving the exact shape of the old, removed `GEM_MANUAL_KEY` widget (see step 3's note on it) with a
     real job this time: two Krok 1 fields for each index's trailing-12-month return, persisted to
     `localStorage`, whose higher value gets `WINNER_INDEX_WEIGHT_MULTIPLIER` (same constant/value as the
     USA side) applied to its true members' raw weight in `computeAutoTargets`. Equal or blank fields mean
     no tilt at all — identical to the pool's behavior before this feature existed.
   Both mechanisms affect WEIGHT only, never SELECTION (which companies make the pool/TOP N) — the same
   principle `DOWJONES_WEIGHT_MULTIPLIER` already established and this design carries forward unchanged.
7. **Current design: Core's "growth phase" no longer means a hardcoded Stage 2A/2B check — it means
   whatever the user has selected in the Krok 2 stage-filter bar, exactly like every other part of the
   pool.** A later, separate explicit user correction: step 6's original Core mechanism sorted
   `coreCandidateRows()` by "Stage 2A/2B first, then `momentum_score`" regardless of what (if anything) the
   user had selected in `poolStageFilter` — the user pointed out this meant Core silently applied its own,
   separate notion of "growth phase" on top of (and independent from) the filter bar they were already
   using to control the rest of the pool ("oh wait you are taking only stage 2, I was thinking that will
   take that what I select like in PL rebalanser" — "I want to select myself and from that list select core
   and satellite"). The fix removed the growth-phase tiebreak from `coreCandidateRows()` entirely (it now
   sorts Dow-then-SP500 candidates by `momentum_score` alone, same as satellite) rather than adding a
   *second* place to configure stage preference — `poolStageFilter`/`eligiblePoolRows()` (see the dedicated
   `rebalance.html`/`rebalance.js` bullet under Frontend below) already narrows the ENTIRE pool, Core
   included, to whichever Etap(s) the user has checked, before Core or Satellite ever sees it. So selecting
   "Etap 2" in the filter bar now does exactly what it already did on Rebalanser PL, and does to Satellite:
   Core only ever sees Stage-2 names too, because nothing else survives `eligiblePoolRows()` — there's no
   longer a second, hardcoded stage rule living only inside Core that the filter bar doesn't touch. Leaving
   the filter on "Wszystkie" (the default) means Core simply ranks Dow/SP500 candidates by raw
   `momentum_score`, same as before step 6 ever added a stage concept to Core at all.

The current, automatic flow of "Rebalanser USA" (`rebalance.js`) — "Rebalanser PL" (`rebalance_pl.js`)
works identically, just over WIG20/mWIG40 in PLN instead (see the dedicated bullet under Frontend below):
- **Krok 1 — settings.** The only input is `settings.portfolioSize` (TOP N — how many companies should be
  in the portfolio) plus the monthly contribution amount. Nothing else to configure; no strategy dropdown,
  no per-universe weights, no manual picking.
- **The pool** (`REBALANCE_UNIVERSES = ["SP500", "NASDAQ100", "DOWJONES"]`, `combinedPoolRows()`) is built
  from:
  - **SP500**: `constituents` — i.e. the pipeline's own top-quintile momentum selection, NOT
    `all_constituents`. This is a deliberate, and convenient, coincidence: `select_with_buffer`'s
    `target_count = min(round(TARGET_QUINTILE * n), MAX_HOLDINGS)` (see Pipeline architecture below)
    resolves to exactly 100 for SP500 (20% of ~500, capped at `MAX_HOLDINGS = 100` anyway) — the same
    "top 100 by momentum" sizing the user asked for by name ("top 100 spółek z sp500 jak w SPMO", i.e. like
    the S&P 500 Momentum Index / the SPMO ETF that tracks it) — with the buffer rule's reduced turnover as
    a bonus, at no extra implementation cost.
  - **NASDAQ100**: `all_constituents` — the user explicitly wants "cały nasdaq100" (the WHOLE Nasdaq 100),
    not just its own much smaller top-quintile selection (~20 names).
  - **DOWJONES**: `constituents` — already the whole index either way, since DOWJONES is one of
    `EQUAL_WEIGHT_UNIVERSES` (see Pipeline architecture below) and carries no quintile selection to begin
    with.
  Rows from the three are merged into one list (`combinedPoolRows()`), sorted by `momentum_score`
  descending — comparing `momentum_score` directly ACROSS universes is a deliberate simplification (each
  universe's z-score/momentum_score is its own cross-sectional computation, not literally a single unified
  ranking in the pipeline) — the same convention the picks-merging logic in the prior manual design already
  used. A ticker present in two universes at once (a large-cap can be in both SP500 and NASDAQ100) is
  deduped to a single row, keeping whichever universe's occurrence has the higher `momentum_score`, so TOP N
  always means N distinct companies, never two slots for the same one.
- **Selection and weighting are both automatic.** `eligiblePoolRows()` drops manually-excluded tickers (see
  "Wyklucz z rebalansu", unchanged from earlier designs) and re-numbers `pool_rank` so exclusions backfill
  from the next-ranked name rather than shrinking the portfolio below N. `autoSelectedRows(n)` slices the
  top N of that. `computeAutoTargets(n, totalCapital)` weights the selected N by each company's CURRENT
  `momentum_score`, normalized to `totalCapital` — the same weighting convention (one simple, consistent
  rule regardless of which universe(s) contributed) every earlier design in this history also used, still a
  deliberate simplification vs. the pipeline's own cap-weighting (`compute_weights`'s 9%/3x cap-weight
  logic).
- **Krok 2 — ranking table** (`renderPoolTable()`) is purely informational now: the full, sortable,
  stage-filterable pool (same shape as the dashboard's own tables), with a "Grupa" column showing which
  sleeve (Core/Satelita/—) each row falls into today (see the CORE/SATELLITE bullet below) — nothing here
  is clickable to change the selection, since there's nothing left to manually pick. A dedicated "📈" button
  per row still opens that company's own chart on `chart.html`, same pattern as the dashboard's own tables.
- **Nothing accumulates across weeks any more.** Unlike the manual design's `picks` (step 3 above), the
  portfolio is recomputed FRESH from `portfolioSize` and current momentum data every time the page loads —
  there is no `localStorage`-persisted list of previously-chosen companies to keep in sync. A company drops
  out of the portfolio the moment it drops out of the pool's TOP N; if you still hold it, the suggestion
  table flags it for sale (`"poza TOP {n}"`) same as it always has for a name that fell off a selection.
- **Global Equity Momentum is a consumer of this page again, but in a narrower role than steps 2-3.** From
  step 4 through most of this history, GEM played no role here at all (`rebalance.js` had stopped fetching
  `global_equity_momentum.json` entirely) — its sole earlier purpose (steps 2-3) was picking which
  universe(s) to draw from, and once the pool became fixed (SP500+NASDAQ100+DOWJONES) there was nothing left
  for it to decide. Design-history step 6 reintroduced it as a much narrower signal: `loadGemReturns()`
  fetches `global_equity_momentum.json` again (filtered to `REBALANCE_UNIVERSES`) purely to tilt WEIGHT
  inside the satellite sleeve toward whichever of the three is currently winning the 12-month race — see the
  CORE/SATELLITE bullet below for the full mechanism. It still does NOT pick which universe(s) the pool
  draws from (that stays fixed) and still has no dashboard panel. None of this ever touched the PIPELINE
  side — `run_query.py` has computed and exported GEM (across all 5 universes) unchanged throughout this
  entire history.

Because the pool is now always SP500+NASDAQ100+DOWJONES (all USD), the calculator's own outputs (ranking,
suggestion table, stats, Monte Carlo, equity curve) are always USD — `currentMoneyFmt()` is now just a
constant (`fmtMoney`), kept as a named function only so it's clear in the code *why* it's constant. The
currency-mixing machinery earlier designs needed (`deriveUniverseFractionsFromTargets()`/
`blendEquityCurves()`, for blending the equity curve across whichever universe(s) the selection spans, and
`currencyOf()`, for pricing a holding in its native currency) still exists and is still exercised — but only
because a user's **holdings** (what they actually own, tracked independently of the pool/picks and never
purged by a design change) can still include a legacy WIG20/mWIG40 position bought under an earlier design,
even though the rebalancer itself no longer selects into those universes. `holdingsMoneyFmt()` is the
formatter for the "Analiza portfela" donut specifically (which reflects actual holdings, not the pool), kept
separate from `currentMoneyFmt()` for exactly this reason.

Code comments and CLI print messages are written in Polish; keep that convention when editing existing
files (English is fine for new, unrelated code).

## Pipeline architecture (the core thing to understand)

There are two Python scripts, run in this order, all operating on a local DuckDB file
`momentum_data.duckdb`. Since a recent change, this file **is committed to git** (repo root, tracked —
not under `docs/`, so it has no effect on the GitHub Pages deployment) and persists across scheduled
runs; the single CI workflow (`weekly_full_refresh.yml`, see CI section below) commits it back after
each run. This is what keeps `portfolio_history` alive across separate weekly workflow runs, so the
buffer rule actually has a "previous rebalance" to compare against in production.

**Everything now runs on ONE cadence: weekly, in a single CI workflow.** An earlier design deliberately
split things into three separate cadences/workflows — monthly selection/weights (`main.yml`), weekly
price/chart-only refresh (`weekly_charts.yml`), and daily GEM/Relative-Strength-only refresh
(`daily_gem.yml`) — each calling a different narrow flag (`--charts-only`, `--gem-only`,
`--indices-only`) specifically to avoid re-running the expensive full pipeline more often than each
piece of data actually needed to change. The user found three separate schedules to reason about (and a
scheduled run that silently never fired — see below) more complex than it was worth, and asked instead
for one single workflow that fetches and recomputes *everything* — constituents, per-ticker prices,
index levels, selection/weights/`portfolio_history`, charts, GEM, and Relative Strength — once a week,
Saturday morning. `weekly_full_refresh.yml` now just calls plain `fetch_data.py` (no flags — this already
fetches constituents + prices + index levels, see `update_duckdb()`) followed by plain `run_query.py` (no
flags — this already recomputes selection/weights/`portfolio_history`, all the JSON exports, GEM, and
Relative Strength). The narrower `--indices-only` / `--charts-only` / `--gem-only` flags described
throughout this document still exist in the code (kept for manual/local use — e.g. a cheap local check of
just the GEM winner without a full yfinance fetch) but **CI no longer invokes any of them**; every mention
below of "daily"/"monthly" cadence for GEM, Relative Strength, or the main selection describes the
*previous* design's reasoning for splitting the work that way — useful context for why the code has these
separate code paths at all — not the schedule CI actually runs today. `portfolio_history` still carries
the `cap_scaled_due_to_infeasibility BOOLEAN` column (added via an idempotent
`ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, same idiom as `_ensure_prices_ohlc_columns` in `fetch_data.py`)
that the old `--charts-only` path relied on to re-export the display flag without recomputing weights;
now that the full `run_query.py` always recomputes weights, the column is just an ordinary persisted
field again. No new code was needed to keep `prices` from growing unbounded under the weekly cadence:
`update_prices_incremental()`'s retention trim (`DELETE FROM prices WHERE Date < cutoff`, see below) already
runs unconditionally on every `fetch_data.py` invocation, so a weekly full fetch keeps the rolling window at
exactly `--lookback-months` (28) regardless of how often it's called — this was verified, not assumed, before
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
       `--lookback-months`. Downloads the full `--lookback-months` (default **28**, raised from an
       original 15, then 22 — see below) window for every ticker via a `prices_staging` table renamed into place.
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
       **It was later raised again, from 22 to 28**, so the 52-week Mansfield smoothing (`rsm_long`) also
       has a full warm-up before `start_date` — see `mansfield_chart` under Relative strength below.
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
     no longer called by CI — see Pipeline architecture above / CI section below) does the equivalent
     full-universe `get_universe_metrics` call too, for the same reason: keep `all_constituents` in step
     rather than shrinking it back down to just the last saved decile selection between the (now weekly)
     `process_universe` runs. This roughly 5x's the
     `weekly_chart`/`mansfield_chart` computation (and JSON payload size) for SP500 specifically (~500
     constituents vs. ~100 in the decile) — an accepted, deliberate cost of full searchability, not an
     oversight.
   - Reference date defaults to `MAX(Date)` in the `prices` table; pass `--ref-date YYYY-MM-DD` to
     recompute for a specific historical date.
   - Also computes **Global Equity Momentum** (`docs/data/global_equity_momentum.json`) — see below.

A monthly (not semi-annual, as the official S&P 500 Momentum index does) rebalance cadence was the
original intentional choice here — it matched the cadence used in most academic momentum-return
literature, not an attempt at a literal 1:1 replication of S&P's own rebalance calendar. CI now actually
reruns `process_universe()` (and therefore recomputes selection/weights and appends a new
`portfolio_history` snapshot) **weekly** instead of monthly (see the cadence-consolidation note under
Pipeline architecture above and the CI section below) — a further deliberate choice by the user, not an
accident: the buffer rule (`select_with_buffer`, 20%) and the weight caps still work exactly the same way
regardless of how often a new snapshot lands, they just now compare against last Saturday's selection
instead of last month's.

### Global Equity Momentum (`compute_index_returns` / `compute_index_leaders`)

Compares the **index level** (not constituents) of ALL FIVE universes — `GEM_UNIVERSES` is now
`["SP500", "NASDAQ100", "DOWJONES", "WIG20", "MWIG40"]`, the same set as `UNIVERSES` — against each other
over a trailing `GEM_LOOKBACK_MONTHS` (12) window — the classic dual/global-momentum idea of picking
whichever market currently has the strongest trend. This used to compare only NASDAQ100/DOWJONES
(SP500/WIG20/mWIG40 were deliberately excluded from the race, even though their index-level data was
already being fetched for Relative Strength) — widened to all 5 at a point when GEM was, for a while, the
selection engine for the rebalance calculator (`rebalance.js`), which back then needed a winner drawn from
the full set of universes it could rebalance against. **That is no longer GEM's role** — the rebalance
calculator is fully automatic today, drawing from a fixed pool (SP500+NASDAQ100+DOWJONES) that GEM has no
say over (see "What this repo is" above and the Frontend section below) — but `GEM_UNIVERSES` was left at
all 5 rather than narrowed back down: GEM is still useful, general-purpose market-comparison information in
its own right, independent of whichever page/feature happens to consume it, and narrowing it back would
only lose information for no benefit. `compute_index_returns()` (below)
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

  `update_index_prices` builds `_compute_synthetic_equal_weight_index()`: an equal-weighted (same
  convention as `EQUAL_WEIGHT_UNIVERSES`) synthetic index level, base 100, built purely from the *already
  fetched* per-constituent closes in `prices` for that universe's tickers in `index_constituents` — daily
  equal-weighted average return across constituents, compounded from the base. This is not a literal
  WIG20/mWIG40 replica (real WIG20 is float-cap-weighted, not equal-weighted, and not rebalanced daily —
  see the GEM section below for how much that actually mattered), but every consumer
  (`compute_index_momentum`, `compute_relative_strength_chart`, `compute_mansfield_rs_chart`) only ever
  reads **% change relative to a window's start**, never the absolute level, so an arbitrary base is fine.
  It also works under `--indices-only` (a flag still supported by `fetch_data.py` for manual/local use,
  though CI itself no longer calls it — see Pipeline architecture above): `index_constituents`/`prices`
  aren't refreshed in that mode, but persist from the last full run, so the synthetic series just doesn't
  gain new days between full runs instead of being empty. Returns an empty frame (no exception) when
  `index_constituents`/`prices` don't exist yet (fresh bootstrap) or have no rows for that universe in the
  window.

  **A real, historical, cap-weighted WIG20/mWIG40 level was tried twice and abandoned both times** — this
  matters because it's exactly why GEM (below) ended up needing a manually-entered field instead. First,
  yfinance itself: `WIG20.WA`/`MWIG40.WA` were tried (a single multi-ticker `_download_price_rows([...])`
  call, then a per-symbol solo retry added to `_download_price_rows()` itself to rule out a batching
  quirk), and both consistently came back "possibly delisted; no price data found" — confirmed, via a
  throwaway diagnostic GitHub Actions run, to be a real Yahoo data-availability gap and not a yfinance/
  batching bug: `yf.download`/`Ticker.history` for these two tickers return **at most one row (today's)**
  no matter the requested range or interval, while the exact same call for an individual constituent (e.g.
  `PKN.WA`) returns full multi-month history without issue — Yahoo's chart API simply has no historical
  series for the WIG20/mWIG40 **index tickers themselves**, only a live quote. Second, after that was
  confirmed, a `_fetch_stooq_index_history()` helper was added to pull the same real level from stooq.pl's
  free CSV endpoint (`stooq.pl/q/d/l/?s=<wig20|mwig40>&i=d`) — the same source the user checks these
  numbers against by hand — wrapped to never raise so a fetch failure would just fall back to the
  synthetic index above. This was reverted almost immediately: the user confirmed stooq.pl itself stopped
  allowing automated downloads starting in 2026, so the endpoint this relied on no longer works at all —
  not a transient failure to fall back from, but the whole approach being closed off by the source itself.
  Both automated paths are dead ends; see `gem_manual_returns.json` below for what replaced them.

Before the synthetic-index fix, `weekly_chart`/`mansfield_chart` were silently `None` for every WIG20/
mWIG40 stock (`compute_relative_strength_chart`/`compute_mansfield_rs_chart` both need their own index's
rows and return `None` without them) — the dashboard showed correct WIG20/mWIG40 constituent/momentum
data but no chart for any of their tickers, with no error anywhere in the pipeline. `compute_index_returns()`
reads `index_prices` filtered to `GEM_UNIVERSES` (now all 5) and returns each universe's return over the
window, sorted descending; the top one is the `winner`. For Relative Strength (below), which only ever
reads % change relative to a window's start, the synthetic level is good enough and is all WIG20/mWIG40
ever get there — but for GEM's cross-market race the real level matters (see below for why), which is
what the manual-entry mechanism exists to fix.

**`gem_manual_returns.json`** (repo root) is the actual fix, replacing both abandoned automated attempts
above: a small, manually-maintained JSON file — same "manually-edited data file" pattern as
`WIG20_holdings.json`/`MWIG40_holdings.json` — with a `WIG20`/`MWIG40` entry each holding `return_pct`
(a plain number, e.g. `44.84`, not a string or a `%`-suffixed value) and an informational `as_of` date.
The user checks stooq.pl by hand once a month (its own UI still shows the number even though its CSV
export no longer allows automated downloads) and fills these two fields in directly — the file's own
`_instructions` field documents the exact steps and why this is manual now. `_load_gem_manual_returns()`
in `run_query.py` reads it, returning `{universe: return_pct}` only for entries with a non-null numeric
`return_pct` (`GEM_MANUAL_OVERRIDE_UNIVERSES = {"WIG20", "MWIG40"}` — the only two universes this applies
to; SP500/NASDAQ100/DOWJONES already have real yfinance data and don't need it) — a missing file, invalid
JSON, or a still-`null` field all just yield `{}` rather than raising, so forgetting to update it for a
month degrades gracefully back to the synthetic fallback rather than breaking the pipeline.
`compute_index_returns()` calls this and, for any universe present in the result, replaces only that
record's `return_pct` with the manual value and adds `"manual_entry": true` — `price_now`/`price_start`/
`date_now`/`date_start` stay as the synthetic index computed them (informational only; there's no real
index price to show instead). This override is scoped to `compute_index_returns()` alone — it does NOT
touch `compute_index_leaders()` (which ranks the *winning universe's own constituents* by their own
`prices` data, unaffected either way) or Relative Strength/the 10:30 chart (still synthetic-only, as
above) — the file's own `_instructions` says this explicitly, since it would be easy to assume a "real
WIG20 return" fix should apply everywhere it's used. This backend mechanism is entirely unaffected by the
rebalance-calculator changes described in "What this repo is" above — `_load_gem_manual_returns()`/
`gem_manual_returns.json` still work exactly as described, `compute_index_returns()` still sets
`manual_entry: true` on override, and `global_equity_momentum.json` still carries it; there's just no
frontend page currently rendering that `"(ręcznie)"` provenance label any more (see below).

**There used to also be a second, independent, client-side-only manual override** — a small input field per
universe inside a GEM widget on `rebalance.html` (`GEM_MANUAL_KEY`/`saveManualGemReturns`/
`loadManualGemReturns`/`applyManualGemOverrides`/`renderGemWidget()`, `localStorage`-only since the page has
no backend to write `gem_manual_returns.json` back to), added after the user found editing that file on
GitHub every month more friction than they wanted. **It was removed along with the rest of the GEM widget**
when the rebalance calculator became fully automatic over a fixed SP500+NASDAQ100+DOWJONES pool (see "What
this repo is" above) — GEM stopped picking anything for the calculator to browse, so the widget it lived in
had nothing left to do on that page. If a similar "edit a number without a GitHub round-trip" need comes up
again for `gem_manual_returns.json` specifically, re-read this note (or the pre-removal git history) before
reinventing the mechanism from scratch — the shape (a `localStorage` mirror of the repo file, applied as an
override after fetch, re-sorted/re-ranked from the untouched pristine data on every apply so clearing it is
a clean revert) is still a reasonable one, it just currently has no page to attach to.

**The GEM window is anchored to month-end trading days, not to "today".** `_gem_month_end_anchor_dates()`
resolves both endpoints (`date_now`/`date_start` on each index record) to the last trading day of a
*completed* calendar month — e.g. "31.08" this year vs. "31.08"/whatever the last trading day near there
was a year earlier — instead of "today vs. today minus 12 months". This is a deliberate choice by the
user, made after they noticed our GEM winner (see below) didn't match stooq.pl's own trailing-12-month
figures for the same day and asked to anchor to month-end instead of an arbitrary day. A month counts as
"completed" the moment EITHER its last known date is literally the last calendar day of that month (so
e.g. 31.08 itself is immediately valid — no need to wait for a September row to exist), OR a later month
is already present in the data (covers month-ends that fall on a weekend/holiday, where the last *trading*
day isn't the last *calendar* day) — `_gem_month_end_anchor_dates()`'s docstring has the exact rule. The
practical effect: the GEM numbers stay identical all month long (recomputing daily just reproduces the
same anchor dates) and only move once, when the calendar rolls into a new completed month — a deliberate
trade-off for stability/comparability over intra-month freshness.

**Version history matters here**: the anchoring fix above was tried first (at the user's specific
request) as a standalone fix for a GEM winner mismatch against stooq.pl's own WIG20/mWIG40 figures for
the same day — it was verified (before vs. after, same underlying data) that the GEM winner did NOT
change; the anchor date wasn't the problem. The real source of the gap was the synthetic index
construction itself (equal-weighted, rebalanced daily), understating WIG20's return specifically whenever
a few large, heavily-weighted constituents (its biggest banks/miners/refiners) outperform the rest of the
index by a wide margin, as they did this year — equal-weighting dilutes their pull, and daily rebalancing
trims winners/adds to laggards every day, both dragging the computed return down relative to the real,
buy-and-hold, cap-weighted index. Measured directly (same window, real data): daily-rebalanced
equal-weight gave WIG20 ~32%/mWIG40 ~34%; switching to a buy-and-hold equal-weight average (no daily
rebalancing) alone moved those to ~35%/~38% — matching mWIG40 almost exactly, but leaving WIG20 still far
below its real ~45%, **and still ranked below mWIG40** — proving equal-weighting (not the daily
rebalancing) was the dominant error, since removing just the rebalancing didn't fix the ordering. That's
what motivated trying to fetch the real level automatically (from yfinance, then stooq.pl — both dead
ends, see above) before landing on `gem_manual_returns.json` (also above) as the actual fix: rather than
keep refining an approximation that structurally can't match a cap-weighted, non-rebalanced index, the
user checks the real number by hand once a month.

For the winner, `compute_index_leaders()` finds the top `GEM_TOP_N` (10) constituents that are actually
**pushing the index to its new highs** — ranked by *contribution to the index's return*
(`weight_in_index_pct * return_pct`, where the weight is the constituent's `fmc_etf` share of the
winning universe and the return is computed over the *same* window as the index return), not by raw
momentum score — a small-cap mover with an extreme return but negligible index weight should not outrank
a mega-cap that is dragging the whole index up. `export_global_equity_momentum()` writes both the ranked
index list and the winner's leader list to `docs/data/global_equity_momentum.json`. **This `leaders` list
is purely informational and today has no frontend consumer at all** — it used to be shown in a small GEM
widget on `rebalance.html`, back when GEM still picked which universe the rebalance calculator drew from
(see "What this repo is" above); that widget is gone now that the calculator is fully automatic over a
fixed pool, same as the dashboard never had a GEM panel either (see below). The field is cheap to keep
exporting (same reasoning as `relative_strength.json`, see Relative strength below) in case a future
feature wants it again. The rebalance calculator's own ranking (`combinedPoolRows()` in `rebalance.js`,
see the dedicated Frontend write-up below) sorts by each company's own `momentum_score`/`rank` (the same
per-constituent momentum ranking `get_universe_metrics` computes for every universe's selection, exposed on
every `all_constituents`/`constituents` record) — a deliberately different, simpler ranking than
`compute_index_leaders`'s index-contribution weighting, because it answers "strongest own momentum," not
"biggest driver of the index's return"; this is also, today, what actually gets bought — TOP N of that
ranking IS the automatically-selected/weighted portfolio, not just an informational list to pick from by
hand.

`export_global_equity_momentum()`'s `ref_date` is *not* threaded through from the constituent-price
pipeline's `ref_date` parameter — it's independently derived from `MAX(Date)` in `index_prices` when
called with `ref_date=None` (the default). This design predates the current all-weekly cadence: it used to
matter because GEM was refreshed **daily** via a separate `daily_gem.yml` workflow (`fetch_data.py
--indices-only` + `run_query.py --gem-only`) while the main constituent pipeline only ran monthly, so GEM's
own watermark needed to move independently and more often than the constituent pipeline's `ref_date` did.
CI now runs everything together, weekly (see Pipeline architecture above / CI section below), so in
practice both watermarks advance together on every run — but the code still computes them independently,
and `compute_index_leaders()` still gracefully falls back to each constituent's last known price via
`ARGMAX(... FILTER WHERE Date <= ref_date)`, which is worth keeping: nothing stops someone from running
`fetch_data.py --indices-only` + `run_query.py --gem-only` locally between the weekly CI runs for a cheap,
targeted GEM check, and this fallback is what makes that still work correctly.

**GEM has no dashboard tab, and no rebalancer widget, any more** (`index.html`/`app.js` — it used to have
its own sidebar group, drawer tab, and table, all reading `docs/data/global_equity_momentum.json` via
`state.gem`; removed once the rebalance calculator briefly became its actual consumer instead, a "just to
look at" panel on the dashboard no longer being the point back then). That consumer is gone too now that
the rebalance calculator is fully automatic over a fixed pool (see "What this repo is" above) —
`rebalance.js` no longer fetches `global_equity_momentum.json` either. **`global_equity_momentum.json` is
still generated by the pipeline exactly as before** (now weekly, as part of the single consolidated
`run_query.py` run — see above), with no frontend page currently reading it at all — the same
cheap-to-keep, currently-unconsumed situation as `relative_strength.json` (see Relative strength below).

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
Like GEM, its `ref_date` defaults to `index_prices`'s own watermark (independent of the constituent
pipeline's own `ref_date` parameter) and it's recomputed by the same `run_query.py --gem-only` code path as
GEM. As with GEM above, this independent-watermark design dates from when a separate `daily_gem.yml`
workflow refreshed GEM/Relative Strength daily while the main pipeline only ran monthly; CI now runs
everything together weekly (see Pipeline architecture above / CI section below), but the code path — and
its graceful tolerance of a `prices`/`index_constituents` staleness gap — is unchanged and still exercised
whenever `run_query.py --gem-only` is run manually/locally between weekly CI runs.

Each leader also carries a `weekly_chart` (`compute_relative_strength_chart()`) with a classic stage
-analysis view (Stan Weinstein / Dr Eric Wish) the free TradingView widget can't reliably replicate
(adding a compare symbol can hit free-tier account limits): the **main price chart** — the stock's own
weekly price plus its **20-week EMA** (`RS_PRICE_EMA_WEEKS`, `ema20_pct`), together with its own index level
over the same weeks — with every
series expressed as **% change relative to the first displayed (in-window) week**, not raw values on
separate scales: two raw series on different axes make it hard to judge by eye which one is actually
growing faster, while rebasing both to 0% at the window's start means whichever line ends up higher *is*
the outperformer — directly answering "is this stock stronger than its own market right now" (`close_pct`/
`ema20_pct`/`index_pct`; the EMA is computed on the raw weekly price first, then rebased by the same
stock-price base as `close_pct` so it still reads as a smoothed version of the price line). **Version
history**: this used to be the classic "10:30" chart (10-week + 30-week SMA, `sma10_pct`/`sma30_pct`,
`RS_PRICE_SMA_SHORT_WEEKS`/`RS_PRICE_SMA_LONG_WEEKS`) — replaced by a single 20-week EMA at the user's
explicit request to simplify the main chart ("chcę usunąć 10,30 SMA i dodać 20 EMA i bazować stage 2 na
tej średniej"). Every Weinstein-stage criterion below that used to read SMA30 (price above/below it, its
slope, the trailing stop's `min(MA, base low)`, `WARNING_MA_SLOWING`) now reads EMA20 instead; all other
criteria (Darvas box, buying-volume confirmation, stop-raise rules, late-base warning) are unchanged. SMA10
never took part in the classification. The EMA is `ewm(span=20, adjust=False, min_periods=20)` (recursive,
like TradingView's `ta.ema`; `None` until 20 weeks of history exist). Mentions of "SMA30"/`sma10_pct`/
`sma30_pct` in the version-history notes below describe that earlier design. All
series are resampled from the daily `prices`/`index_prices` tables via `DATE_TRUNC('week', Date)` +
`ARGMAX`, fetching `RS_PRICE_EMA_BUFFER_WEEKS` (`2*20+2` = 42) extra weeks of history *before* the momentum
window's start purely so EMA20 has already converged (not just a value, since an EMA depends on its seed)
at the first displayed (in-window) point, and the series returned
is trimmed to start exactly at that window's start (M-14 or M-11) through to `ref_date`. `prices` retains a
rolling `--lookback-months` window — **28 by default** (bumped up from an original 15, then 22; see
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

**`pending_box`/`pending_base` — the box a stock is sitting in RIGHT NOW, exported continuously, not just
at consumption.** Added later, at the user's explicit request, after shipping the "🎯 Qullamaggie" screener
(see Frontend below): `base_event`/`bases` above only ever get a value on the ONE week a box actually gets
broken out of — a stock that's STILL mid-consolidation (exactly the case that screener flags as
"consolidating") has no exported resistance/support level at all, so there was no way for the frontend to
show "the price to watch" for it. `_compute_weinstein_stage_series()` already tracks the box continuously
in its `dv_box_top`/`dv_box_bottom`/`dv_phase`/`dv_box_start_idx` locals regardless of whether it's been
broken yet — `pending_box` (per-week field, `{"resistance", "support", "start_idx", "phase"}` or `None`)
just surfaces that existing state instead of adding new tracking. `resistance` (`dv_box_top`) is already
known the moment the phase reaches `SEEKING_BOTTOM` (the top confirms before the bottom does); `support`
only once `BOXED`. `compute_relative_strength_chart()` reads only the LAST displayed week's `pending_box`
(a `current_stage`-style convenience field, not a per-week series) and rebases it to `pending_base`
(`{"start_date", "resistance_pct", "support_pct", "phase"}` or `None`) the same `close0`-relative way as
`bases`. **`pending_base`/`bases` (this Darvas-box mechanism) are no longer the PRIMARY source the frontend
reads for "the level to watch"** — see `js/minicharts.js::squeezeConsolidationBox()`/`breakoutLevelFor()`
under the "🎯 Qullamaggie" bullet below for why: the Darvas box tracks its OWN, independent notion of
top/bottom (3 weeks without a new closing high/low), which routinely lands on completely different weeks
than whatever `ttm_squeeze_chart` itself flagged as the consolidation — so a stock the Qullamaggie screener
called "consolidating" often had no `pending_base` at all, or one describing an unrelated, stale box.
`pending_base`/`bases` are kept as a client-side FALLBACK only, for a ticker with no active/just-fired
squeeze of its own (e.g. opened from a general table, not from a squeeze screener) — the primary path now
derives the box directly from the SAME weeks the squeeze itself covers, entirely client-side from data
already exported (no backend change needed for that fix — see below).

**Stages**, derived from that breakout signal plus price's position/slope relative to EMA20 (formerly SMA30,
see the version-history note on the main chart above):
  - **Stage 1** (base): price near/below a not-yet-broken-out base, or (cautiously) above EMA20 while EMA20
    is still falling — not a confirmed advance yet.
  - **Stage 2A** (fresh breakout): the first base breakout since the stock was last *not* in Stage 2.
  - **Stage 2B** (continuation): every subsequent base breakout while already in Stage 2 — the book's
    "1st base / 2nd base / 3rd base..." sequence within one advance (secondary/"pyramiding" entries).
  - **Stage 3** (topping): price dips back under EMA20 after an advance, before EMA20 itself turns down
    (distribution).
  - **Stage 4** (decline): price under a falling EMA20.

**Trailing stop-loss** (`stop_level`, rebased to `stop_level_pct` in the exported chart data the same way
`close_pct` is — same close0 base — so it can be drawn as a line on the price chart): mirrors the book's own
"Trailing Stop Loss — Weekly Chart" diagram.
  - On `ENTRY_2A`: stop = `min(EMA20, breakout base's low)` — below both the whole base and the rising MA
    ("the stop loss should remain below the rising 30-week MA and each significant weekly swing low").
  - On each later base breakout (`ENTRY_2B`/`ENTRY_2B_LATE`): the stop is a *candidate* to raise to
    `min(EMA20, new base's low)`, but it is only actually raised — and only then — once price has already
    moved back within `STAGE_STOP_NEAR_HIGH_PCT` (3%) of the run's swing high since the last raise ("don't
    raise your stop loss until the price moves back near to the prior swing high of the most recent
    advance"). The stop is only ever raised or held, never lowered.
  - `base_count` tracks which base number this is within the current Stage 2 run; from `STAGE_LATE_BASE_
    WARNING_COUNT` (4) onward the entry signal becomes `ENTRY_2B_LATE` instead of `ENTRY_2B` — "4th & 5th
    bases within the Stage 2 advance are more prone to failure. So watch for warning signs."
  - `WARNING_MA_SLOWING` fires once per Stage 2 run, the first week EMA20's own slope (still positive/rising)
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

All of the above shares the exact same history-buffer dependency already documented for `ema20_pct`
above: every field is `None` until EMA20 (and, separately, `STAGE_VOLUME_LOOKBACK_WEEKS`/
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
index_close`, in **three smoothing variants plotted together**: short-term (`rsm_short`,
`RS_MANSFIELD_SHORT_WEEKS` = 13 weeks, ~3 months), medium-term (`rsm_medium`,
`RS_MANSFIELD_MEDIUM_WEEKS` = 26 weeks, ~6 months), and long-term (`rsm_long`,
`RS_MANSFIELD_LONG_WEEKS` = 52 weeks, ~12 months, added later at the user's explicit request — "ad 52
weeks for that panel so it will have 3 lines") — three deliberately different, non-overlapping horizons
of the same signal (a short-term acceleration/deceleration can lead or diverge from the medium-/
long-term trend). It now displays over **the exact same window as `weekly_chart`** — `start_date` (the
M-14/M-2, or M-11 fallback, momentum window) through `ref_date` — taking `start_date` as a parameter
exactly like `compute_relative_strength_chart` does, and fetching its own `RS_MANSFIELD_LONG_WEEKS + 2`
weeks of buffer before it (the longest of the three windows, so it decides the buffer size) so each
smoothing already has a value at the first displayed point, retention permitting (see below — `rsm_long`
specifically often does NOT have that luxury).

**`rsm_long` needs ~26 months of price history in total** (a ~14-month momentum window plus a 52-week
warm-up buffer before `start_date`). It was first added while retention was still 22 months, which left
it `null` for roughly the first quarter-to-half of the displayed window — the user reported exactly that
("nie ma pełnej linii, na wykresie jest od połowy"), so **`--lookback-months` was raised again, from 22 to
28** (26 + ~2 months of margin), which triggers one one-time full re-bootstrap of `prices` via
`_prices_history_is_shallow()` in `fetch_data.py`. The same report also asked whether the line is
"too jagged" because of a pandas bug — it isn't: an independent recomputation from `momentum_data.duckdb`
(daily closes → weekly last close → `RS = stock/index` → `(RS / RS.rolling(52).mean() - 1) * 100`)
matched the exported values exactly. The jaggedness is inherent to the Mansfield formula: only the
DENOMINATOR (the SMA) is smoothed, the numerator is the raw weekly RS, so the oscillator moves week to week
by roughly the stock's weekly relative return (e.g. ~4% std for NVDA) — a longer window shifts the baseline,
it doesn't smooth the line.

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

Each leader (and every `all_constituents` record for `FULL_COVERAGE_UNIVERSES`, same as `weekly_chart`/
`mansfield_chart`) also carries a `ttm_squeeze_chart` (`compute_ttm_squeeze_chart()`) — the TTM Squeeze
indicator (John Carter, *Mastering the Trade*), computed on **weekly** bars. This is the fourth chart panel
next to "10:30" and Mansfield, and it **replaces an earlier panel** that showed a stock's own raw, rolling
1/3/6-month % growth (`compute_growth_chart`, `growth_1m`/`growth_3m`/`growth_6m` — removed) — the user
explicitly changed direction away from plain performance numbers toward finding stocks that already have
momentum but are sitting through a multi-week **consolidation** ("squeeze"), specifically to catch names
just starting to break out of one.

**The formulas are a deliberate, verified, line-for-line port of "Squeeze Momentum Indicator [LazyBear]"**
— the specific Pine Script that is *the* de-facto "TTM Squeeze" almost everyone means by that name on
TradingView (confirmed against its public source) — not a from-first-principles reimplementation. This
matters because an earlier version of this code took some "textbook Keltner Channel" shortcuts that look
reasonable but don't match what TradingView actually plots, which the user caught by comparing a few
tickers against the real chart ("Źle działa ttm i histogram sprawdź kilka z tradingview"). Three concrete
fixes came out of that check, all still true today:
  1. **Both bands share ONE multiplier.** In LazyBear's reference script, `dev = multKC *
     stdev(source, length)` — the Bollinger Band deviation uses the *Keltner* multiplier input, not a
     separate "BB MultFactor" (which is declared but never actually used in the calculation — a quirk in
     the original public script, not a typo we should "fix": that quirky formula is exactly what's on
     everyone's chart). So there is only `TTM_SQUEEZE_KC_ATR_MULT` (2.0, raised from an initial 1.5× at
     the user's request) — no separate `TTM_SQUEEZE_BB_MULT` constant exists.
  2. **The Keltner Channel midline is SMA, not EMA.** Reference: `ma = sma(source, lengthKC)`. An earlier
     version used an EMA here (the more common "textbook" Keltner convention), which shifted the channel
     center away from what TradingView draws. Since `TTM_SQUEEZE_BB_WEEKS == TTM_SQUEEZE_KC_WEEKS` (both
     20), this SMA is literally the same `sma` series already computed for the Bollinger Band basis —
     `compute_ttm_squeeze_chart()` reuses one `sma` variable for both.
  3. **Standard deviation is population, not sample.** Pine Script's `stdev()` divides by `N` (`ddof=0`)
     by default, not `N-1` — pandas' `.std()` defaults to `ddof=1`, so the Bollinger Band width (and
     therefore `squeeze_on`) would be subtly narrower than TradingView's without passing `ddof=0` explicitly.

`squeeze_on` is true for a given week when the Bollinger Bands sit entirely **inside** the Keltner Channel
(both computed as above) — the classic low-volatility/consolidation signature.
`squeeze_count` is the number of *consecutive* weeks the squeeze has been on (0 when off); `fired` marks
the single week the squeeze just turned off after being on — the breakout out of consolidation.
`weeks_since_fire`/`fire_consolidation_weeks` are forward-filled for every week: how long ago the most
recent fire happened, and how many weeks of consolidation led up to it — this is what lets the frontend
classify a ticker without having to walk the whole array itself (see `classifyTtmSqueeze()` below).
`histogram` is the **full** momentum oscillator from the original indicator, not a simplified stand-in: a
`diff = close` minus a blend of the `TTM_SQUEEZE_KC_WEEKS`-week high/low midpoint and SMA, then run through
`_rolling_linreg_endpoint(diff, TTM_SQUEEZE_KC_WEEKS)` — the same rolling linear-regression-endpoint step
as `ta.linreg(source, length, 0)` in Pine Script (fits an OLS line to the trailing `TTM_SQUEEZE_KC_WEEKS`
points of `diff` and evaluates it at the most recent one, rather than plotting the raw `diff`). An earlier
version skipped this regression step as a documented simplification (in the spirit of
`_compute_weinstein_stage_series`'s own simplifications elsewhere in this file); replaced with the full
version at the user's explicit request ("weź pełne momentum nie uproszczone"). Because the regression needs
its own `TTM_SQUEEZE_KC_WEEKS` weeks of already-computed `diff` on top of `diff`'s own warmup, the buffer
fetched before `start_date` is `2*TTM_SQUEEZE_KC_WEEKS+2` weeks (not `+2` alone) so `histogram` still has a
value at the first displayed week — same "warm up before the window starts" convention as
`RS_PRICE_EMA_BUFFER_WEEKS`/`RS_MANSFIELD_MEDIUM_WEEKS+2` elsewhere in this module. Needs weekly High/Low
(via `_weekly_close_series(..., include_buying_volume=True)`, which also carries them) for the ATR/Keltner
Channel — old pre-migration `prices` rows without them (see `_ensure_prices_ohlc_columns` in
`fetch_data.py`) leave every squeeze field `None` for that stretch rather than a wrong value, the same
graceful-degradation convention used throughout this module.

Each leader (and every `all_constituents` record for `FULL_COVERAGE_UNIVERSES`) also carries a `macd_chart`
(`compute_macd_chart()`) — the classic MACD indicator (Gerald Appel), added directly under the volume panel
at the user's explicit request as a help with entry/exit timing (crossovers of the MACD/signal lines, the
histogram crossing zero — see the frontend bullet under Frontend below for how it's drawn).
`macd = EMA(close, MACD_FAST_WEEKS=12) - EMA(close, MACD_SLOW_WEEKS=26)`,
`signal = EMA(macd, MACD_SIGNAL_WEEKS=9)`, `histogram = macd - signal` — the standard 12/26/9 periods, just
computed on **weekly** closes (the same rhythm as `compute_ttm_squeeze_chart`/`compute_mansfield_rs_chart`
in this module, not the daily-close convention "12/26/9" usually implies elsewhere — a deliberate "weekly
MACD" for swing-trading entries/exits, not an attempt to reproduce a daily MACD on a weekly axis). Unlike
`compute_ttm_squeeze_chart`/`compute_mansfield_rs_chart` (built on `.rolling()`, which returns `NaN` until
its window fully fills), pandas' `.ewm(..., adjust=False).mean()` never returns `None`/`NaN` for lack of
warm-up — it's defined from the very first available data point, just less "converged" early on — so the
`lookback_weeks = 4 * MACD_SLOW_WEEKS` fetched before `start_date` exists purely to let the EMAs settle
before the first displayed week, not to avoid `None` values the way the buffers elsewhere in this module do;
if less history than that is actually available, the EMA is simply computed from whatever there is, no
error, no `None`.

### Sector strategy screener (`compute_sp500_trend_filter` / `compute_sector_relative_strength`)

A dedicated, standalone screener (`docs/strategy.html`) for a specific, user-requested, wieloetapowa
(multi-stage) strategy: (1) only look for sector leaders while the **overall market (SP500) is in a
growth phase** — price above its 200-day SMA OR above its 40-week SMA (the user gave both conventions
explicitly and they're treated as equivalent/either-sufficient, not requiring both); (2) rank SP500's
**GICS sectors** by relative strength vs. the SP500 index itself; (3) within a sector, rank its member
companies by relative strength vs. that sector's own price, and take the **top 10%**; (4) **separately**,
also surface the top 10 companies of the WHOLE SP500 by pure RS vs. SP500 directly, ignoring sector
membership entirely (`top_rs_companies` — added at the user's explicit follow-up request, "Dodaj jeszcze
top 10 spółek samego RS z sp500 bez sektorów", after the pure-RS rewrite below landed); for all of the
above, surface each company's existing Weinstein Stage and TTM Squeeze status so the user can judge entry
timing manually — this screener does not buy/select anything automatically, same "informational only, you
decide" philosophy as the rest of the dashboard/rebalance calculator.

**This strategy is CZYSTY RS (pure Relative Strength) — there is ZERO momentum/return anywhere in
`compute_sector_relative_strength`, by the user's explicit instruction** ("Ta strategia bazuje na czystym
RS" — this strategy is based on pure RS). Both Krok 2 and Krok 3 use exactly the same formula, the classic
Mansfield Relative Strength oscillator (`RS = price_A / price_B`, `RSM = (RS / SMA(RS, N weeks) - 1) *
100` — the same oscillator `compute_mansfield_rs_chart` already draws for a single stock vs. its own index,
see Relative Strength above), just with different numerator/denominator pairs at each step:
  - **Krok 2** (which sector leads *right now*): `RS = sector ETF price / SP500 price`.
  - **Krok 3** (which company leads *within* a sector): `RS = company price / THAT SAME sector's ETF
    price` — the denominator is the sector, **not** SP500, so a company's Krok-3 score answers "does it
    beat its own sector," a genuinely different question from Krok 2's "does the sector beat the market."
`SECTOR_STRATEGY_RSM_WEEKS = 52` is this screener's own smoothing window — a classic, full-year Mansfield
window, **deliberately independent** of `RS_MANSFIELD_SHORT_WEEKS`/`RS_MANSFIELD_MEDIUM_WEEKS` (13/26
weeks) used by the single-stock chart elsewhere in this module: the user was asked whether ranking should
use the short/medium/both windows already in the codebase, and explicitly said this strategy's own
calculation should be independent, on a 52-week window for everything.

This is scoped to **SP500 only** (the user's own description of the strategy names SP500 specifically,
and SP500 is the one universe whose holdings CSV — `CSPX_holdings.csv`, see `fetch_data.py` — already
carries a real per-company `Sector` column, propagated into `index_constituents.Sector` and from there into
every constituent record's `"sector"` field, in `docs/data/sp500.json`, alongside `Ticker`/`fmc_etf`
already). No new fetch is needed for step (1)/(2)/(3) below — `index_prices` already retains a full daily
`^GSPC` series for `--lookback-months` (28 by default, see `fetch_data.py`), far more than the 200 trading
days a SMA200 needs, or the ~60 weeks (52 + buffer) the 52-week Mansfield window needs.

- **`compute_sp500_trend_filter(con, ref_date)`** reads `index_prices` for `SP500`, computes a plain
  rolling 200-day SMA on the daily series and a rolling 40-period SMA on a `DATE_TRUNC('week', Date)`
  resample (same weekly-bucketing convention as `_weekly_close_series` elsewhere in this file), and
  returns `above_sma200`/`above_sma40w`/`in_growth_phase` (`above_sma200 OR above_sma40w` — literally "or",
  matching how the user phrased the two conventions as interchangeable) plus two small trimmed series
  (`daily_series`/`weekly_series`, `SP500_TREND_CHART_DAYS`/`SP500_TREND_CHART_WEEKS` long) so the frontend
  can plot a small trend chart without having to expose the whole `index_prices` table as JSON. Returns
  `None` fields (not an exception) when there isn't yet enough history for a given SMA — same
  graceful-degradation convention as the rest of this module.
- **`_mansfield_rsm_series(con, table, id_column, id_value, start_date, end_date)`** and
  **`_mansfield_rsm_current_value(numerator_df, denominator_df, weeks)`** are the two small, generic
  helpers this screener is built from: the first fetches a sorted weekly close series for any ticker
  (`prices`) or index/ETF (`index_prices`) — a thin wrapper over `_weekly_close_series`; the second joins
  two such series by week, computes `RS = numerator.close / denominator.close`, and returns only the
  single most-recent `RSM = (RS / SMA(RS, weeks).rolling - 1) * 100` value (not a whole chart series like
  `compute_mansfield_rs_chart` builds — this screener only ever needs "how strong is X vs. Y *right now*"
  for ranking, not a time series to plot). Returns `None` when there aren't at least `weeks` common weeks
  of data yet — same graceful-degradation convention as the rest of this module.
- **`compute_sector_relative_strength(con, ref_date, ...)`** calls `get_universe_metrics(con, "SP500", ...)`
  — the SAME full, qualifying-population query that backs `all_constituents` (not just the current
  top-quintile selection) — but **only to know which companies/sectors exist and their current price**;
  `momentum_value` from that frame is completely ignored (pure-RS, see above). Each **sector's** RS comes
  from a REAL sector ETF: `fetch_data.py::SECTOR_ETF_SYMBOLS` maps each GICS sector string exactly as it
  appears in `CSPX_holdings.csv`'s `Sector` column (`"Information Technology"`, `"Financials"`, ... — 11
  sectors) to its SPDR Select Sector ETF ticker (`XLK`, `XLF`, ...); `fetch_data.py::update_index_prices`
  fetches all 11 the same way it already fetches `^GSPC`/`^NDX`/`^DJI` (`_download_price_rows`, full-range
  replace each run) and writes each one into `index_prices` with **`Index_Name` = the sector NAME, not the
  ETF ticker** — which means `_mansfield_rsm_series(con, "index_prices", "Index_Name", sector_name, ...)`
  already works for a sector with zero new fetch code. When a sector's ETF doesn't have data yet in
  `index_prices` (e.g. right after this was added, before the next full `fetch_data.py` run), the sector
  gets `"data_source": "no_data"`, `rsm_vs_index_pct: None`, and an empty `top_companies` — **there is no
  fallback to an approximated return any more** (an earlier version fell back to the `fmc`-weighted average
  return of the sector's own member stocks, the same pattern `gem_manual_returns.json` uses for WIG20/
  mWIG40's synthetic index; that fallback was removed once the strategy became pure-RS, since a return-based
  approximation would no longer be "czysty RS" — see version history below). Such a sector simply sorts to
  the bottom of the ranking instead. Every sector row still carries a `"data_source"` field (`"etf"` or
  `"no_data"`) for transparency, same pattern as `manual_entry`/`fmc_note` elsewhere; the frontend shows a
  small "(brak danych)" note next to a `"no_data"` sector (`docs/js/strategy.js`).

  Krok 3's `top_companies` is computed for **every** sector, not just the strongest one — see the Frontend
  `strategy.html` bullet below for why: the user wanted to browse an alternative sector when the top-ranked
  one's own leaders aren't in a good stage that week. For each company in a sector (that has ETF data),
  `rsm_vs_sector_pct` is the current Mansfield RSM of that company's price against its OWN sector's ETF
  price (52-week window, same as Krok 2 but with a different denominator) — companies sorted descending,
  top `SECTOR_STRATEGY_TOP_PERCENT` (10%) kept, `rank_in_sector` assigned.

  **`top_rs_companies`** (top-level, not nested inside `sectors`) is Krok 4: the top
  `SECTOR_STRATEGY_TOP_RS_N` (10) companies of the ENTIRE SP500 by the same Mansfield oscillator, but the
  denominator is ALWAYS SP500 (`rsm_vs_index_pct`), never a sector — a genuinely different ranking from
  Krok 3's per-sector one, since the two use different denominators; a company can be its own (weak)
  sector's #1 without cracking this top 10 against the whole market, and vice versa. This list needs no
  sector ETF at all — it only needs a company's own price and SP500's — so every SP500 company is eligible
  regardless of whether its sector currently has `"data_source": "no_data"`. Each company's own weekly
  price series (`_mansfield_rsm_series` for its ticker) is fetched exactly **once** per company inside the
  per-sector loop and reused for both this calculation (vs. SP500) and Krok 3's (vs. its own sector) — no
  duplicate query for the same ticker.

  **Version history matters here**: this function went through two prior designs before landing on pure
  RS. The FIRST version used the `fmc`-weighted synthetic average as the sector's whole basis (no ETF at
  all) — the user pushed back ("Przecież potrzebujemy chyba ETF na sektor?"), so real SPDR sector ETFs
  were fetched for real, keeping the synthetic average only as a fallback. The SECOND version ranked Krok 2
  by a **trailing-return** (`compute_index_momentum`'s M-14/M-2 window, then — after a real bug where that
  window flipped Technology/Energy's ranking vs. what TradingView/stooq showed — a plain trailing-12-month
  return anchored to month-end, the same convention as Global Equity Momentum) and ranked Krok 3 by each
  company's own `momentum_value` (M-14/M-2) minus its sector's windowed return. That whole design — return
  differences on two different windows for the two steps — was replaced by the CURRENT, THIRD design (this
  section) once the user clarified the strategy was never about momentum/return spreads at all: "siłę
  sektora mierzysz przez mansfield RS do indeksu, potem to samo robisz dla akcji ale odnośnikiem nie jest
  indeks tylko sektor. Wszystko to mansfield RS. Zero momentum. Ta strategia bazuje na czystym RS" — both
  steps are now the identical Mansfield oscillator formula with a swapped denominator, not two different,
  return-based computations on two different windows. This also simplified away the earlier "Krok 2 and
  Krok 3 need two different windows to answer two different questions" reasoning entirely: both steps now
  share one formula and one window (`SECTOR_STRATEGY_RSM_WEEKS`), so there's no window mismatch to reason
  about any more.
- **`export_sector_strategy(con, ref_date, docs_data_dir, ...)`** combines both into
  `docs/data/sector_strategy.json` (`trend`/`sector_rs`/`note`) — called from `run_query.py`'s normal,
  full (weekly) `main()` path alongside `export_relative_strength`/`export_global_equity_momentum`, so it
  refreshes on the same cadence as everything else (see Pipeline architecture above). `top_companies` and
  `top_rs_companies` both intentionally carry only ticker/price/RS numbers — neither duplicates
  `weekly_chart`/`ttm_squeeze_chart` (unlike `export_relative_strength`'s `leaders`, which aren't in
  `FULL_COVERAGE_UNIVERSES` and so need those charts attached explicitly): since SP500 already exports full
  per-company chart data via `all_constituents` in `docs/data/sp500.json`, the frontend (`docs/js/
  strategy.js`) joins both lists' tickers against that file by ticker to read `weekly_chart.current_stage`
  and `ttm_squeeze_chart` for display, rather than re-fetching/duplicating them here.

**`js/minicharts.js`** — a fifth shared `<script>` file (after `shared.js`/`qol.js`/`table-render.js`),
loaded on `index.html`/`rebalance.html`/`rebalance_pl.html`/`strategy.html` (not `chart.html`, which has no
tables), holding the inline-SVG mini-visualization building blocks originally written for the Continuation
tab and now reused across the dashboard/rebalancers/strategy page: `sparkPoints`/`sparkPath`/`seriesRange`,
`weeklySparkSvg(closes, ema, squeeze?)`, `dailySparkSvg`, `pullbackHtml`, `rsBarHtml` (diverging bar around
zero, capped at `RS_BAR_CAP`=50), `ttmMiniSvg` (TradingView-style 4-color histogram + dots),
`zeroLineSparkSvg`/`crossIndexInTail` (oscillator mini-chart with a gold dot at a zero-cross, for MACD/RS in
the Wybicie tab), `miniVisualFields(c)` (last `MINI_WEEKS`=26 weeks of `close_pct`/`ema20_pct`/TTM
histogram/squeeze/fired + latest `rsm_long`), `stageBreakdown`, `findConstituent` (ticker lookup across a
`{universe: json}` map, for the rebalancers' holdings table), `bulletHtml` (current-vs-target bar for the
rebalancers' suggestion table). Extracted out of `app.js` at the point `rebalance.js`/`rebalance_pl.js`/
`strategy.js` all needed the same visuals — same "genuinely shared, not copy-pasted" reasoning as
`js/shared.js`. `tests/js/app.test.js` still covers it (imported from `minicharts.js` there).

## Frontend (`docs/`) — deployed as-is to GitHub Pages, no build step

Plain HTML/CSS/vanilla JS, a PWA (`manifest.webmanifest` + `sw.js` service worker precaching the app
shell — `SHELL` in `sw.js`, every page/script/CSS/icon the site needs — for offline use). **Every
same-origin fetch, both `docs/data/*.json` and the app shell itself (HTML/CSS/JS), goes network-first**,
falling back to the last cached response only on failure (e.g. offline) — a single `fetch` handler in
`sw.js` covers both; nothing here is cache-first any more. This was a network-first-for-data/cache-first-
for-shell split until a real bug forced the change: mid-development, `rebalance.js`'s own redirect target
for its Krok 2 chart changed twice in one day (see the version-history note on that bullet below), and a
browser that had already cached the OLDER `js/rebalance.js` under the cache-first shell strategy kept
serving stale, broken redirect behavior even after the fix shipped, until its Service Worker happened to
update — which that strategy didn't reliably guarantee within a single reload. Since this codebase is
under active, frequent development, freshness matters more here than the instant-from-cache snappiness
cache-first would give; `CACHE`'s version string (`momentum-shell-v9`) is still bumped on every `SHELL`
change so `activate` evicts stale cache entries from anyone who somehow still has an old one around.

**Chart.js/its two plugins/SheetJS are vendored locally (`docs/js/vendor/*.min.js`), not loaded from a
CDN any more.** They used to be `<script src="https://cdn.jsdelivr.net/npm/...">` tags on every page that
needed them (`index.html`/`chart.html`/`strategy.html` for `chart.js`+`chartjs-plugin-zoom`+
`chartjs-plugin-annotation`, `rebalance.html` also for `xlsx`) — deliberately excluded from the Service
Worker's precaching/offline story (`sw.js`'s fetch handler: `if (url.origin !== location.origin) return;`,
see below) since a cross-origin CDN script can't be reliably intercepted/cached the same way. The user hit
a real instance of this: `cdn.jsdelivr.net` was unreachable in their environment, and `chart-render.js`'s
existing fallback (`if (typeof Chart === "undefined") { rsContainer.innerHTML = '...Nie udało się
załadować biblioteki wykresu...' }`) DID fire correctly, but that message is small, low-contrast
(`.empty-state`, `var(--text-faint)`) text at the top of an otherwise huge, empty dark chart panel — easy
to mistake for "nothing rendered at all, just background" (verified by reproducing the exact failure and
screenshotting it — that's literally what it looks like). Re-hosting the exact same pinned versions
(`chart.js@4.4.4`, `chartjs-plugin-zoom@2.0.1`, `chartjs-plugin-annotation@3.0.1`, `xlsx@0.18.5` — fetched
via `npm install` into a scratch dir, `chart.js`'s own npm package ships only an unminified
`chart.umd.js` so that one specifically needed a `terser -c -m` pass to get back to a `.min.js`; the two
plugin packages and `xlsx` already ship a pre-minified `dist/*.min.js`) as local files under
`docs/js/vendor/` fixes this at the root: no external network call at all any more for these, so nothing
to fail regardless of what a given environment blocks, AND they're now genuinely coverable by the Service
Worker's offline story for the first time (added to `SHELL`, `CACHE` bumped to `-v9`) — a real
improvement to the "PWA for offline use" goal stated at the top of this section, not just a workaround. The
`sw.js` cross-origin guard itself stays (harmless no-op for these now-same-origin files; still correctly
skips the genuinely-must-stay-external TradingView widget scripts, `s3.tradingview.com/external-embedding/
embed-widget-*.js` — see `TV_PAGE_WIDGETS` below — which can't be vendored since they're live embeds that
only function from their own domain). `chart-render.js`'s `typeof Chart === "undefined"` fallback message
itself was intentionally left as-is (still a legitimate fallback for e.g. a corrupted/failed-to-parse local
file) — the fix here is removing the failure mode's most likely real-world trigger, not chasing the
fallback UI's own visibility, which was a separate, smaller concern not worth its own CSS change.

`docs/data/` is generated by `run_query.py`; since a recent change
(mirroring the already-committed `momentum_data.duckdb`, see above) it **is committed to git** too, so the
site's data survives independently of any given Pages deploy and a fresh checkout of `docs/` is
immediately servable without having to run the pipeline first. CI still regenerates and re-commits it on
every run (see CI section below) — it isn't hand-maintained.

Every page shares the same `.topbar` (brand + `<nav>` linking Indeksy/Sygnały/Rebalanser USA/Rebalanser PL/
Strategia — see `chart.html` below for why it doesn't also link the rebalancer pages↔chart pages) — on
narrow phones the user reported the nav links
themselves getting "lekko ukryty" (slightly cut off): `.brand`'s wordmark (plus, on `index.html`, the
Ctrl+K search trigger next to it) didn't actually shrink below its own content width by default (flex
items' implicit `min-width: auto`), so on a narrow enough viewport it could push `nav` past the edge of
`.topbar` — and since `html`/`body` are `overflow: hidden` (deliberately, so the page itself never
scrolls), anything pushed outside was simply unreachable, not just visually squeezed. Fixed with `.topbar
.brand { min-width: 0; text-overflow: ellipsis; }` (so the wordmark truncates instead of forcing extra
width) and `.topbar nav { flex-shrink: 0; }` (so the nav — what the user actually needs to click — is
never what gives way first); `.topbar-left` on `index.html` already had `min-width: 0`; this closes the
same gap for `.brand` inside it and for `rebalance.html`/`chart.html`, where `.brand` is `.topbar`'s direct
flex child (no `.topbar-left` wrapper there).

- **`index.html` / `js/app.js` ("Indeksy", renamed from "Dashboard") + `signals.html` / `js/signals.js`
  ("Sygnały") — ONE page split into two, at the user's explicit request ("Zmien nazwe z Dasbort na idexy,
  i wyciagnij Wybicie, TTM squeez oraz continuation do innej strony").** `index.html`'s topbar link went
  from "Dashboard" to "Indeksy" (same page, same `js/app.js`, no functional change) — it's the six
  per-universe momentum tables (SP500…sWIG80) plus Ctrl+K search. The three cross-universe screener tabs
  that used to live alongside them — **💥 Wybicie**, **🧨 TTM Squeeze**, **🚀 Continuation** (with its
  "🏆 Tygodniowi zwycięzcy" sub-table and the "🔄 Odśwież dane D1" GitHub Actions button) — moved verbatim
  to a brand-new page, `signals.html`/`js/signals.js` (name picked freely, since the user only asked for
  "some other page"; "Sygnały" = "Signals", matching what these three tabs actually are: trading-signal
  screeners, as opposed to Indeksy's plain per-universe replications). The screeners' own logic
  (`classifyWybicie`/`combinedWybicieCandidates`/`classifyTtmSqueeze`/`combinedTtmSqueezeCandidates`/
  `classifyContinuation`/`combinedContinuationCandidates`/`classifyWeeklyWinner`/`combinedWeeklyWinners`/
  the whole GitHub-Actions daily-refresh mechanism) is an UNCHANGED, direct move — every mechanic described
  in the next several paragraphs below (thresholds, sliders, sidebar tile wording, the daily-refresh flow)
  is exactly as documented, just physically living in `signals.js` now instead of `app.js`, and the sidebar
  groups/drawer tabs/tables/`localStorage` keys living in `signals.html` instead of `index.html` — read any
  "`app.js`"/"the dashboard" in those specific paragraphs as "`signals.js`"/"the Sygnały page". `signals.js`
  has its OWN `loadData()` (same all-6-`UNIVERSES` fetch `app.js` already had, plus the same optional
  `continuation.json` daily-override fetch) and its OWN, smaller `state` (no per-universe drawer concept —
  `state.drawerUniverse` only ever holds `"WYBICIE"`/`"TTM_SQUEEZE"`/`"CONTINUATION"`/`"QULLAMAGGIE"` (the
  last added later, see the dedicated "🎯 Qullamaggie" bullet below), defaulting to
  `"WYBICIE"`) — entirely independent of `app.js`'s own `state`, same "two pages, two independent states"
  convention already established by `rebalance.html`/`rebalance_pl.html`. `signals.html` has no Ctrl+K —
  that's a "jump to any ticker to see its chart" convenience that stays specific to Indeksy's full
  per-universe tables; Sygnały's own tables are already a short, pre-filtered list, so the shortcut wasn't
  worth duplicating.

  **`js/chart-modal.js` is a NEW shared file this split required** — both pages need the exact same "click
  a row/tile → open a modal with the 5-panel stage-analysis chart, optionally switch to the TradingView
  company-data tab, optionally go fullscreen" experience, so that whole mechanism (`findRsEntry`/
  `selectTicker`/`openChartModal`/`closeChartModal`/`initChartModal`/`updateChartArea`/
  `updateChartTickerLabel`/`initOpenTvButton`/`initResetZoomButton`/`initChartFullscreen`/
  `initChartViewTabs`/`renderTvOverviewPanel`/`tvRowButtonHtml`/`bindTvRowButtons`, plus the small
  `decorateTile`/`latestRsLong` sidebar-tile helpers) was extracted out of `app.js` into `js/chart-modal.js`
  — the same "genuinely shared, not copy-pasted" reasoning that already produced `js/shared.js`/
  `js/chart-render.js`/`js/table-render.js`/`js/qol.js`/`js/minicharts.js`, just one file later. Loaded
  right after `js/chart-render.js` (which it depends on for `renderRelativeStrengthChart`/
  `destroyChartInstances`/etc.) and before `js/table-render.js`/`js/app.js`(or `js/signals.js`) on both
  pages. Unlike every other shared file so far, its functions reach into a `state` global it does NOT
  itself declare — `state` is declared once per consuming page (`app.js`'s own, or `signals.js`'s own,
  different shape) and `chart-modal.js`'s functions just read/write it as an ordinary global, the same
  cross-file-global pattern as always, just with the roles reversed (a file loaded BEFORE the page's own
  script reaching into something THAT script defines, matching how `js/qol.js` already reaches into
  nothing of app.js's but is itself reached into — here it's the mirror case). `selectTicker()`'s
  row-highlight query was generalized from an explicit list of table IDs (`#momentumTableBody`,
  `#wybicieTableBody`, ...) to a class-based `table.momentum-table tbody tr` selector as part of this move,
  since the exact set of tables now differs by page and a shared function can't hardcode either page's
  specific IDs. `tests/js/chart-modal.test.js` covers `findRsEntry` (the only pure-ish piece, given a
  test-provided global `state`); the rest is DOM-coupled and untested, consistent with `js/chart-render.js`.
  `tests/js/signals.test.js` carries over every Wybicie/TTM Squeeze/Continuation/daily-refresh test
  unchanged from the old `tests/js/app.test.js`, now requiring `signals.js`; `tests/js/app.test.js` keeps
  only the Ctrl+K (`buildSearchIndex`) test and the `minicharts.js` tests it always incidentally covered.

  `UNIVERSES` in `app.js` (kept in sync with
  `run_query.py`'s own `UNIVERSES`) stays the full SP500/NASDAQ100/DOWJONES/WIG20/mWIG40 five — every
  universe's JSON is always loaded (`loadData()`), it drives Ctrl+K search regardless of what has a
  dashboard tab. `SIDEBAR_TAB_UNIVERSES = ["SP500", "NASDAQ100", "DOWJONES",
  "WIG20", "MWIG40", "SWIG80"]` is the separate list that actually drives sidebar tiles
  (`renderSidebarTiles()`) and the per-universe drawer tabs. **Version history**: SP500/NASDAQ100 were
  once REMOVED from it (the RSM screener below had grown broad enough that a dedicated momentum table felt
  redundant), then RESTORED at a later, explicit user request ("Dodaj do głównego dashboardu SPMO
  replikację ... i Nasdaq100") — the SP500 tab is the dashboard's view of the S&P 500 Momentum Index
  replication (what the SPMO ETF tracks), NASDAQ100 the same for Nasdaq 100 Momentum; both tables read
  `constituents` (the top-quintile selection with `compute_weights` weights), not `all_constituents`.
  SP500 is now the default drawer tab (`state.drawerUniverse`) and so also supplies the default selected
  ticker on first load. `jumpToTicker()` (used by Ctrl+K's `confirmCmdkSelection()`) still guards against
  a universe without a tab: it updates the chart/selection but does not try to switch the drawer to a tab
  that doesn't exist. **Global Equity Momentum has no dashboard panel/tab at
  all any more** — it briefly moved to being the rebalance calculator's selection engine instead of a
  look-only screen, and even that role is gone now that the calculator is fully automatic over a fixed pool
  (see the dedicated GEM section above and the `rebalance.html`/`rebalance.js` bullet below); `app.js` no
  longer fetches `global_equity_momentum.json`, and neither does `rebalance.js` any more.

  **"💥 Wybicie" screener tab** (`data-universe="WYBICIE"`) — REPLACED the two earlier RSM tabs ("📈 RSM
  Stabilne"/"🚀 RSM Wzrostowe", `classifyRsm`/`combinedRsmCandidates`/`renderRsmPanel`/
  `renderRsmScreenerTable` — all removed at the user's explicit request, "Usuń z Dashboard RSM wzrostowe i
  stabilne"). `classifyWybicie(ticker, universe, c)` keeps a constituent only when ALL THREE hold: weekly
  MACD (`macd_chart.macd`) crossed zero UPWARD, the RS 52-week line shown on the TTM Squeeze panel
  (`mansfield_chart.rsm_long`) crossed zero UPWARD, and the TTM Squeeze histogram
  (`ttm_squeeze_chart.histogram`) is currently positive. "Crossed" = `weeksSinceZeroCrossUp()`: the latest
  non-null value is > 0, counted as weeks since the most recent week it was <= 0 (whole series by default).
  Two user-controlled sliders above the table (`#wybicieControls`, shown only on this tab, persisted in
  `localStorage` key `momentum_dashboard_wybicie`, added at an explicit follow-up request): **"Okno wybicia"**
  (`state.wybicieWindowWeeks`, 0-26, default 6) — max gap in weeks between the MACD cross and the RS 52W
  cross, so both signals count as ONE breakout; **"Monitoruj po wybiciu"** (`state.wybicieMonitorWeeks`,
  1-52, default 6) — how many weeks after the breakout (= the LATER of the two crosses, `breakoutWeeks`)
  the stock stays listed, as long as MACD/RS 52W/TTM histogram are all still > 0 (any of them dropping
  below zero removes it immediately). `combinedWybicieCandidates()` runs it over every
  universe's `all_constituents`, dedupes tickers present in two universes (first in `UNIVERSES` order
  wins), sorts freshest breakout first (`breakoutWeeks`), then by histogram. Same sortable/
  stage-filterable table shape as TTM Squeeze (`renderWybicieTable()`/`wybicieRowHtml()`), plus a matching
  sidebar tile group (`renderWybiciePanel()`, `#tiles-WYBICIE`).

  **A "Tryb" (mode) selector** — two buttons above the table (`#wybicieModeMacdRsBtn`/
  `#wybicieModeMacdOnlyBtn`, styled like `.stage-filter-btn`, persisted alongside the two sliders in the
  same `momentum_dashboard_wybicie` `localStorage` key as `mode`) — was added at the user's explicit
  request ("do panelu wybicia dodaj selector bez wybicia RS 52 tygodnie, samo MACD tygodniowe"):
  **"MACD + RS 52 tyg."** (`state.wybicieMode = "MACD_RS"`, the default — unchanged behavior, exactly as
  described above) vs. **"Samo MACD tygodniowe"** (`"MACD_ONLY"`) — which drops condition 2 (the RS 52-week
  zero-cross) ENTIRELY: only the MACD zero-cross-up (condition 1) and a positive TTM histogram (condition 3)
  are required. `classifyWybicie(ticker, universe, c, opts)` takes `opts.mode` (defaulting to
  `state.wybicieMode`, same pattern as `opts.windowWeeks`/`opts.monitorWeeks`); in `"MACD_ONLY"` mode
  `breakoutWeeks` is simply `macdCrossWeeks` — there's no second cross to compare it against, so **"Okno
  wybicia" has no meaning in this mode and its slider (`#wybicieWindowRow`) is hidden** (via
  `applyWybicieModeVisibility()`) while it's active; "Monitoruj po wybiciu" still applies, gating on
  `macdCrossWeeks` alone. The RS 52-week line is NOT dropped from the constituent requirement or the table —
  it's simply no longer a FILTER: `rsLong` is read if present (a missing `mansfield_chart`/`rsm_long` no
  longer disqualifies a row in this mode, unlike `"MACD_RS"` mode, which still requires it), `rsLongNow`/
  `mini_rs` are populated whenever available and shown in the "RS 52 tyg." column purely as information (its
  cell color now reflects the ACTUAL sign, `positive`/`negative`, rather than always `positive` as before,
  since a row in this mode is not guaranteed to have a recent/any upward RS cross), and `rsCrossWeeks`/
  `mini_rs_cross` stay `null` when there wasn't one (the column then shows the current value with no
  "(N tyg. temu)" age suffix, or a plain "—" when RS data itself is entirely missing for a constituent).
  Switching modes re-renders both the table and the sidebar tile group immediately
  (`renderWybiciePanel()`/`renderWybicieTable()` from the button's click handler, same as the two sliders'
  own `input` handlers) and widens the result set considerably (roughly 20→38 constituents in a spot check)
  since one of the three original AND-conditions is gone.

  **"🚀 Continuation" screener tab** (`data-universe="CONTINUATION"`, PREPROJEKTOWANY NA TYGODNIOWY —
  a later, separate explicit user request: "rezygnuje z dziennych danych, za duzo zachodu", after the user
  shared a video about a weekly "lateral consolidation breakout" strategy and asked for a review of how
  close our own approach already was — see the version-history paragraph below for the full account and
  what survived from that review vs. what didn't). Current design: a stock ALREADY in a dynamic Stage 2
  that is consolidating (or just broke out of a consolidation) on the exact same WEEKLY TTM Squeeze
  (`ttm_squeeze_chart`) that "🧨 TTM Squeeze"/"🎯 Qullamaggie" already read — filter only, the user decides
  entries/exits. `classifyContinuation()` in `signals.js` (moved from `app.js`, see the dedicated
  `signals.html`/`signals.js` bullet above):
  - **Trend gate** (`continuationWeeklyGate()`, unchanged since the D1 version): weekly `current_stage`
    2A/2B, `momentum_pct > 0` (and `>=` slider), latest `rsm_long > 0` (classic 52-week Mansfield RS).
  - **Consolidation** (same squeeze-window logic as `classifyQullamaggie()`, just different default
    thresholds and NO prior-move requirement — this is what still tells the two tabs apart): 🌀
    "squeeze" when `squeeze_count` falls inside `[state.contMinConsolidationWeeks,
    state.contMaxConsolidationWeeks]` (default **6-16 weeks** — the reference video states "at least 6
    weeks, longer is often better," with no stated upper bound; 16 is a practical slider ceiling, not a
    rule from the video), or 🔥 "fired" when a squeeze inside that same window ended within
    `state.contFireLookbackWeeks` (default 3) weeks ago with a positive histogram (an upside breakout).
  - **Weekly MACD confirmation** (`macd_chart`, informational, `fired` only): `macd_confirmed` is
    `macd.macd > macd.signal` at the fire week, matched by date (same pattern as `breakout_volume_ratio` in
    Qullamaggie) — modeled on the reference video's own rule ("always want the MACD line above the signal
    line"). Doesn't reject the row either way, same "quality signal, not a hard gate" philosophy as
    Qullamaggie's volume badge.
  - **"Poziom do obserwacji" / sugerowany stop**: `breakout_level: breakoutLevelFor(c)` — the SAME shared
    helper Qullamaggie uses (`js/minicharts.js`), now also returning a `stop` field (see the version-history
    paragraph below).
  Four sliders (`#continuationControls`, `localStorage` key `momentum_dashboard_continuation`): min/max
  consolidation weeks (default 6/16), fire lookback (default 3), min 12M momentum (0% — the user:
  "powyżej zera jest ok"). Sidebar tile group `#tiles-CONTINUATION`.

  **REMOVED along with the move to weekly: the "🏆 Tygodniowi zwycięzcy" sub-table and the whole daily-data
  layer it and Continuation were built on** (`daily_squeeze`, `run_query.py::compute_daily_squeeze()`,
  `docs/data/continuation.json`, the "🔄 Odśwież dane D1" GitHub Actions button, `refresh_daily.py`, and
  `.github/workflows/daily_continuation.yml`) — see the version-history paragraph immediately below for why
  and what replaced each piece. "🏆 Tygodniowi zwycięzcy" (`combinedWeeklyWinners()`/`renderWinnersTable()`)
  used to show EVERY stock passing the weekly trend gate regardless of D1 setup, as a superset of
  Continuation; it lost its reason to exist once Continuation itself became weekly-only (its own table
  already shows exactly "who passed the gate, with which squeeze status" — there is no separate
  daily-vs-weekly distinction left to show a superset of).

  **Version history — why Continuation moved off daily data, and what a "lateral consolidation breakout"
  video changed.** The user shared a video describing a weekly swing-trading strategy — market-trend filter
  (S&P 500's 10-week EMA above its 20-week EMA), a stock trading above its own 20-week MA, a
  multi-week ("at least 6 weeks, longer often better") tight consolidation box, a weekly MACD requirement
  (MACD line above its signal line), specific breakout-candle quality filters (upper wick under 50% of the
  candle's range, a 10-week closing high, a 5-20% weekly gain), and — the part that mattered most here — a
  stop-loss rule: split the consolidation box into three equal thirds, ignore the top and bottom thirds
  (too early / too late), and place the initial stop at the bottom of the MIDDLE third, later raised to that
  week's low on the first weekly MACD bearish cross (MACD closing below its own signal line) after the box.
  The user's own read, after reviewing it against this codebase, was that "co robimy jest bardzo podobne na
  tygodniowym wykresie" (what we already do is very similar on the weekly chart) — and asked, separately, to
  finally give up on Continuation's daily layer ("rezygnuje z dziennych danych, za duzo zachodu bazuje na
  weekendowcyh" — too much manual upkeep, and D1 data going stale over a weekend until someone clicks
  "Odśwież dane D1"). Three concrete, adopted outcomes came out of that review:
  1. **Continuation's consolidation detection moved from a DAILY TTM Squeeze to the WEEKLY one** (same
     mechanism `classifyQullamaggie()`/`classifyTtmSqueeze()` already use) — this alone made the whole
     `daily_squeeze`/D1-refresh layer unnecessary for Continuation, and (see point 3) for Qullamaggie too.
  2. **A weekly MACD confirmation** was added to Continuation's "fired" case, directly modeled on the
     video's own MACD-above-signal rule (`macd_confirmed`, informational — see above).
  3. **`breakoutLevelFor()` (js/minicharts.js) now also returns a `stop` field** — the bottom of the box's
     middle third (`support + (resistance - support) / 3`), directly modeled on the video's stop-loss rule,
     computed from the SAME close-only `squeezeConsolidationBox()`/Darvas-style box this helper already
     builds (see that function's own bullet above) rather than a new, separate notion of a box. This is
     purely informational, same as the rest of this field — nothing in this app places or manages stops
     automatically.
  What the review deliberately did NOT adopt, and why: the video's raised-stop's exact
  MACD-cross-then-that-week's-low mechanic (kept as a simple informational box-third level here, not a
  live, continuously-updated trailing stop tied to a specific entry date — this app has no concept of "when
  you entered a position," being a screener, not a portfolio tracker) and the breakout-candle upper-wick
  filter (needs weekly Open/High, not just Close/Low — see `low_pct` under `compute_relative_strength_chart`
  above for what's already exported) were left for a future request rather than folded in speculatively.

  **A SECOND, separate review pass — same video, re-shared by the user with "sprawdz ta strategie i czy
  czegos nam brakuje w naszej kluczowego" (check this strategy and whether we're missing anything crucial in
  ours) — added three more pieces from it, all client-side, all from data already exported (no new backend
  fetch needed):**
  1. **A market-wide regime filter** (`state.marketTrend`, `#continuationMarketBanner` in `signals.js`) —
     the video's own "if the index's 10-week EMA isn't above its 20-week EMA, stay in cash" rule, computed
     as NEW `ema10w`/`ema20w`/`weekly_ema_bullish` fields on `compute_sp500_trend_filter()`'s existing return
     dict (a cheap addition — that function already fetches and resamples SP500's weekly closes for its
     40-week SMA, so a 10/20-week EMA pair on the SAME already-fetched series costs nothing extra) — a
     DIFFERENT signal from that function's own `in_growth_phase` (SMA200-daily/SMA40-week), not a replacement
     for it; `sector_strategy.json`'s `trend` object (already fetched by `strategy.js`) now carries both.
     `loadData()` in `signals.js` fetches this same file (new fetch, but a cheap, already-generated static
     JSON, not a new pipeline computation) purely for this banner. Deliberately INFORMATIONAL, not a row
     filter — Continuation's own candidates are NOT hidden when the market is bearish, matching the exact
     same "never hide candidates over a market-level filter" precedent `strategy.js`'s own step 1 already
     set (see that section) rather than introducing a harsher, inconsistent convention here.
  2. **A 10-week-closing-high requirement on "fired" rows** (`ten_week_high`, `CONTINUATION_TEN_WEEK_HIGH_WEEKS`
     = 10) — computed by comparing the fire week's `close_pct` against the trailing 10 weeks of the SAME
     already-exported array (comparing `close_pct` values directly is valid because they all share one
     `close0` baseline — no need to reconstruct real prices). Unlike the MACD/volume badges elsewhere in
     this module, this one is a HARD gate — but only when actually measured false; too little history
     (`null`) passes through rather than rejecting, the same graceful-degradation convention as everywhere
     else in this codebase.
  3. **A breakout-week gain filter in [5%, 20%]** (`breakout_gain_pct`,
     `CONTINUATION_MIN_BREAKOUT_GAIN_PCT`/`MAX_BREAKOUT_GAIN_PCT`) — the video's own breakout-candle-quality
     rule, reconstructed from two adjacent `close_pct` values (both relative to the same `close0`, so their
     ratio gives the real week-over-week % change without reconstructing absolute prices). Same hard-gate
     rule as point 2: rejects only a real, measured violation, never a `null`.
  Both new gates are fixed constants, not sliders — the user didn't ask for them to be tunable, and they're
  meant to mirror the reference strategy's own stated numbers exactly, unlike the consolidation-length
  window (which already had sliders before this review and stays adjustable). The upper-wick filter and
  the live raised-stop remain the two pieces genuinely left out (see above) — everything else client-side
  computable from already-exported data was adopted in this pass.
  **Removing the daily layer also fixed, as a side effect, a real staleness bug**: `classifyQullamaggie()`'s
  own `return_1m_pct`/`return_3m_pct`/`return_6m_pct` used to read `c.daily_squeeze` too (see that section's
  version-history paragraph for the specific incident — the committed `docs/data/*.json` had gone stale
  relative to those fields) — they now read `weeksAgoReturnPct(c, weeks)` (`js/minicharts.js`), which
  reconstructs a real historical price purely from the ALREADY-EXPORTED `weekly_chart.close_pct` (no new
  backend field, no dependency on any pipeline run having ever populated `daily_squeeze`), closing that
  staleness gap for good rather than just working around it.
  **"💥 Wybicie" mini-charts** (later addition, same request as the universe-table/TTM-Squeeze visuals
  below): a price sparkline column, plus `zeroLineSparkSvg`/`crossIndexInTail` (js/minicharts.js) turn the
  raw MACD/RS-52W numbers into small oscillator charts with a gold dot marking the zero-cross week —
  `crossWeeksHtml` text stays as the tooltip/inline label, the chart is what you glance at.

  **"🎯 Qullamaggie" screener tab** (`data-universe="QULLAMAGGIE"`, explicit user request: replicate
  Kristjan Qullamaggie's breakout-scanning approach — screen for a large prior move, wait through a
  multi-week consolidation, buy the breakout on volume, time the actual entry against an intraday Opening
  Range Breakout + session VWAP). This is deliberately built from data this pipeline ALREADY has, not a
  new fetch: performance (`return_1m_pct`/`return_3m_pct`/`return_6m_pct` — reconstructed purely from the
  ALREADY-EXPORTED `weekly_chart.close_pct` via `weeksAgoReturnPct(c, weeks)` in `js/minicharts.js`, NOT
  from any backend field — see the version-history paragraph under "🚀 Continuation" above for why this
  moved off the earlier `c.daily_squeeze`/`compute_daily_squeeze()` entirely) and consolidation/breakout
  (the SAME weekly `ttm_squeeze_chart` the "🧨 TTM Squeeze" tab already reads, just with the
  consolidation-length WINDOW narrowed to a user-adjustable range instead of an open-ended "> 5 weeks"
  minimum — the user's own first description was "4-6 tygodni", later corrected to **2-8 tygodni** (see the
  version-history paragraph below) after reviewing this whole tab against Qullamaggie's own "The Breakout"
  reference diagram, i.e. a real base, not the short-pause idea "🚀 Continuation" itself moved away from —
  see that bullet's own version-history paragraph). `classifyQullamaggie()` in `signals.js`:
  1. **Performance** — `perfPct = return_6m_pct` must clear the "Min. wynik (6M)" slider (default 30%, the
     same threshold Qullamaggie's own scan uses). **This replaced an earlier `max(return_1m_pct,
     return_3m_pct, return_6m_pct)` OR-across-three-windows version** (itself the user's own correction to
     an original AND, "for the performance i think need to be or not and check") — simplified again, a
     later, separate explicit user request made during the Wybicie-vs-Qullamaggie overlap review below: the
     6-month window in practice already covers a move that only just (within the last 1 or 3 months)
     pushed the price up 30%+, since the price from 6 months ago is usually close to the price from 1-3
     months ago unless there was an offsetting move in between — so a separate OR across three windows was
     an unneeded complication once the user re-examined it. `return_1m_pct`/`return_3m_pct` are still read
     and shown (the "Wynik 6M" column's tooltip breakdown, `qmPerfCellHtml()`) purely as context, not as a
     second way into the gate any more — a stock with a big 1M/3M pop but a 6-month return below the
     threshold no longer qualifies, which is the one behavior change worth testing explicitly (see
     `tests/js/signals.test.js`).
  2. **Consolidation** — same "walk back to the last week that actually has a computed `squeeze_on`" logic
     as `classifyTtmSqueeze()` (the current week is often still `null`), but `squeeze_count`/
     `fire_consolidation_weeks` must fall INSIDE `[state.qmMinConsolidationWeeks,
     state.qmMaxConsolidationWeeks]` (defaults 2-8, both adjustable sliders — see the version-history
     paragraph below for why this was widened from an original 4-6) rather than merely exceeding a
     floor — either still consolidating (🌀) or fired within `state.qmFireLookbackWeeks` (default 3, also a
     slider) weeks ago (🔥) with a positive current histogram (an upside breakout, not a breakdown — same
     reasoning `classifyTtmSqueeze`'s own `histNow > 0` check already documents above). Since a squeeze
     lasting only `QM_TIGHT_RANGE_MAX_WEEKS` (2) weeks or fewer is, on duration alone, weak evidence of a
     genuine base rather than one ordinary low-volatility week, such a short squeeze needs an ADDITIONAL
     confirmation — see the version-history paragraph below.
  3. **Volume confirmation at the breakout week** — the user's "wait for the breakout with volume" step,
     read from the WEEKLY chart's own `buying_volume_ratio` (the same CLV-derived buying-volume series/
     `STAGE_BREAKOUT_VOLUME_RATIO` (1.5x) threshold the main stage-analysis chart already uses for its
     brighter-green volume bars — see Relative strength above) at the specific week the squeeze fired.
     `ttm_squeeze_chart` and `weekly_chart` are NOT guaranteed to share the same array length/alignment
     (different warm-up buffers — see `alignSqueezeToDates()` in `js/chart-render.js`), so the breakout
     week is looked up by DATE (`weekly_chart.dates.indexOf(...)`), not by reusing the TTM array's own
     index directly. Shown as "· wolumen ✓/✗" next to the fire badge — informational (doesn't drop the row
     either way; the row already qualified on the squeeze itself), since even Qullamaggie's own volume
     read is a judgment call a screener shouldn't silently veto.
  Table/sidebar tiles follow the exact same shape as "🧨 TTM Squeeze" (`qmRowHtml()`/
  `renderQullamaggieTable()`/`renderQullamaggiePanel()`), plus a "Wynik 1/3/6M" column showing the max
  return with a tooltip breakdown of all three windows, and a **"Poziom do obserwacji" column**
  (`qmLevelCellHtml()`) — added right after shipping the tab, when the user pointed out that just opening
  the "⚡ 1 min + VWAP" chart still didn't say AT WHAT PRICE to watch for the breakout ("when we have
  consolidation we draw the trend line connecting highs to track when will need to monitor 1 minute. Now
  is hard to know where and when to look"). Both this column AND the chart-modal tab (see that bullet
  below) read `breakoutLevelFor(c)` — a shared helper in `js/minicharts.js` — so the same number shows up
  whether the user is scanning the table or already has the chart open.

  **Consolidation window widened from 4-6 to 2-8 weeks, plus a tight-range confirmation for very short
  (1-2 week) squeezes — a later, separate explicit user review** against Qullamaggie's own "The Breakout"
  reference diagram (a whiteboard-style explainer slide the user shared showing the daily setup: a big
  prior "stair step" move, then 2-8 weeks of tight consolidation, then the breakout). Two concrete findings
  came out of that review: (1) the tab's own default consolidation window (4-6 weeks) was narrower than
  the 2-8-week range the reference diagram itself states — `QM_DEFAULT_MIN_CONSOLIDATION_WEEKS`/
  `QM_DEFAULT_MAX_CONSOLIDATION_WEEKS` were widened accordingly (the sliders already supported this range,
  1-12/1-20 — only the DEFAULTS were narrower than the textbook figure); (2) a squeeze lasting only 1-2
  weeks is, on duration alone, too little to reliably tell a genuine tight consolidation from one ordinary
  low-volatility week that happens to trip the Bollinger-inside-Keltner test — a real gap the 4-8-week case
  doesn't have, since a squeeze that survives that many weeks is already good evidence of a real base by
  duration alone. The user's own fix, given directly rather than as an abstract requirement: for a squeeze
  of `QM_TIGHT_RANGE_MAX_WEEKS` (2) weeks or fewer, additionally require that price actually stayed inside a
  genuinely tight range during that squeeze — specifically the spread between the consolidation's own
  high and low must fall within `QM_TIGHT_RANGE_MIN_PCT`-`QM_TIGHT_RANGE_MAX_PCT` (5%-20%) of the low, not
  wider (not a real squeeze) and not narrower either (the user's own inclusion — a near-zero range this
  short is more likely a data/rounding artifact than a tradable base). `qmTightRangeConfirmed()` in
  `signals.js` computes this from the exact same, already-existing `squeezeConsolidationBox(c)` window
  (`js/minicharts.js` — see the `breakoutLevelFor()` version-history paragraph below for what it already
  computes: the highest/lowest WEEKLY CLOSE over the squeeze's own weeks) rather than adding a new,
  separate notion of "high"/"low" — this deliberately reuses the same close-only convention the rest of
  this module's Darvas-box machinery already uses (see `_compute_weinstein_stage_series` under Relative
  strength above: Darvas boxes are close-only by design, not real intraday/daily High/Low swings), so no
  pipeline change or new exported field was needed for this. Weeks above `QM_TIGHT_RANGE_MAX_WEEKS` skip
  this check entirely — the length of the squeeze is already sufficient confirmation on its own there, per
  the user's own framing of the fix ("jezeli jest squeez ok 4-8 tygodni to tam [otwieramy] bramkę").
  This whole review deliberately did NOT add a daily 10/20/50-MA-stack filter or an explicit Weinstein-Stage
  gate (both considered and offered, matching two other elements visible on the same reference diagram) —
  the user's own call was that the TTM-Squeeze-duration/tight-range combination above is already a good
  enough trend/quality confirmation on its own, without duplicating a second, separate trend filter the way
  `coreCandidateRows()`'s now-removed hardcoded stage tiebreak once did on the rebalancer's Core sleeve (see
  design-history step 7 under "What this repo is" above for that precedent). The review also reconfirmed,
  at the user's own explicit acknowledgment, that this screener's universe stays limited to the five
  dashboard indices rather than a broader pool like the Nasdaq Composite Qullamaggie's own scan actually
  draws from — a deliberate, accepted trade-off against the extra yfinance fetch that would require, not an
  oversight.

  **"Doesn't Qullamaggie overlap with 💥 Wybicie? If so, merge them, favoring Qullamaggie" — a later,
  separate explicit user question, answered empirically rather than by inspecting the code alone.** Both
  tabs are momentum/breakout screeners on the same universes, so the question was reasonable, but they
  gate on genuinely different things: Wybicie requires a fresh MACD zero-cross-up + RS-52-week
  zero-cross-up + positive TTM histogram (a broad "trend/RS just turned bullish" signal, no prior-move or
  consolidation-length requirement at all), while Qullamaggie requires a large prior move AND a
  specific-length TTM squeeze (a narrow "already ran, based, now breaking out" signal). Running both
  screeners against the actual committed `docs/data/*.json` (a Node script requiring `combinedWybicieCandidates`/
  `combinedQullamaggieCandidates` from `signals.js` directly, not a synthetic example) found 20 Wybicie
  candidates vs. 3 Qullamaggie candidates with exactly 1 ticker in common — i.e. genuinely disjoint
  populations, not two variants of the same scan. Merging and favoring Qullamaggie's stricter criteria
  would have thrown away 17 of Wybicie's 20 candidates for near-zero gain, so **the two tabs were kept
  separate, unmerged** — the right call given the data, not a default to inaction. That same check also
  surfaced a real, separate staleness finding worth recording: at the time of this review, `docs/data/*.json`
  had `return_1m_pct` on every constituent's `daily_squeeze` but `return_3m_pct`/`return_6m_pct` on NONE of
  them (0 of 500 SP500 rows) — the committed export simply predates the code that added those two fields
  (see point 1 above), so `combinedQullamaggieCandidates()`'s old `max(1M, 3M, 6M)` OR was, on the live
  site at that moment, silently only ever evaluating `return_1m_pct` for every ticker. This is a data
  freshness gap the next `weekly_full_refresh.yml` run (or an earlier manual `workflow_dispatch`) closes on
  its own — `run_query.py` itself already computes both fields correctly, nothing in the code needed
  fixing for this — but it is the direct reason the 6M-only simplification in point 1 above will show ZERO
  Qullamaggie candidates until that next full refresh actually populates `return_6m_pct` site-wide, not a
  regression from the simplification itself.

  **`breakoutLevelFor()`'s FIRST version read `weekly_chart.pending_base`** (the independent Darvas-box
  mechanism, see `compute_relative_strength_chart`/`_compute_weinstein_stage_series` under Relative strength
  above) — the user immediately caught why that was the wrong source ("wykrywamy squeeze więc czemu nie
  narysować boxa po X tygodniach konsolidacji ... to i tak poda top i bottom" — "we're already detecting the
  squeeze, so why not draw the box from those very consolidation weeks — that already gives a top and
  bottom"): the Darvas box tracks its OWN, unrelated definition of top/bottom (3 weeks without a new
  CLOSING high/low), so it routinely covers completely different weeks than whatever `ttm_squeeze_chart`
  itself flagged as the consolidation — a stock this very screener called "consolidating" would often have
  no `pending_base` at all (explaining the "only two stocks show a level" report), or one describing a
  stale, unrelated box. **Fixed by `squeezeConsolidationBox(c)`** (`js/minicharts.js`, new primary source,
  entirely client-side from fields already exported — no pipeline change, works immediately on already-
  committed `docs/data/*.json`): takes the resistance/support directly from the SAME weeks
  `ttm_squeeze_chart` itself used to call the row "consolidating" or "fired" — for a still-consolidating
  row, the last `squeeze_count` weeks (ending at the current week); for a fired row, the
  `fire_consolidation_weeks` weeks immediately BEFORE the fire week (`fireIdx = nowIdx - weeks_since_fire`,
  window = `[fireIdx - fire_consolidation_weeks, fireIdx - 1]` — derived from reading `_ttm_squeeze_series()`'s
  own `fire_consolidation = squeeze_count.shift(1).where(fired)` line) — then takes the highest/lowest
  WEEKLY CLOSE (`weekly_chart.close_pct`) over exactly that window, joined to `ttm_squeeze_chart.dates` by
  DATE (not index — same buffer-length-mismatch caveat as the `breakout_volume_ratio` lookup in
  `classifyQullamaggie()` above). `breakoutLevelFor()` now tries this FIRST and only falls back to
  `weekly_chart.pending_base`/last `bases` entry when there's no active or just-fired squeeze at all (e.g.
  a ticker opened from a general table, not from a squeeze screener) — converted back to a real price via
  the same `close0 = price / (1 + close_pct[last]/100)` convention `js/strategy.js::strategyStopFor()`
  already uses. `pending: false` (the Darvas-fallback-to-`bases` case, or a squeeze-derived box for a
  "fired" row) renders the number at reduced opacity — still shown as a reference point, just
  not a "wait for this" level any more. **Entry timing (the ORB/session-VWAP part of the
  original strategy) is intentionally NOT automatically computed at all** — see the dedicated "⚡ 1 min + VWAP"
  chart-modal tab bullet further below for why (needs intraday data this pipeline doesn't fetch) and how
  the user actually watches for it (a TradingView 1-minute + VWAP widget in the same chart pop-up every
  other screener already opens). This tab is purely the "which stocks are worth watching today" filter,
  now WITH the price level that makes that actually actionable — same "screener finds candidates, human
  decides entries/exits" philosophy as every other tab on this page.

  **Sidebar tiles get a stage color + RS direction dot** (`decorateTile()`, called from
  `renderSidebarTiles()`/`renderWybiciePanel()`/`renderTtmSqueezePanel()`/`renderContinuationPanel()`/
  `renderQullamaggiePanel()`): a
  bottom inset border in the ticker's Weinstein-stage color (`STAGE_COLORS`) plus a small green/red dot
  (RS 52-week ≥ 0 / < 0) in the corner — a tile now says something without being clicked.

  **REMOVED: on-demand daily refresh ("🔄 Odśwież dane D1")** — this whole mechanism (`runDailyRefresh()`/
  `pickDispatchedRun()`/`refreshProgressFromJobs()`/`githubRepoFromLocation()` in `signals.js`, the GitHub
  PAT form, `refresh_daily.py`, `.github/workflows/daily_continuation.yml`, `docs/data/continuation.json`)
  existed to give "🚀 Continuation" fresher-than-Saturday D1 data via a browser-triggered GitHub Actions
  workflow_dispatch, without a daily cron on a static site. It was removed entirely once Continuation
  itself moved to the weekly cadence every other screener already runs on — see the version-history
  paragraph under "🚀 Continuation" above for the explicit user request and reasoning. Nothing replaced it;
  there is no longer a "fresher than the weekly export" concept for this tab to refresh.

  **Layout: full-screen table + chart in a pop-up** (explicit user request: "rozwijaj tabele na cały ekran",
  chart "jako pop up window a nie za tabelą", "z X do zamknięcia", "nie potrzebuje tego otwierać w tle").
  `.table-drawer` is now static and always open (fills the width next to the sidebar; the old `>>>` toggle
  and click-outside-to-collapse are gone). `.charts-area` lives inside `#chartModal`
  (`.chart-modal-backdrop`, hidden by default): `selectTicker()` calls `openChartModal()` BEFORE
  `updateChartArea()` (Chart.js measures the canvas at creation — a hidden modal would give 0×0), and
  `closeChartModal()` (✕ `#chartModalClose`, Esc, click on the backdrop) destroys the charts BEFORE hiding.
  Nothing is pre-selected on load. The Esc listener is registered before `initChartFullscreen()` so Esc in
  chart fullscreen only leaves fullscreen. `syncChartsCrosshair()` skips charts whose `canvas` is null —
  hiding the modal fires `mouseleave` under a hovering cursor, which used to update already-destroyed
  charts ("ownerDocument"/"fullSize" errors). On phones the modal is simply full-screen; `chart.html`'s
  standalone `.charts-area` is untouched.
  **Mini visuals in the universe tables and the TTM Squeeze tab** (same inline-SVG building blocks as
  Continuation): `miniVisualFields(c)` (last `MINI_WEEKS` = 26 weeks of `close_pct`/`ema20_pct`, TTM
  `histogram`/`squeeze_on`/`fired`, latest `rsm_long` → sortable `rs_long`), `weeklySparkSvg(closes, ema,
  squeeze?)` (optional red squeeze bars), `rsBarHtml()` (diverging bar around 0, capped at `RS_BAR_CAP` = 50),
  `ttmMiniSvg()` (TradingView-style 4-color histogram + red/gold/gray dots). Universe tables add "Tydzień
  (26 tyg.)", "RS 52 tyg.", "TTM (26 tyg.)"; TTM Squeeze adds "Cena (26 tyg.)" (with squeeze bars), "TTM
  (26 tyg.)", "RS 52 tyg.". `#breadthBar`/`renderBreadthBar()`/`stageBreakdown()`: stacked bar of the
  WHOLE universe's (`all_constituents`) Weinstein stages above universe tables; clicking a segment clicks the
  matching `#stageFilterBar` button.

  **A second full, sortable, stage-filterable screener tab, "🧨 TTM Squeeze"**, sits next to the Wybicie
  tab (`data-universe="TTM_SQUEEZE"`) — the user's own redirect away from plain performance numbers
  (see the removed `growth_chart` panel, above) toward stocks that already have momentum but are sitting
  through a multi-week consolidation. `classifyTtmSqueeze(ticker, universe, c)` requires
  `momentum_score > 0` ("mają Momentum") and reads the constituent's `ttm_squeeze_chart` (see
  `compute_ttm_squeeze_chart()` above), walking back from the newest week to the latest one that actually
  has a computed `squeeze_on` (the same "current week often still null" caveat as `classifyRsm`), then
  classifies into **consolidating** (`squeeze_on === true` and `squeeze_count > TTM_SQUEEZE_MIN_
  CONSOLIDATION_WEEKS`, 5 — "akcje które miały więcej niż 5 tygodni konsolidacji") or **fired**
  (`weeks_since_fire <= TTM_SQUEEZE_FIRE_LOOKBACK_WEEKS`, 3, AND `fire_consolidation_weeks >
  TTM_SQUEEZE_MIN_CONSOLIDATION_WEEKS`, AND the current histogram value (`histNow`) is **positive** — a
  breakout, to the UPSIDE, out of a long-enough squeeze within the last 3 weeks, literally "akcje które
  zaczynają ruszać po takiej konsolidacji"); these constants are duplicated client-side and must stay in
  sync with the same-named constants in `run_query.py`. **The `histNow > 0` condition on "fired" was added
  after the user pointed out the screener wasn't checking which way the histogram actually broke** — the
  backend's `fired`/`weeks_since_fire`/`fire_consolidation_weeks` fields (`compute_ttm_squeeze_chart()`)
  only mark the week a squeeze turned off, with no opinion on direction, so without this check a stock that
  broke DOWN out of a consolidation (negative histogram) was being listed as "fired" right alongside a
  genuine bullish breakout — the opposite of what "akcje, które zaczynają ruszać" (stocks starting to move
  [up]) asks for. `squeezeStatusFor()` in `js/strategy.js` (used by the Krok 3/Krok 4 tables' "🔥 Wybicie"
  badge, and duplicating these same two constants — see that bullet below) got the identical fix for the
  same reason and must stay in sync on this condition too, even though the funnel's own `evaluateCandidate`
  ENTRY gate was already separately requiring `mom.value > 0` and did not mis-signal an actual buy. Neither
  bucket, and the ticker doesn't appear — same "selected screener, not a full list" philosophy as RSM.
  `combinedTtmSqueezeCandidates()` runs this over all 5 universes' `all_constituents` and returns one flat,
  pre-sorted list (fired first — most recent breakout on top — then consolidating, longest squeeze on top);
  `renderTtmSqueezeTable()`/`ttmSqueezeRowHtml()` render it with a "Status" column
  (`ttmSqueezeStatusHtml()` — 🔥 for fired, 🌀 for consolidating) and a "Konsolidacja" column (weeks). The
  sidebar also gets a matching `🧨 TTM Squeeze` tile group (`renderTtmSqueezePanel()`, `#tiles-TTM-squeeze`),
  same pattern as the RSM groups.

  The per-universe momentum table (`renderTable()` — `added_tickers`/`dropped_tickers` are exported in the
  JSON but not currently rendered) carries an "Etap" (Stage) column (`stageCellHtml()`, reading
  `constituent.weekly_chart.current_stage`) and a **stage filter bar** above it (`#stageFilterBar`,
  `initStageFilter()`/`matchesStageFilter()`) — "Wszystkie" (all), "Etap 1", "Etap 2" (matches *both* `2A`
  and `2B` — a user thinks of Stage 2 as one thing, not two), "Etap 3", "Etap 4". Since the RSM
  Stabilne/Wzrostowe tabs (and now TTM Squeeze too) also cover full universes with a real `current_stage`
  per row, the stage filter bar is shown for all three of those tabs too (previously hidden for the single
  old RSM/GEM tabs, which were already-filtered, differently-shaped lists) — `initStageFilter()`'s click
  handler, and the sortable `<th>` click handler in `initDrawer()`, both dispatch to whichever
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
  tabs (`DOWJONES`/`WIG20`/`MWIG40`) plus the two RSM tabs and the TTM Squeeze tab are the only way to
  reach any of this on mobile — `showDrawerTable(universe)` dispatches on the tab key. Every ticker in the main per-universe
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
  since it works for every ticker regardless of chart-data availability. When shown, it's **five stacked
  Chart.js panels, the fifth (Mansfield RS) optional/collapsed by default**
  (`renderRelativeStrengthChart()` — lives in `js/chart-render.js`, not `app.js` itself, see the dedicated
  `chart.html`/`chart-render.js` bullet below for why — Chart.js itself is vendored locally, along with
  `chartjs-plugin-zoom` and `chartjs-plugin-annotation`, see `docs/js/vendor/` under the Frontend intro
  above for why this is no longer a CDN script). **There is no "last 3 months" range toggle any more**
  (`#chartRange3mBtn`/`#chartRangeFullBtn`/`sliceWeeklyChartToRange()`/`state.chartRangeMode` — all
  REMOVED) — the chart always shows the whole available window (up to ~14 months): the user tried the
  3-month default for a while and found it actually less readable than the full range, the opposite of
  the assumption that motivated adding it, so the whole toggle was removed rather than just flipping its
  default.

  **A THIRD chart-view tab, "⚡ 1 min + VWAP"** (`#chartViewTabOrb`/`#chartPanelOrb`, `TV_ORB_WIDGET`/
  `renderOrbPanel()` in `js/chart-modal.js` — the file that now actually owns this mechanism, see the
  dedicated `signals.html`/`signals.js` bullet above for why the "two tabs ... in `app.js`" wording just
  above is legacy: `initChartViewTabs()`/`renderTvOverviewPanel()` were extracted into shared
  `js/chart-modal.js` when `signals.html` split off `index.html`, and both pages load it) — added at the
  user's explicit request while replicating Kristjan Qullamaggie's breakout-scanning approach (see the
  "🎯 Qullamaggie" screener tab under the dedicated `signals.html`/`signals.js` bullet above): his method
  times the actual ENTRY with an Opening Range Breakout (ORB) against the session VWAP on a 1-minute
  chart. That timing is deliberately NOT automated — it would need intraday (minute-level) data and a
  live/same-day refresh, and this pipeline only ever fetches daily bars on a weekly cadence (see Pipeline
  architecture above); adding a minute-bar fetch would be a genuinely different architecture, not a tab.
  Instead this tab is a single embedded TradingView Advanced Chart widget (same `buildTvWidgetBlock()`
  block-building helper the "🏢 Dane spółki" tab already uses, just one widget instead of a whole
  "vizytówka" stack) pinned to `interval: "1"` with `studies: ["VWAP@tv-basicstudies"]` — TradingView's own
  VWAP study resets every SESSION, unlike the existing `vwap_pct` line on panel 1 of the own weekly chart
  (below), which is anchored once at the momentum window's start and never resets — two genuinely
  different indicators that happen to share a name; this tab exists specifically because that weekly one
  is the wrong timeframe for timing an actual intraday breakout — so the user watches the
  live 1-minute/VWAP picture themselves and decides the actual entry/stop by hand, the same
  "screener finds candidates, human decides entries/exits" philosophy every other screener in this app
  already follows. A user-facing decision made explicitly for this feature: a POP-UP tab inside the
  existing shared chart modal, not a hover preview — a hover would need the TradingView `<script>` to load
  on `mouseenter` (visibly laggy) and doesn't work on touch at all, which matters since this is a PWA used
  on phones too; every other "see more for this ticker" affordance in the app (the 📈 chart button, the
  "🏢 Dane spółki" tab) is already a click/tap-triggered panel, so this follows the same convention rather
  than inventing a new one. Not present on `chart.html` — same "wider dashboard feature, out of scope
  here" reasoning `chart.html`'s own bullet below already gives for skipping the "🏢 Dane spółki" tab.

  **`#orbLevelInfo` — a real-user-reported gap fixed shortly after shipping the tab**: the embedded
  TradingView widget alone shows the 1-minute candles + VWAP but says nothing about WHERE the breakout
  actually is, so the user still had to guess/switch back to the weekly chart to read the base's level —
  "when we have consolidation we draw the trend line connecting highs to track when will need to monitor 1
  minute. Now is hard to know where and when to look". TradingView's free "Advanced Chart" embed (no
  account/Charting Library) has no config option to draw a custom horizontal line onto the live widget, so
  the fix is a plain text bar (`renderOrbLevelInfo()`) directly above the widget inside `#orbContainer`,
  showing the resistance (▲, green) and support (▼, red, when known) of `breakoutLevelFor(state.
  currentRsEntry)` — see the "🎯 Qullamaggie" bullet above for the full mechanism (`weekly_chart.
  pending_base`, `js/minicharts.js::breakoutLevelFor()`) shared with that tab's own "Poziom do obserwacji"
  column. Re-rendered from both places `renderOrbPanel()` is called (tab switch and ticker change), same
  as the widget itself. `.orb-level-info`/`.orb-level-value` in `style.css`.
  1. The main price+EMA20+VWAP chart (formerly the "10:30" SMA10/SMA30 chart — see the version-history
     note under Relative strength above), rebased to 0% at the momentum window's start. **It no
     longer plots the stock's own index level** — removed at the user's explicit request, since it left
     two overlapping price-shaped lines competing on one % axis for a comparison the Mansfield RS panel
     (5, below) already expresses more directly as a single oscillator. The backend still exports
     `index_pct` on every `weekly_chart` record (nothing downstream needed a schema change) —
     `renderRelativeStrengthChart()` in `js/chart-render.js` is simply the one place that stopped reading
     it into a dataset. Darvas boxes
     (see `bases` above) are drawn directly on this chart as rectangles via `chartjs-plugin-annotation`
     (`BASE_BOX_COLORS` — purple for `"stage1"`, gray for `"stage2"`, labeled "Etap 1 (dno)"/"Baza N"), and
     the whole chart is interactive (`chartjs-plugin-zoom`: mouse wheel/pinch to zoom, drag to pan,
     `#resetZoomBtn`/`initResetZoomButton()` to reset). A `#stageBadge` above the chart shows the ticker's
     `current_stage` (`renderStageBadge()`, colored per `STAGE_COLORS`, with a one-line plain-language
     description of what that stage means).
  2. A separate, smaller **volume panel** below it (`#rsVolumePanel`/`rsVolumeChartInstance`) — weekly
     volume as a stacked bar chart (Chart.js `stack: "volume"`) split into `buying_volume` (bottom, brighter
     green when `buying_volume_ratio` clears `STAGE_BREAKOUT_VOLUME_RATIO` — this constant lives in
     `js/shared.js` client-side and must stay in sync with the same constant in `run_query.py`) and
     `volume - buying_volume` (selling, top, red), on its own fully-visible axis. Its X range is kept in
     sync with panel 1 (`syncVolumeXRange()`, called from the zoom/pan plugin's `onZoomComplete`/
     `onPanComplete` callbacks) so both panels always show the same weeks.
  3. **MACD** (`#rsMacdPanel`/`rsMacdChartInstance`, `macd_chart`, see `compute_macd_chart()` above) —
     ADDED directly under the volume panel, at the user's explicit request, as a help with entry/exit
     timing (crossovers of the MACD/signal lines, the histogram crossing zero). Standard 12/26/9 periods,
     computed on WEEKLY closes (the same rhythm as every other indicator in this stack, not literally the
     daily-close convention the numbers "12/26/9" usually imply) — a mixed Chart.js chart: a histogram
     (`macd - signal`, same 4-color scheme as the TTM Squeeze histogram below — `macdHistColors` in
     `renderRelativeStrengthChart()`) plus the MACD line and the signal line overlaid. Non-interactive,
     same as the panels below it. `alignMacdToDates()` pads it to the same full date array as panel 1,
     exactly like `alignSqueezeToDates()`/`alignMansfieldToDates()` do, so all panels share one X scale.
  4. The TTM Squeeze panel (`ttm_squeeze_chart`, see `compute_ttm_squeeze_chart()` above) — replaces an
     earlier panel that plotted the stock's own raw 1/3/6-month rolling % growth (`growth_chart`, removed
     at the user's request in favor of finding momentum names coming out of consolidation). A Chart.js
     mixed chart (`type: "bar"` with one `type: "line"` dataset overlaid): the histogram bars are the
     momentum oscillator, colored with the classic 4-color TTM Squeeze scheme (bright/dark green above
     zero, bright/dark red below, by sign and whether the bar is rising or falling vs. the previous one —
     see `histColors` in `renderRelativeStrengthChart()`); a row of dots pinned to the zero line
     (`dotColors`) marks the squeeze state per week — red while the squeeze is on (consolidating), gold on
     the single week it fires (breaks out), gray afterward, transparent while not yet computed (BB/KC
     warmup). **Also carries the long-term (~12M/52-week) Mansfield RS line** (`rsm_long`, labeled "RS 52
     tyg."), MOVED here from panel 5 at the user's explicit later request: both indicators "oscillate
     around zero," so one combined glance — the histogram (when momentum is accelerating/consolidating)
     alongside this line (whether the stock is stronger/weaker than its own index over the long term) —
     reads the trend more clearly than two separate, mostly-collapsed panels did. Drawn in a bright sky
     blue (`#38bdf8`, `rsLongDataset` in `renderRelativeStrengthChart()`) deliberately not reused from any
     other color already in this panel (histogram greens/reds, squeeze dot gold/red/gray) or panel 5's own
     palette (blue/purple for short/medium) — it's meant to visually dominate as the panel's headline trend
     signal. It's the only dataset here with its own legend entry (`legend.labels.filter` — histogram/dots
     still have none, same as before); the caption gets a `+ RS 52 tyg. vs {universe}` suffix when present.
     Non-interactive, same as the MACD/Mansfield panels; `alignMansfieldToDates()` is now computed ONCE,
     before this panel, and reused by panel 5 below rather than recomputed twice.
  5. The Mansfield RS oscillator — now just short-term/medium-term lines (`rsm_short`/`rsm_medium`; the
     long-term line lives in panel 4 now, see above) — the ONLY panel showing the stock's strength against
     its own benchmark index (`rsEntry.universe`), since panel 1's index line was removed (see above):
     above zero means the stock is currently outperforming that index over the given smoothing window,
     below means it's lagging. **Moved to the very bottom and made OPTIONAL** at the user's explicit
     request (`#rsMansfieldPanel`, `hidden` by default) — `#rsMansfieldToggleBtn` (a small "📉 Pokaż RSM ▼"
     / "📉 Ukryj RSM ▲" button right above the panel, `rs-mansfield-controls` in `style.css`) shows/hides
     it, via ONE shared toggle (`mansfieldPanelVisible`/`applyMansfieldPanelVisibility()`/
     `initMansfieldControls()`, all living in `js/chart-render.js` since both `app.js` and `chart.js` need
     it) that behaves identically in the normal view and in fullscreen mode — this REPLACED an earlier,
     fullscreen-only "📉 RSM" opt-in toggle that lived only in
     `#chartFullscreenExtras`/`chartFullscreenExtras.mansfield` (see `initChartFullscreen()` in `app.js`):
     now that the panel is optional everywhere, not just in fullscreen, a single toggle covers both cases
     instead of two separate mechanisms. **Individual lines are also optional** — "along with showing
     individual lines" was the user's own explicit ask — but this reuses Chart.js's own built-in
     legend-click-to-toggle behavior (clicking a legend entry already toggles that dataset's visibility)
     rather than adding bespoke per-line buttons: on every (re)render, only the medium-term line starts
     visible (`hidden: false`) — short-term starts `hidden: true`, and a click on its legend entry reveals
     it. Medium-term inherited the "always show one line by default" role from long-term once that line
     moved to panel 4 (originally "zawsze włączaj 52-tygodniowy," the user's explicit ask when the panel
     still held all three lines) — medium is the closest remaining approximation of "a stable, less noisy
     trend line" among what's left, a judgment call made when the long-term line moved out, not a separate
     explicit request of its own. Non-interactive — its own window doesn't need zoom/pan.

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
  `height: calc(100vh - 48px)` (see the mobile media query below) shared across the badge + chart panels +
  legend text, so without generous `min-height` floors on each panel, stacked charts plus a stage
  badge and legend can squeeze one or more panels below that threshold and render as a flat, broken-looking
  line — `.rs-chart-container` also has `overflow-y: auto` as a safety net (scroll rather than squeeze, on
  the shortest phones) since even a floor that's *usually* enough can't be a hard guarantee for every device;
  Mansfield RS being collapsed by default now also means one fewer panel's worth of scrolling on a fresh page
  load, on top of that existing safety net.
  WIG20/mWIG40 are PLN-denominated and
  GPW-listed, unlike the rest (USD, NYSE/Nasdaq):
  prices render via `formatPrice()` (`$` vs `zł` by universe, `PLN_UNIVERSES`) and the TradingView symbol
  used by `tvUrlFor()`/`tvRowButtonHtml()` gets a `GPW:` prefix via `tvSymbolFor()` (tracked through
  `state.selectedUniverse`, set alongside `state.selectedTicker` in `selectTicker()`) so the "Otwórz w
  TradingView" link resolves to the correct Warsaw-listed instrument instead of clashing with an unrelated
  ticker on another exchange.
**Universe tables and the "🧨 TTM Squeeze" tab get the same mini-visuals**: a stage-breadth bar above
universe tables (`#breadthBar`/`renderBreadthBar()`/`stageBreakdown()` — clicking a segment clicks the
matching stage-filter button), plus three new columns built from `miniVisualFields()`/`js/minicharts.js`:
a weekly price+EMA20 sparkline, an `rsBarHtml()` RS-52W bar, and a `ttmMiniSvg()` mini TTM Squeeze
indicator (4-color histogram + squeeze/fire dots). TTM Squeeze's own sparkline also marks squeeze weeks
with red bars (`weeklySparkSvg`'s optional `squeeze` argument).

**Layout: full-screen table + chart pop-up, not stacked side by side** — same section as above, see that
bullet for the mechanism (`#chartModal`/`openChartModal`/`closeChartModal`).

- **`rebalance.html` / `js/rebalance.js`** — rebalance calculator, **fully automatic**. All user state
  (holdings, exclusions, settings) lives in `localStorage` only — there is no backend. See the version
  history in "What this repo is" above for the three designs this replaced (region split; a
  `STRATEGY_GEM`/`STRATEGY_WEIGHTED` auto-TOP-N dropdown; a manually-driven, GEM-picks-a-universe-then-you-
  pick-companies stepwise flow). The only thing the user sets is `settings.portfolioSize` (how many
  companies) and the monthly contribution — the rebalancer decides which companies and at what weight.
  - **`REBALANCE_UNIVERSES = ["SP500", "NASDAQ100", "DOWJONES"]`** is `rebalance.js`'s own, deliberately
    smaller universe list — NOT `UNIVERSES` from `js/shared.js` (which stays all 5, since the dashboard
    still needs WIG20/mWIG40 in full). `loadUniverseData()` only fetches these three universes'
    `data/{universe}.json` files (plus `data/all_prices.json` for pricing — see below) — it no longer
    fetches `global_equity_momentum.json` at all.
  - **`combinedPoolRows()`** builds the pool the automatic engine draws from, from three DIFFERENT fields
    per universe (see "What this repo is" above for the exact reasoning behind each): SP500's
    `constituents` (the pipeline's own top-quintile selection — happens to be exactly the "top 100 like
    SPMO" size the user asked for), NASDAQ100's `all_constituents` (the WHOLE index, per an explicit "cały
    nasdaq100" ask), DOWJONES's `constituents` (already the whole index either way). Rows are merged into
    one list and sorted by `momentum_score` descending — comparing it directly across universes is a
    deliberate simplification (documented in the code) carried over from the same convention the prior
    manual-picks design already used when merging picks from different universes. A ticker present in two
    universes at once is deduped to whichever occurrence has the higher `momentum_score`, so N always means
    N distinct companies.
  - **`eligiblePoolRows()`** drops manually-excluded tickers and re-numbers `pool_rank` (1..len) on what's
    left, so an exclusion BACKFILLS from the next-ranked name rather than shrinking the portfolio below N —
    excluding a top-ranked name doesn't mean "N-1 companies," it means "the next one in gets its slot."
    **`autoSelectedRows(n)`** slices the top N of that. **`computeAutoTargets(n, totalCapital)`** is the
    direct successor to the manual design's `computeTargetsFromPicks` (itself successor to the older
    `computeTargetsForUniverse`/`computeTargets`/`computeWeightedTargets` trio) — same weighting rule as
    all of them (weight = each selected company's CURRENT `momentum_score`, normalized to `totalCapital`,
    a conscious simplification vs. the pipeline's own cap-weighting/`compute_weights`), just fed by
    `autoSelectedRows(n)` instead of a manually-curated list. There is no `stale` concept any more (no
    accumulated state to go stale) — a ticker either is in today's fresh TOP N or it isn't.
  - **CORE (60%) / SATELLITE (40%) — `CORE_ALLOCATION_PCT`/`WINNER_INDEX_WEIGHT_MULTIPLIER`/
    `selectCoreSatelliteRows()`/`computeAutoTargets()`** replaced the earlier `DOWJONES_WEIGHT_MULTIPLIER`
    (a flat weight boost for every Dow pick) — a later, separate explicit user request for a proper
    core/satellite portfolio construction, with a "which index is winning" tilt inside the satellite sleeve
    reusing GEM (see design-history step 6 under "What this repo is" above for the full reasoning). The
    split is a HARD CAPITAL split (60%/40% of `totalCapital`, not just a company-count split) — the classic
    core-satellite definition, per the user's own explicit call when asked.
    - **`autoSelectedRows(n)`/`eligiblePoolRows()`/`combinedPoolRows()`** unchanged from before (still rank
      purely by raw `momentum_score`) — SELECTION into the pool is untouched; only which SLEEVE a selected
      company lands in, and how much capital it gets, changed.
    - **`selectCoreSatelliteRows(n)`** splits `eligiblePoolRows()` into `coreRows` (`round(n *
      CORE_ALLOCATION_PCT)` slots) and `satelliteRows` (the rest of `n`). `coreCandidateRows()` builds the
      core candidate list: true DOWJONES members first, true SP500 members second (backfill, only reached
      once Dow itself can't fill every core slot — an explicit user call: "weź z sp500", not "dopełnij
      resztą Dow" and not "zostaw core niedopełniony"), each tier sorted purely by `momentum_score`
      descending — **no separate, hardcoded Weinstein-stage preference lives inside Core any more** (see
      design-history step 7 under "What this repo is" above): an earlier version sorted Core by "Stage
      2A/2B first, then `momentum_score`" via a since-removed `isGrowthPhase()` helper, which the user
      pointed out duplicated/bypassed the Krok 2 stage-filter bar they were already using to control the
      rest of the pool. `coreCandidateRows()`'s own `pool` argument is already `eligiblePoolRows()` — i.e.
      already filtered by `poolStageFilter` — so selecting a stage in that filter bar narrows Core exactly
      as it narrows Satellite and everything else; leaving it on "Wszystkie" means Core just takes the
      highest-`momentum_score` Dow (then SP500 backfill) names, with stage playing no special role. Satellite
      is simply whatever's left of the pool after removing core's tickers, sorted by `momentum_score`,
      sliced to `n - coreRows.length`.
    - **`trueUniverseTickerSet(universe)`** (generalized from the old `dowjonesTickerSet()`, same
      reasoning) — core selection and the satellite GEM-winner tilt both need PRAWDZIWE membership in a
      universe, not `combinedPoolRows()`'s post-dedup `row.universe` tag (which keeps whichever universe
      scored a ticker higher) — a real Dow 30 name that's also in SP500 with a higher score there would get
      tagged `"SP500"` and silently miss core/the tilt if keyed off that tag instead of true membership.
    - **`computeAutoTargets(n, totalCapital)`** splits `totalCapital` into `coreCapital`
      (`CORE_ALLOCATION_PCT`) and `satelliteCapital` (the rest), each sleeve weighted internally by
      `momentum_score` exactly like before core/satellite existed (one shared `addSleeve()` helper). If
      either sleeve came up with zero rows (e.g. every core candidate got manually excluded, or `n` is so
      small satellite gets 0 slots), that sleeve's capital rolls ENTIRELY into the other rather than
      silently vanishing from the suggestion table — a real edge case caught while writing this, not a
      hypothetical one. Every target now also carries a `sleeve: "core"|"satellite"` field, read by
      `poolRowHtml()` (a "Grupa" column showing Core/Satelita/— instead of the old plain "W portfelu"
      checkmark) and `renderSuggestions()`'s note text.
    - **`WINNER_INDEX_WEIGHT_MULTIPLIER` (1.5, same value/spirit as the old `DOWJONES_WEIGHT_MULTIPLIER`)
      tilts SATELLITE weight only** toward true members of whichever of SP500/NASDAQ100/DOWJONES is
      currently winning the trailing-12-month Global Equity Momentum race (`satelliteWinnerUniverse()`,
      reading `gemIndexReturns` — fetched fresh in `loadGemReturns()` from
      `docs/data/global_equity_momentum.json`, filtered to `REBALANCE_UNIVERSES`). This is GEM as an actual
      consumer of `rebalance.js` again (it fetches the file once more, after step 4 removed that fetch
      entirely) — but as a pure weight-tilt signal inside satellite, not as the universe-picker it used to
      be pre-step-4. `renderCoreSatelliteNote()` (`#coreSatelliteHint`) shows the live split and which
      index (if any) satellite is favoring, refreshed on every `refreshOutputs()` call. Tune either constant
      directly in `rebalance.js` if the effect should be stronger/weaker.
  - **`poolStageFilter` (`#poolStageFilterBar`) is a REAL SELECTION filter, not just a table display
    filter** — a later, separate explicit user correction ("jak zaznaczę [filtr] to ma taki N z tej listy
    wybrać, po to jest tam to filtrowanie" — "when I check [a stage filter], it should pick that N from
    THAT [filtered] list — that's the whole point of the filtering"): an earlier version applied this
    filter only inside `renderScreenerTable()`'s row-filtering step (cosmetic — hid non-matching rows from
    the table, but `pool_rank`/the automatic TOP N were still computed against the FULL, unfiltered pool),
    which meant checking e.g. "Etap 2" visually narrowed the table without actually changing what the
    engine would buy — exactly the disconnect the user flagged. **`eligiblePoolRows()` itself now filters
    by `matchesPoolStageFilter()`** (moved up next to `poolStageFilter`'s own declaration, before
    `combinedPoolRows()`/`eligiblePoolRows()`, so the dependency reads top-to-bottom) — `pool_rank` is
    assigned AFTER this filter (same "re-number after narrowing" idiom as the exclusion filter above), and
    since `autoSelectedRows()`/`computeAutoTargets()` both build on `eligiblePoolRows()`, a stage filter now
    genuinely means "only ever buy from this stage." MULTI-SELECT (`"ALL"` sentinel or a `Set` of
    `"1"`/`"2"`(both `2A`/`2B`)/`"3"`/`"4"`) for the same reason the prior manual-picking design already had
    it: a user comparing candidates cares about Etap 1 and Etap 2 names side by side, not just one stage at
    a time. **The stage-filter click handler must call `refreshOutputs()`, not just `renderPoolTable()`** —
    a real bug caught before landing: without it, toggling a stage filter updated the ranking table (and
    its correct, narrower `pool_rank`s) but left the suggestion table/Monte Carlo/equity curve showing the
    stale, unfiltered TOP N until some unrelated later interaction (e.g. changing `portfolioSize`)
    happened to trigger a re-render — verified fixed with Playwright (before the fix, toggling "Etap 2"
    left the exact same 10 tickers in the suggestion table; after, it correctly dropped every non-2A/2B
    name and pulled in the next-ranked 2A/2B ones instead).
  - **Krok 2 — `renderPoolTable()`** renders `eligiblePoolRows()` (already stage-filtered per the bullet
    above) as a full, sortable (`compareRows()` from `js/shared.js`, click-to-sort `<th data-key>`) table —
    the same shape/columns as the dashboard's own tables, through the shared `renderScreenerTable()` engine
    (see the `js/table-render.js` bullet below; it no longer passes that engine a `matchesStage` option,
    since the rows it receives are pre-filtered already — the meta line separately shows `allRows.length`
    against a `combinedPoolRows()`-minus-exclusions total so "filter narrowed the pool from X to Y" stays
    visible). **No ROW in this table is clickable to change the selection** — only the filter bar above it
    is. `poolRowHtml()`'s last-but-one column is a plain badge ("✓ w portfelu" / "—") showing whether that
    row's `pool_rank` (already computed within the filtered pool) falls inside the current `portfolioSize`.
    `STAGE_LABELS`/`STAGE_COLORS`/`stageCellHtml()`/`compareRows()` live in `js/shared.js` (see that bullet
    below).
  - A held position that's outside today's TOP N because a stage filter excludes it (rather than because
    its rank simply fell below N within the filtered pool) is flagged in the suggestion table distinctly —
    `"poza filtrem etapu ({label})"` vs. plain `"poza TOP {n}"` — see the dedicated note further below on
    the suggestion table's three-way (four including manual exclusion) reason breakdown.
  - **A dedicated "📈" button per row (`chart-row-btn` in `poolRowHtml()`) still opens `chart.html`** — a
    dedicated, standalone page with just that one ticker's own stage-analysis chart (see the dedicated
    `chart.html` bullet below). It navigates to `?ticker=<ticker>&universe=<universe>&back=rebalance.html`
    (`window.location.href`) — `back` lets `chart.html`'s own "← Powrót" button return here specifically
    (see `resolveBackHref()` in `chart.js`). This piece is unchanged from the prior manual design, including
    its own version history (four designs, landing on "a dedicated button, not a clickable row" specifically
    because a click-anywhere-in-the-row design turned out too easy to trigger by accident — see git history
    for the full account if you need it) — the pool ranking table inherited it as-is when the manual
    picker table it replaced was removed, since the "don't open a chart by accident" lesson applies just as
    much to a read-only ranking table as it did to a table with a pick button in it.
  - **The whole Krok 2 table is collapsible, DEFAULT COLLAPSED** (`poolCollapsed`, `#poolToggleBtn`/
    `#poolCollapsibleContent`, `localStorage` key `momentum_rebalance_pool_collapsed`) — added after the
    user reported that with ~150-250 rows in the pool (SP500 top 100 + full Nasdaq 100 + full Dow Jones),
    scrolling past the whole table just to reach "Obecne pozycje"/"Sugerowany rebalans" further down the
    page was too much. `#poolCollapsibleContent` wraps the stage-filter bar + `.table-wrap` (NOT the
    `<h3>`/`#poolMeta`/hint text, which stay visible either way — so a collapsed card still tells you the
    pool size and TOP N count without expanding it); toggling sets the wrapper's `hidden` attribute (same
    idiom as `#loadingOverlay` in `js/qol.js`) and flips the button's own label between `"▼ Rozwiń"`/
    `"▲ Zwiń"`. Persisted per-browser like every other rebalancer preference (holdings/exclusions/settings)
    — defaults to collapsed only when nothing is stored yet (`localStorage.getItem(...) === null`), so an
    explicit "rozwiń" choice survives reloads instead of resetting every visit.
  - **Holdings and exclusions are one flat, universe-agnostic list**, exactly as in every earlier design —
    one `holdings` array (ticker + shares) and one `excluded` array of tickers, entirely independent of the
    pool/selection. `currencyOf(ticker)` (via `priceMap[ticker].sources`, defaulting to USD for an
    unrecognized ticker) is used ONLY to format an individual holding-table row (price/value cells) in its
    own native currency — it still works for a legacy WIG20/mWIG40 holding even though the pool itself
    can't produce one any more, because `priceMap` is still built from `data/all_prices.json`, which the
    pipeline still exports for all 5 universes regardless of what `rebalance.js` itself fetches.
    `holdingsValue()`/`excludedValue()`/`holdingShares()`/`targetCapital()` are unchanged.
  - **Two separate money formatters, not one, unlike every earlier design.** `currentMoneyFmt()` — used for
    the pool/ranking, suggestion table, stat-cards, Monte Carlo, and equity curve — is now just a constant
    (`fmtMoney`), because `REBALANCE_UNIVERSES` is always USD; it stays a named function purely so the code
    reads as "USD on purpose," not "USD because no one got around to it." `holdingsMoneyFmt()` is new and
    separate: it drives ONLY the "Analiza portfela" donut (which reflects actual holdings, not the pool),
    deriving PLN-vs-USD-vs-mixed from the currencies of whatever is currently held — the same "mix raw
    numbers without FX conversion when currencies are mixed" convention every earlier design already used
    for this (`holdingsValue()`), kept alive specifically because a legacy WIG20/mWIG40 holding can still
    exist even though the automatic engine will never buy into one again. `moneyFmtForCurrency(currency)`
    remains the explicit-currency formatter for individual holdings-table rows.
  - A held position that isn't in today's automatic TOP N is flagged in the suggestion table with ONE of
    three notes, checked in this order (`renderSuggestions()`, using `poolTickers` = `combinedPoolRows()`
    tickers and `eligibleTickers` = `eligiblePoolRows()` tickers, i.e. the SAME stage-filtered set
    `autoSelectedRows()` draws from): `"poza TOP {n}"` (in the eligible/filtered pool, just ranked below N)
    — `"poza filtrem etapu ({label})"` (in the raw pool but the active stage filter excludes it — new,
    added alongside making the stage filter a real selection filter, see above; without this a filtered-out
    holding would misleadingly read "poza TOP {n}" as if only its RANK were the issue) — or `"poza pulą
    rebalansera (SP500 / Nasdaq 100 / Dow Jones)"` (not in the pool at all regardless of any filter — most
    commonly a legacy WIG20/mWIG40 position). Manual exclusion (`"wykluczone ręcznie"`) is still checked
    first, before any of these three.
  - The "Wynik historyczny" equity-curve panel still goes through **`blendEquityCurves(fractions)`**
    (`fractions` from `deriveUniverseFractionsFromTargets(targets)`, fed by `computeAutoTargets()`'s output
    instead of picks — otherwise unchanged) — with a single-universe TOP N (common when `portfolioSize` is
    small) this just returns that universe's own unmodified `docs/data/equity_curve.json` curve; with a TOP
    N spanning two or three of SP500/NASDAQ100/DOWJONES (the normal case at a more typical `portfolioSize`)
    it blends `momentum_index`/`benchmark_index` across them, restricted to common dates. No FX conversion
    needed (every curve is already normalized to a base of 100 by `compute_equity_curve`).
    `normalizeWeights()` only recognizes keys in `REBALANCE_UNIVERSES` now (a stray WIG20/mWIG40 weight,
    which nothing produces any more anyway, would simply be ignored rather than included).
  - `parseXtbOpenPositions()` imports an XTB "Open Positions" `.xlsx` export via SheetJS
    (`XLSX.read`, vendored locally at `docs/js/vendor/xlsx.full.min.js` — see the Frontend intro above)
    as a one-shot replacement of the holdings list — unchanged by any of the above.
  - A client-side Monte Carlo simulation (`simulateMonteCarlo`, Chart.js) projects the portfolio's value
    using the capital-weighted average momentum (capped at ±30%/yr) and volatility of the currently
    computed TOP N — explicitly labeled as illustrative, not a forecast; unchanged in spirit, just driven
    by `computeAutoTargets()` now.
  **Pool/holdings/suggestion tables also carry the mini-visuals** (`js/minicharts.js`, same as the
  dashboard): Krok 2's pool table gets a weekly sparkline + RS-52W bar column before "Etap"; the holdings
  table gets a sparkline + stage column (`findConstituent()` looks the ticker up across
  `universeData`, "—" for a ticker outside this page's own universes, e.g. a legacy WIG20/mWIG40 position on
  the USA page); the suggestion table gets a "Mam vs cel" `bulletHtml()` bar (current value vs. target, a
  tick at the target) plus two new stat-cards ("Do kupienia"/"Do sprzedania": count + total $ from the same
  loop that already builds each row's action badge).

- **`rebalance_pl.html` / `js/rebalance_pl.js`** — "Rebalanser PL", a deliberate structural twin of
  `rebalance.html`/`rebalance.js` ("Rebalanser USA") for WIG20/mWIG40 instead of SP500/NASDAQ100/DOWJONES
  (see design-history step 5 under "What this repo is" above for why this is a second page rather than a
  pool switch on the existing one). Loads the same `js/shared.js`/`js/qol.js`/`js/table-render.js` as
  every other page, then its own script — it does NOT load/share any state with `rebalance.js`. What's
  actually different from the USA page, function-by-function:
  - `REBALANCE_UNIVERSES = ["WIG20", "MWIG40"]`, `REBALANCE_UNIVERSE_LABELS = { WIG20: "WIG20", MWIG40:
    "mWIG40" }`. `poolRowsForUniverse()` is simpler than the USA version's: both WIG20 and MWIG40 are
    `EQUAL_WEIGHT_UNIVERSES` in `run_query.py` (no quintile selection — see Pipeline architecture below),
    so `constituents` is already each index's full composition for both, unlike SP500 (quintile) vs.
    NASDAQ100 (needs `all_constituents`) in the USA version — there's no per-universe special case to make
    here.
  - **No CORE/SATELLITE split exists here** (unlike the USA page's design-history step 6) — the whole pool
    is one flat sleeve, weighted purely by `momentum_score`. What PL DOES share with step 6 is a "favor the
    winning index" weight tilt, just sourced differently: `manualReturns` (`{WIG20, MWIG40}`, persisted to
    `localStorage` under `momentum_rebalance_pl_manual_returns`, edited via two Krok 1 number inputs —
    `#manualReturnWig20`/`#manualReturnMwig40`) holds a user-entered trailing-12-month return for each
    index, because — unlike SP500/NASDAQ100/DOWJONES — yfinance has never had historical data for the
    WIG20.WA/MWIG40.WA index tickers themselves (see Global Equity Momentum below), so there's no automatic
    `global_equity_momentum.json` fetch to lean on here the way `rebalance.js` does. This directly revives
    the shape of the old, removed `GEM_MANUAL_KEY` widget (see design-history step 3's note on it) with a
    real job this time. `winnerUniverseFromManualReturns()` picks whichever field is numerically higher
    (null on a tie or when both are blank); `computeAutoTargets()` multiplies that universe's TRUE members'
    (`trueUniverseTickerSet()`, same true-membership reasoning as the USA page's Dow/SP500 checks) raw
    weight by `WINNER_INDEX_WEIGHT_MULTIPLIER` (same constant/value as the USA page's satellite tilt) before
    normalizing — SELECTION stays untouched, same "weight only" principle as everywhere else this pattern
    appears. `renderWinnerNote()` (`#winnerHint`) shows which index (if any) is currently favored and its
    entered return.
  - **`currentMoneyFmt()` is a constant returning `fmtMoneyPln`, not `fmtMoney`** — the mirror image of the
    USA page's own always-USD `currentMoneyFmt()`, since this page's pool is always WIG20+MWIG40, i.e.
    always PLN. `holdingsMoneyFmt()` keeps the same currency-mix-aware logic as the USA page (falls back to
    `fmtMoney` if a held ticker somehow isn't PLN-sourced) purely as a safety net — nothing in normal use of
    this page should ever hold a non-PLN ticker, unlike the USA page's own legacy-WIG20/mWIG40-holding
    rationale for that fallback.
  - **Entirely separate `localStorage` state**: `momentum_rebalance_pl_settings` /
    `momentum_rebalance_pl_holdings` / `momentum_rebalance_pl_excluded` /
    `momentum_rebalance_pl_pool_collapsed`, vs. the USA page's `momentum_rebalance_settings` / etc. — two
    fully independent portfolios that never interact; importing an XTB report on one page never touches the
    other's holdings.
  - Default `portfolioSize` is 10 (vs. 20 for USA) — the combined WIG20+mWIG40 pool is ~55-60 companies
    total, much smaller than the USA pool (SP500 top 100 + full Nasdaq 100 + full Dow Jones), so a smaller
    default TOP N keeps the same rough "meaningful slice of the pool" proportion.
  - The Krok 2 ranking table's "📈" chart button passes `back=rebalance_pl.html` (not `rebalance.html`) so
    `chart.html`'s "← Powrót" button returns to the correct rebalancer page.
  - Everything else — the exclusion list, XTB import/export, the suggestion table's reason breakdown (now
    reading "poza pulą rebalansera (WIG20 / mWIG40)" instead of the USA page's SP500/Nasdaq/Dow Jones
    wording), the stage filter (same real-selection-filter semantics as the USA page), Monte Carlo, and the
    equity-curve blend (`blendEquityCurves`, now blending `docs/data/equity_curve.json`'s `WIG20`/`MWIG40`
    entries instead of `SP500`/`NASDAQ100`/`DOWJONES`) — is a deliberate 1:1 port of the USA page's own
    logic, described in full under the `rebalance.html`/`rebalance.js` bullet above.
- **`edukacja.html` was REMOVED** at the user's explicit request ("Usuń edukacje nie potrzebuje tego juz")
  — it used to be a static, JS-free educational write-up of Stage Analysis in Polish (the 4-stage cycle,
  SMA10/SMA30, base/resistance breakouts, volume confirmation, trailing stop-loss, and a section on what
  the implementation simplifies away from the book). Its topbar `<nav>` link and the "📚 Jak to czytać?"
  links that pointed to it from both stage-filter bars (`index.html`, `rebalance.html`) were removed along
  with it, and its `.edu-*` CSS block in `style.css` was deleted too — nothing else referenced it.
- **`chart.html` / `js/chart.js`** — a standalone, single-purpose page showing ONE ticker's own weekly
  stage-analysis chart (the same "10:30" + volume + Mansfield RS + TTM Squeeze panels the dashboard shows),
  full-page, with no sidebar/table/other-page chrome around it. Exists because `rebalance.js`'s ranking
  table needed a way to open a chart per row (see that bullet above) and the user explicitly wanted a real
  separate page for it, not a mode bolted onto another page — see the version-history note on the
  rebalance.js bullet for the two earlier designs this replaced. `chart.js` reads
  `?ticker=<ticker>&universe=<universe>&back=<url>`
  from the query string (`URLSearchParams`) — `ticker`/`universe` select what to show (fetches only that
  one universe's `data/{universe}.json`, unlike `app.js::loadData()` which loads all 5 — this page only
  ever needs one), and `back` is the literal href the "← Powrót" button navigates to when clicked
  (`resolveBackHref()`: falls back to `document.referrer` when same-origin, then to `index.html`, if `back`
  is missing — so the button is never a dead end even if the page is opened directly). Keeping the target
  in the URL itself (rather than `sessionStorage` or similar) is *how* the page "remembers" where to return
  even across a reload — the whole point of a real URL instead of in-memory page state. `renderChartPanel()`
  is this page's own small equivalent of `app.js::updateChartArea()` — page-specific glue (which ticker is
  currently shown, toggling the `#noChartMessage` fallback) that calls into the SAME shared chart engine
  (below) the dashboard uses; it deliberately has no fullscreen mode (the whole page already is one) and no
  "Dane spółki (TradingView)" tab (a wider dashboard feature, out of scope here). `PLN_UNIVERSES`/
  `tvSymbolFor()`/`tvUrlFor()`/`UNIVERSE_LABELS` come from `js/shared.js` (see that bullet below), loaded
  before this file — they used to be a tiny (3-6 line) local copy here (too small, on their own, to have
  justified a shared file back when only `js/chart-render.js` existed for the ~500-line chart engine
  itself), but became genuine duplication once the exact same lines also existed in both `app.js` and
  `rebalance.js` — `js/shared.js` is what finally gave all these pages one place for this (now also loaded
  by `rebalance_pl.html`, see that bullet above).

  **`<div class="workspace mobile-chart-view">` in the markup, not toggled by JS, unlike `index.html`.**
  `.charts-area`'s mobile CSS (`style.css`'s `@media max-width:640px` block) was written entirely around
  `index.html`'s dual-view dashboard — `.charts-area { display: none; }` by default on a phone, shown only
  once `selectTicker()` (now `js/chart-modal.js`, shared with `app.js`/`signals.js`) adds `.mobile-chart-view`
  to `.workspace` (switching away from the table
  list the user was just looking at). `chart.html` reuses the same `.workspace`/`.charts-area` container
  classes but has no table/list to switch away from — it's a permanent, standalone chart page — and never
  ran any JS that adds that class. Real, user-reported bug: on a phone, this left `.charts-area` stuck at
  its default `display: none` forever, so the whole page below the topbar was blank (no error, no message
  — just background) every time `chart.html` was opened from a phone, including via the `chart-row-btn`
  links from `rebalance.js`'s Krok 2 and `strategy.js`'s Krok 3. Fixed by hardcoding the class directly in
  `chart.html`'s HTML (`class="workspace mobile-chart-view"`) instead of toggling it — this page has
  exactly one state to show, so there's nothing to toggle between. Verified at a phone viewport (390×844):
  all four chart panels render; `index.html`'s own mobile toggle behavior (table first, chart after tapping
  a row) is unaffected, since that page still adds/removes the class dynamically as before.
- **`js/chart-render.js`** — the shared chart-rendering ENGINE itself (`renderRelativeStrengthChart()` and
  everything it depends on: `renderStageBadge()`, `rollingMean()`/`alignMansfieldToDates()`/
  `alignSqueezeToDates()`/`alignMacdToDates()`/`fmtPlDate()`/`syncChartsCrosshair()`/
  `syncVolumeXRange()`, `resetChartZoom()`, `destroyChartInstances()`,
  `applyMansfieldPanelVisibility()`/`initMansfieldControls()` (see the Mansfield-panel bullet above), and
  the five `rs*ChartInstance` module-level `let`s) — extracted out of `app.js` into its own plain
  `<script>` file, loaded by BOTH `index.html` (before `js/app.js`) and `chart.html` (before
  `js/chart.js`). Since this repo has no build step (see Frontend intro above), "shared" here just means
  an ordinary global-scope script both pages load — no modules/bundler, the same pattern
  `js/pull-to-refresh.js` already used for its own (smaller, self-contained) cross-page utility. This is
  what actually makes `chart.html` NOT a duplicate of the dashboard's chart code (see the version-history
  note on the rebalance.js bullet above for the two rejected designs that came before this one) —
  `app.js`/`chart.js` each keep only their own thin, page-specific "which ticker, where do I get the data,
  what does the toolbar look like" glue (`updateChartArea()`/`renderChartPanel()` respectively) and both
  call the exact same `renderRelativeStrengthChart(symbol, rsEntry)`. The function used to also take a
  third `rangeMode` parameter (mechanically renaming `app.js`'s `state.chartRangeMode` read at extraction
  time, with `chart.js` carrying its own local `chartRangeMode` variable for the same purpose) — REMOVED
  along with the whole "last 3 months" range toggle (see the Mansfield/MACD panel bullet above for why);
  the function now always renders the full available window and takes just the two arguments.
  `tests/js/chart-render.test.js` covers the pure-function pieces (`rollingMean`/`alignMansfieldToDates`/
  `alignSqueezeToDates`/`alignMacdToDates`/`fmtPlDate`) the same way `tests/js/app.test.js` used to before
  the move; `renderRelativeStrengthChart()` itself (DOM/Chart.js-coupled) stays untested either way,
  consistent with the rest of this codebase's JS tests.
  `STAGE_LABELS`/`STAGE_DESCRIPTIONS`/`STAGE_COLORS`/`STAGE_BREAKOUT_VOLUME_RATIO`/`BASE_BOX_COLORS`, which
  `renderStageBadge()` reads, have since moved one level further out, into `js/shared.js` (next bullet) —
  they need to be visible to `rebalance.js` too, which doesn't load this file at all (it never renders the
  chart engine itself, only redirects to `chart.html` for that — see the rebalance.js bullet above).

- **`js/shared.js`** — a second, THINNER shared `<script>` file, loaded before `js/chart-render.js`/
  `js/app.js` on `index.html`, before `js/chart-render.js`/`js/chart.js` on `chart.html`, and before
  `js/table-render.js`/`js/rebalance.js` on `rebalance.html` (and, identically, before
  `js/table-render.js`/`js/rebalance_pl.js` on `rebalance_pl.html`) — i.e. on all four pages, unlike
  `js/chart-render.js` above (only `index.html`/`chart.html`) or `js/pull-to-refresh.js` (all four, but a
  smaller, unrelated utility). It exists because `rebalance.html` never loaded `js/chart-render.js` (it has
  no chart engine of its own to share — its ranking table's chart button redirects to `chart.html` instead,
  see the rebalance.js bullet above) and therefore had no common module with `index.html`/`chart.html` at all until
  now — every constant/helper genuinely identical across two or more of `app.js`/`rebalance.js`/`chart.js`/
  `chart-render.js` had to be hand-copied into each one, which is exactly the "copy-paste instead of one
  shared product" the user flagged when asking for this cleanup. `js/shared.js` holds only what was
  actually byte-for-byte identical (or the same function under two names) in at least two of those files:
  `UNIVERSES`, the FULL-form `UNIVERSE_LABELS` (with the " Momentum" suffix — identical between `app.js`
  and `chart.js`), `PLN_UNIVERSES`, `formatPrice()`, `tvSymbolFor()`/`tvUrlFor()` (the two-argument,
  `?universe`-aware version used for TradingView links — NOT `rebalance.js`'s own, deliberately different
  one-argument `tvSymbolFor(ticker)` used only for its TradingView Portfolio CSV export, which stays local
  to `rebalance.js`, see that bullet above), `STAGE_LABELS`/`STAGE_DESCRIPTIONS`/`STAGE_COLORS`/
  `STAGE_BREAKOUT_VOLUME_RATIO`/`BASE_BOX_COLORS`, `stageCellHtml()`, and `compareRows()` (previously
  `app.js`'s `compareRows` and `rebalance.js`'s identically-implemented `comparePickerRows` — now one
  function both files call, including from inside `js/table-render.js`'s default comparator, see below).
  `rebalance.js` keeps its OWN, shorter `REBALANCE_UNIVERSE_LABELS` (no " Momentum" suffix, e.g. `"S&P 500"`
  not `"S&P 500 Momentum"`, and only 3 entries — SP500/NASDAQ100/DOWJONES, since `REBALANCE_UNIVERSES` no
  longer includes WIG20/mWIG40, see "What this repo is" above) as a local `const` — that one was never a
  copy of the same product to begin with, just a different, more compact label set; unifying it would have
  changed visible text on one page or the other, which this refactor deliberately avoids (it changes where
  code lives, not what any page renders). It was originally named `PICKER_UNIVERSE_LABELS`, back when it
  labeled the manual-picking design's Krok 1/Krok 2 buttons/chips — renamed once those were replaced by the
  automatic pool ranking table (same 3-universe label set, just no longer about "picking"). **This local
  `const` must NOT be named `UNIVERSE_LABELS`, even though it briefly was** — a
  real bug shipped in the PR that consolidated `js/table-render.js`+`js/qol.js` into one PR (squash-merged
  as PR #97): `rebalance.js` still declared its own top-level `const UNIVERSE_LABELS`, and since
  `rebalance.html` loads it and `js/shared.js` as two sibling classic `<script>` tags — no
  modules/bundler, see the Frontend intro above — both share ONE top-level lexical scope for `let`/`const`
  in a browser, so the second `const UNIVERSE_LABELS` threw `SyntaxError: Identifier 'UNIVERSE_LABELS' has
  already been declared` at parse time. That aborts the ENTIRE script before a single line of it runs —
  `rebalance.js`'s `init()` never fires, so `hideLoadingOverlay()` (`js/qol.js`) never gets called either,
  and the user is left staring at the "Ładowanie danych…" overlay forever, with no console visible to a
  normal user to explain why. (Plain `function` redeclarations across sibling scripts do NOT throw this
  way — they just silently overwrite each other, same as `var` — which is exactly why `rebalance.js`'s own
  one-argument `tvSymbolFor(ticker)`, mentioned above, safely shadows `js/shared.js`'s two-argument
  version without incident. Only `const`/`let`/`class` redeclaration in the shared top-level script scope
  is a hard error.) Caught after the fact by loading `rebalance.html` with Playwright and checking for a
  `pageerror` event — worth doing again any time a new file introduces ANOTHER top-level `const`/`let`
  that could collide with one already declared in a sibling `<script>` loaded on the same page (verified
  again for `rebalance_pl.html`/`rebalance_pl.js` when that page was added — it has its own, independently
  declared `REBALANCE_UNIVERSE_LABELS`, `SETTINGS_KEY`, etc., but since it never shares a page with
  `rebalance.js`, there's no sibling-scope collision to worry about there, only within a single page's own
  script list). For Node
  (`tests/js/*.test.js`, `require()` instead of `<script>`
  tags — Node has no shared global scope across separately-required files the way sibling `<script>` tags
  in a browser do), every consumer file (`app.js`/`rebalance.js`/`rebalance_pl.js`/`chart.js`/
  `chart-render.js`) opens with
  `if (typeof require === "function" && typeof window === "undefined") { Object.assign(globalThis,
  require("./shared.js")); }` — this re-creates, only under Node, the exact global sharing the browser
  already gives these files for free via script load order; the guard means it's a no-op in the browser,
  where `require` doesn't exist. `tests/js/shared.test.js` covers `js/shared.js`'s own pure functions
  (`formatPrice`/`tvSymbolFor`/`tvUrlFor`/`stageCellHtml`/`compareRows`); the `compareRows` tests that used
  to live in `tests/js/app.test.js` moved there with the function.
- **`js/table-render.js`** — a third shared `<script>` file: the generic sortable/stage-filterable table
  ENGINE (`renderScreenerTable(opts)`) behind all momentum tables — `renderTable()` (per-universe
  drawer table), `renderRsmScreenerTable()` (both RSM Stabilne/Wzrostowe tabs), `renderTtmSqueezeTable()` in
  `app.js`, and `renderPoolTable()` (the rebalancer's ranking table) in BOTH `rebalance.js` and
  `rebalance_pl.js` — the last of which
  is purely informational today (no row click, no toggle button) but still goes through this same engine
  for its shared filter/sort/empty-state/row-building loop, same as when it was a manually-clickable picker
  table under the prior design. All four used to carry their own,
  independently-copied version of the same loop — filter rows by stage, build the "N z M spółek (etap ...)"
  meta line, sort (via `js/shared.js`'s `compareRows()`, see above), clear the `<tbody>`, either show an
  empty-state row or build one `<tr>` per row (with `.row-selected`, a click handler, and an optional
  post-render hook like `bindTvRowButtons`) — differing only in what's genuinely specific to each table: its
  own row-cell HTML, its own meta-line wording, its own empty-state colspan, and what (if anything) a row
  click does (`selectTicker()` on the dashboard; the rebalancer's ranking table sets no `onRowClick` at all
  today). `renderScreenerTable()`
  factors that shared loop into one function; each call site now supplies only the bits that differ, as
  options (`rowHtml`/`metaText`/`onRowClick`/`afterRender`/etc. — see the doc comment at the top of
  `table-render.js` for the full list). One behavior is worth calling out because it's easy to get wrong
  when unifying: `renderTable()`'s weight-bar fill scales against the MAX weight among the rows CURRENTLY
  VISIBLE after the stage filter, not the whole universe — preserved via a `beforeRender(rows)` hook that
  runs after filtering/sorting but before any row HTML is built, exactly where the original computed it.
  Loaded on `index.html` (after `js/shared.js`/`js/chart-render.js`, before `js/app.js`) and
  `rebalance.html`/`rebalance_pl.html` (after `js/shared.js`/`js/qol.js`, before
  `js/rebalance.js`/`js/rebalance_pl.js` respectively) — not needed on
  `chart.html`, which has no tables at all. Like `js/chart-render.js`/`js/shared.js` above,
  `renderScreenerTable()` itself stays untested (DOM-coupled, `document`/`tbody` manipulation) —
  consistent with the rest of this codebase's JS tests, which only cover pure logic.
- **`js/qol.js`** — a fourth shared `<script>` file, loaded on ALL FOUR pages after `js/shared.js`
  (before `js/app.js`/`js/table-render.js` on `index.html`, before `js/table-render.js`/`js/rebalance.js`
  on `rebalance.html`, identically before `js/table-render.js`/`js/rebalance_pl.js` on
  `rebalance_pl.html`, before `js/chart.js` on `chart.html`), holding three independent, user-facing
  quality-of-life pieces the app didn't have before:
  - **`showToast(message, opts)`** — a short, non-blocking toast in the bottom-right corner
    (`#toastContainer`, lazily created on first call) after a user action, with `opts.type` ("info"/
    "success"/"error", colors the toast's left border) and `opts.duration` (default 3200ms). Wired into
    `rebalance.js`'s `initXtbImport()`'s success/error paths (in addition to, not instead of, the existing
    `#importStatus` text — the toast is what a user actually notices; the status text stays as a persistent,
    re-readable record next to the button). It used to also fire from `togglePick()` (manual pick/unpick)
    and the GEM manual-override save/clear handlers — both removed along with the rest of the manual-picking
    design and the GEM widget once the rebalance calculator became fully automatic (see "What this repo is"
    above); `showToast()` itself is untouched, it simply has fewer call sites on this page now.
  - **`initConnStatus()`** — an offline badge (`#connStatus`, added as the last child inside each page's
    `<nav>`, hidden by default) shown only when `navigator.onLine` is false, updated on the `online`/
    `offline` window events. Without it, the Service Worker's network-first-with-cache-fallback (see
    `sw.js` above) meant a user could be looking at stale, cached data after losing connectivity with zero
    indication that's what happened.
  - **`hideLoadingOverlay()`** — hides `#loadingOverlay`, a full-page overlay (spinner + "Ładowanie
    danych…") present by default in each page's HTML right after `<body>`, called once each page's own
    initial data fetch finishes (`loadData()` in `app.js`, `loadUniverseData()` in `rebalance.js`, the
    `data/{universe}.json` fetch in `chart.js`'s `init()` — including chart.js's early-return path when
    `?ticker=`/`?universe=` are missing from the URL, so the overlay never gets stuck showing on a bad
    link). Before this, the first paint of every page was an empty sidebar/table/chart with no indication
    that a fetch was even in progress.

  All three guard on `typeof document === "undefined"` and return immediately rather than throwing — a
  defensive measure for being called outside a real browser DOM at all (Node, `tests/js/*.test.js`, has
  none). `rebalance.js`'s (and identically `rebalance_pl.js`'s) own top-level `init()` is separately gated
  behind the same `typeof document !==
  "undefined"` check, so simply `require()`-ing the module (as `tests/js/rebalance.test.js`/
  `tests/js/rebalance_pl.test.js` do, to reach
  pure functions like `combinedPoolRows`/`computeAutoTargets`) never runs `init()` and therefore never
  reaches these three at module-load time either — the guard inside each of them matters if a test (or any
  other Node caller) ever calls one directly, which is not the case in the test suite today but is cheap
  insurance against exactly that. Each consumer file
  (`app.js`/`rebalance.js`/`rebalance_pl.js`/`chart.js`) opens with a `typeof require === "function" && typeof window ===
  "undefined"` → `Object.assign(globalThis, require("./shared.js")); Object.assign(globalThis,
  require("./qol.js"))` guard so the cross-file globals from BOTH `js/shared.js` and `js/qol.js` resolve
  under Node too — the same cross-file-global pattern `js/chart-render.js` already uses for
  `STAGE_LABELS`/`renderStageBadge`/etc., just applied in the opposite direction (a file loaded BEFORE
  `app.js`/`rebalance.js`/`chart.js` that those files then call into, rather than the other way round).
  `window.setTimeout`/`window.requestAnimationFrame` (not bare `setTimeout`/`requestAnimationFrame`) inside
  `showToast()`/`hideLoadingOverlay()` follow the same convention already used in `js/pull-to-refresh.js`/
  `js/app.js` — accessing them off `window` (itself a declared ESLint global) avoids having to add two more
  one-off browser-timer globals to `eslint.config.js`. `tests/js/qol.test.js` covers exactly the
  no-op-without-a-DOM behavior; the DOM-mutating bodies themselves stay untested, consistent with
  `js/chart-render.js`/`js/shared.js` above.
- **`strategy.html` / `js/strategy.js` — "Stage 2 Continuation" FUNNEL (current design, on top of the sector
  screener below).** At the user's explicit request ("połączyć [strategie] w pełną strategię ... napewno chce
  inwestować w stage 2 continuation za pomocą rs i Ttm squeez"; "nie zmieniaj całej aplikacji, jedynie ...
  zakładkę strategia, jako lejek") the page is now one funnel, computed ENTIRELY client-side from already
  exported `docs/data/*.json` — no pipeline change. A USA/PL toggle (`MARKETS`: USA = SP500 `all_constituents`
  + NASDAQ100 `all_constituents` deduped, PL = WIG20 + MWIG40); per-market total capital in `localStorage`
  (`momentum_strategy_settings`). Portfolio: Core = the user's own ETFs held OUTSIDE this tool, Satellite =
  this funnel, 50/50 (`STRATEGY_SATELLITE_PCT`); risk 1% of TOTAL capital per trade
  (`STRATEGY_RISK_PER_TRADE_PCT`), position value capped at 10% (`STRATEGY_MAX_POSITION_PCT`) — the user's
  own explicit choices. Steps: (1) market filter — USA: `sector_strategy.json`'s `trend.in_growth_phase`;
  PL: synthetic index (`weekly_chart.index_pct`) above its 30-week SMA, per index (`indexTrendFromRows`);
  a failed filter turns ENTRY into `WAIT_MARKET`, never hides candidates; (2) sector gate (USA only) — top
  `STRATEGY_TOP_SECTORS` (3) sectors with RS > 0 (`strongSectorSet`) OR the ticker is in
  `top_rs_companies`; non-SP500 Nasdaq names have no GICS sector and skip the gate; (3) watchlist —
  `current_stage` 2A/2B, latest `rsm_medium` > 0 and `rsm_long` > 0 (null long passes), `momentum_score` > 0,
  `base_count` <= 3 (`evaluateCandidate`); (4) entry — `squeezeStatusFor` = fired (same thresholds as the
  dashboard) AND latest TTM histogram > 0 and rising AND price > stop AND weekly MACD above its signal line
  (`macdConfirmation()` — the bullish MACD cross is the user's ENTRY CONFIRMATION, not a stop rule; without
  it the status is `WAIT_MACD`, "⏳ Czekaj na MACD"); size = `positionSize()`;
  buying-volume >= 1.2x is shown, not required; (5) held satellite tickers (typed by the user) →
  `evaluateHolding()`: EXIT on price < stop / Stage 3-4 / `rsm_medium` < 0, TIGHTEN on recent
  `WARNING_MA_SLOWING` / base > 3 / Stage 1.
  **The stop is the user's own rule, NOT the backend's Weinstein trailing stop** (`strategyStopFor()`, used
  by both steps 4 and 5): start at the MIDPOINT of the last Darvas box (`weekly_chart.bases[-1]`,
  `(resistance_pct + support_pct) / 2`), then after every weekly MACD BEARISH cross (MACD crosses BELOW its
  signal line, `macd_chart`) dated after that box's `end_date`, raise the stop to that week's LOW — only
  ever up. No MACD > 0 requirement (briefly added, then removed at the user's request: Stage 2/TTM Squeeze
  already establish the uptrend, MACD is "tylko dodatkowa polisa"). An earlier version of this used the BULLISH
  cross for the stop; the user corrected it: "przecięcie w dół przy MACD już wzrostowym, przecięcie w górę
  to tylko sygnał potwierdzenia wejścia nie stop loss". The weekly low comes from `weekly_chart.low_pct` (added to `compute_relative_strength_chart` in
  `run_query.py` for exactly this; falls back to the weekly close with `lowApprox` for older JSON). All
  `*_pct` fields convert back to prices via `close0 = price / (1 + close_pct[last]/100)`. With no Darvas box
  in the data window it falls back to `stopPriceFor()` (the Weinstein stop from `stop_level_pct`, read at
  the LAST week only — after `EXIT_STOP` it's intentionally null). If MACD never dips below its signal after
  the box, the stop stays at the box midpoint — that's the rule as specified, not a bug. The old sector-leaders and
  top-10-RS tables stay at the bottom as "Narzędzia pomocnicze" (USA only).
  **Interactive funnel + adjustable criteria** (a later, explicit user request after the first version's
  plain row of count boxes rendered badly on a phone — "zrób to bardziej interaktywne w sensie rzeczywiście
  lejek. Daj też możliwości wyboru kryterium"): `FUNNEL_GATES` is the ordered list of steps (market →
  sector (USA only) → stage → RS → momentum → base → squeeze → entry); the market filter is now a real step
  (a weak market drops everything unless its "Wymagaj" chip is off — the old `WAIT_MARKET` status is gone).
  `renderFunnelViz()` draws each step as a centered bar whose width is proportional to how many companies
  passed (`funnelSteps()`), with a red "−N dropped" badge and a row of criteria chips (`CRITERIA_CHIPS`)
  editing `settings.criteria` (`DEFAULT_CRITERIA` = the agreed strategy; "↺ Przywróć domyślne" resets it).
  `evaluateCandidate(c, ctx, criteria)` reads every threshold from there (allowed stages, which RS windows
  must be > 0, max base, top-N sectors + top-10-RS bypass, squeeze consolidation/fire-lookback weeks,
  MACD/volume entry confirmations → `WAIT_MACD`/`WAIT_VOLUME`). Clicking a step (or its −N badge) sets
  `settings.focusStep`/`focusMode`, and the list below (`rowsAtStep()`) shows the companies that passed —
  or dropped at — that step, sortable by header (`compareListRows`, empty values always last), with `✗ <step>`
  (`failedAt`) as the status of companies that fail later. `strategy.html` loads its CSS/JS with a `?v=`
  query so a phone doesn't keep serving an older cached `style.css` against new markup (what made the first
  version look broken).
  **The three capital percentages are user-editable** (explicit request: "Daj mi pole do dostosowania ile
  procent kapitału"): Satellite %, risk per trade %, max position % — inputs above the allocation
  stat-cards, persisted as `settings.allocation` and clamped by `sanitizeAllocation()` (`ALLOCATION_LIMITS`;
  bad/empty input falls back to `DEFAULT_ALLOCATION`, i.e. the `STRATEGY_*_PCT` constants 50/1/10). All
  three are % of TOTAL capital; Core is simply 100 − Satellite. Shared by both markets (USA/PL), unlike the
  capital amount itself, which is per market/currency. Pure logic is covered in
  `tests/js/strategy.test.js`.
  **Capital management card "💰 Zarządzanie kapitałem"** (`#capitalCard`, explicit follow-up: "kiedy dodawać
  do core a kiedy ujmować na rzecz satelity?"). ONE shared Core for USA and PL, all amounts in **PLN** (the
  user's call — the app has no FX rate), independent of the per-market capital used for position sizing.
  The user types Core value, Satellite positions, Satellite cash and a planned contribution
  (`settings.capital`); `capitalPlan()` (pure, tested) returns the actions under the agreed rules: a
  contribution goes to whichever side is below target first (no selling = no tax); selling only outside a
  ±`STRATEGY_REBALANCE_BAND_PP` (5) pp band and at most once per `STRATEGY_REBALANCE_MIN_DAYS` (90, the
  "✓ Zrobiłem rebalans" button stores the date); an overweight Satellite moves its CASH to Core first and
  never trims winning positions (remaining excess = "no new entries, stop-exit cash goes to Core"); an
  underweight Satellite is refilled from Core only if the funnel currently has ENTRY signals (current
  market) and the Satellite is less than `STRATEGY_SATELLITE_MAX_DRAWDOWN_PCT` (20%) below its peak (peak =
  highest Satellite value seen, updated only on the input's `change` event so retyping a number can't
  inflate it; "↺ Resetuj szczyt" resets it). The Core part of contributions goes to "an ETF on" the index
  winning GEM across ALL indices in `global_equity_momentum.json` (`gemRanking()`; the user picks the actual
  ETF themselves) — or to cash/bonds when every index has a negative 12M return (absolute momentum). The
  card also shows the GEM ranking table.
**Krok 2/3/Krok-4 tables also carry mini-visuals**: `rsBarHtml()` replaces the plain ±number for
`rsm_vs_index_pct`/`rsm_vs_sector_pct`; Krok 2 gets a "Trend RS (26 tyg.)" sparkline
(`zeroLineSparkSvg(sector.rsm_series)`) — `_mansfield_rsm_tail()` in `run_query.py` (a thin wrapper over the
same `_mansfield_rsm_values()` the existing `_mansfield_rsm_current_value()` already computed) exports the
last `SECTOR_STRATEGY_RSM_TAIL_WEEKS`=26 RSM values per sector into `sector_rs.sectors[].rsm_series`;
Krok 3/Krok 4/the funnel's watchlist rows get a weekly price+EMA20 sparkline
(`weeklySparkHtmlFor(rec)`, `rec` = the joined `sp500.json` record already used for stage/TTM Squeeze).

- **`strategy.html` / `js/strategy.js`** — a standalone screener page for the "sector strategy" described
  under Pipeline architecture above (`compute_sp500_trend_filter`/`compute_sector_relative_strength`/
  `export_sector_strategy`, `docs/data/sector_strategy.json`), reached via a "Strategia" nav link
  added next to Indeksy/Sygnały/Rebalanser USA/Rebalanser PL on all pages. Three stacked `panel-card`s follow the strategy's own
  steps: **Krok 1** shows a growth-phase banner (`.trend-banner`, green/red per `trend.in_growth_phase`)
  plus SP500's close/SMA200/SMA40W as stat-cards and a small Chart.js line chart (toggle button pair,
  `js/chart-render.js`-independent — this page doesn't load that file, it's a much smaller, page-local
  chart, same `new Chart({type:"line",...})` pattern `rebalance.js::renderEquityCurve` already uses).
  **Krok 2** is a plain, but CLICKABLE, table of SP500's sectors ranked by Mansfield RS vs. the index
  (`sector_rs.sectors`, `rsm_vs_index_pct` — pure RS, zero momentum, see `compute_sector_relative_strength`
  above) — the strongest one highlighted 🏆 and pre-selected via the existing `.row-selected` class, but
  this is only a SUGGESTION, exactly the same "🏆 = suggestion, not a forced pick" philosophy the rebalance
  calculator's old GEM-driven universe picker used to have (`rebalance.js::renderGemWidget`, before the
  calculator became fully automatic — see "What this repo is" above): clicking ANY row sets module-level
  `browsedSector` and re-renders both Krok 2 (to move the highlight) and Krok 3. This exists because the
  user explicitly asked for it — the strongest sector's own leaders aren't always sitting in a good
  Weinstein stage that particular week, so being able to check a second- or third-place sector that's also
  performing well is a real, needed alternative, not a nice-to-have. `currentSectorRow()` resolves which
  sector row Krok 3 should read (`browsedSector`, falling back to `strongest_sector` before any click) — a
  sector with no ETF data yet (`data_source: "no_data"`, `rsm_vs_index_pct: null` — see
  `compute_sector_relative_strength` above; there is no return-based fallback any more now that the
  strategy is pure RS) gets a small "(brak danych)" note next to its name (`sectorRowHtml()`'s
  `sourceNote`), the same data-provenance-transparency convention used elsewhere in the app (e.g. GEM's own
  `"(ręcznie)"` `manual_entry` label, back when a frontend page still rendered it — see the GEM section
  above).
  **Krok 3** is the top-10%-of-*that*-sector company list — `compute_sector_relative_strength` computes
  `top_companies` for EVERY sector now, not just the strongest one (a `"top_companies"` field nested inside
  each entry of `sector_rs.sectors`, rather than one flat top-level list) specifically so Krok 2's click
  has real per-sector data to switch to instead of only ever being able to show the winner. The company list
  is joined client-side against `docs/data/sp500.json`'s `all_constituents` (fetched alongside
  `sector_strategy.json` in `loadStrategyData()`) by ticker to read each company's
  `weekly_chart.current_stage` (rendered via `stageCellHtml()` from `js/shared.js`, same as everywhere
  else) and `ttm_squeeze_chart`. The Krok 3 heading (`#leadersSectorLabel`) says which sector is currently
  browsed and, when it isn't the strongest one, spells that out explicitly ("przeglądasz zamiast lidera
  X") so it's never ambiguous why the list changed. Both Krok 2/3 tables go through `renderScreenerTable()`
  (`js/table-render.js`, loaded here too) even though neither has a stage-filter bar — reused purely for
  its shared empty-state/meta-line/row-building loop, with `compareFn: () => 0` since both lists already
  come back pre-sorted from the backend; Krok 2 additionally supplies `onRowClick` (Krok 3 doesn't — its
  rows stay non-clickable, only the dedicated "📈" button navigates, same "don't open something by
  accident" lesson already learned once for `rebalance.js`'s own ranking table, see that bullet's
  version-history note). A dedicated "📈" button per Krok 3 row (`chart-row-btn`, exact same pattern as
  `rebalance.js::poolRowHtml`) navigates to `chart.html?ticker=&universe=SP500&back=strategy.html` — this
  page has no chart-rendering engine of its own (doesn't load `js/chart-render.js`),
  same "redirect to the dedicated chart page" choice `rebalance.js` already made for its own ranking table
  (see that bullet's version-history note above for why a real separate page beats an in-page chart).
  `squeezeStatusFor()` is a small, LOCAL, ungated re-implementation of the "walk back to the last week with
  a computed `squeeze_on`, then classify" logic `classifyTtmSqueeze()` (`signals.js`, moved from `app.js`)
  already has — deliberately
  NOT unified with it, because the semantics differ: `classifyTtmSqueeze` is a SCREENER (drops a stock
  entirely when it doesn't clear `TTM_SQUEEZE_MIN_CONSOLIDATION_WEEKS`/`TTM_SQUEEZE_FIRE_LOOKBACK_WEEKS`, or
  when `momentum_score <= 0`), while this page already has a fixed, pre-selected list of top companies from
  Krok 3 and must show SOME status for every one of them, including a "neutral"/"no squeeze data" row
  rather than silently omitting it. The two consolidating/fired THRESHOLDS themselves are still kept
  identical (same constants, duplicated here same as they're already duplicated between `run_query.py` and
  `signals.js` — must stay in sync by hand) since they're the actual definition of what "consolidating"/"fired"
  means everywhere else on the dashboard; only the momentum-score screener gate and the "drop non-matching
  rows" behavior are intentionally left out.
  **Krok 4** (`#topRsCard`/`renderTopRsTable()`) is a fourth panel-card, added at the user's explicit
  follow-up request ("Dodaj jeszcze top 10 spółek samego RS z sp500 bez sektorów") after the pure-RS
  rewrite above landed: the top 10 companies of the WHOLE SP500 by Mansfield RS vs. SP500 directly
  (`sector_rs.top_rs_companies`, see `compute_sector_relative_strength` above), completely independent of
  `browsedSector` — clicking a different sector in Krok 2 does NOT change this list, unlike Krok 3. Its row
  (`topRsRowHtml()`) carries one extra "Sektor" column vs. `leaderRowHtml()` (Krok 3's row) since these
  companies span every sector, not just one; otherwise it's the same shape (ticker/price/RSM/stage/squeeze/
  chart button), joined against `docs/data/sp500.json` and dispatching to `chart.html` the same way. Its
  own row/render functions (`topRsRowHtml`/`renderTopRsTable`) are a deliberate near-duplicate of Krok 3's
  rather than a shared abstraction — same reasoning as `sectorRowHtml`/`leaderRowHtml` already being
  separate: each table's row shape and click wiring is small and table-specific enough that a shared
  function would need as many parameters as it saved lines. `renderAll()` calls it right after
  `renderLeadersTable()`, still before Krok 1's Chart.js call (`renderTrendChart()` guards on
  `typeof Chart === "undefined"` and returns early rather than throwing) —
  same ordering rationale as `rebalance.js::init()` already uses (Chart.js-dependent rendering last): a
  failure to load Chart.js (now vendored locally, `docs/js/vendor/chart.umd.min.js` — see the Frontend
  intro above; this guard predates that fix and stays as a general defensive measure) must not cascade
  into breaking the two tables, which don't depend on it at all. `sw.js`'s `SHELL` list and cache version were updated the same way adding `chart.html` was
  (new page/script added to `SHELL`, `CACHE` version bumped) — see the PWA shell paragraph at the top of
  this section for why that bump matters (stale Service Worker serving an old script forever otherwise).

## Commands

```bash
pip install -r requirements.txt   # NOTE: this file is UTF-16-encoded; edit with a UTF-16-aware tool
                                   # or regenerate it, don't hand-append plain-ASCII lines

python fetch_data.py [--lookback-months N] [--min-coverage 0.8]   # refresh prices (bootstrap or incremental)
                                   # + index composition + index levels — this is what weekly_full_refresh.yml
                                   # calls, no flags, see CI section below
python run_query.py [--ref-date YYYY-MM-DD] [--min-trading-days 150] [--max-staleness-days 10] [--docs-dir docs]
                                   # compute momentum + regenerate docs/data/*.json (selection/weights/
                                   # portfolio_history, charts, GEM, Relative Strength — everything) — this is
                                   # what weekly_full_refresh.yml calls, no flags, see CI section below

python fetch_data.py --indices-only   # manual/local use only, CI no longer calls this — refresh index_prices
                                   # (^GSPC/^NDX/^DJI from yfinance; WIG20/mWIG40 synthetic level rebuilt from
                                   # last-known constituent prices, not fetched — see Global Equity Momentum
                                   # section and gem_manual_returns.json for how WIG20/mWIG40's GEM return is
                                   # actually sourced), skip constituents — a cheap way to get a fresh GEM
                                   # winner locally without a full yfinance fetch
python run_query.py --gem-only        # manual/local use only, CI no longer calls this — regenerate
                                   # global_equity_momentum.json + relative_strength.json only

python run_query.py --charts-only     # manual/local use only, CI no longer calls this — refresh ONLY current
                                   # price + weekly_chart/mansfield_chart for each ticker in the LAST
                                   # already-saved portfolio_history selection (+ all_prices.json) —
                                   # selection/weights/portfolio_history stay untouched

pytest                            # unit tests (tests/test_fetch_data.py, tests/test_run_query.py)
ruff check .                      # linter
```

To sanity-check changes to the frontend, open `docs/index.html` / `docs/rebalance.html` directly (or
serve `docs/` with any static file server) — `docs/data/*.json` is committed to git (see above), so this
works straight off a checkout even without running the pipeline; run the pipeline first only if you need
genuinely fresh numbers.

## CI (`.github/workflows/`)

- **`weekly_full_refresh.yml`** — the single workflow that does everything, replacing three earlier
  separate ones (`main.yml` — monthly selection/weights, `weekly_charts.yml` — weekly charts-only,
  `daily_gem.yml` — daily GEM/Relative-Strength-only; see the version-history notes throughout Pipeline
  architecture above for why that split existed and why it was collapsed). Runs weekly, Saturday mornings
  (`cron: '0 7 * * 6'`, evaluated in UTC — 08:00 Polish time in winter/CET, 09:00 in summer/CEST — GitHub
  Actions cron has no daylight-saving shift), and manually via `workflow_dispatch`. It deliberately has
  **no `push: main` trigger** — unlike the old `main.yml`, a push to `main` does not by itself kick off a
  full yfinance fetch; only the weekly schedule or a manual run does, since the pipeline is now the
  expensive full one every single time it runs (constituents + prices + index levels +
  selection/weights/`portfolio_history` + charts + GEM + Relative Strength), not a cheap `--indices-only`/
  `--gem-only`/`--charts-only` variant. Installs `requirements.txt`, runs plain `fetch_data.py` (no flags
  — fetches index composition, every constituent's prices, *and* the index-level `index_prices` table in
  one call, see `update_duckdb()`) then plain `run_query.py` (no flags — recomputes selection/weights,
  appends a new `portfolio_history` snapshot, and regenerates every `docs/data/*.json` file including
  `global_equity_momentum.json` and `relative_strength.json`), then **commits `momentum_data.duckdb` and
  `docs/data/*.json` back to the repo** (`contents: write` permission; the commit message ends in
  `[skip ci]` so the commit doesn't loop back into a trigger — moot now that there's no `push: main`
  trigger left to loop into, but kept as a harmless safety net) before deploying `docs/` to GitHub Pages.
  Before it ever commits, it unconditionally rebases onto the current `origin/main` tip (`git fetch` +
  `git reset --mixed origin/main`, not just reactively after a rejected push) — see the incident below for
  why this matters even on a completely ordinary run, not just a genuine push race.

  **A real incident (22.09.2026) accidentally un-reverted a already-reverted feature, via this workflow**:
  an ATR-adjusted-Relative-Strength feature (see the version-history note under Relative strength below,
  "RS was briefly ATR-adjusted, then reverted") had just been cleanly reverted on `main` (all 5 touched
  files verified byte-for-byte identical to their pre-feature state) when the user manually re-ran an
  *older*, already-completed `weekly_full_refresh.yml` run via GitHub's "Re-run jobs" button — a run that
  had originally been triggered *before* the revert existed. GitHub Actions re-runs a job against its
  **original triggering commit SHA**, not the current branch tip, so this re-run's checkout silently had
  the old, pre-revert `run_query.py`/`fetch_data.py`/`CLAUDE.md`/tests again, even though `main` itself was
  already clean. `fetch_data.py`/`run_query.py` then ran using that stale (ATR-adjusted) code, and when the
  "Persist generated data" step tried to push, it hit exactly the "another workflow pushed to main
  meanwhile" race the retry loop exists for — except the retry loop at the time used `git reset --soft
  origin/main`, which moves **HEAD only**, not the index. The subsequent `git add momentum_data.duckdb
  docs/data/` + `git commit` therefore committed the *already-staged, stale* tree from the rejected commit
  (i.e. the old, pre-revert `.py`/`.md`/test files, inherited unchanged from the stale checkout) on top of
  a now-*correct* parent commit — a commit that looked, from `git log`, like an ordinary child of the
  clean, reverted history, but silently carried the old ATR code back into `run_query.py`/`fetch_data.py`/
  `CLAUDE.md`/`tests/test_run_query.py`/`tests/test_fetch_data.py` (confirmed byte-for-byte identical to
  the pre-revert commit via `git diff`) — and, because the checkout was stale, `run_query.py` had also
  *computed that run's `docs/data/*.json`/`momentum_data.duckdb` output* using the reintroduced ATR
  formula, producing genuinely different (not just stale-looking) sector-strategy/Mansfield-RS rankings
  than the plain, reverted formula would have — which is what actually tipped the user off that something
  was wrong (a sector-strategy leader that didn't match what they expected right after confirming the
  revert had merged). **Two independent fixes** came out of diagnosing this: (1) `--soft` → `--mixed` in
  every `git reset origin/main` in this step, so a retried commit's index (and therefore every file this
  step doesn't explicitly `git add`) actually reflects `origin/main`'s real tree, not a stale rejected
  commit's; (2) the rebase-onto-`origin/main` now happens **unconditionally, before the first commit**, not
  only reactively after a rejected push — so even a run whose *own checkout* was stale (the actual root
  cause here — a re-run reusing an old trigger SHA) can no longer commit stale non-data files, regardless
  of whether a push race happens to occur. Neither fix makes a stale re-run compute *correct* data (the
  underlying `fetch_data.py`/`run_query.py` execution still ran old logic against whatever it was checked
  out at) — that half is a process fix, not a code one: **never use GitHub's "Re-run jobs" on an old
  `weekly_full_refresh.yml` run once `main` has moved on; always trigger a fresh `workflow_dispatch` run**,
  which always checks out the current branch tip.

  **Why a scheduled run can silently never fire, and how to tell**: `weekly_charts.yml` (the predecessor
  to this workflow) was created mid-week and its very first Saturday cron slot appeared to not have fired
  — checking `actions_list(method="list_workflow_runs", ...)` for that workflow showed only two
  `workflow_dispatch` (manual) runs and zero `schedule`-triggered ones. This is a known GitHub Actions
  behavior worth remembering when a schedule seems to be missing a run: (1) a workflow's first scheduled
  trigger can simply not have arrived yet if today *is* the day the cron is supposed to fire but the
  cron's time-of-day hasn't passed yet; (2) GitHub explicitly documents that scheduled workflow runs are
  "best effort" and can be delayed, especially during periods of high GitHub Actions load, with no
  guarantee of exact-time execution; (3) GitHub automatically **disables** the scheduled trigger on a
  workflow after 60 days of no repository activity at all (not the case here, but worth ruling out on a
  quiet repo). None of these mean the workflow file itself is broken — check `actions_list(method=
  "list_workflow_runs", ..., workflow_runs_filter={"event": "schedule"})` (or the Actions tab's "This
  workflow has a schedule trigger" / "Disable workflow" state) before assuming the cron expression itself
  is wrong.
- **`deploy.yml`** — a plain, cheap Pages deploy with no data fetch at all: no `fetch_data.py`, no
  `run_query.py`, just `actions/upload-pages-artifact` + `actions/deploy-pages` on whatever is currently
  checked into `docs/`. This exists because `docs/data/*.json` (and `momentum_data.duckdb`) are
  committed to git (see Frontend section above) — a frontend-only change (HTML/CSS/JS) doesn't need a
  fresh yfinance fetch to go live, it just needs the already-committed `docs/` republished. Triggers on
  every push to `main` (any path — cheap enough not to bother filtering to `docs/**`) plus
  `workflow_dispatch`; a push whose commit message contains `[skip ci]` (e.g.
  `weekly_full_refresh.yml`'s own data-refresh commit) is skipped by GitHub automatically, so this
  workflow does NOT double-deploy right after that one already deployed. Shares the same `concurrency:
  group: "pages"` as `weekly_full_refresh.yml` so the two can never race each other's Pages deployment.
  `permissions` is `contents: read` (not `write` — this workflow never commits anything back).
- **`tests.yml`** — runs `pytest`/`ruff` (Python) and an ESLint check (`docs/js/*.js`, Node-only tooling,
  no effect on the deployed site) on pushes/PRs.
