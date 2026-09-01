# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A momentum-investing tool for NASDAQ100, DOWJONES, WIG20, and mWIG40: a Python pipeline computes
an S&P-style Momentum Index selection/weighting for each universe and publishes the results as a static
dashboard (`docs/`) to GitHub Pages. There is a second page (`rebalance.html`) that lets a user paste in
their current brokerage holdings (or import an XTB export) and get buy/sell suggestions to move toward
the computed target weights. WIG20/mWIG40 are momentum + relative-strength screener universes only —
they are **not** wired into the rebalance calculator's target-allocation split (`rebalance.js`'s own
`UNIVERSES` stays NASDAQ100/DOWJONES), since mixing a PLN-denominated capital bucket into a
USD-denominated allocation split would need FX handling that hasn't been built; a WIG20/mWIG40 position
pasted into holdings is still priced correctly via `docs/data/all_prices.json`, which is universe-agnostic.

SP500 was deliberately removed from this tool (dashboard, rebalance calculator, GEM, all pipeline
tables/data) — the user already holds a dedicated S&P 500 ETF elsewhere, so this tool now only tracks
the universes above.

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
   - Loads index composition + weights from the two manually-maintained CSV files at repo root
     (`CNDX_holdings.csv` → NASDAQ100, `CIND_holdings.csv` → DOWJONES;
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
   fetching lives here. For each universe (`NASDAQ100`, `DOWJONES`, `WIG20`, `MWIG40` —
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
**not** WIG20/mWIG40, see below) against each other over a trailing `GEM_LOOKBACK_MONTHS` (12) window —
the classic dual/global-momentum idea of picking whichever market currently has the strongest trend.
`fetch_data.py::update_index_prices` pulls daily closes for every universe in `INDEX_LEVEL_SYMBOLS`
(`^NDX`/`^DJI` for the two US universes, `WIG20.WA`/`MWIG40.WA` for WIG20/mWIG40) into a shared
`index_prices` table (`Date, Index_Name, Close, ...`), fully replaced on every run (no incremental logic
needed, unlike the per-constituent `prices` table), via a single multi-ticker `_download_price_rows(['^NDX',
'^DJI', 'WIG20.WA', 'MWIG40.WA'], ...)` call. That mixed batch (two different exchanges/currencies in one
`yf.download(..., group_by="ticker")` request) hit a real, consistently-reproducing yfinance quirk in
production: yfinance reported `WIG20.WA`/`MWIG40.WA` as "possibly delisted; no price data found" in every
run, even though the same two symbols do have data when requested alone — leaving `index_prices` with zero
rows for WIG20/mWIG40 and silently breaking every WIG20/mWIG40 stock's `weekly_chart`/`mansfield_chart`
(`compute_relative_strength_chart`/`compute_mansfield_rs_chart` both need their own index's rows and return
`None` without them — the dashboard showed correct WIG20/mWIG40 constituent data but no chart for any of
their tickers). Fixed generically in `_download_price_rows()` itself, not by special-casing these two
symbols: any ticker still missing after a batch call is retried once more on its own (single-ticker
`yf.download`) before it's finally counted as failed — this fixes the WIG20/mWIG40 case (and any other
future mixed-batch false negative) without needing to guess which symbol combination yfinance will
mis-report next. `compute_index_returns()` reads that table — filtered
to `GEM_UNIVERSES` only — and returns each universe's return over the window, sorted descending; the top
one is the `winner`. WIG20/mWIG40 price data still lands in `index_prices` (needed for their own Relative
Strength, below) but is excluded from this specific cross-market race by that filter, so adding them
didn't silently change who can win Global Equity Momentum.

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

### Relative strength (`compute_index_momentum` / `compute_relative_strength_leaders`)

A screener for NASDAQ100, DOWJONES, WIG20, and mWIG40 (`RELATIVE_STRENGTH_UNIVERSES`): for each
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
is trimmed to start exactly at that window's start (M-14 or M-11) through to `ref_date`. Note: since `prices`
only retains a rolling `--lookback-months` (15) window (see above) and the momentum window itself already
consumes ~14 of those months, there is little to no actual buffer before `start_date` in production, so
`sma10_pct`/`sma30_pct` can still show `null` for their first several in-window weeks for many tickers — a
known, deliberately deferred limitation, not a bug to "fix" by widening `RS_PRICE_SMA_LONG_WEEKS`'s lookback
further.

