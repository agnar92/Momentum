// GLB — Green Line Breakout (Dr Wish) w stylu karty Darvasa: green line = rekord wszech czasów na MIESIĘCZNYCH zamknięciach,
// który stoi ≥ 3 zamknięte miesiące (liczy watchlist.py: pola glb_* i charts.json stocks[T].glb). Wejście i wyjście TYGODNIOWE:
// zlecenie kupna stop na linii, stop 1 % pod linią (sprawdzany na zamknięciu tygodnia), potem przesuwanie stopu po tygodniowym MACD.
if (typeof require === "function" && typeof window === "undefined") {
    Object.assign(globalThis, require("./shared.js"));
    Object.assign(globalThis, require("./chart.js"));
}

const GLB_STOP_PCT = 1;
const GLB_PLAN_MAX_DIST = 10;   // w 📋 Planie zlecenia tylko dla spółek ≤ 10 % pod linią
const GLB_BREAK_MAX_EXT = 5;    // kupno tylko, gdy tydzień zamknął się nad linią najwyżej +5 %

const GLB_STATE_LABELS = { WAIT: ["🟩 czeka", ""], BREAK: ["🟢 WYBICIE", "positive"], ABOVE: ["nad linią", "muted"], NONE: ["—", "muted"] };

const ymNum = ym => +ym.slice(0, 4) * 12 + (+ym.slice(5, 7) - 1);
const numYm = n => `${Math.floor(n / 12)}-${String(n % 12 + 1).padStart(2, "0")}`;
const PL_MONTHS = ["sty", "lut", "mar", "kwi", "maj", "cze", "lip", "sie", "wrz", "paź", "lis", "gru"];
const ymLabel = ym => `${PL_MONTHS[+ym.slice(5, 7) - 1]} ${ym.slice(0, 4)}`;

// Opis stanu (pure): g = charts.json stocks[T].glb, px = ostatnie zamknięcie tygodnia.
function glbAnalyze(g, px) {
    if (!g || !Number.isFinite(px)) return { state: "NONE", text: "Brak danych GLB — pojawią się po najbliższym odświeżeniu danych." };
    const line = Number.isFinite(g.line) ? g.line : null;
    const f = v => (Math.round(v * 100) / 100).toFixed(2);
    if (line === null) {
        const ath = g.ath ? ` Rekord ${f(g.ath[1])} (${ymLabel(g.ath[0])}) stoi krócej niż 3 miesiące.` : "";
        return { state: "NONE", line: null, text: `Brak green line — za mało historii albo świeży rekord.${ath}` };
    }
    const stop = Number.isFinite(g.stop) ? g.stop : Math.round(line * (1 - GLB_STOP_PCT / 100) * 100) / 100;
    const dist = (line / px - 1) * 100;
    const since = g.lm ? ` (rekord z ${ymLabel(g.lm)})` : "";
    const st = g.state || (px < line ? "WAIT" : "ABOVE");
    const fresh = g.ath && g.ath[1] > line * 1.0001 ? ` Nowy rekord ${f(g.ath[1])} (${ymLabel(g.ath[0])}) stoi jeszcze krócej niż 3 miesiące — obowiązuje stara linia, ponowne przebicie = wejście.` : "";
    if (st === "WAIT") return { state: st, line, stop, dist, text: `Czekaj — kup, gdy cena > ${f(line)}${since}, ${dist.toFixed(1).replace(".", ",")} % wyżej; stop ${f(stop)} (1 % pod linią, na zamknięciu tygodnia).${fresh}` };
    if (st === "BREAK") return { state: st, line, stop, dist, text: `KUP — zamknięcie tygodnia nad green line ${f(line)}${since}${-dist > GLB_BREAK_MAX_EXT ? ` (już ${(-dist).toFixed(1).replace(".", ",")} % wyżej — nie goń)` : ""}; stop ${f(stop)}, potem przesuwaj po tygodniowym MACD.` };
    return { state: st, line, stop, dist, text: `Nad green line ${f(line)}${since} — pozycję prowadzi tygodniowy MACD; nowa linia, gdy kolejny rekord przestoi 3 miesiące.` };
}

