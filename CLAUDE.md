# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

**Fundamenta — jakość vs wycena** (renamed from „Momentum”, user, Nov 2026: „zmień nazwę aplikacji, bo to już nie momentum”; repo and the Python package `momentum/` keep the old name; user, Nov 2026: „usuń wszystko co tam jest … strona porównująca jakość spółki do wyceny pod kątem PEG i DCF … znalezienie
jakościowo wzrostowych spółek, które są na tle rynku znacznie lepsze”; layout inspired by screenshots of a commercial stock-analysis site the user follows,
built with our own name, design, Polish texts and no AI-generated text). A static site (`docs/`, GitHub Pages) covering the **500 largest US-listed
stocks by market cap EXCLUDING Financial, Basic Materials, Energy, Utilities and Real Estate** (user, Nov 2026: „wyklucz sektory, które autor mówi, że ciężko przewidzieć”; `spolki.wybierz`), refreshed weekly. The old app (CEM10 momentum lists, GLB charts, Wycena / Quality / FLIP pages, desktop gist sync …) was removed at
the user's request; it is in git history (last version: the commit before „Nowa strona: jakość vs wycena”). The desktop app (agnar92/MomentumDesktop) is
no longer mirrored here. `research/` (backtests, `protokol.md`, `rejestr.csv`) stays — the strategy criteria on the site come from it.
Informational only, not investment advice. Code comments, UI and CLI messages are in Polish; keep that convention.

## Data (`spolki.py`, `momentum/fundamenty.py`, `momentum/ocena.py`)

`python spolki.py [--top 500] [--cache DIR] [--out docs/data]`:
1. Finviz screener `cap_largeover`, views 111 / 121 / 161, all pages (SSR JSON, `ssr_rows`) → 500 largest by `marketCap` (Finviz units: marketCap in
   millions, percentages in %). < 400 rows = nothing written.
