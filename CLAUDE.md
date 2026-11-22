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
   borrowings + commercial paper, fallback LongTermDebt. Foreign filers: other reporting currencies (ASML EUR in us-gaap) and IFRS (`ifrs-full`, `TAGI_IFRS`, annual only) are read in the reporting currency (`waluta`) and converted with one current yfinance FX rate (`kursy`, `przelicz`: growth stays as in local currency); SEC data whose latest revenue is > 550 days old is ignored (TM / HMC stopped XBRL); the rest (no SEC filings, e.g. SKHY) → Finviz fallbacks
   (sales / EPS 5Y growth, FCF = mcap / P/FCF, cash = mcap / P/C, debt = D/E × mcap / P/B, revenue = mcap / P/S). Cash = max(SEC cash + short-term
   investments, Finviz mcap / P/C when > 1.2× SEC). < 70 % of tickers with SEC revenue = nothing written.
3. yfinance weekly closes, 5 years (adjusted) → price chart and 1W / 1M / 1Y / 5Y returns.
4. `ocena.metryki` (growth 1Y / 3Y / 5Y TTM, quarter y/y, years with revenue > 10 % of last 5, margins / ROE / ROA / ROIC from Finviz, ROCE = operating
   income TTM / (assets − current liabilities), ROE now (SEC) vs 3 years ago (`roe_wcz`; younger: earliest available ≥ 1 year, `roe_wcz_lat`; user: „ROE wyższe niż 3 lata temu lub tyle ile jest”), FCF TTM and margin, net cash, PEG = P/E ÷ (100 × Finviz EPS next 5Y));
   `oceny` = percentile of each metric among **all 500 stocks** (stage 77, user: „zamień odniesienie do wszystkich 500 spółek”; IC 5Y 0.066 vs 0.039 in-sector; `percentyle(grupa=None)`), group score = mean × 10 with a missing metric counted as 0.5 (`BRAK`, neutral; user: missing data inflated scores, e.g. RDDT growth 9.7 from 4 of 7 metrics); `mediany` = medians of all 500 stocks shown under every metric on the card (`med500`; user, later: „odwołanie do innych akcji, nie do sektorów”): Wzrost (growth), Siła (strength), Wycena (value; high =
   cheap), Ogólna = 0.4 / 0.35 / 0.25 (needs growth + one other group); the list = top 500 by market cap among stocks LISTED ≥ 5 YEARS (`notowana_5_lat`: first weekly price ≤ today − 4.9 y; no prices → SEC revenue 5 years back) — `buduj` walks the market-cap ranking (main fetches top + 200 candidates) until 500 qualify (user, Nov 2026: „top 500 po kapitalizacji, które są minimum 5 lat na rynku”; replaced the earlier young-company growth from available years); `rozklady` → `docs/data/sektory.json` (sorted sector values per metric) so the card can recompute scores from values the user types in for missing metrics (`W.percentyl`, `W.ocenyZ`, localStorage `fundamenta_wlasne`, ✎ on the list); stage 76 added `zysk_lata` (years with net income TTM up, of 5; Wzrost) and `akcje_3l` (share count change 3 years, split-adjusted with yfinance splits from `ceny`, less = better; Siła); stage 79 (unbiased search, ~60 features) added `capex_przych` (capex TTM / revenue) and `kapital_3l` (equity CAGR 3 years), both less = better, in Siła; ROIC (own: operating income TTM × 0.79 ÷ (equity + debt − cash), Finviz ROI kept as `roic_fv`) added to Siła (user: „ROIC stabilizuje zysk”; stage 87: steadier profits, not higher returns) with display-only `zysk_dodatni_lata` and `zmiennosc_zysku` — the first two passed the pre-registered rule; stage 76 also found the overall score weak (IC 0.02), Siła strongest, sector-relative growth ~0; `typy` = Lynch categories by own rules with fit 0–100; `strategie` = checklists
   from research: **7/7 (niskie ryzyko)** (the Hello-Stocks-style screen, stage 67–68: rev 5Y > +50 %, rev and earnings 1Y > 5 %, ROE > 15 %, D/E 0–1,
   FCF > 0, PEG 0–2 (user: „daj te 7/7 kryteriów PEG do 2”; research stages 67–68 used 0–1); excluded sectors Financial, Basic Materials, Energy, Utilities, Real Estate), **Jakość (7 kryteriów)** (stages 74–75: rev 5Y CAGR > 8 %,
   D/E 0–1, FCF > 0, ROE > 15 %, ROA > 10 %, ROE above 3 years ago, ROCE > 15 %), **Konsekwentny wzrost** (rev > 10 % in ≥ 3 of 5 years, D/E < 1, FCF > 0). Video-derived (user pasted 4 HelloStocks transcripts, Nov 2026): **Zyskowność (4 kryteria)** (ROE > 15 %, ROA > 10 %, ROE above 3 years ago, ROCE ≥ 30 %) and **Przepływy pieniężne (4 kryteria)** (OCF ≥ 30 % of debt, capex < 35 % of OCF, net buybacks 12 m > 2 % of mcap — SEC tags PaymentsForRepurchaseOfCommonStock / ProceedsFromIssuanceOfCommonStock, cache v4 — FCF > 12 % of assets); `ostrzezenia` (growth-forecast realism: EPS forecast ≥ 15 % with 5Y revenue < 5 %, cyclical with forecast > 25 %, top-30 with > 30 %, one-off profit jump, base rate `baza_wzrostu` < 15 %) → ❗ block on the card, `ow` count in lista; `CENA_TYPU` (good PEG by Lynch type, texts updated with stage 86 results) in the PEG panel; `rampa_capex` warning (capex ≥ 2× in 2 years, ≥ 5 % of revenue, OCF 2 years ago < 3× capex → median ~0 % in 5 years, stage 86). Stage 86 tested every testable claim from the 4 videos (research/wyniki/r111_etap86.md); stage 87 the next 4 (acceleration `przysp` — slope of 5 yearly revenue growths — in the Wzrost score as „Tempo przychodów” (user: „przyspieszenie wzrostu przychodów też jest istotne”), warning „kurs −40 % od szczytu, a P/E w górnej 1/3” via `od_maks_12m` / `pe_gorna_tercyla` from weekly prices in `buduj`). **Duży zwycięzca (10+ lat)** (user's category: mcap ≥ 100 bn, revenue up in ≥ 8 of 10 fiscal years (`przych_lata_wzrostu_10`) and ≥ 2× in 10 years (`przych_10l`), ROE > 15 %, FCF > 0, D/E < 1; PEG 1–2 = fair price via `CENA_TYPU`, takes precedence in the PEG panel; badge 🏛 + list filter) and 💰 `dywidenda_stabilna` (dividends paid in each of last 5 FY, no cut > 20 %; SEC PaymentsOfDividends[CommonStock] / IFRS DividendsPaid…, cache v5; `dw` in lista, filter). Badge „✔ Jakość 7/7” (`W.jakosc77`) on the list, card header and a list filter checkbox (user: „daj znacznik jakości … te co spełniają 7/7”; stage 83: best buy screen).
5. Valuation: PEG scenarios growth × 0.67 / 1 / 1.26; DCF (`ocena.dcf` = JS `W.dcf`, same numbers, tested in both): revenue TTM grows g for `lata` (5)
   years, then fades linearly to tg over 5 years, FCF = revenue × margin, terminal FCF × (1 + tg) / (r − tg), (PV + cash − debt) / shares. Defaults
   (`dcf_domyslne`): g = min(revenue 3Y CAGR, EPS next 5Y) clipped 0–25 %; margin = median of TTM and last 5 annual FCF margins, 0–60 %; r 10 %, tg 3 %.
   Scenarios bear g × 0.6 / margin × 0.85, bull × 1.2 / × 1.1. Input checks (`dcf_wejscie`, Nov 2026 audit — the math matched an independent implementation, 37 / 482 inputs were off): revenue from Finviz (mcap / P/S) when SEC TTM differs > 25 %, FCF margin from Finviz (mcap / P/FCF) when SEC FCF differs > 2×, shares = mcap / price, value ≤ 0 → no DCF (e.g. GM captive finance); `dcf_rev`, `dcf_g`, `dcf_marza`, `dcf_uwagi` (Finviz corrections), `dcf_brak` (why DCF is skipped) on the card (JS uses them). Conservative since Nov 2026 (user: „popraw DCF, żeby nie zawyżał wyceny”): FCF margins minus SBC (`sbc_ttm`, `sbc_przych`, hist.y[4] = annual SBC; tags ShareBasedCompensation / IFRS AdjustmentsForSharebasedPayments) and debt + operating lease liability (`leasing`, `dcf_dlug`); cache format v3. Remaining simplification: cash without long-term investments (left on purpose — user: „wolę mieć lekko zaniżoną niż zawyżoną” wycenę; keep DCF changes conservative). Label (`etykieta`) PEG FIRST (user: „na pierwszym planie PEG, dopiero przełączenie na DCF”): PEG < 0.5 Bardzo tania, < 1 Niedowartościowana, < 2 Wyceniona uczciwie,
   < 3 Droga, ≥ 3 Bardzo droga; fallback DCF potential ≥ +40 % / +15 / −15 / −40 %. Card: ONE valuation panel (`#wycena`, right under the top card; user: „PEG i DCF panel powinien być jeden”) with PEG (default, price at PEG 1 / 2) / DCF tabs; top card only shows the label + link.
   Soft analysis (user, Nov 2026, HelloStocks AMZN example: „samo EPS nic nie mówi … czy spółka nie zarabia z czegoś co jest istotne”), facts only, no
   AI text: **normalized earnings** `ni_norm` = (operating income TTM − interest expense) × (1 − effective tax 10–30 %, fallback 21 %) (SEC tags `nonop`,
   `odsetki`, `przed_pod`, `podatek`, cache v6), `eps_norm` = EPS × ni_norm / ni_ttm, `pe_norm`, `peg_norm`; when EPS differs > 15 % `m.peg` = peg_norm
   (`peg_gaap` kept, `peg_norm_uzyte`) so label / 7/7 / score don't show false cheapness; normalized ≤ 0 with GAAP > 0 → no PEG; > 25 % → ❗.
   **8-K events** (`momentum/zdarzenia.py`, `spolki.sec_zdarzenia`: data.sec.gov/submissions, cache `<T>.zd.json` 2 days): last 12 months, Polish item
   descriptions, level 2 (1.03, 1.05, 2.04, 4.01, 4.02, NT 10-K/Q → ❗ warning, `zd` count in lista) / 1 (3.01 — often a voluntary exchange move, 5.02, 2.06, 2.05, 1.02, 5.01, 3.03, 10-K/A)
   / 0; routine 2.02 / 7.01 / 9.01 / 5.07 skipped; card section `#zysk-zd` „Jakość zysku i zdarzenia”, PEG panel EPS chips GAAP / normalized.
   **Peter Lynch** (user: „sprawdź jego metodę … fazy, reguły sprzedaży, jak rozpoznać typy”): `ocena.faza` (fast growers: Szybka ekspansja / Dojrzewanie),
   `ocena.lynch(m, typ, zd)` → card `lynch` {faza, lista [(check, value, True/False/None)], wskaznik = (EPS growth % + yield %) ÷ P/E} with per-type sell
   checks from „One Up on Wall Street” ch. 17 (quarterly revenue y/y slowing 3 quarters `rev_q_yoy3`, PEG < 2, inventories vs sales `zapasy_1y` /
   `zapasy_przych` — SEC InventoryNet / IFRS Inventories, cache v7 —, P/E vs own 5-year median `pe_mediana` → `pe_med5` (computed in `buduj` from weekly
   prices × current shares ÷ TTM NI), dividend cut / payout, capex ramp, debt rising 5 quarters `dlug_rosnie_kw`, share dilution); static Lynch texts in
   spolka.js `LYNCH`, card section `#lynch`. Thresholds Lynch did not give (1.3× P/E, 10 pp, 60 %) are ours. Added first WITHOUT a backtest (user
   rightly objected: „czemu dodałeś to bez backtestu?” — always test before putting a rule on the site); stage 92 (r117) then tested 12 signals: only ⬇ for
   slow growers confirmed (−10.9 pp / 36 m), so `TEST_LYNCH` marks each check potwierdzony / niepotwierdzony / nietestowany and the card shows ⚠ only for
   confirmed ones, grey ○ otherwise.
   `spadek_2l` = revenue or net income TTM y/y < 0 now and a year ago (user's sell rule; stage 77: −4 pp over 5 years) → ⬇ on list and warning on card.
Output: `docs/data/lista.json` (table rows: t, n, s, i, rank, c, mc, o{wzrost, sila, wycena, ogolna}, typ, peg, pe, dcf_pot, et, st{strategy: [passed,
total]}, zw, …) and `docs/data/spolki/<T>.json` (card: m, pct, oceny, typy, strategie, peg, dcf, hist{q: [end, rev, ni, fcf, cash, debt] last 40
quarters, y: [end, rev, ni, fcf] fiscal years}, ceny{d, c}, dcf_param).

## Frontend (`docs/`, plain HTML/CSS/JS, no build)

- `portfel.html` + `js/portfel.js` (user, Nov 2026: „metoda budowania pozycji w portfelu … average costing, bez time the market”, then „dokupować, kiedy PEG
  0–2, im niższy tym większa waga, nie więcej niż 10 % portfela” and „włóż w to score i market cap”): positions (ticker, shares, average cost) and monthly amount
  in localStorage `fundamenta_portfel` — stocks are added with the „＋ Dodaj do portfela” button on the card (`przyciskPortfela` in spolka.js; user: „zamiast wpisywać daj
  przycisk dodaj do portfela w widoku spółki”), shares / average cost edited in the portfel table; `W.dokup` = the USER'S position-building rule (user: „na spółkę max 10 % … pierwszy raz 20 % z tych 10 %,
  potem za każdym razem, kiedy robi się tania, raz w miesiącu kolejne 10 % z tych 10 % … najlepiej ruch kursu o 7 % na plus lub minus”): target = 10 % of the
  account value IN PLN (IKE; user: „waluta na IKE jest w PLN, więc tam też sizing”; `konto` input: shares + cash; fallback = value of shares; amounts in PLN,
  shares = PLN ÷ (USD price × USD/PLN), rate `usdpln` in lista.json from yfinance PLNUSD=X weekly, editable `kurs` input; prices / average cost stay in USD), first purchase 20 % of target, every next one 10 % of target, at most once per calendar
  month (`ost` = {c, d} saved by „Kupiłem”), only when PEG 0–2 and the price moved ≥ ±7 % since the last purchase (reference: `ost.c`, else average cost);
  otherwise wait; none for ⬇ `sp`; optional monthly budget — priority by `W.punkty` (10 × mean of tanio (2 − PEG) ÷ 2, overall ÷ 10, size 1 − (rank − 1) ÷ 500).
  The USER picks the stocks (user: „tylko ja wybieram spółki, nie automat”), no automatic additions or filters. Do not tune to backtests; do NOT suggest ETFs,
  more stocks or changing the rules (user: „rób to co mówię … ja decyduję co, gdzie i jak … muszę zarządzać emocjami”; retirement account, prefers
  stability over max return). Stage 89 (r114): DCA 20.1 %; waiting for cheap prices not better.

- `js/wspolne.js` (window.W / module.exports): formatting (Polish decimals), `dcf`, `prognoza`, `implikowane` (bisection: growth or FCF margin that makes
  DCF = price), `scenariusze`, `pegScen`, `etykieta`, `pozycjaWyceny`, `opisPercentyla`, `klasaOceny`, `filtruj`, `sortuj`, `ttmSeria`.
- `js/wykresy.js` (window.WY): SVG bars (`slupki`, hatched = forecast) and line (`linia`) with hover tooltips.
- `index.html` + `js/lista.js`: filters (sector, type, valuation label, strategy min count, watchlist ★ in localStorage `momentum_obserwowane`), header sort
  (`momentum_lista_v1`), row click → `spolka.html?t=`.
- `spolka.html` + `js/spolka.js`: dark top card (summary facts, DCF valuation bar, type of stock), scores + key numbers, price 1Y / 5Y, metrics vs sector
  (3 columns), strategy checklists, valuation tabs PEG (EPS and growth editable, chips) / DCF (growth chips 1Y / 3Y / 5Y / EPS forecast, 5 / 7 / 10 years,
  FCF margin TTM / 5-year median, discount rate, terminal growth, reset; implied growth / margin), financial statements (quarterly / TTM / annual).
- `metoda.html`: formulas and thresholds (keep in sync with `momentum/ocena.py`).
- Dark theme (user, Nov 2026): colors are CSS variables in `css/styl.css`; `:root[data-motyw="ciemny"]` and `prefers-color-scheme: dark` (unless
  `data-motyw="jasny"`) override them; toggle button ☀/🌙 injected into the header by `wspolne.js` (localStorage `fundamenta_motyw`; an inline script in
  every page head applies it before paint). New colors: use variables (`--tlo2`, `--pole`, `--siatka`, `--czerwony-t` …), not hard-coded light hex.

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
screen: 15–30-slot portfolio 18–21 %/yr vs SPY 14 % in 2015–2026), 70–72 (low PEG helps stable growers), 74–75 (ROE / ROA / rising ROE / ROCE), 89 (position building: DCA + × 2 after a ≥ 15 % drop; PEG tilt
and waiting for cheap prices not better; lump sum beat 12 tranches 5/7), 90 (std-dev channel from a video: 89 % of trades profitable but only
+0.7 pp vs SPY over 12 months — buys in market-wide crashes; portfolio 5.4 %/yr vs SPY 14.5 %, mostly in cash), 91 (same on monthly closes, 12 variants: none beats SPY in both halves with idle
cash; best 120 months log −2σ 12.2 %/yr, DD −18 % vs SPY −34 %), 92 (Lynch sell signals: 1 of 12 confirmed — ⬇ for slow growers), 93 (other Lynch
rules: confirmed high net margin for stalwarts (+28 pp / 36 m, `nm_gorna_tercyla_stab` in `buduj`) and dividend raised 5 years for slow growers (+11 pp,
`dyw_rosnie_5`) — both on the card; buybacks contradicted (diluters +12 pp); the rest noise), 94 (stalwart after 2× — not worse, rule not
confirmed). Portfel shows a „Skład wg typów Petera Lyncha” table (`typyPf`): NUMBER of stocks by type vs the USER'S target count (`S.celLiczba`, editable, default
6 stabilnie / 2 szybko / 1 wolno rosnąca of 10 slots = 1 ÷ `W.DOKUP.limit` — user: „więcej stabilnych …”, then „mówiłem o ilości spółek w portfelu i
procentowym udziale jednej spółki”), each stock's share of the account, Lynch's 20/40/40 and stage
86 medians for reference; informational, dokup rules unchanged.
