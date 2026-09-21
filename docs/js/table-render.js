// ============================================================
// SILNIK TABEL SORTOWALNYCH/FILTROWALNYCH PO ETAPIE — WSPÓLNY dla
// dashboardu (`renderTable`/`renderRsmScreenerTable`/`renderTtmSqueezeTable`
// w app.js) i Kroku 2 obu rebalanserów (`renderPoolTable` w rebalance.js i w
// rebalance_pl.js).
//
// Wszystkie miały wcześniej WŁASNĄ, prawie identyczną kopię tej samej
// pętli: przefiltruj wiersze po etapie -> zbuduj linijkę "meta" nad tabelą ->
// posortuj -> wyczyść `<tbody>` -> pokaż pusty stan albo wypisz wiersze
// (z klasą `.row-selected`, klikiem, opcjonalnym hookiem po renderze typu
// `bindTvRowButtons`). `renderScreenerTable()` poniżej to JEDNA implementacja
// tej pętli — każde wywołanie dostarcza tylko to, co faktycznie się różni
// między tabelami (HTML komórek wiersza, co robi klik, jak wygląda tekst
// linijki meta, ile kolumn ma pusty stan). `index.html` musi ładować ten
// plik PRZED `js/app.js`, a `rebalance.html`/`rebalance_pl.html` PRZED
// `js/rebalance.js`/`js/rebalance_pl.js` odpowiednio.
//
// Nie jest to silnik generycznego "data grid" — celowo nie próbuje obsłużyć
// niczego, czego żadna z czterech tabel dziś nie robi (np. paginacji).
// ============================================================

// opts:
//   tbody          — element <tbody>, wymagany
//   metaEl         — element linijki "meta" nad tabelą (opcjonalny)
//   allRows        — pełna lista wierszy PRZED filtrem etapu
//   matchesStage   — fn(row) => bool; pominięte/`null` = brak filtra (wszystkie wiersze)
//   sortKey/sortDir — użyte przez domyślny `compareRows`, o ile `compareFn` nie jest podane
//   compareFn      — komparator (a, b) => number; nadpisuje sortKey/sortDir
//   colspan        — liczba kolumn pustego wiersza stanu
//   emptyAllMsg    — tekst, gdy `allRows` jest puste
//   emptyFilteredMsg — tekst, gdy filtr etapu wyzerował wynik
//   metaText(rows, allRows) => string  — tekst linijki meta (rows = po filtrze/sortowaniu)
//   metaTitle(rows, allRows) => string — atrybut title linijki meta (domyślnie "")
//   beforeRender(rows, allRows)  — hook PO sortowaniu, PRZED renderem wierszy
//                                   (np. policzenie maxWeight do paska wagi w renderTable)
//   rowKey(row) => string  — jeśli podane, ustawia `tr.dataset.ticker`
//   isSelected(row) => bool — jeśli true, dodaje klasę `.row-selected`
//   rowHtml(row, index) => string — HTML komórek `<td>` wiersza
//   onRowClick(row)      — handler kliknięcia w `<tr>` (opcjonalny)
//   afterRender(tbody)   — hook po dopisaniu wszystkich wierszy (np. bindTvRowButtons,
//                          podpięcie przycisków akcji w tabeli Kroku 2)
function renderScreenerTable(opts) {
    const {
        tbody, metaEl,
        allRows, matchesStage,
        sortKey, sortDir, compareFn,
        colspan, emptyAllMsg, emptyFilteredMsg,
        metaText, metaTitle, beforeRender,
        rowKey, isSelected, rowHtml, onRowClick, afterRender,
    } = opts;

    const rows = matchesStage ? allRows.filter(matchesStage) : allRows.slice();

    if (metaEl) {
        metaEl.textContent = metaText ? metaText(rows, allRows) : "";
        metaEl.title = metaTitle ? metaTitle(rows, allRows) : "";
    }

    rows.sort(compareFn || ((a, b) => compareRows(a, b, sortKey, sortDir)));

    if (beforeRender) beforeRender(rows, allRows);

    tbody.innerHTML = "";

    if (rows.length === 0) {
        const tr = document.createElement("tr");
        const msg = allRows.length === 0 ? emptyAllMsg : emptyFilteredMsg;
        tr.innerHTML = `<td colspan="${colspan}" class="empty-state">${msg}</td>`;
        tbody.appendChild(tr);
        return;
    }

    rows.forEach((row, i) => {
        const tr = document.createElement("tr");
        if (rowKey) tr.dataset.ticker = rowKey(row);
        if (isSelected && isSelected(row)) tr.classList.add("row-selected");
        tr.innerHTML = rowHtml(row, i);
        if (onRowClick) tr.addEventListener("click", () => onRowClick(row));
        tbody.appendChild(tr);
    });

    if (afterRender) afterRender(tbody);
}

// Eksport wyłącznie dla test runnera Node (tests/js/) — nie ładowany i bez
// efektu w przeglądarce (module tam nie istnieje).
if (typeof module !== "undefined" && module.exports) {
    module.exports = { renderScreenerTable };
}
