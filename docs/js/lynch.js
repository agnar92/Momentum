/* Strategia Petera Lyncha krok po kroku + kandydaci wg typów (z lista.json: lz / ls / lu / lw z ocena.lynch_skrot).
   Teksty: streszczenia zasad z jego książek (stałe, nie generowane). Progi cen dla typów jak W.CENA_TYPU. */
(function () {
    const W = window.W;
    const $ = (id) => document.getElementById(id);
    const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
    const TYPY = [
        ["Szybko rosnąca", "Małe i średnie firmy rosnące 20–25 % rocznie. Tu są „dziesięciokrotne” spółki — i największe straty, gdy wzrost się kończy.",
            "PEG ok. 1 lub mniej; uważaj na P/E wyraźnie ponad tempo wzrostu.", "Gdy kończy się miejsce na ekspansję (sprzedaż w tych samych sklepach / produktach hamuje), P/E skacze do absurdalnych poziomów, odchodzą kluczowi ludzie."],
        ["Stabilnie rosnąca", "Duże, solidne firmy rosnące 10–12 % rocznie. Nie zrobią fortuny, ale chronią portfel w recesji.",
            "Kupuj przy rozsądnym P/E (PEG ≤ ok. 1,5); zysk 30–50 % w rok lub dwa to dobry wynik.", "Po wzroście 30–50 %, gdy historia się nie zmieniła — rozważ zamianę na inną, tańszą stabilnie rosnącą; gdy sprzedaż hamuje lub P/E odbiega wysoko od normy."],
        ["Wolno rosnąca", "Duże, dojrzałe firmy rosnące niewiele szybciej niż gospodarka. Kupuje się je dla dywidendy.",
            "Liczy się wysoka i bezpieczna dywidenda, wypłacana i podnoszona od lat.", "Gdy dywidenda jest zagrożona (wypłata przekracza zysk), firma traci udział w rynku albo „dyworsyfikuje” przejęciami."],
        ["Cykliczna", "Zyski rosną i spadają razem z gospodarką (auta, linie lotnicze, chemia, półprzewodniki).",
            "Niskie P/E to pułapka — przy szczycie zysków P/E jest najniższe. Kupuj, gdy zyski są w dołku, a widać pierwsze oznaki poprawy.", "Pod koniec cyklu: rosną zapasy, spadają ceny, firma buduje nowe moce, popyt słabnie."],
        ["Wychodząca z kłopotów", "Firma po stratach lub kryzysie, która może wrócić do zysków.",
            "Kluczowe: czy przetrwa (gotówka vs dług, jaki to dług) i czy plan naprawy już działa.", "Gdy naprawa się udała i spółka stała się „normalna” — oceń ją od nowa jak zwykłą spółkę."],
        ["Ukryte aktywa", "Wartość w aktywach, których rynek nie widzi (gotówka, ziemia, marki, udziały w innych firmach).",
            "Porównaj wartość aktywów z kapitalizacją; ważne, by nie było dużego długu, który je „zje”.", "Gdy rynek uzna wartość aktywów albo pojawi się nowe zadłużenie lub emisje akcji."],
    ];
    const KROKI = [
        ["Szukaj tam, gdzie masz przewagę", `<p>„Inwestuj w to, co znasz”: produkty, z których korzystasz, branża, w której pracujesz, sklepy, które są zawsze pełne. To dopiero <b>początek</b>, nie powód do zakupu — dalej trzeba sprawdzić firmę.</p>
            <p class="mut male">Na stronie: <a href="index.html">lista 500 spółek</a> z filtrami (sektor, typ, 🏰, Siła ≥ 7, 💰). Szukaj firm, których działalność umiesz wyjaśnić w kilku zdaniach.</p>`],
        ["Przypisz spółkę do jednego z sześciu typów", null],
        ["Opowiedz historię w dwie minuty", `<p>Zanim kupisz, powiedz sobie na głos: <b>dlaczego ta spółka mnie interesuje, co musi się wydarzyć, żeby zarobiła, i co może pójść źle</b>. Jeśli nie potrafisz — nie kupuj.</p>
            <p class="mut male">Na karcie spółki: krok „Werdykt” → „Twoja notatka” (szablon pytań: na czym firma zarabia, czy to firma jednego produktu, jak długo potrwa przewaga, co może zepsuć biznes).</p>`],
        ["Sprawdź liczby, które się liczą", `<p>Udział głównego produktu w sprzedaży · P/E na tle wzrostu i własnej historii · gotówka netto na akcję · dług i jego rodzaj · dywidendy · wartość księgowa i ukryte aktywa · przepływy pieniężne · zapasy względem sprzedaży · tempo wzrostu zysku · marża przed opodatkowaniem na tle branży.</p>
            <p class="mut male">Na karcie spółki: „Więcej: pełny scoring i szczegóły” → sekcja Lyncha („Liczby, które się liczą”, lista kontrolna przed zakupem, 13 cech idealnej spółki).</p>`],
        ["Sprawdź cenę", `<p><b>PEG</b> (P/E ÷ wzrost zysku): ok. 1 = cena uczciwa, ok. 0,5 = okazja, 2 i więcej = drogo. <b>Wskaźnik Lyncha z dywidendą</b> = (wzrost zysku % + stopa dywidendy %) ÷ P/E: poniżej 1 słabo, 1,5 przyzwoicie, 2 i więcej bardzo dobrze. Unikaj spółek z P/E skrajnie wysokim — nawet świetna firma kupiona za drogo daje lata czekania.</p>
            <p class="mut male">PEG nie dotyczy spółek cyklicznych. Lynch traktował cenę jako sprawdzian „czy nie przepłacam”, a nie jako powód do zakupu. Na karcie: krok „Wycena” (PEG, P/E na tle 5 lat, ile może zarobić akcjonariusz).</p>`],
        ["Czego unikać", `<p>Najgorętszej spółki w najgorętszej branży · „następnego Microsoftu / IBM” · „dyworsyfikacji” (przejęć poza głównym biznesem) · spółek-szeptów bez zysku z wielką historią · firm zależnych od jednego klienta · spółek kupowanych tylko dlatego, że spadły.</p>
            <p class="mut male">Na karcie: lista „Czego unikać” (✗ = ostrzeżenie) i kolumna „Przeciw” w „Werdykcie”.</p>`],
        ["Zbuduj portfel", `<p>Mały inwestor nie potrzebuje wielu spółek — lepiej kilka, które naprawdę znasz (Lynch: kilka do kilkunastu). Każda musi mieć swoją historię.
              <b>Mieszaj typy</b>: stabilnie rosnące dają spokój w gorszych latach, szybko rosnące — szansę na duży zysk, cykliczne i wychodzące z kłopotów — okazje w odpowiednim momencie; wolno rosnące — głównie dywidendę.
              Dokładaj do spółek, których historia się poprawia, a nie do tych, które tylko spadły („nie wyrywaj kwiatów, żeby podlewać chwasty”). Inwestuj regularnie, nie zgaduj ruchów rynku.</p>
            <p class="mut male">Na stronie: <a href="portfel.html">Portfel</a> — Twój skład wg typów Lyncha, cel 10 % konta na spółkę i Twoje zasady dokupu (ustalasz je sam).</p>`],
        ["Pilnuj historii i sprzedawaj z powodu, nie z nerwów", `<p>Co kilka miesięcy (Lynch: mniej więcej co pół roku) sprawdź, czy historia jest aktualna. Sprzedawaj, gdy <b>historia się psuje</b> — nie dlatego, że kurs spadł albo „już dość urósł”. Sygnały sprzedaży są inne dla każdego typu (krok 2).</p>
            <p class="mut male">Na karcie: lista „Kiedy sprzedać” dla typu spółki (⚠); znacznik ⬇ = przychody lub zysk spadają 2 lata z rzędu. W portfelu: przypomnienie o przeglądzie po 6 miesiącach i ostrzeżenie, gdy typ spółki zmienił się od zakupu.</p>`],
    ];
    function typyTab() {
        return `<div class="ly-typy">${TYPY.map(([t, a, b, c]) => `<div class="ly-typ"><b>${esc(t)}</b><div class="male">${esc(a)}</div>
            <div class="male"><span class="mut">Cena:</span> ${esc(b)}</div><div class="male"><span class="mut">Kiedy sprzedać:</span> ${esc(c)}</div></div>`).join("")}</div>
          <p class="mut male">Typ każdej spółki jest na jej karcie (krok „Typ”, z dopasowaniem do pozostałych typów) i w kolumnie „Typ” na liście. Oprócz tego: 🏛 „Duży zwycięzca” — Twoja kategoria spółek rosnących od 10 lat.</p>`;
    }
    function kroki() {
        $("kroki").innerHTML = KROKI.map(([t, h], i) => `<details class="objasnienie" ${i < 2 ? "open" : ""}><summary><b>${i + 1}. ${esc(t)}</b></summary><div style="margin-top:6px">${h || typyTab()}</div></details>`).join("");
    }
    // sito kandydatów: bez ⬇, bez sygnałów sprzedaży Lyncha (ls), bez ostrzeżeń „czego unikać” (lu), nie na szczycie cyklu; cena wg typu jak W.CENA_TYPU
    const pegOk = (r, max) => W.ok(r.peg) && r.peg > 0 && r.peg <= max;
    const SITA = [
        ["Szybko rosnąca", (r) => r.typ === "Szybko rosnąca" && !r.cy && !W.duzy(r) && pegOk(r, 1.6), "PEG ≤ 1,6"],
        ["Stabilnie rosnąca", (r) => r.typ === "Stabilnie rosnąca" && !W.duzy(r) && pegOk(r, 1.5), "PEG ≤ 1,5"],
        ["Duży zwycięzca (10+ lat)", (r) => W.duzy(r) && pegOk(r, 2), "PEG ≤ 2"],
        ["Wolno rosnąca", (r) => r.typ === "Wolno rosnąca" && !W.duzy(r) && !!r.dw && W.ok(r.div) && r.div > 0, "stabilna dywidenda 💰"],
        ["Cykliczna", (r) => !!r.cy && !r.csz, "spółka naprawdę cykliczna (≥ 2 spadki przychodów i zysku w 10 latach), bez ostrzeżenia o szczycie cyklu — fazę cyklu sprawdź sam"],
        ["Wychodząca z kłopotów", (r) => r.typ === "Wychodząca z kłopotów" && W.ok(r.de) && r.de >= 0 && r.de < 1, "dług / kapitał < 1 (przetrwa)"],
        ["Ukryte aktywa", (r) => r.typ === "Ukryte aktywa", "—"],
    ];
    const odznaki = (r) => (W.jakosc77(r) ? ' <span class="jakosc" title="Jakość 7/7">✔</span>' : "") + (r.bf ? ' <span title="Przewaga Buffetta">🏰</span>' : "")
        + (r.dw ? ' <span title="Stabilna dywidenda">💰</span>' : "") + (r.ik ? ' <span title="Zarząd kupuje akcje">👤</span>' : "") + (r.ow ? ` <span title="Ostrzeżenia na karcie">❗${r.ow}</span>` : "");
    function kandydaci(rows) {
        const baza = rows.filter((r) => !r.sp && !r.ls && !r.lu && r.lz);
        $("kandydaci-pod").innerHTML = `Sito z liczb: spółki bez znacznika ⬇, bez sygnałów sprzedaży Lyncha dla swojego typu i bez ostrzeżeń „czego unikać”, z ceną odpowiednią dla typu.
          Kolejność: najwięcej spełnionych punktów listy kontrolnej Lyncha przed zakupem, potem ocena ogólna (jakość). Do ${8} spółek na typ. Punkty „oceń sam” (znasz produkt? główny produkt?) sprawdzasz na karcie.`;
        $("kandydaci").innerHTML = SITA.map(([typ, f, cena]) => {
            const l = baza.filter(f).sort((a, b) => (b.lz[0] / b.lz[1]) - (a.lz[0] / a.lz[1]) || ((b.o && b.o.ogolna) || 0) - ((a.o && a.o.ogolna) || 0)).slice(0, 8);
            return `<h3 style="margin:16px 0 4px">${esc(typ)} <span class="mut male">· cena: ${esc(cena)} · ${l.length ? `${l.length} spółek` : "dziś brak"}</span></h3>
              ${l.length ? `<div class="przewin"><table class="male"><thead><tr><th>Spółka</th><th class="n">Lista Lyncha</th><th class="n">PEG</th><th class="n">P/E</th><th class="n">Wskaźnik Lyncha</th><th class="n">Dywidenda</th><th class="n">Ocena ogólna</th></tr></thead><tbody>
              ${l.map((r) => `<tr><td><a href="spolka.html?t=${encodeURIComponent(r.t)}"><b>${esc(r.t)}</b></a>${odznaki(r)}<br><span class="mut">${esc(r.n)}</span></td>
                <td class="n">${r.lz[0]} z ${r.lz[1]}</td><td class="n">${W.ok(r.peg) && r.peg > 0 ? W.fmtNum(r.peg) : "–"}</td><td class="n">${W.ok(r.pe) && r.pe > 0 ? W.fmtNum(r.pe, 1) : "–"}</td>
                <td class="n">${W.ok(r.lw) ? W.fmtNum(r.lw, 2) : "–"}</td><td class="n">${W.ok(r.div) && r.div > 0 ? W.fmtPct(r.div, 1) : "–"}</td><td class="n">${r.o && W.ok(r.o.ogolna) ? W.fmtNum(r.o.ogolna, 1) : "–"}</td></tr>`).join("")}</tbody></table></div>` : ""}`;
        }).join("");
    }
    kroki();
    fetch("data/lista.json", { cache: "no-cache" }).then((r) => r.json()).then((d) => {
        $("asof").textContent = d.generated_at || "–";
        kandydaci(d.rows || []);
    }).catch(() => { $("kandydaci").innerHTML = '<p class="mut">Nie udało się wczytać danych.</p>'; });
})();
