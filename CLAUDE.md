# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A static site (`docs/`, GitHub Pages) with **one strategy** — a web copy of the desktop app
[agnar92/MomentumDesktop](https://github.com/agnar92/MomentumDesktop) (user, Oct 2026: "zrób ten sam refaktor dla aplikacji webowej
momentum, chcę mieć taką samą kopię co na desktop"). The strategy and every number come from the backtests done for the desktop app
(liquid US market 2015–2026); keep both apps in sync — a rule change goes into `momentum/calc.py` here AND `desktop/calc.py` there.
Informational only, not investment advice.

**History:** this repo used to be a large app (CANSLIM checklist, O'Neil bases, Darvas boxes / Dar-Card, Qullamaggie, Watchlisty, Krok po
kroku, positions, alerts, gist sync, estimates, book-style charts, daily charts …). At the user's request ("usuń Dar-Card, usuń wszystkie
skany oprócz jednego z filtrem Finviz … CANSLIM i bazy już niepotrzebne … jak najmniej kodu, najprościej") all of it was removed; it is in
git history (last full version: the commit before "Refaktor: jedna strategia z backtestu").

## Strategy (`momentum/calc.py`, constants at the top)

- **Scanners** (user: "daj mi możliwość wybrania skanerów, jak było wcześniej"): `finviz_screen.json` `scanners` = [{name, filters, max_tickers}]
  (default: Bezpieczny (backtest) = safe pre-filter `ind_stocksonly,sh_price_o10,sh_avgvol_o300,fa_salesqoq_o15`, it cut none of the big winners
  in the backtest; Trend 50/200; Blisko rekordu (ATH); CANSLIM). Every scanner runs the same strategy; rows are merged by ticker with a
  `scanners` field and the page has a scanner select (`state.scanner`). The desktop app has the same list in its settings (per-scanner data
  `data/scans/<slug>.json`). Finviz silently ignores unknown filter codes — check the count after editing.
- **Conditions** (`passes`; user, Oct 2026: "ogranicz parametry do tych najważniejszych … tylko te które działają i mają największy wpływ. Zwiększ obrót"):
  NO turnover limit any more (user: "usuń limit obrotu w ogóle, sam będę filtrował w Finviz po wolumenie"; `turnover` = mean weekly $-volume of the last
  4 weeks / 5 is only a column; the backtest below was run on turnover ≥ 100 M$), quarterly revenue ≥ +15 % y/y, operating margin change ≥ +3 pp y/y,
  P/S < 20 (`ps` = Finviz market cap / SEC TTM revenue, else price × shares; missing doesn't block), relative strength `rs` ≥ 50 pp (`rel_strength`: 52-week
  close change minus SPY's over the same weeks; SPY is always fetched, `watchlist.BENCH`; missing history blocks, as in the backtest). Backtest (all GLB 0–10 %
  signals 2015–2026, raw prices, stop 10 % + weekly MACD): +15.6 % per trade, all-signal portfolio 36.6 % a year (2015–20 43.9 / 2021–26 29.6; 2020–26 46.5 %),
  DD −55 %, only 2–4 positions open on average; without RS 21.4 %, without Δ margin 28.9 %, without P/S 31.5 %, without revenue 34.9 %. Removed because they
  changed nothing with these conditions: revenue ≥ 25 M$, operating income in $ up, "Mocne" (Δ margin ≥ 10 pp), dilution, Potencjał ★. Study behind RS
  (all GLB breakouts vs the big +100 % moves): the common denominator was growing revenue + margin AND the stock already leading the market; pure technical
  rules (GLB, EMA/SMA crosses, RS without fundamentals, Qullamaggie-style daily breakouts, buy +0.1 % / sell −0.1 % at the line) did not beat SPY in 2020–26.
  Default order: conditions + GLB signal, conditions, then by RS.
  **EPS surprises** (user asked to check another AI's idea: estimate revisions + accelerating revenue): condition `beat2` = the last 2 reports beat the EPS
  consensus (`calc.surprises`, last report ≤ 120 days old; missing blocks, as in the backtest). Data: `momentum/estimates.py` (same file in the desktop app) —
  yfinance `get_earnings_dates` (surprise %) and `eps_trend` (+1y estimate now vs 90 days ago = `eps_rev`, preview only; weekly snapshots kept in `hist`),
  cache `data/estimates.json`, refreshed every 7 days. Backtest (surprises since 2014, 1763 tickers): 36.6 → 42.4 %/yr (2015–20 48.7 / 2021–26 36.4; 2020–26 53.7 %),
  +19.2 % per trade, DD −51 %; a miss before the signal: 3 %/yr; thresholds ≥ 5 / 10 % and 2-quarter revenue acceleration didn't help. Revisions can't be
  backtested (no history in yfinance). Columns `surp`, `beat2`, `eps_rev`.
- **Green Line** (`green_line`): all-time-high MONTHLY HIGH (user: "zrób GLB na high jak oryginalnie, nie na close"; re-run on
  NOT dividend-adjusted prices, Oct 2026, per trade: High line +1.9 % vs Close +0.2 %, with the margin filter; portfolio CAGRs are path-dependent noise) that has stood ≥ 3 closed months ("3 lub więcej"); after a new record the old
  line stays valid until the new one has stood 3 months. Entry is still judged on the weekly CLOSE. `glb_state`: WYBICIE (this week closed 0–10 % above,
  last week below), SYGNAŁ (0–10 % above), NAD (further), POD, BRAK.
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
- **Chart panels like IBD**: S&P 500 (SPY weekly file, `symbols`) above the price, quarterly revenue bars with y/y % (green ≥ 25 %, amber ≥ 15 %) under the volume.
  Weekly only: IBD relative-strength line (`rsLine` / `chart.rs_line` = close / SPY close, own log scale in the bottom 22 % of the price panel, ● when the last
  value is the 52-week high, and only the number "+x pp" (`row.rs`) at the line's end on the right axis — no text label (user: "wystarczy numer na końcu linii"); user: "nie widzę wykresu siły relatywnej jak mają w IBD"). Period buttons T / D
  (`#perW` / `#perD`; desktop M / T / D, `per_btns`; user: "osobne przyciski … M, T, D").
- **📖 Poradnik** (`#guideDlg`): the study's rules + a checklist of the open stock (`checklist(r)`); **📌 Pozycja** (`ast.pos`, also watched) marks a
  position: 📌 in the list, amber ticker when slowing / under the MACD stop, slowdown alert (`stateAlerts`, `snapshot.slow`).
  **📌 Pozycje** panel (`#posDlg` / desktop `PositionsDialog`; user: "nie mam panelu pozycje i obserwowane"): positions with plan (entry, peak, ½ at, stop −10 %,
  exit level by method) and "Co teraz" (`positionStatus` / `lines.position_status`: STOP −10 %, WYJŚCIE, SPRZEDAJ ½, hamuje; empty = trzymaj), watched tickers
  below; click = chart, ✕ = remove.
- **T / D** (`#perW` / `#perD`, D only for `row.daily`; user: "Dr Wish używa RWB … blue dot"): daily mode of `chartSvg(…, period="D")` — Guppy GMMA
  (`gmma`: fast 3–15 red, slow 30–60 blue), lighter background while RWB (`rwb`: lowest fast EMA above highest slow), ● Blue Dot (`blueDots`: Stochastic 10,1
  crosses 20 up, RWB, close ≥ Green Line) with the stop under its Low; price as a close LINE, no MACD / revenue / Stochastic panels (user: "linia ceny nie słupki, wywal przychody i Stoch"); separate window (`dShow`, default 260 sessions);
  trend lines only on the weekly chart. Preview only: the backtest (RWB + above GLB + Blue Dot, stop under the dot, MACD exit) gave +1.0…+1.2 % per trade,
  14–15 % hit rate — weaker than the weekly GLB 0–10 % entry. Same functions in `calc.py` (`gmma`, `rwb`, `stoch_k`, `blue_dots`).
- Loading bar at the bottom (`#loadbar`, `fetchJson` streams the body: MB, % when the size is known, seconds).
- `sw.js`: network-first PWA cache (bump `CACHE`, keep `SHELL` in sync). Settings in localStorage `momentum_glb_settings`.

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