2. SEC: CIK from `company_tickers.json`, companyfacts per ticker (4 threads, `SEC_UA` env / secret) → `fundamenty.wyciag`: for every key ALL tags of its
   list are kept ({tag: rows}) and `polacz` picks, per date, the first tag that has a value (companies switch tags, e.g. Revenues →
   RevenueFromContract…; NVDA's marketable securities tag stopped). Quarters (`kwartalne`): 3-month values plus differences of cumulative values of the
   same fiscal year (Q4 = FY − 9M; quarterly cash flow from YTD); first filing wins (no restatements). Debt (`dlug`): non-current + current + short-term
   borrowings + commercial paper, fallback LongTermDebt. Foreign IFRS / 20-F filers have no us-gaap data (~100 of 500: TSM, ASML …) → Finviz fallbacks
   (sales / EPS 5Y growth, FCF = mcap / P/FCF, cash = mcap / P/C, debt = D/E × mcap / P/B, revenue = mcap / P/S). Cash = max(SEC cash + short-term
   investments, Finviz mcap / P/C when > 1.2× SEC). < 70 % of tickers with SEC revenue = nothing written.
3. yfinance weekly closes, 5 years (adjusted) → price chart and 1W / 1M / 1Y / 5Y returns.
4. `ocena.metryki` (growth 1Y / 3Y / 5Y TTM, quarter y/y, years with revenue > 10 % of last 5, margins / ROE / ROA / ROIC from Finviz, ROCE = operating
   income TTM / (assets − current liabilities), ROE now (SEC) vs 5 years ago, FCF TTM and margin, net cash, PEG = P/E ÷ (100 × Finviz EPS next 5Y));
   `oceny` = percentile of each metric within its **sector** (≥ 5 peers), group score = mean × 10 with a missing metric counted as 0.5 (`BRAK`, neutral; user: missing data inflated scores, e.g. RDDT growth 9.7 from 4 of 7 metrics); `mediany` = sector medians shown under every metric on the card (`sektor_med`, user: „P/E powinien być do sektora”): Wzrost (growth), Siła (strength), Wycena (value; high =
   cheap), Ogólna = 0.4 / 0.35 / 0.25 (needs growth + one other group); `typy` = Lynch categories by own rules with fit 0–100; `strategie` = checklists
   from research: **7/7 (niskie ryzyko)** (the Hello-Stocks-style screen, stage 67–68: rev 5Y > +50 %, rev and earnings 1Y > 5 %, ROE > 15 %, D/E 0–1,
   FCF > 0, PEG 0–1; excluded sectors Financial, Basic Materials, Energy, Utilities, Real Estate), **Jakość (7 kryteriów)** (stages 74–75: rev 5Y CAGR > 8 %,
   D/E 0–1, FCF > 0, ROE > 15 %, ROA > 10 %, ROE above 5 years ago, ROCE > 15 %), **Konsekwentny wzrost** (rev > 10 % in ≥ 3 of 5 years, D/E < 1, FCF > 0).
5. Valuation: PEG scenarios growth × 0.67 / 1 / 1.26; DCF (`ocena.dcf` = JS `W.dcf`, same numbers, tested in both): revenue TTM grows g for `lata` (5)
   years, then fades linearly to tg over 5 years, FCF = revenue × margin, terminal FCF × (1 + tg) / (r − tg), (PV + cash − debt) / shares. Defaults
   (`dcf_domyslne`): g = min(revenue 3Y CAGR, EPS next 5Y) clipped 0–25 %; margin = median of TTM and last 5 annual FCF margins, 0–60 %; r 10 %, tg 3 %.
   Scenarios bear g × 0.6 / margin × 0.85, bull × 1.2 / × 1.1. Label (`etykieta`) from DCF potential: ≥ +40 % Bardzo tania, +15…+40 Niedowartościowana,
   −15…+15 Wyceniona uczciwie, −40…−15 Droga, below Bardzo droga; fallback PEG thresholds 1 / 2 / 3.
Output: `docs/data/lista.json` (table rows: t, n, s, i, rank, c, mc, o{wzrost, sila, wycena, ogolna}, typ, peg, pe, dcf_pot, et, st{strategy: [passed,
total]}, zw, …) and `docs/data/spolki/<T>.json` (card: m, pct, oceny, typy, strategie, peg, dcf, hist{q: [end, rev, ni, fcf, cash, debt] last 40
quarters, y: [end, rev, ni, fcf] fiscal years}, ceny{d, c}, dcf_param).

## Frontend (`docs/`, plain HTML/CSS/JS, no build)

- `js/wspolne.js` (window.W / module.exports): formatting (Polish decimals), `dcf`, `prognoza`, `implikowane` (bisection: growth or FCF margin that makes
  DCF = price), `scenariusze`, `pegScen`, `etykieta`, `pozycjaWyceny`, `opisPercentyla`, `klasaOceny`, `filtruj`, `sortuj`, `ttmSeria`.
- `js/wykresy.js` (window.WY): SVG bars (`slupki`, hatched = forecast) and line (`linia`) with hover tooltips.
- `index.html` + `js/lista.js`: filters (sector, type, valuation label, strategy min count, watchlist ★ in localStorage `momentum_obserwowane`), header sort
  (`momentum_lista_v1`), row click → `spolka.html?t=`.
- `spolka.html` + `js/spolka.js`: dark top card (summary facts, DCF valuation bar, type of stock), scores + key numbers, price 1Y / 5Y, metrics vs sector
  (3 columns), strategy checklists, valuation tabs PEG (EPS and growth editable, chips) / DCF (growth chips 1Y / 3Y / 5Y / EPS forecast, 5 / 7 / 10 years,
  FCF margin TTM / 5-year median, discount rate, terminal growth, reset; implied growth / margin), financial statements (quarterly / TTM / annual).
- `metoda.html`: formulas and thresholds (keep in sync with `momentum/ocena.py`).

## CI (`.github/workflows/`)

- `dane.yml` („Dane spółek”): Saturday 05:23 UTC + manual; `python spolki.py`, commits `docs/data` (`[skip ci]`, reset onto origin/main, retry loop),
  deploys Pages.
- `deploy-pages.yml`: Pages deploy on push to `main`.
- `tests.yml`: ruff + pytest (`tests/test_ocena.py`), ESLint + `node --test` (`tests/js/wspolne.test.js`).

## Commands

```bash
pip install -r requirements.txt -r requirements-dev.txt
python spolki.py --cache /tmp/sec_cache      # cache = companyfacts extracts, reused for 6 days
python -m pytest -q && ruff check .
npm ci && npm test && npm run lint
cd docs && python3 -m http.server
```

## Research (`research/`)

Pre-registered backtests (protocol in `research/protokol.md` BEFORE each run, results in `research/rejestr.csv` and `research/wyniki/`), data in the
session's `/home/user/ndx` (not in the repo). Key results behind the site: stages 58 (consistent revenue growth predicts 5-year returns), 67–68 (7/7
screen: 15–30-slot portfolio 18–21 %/yr vs SPY 14 % in 2015–2026), 70–72 (low PEG helps stable growers), 74–75 (ROE / ROA / rising ROE / ROCE).
