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
   same fiscal year (Q4 = FY − 9M; quarterly cash flow from YTD; missing Q1 = 6M − Q2, e.g. ALNY 2026); first filing wins (no restatements). Debt (`dlug`): non-current + current + short-term
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
   D/E 0–1, FCF > 0, ROE > 15 %, ROA > 10 %, ROE above 3 years ago, ROCE > 15 %), **Konsekwentny wzrost** (rev > 10 % in ≥ 3 of 5 years, D/E < 1, FCF > 0). Video-derived (user pasted 4 HelloStocks transcripts, Nov 2026): **Zyskowność (4 kryteria)** (ROE > 15 %, ROA > 10 %, ROE above 3 years ago, ROCE ≥ 30 %) and **Przepływy pieniężne (4 kryteria)** (OCF ≥ 30 % of debt, capex < 35 % of OCF, net buybacks 12 m > 2 % of mcap — SEC tags PaymentsForRepurchaseOfCommonStock / ProceedsFromIssuanceOfCommonStock, cache v4 — FCF > 12 % of assets); `ostrzezenia` (growth-forecast realism: EPS forecast ≥ 15 % with 5Y revenue < 5 %, cyclical with forecast > 25 %, top-30 with > 30 %, one-off profit jump, base rate `baza_wzrostu` < 15 %) → ❗ block on the card, `ow` count in lista; `CENA_TYPU` (good PEG by Lynch type, texts updated with stage 86 results) in the PEG panel; `rampa_capex` warning (capex ≥ 2× in 2 years, ≥ 5 % of revenue, OCF 2 years ago < 3× capex → median ~0 % in 5 years, stage 86). Stage 86 tested every testable claim from the 4 videos (research/wyniki/r111_etap86.md); stage 87 the next 4 (acceleration `przysp` — slope of 5 yearly revenue growths — in the Wzrost score as „Tempo przychodów” (user: „przyspieszenie wzrostu przychodów też jest istotne”), warning „kurs −40 % od szczytu, a P/E w górnej 1/3” via `od_maks_12m` / `pe_gorna_tercyla` from weekly prices in `buduj`). **Duży zwycięzca (10+ lat)** (user's category: mcap ≥ 100 bn, revenue up in ≥ 8 of 10 fiscal years (`przych_lata_wzrostu_10`) and ≥ 2× in 10 years (`przych_10l`), ROE > 15 %, FCF > 0, D/E < 1; PEG 1–2 = fair price via `CENA_TYPU`, takes precedence in the PEG panel; badge 🏛 + list filter) and 💰 `dywidenda_stabilna` (dividends paid in each of last 5 FY, no cut > 20 %; SEC PaymentsOfDividends[CommonStock] / IFRS DividendsPaid…, cache v5; `dw` in lista, filter). **Buffett (8 reguł)** (user, Nov 2026: „dodaj do aplikacji to co działa z książki Buffetta”, then „Buffett … jego zdanie jest ważniejsze niż jakieś backtesty” → ALL 8 book rules incl. interest < 15 % of operating income `bf_ods` and EPS up ≥ 9 of 10 years `bf_eps_lata` / `bf_eps_n` (shorter history: at most one down year); `ocena.buffett` from fiscal years → `bf_gm` / `bf_nm` (lower of 2 FY), `bf_eps_zysk` (net income ÷ split-adjusted shares hist.y[8], up to 11 FY), `bf_de` = Liabilities ÷ (equity + |treasury|) at FY end, `bf_dlug_lat` = long-term debt ÷ FY net income (no debt tags and Finviz D/E 0 → 0), `bf_capex_ni` (3 FY sums), `bf_sga_gp` (SG&A or selling + G&A ÷ gross profit; gross profit = revenue − cost of revenue when no GrossProfit tag); loss / negative equity = `BRAK_BF` 99 → „strata” / „ujemny kapitał”; SEC tags sga / sm / ga / koszt / zob / pasywa / skarb / dlug_dl (incl. SeniorNotes), cache v8; GOOGL pre-2022 per-class shares → no EPS rule) and badge 🏰 „Przewaga Buffetta” (`ocena.buffett3` = net margin > 20 % + debt ≤ 4× NI + SG&A < 30 %, `bf` in lista, `W.buffettM`, list filter `#buf`, card header). Badge „✔ Jakość 7/7” (`W.jakosc77`) on the list, card header and a list filter checkbox (user: „daj znacznik jakości … te co spełniają 7/7”; stage 83: best buy screen).
5. Valuation: PEG scenarios growth × 0.67 / 1 / 1.26; DCF (`ocena.dcf` = JS `W.dcf`, same numbers, tested in both): revenue TTM grows g for `lata` (5)
   years, then fades linearly to tg over 5 years, FCF = revenue × margin, terminal FCF × (1 + tg) / (r − tg), (PV + cash − debt) / shares. Defaults
   (`dcf_domyslne`): g = min(revenue 3Y CAGR, EPS next 5Y) clipped 0–25 %; margin = median of TTM and last 5 annual FCF margins, 0–60 %; r 10 %, tg 3 %.
   Scenarios bear g × 0.6 / margin × 0.85, bull × 1.2 / × 1.1. Input checks (`dcf_wejscie`, Nov 2026 audit — the math matched an independent implementation, 37 / 482 inputs were off): revenue from Finviz (mcap / P/S) when SEC TTM differs > 25 %, FCF margin from Finviz (mcap / P/FCF) when SEC FCF differs > 2×, shares = mcap / price, value ≤ 0 → no DCF (e.g. GM captive finance); `dcf_rev`, `dcf_g`, `dcf_marza`, `dcf_uwagi` (Finviz corrections), `dcf_brak` (why DCF is skipped) on the card (JS uses them). Conservative since Nov 2026 (user: „popraw DCF, żeby nie zawyżał wyceny”): FCF margins minus SBC (`sbc_ttm`, `sbc_przych`, hist.y[4] = annual SBC; tags ShareBasedCompensation / IFRS AdjustmentsForSharebasedPayments) and debt + operating lease liability (`leasing`, `dcf_dlug`); cache format v3. FCFF since Nov 2026 (user agreed to fix the textbook inconsistency): OCF is after interest paid while debt is subtracted at the end, so margins add after-tax interest `odsetki_przych` = interest TTM × (1 − tax 10–30 %, default 21 %) ÷ revenue (`ocena.odsetki_przych`; JS `margines5` and the 12 m chip use it too; also added to the Finviz P/FCF fallback margin). Fixed 10 % discount rate kept on purpose (no per-company WACC — beta too unstable). Remaining simplification: cash without long-term investments (left on purpose — user: „wolę mieć lekko zaniżoną niż zawyżoną” wycenę; keep DCF changes conservative). „PEG Lyncha” (user: „dodaj limit 25 %”): `W.peg25(pe, g)` = P/E ÷ (100 × min(g, 25 %)) shown on the card (PEG panel and step 5) when growth > 25 % — INFO ONLY, stage 108 found the cap does not improve selection, so labels / 7/7 / dokup keep the plain PEG. Label (`etykieta`) PEG FIRST (user: „na pierwszym planie PEG, dopiero przełączenie na DCF”): PEG < 0.5 Bardzo tania, < 1 Niedowartościowana, < 2 Wyceniona uczciwie,
   < 3 Droga, ≥ 3 Bardzo droga; fallback DCF potential ≥ +40 % / +15 / −15 / −40 %. Card: ONE valuation panel (`#wycena`, now at the end of step 6 of `#krok`; user: „PEG i DCF panel powinien być jeden”) with PEG (default, price at PEG 1 / 2) / DCF tabs; top card only shows the label + link.
   Soft analysis (user, Nov 2026, HelloStocks AMZN example: „samo EPS nic nie mówi … czy spółka nie zarabia z czegoś co jest istotne”), facts only, no
   AI text: **normalized earnings** `ni_norm` = (operating income TTM − interest expense) × (1 − effective tax ≤ 30 %; < 10 % (one-off tax benefit, e.g. ALNY Q3 2026 −1.9 bn) or missing → 21 %) (SEC tags `nonop`,
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
   slow growers confirmed (−10.9 pp / 36 m), (`TEST_LYNCH` status still in the data) — but since Nov 2026 the card shows EVERY Lynch sell signal as ⚠ without test labels (user: „Lynch zarobił miliony … jeżeli on mówi, że działa, to działa”; same for Buffett: book authors' rules count as they wrote them, backtests stay in research only).
   `spadek_2l` = revenue or net income TTM y/y < 0 now and a year ago (user's sell rule; stage 77: −4 pp over 5 years) → ⬇ on list and warning on card.
Output: `docs/data/lista.json` (table rows: t, n, s, i, rank, c, mc, o{wzrost, sila, wycena, ogolna}, typ, peg, pe, dcf_pot, et, st{strategy: [passed,
total]}, zw, …) and `docs/data/spolki/<T>.json` (card: m, pct, oceny, typy, strategie, peg, dcf, hist{q: [end, rev, ni, fcf, cash, debt] last 40
quarters, y: [end, rev, ni, fcf] fiscal years}, ceny{d, c}, dcf_param).

## GPW (`gpw.py`, `docs/gpw.html`, `js/gpw.js`)

User, Nov 2026: „to samo dla GPW … trzeba zmniejszyć procenty wzrostowe, bo to wolniejszy rynek”; chosen universe WIG20 + mWIG40 + sWIG80 (composition from
biznesradar.pl index pages, fallback `docs/data/gpw_sklad.json`), same excluded sectors as USA (yfinance sector names), data from yfinance `.WA` (info, ~4–5
annual statements, quarterly TTM, weekly prices; cache dir 6 days) → `docs/data/gpw.json` (rows: t, n, s, i, ind, m, st, et, oceny, pct, ceny). Lowered growth
thresholds `GPW_PROGI` (Jakość: revenue 3y CAGR > 5 %; 7/7: revenue 3y > +16 %, revenue / earnings 1y > 3 %; consistent growth > 6 % in ≥ 2 of 3 years), others
as USA; PEG from past 3-year earnings CAGR (no analyst forecasts) → labels; scores = percentiles among GPW stocks, same weights. NOT backtested (no history) —
stated on the page. Page: list with filters (sector, index, Jakość 7/7, Siła ≥ 7, without ⬇); click → full company card `spolka.html?t=X&r=gpw`
(user: „dlaczego dla GPW nie zrobiłeś takiego panelu jak dla akcji USA”; ▸ = quick inline preview); `gpw.karty` writes `docs/data/gpw/spolki/<T>.json` in the USA
card format (m with USA field names, pct, oceny, `grupy` = GPW score components for `W.skladOceny`, typy via `ocena.typy(duza=5e9 zł, g_off=0.03)` with GPW texts,
PEG scenarios from 3-year earnings growth, DCF via `ocena.dcf_scenariusze`, Lynch checklist, annual / quarterly hist, weekly prices). spolka.js `GPW` mode:
prices in zł (`W.WALUTA`), texts „spółek GPW”, USA-only rows without data hidden, no 8-K / normalized-earnings section, no portfolio button, search stays on GPW.
Data sources since Nov 2026 (user: „brakuje dużo danych odnośnie dywidendy … ranking jest przekłamany”): annual statements from biznesradar.pl
(`pobierz_br` → `br_tabela`: income statement, cash flow, balance sheet pages, values in thousand zł × 1000, columns 2007… plus „O4K” = last 4 quarters as
`ttm:<end>`; company URL slug captured by `sklad` from the index pages into `gpw_sklad.json` `slug`; cache `<T>.br.json` 6 days, 1 s between requests) merged by
`scal_br` (replaces yfinance's 4–5 years: rev, net income to shareholders, EBIT, OCF, capex, FCF, equity, assets, current liabilities, cash, debt = borrowings +
bonds, leasing separate; adds dividends paid `dyw_r`, buybacks `skup_r`, share issues `emisja_r`, 12 m values). yfinance (cache v2) keeps price, market cap,
dividends per share (`dps`, yield fallback), share count (`akcje` → `akcje_3l`) and quarters. New GPW metrics as in USA: `rev_cagr5`, `dywidenda_lata`,
`dywidenda_stabilna` (💰 badge + list filter `#dyw`), `dyw_rosnie_5`, `skup_netto_mc` (no buyback row in biznesradar cash flow = 0), P/E fallback mcap ÷ net
income 12 m; `hist.y` 12 years in the USA column layout (op, buybacks, dividends, shares) + `hist.ltm`, so the phase step works for GPW. Scoring: loss → P/E and PEG
percentile 0, falling 3-year profit → PEG 0, FCF ≤ 0 → P/FCF 0 (real missing data stays neutral 0.5). CI `dane.yml` runs `python gpw.py` (continue-on-error). USA list also got a „Siła finansowa ≥ 7” filter (stage 95: the only factor with a confirmed edge).

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
- Card section `#krok` „Ocena krok po kroku” (user: screenshots of another site's stock walkthrough, „mini ocena … krok po kroku” from 7/7): steps Faza / Wzrost /
  Rentowność / Bezpieczeństwo / Wycena (5-zone PEG bar, prices at PEG 0.5 / 1 / 2 / 3) / Podsumowanie (7/7 criteria by index from `strategie` key starting „7/7”, so GPW
  thresholds work). Step 1 „Faza” = company development phases as in the user's screenshot (user: „sprzedaż jest, ale nie ma profitu, potem duża sprzedaż i profity,
  potem payout — dywidendy lub inne”): `W.fazyLat({rev, zysk, wyplaty, ltm})` = LONG-TERM phases (user: „myślałem, że to długoterminowe fazy rozwoju
  spółki, a nie sentyment w rok” — MU jumped 4/1/4/3): each FY + „12 m” judged on a 3-year window (sum of operating profit, sum of dividends + buybacks),
  computed over the WHOLE history (up to 12 FY) and only then sliced for display; SIX stages of A. Damodaran's corporate life cycle since Nov 2026 (user showed his chart from „Wycena firmy. Storytelling i liczby”, s. 300, and asked to match it; `W.FAZY` = Start-up / Wczesny wzrost / Szybki wzrost / Dojrzały wzrost / Dojrzała stabilizacja / Faza schyłkowa, `SCHYLEK` = 6, texts `CYKL` = his stage descriptions + our numeric conditions): stages 1–5 only move forward (running max) EXCEPT Damodaran's rejuvenation (user: „tak, zgodnie z Damodaranem”): stage 4 or 5 with revenue 3 y ≥ 20 %/yr two years in a row goes back to 3 (`szybkoPoprz`; e.g. NVDA): 3-year profit ≤ 0 → 1 Start-up
  (2 if loss shrinking or revenue ≥ 25 %/yr), profit and revenue 3 y ≥ 20 %/yr → 3, 6–20 % → 4, revenue 5 y (and 3 y) < 6 %/yr two years in a row → 5 (cyclical dips alone don't); 6 Schyłek only for a PERSISTENT decline (two
  years in a row: revenue below 5 years earlier AND 3-year average below the previous 3 years). Leaving Schyłek (user: „przychody i profit powinny przebijać
  szczyt”; literature: Dickinson 2011 — stage follows current cash-flow pattern, firms can move non-sequentially after restructuring; Damodaran 2024 — a revived
  firm behaves like a younger one) only when revenue AND the typical 3-year profit (median of the window; peaks only from full 3-year windows, so a one-off gain
  like MDLZ 2015 does not inflate the peak) beat their pre-decline peaks; the phase is then re-derived from current data and moves forward again. Structural
  break (revenue −30 % in one year with margin ≥ 80 % of the prior one — spin-off or accounting change, e.g. PM 2023, GE 2024) is not decline: history restarts
  there. `seriaFazy` drops duplicate fiscal years (< 300 days apart, keeps the later) and uses operating profit only if present in ≥ 80 % of years and in the last
  point, else net income for the whole series (ETN). Current phase = last point. Charts are DATA ONLY
  (user: „bazuj na danych, nie rysujesz sobie linie … każda linia coś znaczy”, „czemu słupkowy?”; no schematic curves, no test texts — „nie interesują mnie twoje
  testy”): 3 questions with revenue / operating profit (fallback net income) lines, buybacks / share count (min–max scale) / dividends paid, then ONE lifecycle chart
  (`wykresFaz`): revenue, profit, dividends + buybacks per year with background bands = phase of that year (`KOL_FAZ`), 5-step stepper; drawn full width (`SZER`, CSS width 100 %, taller on phones;
  redrawn on resize; phone shows 5 years). P/E history: time-based x axis, year ticks at 1 January, line broken where P/E is missing (loss). Missing 12 m payouts are never drawn (the 3-year window uses what exists). Data: `hist.y` [5] operating
  income, [6] buybacks, [7] dividends paid, [8] shares at FY end (split-adjusted; integer jumps = splits older than the 5-year price history) and `hist.ltm`
  [end, rev, op, buybacks, dividends, shares]. Phase texts `CYKL`.
  Other steps borrow data-computable parts of the user's screenshots (user: „wsiąść części z tych zdjęć”): Wzrost — revenue / net income lines with y/y % at each point
  (`liniaRr`); Rentowność — „Przewaga w liczbach”: gross / operating / net margin and ROIC vs median of 500 (`naTle`); Wycena — trailing vs forward multiples
  (P/S, P/E, P/FCF; forward only P/E from Finviz) and P/E history 5 years (`peHistoria`: weekly price ÷ (TTM net income known 45 days after quarter end ÷ current
  shares), log scale, bands = own terciles tanio / normalnie / drogo, prices at those P/E with today's EPS) plus the PEG bar; Podsumowanie — „verdict” layout:
  SPÓŁKA (phase, scores as 5 dots, 7/7) and WYCENA (PEG label, P/E vs own 5 years with price range). Moat / management / segments / geography are opinions or data
  we do not have — not built.
  Card LAYOUT (user: „krok po kroku daj jako główne, na dole szczegóły i resztę scoringu; panel PEG i DCF na koniec krok po kroku w podsumowaniu”): top card →
  `#krok` (main) → heading „Szczegóły” (`#szczegoly`) → liczby + price chart, metryki (scores), strategie, zysk-zd, lynch, sprawozdania. The PEG / DCF panel
  (`#wycena`, `wycena()`) is rendered INSIDE step 6 „Podsumowanie” (`krok` calls `wycena()` when the last step is shown); every `a[href="#wycena"]` opens step 6
  and scrolls to the panel (delegated click handler).
  Details are COLLAPSED behind a „Więcej: pełny scoring i szczegóły” button under `#krok` (user: „poniżej krok po kroku przycisk więcej … rozwijamy cały
  scoring dodatkowy”; `#szczegoly-tresc` hidden, `szczegoly(otworz)` draws charts on first open because they size from the element width, state in localStorage
  `fundamenta_szczegoly`, `a[href="#szczegoly"]` opens it). Clicking any step / Dalej / Wstecz scrolls to the top of `#krok` (`przewinDo`, minus the sticky header;
  user: „jeżeli klikam następny, daj stronę na początek tego kroku”).
- `metoda.html`: formulas and thresholds (keep in sync with `momentum/ocena.py`).
- Dark theme (user, Nov 2026): colors are CSS variables in `css/styl.css`; `:root[data-motyw="ciemny"]` and `prefers-color-scheme: dark` (unless
  `data-motyw="jasny"`) override them; toggle button ☀/🌙 injected into the header by `wspolne.js` (localStorage `fundamenta_motyw`; an inline script in
  every page head applies it before paint). New colors: use variables (`--tlo2`, `--pole`, `--siatka`, `--czerwony-t` …), not hard-coded light hex.

## CI (`.github/workflows/`)

- `dane.yml` („Dane spółek”): Saturday 05:23 UTC + manual; `python spolki.py`, commits `docs/data` (`[skip ci]`, reset onto origin/main, retry loop),
  deploys Pages.
- `deploy-pages.yml`: Pages deploy on push to `main`.
- `tests.yml`: ruff + pytest (`tests/test_ocena.py`), ESLint + `node --test` (`tests/js/wspolne.test.js`).

## Workflow

- After every pushed change ALWAYS open a new PR to `main` without asking (user, Nov 2026: „zawsze otwieraj nowy PR”); if the branch's PR is still open,
  it is updated by the push instead.

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
cash; best 120 months log −2σ 12.2 %/yr, DD −18 % vs SPY −34 %), 95 („Prosty wybór” 6-point counter: 5–6 pts 63 % beat the median in 3 years but
only in 2018–23, CI includes 0 → not on the site; Siła ≥ 7 alone +16 pp [+2.5; +26.8] → list filter), 96 (dividend paid 5 years: +5.8 pp / 36 m [+0.9; +13.1]; within
Jakość 7/7 or Siła ≥ 7 halves the loss rate (13 vs 27 %, 7 vs 20 %) and the worst decile — stability, matches the 💰 badge; PEGY ≈ PEG, both from past
growth do not pick winners), 97 (P/FCF among D/E < 1: thresholds 10–30 no effect, middle quintiles fewest losses, FCF ≤ 0 worst;
among D/E < 1 and Siła ≥ 7 cheap P/FCF is WORSE: ≤ 15 −34 pp [−48; −16], both halves — not yet used on the site), 98 (negative equity / no ROE, e.g. DELL: +10.7 pp / 36 m vs positive equity, losses 15 vs 23 %;
buybacks inside the group = noise → not a ROE substitute), 92 (Lynch sell signals: 1 of 12 confirmed — ⬇ for slow growers), 93 (other Lynch
rules: confirmed high net margin for stalwarts (+28 pp / 36 m, `nm_gorna_tercyla_stab` in `buduj`) and dividend raised 5 years for slow growers (+11 pp,
`dyw_rosnie_5`) — both on the card; buybacks contradicted (diluters +12 pp); the rest noise), 94 (stalwart after 2× — not worse, rule not
confirmed), 99 (suggested 6 / 2 / 1 portfolio by Lynch type from confirmed features: 12 m +6 pp but worse in 2012–17 (few stocks) → pre-registered rule failed, NOT on the site; 36 m +32 pp, fewer losers; stage 100 with 6 / 2 / 2: same picture, +5.5 pp / 12 m, not on the site), 101 (lifecycle phase 1–5: no phase differs, 3–4 vs rest −1.5 pp [−6.5; +3.0]; decline not worse; start more losers → description only), 102 (Weinstein price stages: stage 4 −4.3 pp / 12 m [−12.7; +2.3], −8.2 / 36 m [−15.1; −0.6]; rule failed; user did not want technical analysis → not on the site), 103 (Lynch life cycle: Dojrzewanie −11.0 pp / 36 m [−19.1; −0.8], both halves → ⚠ on the card; fast expansion not better), 104 (user's strategy „buy when entering a phase, sell at Schyłek” with the site's long-term phases: no phase gives an edge; holding stocks in 3 Dźwignia operacyjna −3.2 pp/yr [−4.3; −1.4] vs median, both halves; exits via decline rare → phases stay description only), 105 (same but entering only at a good price — user: „w momencie, kiedy PEG lub DCF mówi, że to dobry moment”: historical PEG 0–1 / 0–2 or DCF ≥ +15 %; no phase + price combination beats the market; Dźwignia + PEG 0–2 −4.1 pp/yr [−9.0; −1.3]; Start / Hiperwzrost almost never cheap; historical PEG uses past 5-year earnings growth, not forecasts), 106 (top 10 / 25 / 50 by market cap: top 25 cap-weighted 18.0 % vs SPY 15.0 % in 2012–26 but only thanks to 2019–26, ≈ SPY in 2010–18, deeper drawdowns), 107 (user: „kupuj top po fundamentach, wszystko spełnione, max 10, rewizja raz do roku”: Jakość 7/7 + 7/7 + no ⬇, top 10 by Siła — B 13.1 % vs SPY 14.7 %; 2012–18 lost (0–4 stocks: 5-year data from ~2015), 2019–26 20.9 % vs 17.2 %; rule failed), 108 (PEG with growth capped at 25 % per Lynch: „cheap only thanks to > 25 % growth” not worse, −0.3 pp / 36 m [−18.4; +32.6] → cap shown as info only), 109 (user: „faworyzuj spółki rosnące stabilnie przeszłe 5 lat revenue i EPS”: revenue up 5/5 and EPS ≥ 4/5 vs rest +3.9 pp / 36 m [−4.4; +11.2], both halves positive but CI includes 0; as priority in the top-10 portfolio no change (12.9–13.2 % vs 13.1 %) → rule failed; user only wanted the check, nothing added to the site), 110 (user: „revenue 5 lat z rzędu najważniejsze, EPS pójdzie za nią … liczy się 5–10 lat”: revenue up 5/5 vs rest +11.0 pp / 5 years [−6.5; +26.8], both halves positive, 3 years +3.5 — edge grows with horizon but CI includes 0; 10 years too few stocks; net income higher 5 years later in 79 % vs 69 % → rule failed; check only, nothing on the site), 111 (8 Buffett rules from Mary Buffett's book, user pasted a video; check only: 9 of 12 confirmed over 5 years — SG&A < 30 % of gross profit +59 pp (124 vs 61 %), capex < 25 % of net income +32, net margin > 20 % +29, gross margin > 40 % +27, debt ≤ 4× net income +17, EPS up 4 of 5 years +18, adjusted D/E < 0.8 +9; rules 3 + 6 + 8 together +66 pp; interest < 15 % and EPS 9 of 10 not confirmed; extra SEC tags in `r136a_sec_buffett.py` → /home/user/ndx/szer/sec111.json), 112 (check only: D/E quintiles no edge in the top 500 (Q1 15.0 vs Q5 12.5 %/yr, 5 years −1.3 pp n.s.); P/E < 50 and PEG < 3 vs expensive no edge; 5-year return = revenue 53 %, buybacks 14 %, margin 12 %, P/E + dividends 22 % — 1 year in the top quartile mostly P/E). Portfel shows a „Skład wg typów Petera Lyncha” table (`typyPf`): NUMBER of stocks by type vs the USER'S target count (`S.celLiczba`, editable, default
6 stabilnie / 2 szybko / 2 wolno rosnące of 10 slots (user: „6/2/2”) = 1 ÷ `W.DOKUP.limit` — user: „więcej stabilnych …”, then „mówiłem o ilości spółek w portfelu i
procentowym udziale jednej spółki”), each stock's share of the account, Lynch's 20/40/40 and stage
86 medians for reference; informational, dokup rules unchanged.
