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
- **Conditions** (`passes`): daily turnover ≥ 50 M$ (`turnover` = mean weekly $-volume of the last 4 weeks / 5), quarterly revenue ≥ +15 % y/y,
  operating margin change ≥ +3 pp y/y (SEC). Default order: conditions + GLB signal first, then conditions, then by Δ operating margin.
- **Green Line** (`green_line`): all-time-high MONTHLY HIGH (user: "zrób GLB na high jak oryginalnie, nie na close"; note: in the backtest the
  close-based line did better) that has stood ≥ 3 closed months ("3 lub więcej"); after a new record the old
  line stays valid until the new one has stood 3 months. Entry is still judged on the weekly CLOSE. `glb_state`: WYBICIE (this week closed 0–10 % above,
  last week below), SYGNAŁ (0–10 % above), NAD (further), POD, BRAK.
- **Exit**: weekly MACD (12, 26, 9) — stop = Low of the last cross-down week (`macd_info`), plus a 10 % initial stop (`STOP_PCT`, shown only).
- ROE / ROI were tested and rejected (big winners had low ROE). Don't add them back without a new backtest.

## Data flow (`watchlist.py`, run weekly)

Finviz per scanner (`momentum/finviz.py`; reads the SSR-JSON layout, the `div.fv-table_row` layout and the old table; a scanner that
fails keeps its previous rows) → yfinance WEEKLY for the union + `symbols` (`momentum/prices.weekly`; INCREMENTAL: tickers already in
`docs/data/weekly/` get only the last 1–6 months merged in (`merge_weekly`), full 3 years only for new tickers, gaps > ~5 months or when the
overlapping close differs > 1.5 % = adjusted history) → only for turnover ≥ 50 M$: yfinance MONTHLY HIGH (`prices.monthly`, closed months
only, cache `data/monthly.json` `{h, upto}`; after a month closes only `6mo` is fetched and merged (`merge_monthly`), `max` only for new
tickers / changed prices / old close-based `m` entries) and SEC companyfacts (`momentum/sec.py`, cache
`data/sec.json`, refreshed every 7 days; Q4 = FY − 3 quarters; needs a User-Agent: `SEC_UA` env / `finviz_screen.json` `sec_ua`).
No daily data. Output: `docs/data/watchlist.json` (`generated_at`, `data_as_of`, `scanners` [{name, filters, total, n, stale}], `finviz_stale`, `rules`,
`rows` (each with `scanners`), `symbols`) and `docs/data/weekly/<file_name(ticker)>.json` = `{d, o, h, l, c, v}` (stale files are deleted). If Finviz fails for a scanner or
returns < 15 rows while it reports more, that scanner's previous rows are reused (`stale`); with prices for < 70 % of tickers nothing is written (exit 1).

## Frontend (`docs/`, plain HTML/CSS/JS, no build)

- `index.html` + `js/app.js`: toolbar (scanner select, only-conditions checkbox, **Filtry**, search, 🔔 Alerty, Ctrl+K, refresh link to `refresh.yml`,
  rules), one table (`COLUMNS` = the desktop columns), sort by header (asc/desc/default), status bar. **Filters** (user: "dodaj filtry do listy, nie samo
  sortowanie"): `state.filters` = {column: {in: [values]} | {min, max}}, all ANDed (`passFilters`; choices glb_state / macd / ok / sector, numeric from–to
  in table units, turnover in M$), presets `FILTER_PRESETS` (e.g. "Nad GLB + MACD dodatni"); same in the desktop app (`FilterDialog`). Click a row → chart; ↑/↓ step through the visible
  list; Esc closes. Wide screens (≥ 1000 px): list left, chart right (first row auto-opens); phones: chart full screen.
- **Ctrl+K**: dialog with a datalist of all tickers (`rows` + `symbols`), recent symbols in localStorage. The site is static, so a symbol
  that is not in the data must be added to `finviz_screen.json` `symbols` (computed on the next refresh).
- `js/chart.js` (pure, port of `desktop/chart.py`): `chartSvg(data, row, w, h, nShow, end, lines, sel)` → `{svg, geom}`: log price scale, HLC bars, SMA 10 (red) /
  30 (amber) weeks (user: "zmień sma40 na sma30"), cyan user trend lines (segment + dashed extension to the last week, 🔔 value at the right edge), thick green GLB line with "GREEN LINE x · kupno do x×1.1", red dashed MACD stop, volume + SMA 10, MACD panel with ▼
  at cross-downs; hover readout from `infoLines`. Range slider above the chart (user: "suwak był fajny, dodaj go z powrotem"): `sliderSvg`
  minimap, `windowRange` / `sliderRect` / `sliderMode` / `sliderDrag` / `sliderJump` / `zoomWindow` (pure, same as `desktop/chart.py`);
  SMA / MACD are computed on the full series, then sliced. Window length persists (`state.nShow`), its end resets per stock.
- **Trend lines + alerts** (`js/lines.js`, port of `desktop/lines.py`; user: "rysowanie linii jak przytrzymam … usuwanie, przesuwanie … alerty; webową
  używam głównie na telefonie"): line = `{id, d1, p1, d2, p2, alert}` (week date + price, straight on the log scale). Mouse: drag on the price panel = new
  line; phone: hold a finger ~0.4 s, then move (a quick move = crosshair readout); grab an end = move that point, grab the middle = move the line; tap = select
  (🗑 / 🔔 alert buttons in the chart head, Delete key); magnet to the week's High/Low. `.chart-body` has `touch-action: none`. Alerts (`evalAlerts`, run after
  `watchlist.json` loads): weekly close crossed a line with alert on; 🔔 Obserwuj a ticker = GLB signal, MACD cross-down, close under the MACD stop,
  conditions met. Key includes the week, so nothing fires twice. localStorage `momentum_alerts` {lines, watch, log, seen}; system notification via the
  service worker if allowed. The site is static, so alerts are checked only when the page is opened (data refresh is weekly).
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
