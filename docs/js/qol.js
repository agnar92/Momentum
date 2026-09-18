// ============================================================
// DROBNE USPRAWNIENIA UX WSPÓLNE DLA index.html/rebalance.html/chart.html —
// zwykły <script> tag (bez modułów/bundlera, ładowany PRZED
// js/app.js/js/rebalance.js/js/chart.js na wszystkich trzech stronach, ten
// sam wzorzec co js/pull-to-refresh.js) obejmujący trzy niezależne rzeczy:
//
// 1. `showToast(message, opts)` — krótki, nieblokujący komunikat w rogu
//    ekranu po akcji użytkownika (dodanie/usunięcie spółki z portfela,
//    zapis/wyczyszczenie ręcznego zwrotu GEM, import/eksport XTB) — strona
//    wcześniej dawała taką informację tylko przez zmianę tekstu w wąskim
//    pasku obok przycisku (np. #importStatus) albo wcale (np. togglePick nie
//    dawał ŻADNEGO potwierdzenia poza samą zmianą przycisku "+ Dodaj"/
//    "✓ W portfelu" w tabeli, łatwej do przeoczenia przy szybkim klikaniu
//    wielu wierszy pod rząd).
// 2. `initConnStatus()` — mały wskaźnik offline w .topbar (ukryty, gdy
//    `navigator.onLine` jest true) — strona jest PWA z Service Workerem,
//    który po utracie sieci cicho spada na ostatnią zacache'owaną wersję
//    danych (patrz sw.js/CLAUDE.md), ale bez tego wskaźnika użytkownik nie
//    miał żadnego sygnału, że akurat patrzy na dane sprzed jakiegoś czasu,
//    nie na świeży fetch.
// 3. `hideLoadingOverlay()` — chowa pełnoekranową nakładkę ładowania
//    (#loadingOverlay, widoczną domyślnie w HTML) po zakończeniu
//    początkowego fetchu danych każdej strony — bez niej pierwsze
//    odsłonięcie strony pokazywało pusty sidebar/pustą tabelę/pusty wykres
//    aż fetch się skończy, bez żadnej informacji, że coś się w ogóle
//    dzieje.
// ============================================================

// typeof document check w kazdej z trzech funkcji ponizej: pozwala wywolac
// je bezpiecznie z kodu, ktory testy jednostkowe w Node (tests/js/)
// uruchamiaja BEZ przegladarkowego DOM — np. togglePick() w rebalance.js
// woła showToast() wprost, a togglePick() samo jest jednostkowo testowane
// (patrz tests/js/rebalance.test.js) — w przegladarce document zawsze
// istnieje, wiec zachowanie sie nie zmienia.
function showToast(message, opts) {
    if (typeof document === "undefined") return;
    opts = opts || {};
    const type = opts.type || "info"; // "info" | "success" | "error"
    const duration = opts.duration || 3200;

    let container = document.getElementById("toastContainer");
    if (!container) {
        container = document.createElement("div");
        container.id = "toastContainer";
        container.className = "toast-container";
        document.body.appendChild(container);
    }

    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    // requestAnimationFrame: dodaje klasę PO tym, jak przeglądarka zdąży
    // narysować wyjściowy stan (opacity:0/przesunięcie) — inaczej dodanie
    // klasy w tej samej klatce co appendChild potrafi "połknąć" animację
    // wejścia (element od razu jest w stanie końcowym).
    window.requestAnimationFrame(() => toast.classList.add("toast-visible"));

    window.setTimeout(() => {
        toast.classList.remove("toast-visible");
        // transitionend zamiast sztywnego drugiego setTimeout — usuwa węzeł
        // dokładnie wtedy, gdy animacja zniknięcia faktycznie się skończy,
        // niezależnie od czasu trwania zdefiniowanego w CSS.
        toast.addEventListener("transitionend", () => toast.remove(), { once: true });
    }, duration);
}

// Wskaźnik offline w .topbar — element #connStatus jest w HTML domyślnie
// `hidden`; ta funkcja tylko odsłania/chowa go wg navigator.onLine. Strony
// bez tego elementu (żadna dziś go nie pomija, ale to tani warunek) po
// prostu nic nie robią.
function initConnStatus() {
    if (typeof document === "undefined") return;
    const el = document.getElementById("connStatus");
    if (!el) return;
    const update = () => { el.hidden = navigator.onLine; };
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
}

// Chowa #loadingOverlay (jeśli strona go ma) po zakończeniu pierwszego
// fetchu danych — patrz init() w app.js/rebalance.js/chart.js. Klasa zamiast
// natychmiastowego `hidden = true` daje czas na płynne zniknięcie (CSS
// transition w style.css); sam `hidden` na końcu tylko usuwa element z
// drzewa dostępności/tabbingu, żeby nie został "widmowym" fokusowalnym
// elementem po zaniknięciu.
function hideLoadingOverlay() {
    if (typeof document === "undefined") return;
    const el = document.getElementById("loadingOverlay");
    if (!el) return;
    el.classList.add("loading-overlay-hidden");
    window.setTimeout(() => { el.hidden = true; }, 300);
}

// Eksport wyłącznie dla test runnera Node (tests/js/) — nie ładowany i bez
// efektu w przeglądarce (module tam nie istnieje). showToast/initConnStatus/
// hideLoadingOverlay są celowo DOM-sprzężone (tak jak renderRelativeStrengthChart
// w chart-render.js) i nie są tu jednostkowo testowane — patrz CLAUDE.md.
if (typeof module !== "undefined" && module.exports) {
    module.exports = { showToast, initConnStatus, hideLoadingOverlay };
}
