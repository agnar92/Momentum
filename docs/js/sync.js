// ============================================================
// SYNCHRONIZACJA ADNOTACJI MIĘDZY URZĄDZENIAMI (prywatny Gist GitHub).
// Własne linie, cupy, alerty i notatki (annStore) oraz ulubione ★ i własny score (prefsStore, scalane przez mergePrefs) leżą w jednym pliku JSON w sekretnym Gistcie użytkownika; localStorage jest
// tylko lokalną kopią. Token (uprawnienie „gist”) i id Gista są w localStorage tego urządzenia. Scalanie: mergeStores
// (annotate.js) — po id linii, z nagrobkami usunięć, więc nic nie ginie przy edycji na dwóch urządzeniach.
// Zapis jest automatyczny (2 s po zmianie), odczyt przy otwarciu strony, powrocie do karty i co kilka minut.
// ============================================================

const SYNC_KEY = "momentum_watchlist_sync";
const SYNC_FILE = "momentum-annotations.json";
const SYNC_DESC = "Momentum watchlist — linie, cupy i alerty (synchronizacja)";
const SYNC_API = "https://api.github.com";
const SYNC_DEBOUNCE_MS = 2000;
const SYNC_POLL_MS = 3 * 60 * 1000;

const syncState = { token: "", gistId: "", status: "off", detail: "", at: null, busy: false, again: false, auth: false, timer: null, onChange: () => {} };

function syncLoadConfig() {
    try {
        const c = JSON.parse(localStorage.getItem(SYNC_KEY) || "{}");
        syncState.token = c.token || "";
        syncState.gistId = c.gistId || "";
    } catch (e) { /* brak zapisu */ }
    syncState.status = syncState.token ? "idle" : "off";
}

function syncSaveConfig() {
    try {
        if (syncState.token) localStorage.setItem(SYNC_KEY, JSON.stringify({ token: syncState.token, gistId: syncState.gistId }));
        else localStorage.removeItem(SYNC_KEY);
    } catch (e) { /* brak localStorage */ }
}

async function syncApi(path, opts = {}) {
    const res = await fetch(path.startsWith("http") ? path : SYNC_API + path, {
        ...opts,
        headers: {
            Accept: "application/vnd.github+json",
            Authorization: "Bearer " + syncState.token,
            ...(opts.body ? { "Content-Type": "application/json" } : {}),
        },
    });
    if (res.status === 401) syncState.auth = true;
    if (res.status === 401) throw new Error("Token nieprawidłowy lub wygasł — utwórz nowy (Expiration: No expiration) i wklej go ponownie; dane są bezpieczne lokalnie i w Gistcie.");
    if (res.status === 403 || res.status === 429) throw new Error("GitHub odmówił (limit zapytań lub brak uprawnień „gist”).");
    if (res.status === 404 && syncState.gistId) throw new Error("Nie znaleziono Gista — połącz ponownie.");
    if (!res.ok) throw new Error("Błąd GitHub " + res.status);
    return res;
}

// Szuka własnego Gista po nazwie pliku (np. po wyczyszczeniu localStorage i ponownym wklejeniu tokenu).
async function syncFindGist() {
    for (let page = 1; page <= 5; page++) {
        const list = await (await syncApi(`/gists?per_page=100&page=${page}`)).json();
        const hit = list.find(g => g.files && g.files[SYNC_FILE]);
        if (hit) return hit.id;
        if (list.length < 100) break;
    }
    return "";
}

async function syncReadRemote() {
    const g = await (await syncApi("/gists/" + syncState.gistId)).json();
    const f = g.files && g.files[SYNC_FILE];
    if (!f) return { annotations: {}, prefs: null };
    const text = f.truncated ? await (await fetch(f.raw_url)).text() : f.content;
    const data = JSON.parse(text || "{}");
    return { annotations: data && typeof data.annotations === "object" ? data.annotations : {}, prefs: data && data.prefs ? data.prefs : null };
}

// annotations = linie/cupy/alerty/notatki, prefs = ulubione ★ i własny score
function syncPayload(store, prefs) {
    return JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), annotations: store, prefs });
}

function syncSetStatus(status, detail) {
    syncState.status = status;
    syncState.detail = detail || "";
    if (status === "ok") syncState.at = new Date();
    syncRenderStatus();
}

