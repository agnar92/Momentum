// Proste wykresy SVG (słupki, linia) z podpowiedziami po najechaniu. Bez bibliotek.
"use strict";
(function (root) {
    const NS = "http://www.w3.org/2000/svg";
    function skala(min, max, h, pad) { const r = max - min || 1; return (v) => pad + (h - 2 * pad) * (1 - (v - min) / r); }
    function osY(vmin, vmax, n = 4) {
        const krok = (vmax - vmin) / n, mag = Math.pow(10, Math.floor(Math.log10(Math.abs(krok) || 1)));
        const k = [1, 2, 2.5, 5, 10].map((x) => x * mag).find((x) => x >= krok) || krok;
        const a = Math.floor(vmin / k) * k, out = [];
        for (let v = a; out.length < 50; v += k) { out.push(+v.toFixed(10)); if (v >= vmax) break; }
        return out;
    }
    function tip(e, tekst) {
        const t = document.getElementById("tip"); if (!t) return;
        if (!tekst) { t.hidden = true; return; }
        t.hidden = false; t.innerHTML = tekst; t.style.left = (e.clientX + 12) + "px"; t.style.top = (e.clientY + 12) + "px";
    }
    // serie: [{nazwa, kolor, w: [..], kreski: bool}], etykiety: [..]; fmt: formatowanie wartości
    function slupki(el, etykiety, serie, fmt, wys = 260) {
        const w = Math.max(320, el.clientWidth || 600), L = 64, B = 26, T = 10;
        const wsz = serie.flatMap((s) => s.w).filter((v) => v !== null && Number.isFinite(v));
        if (!wsz.length) { el.innerHTML = '<p class="mut">Brak danych.</p>'; return; }
        const vmin = Math.min(0, ...wsz), vmax = Math.max(0, ...wsz);
        // mała wartość ujemna (np. FCF −2 mld przy przychodach 300 mld) nie powinna dokładać całej działki osi w dół
        const malaUjemna = vmin < 0 && -vmin < 0.25 * vmax;
        const ticks = malaUjemna ? osY(0, vmax) : osY(vmin, vmax);
        const dol = malaUjemna ? vmin * 1.3 : ticks[0];
        const y = skala(dol, ticks[ticks.length - 1], wys - B - T, 0);
        const yy = (v) => T + y(v);
        const n = etykiety.length, grupa = (w - L - 8) / n, sz = Math.max(2, Math.min(28, (grupa - 4) / serie.length - 2));
        let s = `<svg viewBox="0 0 ${w} ${wys}" width="100%" height="${wys}" xmlns="${NS}">`;
        s += '<defs><pattern id="kreski" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#e2e8f0"/><line x1="0" y1="0" x2="0" y2="6" stroke="#94a3b8" stroke-width="2"/></pattern></defs>';
        ticks.forEach((v) => { s += `<line x1="${L}" x2="${w}" y1="${yy(v)}" y2="${yy(v)}" stroke="#e5e7eb"/><text x="${L - 6}" y="${yy(v) + 4}" text-anchor="end">${fmt(v)}</text>`; });
        // etykiety osi X: na wąskim ekranie skracamy (2021 -> ’21, 2016-12 -> ’16-12) i pokazujemy co k-tą, żeby się nie nakładały
        const krotko = grupa < 34;
        const et2 = (et) => (krotko && /^\d{4}(-\d{2})?$/.test(String(et)) ? "’" + String(et).slice(2) : String(et));
        const szer = Math.max(...etykiety.map((e) => et2(e).length)) * 7 + 6;
        const co = Math.max(1, Math.ceil(n / 12), Math.ceil(szer / grupa));
        etykiety.forEach((et, i) => {
            const x0 = L + i * grupa + (grupa - serie.length * (sz + 2)) / 2;
            serie.forEach((se, k) => {
                const v = se.w[i]; if (v === null || !Number.isFinite(v)) return;
                const ya = yy(Math.max(0, v)), yb = yy(Math.min(0, v));
                const kol = se.kreski && se.kreski[i] ? "url(#kreski)" : se.kolor;
                s += `<rect x="${x0 + k * (sz + 2)}" y="${ya}" width="${sz}" height="${Math.max(1, yb - ya)}" rx="3" fill="${kol}" data-tip="${et}: ${se.nazwa} ${fmt(v)}"/>`;
            });
            if (i % co === 0) s += `<text x="${L + i * grupa + grupa / 2}" y="${wys - 6}" text-anchor="middle">${et2(et)}</text>`;
        });
        s += "</svg>";
        el.innerHTML = s + '<div class="legenda">' + serie.map((x) => `<span><i style="background:${x.kolor}"></i>${x.nazwa}</span>`).join("") + "</div>";
        el.querySelectorAll("rect[data-tip]").forEach((r) => { r.addEventListener("mousemove", (e) => tip(e, r.dataset.tip)); r.addEventListener("mouseleave", (e) => tip(e, null)); });
    }
    function linia(el, daty, wart, fmt, wys = 240) {
        const w = Math.max(320, el.clientWidth || 600), L = 56, B = 24, T = 10;
        if (!wart.length) { el.innerHTML = '<p class="mut">Brak notowań.</p>'; return; }
        const ticks = osY(Math.min(...wart), Math.max(...wart));
        const y = skala(ticks[0], ticks[ticks.length - 1], wys - B - T, 0), yy = (v) => T + y(v);
        const x = (i) => L + (w - L - 8) * i / Math.max(1, wart.length - 1);
        let s = `<svg viewBox="0 0 ${w} ${wys}" width="100%" height="${wys}" xmlns="${NS}">`;
        ticks.forEach((v) => { s += `<line x1="${L}" x2="${w}" y1="${yy(v)}" y2="${yy(v)}" stroke="#e5e7eb"/><text x="${L - 6}" y="${yy(v) + 4}" text-anchor="end">${fmt(v)}</text>`; });
        const kol = wart[wart.length - 1] >= wart[0] ? "#10b981" : "#ef4444";
        s += `<polyline fill="none" stroke="${kol}" stroke-width="2" points="${wart.map((v, i) => `${x(i)},${yy(v)}`).join(" ")}"/>`;
        const co = Math.ceil(daty.length / 8);
        daty.forEach((d, i) => { if (i % co === 0) s += `<text x="${x(i)}" y="${wys - 6}" text-anchor="middle">${d.slice(2, 7)}</text>`; });
        s += `<rect x="${L}" y="0" width="${w - L}" height="${wys}" fill="transparent" class="nakladka"/></svg>`;
        el.innerHTML = s;
        const nak = el.querySelector(".nakladka"), svg = el.querySelector("svg");
        nak.addEventListener("mousemove", (e) => {
            const b = svg.getBoundingClientRect(), px = (e.clientX - b.left) * w / b.width;
            const i = Math.max(0, Math.min(wart.length - 1, Math.round((px - L) / ((w - L - 8) / Math.max(1, wart.length - 1)))));
            tip(e, `${daty[i]}: ${fmt(wart[i])}`);
        });
        nak.addEventListener("mouseleave", (e) => tip(e, null));
    }
    const WY = { slupki, linia, osY };
    if (typeof module !== "undefined" && module.exports) module.exports = WY;
    else root.WY = WY;
})(typeof window !== "undefined" ? window : this);
