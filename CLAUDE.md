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

- **One Finviz list** (`finviz_screen.json` `scanners` = one entry "Finviz"; a full screener URL pasted in Actions → Weekly Refresh replaces it;
  `symbols` = SPY only, for RS). Finviz silently ignores unknown filter codes — check the count after editing. Extra Finviz views 121/161/131
  give PEG, forward P/E, dividend yield (`peg`, `pegy` = P/E ÷ (growth + yield), `calc.pegy_ratio`) — columns only.
- **Informational columns only** (NOT in `passes`): `rs` (52-week close change minus SPY's, pp), `ps` (P/S), `surp` / `beat2` / `eps_rev` (EPS
  surprises / estimate revision, `momentum/estimates.py`, cache `data/estimates.json`, 7 days), `cc52w` (C/C[52 tyg.] = close / close 52 weeks
  ago, `calc.price_ratio`), `rvol_w` / `rvol_d`, `turnover`, `dgm`, `slow`. The fundamentals panel lists P/S, RS and beat2 as "kryterium wyłączone".
- **Green Line** (`green_line`): all-time-high MONTHLY HIGH (user: "zrób GLB na high jak oryginalnie, nie na close"; re-run on
  NOT dividend-adjusted prices, Oct 2026, per trade: High line +1.9 % vs Close +0.2 %, with the margin filter; portfolio CAGRs are path-dependent noise) that has stood 3 months in total = the peak month + 2 closed ones (`CONFIRM_MONTHS` = 2; Dr Wish: "at least 3 months", user: "licz łącznie czyli dwie świeczki po szczycie"; after a new record the old
  line stays valid until the new one has stood the same 3 months. Entry is still judged on the weekly CLOSE. `glb_state`: WYBICIE (breakout week — last week below —
  at ANY height = strong breakout), SYGNAŁ (0–10 % above), BLUE DOT (a later week > 10 % above AND a daily Blue Dot in the last 5 sessions,
  `calc.fresh_blue_dot`, set by `watchlist.py` / desktop `sync.run` from the 1-year daily candles; user: "jeżeli jesteśmy ponad 10 % i to nie jest świeca
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
overlapping close differs > 1.5 % = adjusted history) → for every scanner ticker (no turnover gate): yfinance MONTHLY HIGH (`prices.monthly`, closed months
only, cache `data/monthly.json` `{h, upto}`; after a month closes only `6mo` is fetched and merged (`merge_monthly`), `max` only for new
tickers / changed prices / old close-based `m` entries) and SEC companyfacts (`momentum/sec.py`, cache
`data/sec.json`, refreshed every 7 days; Q4 = FY − 3 quarters; needs a User-Agent: `SEC_UA` env / `finviz_screen.json` `sec_ua`).
Prices are NOT dividend-adjusted (`prices.AUTO_ADJUST = False`, split-adjusted only, like TradingView; user bug report: "CLMT pokazuje GLB 30 a w TV
55.26" — with dividend adjustment the 2007 high of an ex-MLP fell to ~20). Cached series / monthly entries carry `"raw": 1`; ones without it are
refetched in full once. Daily candles (1 year, `prices.daily`) only for rows above the Green Line (`ABOVE_GLB`): `docs/data/daily/<file>.json`, row flag
`daily`. Output: `docs/data/watchlist.json` (`generated_at`, `data_as_of`, `scanners` [{name, filters, total, n, stale}], `finviz_stale`, `rules`,
`rows` (each with `scanners`), `symbols`) and `docs/data/weekly/<file_name(ticker)>.json` = `{d, o, h, l, c, v}` (stale files are deleted). If Finviz fails for a scanner or
returns < 15 rows while it reports more, that scanner's previous rows are reused (`stale`); with prices for < 70 % of tickers nothing is written (exit 1).

## Frontend (`docs/`, plain HTML/CSS/JS, no build)

- `index.html` + `js/app.js`: toolbar (scanner select, only-conditions checkbox, **Filtry**, search, 🔔 Alerty, Ctrl+K, refresh link to `refresh.yml`,
  rules), one table (`COLUMNS` = the desktop columns), sort by header (asc/desc/default), status bar. **Filters** (user: "dodaj filtry do listy, nie samo
  sortowanie"): `state.filters` = {column: {in: [values]} | {min, max}}, all ANDed (`passFilters`; choices glb_state / macd / ok / sector, numeric from–to
  in table units, turnover in M$), presets `FILTER_PRESETS` (e.g. "Nad GLB + MACD dodatni", "Przebicie GLB + SMA 10 > 30"; column `trend` = weekly SMA 10 > SMA 30 from `build_row`, user: "nie mam filtra sma 10 > sma 30"); relative volume `rvol_w` = last week / mean of the 10 previous weeks (`calc.rel_volume`, `RVOL_W`) and `rvol_d` = last session / mean of the 50 previous (`RVOL_D`; filled by `watchlist.py` from the daily candles — 1 y for rows above GLB, 3 mo for the other liquid ones, not saved; desktop `sync.run` via `prices.daily`), preset "Aktywne: RVol tyg. ≥ 1,5 + nad GLB", chart volume label "RVol x×" (amber ≥ 1.5), daily volume average SMA 50 (user: "wolumen relatywny … dla tygodnia sma10, dla dnia sma50"); same in the desktop app (`FilterDialog`). Click a row → chart; ↑/↓ step through the visible
  list; Esc closes. Wide screens (≥ 1000 px): list left, chart right (first row auto-opens); phones: chart full screen.
- **Ctrl+K**: dialog with a datalist of all tickers (`rows` + `symbols`), recent symbols in localStorage. The site is static, so a symbol
  that is not in the data must be added to `finviz_screen.json` `symbols` (computed on the next refresh).
- `js/chart.js` (pure, port of `desktop/chart.py`): `chartSvg(data, row, w, h, nShow, end, lines, sel)` → `{svg, geom}`: log price scale, HLC bars, SMA 10 (red) /
  30 (amber) weeks (user: "zmień sma40 na sma30"), cyan user trend lines (segment + dashed extension to the last week, 🔔 value at the right edge), thick green GLB line with "GREEN LINE x · kupno do x×1.1", red dashed MACD stop, volume + SMA 10, MACD panel with ▼
  at cross-downs; hover readout from `infoLines`. Range slider above the chart (user: "suwak był fajny, dodaj go z powrotem"): `sliderSvg`
  minimap, `windowRange` / `sliderRect` / `sliderMode` / `sliderDrag` / `sliderJump` / `zoomWindow` (pure, same as `desktop/chart.py`);
  SMA / MACD are computed on the full series, then sliced. Window length persists (`state.nShow`), its end resets per stock.
  Labels must not overlap (user: "dużo napisów nachodzi na siebie"): left labels on a background box (`boxText` / desktop `boxed`); the GLB label goes under
  the line near the top edge; right-axis labels via `axisSpots` / `axis_spots` (GLB fixed, last close and MACD stop move 16 px away, ticks near them hidden);
  quarter dates every N quarters by label width; revenue bars leave room for the title.
- **Trend lines + alerts** (`js/lines.js`, port of `desktop/lines.py`; user: "rysowanie linii jak przytrzymam … usuwanie, przesuwanie … alerty; webową
  używam głównie na telefonie"): line = `{id, d1, p1, d2, p2, alert}` (week date + price, straight on the log scale). Mouse: drag on the price panel = new
  line; phone: hold a finger ~0.4 s, then move (a quick move = crosshair readout); grab an end = move that point, grab the middle = move the line; tap = select
  (🗑 / 🔔 alert buttons in the chart head, Delete key); magnet to the week's High/Low. `.chart-body` has `touch-action: none`. Alerts (`evalAlerts`, run after
  `watchlist.json` loads): weekly close crossed a line with alert on; 🔔 Obserwuj a ticker = GLB signal, MACD cross-down, close under the MACD stop,
  conditions met. Key includes the week, so nothing fires twice. localStorage `momentum_alerts` {lines, watch, log, seen}; system notification via the
  service worker if allowed. The site is static, so alerts are checked only when the page is opened (data refresh is weekly).
- **Chart like the desktop** (`desktop/chart.py`): Deepvue-style RS Line panel on top (stock / SPY, `rsLine`, 52-week MA — 252 sessions on D,
  `rsMarkers`: ● green = new RS high together with price, ● pink = RS high before price; "+x pp" = `row.rs` on the right axis), price with SMA 4 / 10 / 30
  weeks, "E" earnings markers on candles (`earningsIndices`, `row.earn` = [[date, EPS surprise %, revenue surprise %]] from `watchlist.py`), plan
  labels (stop −10 %, ½ at −20 % from the peak; `stopLevel`), volume, quarterly revenue bars with y/y %, MACD. Ruler: right mouse drag on the price
  panel (`rulerText`: % change · bars · from → to). No S&P 500 / C/C52 / EPS panels, no RS Rating (removed with the desktop's Growth Score / CAN SLIM).
  Period buttons T / D (`#perW` / `#perD`; desktop also has M).
- **📊 Fundamenty** (`#fundDlg`, port of desktop `fund_panel_lines`): status, last report, LISTA KONTROLNA, PLAN WYJŚCIA. **📌 Pozycja** (`ast.pos`, also watched) marks a
  position: 📌 in the list, amber ticker when slowing / under the MACD stop, slowdown alert (`stateAlerts`, `snapshot.slow`).
  **📌 Pozycje** panel (`#posDlg` / desktop `PositionsDialog`; user: "nie mam panelu pozycje i obserwowane"): positions with plan (entry, peak, ½ at, stop −10 %,
  exit level by method) and "Co teraz" (`positionStatus` / `lines.position_status`: STOP −10 %, WYJŚCIE, SPRZEDAJ ½, hamuje; empty = trzymaj), watched tickers
  below; click = chart, ✕ = remove.
- **T / D** (`#perW` / `#perD`, D only for `row.daily`; user: "Dr Wish używa RWB … blue dot"): daily mode of `chartSvg(…, period="D")` — Guppy GMMA
  (`gmma`: fast 3–15 red, slow 30–60 blue), lighter background while RWB (`rwb`: lowest fast EMA above highest slow), ● Blue Dot (`blueDots`: Stochastic 10,1
  crosses 20 up, RWB, close ≥ Green Line) with the stop under its Low; two styles (`D: RWB` / `D: słupki`, `dailyRwb`): close LINE + GMMA/RWB, or OHLC bars + EMA 8/10/20 + SMA 50 (`DAILY_MA`); no MACD / revenue / Stochastic panels (user: "linia ceny nie słupki, wywal przychody i Stoch"); separate window (`dShow`, default 260 sessions);
  trend lines only on the weekly chart. Preview only: the backtest (RWB + above GLB + Blue Dot, stop under the dot, MACD exit) gave +1.0…+1.2 % per trade,
  14–15 % hit rate — weaker than the weekly GLB 0–10 % entry. Same functions in `calc.py` (`gmma`, `rwb`, `stoch_k`, `blue_dots`).
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
