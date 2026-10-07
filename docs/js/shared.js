// ============================================================
// MODUŁ WSPÓLNY dla index.html/watchlist.js — zwykły <script>
// ładowany PRZED watchlist.js (bez modułów/bundlera, patrz "no build
// step" w CLAUDE.md), więc stałe/funkcje poniżej są zwykłymi globalami.
// Dla test runnera Node (tests/js/*.test.js) plik, który korzysta z tych
// globali, doczepia je do globalThis na samej górze (blok "typeof require").
// ============================================================

// Link do PEŁNEJ strony TradingView (nie osadzony widget) dla danego tickera.
function tvUrlFor(ticker) {
    return `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(ticker)}`;
}

// Komparator wierszy tabeli: sortowanie tekstowe bez uwzględniania wielkości
// liter, numeryczne dla reszty pól. Współdzielony przez wszystkie sortowalne
// tabele (tabele listy obserwowanej w watchlist.js).
function compareRows(a, b, sortKey, sortDir) {
    let va = a[sortKey];
    let vb = b[sortKey];
    if (typeof va === "string") { va = va.toLowerCase(); vb = String(vb).toLowerCase(); }
    if (va < vb) return sortDir === "asc" ? -1 : 1;
    if (va > vb) return sortDir === "asc" ? 1 : -1;
    return 0;
}

// Eksport wyłącznie dla test runnera Node (tests/js/shared.test.js) — nie
// ładowany i bez efektu w przeglądarce (module tam nie istnieje).
function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = { escapeHtml, tvUrlFor, compareRows };
}
