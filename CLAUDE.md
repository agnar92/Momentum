# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A static site (`docs/`, GitHub Pages) with **one strategy** — a web copy of the desktop app
[agnar92/MomentumDesktop](https://github.com/agnar92/MomentumDesktop). **The desktop app is the source of truth** (user, Oct 2026: "Dekstop to
zrodla prawdy … web ma byc zrobiona do niej. Plus usun niepotrzebne rzeczy ktore sa ze starych wersji"): `momentum/calc.py` and
`momentum/finviz.py` are copies of `desktop/calc.py` / `desktop/finviz.py` (web additions in finviz: the SSR-JSON layout `_parse_json`);
a rule change goes into BOTH repos. Informational only, not investment advice.

**History:** this repo used to be a large app (CANSLIM checklist, O'Neil bases, Darvas boxes / Dar-Card, Qullamaggie, Watchlisty, Krok po
kroku, positions, alerts, gist sync, estimates, book-style charts, daily charts …). At the user's request ("usuń Dar-Card, usuń wszystkie
skany oprócz jednego z filtrem Finviz … CANSLIM i bazy już niepotrzebne … jak najmniej kodu, najprościej") all of it was removed; it is in
git history (last full version: the commit before "Refaktor: jedna strategia z backtestu").

## Strategy (`momentum/calc.py`, constants at the top)

- **Rules from the broad-market study (Oct 2026; ≈5600 US stocks 2011–2025, SEC fundamentals known 50/80 days after the quarter, 10 equal positions,
  0.1 %/side; user: "wprowadź te reguły do repo i aplikacji desktop")** — these override the older notes below:
  Finviz pre-filter `ind_stocksonly,sh_price_o10,sh_avgvol_o300,fa_salesqoq_o15` (higher volume / SMA200 / near-52w-high filters cut winners);
  `passes` = revenue q y/y ≥ 15 % AND Δ operating margin ≥ 3 pp only (RS ≥ 50 pp lowered the result — too few signals; P/S and beat2 are columns only,
  not testable historically); buy = weekly close 0–10 % above the **Green Line** AFTER A BREAKOUT FROM BELOW (`calc.glb_armed`: a close under the line arms, a close > 10 % above makes the line EXPIRE until a new Green Line forms;
  coming back into the 0–10 % zone after running higher = buying a dip after a higher record, state NAD, not a signal; user, Oct 2026: a line within 10 % of price is the current ATH, so price can't be under SMA 200 / 50 — CDLX 03/2020, MA / TT 03/2020;
  `isSignal`: WYBICIE/SYGNAŁ with `glb_pct` ≤ 10; Blue Dot is informational); exit = close ≤ −10 % from entry or below the Low of the last weekly MACD cross-down **after the entry week** (`macdStopSince` /
  `positionPlan.macdStop`; using pre-entry crosses dropped ≈ 21 → 13 %/yr); default order = conditions + signal, then nearest the line; no rotation,
  no pyramiding, no time stop, no trailing (all tested worse); ½ at −20 % optional (neutral); free slots (`MAX_POSITIONS` = 10) parked in SPY.
  Result with the breakout-from-below rule and the line confirmed after peak + 2 closed months ≈ 9 %/yr (2011–17 ≈ 10 %, 2018–25 ≈ 8 %), DD ≈ −40 %; with idle cash in SPY ≈ 16 % (929 signals, none under SMA 200; before: 1255 signals and ≈ 21 / 25 %/yr; breakout-from-below without expiry ≈ 11 / 17 %). Survivorship-biased data (no delisted stocks).
  SEC fetching is back on in `refresh.yml` (Δ margin needs it).

- **Scanner = CEM10** (user, Oct 2026: "wprowadź skan Finviz żeby pobrał spółki z sp500 i ndx spełniające c-8 i posortował po 12-1 momentum, top 20 na zielono, wyświetlił wszystkie"; desktop he already has): `finviz_screen.json` scanner `indexes` [idx_sp500, idx_ndx] × filters `ta_perf_13wup,ta_perf2_52w30o,ta_sma200_pa` (quarter up, year > +30 %, price over SMA 200 = pre-cut; codes from the user's Finviz link; one query per index because Finviz has no OR on indexes, `watchlist.index_fetch`); `calc.cem_c8` = weekly 13-week return > 0 AND 52-week return > +30 % (exact filter in the app, rows without it are dropped before monthly/SEC), `calc.momentum_12_1` (weekly close 4 weeks ago / 52 weeks ago − 1), `calc.assign_cem_rank` → `cem_rank`, `cem_top` (first `cem_top` = 20 → green rows, default order = rank). Ranking choice (user: "dodaj kolumnę 6 miesięcy … możliwość wyboru sortowania po 12-1 lub 6 miesięcy", web only): select `#rankSel` in the toolbar → `state.rank` (`mom121` | `mom6`, localStorage), `rankCem` in `app.js` recomputes `cem_rank` / `cem_top` in the browser (rows without `c8`, e.g. from the desktop gist, are untouched); `calc.momentum_6` = 26-week return WITHOUT skipping the last month (column `mom6`, `watchlist.json` `rules.cem_top`). Long study (monthly, S&P 500 with index additions AND removals, 2010–2026, ~35 % of removed names have no data): 6-month ranking ≈ 12-1 or slightly better (20 positions: 17.9 % vs 14.9 %/yr; 10 positions: 20.5 % vs 18.6 %), 1-month worst; differences of 1–3 pp/yr are noise; skipping the last month did not help; the earlier "12-1" monthly tests did not skip it, the weekly app version does. Study (monthly, S&P 500 point-in-time additions, 2025-01…2026-09): CEM10 N=20, SMA 10 monthly exit ≈ +60 % (CAGR 31 %) vs SPY +30 %; today's-list version ≈ +104 % is inflated by index additions after the run-up; stop −20 %, market filter (SPY under SMA 10 → cash) and sector filters did not help. **TEMPO removed** (user, Oct 2026: "usuń TEMPO, nic nie daje"; both apps): the column `tempo` (`calc.tempo_margin`) and its presets are gone. On the EODHD S&P 500 data (1997–2026) TEMPO ≥ 0 as an entry filter gave 14.8 % vs 15.1 % baseline (1997–2010 12.7 % vs 14.4 %); the earlier study that supported it (19.8 vs 18.3 %) was on another data set. Filters from–to still work for any number column; preset "Momentum 6 mies. ≥ 30 %" stays. Not better than plain SMA 10 exit either: entry thresholds, BURST ranking, halving a position when BURST < 0, sizing by distance from SMA 10, other trend states (Kalman, KAMA, OLS slope, Donchian midline, Chandelier, GBM drawdown probability), PEAD (EPS surprise ≥ +5 % filter, ranking by surprise). **MARKET FILTER (best version, user, Oct 2026: "CEM10 uaktualnij do najlepszej wersji z filtrem rynku"; both apps)**: study on EODHD data rebuilt from daily candles (S&P 500 point-in-time from github.com/fja05680/sp500, split-adjusted, 1997–2026, monthly, mean of 4 configs N = 20 / 10 × 12-1 / 6 mies., 0.1 %/side, series with data errors dropped): no NEW entries while SPY closes the month under its SMA 12 (`calc.market_regime`, `rules.market`; held positions stay and exit on SMA 10): CAGR 15.1 → 15.9 %, max DD −52 → −32 %, Sharpe 0.73 → 0.80; works for SMA 9–14 (CAGR 15.2–15.9 %, DD −32…−41 %) — the exact 12 is tuned in-sample. The page shows the state in the status line and drops the green rows (`rankCem(..., marketOk)`) when SPY is under the SMA; the ranking stays. Selling everything in a bear market (cash) gave DD −29 % but was fragile (SMA 9 / 11 / 14: 2011–26 CAGR 10–14 %); stop −15 / −20 % from the position peak, 12-month return > +20 %, near-12m-high and SMA 12 exit were within noise; free slots in SPY, momentum / volatility ranking, inverse-volatility weights, TEMPO ≥ 0 and exit on SMA 6 / 8 did not help. The same data (EW S&P 500 10.9 % vs SPY 9.8 %): top-10…20 by 6-month momentum + the filter 14.5–17.6 % (DD −29…−34 %); leverage 1.25× ≈ 16.9 % / DD −39 %. GLB (weekly, MACD / −10 % exit, no fundamentals, 10 slots, S&P 500 point-in-time 1999–2026): 5.1 % cash / 6.6 % idle slots in SPY, below SPY (8.4 %); top-3 sectors by RS (sector static, GICS of current members, others inferred from ETF correlation, 67 % accuracy) did NOT help (4.1 % / 7.5 %), top 5: 5.5 % / 8.6 %. Data caveats: EODHD adj_close has ticker-reuse artifacts (RRD +45000 % in a month), ~130 old tickers missing (survivorship bias remains).
  Exit and the rest of the app (GLB, charts T / M) unchanged. Old basic screener = sector scanner (the bullet below) is still in the code, not the default:
- **Basic screener = sector scanner** (user, Oct 2026: "weź sektory i ten RS … top 3 sektory, potem 3 zapytania do Finviz … sektor + cena > 15 USD + fundamenty, które pomagają … nasz basic screener"; both apps): sector RS = weekly ETF (XLB, XLC, XLY, XLP, XLE, XLF, XLV, XLI, XLRE, XLK, XLU; `calc.SECTOR_ETFS`) / SPY, positive when above its own SMA 52 (`calc.sector_rs`, `top_sectors`: top 3 positive by % above SMA);
  3 Finviz queries `sec_<sector>,ind_stocksonly,sh_price_o15,sh_avgvol_o300,fa_salesqoq_o15` (`calc.sector_filter`, `SECTOR_FILTERS`; revenue Q/Q ≥ 15 % is the only fundamental with a detectable per-trade effect), merged without duplicates
  (`watchlist.sector_fetch`; `finviz_screen.json` has ONE scanner with `top_sectors: 3` and `watchlist.py` refreshes only the first one; user: "dla web zrób jeden skaner, ten sektorowy w weekly refresh … top 3 sektory po RS" — the old Weekly Refresh input that pasted a Finviz URL (and persisted it, replacing the sector scanner) was removed). ETF candles are saved with `symbols` (needed by `--build-only`); no SEC/monthly for them. `watchlist.json` has `sectors` [{etf, sector, pct, selected}], rows `sector_rs`.
  Test 2011–25 (GLB without fundamentals, 10 positions): top-3 sectors ≈ 11.8 %/yr, DD −28 % vs ≈ 9.3 % / −38 % for all sectors — NOT statistically validated.
- **EPS Rating** (`calc.eps_features` / `assign_eps_rating`, column only, NOT in `passes`): IBD's formula is not public, so this is an approximation: 0.5 × avg y/y EPS growth of the last 2 quarters + 0.3 × 3-year TTM EPS CAGR + 0.2 × stability (share of the last 8 y/y comparisons positive),
  then percentile 1–99 among the rows of the current list (not all US stocks). Source `eps_q` from `estimates.py`.
- **Zanger patterns + Z view** (user, Oct 2026: "widok w stylu Dan Zanger i podpowiadaj kilka patternów" from chartpattern.com, weekly candles, both apps): `calc.find_patterns(weekly)` -> ALL 11 patterns of the site (user pasted screenshots of every page): BUY side — Cup & Handle (drop 20–35 %, handle 1–3 weeks, buy above the handle top — the only pattern with numbers on the site), Flat Base, Ascending Triangle, Flaga/Proporzec (buy when price crosses the DESCENDING trend line of the flag), Channel (parallel flat lines, 10–30 % wide), Symmetrical Triangle, Descending Triangle (buy on the break of its descending line, as in the site's CMG example), Falling Wedge, Inverted H&S (neckline break); SELL / warning side (`side: "sell"`, states OSTRZEŻENIE / ZŁAMANA) — Head & Shoulders (neckline), Rising Wedge (lower line), plus Parabolic Curve. Two-line patterns come from `_best_line` (lines through weekly High / Low pivots, ≥ 2 touches per side, convergence = width shrinks ≥ 25 %, `_trend_patterns`); H&S from 3 consecutive pivots (`_hs`, head ≥ 5 % beyond the shoulders, shoulders within 10 %); shapes `line` / `box` / `curve` / `mark` (LS / H / RS).
  The rest of the site is verbal, so all other thresholds are MY APPROXIMATION and not backtested as a strategy; ~366 of ~1630 stocks show at least one pattern. Active only when the pattern ends in the last 4 weeks, price within 15 % of the 52-week high, state BUDUJE SIĘ (−8…0 % to the buy point) or WYBICIE (0–10 % above it; `vol_x` = breakout week volume / 10-week mean).
  `calc.parabola` = Parabolic Curve as an EXIT warning, per the site's diagram (user pasted it: "step-like formation" of bases, 3 rising lines each steeper, SELL when the steepest breaks, on high volume): chain of 3 CONNECTED rising support lines through weekly Low pivots (`_support_lines`, each ≥ 15 % steeper, each steeper line's anchor lies on the previous line within 2 % — a fan like the site's diagram; steepest has an anchor in the last ~22 weeks and the price is ≤ 20 % above it unless it is broken, so a gap-up does not leave a useless exit level; user: "parabolic trochę źle działa, linie muszą się łączyć"), ≥ +100 % from the flattest line's start; state TRWA (exit = weekly close under the steepest line) or ZŁAMANA (close under it in the last 3 weeks, `vol_x`); `shapes` = lines labelled 1/2/3; `positionStatus` adds "PARABOLA". ~10 of ~1630 stocks match. Row fields: `pattern`, `pattern_state`, `pattern_buy`, `pattern_pct` (best BUY pattern; columns, filter presets), `pattern_exit` (first warning: H&S / Rising Wedge / Parabolic Curve; `positionStatus` warns too), `patterns` (with `shapes` by date for drawing), `parabola`.
  Bars in the Z view are ONE colour (user: "bary powinny być jednokolorowe").
  Chart button **Z** / key z (`chartSvg(..., zanger)` / `chart.draw(..., zanger)`, geometry "Z"): log price + volume only (no RS / MACD / revenue / SMA), pattern outline, dashed buy line with label, parabola curve + exit level; weekly only (switching to M leaves it).
- **One scanner** (`finviz_screen.json` `scanners` = one entry, the sector scanner; no URL override; `symbols` = SPY only, for RS). Finviz silently ignores unknown filter codes — check the count after editing. Extra Finviz views 121/161/131
  give PEG, forward P/E, dividend yield (`peg`, `pegy` = P/E ÷ (growth + yield), `calc.pegy_ratio`) — columns only.
- **Informational columns only** (NOT in `passes`): `rs` (52-week close change minus SPY's, pp), `ps` (P/S), `surp` / `beat2` / `eps_rev` (EPS
  surprises / estimate revision, `momentum/estimates.py`, cache `data/estimates.json`, 7 days), `cc52w` (C/C[52 tyg.] = close / close 52 weeks
  ago in WEEKS, `calc.price_ratio`), `rvol_w` (week / 10 previous weeks), `rwb_weeks` (weeks since the start of the current weekly RWB, `calc.rwb_weeks`; empty = no RWB; first header click sorts ascending = freshest starts first), `turnover`, `dgm`, `slow`. The fundamentals panel lists P/S, RS and beat2 as "kryterium wyłączone".
- **Green Line** (`green_line`): all-time-high MONTHLY HIGH (user: "zrób GLB na high jak oryginalnie, nie na close"; re-run on
  NOT dividend-adjusted prices, Oct 2026, per trade: High line +1.9 % vs Close +0.2 %, with the margin filter; portfolio CAGRs are path-dependent noise) that has stood 3 months in total = the peak month + 2 closed ones (`CONFIRM_MONTHS` = 2; Dr Wish: "at least 3 months", user: "licz łącznie czyli dwie świeczki po szczycie"; after a new record the old
  line stays valid until the new one has stood the same 3 months. Entry is still judged on the weekly CLOSE. `glb_state`: WYBICIE (breakout week — last week below —
  at ANY height = strong breakout), SYGNAŁ (0–10 % above), BLUE DOT (a later week > 10 % above AND a WEEKLY Blue Dot in the last 2 weeks,
  `calc.fresh_blue_dot(weekly, level, weeks=2)`, set in `calc.build_row`; daily data was removed in Oct 2026 like in the desktop; user: "jeżeli jesteśmy ponad 10 % i to nie jest świeca
  przebijająca … szukamy blue dot"; not backtested in this combination), NAD (> 10 % without a dot), POD, BRAK.
- **Exit**: weekly MACD (12, 26, 9) — stop = Low of the last cross-down week (`macd_info`), plus a 10 % initial stop (`STOP_PCT`, shown only).
  Second method (user: "dodaj jako drugą metodę wyjścia … i 3 zasadę: spadek 20 % od szczytu, sprzedaj połowę"): **pod GLB** = sell on a weekly close below the
  current Green Line (the line stays at the breakout level while new records keep coming; once a peak has stood 3 months it becomes the line). Toggle 🚪
  (`state.exit` / desktop `settings["exit"]`, MACD default); GLB mode hides the MACD stop line. Always: stop −10 % and half-sell at −20 % from the highest weekly
  close since entry (`positionPlan` / `lines.position_plan`, drawn for 📌 positions, alert key `H:<t>:<peak>`); `stateAlerts` adds "zamknięcie pod Green Line".
  Backtest (5 positions × 20 %): GLB exit keeps the huge moves (SNDK +2409 %, MU +472 %, NVDA 2023 +221 %) but 77–82 % of trades are small losses; best with the
  "breakout at any height" entry (19.7 %/yr, DD −51 %), with the 0–10 % entry MACD is better (22.2 % vs 15.8 %); half at −20 %: DD −4…−6 pp, return −1…−3 pp.
- **Hamuje** (`calc.slowdown`): `slow` = revenue growth fell ≥ 10 pp vs the previous quarter ('HAMUJE'), + gross margin down y/y ('HAMUJE+MB': 50 % chance
  of a ≥ 20 % drop in 6 months vs 33 %); position warning only, not an entry condition. SEC entries carry `v: 4` (`rev_rr1`, `dopm1`, `accel`, `qs`, `op_d`,
  `rev_q`, `ttm_rev`, `shares`, `dil`); older entries are refetched. Didn't help: revenue acceleration alone, EPS, margin levels, q/q margin change,
  MACD state / SPY trend / breakout volume / base length at entry, Blue Dot / RWB as entry.
- ROE / ROI were tested and rejected (big winners had low ROE). Don't add them back without a new backtest.

## Data flow (`watchlist.py`, run weekly)

Finviz per scanner (`momentum/finviz.py`; reads the SSR-JSON layout, the `div.fv-table_row` layout and the old table; a scanner that
fails keeps its previous rows) → yfinance WEEKLY for the union + `symbols` (`momentum/prices.weekly`; INCREMENTAL: tickers already in
`docs/data/weekly/` get only the last 1–6 months merged in (`merge_weekly`), full 3 years only for new tickers, gaps > ~5 months or when the
overlapping close differs > 1.5 % = adjusted history) → for every scanner ticker (no turnover gate): yfinance MONTHLY candles (`prices.monthly`, closed months
only, cache `data/monthly.json` `{r: [[YYYY-MM, o, h, l, c, v]], upto, raw}`; High feeds the Green Line (`monthly_highs`; the old `{h}` format still works until the
next full refresh), the whole OHLC feeds the M chart (`write_monthly` → `docs/data/monthly/<file>.json` = `{d: [YYYY-MM-01], o, h, l, c, v}`, closed months only — the page
adds the month in progress from the weekly candles, `monthlyWithOpen`); after a month closes only `6mo` is fetched and merged (`merge_monthly`), `max` only for new
tickers / changed prices / old formats) and SEC companyfacts (`momentum/sec.py`, cache
`data/sec.json`, refreshed every 7 days; Q4 = FY − 3 quarters; needs a User-Agent: `SEC_UA` env / `finviz_screen.json` `sec_ua`).
Prices are NOT dividend-adjusted (`prices.AUTO_ADJUST = False`, split-adjusted only, like TradingView; user bug report: "CLMT pokazuje GLB 30 a w TV
55.26" — with dividend adjustment the 2007 high of an ex-MLP fell to ~20). Cached series / monthly entries carry `"raw": 1`; ones without it are
refetched in full once. No daily data any more (user, Oct 2026, like the desktop: "usuń dane dzienne, będę używał miesięcznego i tygodniowego"). Output: `docs/data/watchlist.json` (`generated_at`, `data_as_of`, `scanners` [{name, filters, total, n, stale}], `finviz_stale`, `rules`,
`rows` (each with `scanners`), `symbols`) and `docs/data/weekly/<file_name(ticker)>.json` = `{d, o, h, l, c, v}` (stale files are deleted). If Finviz fails for a scanner or
returns < 15 rows while it reports more, that scanner's previous rows are reused (`stale`); with prices for < 70 % of tickers nothing is written (exit 1).

## Frontend (`docs/`, plain HTML/CSS/JS, no build)

- `index.html` + `js/app.js`: toolbar (scanner select, only-conditions checkbox, **Filtry**, search, 🔔 Alerty, Ctrl+K, refresh link to `refresh.yml`,
  rules), one table (`COLUMNS` = the desktop columns), sort by header (asc/desc/default), status bar. **Filters** (user: "dodaj filtry do listy, nie samo
  sortowanie"): `state.filters` = {column: {in: [values]} | {min, max}}, all ANDed (`passFilters`; choices glb_state / macd / ok / sector, numeric from–to
  in table units, turnover in M$), presets `FILTER_PRESETS` (e.g. "Nad GLB + MACD dodatni", "Przebicie GLB + SMA 10 > 30"; column `trend` = weekly SMA 10 > SMA 30 from `build_row`, user: "nie mam filtra sma 10 > sma 30"); relative volume `rvol_w` = last week / mean of the 10 previous weeks (`calc.rel_volume`, `RVOL_W`), preset "Aktywne: RVol tyg. ≥ 1,5 + nad GLB", chart volume label "RVol x×" (amber ≥ 1.5); EVERY number column (`NUMERIC_FORMATS`: p % m r x x2 i — also EPS Rating, RWB tyg., RVol, P/S, PEG, C/C[52 tyg.]) has from–to fields (user: "dodaj w filtrach możliwość podania od do EPS rating"); same in the desktop app (`FilterDialog`). Click a row → chart; ↑/↓ step through the visible
  list; Esc closes. Wide screens (≥ 1000 px): list left, chart right (first row auto-opens); phones: chart full screen.
- **Ctrl+K**: dialog with a datalist of all tickers (`rows` + `symbols`), recent symbols in localStorage. The site is static, so a symbol
  that is not in the data must be added to `finviz_screen.json` `symbols` (computed on the next refresh).
- `js/chart.js` (pure, port of `desktop/chart.py`; since Oct 2026 the SIMPLE T / M layout of the desktop — user: "zmień desktopa na takie coś" and then "zmień to co dodaliśmy w webowej"):
  `chartSvg(data, row, w, h, nShow, end, lines, sel, spx, period, opt)` → `{svg, geom}`, `period` = `"W"` (T) or `"M"`, `opt` = `{rwb, zanger, real, pv, stop, stopLabel}`. Panels: RS Line (12 %, Deepvue:
  stock / SPY, `rsLine`, MA 52 weeks / 12 months, `rsMarkers` ● green = new RS high with price, ● pink = RS high before price, "+x pp" = `row.rs`), price (52 %: ONE grey colour OHLC bars,
  blue SMA 10, dotted green GLB line from the record candle with the price on the axis, **buy zone 0–10 % above GLB** = flat band `mix(bg or regime, ZONE, 0.16)` + dashed line at +5 %, "+5 % / +10 %"
  labels), volume + SMA 10, MACD (4-colour histogram). Green background where SPY of the SAME interval is above its SMA 10 (`spyRegime`) — also in Z. No revenue panel, no SMA 4 / 30, no E markers
  (earnings only in the tooltip), no MACD / plan lines (the position panel still plans exits). **M**: closed months from `docs/data/monthly` + the month in progress built from the weekly candles
  (`monthlyWithOpen`, `nClosed`); Green Line = `greenLine` of the closed months (`glbPeak`). **Z** (weekly only): price + volume + patterns, same SPY background, thick GLB line.
  **RWB** (button / key `r`, T and M): ONLY the indicator — blue strip at the bottom of the price panel, ● Blue Dot and a yellow ▲ under the Low of every candle where RWB starts again
  (`rwbStarts`, = add to the position; no label on the chart, the tooltip says "RWB START · dokup"; user: "daj samą strzałkę pod low żeby widzieć całą świecę. nie chcę tego napisu"); no GMMA fan.
  **Future slots** (`⇥ N` button cycles 0 / 6 / 12 / 20 / 30; `extendData` / `futureDates`, `real` = real candle count): empty candles to the right so lines can be drawn into the future (`slotIndex` in `lines.js`
  extends the grid, lines keep working after new data arrives). **Price scale**: `priceView(lmin, lmax, z, s)`; wheel over the right axis or Shift+wheel = zoom, drag the axis = pan, middle button = free pan
  (time + price), double click on the axis / `⤢ Cena` = automatic; SMA / bars are clipped to the price panel (`clipPath`), nothing sticks to the edge. **Persisted view** (`state.view[period]` =
  `{fut, n, z, s}` in localStorage, separately for T and M; T opens on the last 156 weeks, the rest is behind the slider). Range slider above the chart: `sliderSvg` minimap, `windowRange` / `sliderRect` /
  `sliderMode` / `sliderDrag` / `sliderJump` / `zoomWindow` (pure, same as `desktop/chart.py`); SMA / MACD are computed on the real series, then sliced. Labels must not overlap: left labels on a
  background box (`boxText`), right-axis labels via `axisSpots`, the legend drops its tail when it does not fit. Ruler: right mouse drag on the price panel (`rulerText`).
- **Trend lines + alerts** (`js/lines.js`, port of `desktop/lines.py`; user: "rysowanie linii jak przytrzymam … usuwanie, przesuwanie … alerty; webową
  używam głównie na telefonie"): line = `{id, period, d1, p1, d2, p2, alert}` (candle date + price, straight on the log scale; `period` "W" = T and Z, "M"; old lines without it are weekly; lines of the OTHER interval are drawn pale and dashed, read-only, `ro` — user: "linie na Z pokaż na M i T, moje linie nie patterny"). Mouse: drag on the price panel = new
  line; phone: hold a finger ~0.4 s, then move (a quick move = crosshair readout); grab an end = move that point, grab the middle = move the line; tap = select
  (🗑 / 🔔 alert buttons in the chart head, Delete key); magnet to the week's High/Low. `.chart-body` has `touch-action: none`. Alerts (`evalAlerts`, run after
  `watchlist.json` loads): weekly close crossed a line with alert on; 🔔 Obserwuj a ticker = GLB signal, MACD cross-down, close under the MACD stop,
  conditions met. Key includes the week, so nothing fires twice. localStorage `momentum_alerts` {lines, watch, log, seen}; system notification via the
  service worker if allowed. The site is static, so alerts are checked only when the page is opened (data refresh is weekly).
- **Line drawing UX** (user, Oct 2026: "linie są słabo zaimplementowane … ma być przyjemnie, super łatwo rysować" — Zanger works on trend lines): button **✏ Linia** / key `l` = draw mode: ONE drag (mouse or finger, no long-press) = new line, sticky until Esc / the button; without the mode the old gestures still work (mouse drag, phone long-press);
  a line whose end lands near the level of its other end snaps to horizontal (`snapHorizontal`, `tol × 0.6`, hint "poziomo"); live hint circle + `rulerText` (% · weeks · price) while drawing / moving an end; bigger hit targets (touch 24, mouse 9 px) and handles (r 8); selected line always shows its price on the right edge;
  **↶ / Ctrl+Z** undo per ticker (`lineUndo`, 30 states, pushed when a gesture changed the lines or on delete); NEW lines have `alert: false` and no dashed extension (user: "bez alarmów i przedłużeń, sam chcę dodać alarmy"); the extension to the last week (and 🔔 value) appears only with the alert on (old lines without the flag count as on); a bare click in draw mode leaves no line (zero-length lines are dropped by `saveLines`). The desktop app has the same horizontal snap / hint / undo (`ChartWindow`, `lines.snap_horizontal`) but no ✏ mode — the mouse already draws with one drag.
- **📊 Fundamenty** (`#fundDlg`, port of desktop `fund_panel_lines`): status, last report, LISTA KONTROLNA, PLAN WYJŚCIA. **📌 Pozycja** (`ast.pos`, also watched) marks a
  position: 📌 in the list, amber ticker when slowing / under the MACD stop, slowdown alert (`stateAlerts`, `snapshot.slow`).
  **📌 Pozycje** panel (`#posDlg` / desktop `PositionsDialog`; user: "nie mam panelu pozycje i obserwowane"): positions with plan (entry, peak, ½ at, stop −10 %,
  exit level by method) and "Co teraz" (`positionStatus` / `lines.position_status`: STOP −10 %, WYJŚCIE, SPRZEDAJ ½, hamuje; empty = trzymaj), watched tickers
  below; click = chart, ✕ = remove.
- **Manual stop + 💰 Wielkość** (ports of desktop `PositionSizeDialog` / `lines.position_size`; user: "daj mi możliwość ręcznego przesuwania stopa … bo będę używał chart patternów"): 🛑 Stop (or double click on the
  price panel, magnet to High / Low) = red dashed line you drag (mouse or finger); one level per ticker for T, M and Z (`state.stops`), label "STOP x · −y % · N akcji (PLN)". 💰 (`#sizeDlg`):
  capital in PLN, risk %, USD/PLN (NBP, fallback Frankfurter — the browser cannot read Yahoo; editable), entry and stop (defaults from the 📌 position: stop = max(−10 %, MACD since entry), otherwise
  last price and Green Line / −10 %; a typed stop becomes the manual stop); `positionSize` (shares are FRACTIONAL, rounded down to 4 decimals, `sharesText`; user: "pozycja może mieć akcje ułamkowe").
- **Gist (desktop → web)** (user: "jak pobiorę dane z desktopa chcę mieć możliwość wysłania do webowej … przez gist; weekly refresh będzie pobierał osobno, na wypadek gdybym nie miał dostępu do PC"):
  the desktop's ☁ Web (gist) uploads `momentum.json` (manifest: rows, symbols, sectors, `generated_at`, `data_as_of`, `chunks` map ticker → chunk number) + `weekly_NN.json` / `monthly_NN.json`
  ({ticker: series}, ≈ 0.9 MB each; manifest last) to a SECRET gist (token with the `gist` scope kept in the desktop's `settings.json`). The page's ☁ Gist button stores the gist ID (localStorage
  `state.gist` = {id, mode: auto / gist / repo}); `loadGist` reads `api.github.com/gists/<id>` and the `raw_url`s (no token), `chooseSource` picks the NEWER `generated_at` in auto mode, `fromGist`
  serves candles from the chunks and falls back to `docs/data/...` for tickers that are not in the gist. The Weekly Refresh workflow is independent (repo data), so the page works without the PC.
- Loading bar at the bottom (`#loadbar`, `fetchJson` streams the body: MB, % when the size is known, seconds).
- `sw.js`: network-first PWA cache (bump `CACHE`, keep `SHELL` in sync). Settings in localStorage `momentum_settings_v2`.

## CI (`.github/workflows/`)

- `refresh.yml` ("Weekly Refresh"): Saturday 03:17 UTC + manual; runs `python watchlist.py`, commits `docs/data/` and `data/` with
  `[skip ci]` (reset onto current `origin/main`, retry loop) and deploys Pages.
- `deploy.yml`: Pages deploy on push to `main`.
- `tests.yml`: ruff + pytest, ESLint + `node --test`.

Code comments and CLI messages are in Polish; keep that convention.

## Commands

```bash
pip install -r requirements.txt -r requirements-dev.txt
python watchlist.py [--max-tickers N]
python -m pytest -q && ruff check .
npm ci && npm test && npm run lint
cd docs && python3 -m http.server
```
