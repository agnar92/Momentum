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
   from a Finviz screener URL; `max_tickers` = cap). Default (the user's own Finviz screener URL): price above $1 (`sh_price_o1`), price above
   SMA50 and SMA200 (`ta_sma50_pa`, `ta_sma200_pa`), positive EPS growth this year (`fa_epsyoy_pos`) and positive EPS
   forecast next year (`fa_epsyoy1_pos`) ≈ 500 stocks (there is deliberately NO market-cap filter any more; `max_tickers`
   = 600 is the cap — if the Finviz total approaches it, raise it or add e.g. `cap_smallover`). The 5-year EPS filter (`fa_eps5years_pos`) was deliberately
   dropped at the user's request so young leaders / recent IPOs are not cut out. It queries three views (Overview `111`,
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

## Frontend (`docs/`) — plain HTML/CSS/vanilla JS, no build step

- **`index.html` + `js/watchlist.js`** — the only data page. **Layout modelled on TC2000 (user's reference): on wide screens (≥ 1000 × 560 px, `applyLayoutMode`, `body.split`) it is a split view — narrow list on the left (430 px, only 5 key columns per tab: `TAB_COLUMNS_COMPACT`) (the tab bar wraps to two rows there; on phones it scrolls horizontally and also with the mouse wheel — `.drawer-header`/`.drawer-tabs` need `min-width:0`, otherwise the bar overflows the screen and the last tabs are unreachable) and the chart permanently docked on the right (`#chartModal` lives inside `.workspace`; CSS turns the modal into a pane); the chart always shows the current symbol: the first row auto-opens, clicking a row or pressing ↑/↓ (`stepChart`) flips through the visible list, the open row is highlighted (`.row-selected`, `markSelectedRow`), `chartToken` drops stale async loads. On narrow screens / phones the chart is the old overlay modal and the full column set is used.** **Chart layouts (split view only, `Układ:` button cycles, `momentum_watchlist_chart_layout`)**: `1` one chart; `dw` daily + weekly of the same stock side by side; `4` the selected stock + the next 3 from the visible list (daily; click a cell header to select that stock, ↑/↓ shifts the set by one). `drawChart` builds `.chart-grid` cells (`chartCells`), each with its own readout, slider and window state (`chartWindows[i]`); only the focused cell is editable (`annOverlay` gets `readonly` for the others): cell 0 by default, and in the `dw` layout clicking either chart (outside its slider) gives it focus (`chartActiveCell`, green header underline), so lines/cups can be drawn on the weekly chart too — user lines are date-based and show on both and SVG ids are made unique per cell (`opts.uid`). Grid cells use `fitLayout(w, h)` (viewBox = real cell pixels, panels scaled to the height, two-row legend below 560 px) via `opts.fit` (`cellFit`); resize redraws the grid. Six tabs over the same `watchlist.json` (columns are defined once in `COL`/`TAB_COLUMNS` in watchlist.js and the
  `<thead>`s are generated from them):
  - **📋 Lista** — every stock that passed Finviz (EPS columns from Finviz, SMA distances/RS from our data).
  - **📊 RS Ranking** — `rs_rating ≥` a user-entered minimum (default 80), best first (`rsLeaders`).
  - **🎯 Qullamaggie** — user-entered min daily dollar volume (default 20 mln $), min ADR % (default 4) and
    **top X %** (default 10); stocks failing the liquidity thresholds are dropped, then for EACH of the 1/3/6
    month windows the top X % by `low_ratio_*` (price / minimum) are taken and the result is the UNIQUE union (each row
    remembers which windows it made; `qullamaggieRows`).
  - **📈 Trend EMA34** — a SEPARATE filter, deliberately independent of RS and Qullamaggie
    (`ema34_rising === true`, sorted by 20-session slope; `ema34Rows`).
  - **🧱 Bazy** — open bases with `pct_to_pivot ≤` a user-entered max (default 10 %), optional "only VCP" (`baseRows`).
  - **⭐ Ulubione** — stocks starred with ☆/★ in any list (`localStorage` `momentum_watchlist_favs`). A ⚠ before the
    earnings date means a report within 7 days (`earningsInDays`, parses Finviz "Oct 22/a").
  **Clicking a row opens a MarketSmith-style chart** (`js/chart.js`, pure SVG, no libraries; model/scales are unit
  tested in `tests/js/chart.test.js`): S&P 500 strip on top; weekly OHLC bars + SMA10 (green) / SMA40 (red) + the RS
  line (stock / S&P 500, blue, own scale in the lower third, labelled with the RS Rating); weekly volume; quarterly
  EPS line with YoY % under each point; small triangles at report weeks; crosshair readout on hover; a header button switches weekly/daily (`day` arrays in charts.json: last 252 sessions (`CHART_DAYS`, ~1 year) + SMA50/SMA200; the daily view opens on a 42-session (2 months) window, the slider reaches the whole year, `dailyCharts`; stored in `momentum_watchlist_chart_daily`; no bases in daily view); a stats line shows cap, P/E, Fwd P/E, ROE, distance from 52w high and the open base; a header button toggles the PRICE panel between linear and logarithmic scale (`makeLogScale`/`logTicks`, 1/2/5·10ⁿ ticks; choice stored in `localStorage` `momentum_watchlist_chart_log`; the S&P strip, RS line and volume stay linear). A **range slider under the chart** (TC2000-style, `sliderHtml`/`attachRangeSlider`, window `{n, end}` in bars, `sliceModel(m, n, end)`, `clampWindow`, min 15 bars): a mini close-price map of the whole history; drag the frame to move the time window, drag its edges to change its length, click the track to jump; the window POSITION resets on a new stock / weekly↔daily switch (`chartWindow` in watchlist.js), but its LENGTH is remembered for all stocks once the user changes it (`localStorage` `momentum_watchlist_chart_winlen` = `{d, w}`, separate for daily/weekly; `defaultWindowLength`, `rememberWindowLength`). The chart axis has **empty future slots** on the right (`buildChartModel(..., {pad:true})`: 21 trading days daily / 4 weeks weekly, all model arrays padded with null, dates from `futureDates`); by default only a few are visible (`padDefault` 6 / 1, `defEnd` in `renderStockChart`), the slider can move the window a month ahead, and own lines/alert extensions run into that space (`sliceModel` sets `lastShown` = whether the last real bar is in the window). **Full screen** (`⛶ Pełny ekran` button / key `F`, Esc exits): `.wl-chart-box.full` CSS class + the browser Fullscreen API when available (`setChartFull`, synced with `fullscreenchange`); on a wide monitor (> 1100 px, aspect > 1.5) the chart switches to `CHART_LAYOUT_WIDE` (1600×800, `pickLayout`, `opts.wide`) so bars use the width instead of leaving side margins. **Phone full screen** (`!splitMode`: class `.phone-full`, `phoneFullFit`): header shrinks to ticker + Edytuj / Wykres / Zamknij / ✕, stats, pattern and estimate lines are hidden, and the chart gets the whole screen through `opts.fit` (pixel layout like the grid cells, min height 340 so landscape scrolls a little instead of shrinking); resize/rotation redraws it (the old `max-height: 100vh − 235px` made the chart a thumbnail in landscape). The chart header has `TradingView ↗`, `Finviz ↗` and `Zacks ↗` links (`#chartTv`, `#chartFv`, `#chartZx` → zacks.com/stock/quote/TICKER: Zacks Rank, Style Scores; links only, no scraping; Finviz sends X-Frame-Options SAMEORIGIN, so it cannot be embedded). The link
  button inside a row still opens TradingView and does not open the chart. **Phones (≤ 640 px) get a compact layout**
  (`opts.compact`: narrower viewBox 560×740, fonts ×1.5, only the last 52 weeks via `sliceModel`, header split into two
  rows; re-rendered on rotation) so the chart stays readable instead of being a shrunken desktop chart.
  Common search box + sector select; table headers sort (empty values always last); settings persist in
  `localStorage` (`momentum_watchlist_settings`). Rows link out to TradingView (`tvUrlFor`) — there is no
  in-app chart any more. Pure logic is covered by `tests/js/watchlist.test.js`.
- **`ep.html` + `js/ep.js`** — standalone Episodic Pivot helper (TradingView gap-scanner link, volume-breakout
  screener widget, news widget, localStorage journal). Unrelated to the watchlist data.
- **`js/shared.js`** (`tvUrlFor`, `compareRows`, TradingView embed helpers), **`js/qol.js`** (toasts, offline
  badge, loading overlay), **`js/pull-to-refresh.js`**; `sw.js` is a network-first PWA service worker (bump
  `CACHE` and keep `SHELL` in sync when files are added/removed). Files are plain `<script>` tags sharing
  globals; for Node tests each file re-attaches the shared globals via the `typeof require` block at its top.
  `css/style.css` was rewritten from scratch (only rules for existing pages; one `@media (max-width:900px),
  (max-height:560px)` block makes the page scroll normally on phones in either orientation).

## Bases / VCP (heuristic)

`detect_bases` (watchlist.py, feeds only the 🧱 Bazy tab and the stats line — on the chart only `cup` bases are drawn, as a parabola arc left peak → low → right rim with the depth % in the
center (`cups` in the model, `low_date`/`end_close` from `detect_bases`; the old boxes were unreadable) finds corrections on weekly highs (depth 6–50 %, ≥5 weeks), classifies them
flat/cup/correction/deep, gives a pivot (peak high) and a VCP flag (≥2 strictly decreasing zig-zag contractions,
last ≤10 %). Stored as `base_*`, `pivot`, `pct_to_pivot`,
`vcp`, `pct_from_high_52w` in watchlist.json. Not MarketSmith pattern recognition (no handle/flag detection).

## Flags / consolidation (heuristic)

`detect_consolidation(ohlc, cfg)` (watchlist.py; `DAILY_FLAG` for the daily chart and `tl_*` fields, `WEEKLY_FLAG` for the
weekly chart) replaced the old "longest line through any two swings" logic that drew wrong lines. It only reports a
pattern, and only draws lines over the consolidation itself:
- **flaga**: pole (low → swing high within `pole_lookback` = 20 sessions, gain ≥ 20 %, ≥ 3 sessions long), then a
  consolidation of 7–30 sessions no deeper than 20 % (and ≤ 60 % of the pole gain);
- **korytarz**: no pole, but a tight (≤ 12 %) range of ≥ 12 sessions;
- resistance = longest line through swing highs of the consolidation that no bar pierces by > 1.5 % (slope ≤ +0.15 %/bar);
  support = same through lows but required to be roughly parallel (±0.3 %/bar), omitted when none fits;
- the last `recent` (5 daily / 2 weekly) bars may already be the breakout: `state` = "wybicie" (a close above the
  resistance) / "przy oporze" (≤ 3 % below) / None; `breakout` = {date, `vol_ratio` = breakout-bar volume / mean of the
  previous 50 bars, `confirmed` ≥ 1.5×}; `info` = pole gain/dates, length, depth, `vol_ratio` (flag volume / pole volume,
  ≤ 0.8 = drying up).
Stored as `tl` (weekly) / `day.tl` (daily) in charts.json and `tl_state`, `tl_pattern`, `tl_vol_ratio`, `tl_vol_ok` in
watchlist.json ("Trendlinia" column). Drawn as dashed orange (resistance) / grey (support) lines, the pole as a thick
translucent segment labelled "maszt +N%", ▲ at a breakout, outlined breakout volume bar; `patternExplain` (chart.js)
turns `info` into a plain-Polish explanation shown in `#chartPattern` under the stats line — the point is to teach the
user to recognise the pattern, so keep the explanation in sync with the criteria above. Daily view is the default
(`momentum_watchlist_chart_daily` = "0" → weekly) with only SMA 10/20 (weekly: SMA 10/40 weeks); the legend lives in
its own band above the price panel so labels never cover candles.

## Own lines, cup corrections, alerts (`docs/js/annotate.js`)

Browser-only (no backend): annotations live in `localStorage` `momentum_watchlist_annotations`, keyed by ticker, and are
stored in DATES + prices so they show on both the daily and weekly chart. Chart modal → **✎ Edytuj** opens a toolbar:
**Holding SPACE** (chart open, focus not in a text field) turns edit mode on temporarily (`annEdit.spaceOn`; released → back to view mode, toolbar stays hidden so the chart does not jump); with no tool selected, dragging across the empty chart draws a line (drag > 8 px; a plain click only deselects). `＋ Linia` (two clicks; x snaps to a bar, y snaps to that bar's High/Low when near), `＋ Cup` (three clicks: left rim, bottom,
right rim), click a line/cup to select it and drag its round handles (line ends; cup L/B/R), `Typ` (opór/wsparcie/dowolna),
`Alert` (nad/pod linią), `Przedłużenie` (per line `ext`, default on: the dotted straight extension past the 2nd point; the alert value is still extrapolated), `⎯ Poziomo` (`annFlatten`: flattens the selected line to 0°), `Usuń`, `Przywróć auto`, a free-text note. **Shift** while drawing (2nd point, drag-to-draw) or dragging a line handle makes the line horizontal (`level` in `annOverlay`: price = the other end's price). **Context menu** (`annShowMenu`, `.ann-menu`): right click on a line = flatten / type / alert / extension / delete; right click (or long-press) on an empty chart in edit mode (e.g. while holding SPACE) = `＋ Linia / ＋ Cup`; on touch, tapping a line opens its menu and a double tap on the empty chart opens the add menu (touch has no right button; `annEdit.menuOpen`/`spaceHeld`/`annLeaveSpace` keep the SPACE-mode alive until the menu choice/drawing is finished) The first time edit mode opens for a ticker, the
auto-detected lines/cups of the current view are COPIED as the user's own (`fromAuto`), the automatic ones are hidden
(`hideAutoLines`/`hideAutoCups` → `opts.hideAutoLines/Cups` in `chartSvg`) and a snapshot of what the algorithm found is
saved in `rec.auto` — that snapshot + the user's corrected geometry + the note are the material for reviewing/tuning the
detectors; the user pastes the export (🔔 Alerty tab → "Eksportuj adnotacje", `annExportJson`) into the chat when asking
for a review. User geometry is drawn by a separate SVG layer (`annOverlay`, `.chart-overlay` over `#chartPlot`; chart.js
calls `opts.overlay` after each draw and exposes `geomOut` = layout/scales; `dateToIndex`/`indexToDate`/`cupArcPoints`
are shared helpers). A user line is drawn as a plain STRAIGHT segment between its two points (pixel-straight in the current scale) with a dotted
straight extension to the last bar; alerts use `lineValueAt`: straight in trading-day space (`bizIndex`, weekend sits between
Fri and Mon) and, for lines created on the log scale (`line.log`), straight in ln(price) — so the alert value matches the line
on the chart without needing the bar series.
**🔔 Alerty tab**: one row per line with an alert; value of the line at the stock's `as_of` vs the last close (`alertState`:
`triggered` = price above/below the line, `near` = within 2 %); a freshly triggered alert stays "PRZEBITA — nowa" (counted in
the tab badge) until OK is clicked (`ack`), and resets when the price returns to the other side (`annRefresh`). No push
notifications — alerts are evaluated when the page loads / data is refreshed / a chart closes.

## Annotation sync between devices (`docs/js/sync.js`)

Optional, browser-only: the 🔔 Alerty tab has `☁ Synchronizacja`. The user pastes a GitHub token with the `gist` scope (same on
PC and phone, stored in `localStorage` `momentum_watchlist_sync` together with the gist id); `annStore` is then mirrored to ONE
secret gist (file `momentum-annotations.json`, found again by file name after the browser data is wiped, so lines come back
by just re-entering the token). Cycle `syncNow` = GET gist → `mergeStores` (annotate.js: per ticker, lines/cups unioned by id,
same id → the newer record (`editedAt`) wins, deletions are tombstones `rec.del = {id: time}` so they don't come back, "Przywróć auto" = `annResetRecord`)
→ PATCH only if the merged result differs from the gist. It never sends less than the gist holds. Triggers: 2 s after every `annSave`
(`annOnSave` hook), page load, tab becomes visible, back online, every 3 min while visible. Not synced: favourites, settings. Imports
(`mergeImport`) are stamped `editedAt = now` so they win. Gist is "secret", not encrypted (no password layer yet). Classic tokens expire after 30 days by default, so the panel tells the user to pick `Expiration: No expiration` (fine-grained tokens cannot access gists); on a 401 (`syncState.auth`) the panel opens by itself with the token form so a new token can be pasted — local data and the gist are untouched. When touching annotation
mutations, any deletion must add a tombstone, otherwise sync resurrects the object.

## Analyst estimates (Yahoo via yfinance) — `Estymaty` button

`update_estimates` (watchlist.py → `docs/data/estimates.json` = `{updated, stocks:{T:{f, pt:{low,mean,median,high}, p:{"0y","+1y":{avg,low,high,n,g,ya,u7,u30,d30,d7,h:[[date,value]...]}}}}}`)
fetches per ticker (4 Yahoo calls: `get_analyst_price_targets`, `get_eps_trend`, `get_earnings_estimate`, `get_eps_revisions`;
~1.4 s each, 4 workers, refreshed when older than 2 days, 700 s budget, errors never abort). Yahoo only has the current and
next fiscal year (FY0 / FY+1) and a SNAPSHOT of the consensus (now, 7/30/60/90 days ago), so `build_estimate_entry` seeds the
history from those points and every refresh APPENDS new points (`h`, kept 400 days) — the series becomes a real consensus-revision
line over time, like Zacks' "EPS Consensus". `estimate_fields` adds flat columns to watchlist.json: `pt_mean`, `pt_upside_pct`
(target vs. price — informational, the user can compute it himself), `eps_rev30_pct`, `eps_rev90_pct`, `eps1_rev30_pct`,
`rev_up30`, `rev_down30`, `analysts` (table columns "Upside do ceny celu", "Rewizje EPS 30d/90d").
Chart: header button `Estymaty: wł./wył.` (`momentum_watchlist_chart_est`, lazy `loadEstimates`): price panel gets a bracket
low–high with a dot on the mean target at the right edge and a dotted mean line (extreme targets are clipped to 0.65–1.6× price for
the scale only, labels keep the real values with ↑/↓); the EPS panel switches from quarterly EPS to "Konsensus EPS (zmiana %)": FY0
and FY+1 as % change vs. the first history point (one scale for both); `#chartEstimates` shows a one-line summary (`estimateText`).
estimates.json is generated by the daily workflow — don't commit locally generated copies (they conflict with the bot's refresh).

## RS line (chart)

Blue line = stock close / S&P 500 close on the chart's own bars (weekly or daily), drawn in the lower third of the price
panel with its own min–max scale (only shape/direction matter). Meaning comes from the flags, computed in
`rs_line_flags` on the FULL history (not the visible window): `rs_hi` = RS above all of the previous 252 sessions
(52 weeks on the weekly chart), `px_hi` = same for the price. Dot = RS at a 52-week high; **larger white-ringed dot =
RS at a high while the price is not ("RS przed ceną", the leading signal MarketSmith/IBD stress)**. Legend shows the RS
Rating, % change of the ratio over the window ("+72% vs S&P") and the current state. `rs_line_state`
("przed ceną"/"na szczycie" within the last 5 sessions) and `rs_line_dist_pct` (distance from the 52w RS high) feed the
"Linia RS" column. This is NOT the RS Rating (percentile rank among the list, `rs_rating`).

## Layout

Desktop: fixed-height workspace with inner scroll. `@media (max-width:900px), (max-height:560px)` (end of
style.css): normal page scroll, horizontally scrollable tabs, full-screen scrollable chart modal (phone landscape).
`escapeHtml` lives in `js/shared.js`.

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