A GLB (Green Line Breakout, Dr. Eric Wish) reference line was tried here and then removed: the rolling
~15-month `prices` retention isn't deep enough for a "highest price reached" computed from the retained
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
was replaced with the one described below — it was too coarse a simplification of what the book actually
shows. Read this section, not the git history, for the current design.

**Base/resistance detection** (the mechanism entries are built on): in every week, look at the trailing
`STAGE_BASE_LOOKBACK_WEEKS` (8) weeks of closes (excluding the current week). If `(max-min)/min` over that
window is within `STAGE_BASE_MAX_RANGE_PCT` (15%), it counts as a **tight base** (the book's "trading range" /
"resistance zone"), and its `max` is that base's resistance. A **breakout** is the current week's close
closing above that resistance. `STAGE_MIN_BASE_GAP_WEEKS` (6) enforces a minimum gap since the last counted
base — without it, a smooth, gently-rising trend with no real pause would trivially "break out" every 1-2
weeks purely because a slowly climbing 8-week rolling high is easy to clear, which is not what the book means
by a base. This intentionally does **not** use a multi-year high/support (a `resistance above the prior ATH`)
— same reasoning as the removed GLB line above: the rolling ~15-month `prices` retention can support a local,
several-week base, not a multi-year one. Relative strength vs. the index is still deliberately excluded from
the classification itself (rejected earlier as too hard to implement reliably) — the index stays a plain
comparison line on the chart, unchanged.

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

All of the above shares the exact same shallow-history caveat already documented for `sma10_pct`/`sma30_pct`
above: every field is `None` until SMA30 (and, separately, `STAGE_VOLUME_LOOKBACK_WEEKS`/`STAGE_BASE_
LOOKBACK_WEEKS` weeks of volume/price history) are available, which in production may not be until partway
through the displayed window.

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
Unlike `weekly_chart` above, this is **deliberately decoupled from the momentum window** — its own display
range is just the last `RS_MANSFIELD_DISPLAY_WEEKS` (26 weeks, ~6 months) from `ref_date`, not the 12-14
month momentum window. This is why: an earlier version tried the standard 52-week Mansfield smoothing on
top of the momentum window's own ~12-14 months, which needed ~26.5 months of price history in total — far
more than the rolling 15-month `prices` retention provides, so the oscillator came back empty for most of
the range in production (verified against real data: 51 of 61 weeks null for one ticker). Restricting the
display window to a short recent slice instead means the total history needed
(`RS_MANSFIELD_DISPLAY_WEEKS + RS_MANSFIELD_MEDIUM_WEEKS` ≈ 52 weeks, ~1 year) comfortably fits inside the
15-month retention with margin. See `renderRelativeStrengthChart()` below for how both charts are
rendered.

## Frontend (`docs/`) — deployed as-is to GitHub Pages, no build step

Plain HTML/CSS/vanilla JS, a PWA (`manifest.webmanifest` + `sw.js` service worker caching the app shell,
network-first for `docs/data/*.json`). `docs/data/` is generated by `run_query.py`; since a recent change
(mirroring the already-committed `momentum_data.duckdb`, see above) it **is committed to git** too, so the
site's data survives independently of any given Pages deploy and a fresh checkout of `docs/` is
immediately servable without having to run the pipeline first. CI still regenerates and re-commits it on
every run (see CI section below) — it isn't hand-maintained.

