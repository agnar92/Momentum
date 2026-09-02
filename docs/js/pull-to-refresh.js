
// Gest "przeciągnij w dół, aby odświeżyć" (pull-to-refresh) dla PWA — Safari/iOS
// i wiele przeglądarek Android nie dają natywnego PTR dla stron dodanych do
// ekranu głównego, więc robimy własny wskaźnik (większy i czytelniejszy niż
// domyślny system Chrome), spójny na wszystkich stronach.
//
// Działa na CAŁYM dokumencie, nie na jednym konkretnym kontenerze: ten sam
// plik jest ładowany na index.html/rebalance.html/portfolio.html, a każda z
// tych stron ma inny scrollowany element (tabela w szufladzie, panel wykresów,
// karta ustawień...). Zamiast wpinać się osobno w layout każdej strony, przy
// każdym dotknięciu szukamy najbliższego przewijalnego przodka punktu dotyku
// i pozwalamy pociągnąć tylko wtedy, gdy jest on już przewinięty na sam górę.
function nearestScrollable(el) {
    while (el && el !== document.body && el !== document.documentElement) {
        const style = getComputedStyle(el);
        if ((style.overflowY === "auto" || style.overflowY === "scroll") && el.scrollHeight > el.clientHeight) {
            return el;
        }
        el = el.parentElement;
    }
    return document.scrollingElement || document.documentElement;
}

function initPullToRefresh(onRefresh) {
    if (!("ontouchstart" in window)) return; // gest ma sens tylko na dotyku

    const PULL_THRESHOLD = 70; // px przeciągnięcia potrzebne do odpalenia odświeżenia
    const MAX_PULL = 90; // px, po których wskaźnik przestaje się dalej rozciągać

    const indicator = document.createElement("div");
    indicator.className = "ptr-indicator";
    indicator.innerHTML = '<svg class="ptr-spinner" viewBox="0 0 50 50"><circle cx="25" cy="25" r="20" fill="none" stroke-width="4"></circle></svg>';
    document.body.appendChild(indicator);
    const spinner = indicator.querySelector(".ptr-spinner");

    let target = null;
    let startY = null;
    let pulling = false;
    let refreshing = false;

    function setPull(px) {
        const shown = Math.min(Math.max(px, 0), MAX_PULL);
        indicator.style.transform = `translate(-50%, ${shown - MAX_PULL}px)`;
        indicator.style.opacity = String(Math.min(shown / PULL_THRESHOLD, 1));
        spinner.style.transform = `rotate(${shown * 3.2}deg)`;
        indicator.classList.toggle("ptr-ready", shown >= PULL_THRESHOLD);
    }

    function reset() {
        indicator.classList.remove("ptr-ready", "ptr-loading");
        indicator.style.transition = "transform 0.2s ease, opacity 0.2s ease";
        indicator.style.transform = "translate(-50%, -100%)";
        indicator.style.opacity = "0";
        window.setTimeout(() => { indicator.style.transition = ""; }, 200);
        target = null;
        startY = null;
        pulling = false;
    }

    document.addEventListener("touchstart", (e) => {
        if (refreshing || e.touches.length !== 1) return;
        target = nearestScrollable(e.target);
        if (target.scrollTop > 0) { target = null; return; }
        startY = e.touches[0].clientY;
        pulling = true;
    }, { passive: true });

    document.addEventListener("touchmove", (e) => {
        if (!pulling || startY === null || refreshing) return;
        if (target.scrollTop > 0) { pulling = false; return; }
        const delta = e.touches[0].clientY - startY;
        if (delta <= 0) { setPull(0); return; }
        indicator.style.transition = "none";
        setPull(delta * 0.55);
        if (delta > 10 && e.cancelable) e.preventDefault(); // blokuje odbicie strony podczas własnego gestu
    }, { passive: false });

    document.addEventListener("touchend", () => {
        if (!pulling) { reset(); return; }
        const ready = indicator.classList.contains("ptr-ready");
        pulling = false;
        if (!ready) { reset(); return; }

        refreshing = true;
        indicator.classList.add("ptr-loading");
        indicator.style.transition = "transform 0.2s ease";
        indicator.style.transform = `translate(-50%, ${PULL_THRESHOLD * 0.6 - MAX_PULL}px)`;
        indicator.style.opacity = "1";
        Promise.resolve()
            .then(() => onRefresh())
            .catch((err) => console.error("Błąd odświeżania danych:", err))
            .finally(() => { refreshing = false; reset(); });
    });

    document.addEventListener("touchcancel", reset);
}

// Domyślne odświeżenie: przeładowanie strony — wymusza świeże `fetch(...,
// {cache:"no-store"})` w loadData()/loadUniverseData() każdej strony i pełną
// re-inicjalizację, bez konieczności powielania logiki odświeżania osobno dla
// każdej z nich.
function initPullToRefreshDefault() {
    initPullToRefresh(() => new Promise(() => { location.reload(); }));
}

if (typeof document !== "undefined") {
    initPullToRefreshDefault();
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = { nearestScrollable };
}
