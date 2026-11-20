# Momentum — jakość vs wycena

Statyczna strona (GitHub Pages, `docs/`) do szukania **jakościowych spółek wzrostowych**, które na tle rynku są wyraźnie lepsze, i do sprawdzania,
czy ich cena jest rozsądna (PEG i DCF). Obejmuje 500 największych spółek notowanych w USA, dane odświeżane co tydzień.

- **Lista spółek** (`index.html`): oceny 0–10 na tle sektora — wzrost, siła finansowa, wycena i ocena ogólna; typ spółki (kategorie Petera Lyncha);
  PEG, potencjał DCF i etykieta wyceny; dopasowanie do strategii z badania (7/7, Jakość, Konsekwentny wzrost); zwrot 1 rok; filtry, sortowanie, obserwowane ★.
- **Karta spółki** (`spolka.html?t=NVDA`): podsumowanie, pasek wyceny, typ spółki, oceny, cena 1 rok / 5 lat, wskaźniki z porównaniem do sektora,
  checklisty strategii, **wycena PEG** (EPS i oczekiwany wzrost do edycji, scenariusze) i **DCF** (wzrost przychodów, lata, marża FCF, stopa dyskonta,
  wzrost długoterminowy do edycji; scenariusze; co zakłada dzisiejsza cena), sprawozdania kwartalne / 12 mies. / roczne (przychody, zysk, FCF, gotówka i dług).
- **Metoda** (`metoda.html`): wszystkie wzory i progi.

Dane: Finviz (wskaźniki bieżące, prognozy EPS), SEC EDGAR (historia raportów), Yahoo Finance (ceny). Informacyjnie, nie rekomendacja.

## Uruchomienie

```bash
pip install -r requirements.txt -r requirements-dev.txt
python spolki.py                 # pobiera dane -> docs/data/
cd docs && python3 -m http.server
python -m pytest -q && ruff check .
npm ci && npm test && npm run lint
```

Workflow **Dane spółek** (`.github/workflows/dane.yml`) robi to co tydzień i publikuje stronę. Katalog `research/` to badania, z których wzięły się kryteria strategii.