// Jeden cykl: pobierz -> scal -> (jeśli coś różni się od Gista) zapisz. Nigdy nie wysyła mniej danych niż jest w Gistcie.
async function syncNow() {
    if (!syncState.token) return;
    if (syncState.busy) { syncState.again = true; return; }
    syncState.busy = true;
    syncState.auth = false;
    syncSetStatus("busy");
    try {
        if (!syncState.gistId) {
            syncState.gistId = await syncFindGist();
            syncSaveConfig();
        }
        let remote = { annotations: {}, prefs: null };
        if (syncState.gistId) remote = await syncReadRemote();
        const merged = mergeStores(annStore, remote.annotations);
        const mergedPrefs = mergePrefs(prefsStore, remote.prefs);
        const annChanged = JSON.stringify(merged) !== JSON.stringify(annStore);
        const prefsChanged = JSON.stringify(mergedPrefs) !== JSON.stringify(prefsNormalize(prefsStore));
        const localChanged = annChanged || prefsChanged;
        if (annChanged) {
            annStore = merged;
            annWriteLocal();
        }
        if (prefsChanged) {
            prefsStore = mergedPrefs;
            prefsWriteLocal();
            prefsApply();
        }
        if (!syncState.gistId) {
            const g = await (await syncApi("/gists", { method: "POST", body: JSON.stringify({ description: SYNC_DESC, public: false, files: { [SYNC_FILE]: { content: syncPayload(merged, mergedPrefs) } } }) })).json();
            syncState.gistId = g.id;
            syncSaveConfig();
        } else if (JSON.stringify(merged) !== JSON.stringify(remote.annotations) || JSON.stringify(mergedPrefs) !== JSON.stringify(prefsNormalize(remote.prefs))) {
            await syncApi("/gists/" + syncState.gistId, { method: "PATCH", body: JSON.stringify({ files: { [SYNC_FILE]: { content: syncPayload(merged, mergedPrefs) } } }) });
        }
        syncSetStatus("ok");
        if (localChanged && !annEdit.pending.length) syncState.onChange();
    } catch (e) {
        syncSetStatus("error", e.message || String(e));
    } finally {
        syncState.busy = false;
        if (syncState.again) { syncState.again = false; syncSchedule(); }
    }
}

function syncSchedule() {
    if (!syncState.token) return;
    clearTimeout(syncState.timer);
    syncState.timer = setTimeout(syncNow, SYNC_DEBOUNCE_MS);
}

async function syncConnect(token) {
    syncState.token = token.trim();
    syncState.gistId = "";
    syncSaveConfig();
    await syncNow();
    if (syncState.status === "error") { const msg = syncState.detail; syncDisconnect(); syncSetStatus("error", msg); }
}

function syncDisconnect() {
    syncState.token = ""; syncState.gistId = "";
    clearTimeout(syncState.timer);
    syncSaveConfig();
    syncSetStatus("off");
}

// ---------- panel w zakładce Alerty ----------

function syncRenderStatus() {
    const btn = document.getElementById("syncBtn");
    if (!btn) return;
    const t = syncState.at ? syncState.at.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" }) : "";
    btn.textContent = { off: "☁ Synchronizacja: wyłączona", idle: "☁ Synchronizacja", busy: "☁ Synchronizuję…", ok: "☁ Zsynchronizowano " + t, error: "☁ Błąd synchronizacji" }[syncState.status];
    btn.classList.toggle("sync-error", syncState.status === "error");
    const info = document.getElementById("syncInfo");
    if (info) info.textContent = syncState.status === "error" ? syncState.detail : "";
    const on = !!syncState.token;
    // po błędzie (np. wygasły token) formularz jest znów widoczny, żeby wkleić nowy token
    const setup = document.getElementById("syncSetup");
    if (setup) setup.hidden = on && !syncState.auth;
    const panel = document.getElementById("syncPanel");
    if (panel && syncState.auth) panel.hidden = false;
    ["syncNowBtn", "syncOffBtn"].forEach(id => { const el = document.getElementById(id); if (el) el.hidden = !on; });
}

function syncInit(onChange) {
    syncState.onChange = onChange;
    annOnSave = syncSchedule;
    syncLoadConfig();
    const $ = id => document.getElementById(id);
    if ($("syncBtn")) {
        $("syncBtn").addEventListener("click", () => { $("syncPanel").hidden = !$("syncPanel").hidden; });
        $("syncConnect").addEventListener("click", async () => {
            const v = $("syncToken").value.trim();
            if (!v) { syncSetStatus("error", "Wklej token."); return; }
            await syncConnect(v);
            if (syncState.status === "ok") { $("syncToken").value = ""; $("syncPanel").hidden = true; showToast("Synchronizacja włączona."); }
        });
        $("syncNowBtn").addEventListener("click", syncNow);
        $("syncOffBtn").addEventListener("click", () => { if (confirm("Wyłączyć synchronizację na tym urządzeniu? Dane zostają w Gistcie i lokalnie.")) syncDisconnect(); });
    }
    syncRenderStatus();
    if (syncState.token) syncNow();
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") syncNow(); });
    window.addEventListener("online", syncNow);
    setInterval(() => { if (document.visibilityState === "visible") syncNow(); }, SYNC_POLL_MS);
}
