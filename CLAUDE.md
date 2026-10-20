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

- **List**: Finviz screener with `finviz_screen.json` `filters` (default safe pre-filter `ind_stocksonly,sh_price_o10,sh_avgvol_o300,fa_salesqoq_o15`,
  it cut none of the big winners in the backtest). Finviz silently ignores unknown filter codes — check the count after editing.
- **Conditions** (`passes`): daily turnover ≥ 50 M$ (`turnover` = mean weekly $-volume of the last 4 weeks / 5), quarterly revenue ≥ +15 % y/y,
  operating margin change ≥ +3 pp y/y (SEC). Default order: conditions + GLB signal first, then conditions, then by Δ operating margin.
- **Green Line** (`green_line`): all-time-high MONTHLY close that has stood ≥ 3 closed months ("3 lub więcej"); after a new record the old
  line stays valid until the new one has stood 3 months. Close-based (not High-based). `glb_state`: WYBICIE (this week closed 0–10 % above,
  last week below), SYGNAŁ (0–10 % above), NAD (further), POD, BRAK.
- **Exit**: weekly MACD (12, 26, 9) — stop = Low of the last cross-down week (`macd_info`), plus a 10 % initial stop (`STOP_PCT`, shown only).
- ROE / ROI were tested and rejected (big winners had low ROE). Don't add them back without a new backtest.

## Data flow (`watchlist.py`, run weekly)

Finviz (`momentum/finviz.py`; reads the SSR-JSON layout, the `div.fv-table_row` layout and the old table) → yfinance WEEKLY 3 years for
all tickers + `symbols` (`momentum/prices.weekly`) → only for turnover ≥ 50 M$: yfinance MONTHLY `period="max"` (`prices.monthly`, closed
months only, cache `data/monthly.json`, refetched only after the next month closes) and SEC companyfacts (`momentum/sec.py`, cache
`data/sec.json`, refreshed every 7 days; Q4 = FY − 3 quarters; needs a User-Agent: `SEC_UA` env / `finviz_screen.json` `sec_ua`).
No daily data. Output: `docs/data/watchlist.json` (`generated_at`, `data_as_of`, `finviz_filters`, `finviz_total`, `finviz_stale`, `rules`,
`rows`, `symbols`) and `docs/data/weekly/<file_name(ticker)>.json` = `{d, o, h, l, c, v}` (stale files are deleted). If Finviz fails or
returns < 15 rows the previous list is reused (`finviz_stale`); with prices for < 70 % of tickers nothing is written (exit 1).

## Frontend (`docs/`, plain HTML/CSS/JS, no build)

- `index.html` + `js/app.js`: toolbar (only-conditions checkbox, search, Ctrl+K, refresh link to `refresh.yml`, rules), one table
  (`COLUMNS` = the desktop columns), sort by header (asc/desc/default), status bar. Click a row → chart; ↑/↓ step through the visible
  list; Esc closes. Wide screens (≥ 1000 px): list left, chart right (first row auto-opens); phones: chart full screen.
- **Ctrl+K**: dialog with a datalist of all tickers (`rows` + `symbols`), recent symbols in localStorage. The site is static, so a symbol
  that is not in the data must be added to `finviz_screen.json` `symbols` (computed on the next refresh).
- `js/chart.js` (pure, port of `desktop/chart.py`): `chartSvg(data, row, w, h)` → `{svg, geom}`: log price scale, HLC bars, SMA 10 (red) /
  40 (amber) weeks, thick green GLB line with "GREEN LINE x · kupno do x×1.1", red dashed MACD stop, volume + SMA 10, MACD panel with ▼
  at cross-downs; hover readout from `infoLines`.
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