- **`index.html` / `js/app.js`** — main dashboard: sidebar of top-10 tickers per universe (`UNIVERSES` in
  `app.js`, kept in sync with `run_query.py`'s own `UNIVERSES` — currently NASDAQ100/DOWJONES/
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
  index's own return, and tiles merging NASDAQ100+DOWJONES+WIG20+mWIG40 outperformers via
  `combinedRelativeStrengthLeaders()`, sorted by edge over their index). The sidebar is hidden on phones
  in portrait (`@media max-width:640px`), so the drawer table has a "🚀 GEM" tab (`showDrawerTable()` /
  `renderGemTable()`) and a "💪 RS" tab (`renderRelativeStrengthTable()`) rendering the same lists as
  their own tables — the only way to reach them on mobile, since neither is otherwise duplicated by the
  per-universe tables. Every ticker in the main per-universe exports
  (`docs/data/{universe}.json`'s `constituents`, see `process_universe`/`export_json` above) carries its own
  `weekly_chart`/`mansfield_chart` too, not just the relative-strength panel's leaders — so the own chart is
  available for any stock, however it was selected (per-universe tables, GEM, Ctrl+K search, the
  relative-strength panel/table). `findRsEntry()` in `app.js` looks a ticker up first in
  `combinedRelativeStrengthLeaders()` (an RS-leader entry also carries `relative_strength_pct`/
  `index_return_pct`) and falls back to its own record in `state.data[universe].constituents`; whichever
  it finds becomes `state.currentRsEntry` and drives `hasRsChart` in `updateChartArea()` — when a ticker has
  no `weekly_chart` at all (e.g. one whose momentum fell back to the 9-month window with too little extra
  history), the chart panels are hidden and `#noChartMessage` is shown instead, pointing at the "Otwórz w
  TradingView" button as the fallback; that button itself is never disabled, since it works for every ticker
  regardless of chart-data availability. When shown, it's two stacked Chart.js charts
  (`renderRelativeStrengthChart()`, loaded via CDN): the "10:30" price+SMA10/SMA30 chart
  on top, with the stock's own index level plotted alongside it on the *same* % axis (both rebased to 0%
  at the momentum window's start) so the stock's trend can be read directly against its index's trend —
  whichever line is on top is the outperformer. That same panel also renders the Weinstein stage
  classification described above: a `#stageBadge` above the chart shows the ticker's `current_stage`
  (`renderStageBadge()`, colored per `STAGE_COLORS`, with a one-line plain-language description of what that
  stage means), weekly volume bars on a hidden secondary axis at the bottom of the price chart — stacked
  (Chart.js `stack: "volume"`) into two segments so buying/selling pressure is visible directly, not just
  total turnover: `buying_volume` on the bottom (brighter green when `buying_volume_ratio` clears
  `STAGE_BREAKOUT_VOLUME_RATIO`, i.e. a confirmed breakout week — this constant is duplicated client-side in
  `app.js` and must stay in sync with the same constant in `run_query.py`) and `volume - buying_volume`
  (selling) on top in red, a **trailing stop-loss line** plotted directly from `stop_level_pct` (a dashed red line,
  mirroring the book's own "Trailing Stop Loss" diagram — Chart.js breaks the line wherever the value is
  `null`, i.e. outside an active Stage 2 run, with no extra handling needed), and entry/exit markers on the
  price line itself: triangle-up (green) for `ENTRY_2A`/`ENTRY_2B`, triangle-up (amber) for `ENTRY_2B_LATE`
  (a 4th-or-later base in the same run — see `SIGNAL_MARKER_COLORS`), a small square (amber) for
  `WARNING_MA_SLOWING`, triangle-down (red) for `EXIT_STOP` — with the signal's plain-language description
  (`SIGNAL_LABELS`) appended to that week's tooltip, including which base number it was for `ENTRY_2B`/
  `ENTRY_2B_LATE` (`base_count`). A static legend line under the chart explains the marker/bar/line meanings
  once, rather than repeating them per-chart. None of this reads relative strength vs. the index — that stays
  a separate, purely visual comparison line on the same chart, unchanged from before. Below that is the
  Mansfield RS oscillator (short-term + medium-
  term lines, its own separate ~6-month window, see above) in a shorter panel underneath (`.rs-chart-container`
  / `.rs-chart-panel` / `.rs-chart-panel-small` in `style.css`). WIG20/mWIG40 are PLN-denominated and
  GPW-listed, unlike the rest (USD, NYSE/Nasdaq):
  prices render via `formatPrice()` (`$` vs `zł` by universe, `PLN_UNIVERSES`) and the TradingView symbol
  used by `tvUrlFor()`/`tvRowButtonHtml()` gets a `GPW:` prefix via `tvSymbolFor()` (tracked through
  `state.selectedUniverse`, set alongside `state.selectedTicker` in `selectTicker()`) so the "Otwórz w
  TradingView" link resolves to the correct Warsaw-listed instrument instead of clashing with an unrelated
  ticker on another exchange.
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

python fetch_data.py --indices-only   # daily_gem.yml only: refresh index_prices (^NDX/^DJI/WIG20.WA/MWIG40.WA), skip constituents
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