// Zlecenia GLB do 📋 Planu (pure). Kupno = tydzień zamknął się NAD green line, ale nie więcej niż +5 % (BREAK albo ABOVE; user: „jeśli przebiły,
// zamknęły się ponad linią nie więcej niż 5 %”) — kupno na otwarciu; najbliżej linii pierwsze. Czekające pod linią (≤ 10 %) = kandydaci („ready”, kupno stop na linii).
function glbOrders(stocks, acct = null, size = null) {
    return stocks.filter(s => Number.isFinite(s.glb_line) && Number.isFinite(s.price)
        && ((s.glb_state === "WAIT" && s.glb_dist <= GLB_PLAN_MAX_DIST) || ((s.glb_state === "BREAK" || s.glb_state === "ABOVE") && s.price <= s.glb_line * (1 + GLB_BREAK_MAX_EXT / 100))))
        .map(s => {
            const buy = s.glb_state !== "WAIT", entry = buy ? s.price : s.glb_line;
            const stop = Number.isFinite(s.glb_stop) ? s.glb_stop : Math.round(s.glb_line * (1 - GLB_STOP_PCT / 100) * 100) / 100;
            return { ticker: s.ticker, kind: buy ? "buy" : "ready", fresh: s.glb_state === "BREAK", entry, stop, line: s.glb_line, dist: s.glb_dist,
                ext: buy ? (s.price / s.glb_line - 1) * 100 : null, month: s.glb_month, age: s.glb_age,
                size: acct && size ? size(acct, entry, stop) : null };
        })
        .sort((a, b) => (a.kind === "buy" ? -1 : 0) - (b.kind === "buy" ? -1 : 0) || (a.kind === "buy" ? a.ext - b.ext : (a.dist ?? 99) - (b.dist ?? 99)));
}

