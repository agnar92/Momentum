// 🧭 Krok po kroku (osobna strona krok.html): 1) rynek — S&P 500, Nasdaq 100, Dow Jones, 2) sektory — ETF SPDR od najsilniejszego
// (Mansfield RS), 3) akcje z wybranego sektora od najbliższego wybicia (box Darvasa / green line). Wszystko na tygodniowych wykresach
// 10:30 (cena + SMA 10 i 30 tyg.) albo na karcie Darvasa / GLB. Stan kroku w adresie (#rynek, #sektory, #akcje/XLK), więc „wstecz” działa.
// Dane: data/overview.json (indeksy, ETF), watchlist.json + watchlists.json (akcje), charts*.json (wykresy akcji, ładowane w kroku 3).
if (typeof require === "function" && typeof window === "undefined") {
    Object.assign(globalThis, require("./shared.js"), require("./flow.js"));
}

const KROK_PAGE = 24;
const KROK_VIEWS = ["1030", "card", "glb"];

// Adres → krok (pure): "#akcje/XLK" → {step: "akcje", sector: "XLK"}; nieznany = rynek.
function krokRoute(hash) {
    const [step, sector] = String(hash || "").replace(/^#/, "").split("/");
    return { step: ["rynek", "sektory", "akcje"].includes(step) ? step : "rynek", sector: sector ? decodeURIComponent(sector).toUpperCase() : "" };
}

// Werdykt rynku (pure): ile indeksów jest w trendzie 10:30.
function marketVerdict(items) {
    const up = items.filter(i => trend1030(i.c).state === "up").length, n = items.length;
    if (!n) return { cls: "", text: "Brak danych indeksów." };
    if (up === n) return { cls: "positive", up, n, text: `Rynek rośnie — ${up} z ${n} indeksów w trendzie wzrostowym. Można szukać okazji.` };
    if (up === 0) return { cls: "negative", up, n, text: `Rynek spada — żaden indeks nie jest w trendzie wzrostowym. Lepiej czekać.` };
    return { cls: "warn", up, n, text: `Rynek mieszany — ${up} z ${n} indeksów w trendzie wzrostowym. Ostrożnie, mniejsze pozycje.` };
}

const pct = (v, d = 1) => (Number.isFinite(v) ? `${v > 0 ? "+" : ""}${v.toFixed(d).replace(".", ",")} %` : "—");
const cls = v => (Number.isFinite(v) ? (v > 0 ? "positive" : v < 0 ? "negative" : "") : "muted");
const fmtPx = v => (Number.isFinite(v) ? (v >= 1000 ? Math.round(v).toLocaleString("pl-PL") : v.toFixed(2).replace(".", ",")) : "—");

const krok = { ov: null, main: null, watch: null, charts: null, wcharts: null, view: "1030", shown: KROK_PAGE };
try { const v = localStorage.getItem("momentum_watchlist_krok_view"); if (KROK_VIEWS.includes(v)) krok.view = v; } catch (e) { /* brak localStorage */ }

function getJson(url) {
    return fetch(url, { cache: "no-cache" }).then(r => (r.ok ? r.json() : null)).catch(() => null);
}

function chartHtml(c, weeks, glb, v) {
    const narrow = window.innerWidth < 700;
    if (krok.view === "card") return darCardSvg({ c, weeks, v }, { fit: { w: 520, h: narrow ? 320 : 260 }, mini: true }).replace(' id="chartSvg"', "");
    if (krok.view === "glb") {
        const px = [...c].reverse().find(Number.isFinite);
        return glb ? glbCardSvg(glb, px, { fit: { w: 520, h: narrow ? 320 : 260 }, mini: true }) : `<p class="krok-note">Brak green line dla tego waloru.</p>`;
    }
    return chart1030Svg(c, weeks, { w: 520, h: narrow ? 240 : 210 });
}
const trendChip = st => { const [l, k] = TREND_LABELS[st] || TREND_LABELS.na; return `<span class="krok-chip ${k}">${l}</span>`; };
const stat = (label, value, k = "") => `<div><span>${label}</span><b class="${k}">${value}</b></div>`;

function tile({ title, sub, chips, chart, stats, href, frame }) {
    const tag = href ? "a" : "div";
    return `<${tag} class="krok-tile ${frame || ""}"${href ? ` href="${href}"` : ""}><div class="krok-tile-head"><b>${escapeHtml(title)}</b>${chips}</div>`
        + (sub ? `<div class="krok-sub">${escapeHtml(sub)}</div>` : "") + `<div class="krok-chart">${chart}</div><div class="krok-stats">${stats}</div></${tag}>`;
}

function itemTile(it, spx, href) {
    const weeks = krok.ov.weeks, p = flowPerf(it.c, weeks), t = trend1030(it.c);
    const mrs = it.t === "^GSPC" ? null : mansfieldRS(it.c, spx);
    const mrsChip = Number.isFinite(mrs) ? `<span class="krok-chip ${mrs > 0 ? "positive" : "negative"}">${mrs > 0 ? "silniejszy" : "słabszy"} od S&P</span>` : "";
    const stats = stat("Kurs", fmtPx(t.close)) + stat("Tydzień", pct(p.w), cls(p.w)) + stat("3 mies.", pct(p.q), cls(p.q)) + stat("Rok", pct(p.y), cls(p.y))
        + stat("vs SMA 30", pct(t.pct30), cls(t.pct30)) + (Number.isFinite(mrs) ? stat("Mansfield RS", (mrs > 0 ? "+" : "") + mrs.toFixed(1).replace(".", ","), cls(mrs)) : "");
    return tile({ title: `${it.name} (${it.t.replace("^", "")})`, chips: trendChip(t.state) + mrsChip, chart: chartHtml(it.c, weeks, it.glb, null), stats, href,
        frame: t.state === "up" ? "up" : t.state === "down" ? "down" : "" });
}

function stockList(sector) {
    const seen = new Map();
    [...((krok.main || {}).stocks || []), ...((krok.watch || {}).stocks || [])].forEach(s => { if (!seen.has(s.ticker)) seen.set(s.ticker, s); });
    return flowSortStocks([...seen.values()].filter(s => !sector || s.sector === sector));
}

function stockTile(s) {
    const src = krok.charts && krok.charts.stocks && krok.charts.stocks[s.ticker] ? krok.charts : krok.wcharts && krok.wcharts.stocks && krok.wcharts.stocks[s.ticker] ? krok.wcharts : null;
    const ch = src && src.stocks[s.ticker];
    const t = ch ? trend1030(ch.c) : { state: "na" }, p = ch ? flowPerf(ch.c, src.weeks) : {};
    const b = s.flow_brk || flowBreakout(s);
    const signal = b.key === null ? `<span class="krok-chip muted">brak sygnału</span>` : `<span class="krok-chip ${b.key <= 0 ? "positive" : "signal"}">${escapeHtml(b.text)}</span>`;
    const stats = stat("Kurs", fmtPx(s.price)) + stat("RS Rating", Number.isFinite(s.rs_rating) ? String(s.rs_rating) : "—", s.rs_rating >= 80 ? "positive" : "")
        + stat("3 mies.", pct(p.q), cls(p.q)) + stat("vs SMA 30", pct(t.pct30), cls(t.pct30)) + stat("MACD tyg.", s.macd_w_above === true ? "nad sygnałem" : s.macd_w_above === false ? "pod sygnałem" : "—", s.macd_w_above === true ? "positive" : s.macd_w_above === false ? "negative" : "");
    return tile({ title: `${s.ticker} · ${s.company || ""}`, sub: [s.industry, s.earnings ? `wyniki ${s.earnings}` : ""].filter(Boolean).join(" · "),
        chips: trendChip(t.state) + signal, chart: ch ? chartHtml(ch.c, src.weeks, ch.glb, ch.v) : `<p class="krok-note">Brak wykresu.</p>`, stats,
        href: `index.html?chart=${encodeURIComponent(s.ticker)}`, frame: b.key !== null && b.key <= 0 ? "up" : "" });
}

async function render() {
    const r = krokRoute(location.hash), body = document.getElementById("krokBody");
    document.querySelectorAll("#krokSteps a").forEach(a => a.classList.toggle("active", a.dataset.step === r.step));
    document.querySelectorAll(".krok-bar button").forEach(b => b.classList.toggle("active", b.dataset.view === krok.view));
    const ov = krok.ov;
    if (!ov) { body.innerHTML = `<p class="krok-note">Brak danych rynku i sektorów (overview.json) — pojawią się po najbliższym odświeżeniu danych.</p>`; return; }
    const spx = (ov.items.find(i => i.t === "^GSPC") || {}).c;
    const asOf = ov.weeks[ov.weeks.length - 1];
    if (r.step === "rynek") {
        const idx = ov.items.filter(i => i.kind === "index"), v = marketVerdict(idx);
        body.innerHTML = `<h1>Krok 1 · Gdzie jest rynek?</h1><p class="krok-lead">Tygodniowe wykresy 10:30: szara linia = cena, <span class="c10">SMA 10</span> i <span class="c30">SMA 30</span> tygodni. Trend wzrostowy = cena nad rosnącą SMA 30, a SMA 10 nad SMA 30. Dane do ${asOf}.</p>`
            + `<p class="krok-verdict ${v.cls}">${v.text}</p><div class="krok-grid">${idx.map(i => itemTile(i, spx, "")).join("")}</div>`
            + `<a class="krok-next" href="#sektory">Dalej: 2 · Sektory ›</a>`;
    } else if (r.step === "sektory") {
        const secs = ov.items.filter(i => i.kind === "sector").map(i => ({ i, m: mansfieldRS(i.c, spx) })).sort((a, b) => (b.m ?? -999) - (a.m ?? -999));
        const strong = secs.filter(x => x.m > 0).length;
        body.innerHTML = `<h1>Krok 2 · Które sektory są silne?</h1><p class="krok-lead">Od najsilniejszego. Mansfield RS = sektor (ETF) względem S&amp;P 500, porównany ze swoją średnią z roku: powyżej 0 = sektor wygrywa z rynkiem. Stuknij sektor, żeby zobaczyć jego akcje.</p>`
            + `<p class="krok-verdict ${strong >= 6 ? "positive" : strong <= 3 ? "warn" : ""}">${strong} z ${secs.length} sektorów wygrywa z rynkiem.</p>`
            + `<div class="krok-grid">${secs.map(x => itemTile(x.i, spx, `#akcje/${x.i.t}`)).join("")}</div>`;
    } else {
        const it = ov.items.find(i => i.kind === "sector" && i.t === r.sector);
        const opts = `<option value="">wszystkie sektory</option>` + ov.items.filter(i => i.kind === "sector").map(i => `<option value="${i.t}"${it && it.t === i.t ? " selected" : ""}>${escapeHtml(i.name)} (${i.t})</option>`).join("");
        body.innerHTML = `<h1>Krok 3 · Akcje${it ? ` — ${escapeHtml(it.name)}` : ""}</h1><p class="krok-lead">Akcje z Twoich list (CANSLIM + Watchlisty) od najbliższego wybicia: góra boxa Darvasa albo green line (GLB). Stuknij kafelek = pełny wykres w Strategiach.</p>`
            + `<p class="krok-select"><label>Sektor: <select id="krokSector">${opts}</select></label></p><p class="krok-note">Ładowanie wykresów…</p>`;
        bindSector();
        if (!krok.charts) [krok.charts, krok.wcharts] = await Promise.all([getJson("data/charts.json"), getJson("data/charts_watchlists.json")]);
        if (krokRoute(location.hash).step !== "akcje") return;
        const list = stockList(it ? it.sector : "");
        const withSig = list.filter(s => s.flow_brk.key !== null).length;
        body.querySelector(".krok-note").outerHTML = `<p class="krok-verdict ${withSig ? "positive" : ""}">${list.length} spółek · ${withSig} blisko wybicia (do 15 %).</p>`
            + `<div class="krok-grid">${list.slice(0, krok.shown).map(stockTile).join("")}</div>`
            + (list.length > krok.shown ? `<button type="button" class="krok-next" id="krokMore">Pokaż więcej (${list.length - krok.shown})</button>` : "");
        const more = document.getElementById("krokMore");
        if (more) more.addEventListener("click", () => { krok.shown += KROK_PAGE; render(); });
    }
}
function bindSector() {
    const sel = document.getElementById("krokSector");
    if (sel) sel.addEventListener("change", () => { krok.shown = KROK_PAGE; location.hash = sel.value ? `#akcje/${sel.value}` : "#akcje"; });
}

async function initKrok() {
    [krok.ov, krok.main, krok.watch] = await Promise.all([getJson("data/overview.json"), getJson("data/watchlist.json"), getJson("data/watchlists.json")]);
    document.querySelectorAll(".krok-bar button").forEach(b => b.addEventListener("click", () => {
        krok.view = b.dataset.view;
        try { localStorage.setItem("momentum_watchlist_krok_view", krok.view); } catch (e) { /* ignoruj */ }
        render();
    }));
    window.addEventListener("hashchange", () => { krok.shown = KROK_PAGE; render(); window.scrollTo(0, 0); });
    render();
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
}
if (typeof window !== "undefined" && typeof document !== "undefined") initKrok();

if (typeof module !== "undefined" && module.exports) module.exports = { krokRoute, marketVerdict };