// Karta GLB w stylu Dar-Card: papier w linie, oś cen po lewej, miesięczne zamknięcia jako kreski (jak notowania wpisywane na kartę),
// zielona linia do prawego brzegu z opisem stanu, żółta kropka = bieżące zamknięcie, u dołu spółka, okres i tabelka „Rekord / Green line / Stop”.
function glbCardSvg(g, px, opts = {}) {
    const W = opts.fit ? opts.fit.w : 1000, H = opts.fit ? opts.fit.h : 710, compact = !!opts.compact;
    const fs = v => Math.round(v * (compact ? 1.25 : 1) * 10) / 10;
    if (!g || !Array.isArray(g.c) || !g.c.length) return `<svg viewBox="0 0 ${W} ${H}" width="100%"><text x="20" y="30" fill="#8a8f9c" font-size="14">Brak danych GLB — pojawią się po najbliższym odświeżeniu danych (watchlist.py).</text></svg>`;
    const a = glbAnalyze(g, px);
    const n = g.c.length, m0 = ymNum(g.m0);
    const tableH = fs(14) * 6 + fs(10);
    const L = { left: compact ? 40 : 48, right: 8, top: fs(44), bottom: tableH + fs(36) };
    const pw = W - L.left - L.right, ph = H - L.top - L.bottom;
    const vals = g.c.filter(Number.isFinite).concat(Number.isFinite(px) ? [px] : []).concat(a.line ? [a.line * 1.02, a.stop] : []);
    const lo0 = Math.min(...vals), hi0 = Math.max(...vals);
    const span = Math.log(hi0 / lo0) || 0.1, lo = lo0 * Math.exp(-0.12 * span), hi = hi0 * Math.exp(0.12 * span);
    const y = v => L.top + ph * (1 - Math.log(v / lo) / Math.log(hi / lo));
    const slot = pw / (n + 1), x = i => L.left + slot * (i + 0.5);
    const out = [];
    out.push(`<style>text,line,circle,polyline,path,rect{pointer-events:none}</style>`);
    out.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="#e9e4d2"/>`);
    const qStep = Math.exp(Math.log(hi / lo) / 70);
    for (let v = lo * qStep; v < hi; v *= qStep) out.push(`<line x1="${L.left}" x2="${W - L.right}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="#b9b49f" stroke-width="0.7"/>`);
    const tk = typeof logTicks === "function" && logTicks(lo, hi).length >= 3 ? logTicks(lo, hi) : (typeof niceTicks === "function" ? niceTicks(lo, hi, compact ? 6 : 8) : []);
    tk.forEach(t => {
        out.push(`<line x1="${L.left}" x2="${W - L.right}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}" stroke="#8b8670" stroke-width="1"/>`);
        out.push(`<text x="${L.left - 4}" y="${(y(t) + 3.5).toFixed(1)}" font-size="${fs(9.5)}" fill="#3a3730" text-anchor="end">${t}</text>`);
    });
    out.push(`<text x="${L.left + 2}" y="${fs(30)}" font-size="${fs(26)}" font-weight="900" fill="#1b1a16" letter-spacing="-0.5">GLB•Card</text>`);
    // lata pod osią (pionowa kreska na styczniu)
    for (let i = 0; i < n; i++) {
        const ym = numYm(m0 + i);
        if (ym.endsWith("-01") || (i === 0 && +ym.slice(5, 7) <= 9)) {   // pierwszy rok tylko, gdy do stycznia zostało dość miejsca na podpis
            out.push(`<line x1="${(x(i) - slot / 2).toFixed(1)}" x2="${(x(i) - slot / 2).toFixed(1)}" y1="${L.top}" y2="${L.top + ph}" stroke="#a9a48e" stroke-width="0.8" stroke-dasharray="2 3"/>`);
            out.push(`<text x="${(x(i) - slot / 2 + 3).toFixed(1)}" y="${(L.top + ph + fs(12)).toFixed(1)}" font-size="${fs(9.5)}" fill="#3a3730">${ym.slice(0, 4)}</text>`);
        }
    }
    const brk = a.state === "BREAK", colr = brk ? "#0a8f3c" : a.state === "ABOVE" ? "#5c7a3a" : "#0f8a3a";
    if (a.line) {   // sama green line (bez boxa, user: „do GLB wystarczy sama linia”): od miesiąca rekordu do pierwszego zamknięcia nad linią (albo do dziś); dalej przerywana
        const inCard = g.lm && ymNum(g.lm) >= m0, iR = inCard ? ymNum(g.lm) - m0 : 0;
        let iB = n;
        for (let i = iR + 1; i < n; i++) if (g.c[i] >= a.line) { iB = i; break; }
        const yT = y(a.line), xe = iB < n ? x(iB) - slot * 0.5 : W - L.right;
        out.push(`<line x1="${(inCard ? x(iR) : L.left).toFixed(1)}" x2="${xe.toFixed(1)}" y1="${yT.toFixed(1)}" y2="${yT.toFixed(1)}" stroke="${colr}" stroke-width="3"/>`);
        if (iB < n) out.push(`<line x1="${xe.toFixed(1)}" x2="${(W - L.right).toFixed(1)}" y1="${yT.toFixed(1)}" y2="${yT.toFixed(1)}" stroke="${colr}" stroke-width="1.8" stroke-dasharray="6 4"/>`);   // przebita: obowiązuje do potwierdzenia nowego rekordu
        if (inCard) out.push(`<circle cx="${x(iR).toFixed(1)}" cy="${yT.toFixed(1)}" r="${fs(4)}" fill="${colr}" stroke="#111" stroke-width="1"/>`);
        const lbl = a.state === "WAIT" ? `Kup > ${a.line.toFixed(2)}` : brk ? "Kup — wybicie" : a.state === "ABOVE" ? "Nad green line" : "";
        out.push(`<text x="${(W - L.right - 2).toFixed(1)}" y="${fs(30)}" font-size="${fs(12)}" font-weight="800" fill="${colr}" text-anchor="end">${lbl}</text>`);   // stan w rogu karty (przy linii nachodził na cenę)
        if (g.lm && ymNum(g.lm) < m0) out.push(`<text x="${(L.left + 4).toFixed(1)}" y="${(yT - fs(6)).toFixed(1)}" font-size="${fs(9.5)}" fill="#2b2a24">rekord z ${ymLabel(g.lm)} (poza kartą)</text>`);
    }
    // miesięczne zamknięcia: krótka pozioma kreska na każdy miesiąc (jak notowania wpisywane ołówkiem) + cienka linia łącząca
    const pts = g.c.map((v, i) => Number.isFinite(v) ? `${x(i).toFixed(1)},${y(v).toFixed(1)}` : null).filter(Boolean);
    out.push(`<polyline points="${pts.join(" ")}" fill="none" stroke="#3a3730" stroke-width="1" opacity="0.55"/>`);
    g.c.forEach((v, i) => {
        if (!Number.isFinite(v)) return;
        const partial = g.partial && i === n - 1;
        out.push(`<line x1="${(x(i) - slot * 0.32).toFixed(1)}" x2="${(x(i) + slot * 0.32).toFixed(1)}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="#111" stroke-width="${partial ? 1.2 : 2.2}"${partial ? ` stroke-dasharray="2 2"` : ""}/>`);
    });
    if (Number.isFinite(px)) {
        const dcx = x(n - 1), dcy = y(px);
        out.push(`<circle cx="${dcx.toFixed(1)}" cy="${dcy.toFixed(1)}" r="${fs(5.5)}" fill="#ffd54a" stroke="#111" stroke-width="1.6"/>`);
        const nearLine = a.line && Math.abs(y(a.line) - dcy) < fs(14);   // cena tuż przy linii: podpis pod kropką
        out.push(`<text x="${(dcx - fs(9)).toFixed(1)}" y="${(dcy + (nearLine && dcy >= y(a.line) ? fs(17) : nearLine ? -fs(9) : fs(3.5))).toFixed(1)}" font-size="${fs(10)}" font-weight="700" fill="#2b2a24" text-anchor="end">${(Math.round(px * 100) / 100).toFixed(2)}</text>`);
    }
    const ty = H - tableH - 4, tx = L.left + 6, c2 = tx + fs(10) * 0.62 * 22;
    const maxCh = Math.max(6, Math.floor((W - L.right - tx) / (fs(11) * 0.62))), ttl = String(opts.bookTitle || ""), ttlShort = ttl.length > maxCh ? ttl.slice(0, maxCh - 1) + "…" : ttl;
    out.push(`<text x="${tx}" y="${ty - 4}" font-size="${fs(11)}" font-weight="700" fill="#2b2a24">${escapeHtml(ttlShort)}</text>`);
    out.push(`<text x="${tx}" y="${ty + fs(10)}" font-size="${fs(10)}" font-weight="700" fill="#2b2a24">${ymLabel(g.m0)} – ${ymLabel(numYm(m0 + n - 1))} · zamknięcia miesięczne</text>`);
    const rows = [
        ["Rekord wszech czasów", g.ath ? `${g.ath[1].toFixed(2)} (${ymLabel(g.ath[0])})${g.full ? "" : " ¹"}` : "—"],
        ["Green line", a.line ? `${a.line.toFixed(2)}${g.lm ? ` (${ymLabel(g.lm)})` : ""}` : "brak (rekord < 3 mies.)"],
        ["Stop (1 % pod linią)", a.line ? a.stop.toFixed(2) : "—"],
        ["Do linii", a.line && Number.isFinite(px) ? `${a.dist > 0 ? "+" : ""}${a.dist.toFixed(1).replace(".", ",")} %` : "—"],
    ];
    rows.forEach((r, i) => {
        const yy = ty + fs(10) + fs(16) + fs(14) * i;
        out.push(`<text x="${tx}" y="${yy}" font-size="${fs(10)}" fill="#2b2a24">${r[0]}</text><text x="${c2}" y="${yy}" font-size="${fs(10)}" font-weight="700" fill="#2b2a24">${escapeHtml(r[1])}</text>`);
    });
    if (!g.full) out.push(`<text x="${tx}" y="${ty + fs(10) + fs(16) + fs(14) * 4}" font-size="${fs(8.5)}" fill="#5a564a">¹ z ostatnich 10 lat — pełna historia miesięczna pojawi się po odświeżeniu</text>`);
    return `<svg id="chartSvg" viewBox="0 0 ${W} ${H}" width="100%" style="display:block">${out.join("")}</svg>`;
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = { glbAnalyze, glbOrders, glbCardSvg, GLB_STOP_PCT, GLB_PLAN_MAX_DIST, GLB_BREAK_MAX_EXT, GLB_STATE_LABELS };
}
