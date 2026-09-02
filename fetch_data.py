import argparse
import json
import time
import pandas as pd
import duckdb
import yfinance as yf

# ============================================================================
# HOLDINGS: wyłącznie z ręcznie podmienianych plików CSV (holdings ETF-ów
# CSPX/CNDX/CIND). Próba użycia biblioteki etf_scraper została porzucona —
# pakiet okazał się niewspierany/niedziałający, więc zostajemy przy CSV jako
# jedynym, sprawdzonym źródle.
# ============================================================================
INDEX_MAP = {
    "CSPX_holdings.csv": "SP500",
    "CNDX_holdings.csv": "NASDAQ100",
    "CIND_holdings.csv": "DOWJONES"
}

# WIG20/mWIG40 (GPW): brak globalnie dostępnego ETF-a z publikowanymi holdings
# w formacie iShares (jak CSPX/CNDX/CIND) dla indeksów warszawskiej giełdy, więc
# te dwa uniwersa są zasilane ręcznie utrzymywanym plikiem JSON z samą listą
# tickerów (bez wag kapitałowych) — patrz _load_json_constituents. Tak jak
# DOWJONES, są ważone równomiernie (patrz run_query.py::EQUAL_WEIGHT_UNIVERSES).
JSON_INDEX_MAP = {
    "WIG20_holdings.json": "WIG20",
    "MWIG40_holdings.json": "MWIG40",
}

TICKER_COL_CANDIDATES = ["Ticker", "Symbol", "Holding Ticker"]
SECTOR_COL_CANDIDATES = ["Sector", "Sector Classification", "GICS Sector"]
MARKET_VALUE_COL_CANDIDATES = ["Market Value", "Notional Value"]
ASSET_CLASS_COL_CANDIDATES = ["Asset Class"]
EXCHANGE_COL_CANDIDATES = ["Exchange"]

# Tickery klas akcji uprzywilejowanych/podwojnych w plikach holdings ETF-ow (bez
# separatora, np. "BRKB") nie odpowiadaja konwencji yfinance (z myslnikiem, np.
# "BRK-B"). Bez tego mapowania takie spolki NIGDY nie dostana cen — kazde kolejne
# odswiezenie probowaloby je pobrac na nowo jako "nowe" tickery (patrz
# update_prices_incremental), bez skutku.
YFINANCE_TICKER_OVERRIDES = {
    "BRKB": "BRK-B",  # Berkshire Hathaway Class B
    "BFB": "BF-B",    # Brown-Forman Class B
}

# Tickery GPW (WIG20/mWIG40) wymagają sufiksu ".WA" w yfinance — w odróżnieniu
# od YFINANCE_TICKER_OVERRIDES (rzadkie, pojedyncze wyjątki dla klas akcji USA),
# to dotyczy WSZYSTKICH tickerów wczytanych z JSON_INDEX_MAP, więc zbiór jest
# budowany dynamicznie przy wczytywaniu — patrz _load_json_constituents.
GPW_TICKERS = set()

# Poziom INDEKSU (nie skladnikow) dla Global Equity Momentum i Sily Relatywnej —
# porownanie zwrotu calego NASDAQ100/DOWJONES miedzy soba (patrz run_query.py::
# compute_index_returns). ^NDX/^DJI to standardowe symbole yfinance dla tych
# indeksow, MAJACE pelna historyczna dana tam (patrz update_index_prices). SP500
# (^GSPC) rowniez ma pelna historie u yfinance, ale — tak jak WIG20/mWIG40 —
# celowo NIE uczestniczy w wyscigu Global Equity Momentum (patrz
# run_query.py::GEM_UNIVERSES): dodany z powrotem WYLACZNIE jako uniwersum
# momentum + ekran Sily Relatywnej (run_query.py::compute_index_momentum), bez
# zmiany istniejacego zachowania GEM. WIG20/mWIG40 maja wlasne symbole
# (WIG20.WA/MWIG40.WA) w tym slowniku wylacznie dla dokumentacji/run_query.py's
# metadanych "yf_symbol" — NIE sa nimi faktycznie pobierane (patrz
# _compute_synthetic_equal_weight_index: yfinance nie ma dla nich zadnej
# historycznej danej poziomu indeksu, w odroznieniu od SP500/NASDAQ100/DOWJONES).
INDEX_LEVEL_SYMBOLS = {
    "SP500": "^GSPC",
    "NASDAQ100": "^NDX",
    "DOWJONES": "^DJI",
    "WIG20": "WIG20.WA",
    "MWIG40": "MWIG40.WA",
}


def _to_yf_symbol(ticker):
    if ticker in GPW_TICKERS:
        return f"{ticker}.WA"
    return YFINANCE_TICKER_OVERRIDES.get(ticker, ticker)


def _find_column(df, candidates):
    for c in candidates:
        if c in df.columns:
            return c
    return None


def _parse_money(series):
    """Kolumny takie jak 'Market Value' w CSV holdings ETF-a mają liczby jako
    stringi z separatorem tysięcy (np. '12,365,349,776.05') opakowane w
    cudzysłowy. Trzeba usunąć przecinki przed konwersją na float."""
    return pd.to_numeric(
        series.astype(str).str.replace(",", "", regex=False).str.replace('"', "", regex=False),
        errors="coerce"
    )


def _load_json_constituents():
    """Wczytuje skład WIG20/mWIG40 z ręcznie utrzymywanych plików JSON (patrz
    JSON_INDEX_MAP) — sama lista tickerów GPW, bez wag kapitałowych (brak ETF-a
    z publikowanymi holdings dla tych indeksów, w odróżnieniu od CSPX/CNDX/CIND).
    fmc_etf ustawiane na stałą wartość 1.0 dla każdej spółki — nieużywana
    realnie do wagowania (WIG20/mWIG40 są ważone równomiernie, tak jak DOWJONES —
    patrz run_query.py::EQUAL_WEIGHT_UNIVERSES), a get_universe_metrics wymaga
    tylko, żeby fmc_etf NIE było NULL, by spółka kwalifikowała się do selekcji.

    Format pliku: obiekt JSON z kluczem "tickers" (lista) — każdy element to
    albo sam ticker jako string (np. "PKN"), albo obiekt {"ticker": "PKN",
    "sector": "Energy"} jeśli chcesz podać też sektor. Akceptowana jest też
    goła lista JSON zamiast obiektu z kluczem "tickers".
    """
    GPW_TICKERS.clear()
    rows = []
    for filepath, index_name in JSON_INDEX_MAP.items():
        try:
            with open(filepath, encoding="utf-8") as f:
                data = json.load(f)
        except FileNotFoundError:
            print(f"⚠️  Brak pliku {filepath} — pomijam {index_name}.")
            continue
        except Exception as e:
            print(f"❌ Błąd podczas odczytu {filepath}: {e}")
            continue

        entries = data.get("tickers", []) if isinstance(data, dict) else data
        n_before = len(rows)
        for entry in entries:
            if isinstance(entry, str):
                t, sec = entry.strip(), "Unknown"
            elif isinstance(entry, dict):
                t = str(entry.get("ticker", "")).strip()
                sec = str(entry.get("sector") or "Unknown").strip()
            else:
                continue
            if t:
                GPW_TICKERS.add(t)
                rows.append((t, index_name, sec, 1.0))
        print(f"✅ {filepath}: wczytano {len(rows) - n_before} pozycji jako {index_name}.")
    return rows


def load_index_constituents(con):
    """
    Wczytuje skład indeksów z plików holdings funduszy ETF (CSPX/CNDX/CIND),
    które podmieniasz ręcznie. Oprócz tickera i sektora, wyciąga 'Market
    Value' — realną, publikowaną wagę kapitałową danej spółki w funduszu
    replikującym dany indeks (substytut FMC — patrz wcześniejsze wyjaśnienie
    w rozmowie: dla SP500/NASDAQ100 to float-adjusted market cap, dla
    DOWJONES to waga cenowa, bo DJIA jest indeksem ważonym ceną).
    """
    con.execute("""
        CREATE TABLE IF NOT EXISTS index_constituents (
            Ticker VARCHAR,
            Index_Name VARCHAR,
            Sector VARCHAR,
            fmc_etf DOUBLE,
            PRIMARY KEY (Ticker, Index_Name)
        )
    """)
    rows = []
    for filepath, index_name in INDEX_MAP.items():
        try:
            df = pd.read_csv(filepath, skiprows=1)
        except FileNotFoundError:
            print(f"⚠️  Brak pliku {filepath} — pomijam {index_name}.")
            continue
        except Exception as e:
            print(f"❌ Błąd podczas odczytu {filepath}: {e}")
            continue

        ticker_col = _find_column(df, TICKER_COL_CANDIDATES)
        sector_col = _find_column(df, SECTOR_COL_CANDIDATES)
        mv_col = _find_column(df, MARKET_VALUE_COL_CANDIDATES)
        asset_class_col = _find_column(df, ASSET_CLASS_COL_CANDIDATES)
        exchange_col = _find_column(df, EXCHANGE_COL_CANDIDATES)

        if ticker_col is None:
            print(f"❌ Nie znaleziono kolumny z tickerem w {filepath}. Kolumny: {list(df.columns)}.")
            continue
        if sector_col is None:
            print(f"⚠️  Nie znaleziono kolumny sektora w {filepath}. Sektor = 'Unknown'.")
        if mv_col is None:
            print(f"⚠️  Nie znaleziono kolumny wartości rynkowej w {filepath} "
                  f"(sprawdzone: {MARKET_VALUE_COL_CANDIDATES}). Wagi (FMC) nie będą dostępne dla {index_name}.")
        else:
            df["_mv_parsed"] = _parse_money(df[mv_col])

        # Odfiltrowanie pozycji niebędących akcjami: gotówka, cash collateral,
        # kontrakty futures itp. — te wiersze psułyby sumę FMC uniwersum.
        if asset_class_col is not None:
            n_before_filter = len(df)
            df = df[df[asset_class_col].astype(str).str.strip().str.lower() == "equity"]
            n_filtered = n_before_filter - len(df)
            if n_filtered > 0:
                print(f"ℹ️  {filepath}: odfiltrowano {n_filtered} pozycji nie-akcyjnych "
                      f"(gotówka/futures/cash collateral).")

        # Odfiltrowanie rezydualnych udziałów bez rynku notowań (np. resztkowa
        # pozycja po wykupie/delistingu spółki) — mają znikomą wartość, status
        # Equity, ale zerowy realny wolumen, więc yfinance nigdy im nie da ceny.
        if exchange_col is not None:
            n_before_filter = len(df)
            df = df[~df[exchange_col].astype(str).str.strip().str.upper().str.startswith("NO MARKET")]
            n_filtered = n_before_filter - len(df)
            if n_filtered > 0:
                print(f"ℹ️  {filepath}: odfiltrowano {n_filtered} pozycji bez rynku notowań "
                      f"(Exchange='NO MARKET...' — najczęściej rezydualny udział po wykupie/delistingu).")

        n_before = len(rows)
        for _, row in df.iterrows():
            t = str(row[ticker_col]).strip() if pd.notna(row[ticker_col]) else None
            sec = str(row[sector_col]).strip() if sector_col and pd.notna(row[sector_col]) else "Unknown"
            mv = float(row["_mv_parsed"]) if mv_col and pd.notna(row.get("_mv_parsed")) else None
            if t and t.lower() != "nan":
                rows.append((t, index_name, sec, mv))
        print(f"✅ {filepath}: wczytano {len(rows) - n_before} pozycji jako {index_name}.")

    rows.extend(_load_json_constituents())

    if rows:
        df_const = pd.DataFrame(rows, columns=["Ticker", "Index_Name", "Sector", "fmc_etf"]).drop_duplicates(
            subset=["Ticker", "Index_Name"]
        )
        n_missing_fmc = df_const["fmc_etf"].isna().sum()
        con.execute("DELETE FROM index_constituents")
        con.execute("INSERT INTO index_constituents SELECT * FROM df_const")
        print(f"Zapisano {len(df_const)} rekordów składu indeksów "
              f"({n_missing_fmc} bez wartości FMC — zostaną pominięte przy wagowaniu).")
    else:
        print("❌ Nie wczytano żadnych składów indeksów.")


def get_unique_tickers(con):
    res = con.execute("SELECT DISTINCT Ticker FROM index_constituents").fetchall()
    return [r[0] for r in res]


def get_full_refresh_range(lookback_months):
    today = pd.Timestamp.today()
    first_day_current_month = today.replace(day=1)
    end_date = first_day_current_month - pd.Timedelta(days=1)
    start_date = end_date - pd.DateOffset(months=lookback_months)
    return start_date.strftime('%Y-%m-%d'), end_date.strftime('%Y-%m-%d')


PRICES_SCHEMA = """
    Date DATE, Ticker VARCHAR, Close DOUBLE, Adj_Close DOUBLE, Volume BIGINT,
    High DOUBLE, Low DOUBLE,
    PRIMARY KEY (Date, Ticker)
"""
# High/Low: dolozone do wolumenu/ceny zamkniecia po to, zeby run_query.py moglo
# rozbic tygodniowy wolumen na "kupujacych"/"sprzedajacych" metoda Close Location
# Value (klasyka Chaikina, ta sama co Accumulation/Distribution Line) — patrz
# _weekly_close_series(include_buying_volume=True). yfinance i tak zwraca High/Low
# w kazdym pobraniu OHLCV, wczesniej byly po prostu odrzucane.

# Ile dni wstecz od ostatniej znanej ceny dogrywać przy odświeżeniu przyrostowym —
# łapie ewentualne korekty/opóźnienia danych z yfinance, bez ryzyka luk przy
# weekendach/świętach. Nadpisywane (upsert), więc nie tworzy duplikatów.
CATCHUP_OVERLAP_DAYS = 7


def _download_price_rows(tickers, start_date, end_date, include_ohlc=False):
    """Pobiera OHLC z yfinance w paczkach po 50 tickerów dla zadanego zakresu dat.
    Zwraca (rows, fetched_tickers, failed_tickers) — sama logika sieciowa/parsująca,
    bez dotykania DuckDB, żeby dało się jej użyć zarówno przy pełnym bootstrapie,
    jak i przy przyrostowym doszacowaniu/backfillu nowych spółek, jak i przy
    (5-kolumnowych, bez High/Low) cenach poziomu indeksu (update_index_prices).

    include_ohlc=True dokłada High/Low na końcu każdego wiersza (7-krotka zamiast
    5-krotki) — używane tylko dla tabeli `prices` (per-spółka), do wyliczenia w
    run_query.py wolumenu kupujących/sprzedających metodą Close Location Value.
    `index_prices` tego nie potrzebuje, stąd domyślnie False (żeby nie zaburzać
    jej dotychczasowego, 5-kolumnowego schematu).

    Każdy ticker, który po paczkowym pobraniu nadal nie ma żadnego wiersza, jest
    dogrywany jeszcze raz POJEDYNCZO (zapytanie o jeden symbol) zanim ostatecznie
    trafi do failed_tickers. Realny przypadek, który to wykrył: update_index_prices
    prosi o ['^NDX', '^DJI', 'WIG20.WA', 'MWIG40.WA'] w JEDNYM multi-ticker zapytaniu
    — yfinance konsekwentnie zwracał "possibly delisted; no price data found" dla
    WIG20.WA/MWIG40.WA w tej mieszance (różne giełdy/waluty), mimo że te same
    symbole, pobrane osobno, mają dane — co zostawiało index_prices bez żadnego
    wiersza dla WIG20/MWIG40 i przez to wykres 10:30 (compute_relative_strength_chart,
    patrz run_query.py) zwracał None dla KAŻDEJ spółki z tych dwóch uniwersów (pusty
    index_df). Pojedyncze zapytanie per ticker to obejście tego znanego zachowania
    yfinance przy mieszanych multi-ticker requestach."""
    rows = []
    fetched_tickers = set()
    if not tickers:
        return rows, fetched_tickers, []

    def _fetch_batch(batch):
        """Pobiera jedną paczkę (może być pojedynczy ticker) i dopisuje trafienia
        do rows/fetched_tickers z otaczającego zasięgu."""
        yf_batch = [_to_yf_symbol(t) for t in batch]
        try:
            data = yf.download(tickers=yf_batch, start=start_date, end=end_date, interval="1d",
                                group_by="ticker", auto_adjust=False, threads=True)
        except Exception as e:
            print(f"❌ Błąd pobierania cen dla paczki {batch}: {e}")
            return
        for ticker, yf_symbol in zip(batch, yf_batch):
            df_t = data.copy() if len(yf_batch) == 1 else (
                data[yf_symbol].dropna(how="all") if yf_symbol in data.columns.levels[0] else pd.DataFrame()
            )
            if df_t.empty:
                continue
            for date, row in df_t.iterrows():
                if pd.notna(row.get("Close")):
                    row_tuple = (date.strftime('%Y-%m-%d'), ticker, float(row["Close"]),
                                 float(row.get("Adj Close", row["Close"])),
                                 int(row["Volume"]) if pd.notna(row.get("Volume")) else 0)
                    if include_ohlc:
                        row_tuple += (
                            float(row["High"]) if pd.notna(row.get("High")) else None,
                            float(row["Low"]) if pd.notna(row.get("Low")) else None,
                        )
                    rows.append(row_tuple)
                    fetched_tickers.add(ticker)

    batch_size = 50
    n_batches = (len(tickers) - 1) // batch_size + 1
    for i in range(0, len(tickers), batch_size):
        batch = tickers[i:i + batch_size]
        print(f"  Ceny — paczka {i // batch_size + 1}/{n_batches} ({start_date} → {end_date})...")
        _fetch_batch(batch)
        time.sleep(2)

    missing = [t for t in tickers if t not in fetched_tickers]
    if missing:
        print(f"  🔁 Ponawiam pojedynczo {len(missing)} tickerów bez danych z paczki: {missing}...")
        for ticker in missing:
            time.sleep(1)
            _fetch_batch([ticker])

    failed_tickers = [t for t in tickers if t not in fetched_tickers]
    return rows, fetched_tickers, failed_tickers


def bootstrap_prices(con, tickers, lookback_months, min_coverage):
    """Pierwsze, pełne pobranie historii cen (podmiana całej tabeli prices) —
    używane tylko gdy baza jest pusta/nie istnieje jeszcze."""
    start_date, end_date = get_full_refresh_range(lookback_months)
    print(f"🔄 Pełne pobranie cen (bootstrap): {start_date} → {end_date} dla {len(tickers)} tickerów...")

    con.execute("DROP TABLE IF EXISTS prices_staging")
    con.execute(f"CREATE TABLE prices_staging ({PRICES_SCHEMA})")

    rows, fetched_tickers, failed_tickers = _download_price_rows(tickers, start_date, end_date, include_ohlc=True)

    coverage = len(fetched_tickers) / len(tickers) if tickers else 0
    if coverage < min_coverage:
        print(f"❌ Pokrycie cen zbyt niskie ({coverage:.0%}). NIE podmieniam tabeli prices.")
        con.execute("DROP TABLE prices_staging")
        return False

    if rows:
        # df_insert wyglada jak niewykorzystana zmienna dla lintera, ale
        # DuckDB odwoluje sie do niej po nazwie wewnatrz zapytania SQL ponizej.
        df_insert = pd.DataFrame(rows, columns=["Date", "Ticker", "Close", "Adj_Close", "Volume", "High", "Low"])  # noqa: F841
        con.execute("INSERT INTO prices_staging SELECT * FROM df_insert")

    con.execute("DROP TABLE IF EXISTS prices")
    con.execute("ALTER TABLE prices_staging RENAME TO prices")
    print(f"✅ Ceny odświeżone. Pokrycie: {len(fetched_tickers)}/{len(tickers)} ({coverage:.0%}).")
    if failed_tickers:
        print(f"⚠️  Brak cen dla: {sorted(set(failed_tickers))}")
    return True


def _upsert_price_rows(con, rows, tickers, start_date):
    """Zastępuje w tabeli prices wiersze dla podanych tickerów od start_date wzwyż
    świeżo pobranymi danymi (usuń stary zakres + wstaw nowy = upsert bez konfliktu
    PRIMARY KEY). Wywoływać WYŁĄCZNIE z tickerami, dla których fetch się faktycznie
    powiódł — inaczej przy chwilowej awarii yfinance skasowalibyśmy dobre, już
    zapisane dane, nie mając czym ich zastąpić."""
    if not tickers:
        return
    con.register("_tickers_tmp", pd.DataFrame({"Ticker": tickers}))
    con.execute(f"""
        DELETE FROM prices
        WHERE Date >= DATE '{start_date}' AND Ticker IN (SELECT Ticker FROM _tickers_tmp)
    """)
    con.unregister("_tickers_tmp")
    if rows:
        df_insert = pd.DataFrame(rows, columns=["Date", "Ticker", "Close", "Adj_Close", "Volume", "High", "Low"])  # noqa: F841
        con.execute("INSERT INTO prices SELECT * FROM df_insert")


def _table_exists(con, table_name):
    return con.execute(
        "SELECT COUNT(*) FROM information_schema.tables WHERE table_name = ?", [table_name]
    ).fetchone()[0] > 0


WIG_SYNTHETIC_INDEX_BASE = 100.0  # dowolna baza — konsumenci licza wylacznie % zmiany wzgledem okna


def _compute_synthetic_equal_weight_index(con, index_name, start_date, end_date):
    """WIG20.WA/MWIG40.WA (INDEX_LEVEL_SYMBOLS) NIE MAJA u yfinance zadnej historycznej
    danej poziomu indeksu — ustalone recznie (yf.download z dowolnym zakresem/okresem
    dla tych dwoch tickerow, w tym period="1y" i Ticker().history(period="2y",
    interval="1wk"), zwraca co najwyzej JEDEN wiersz: dzisiejszy; tylko
    Ticker().fast_info dziala, dajac biezacy kurs). Ten sam zakres dla pojedynczej
    spolki-skladnika (np. PKN.WA) zwraca pelna, wielomiesieczna historie bez
    problemu — to ograniczenie dotyczy WYLACZNIE samych tickerow-indeksow w chart
    API Yahoo, nie calej gieldy warszawskiej. "possibly delisted" to mylacy
    komunikat dla "brak historii dla TEGO tickera w tym API", nie faktyczny
    delisting (fast_info nadal dziala, kwoteType='INDEX'). Retry pojedynczego
    tickera (patrz _download_price_rows) nie pomaga, bo to nie jest fluktuacja
    sieciowa/batchowa — potwierdzone wielokrotnie, w tym w osobnych przebiegach
    workflow.

    Zamiast dalej polegac na yfinance dla tych dwoch tickerow, budujemy WLASNY,
    syntetyczny poziom indeksu z cen WLASNYCH skladnikow (ktore MAJA pelna
    historie w `prices`): rownowazony (spojnie z EQUAL_WEIGHT_UNIVERSES w
    run_query.py) sredni dzienny zwrot wszystkich skladnikow z
    index_constituents, skladany od dowolnej bazy (WIG_SYNTHETIC_INDEX_BASE) —
    nie prawdziwy poziom WIG20/mWIG40, ale poprawnie oddaje KIERUNEK i SKALE
    ruchu rynku, a to jedyne, czego potrzebuja compute_index_momentum/
    compute_relative_strength_chart/compute_mansfield_rs_chart (licza wylacznie
    % zmiany wzgledem okna, nigdy bezwzglednego poziomu).

    Dziala tez w trybie --indices-only (daily_gem.yml): index_constituents/prices
    nie sa tam odswiezane (patrz update_duckdb), ale zostaja z ostatniego pelnego
    (miesiecznego) przebiegu — syntetyczny poziom po prostu nie przybywa mu nowych
    dni az do kolejnego pelnego przebiegu, zamiast byc calkowicie pusty jak
    dotychczas. Zwraca pusty DataFrame (bez rzucania wyjatku), gdy
    index_constituents/prices jeszcze nie istnieja (swiezy bootstrap) albo nie
    maja danych dla tego uniwersum w podanym oknie."""
    if not _table_exists(con, "index_constituents") or not _table_exists(con, "prices"):
        return pd.DataFrame(columns=["Date", "Index_Name", "Close", "Adj_Close", "Volume"])

    tickers = con.execute(
        "SELECT Ticker FROM index_constituents WHERE Index_Name = ?", [index_name]
    ).fetchdf()["Ticker"].tolist()
    if not tickers:
        return pd.DataFrame(columns=["Date", "Index_Name", "Close", "Adj_Close", "Volume"])

    con.register("_synth_tickers_tmp", pd.DataFrame({"Ticker": tickers}))
    prices_df = con.execute(f"""
        SELECT Date, Ticker, Close FROM prices
        WHERE Ticker IN (SELECT Ticker FROM _synth_tickers_tmp)
          AND Date BETWEEN DATE '{start_date}' AND DATE '{end_date}'
        ORDER BY Date
    """).fetchdf()
    con.unregister("_synth_tickers_tmp")
    if prices_df.empty:
        return pd.DataFrame(columns=["Date", "Index_Name", "Close", "Adj_Close", "Volume"])

    pivot = prices_df.pivot(index="Date", columns="Ticker", values="Close").sort_index()
    equal_weight_return = pivot.pct_change().mean(axis=1, skipna=True).fillna(0.0)
    level = (1.0 + equal_weight_return).cumprod() * WIG_SYNTHETIC_INDEX_BASE

    return pd.DataFrame({
        "Date": level.index, "Index_Name": index_name,
        "Close": level.values, "Adj_Close": level.values, "Volume": 0,
    })


# SP500/NASDAQ100/DOWJONES MAJA pelna historyczna dana poziomu indeksu u yfinance
# (^GSPC/^NDX/^DJI) — pobierane stamtad jak dotychczas. WIG20/MWIG40 NIE MAJA
# (patrz _compute_synthetic_equal_weight_index) — budowane syntetycznie.
YFINANCE_BACKED_INDEX_UNIVERSES = ("SP500", "NASDAQ100", "DOWJONES")
SYNTHETIC_INDEX_UNIVERSES = ("WIG20", "MWIG40")


def update_index_prices(con, lookback_months):
    """Ceny POZIOMU INDEKSU dla Global Equity Momentum i Sily Relatywnej.
    SP500/NASDAQ100/DOWJONES (YFINANCE_BACKED_INDEX_UNIVERSES) MAJA pelna
    historyczna dana u yfinance — pobierane jak dotychczas: zamiast
    przyrostowego smart-refreshu jak dla tysiaca tickerow akcji, przy kazdym
    uruchomieniu podmieniamy caly zakres na nowo (koszt pomijalny), reuzywajac
    _download_price_rows (ta sama logika batchowania/retry co ceny akcji).
    WIG20/MWIG40 (SYNTHETIC_INDEX_UNIVERSES) NIE MAJA takiej danej u yfinance
    (patrz _compute_synthetic_equal_weight_index) — budowane syntetycznie z
    wlasnych skladnikow zamiast pobierane."""
    con.execute("""
        CREATE TABLE IF NOT EXISTS index_prices (
            Date DATE, Index_Name VARCHAR, Close DOUBLE, Adj_Close DOUBLE, Volume BIGINT,
            PRIMARY KEY (Date, Index_Name)
        )
    """)
    start_date, end_date = get_full_refresh_range(lookback_months)

    yf_backed = {name: INDEX_LEVEL_SYMBOLS[name] for name in YFINANCE_BACKED_INDEX_UNIVERSES}
    yf_symbols = list(yf_backed.values())
    print(f"🔄 Ceny poziomu indeksów (Global Equity Momentum): {start_date} → {end_date} dla {yf_symbols}...")

    rows, fetched, failed = _download_price_rows(yf_symbols, start_date, end_date)
    if failed:
        print(f"⚠️  Brak danych poziomu indeksu dla: {sorted(set(failed))}")

    symbol_to_index = {v: k for k, v in yf_backed.items()}
    yfinance_backed_sql = ", ".join(f"'{name}'" for name in YFINANCE_BACKED_INDEX_UNIVERSES)
    con.execute(f"""
        DELETE FROM index_prices
        WHERE Index_Name IN ({yfinance_backed_sql}) AND Date >= DATE '{start_date}'
    """)
    if rows:
        df_insert = pd.DataFrame(rows, columns=["Date", "Ticker", "Close", "Adj_Close", "Volume"])
        df_insert["Index_Name"] = df_insert["Ticker"].map(symbol_to_index)
        df_insert = df_insert[["Date", "Index_Name", "Close", "Adj_Close", "Volume"]]  # noqa: F841
        con.execute("INSERT INTO index_prices SELECT * FROM df_insert")
    print(f"✅ Zapisano {len(rows)} wierszy danych poziomu indeksów "
          f"{'/'.join(YFINANCE_BACKED_INDEX_UNIVERSES)} ({start_date} → {end_date}).")

    for index_name in SYNTHETIC_INDEX_UNIVERSES:
        synth = _compute_synthetic_equal_weight_index(con, index_name, start_date, end_date)  # noqa: F841
        con.execute(f"DELETE FROM index_prices WHERE Index_Name = '{index_name}' AND Date >= DATE '{start_date}'")
        if synth.empty:
            print(f"⚠️  Brak danych składników do zbudowania syntetycznego indeksu {index_name}.")
            continue
        con.execute("INSERT INTO index_prices SELECT * FROM synth")
        print(f"✅ Zbudowano syntetyczny poziom indeksu {index_name}: {len(synth)} dni "
              f"(równoważony zwrot składników, baza={WIG_SYNTHETIC_INDEX_BASE}).")


EARNINGS_SCHEMA = """
    Ticker VARCHAR, Report_Date DATE, EPS_Estimate DOUBLE, EPS_Reported DOUBLE, Surprise_Pct DOUBLE,
    PRIMARY KEY (Ticker, Report_Date)
"""
# 20 (nie 4-8) zeby wykres EPS (run_query.py::compute_eps_chart) mial realny,
# wieloletni kontekst w stylu MarketSmith/IBD, nie tylko ostatni rok — yfinance
# i tak nie ma wiecej historii wynikow niz to dla wiekszosci spolek.
EARNINGS_HISTORY_LIMIT = 20
# Throttling miedzy KAZDYM pojedynczym zapytaniem o daty wynikow (patrz
# update_earnings) — w odroznieniu od cen, get_earnings_dates() nie wspiera
# batchowania wielu tickerow w jednym zapytaniu, wiec to setki osobnych zapytan;
# krotka pauza zmniejsza ryzyko throttlingu/blokady po stronie Yahoo.
EARNINGS_FETCH_SLEEP_SECONDS = 0.3


def _fetch_earnings_rows_for_ticker(yf_symbol):
    """Pobiera historię dat/EPS wyników kwartalnych DLA JEDNEGO tickera przez
    yf.Ticker(...).get_earnings_dates() — w odróżnieniu od cen (_download_price_rows),
    yfinance NIE wspiera tu batchowania wielu tickerów w jednym zapytaniu, więc każda
    spółka to osobne zapytanie sieciowe (throttling — patrz update_earnings).

    get_earnings_dates() zwraca wiersze zarówno dla PRZESZŁYCH wyników (z Reported
    EPS) jak i NADCHODZĄCYCH, wciąż tylko szacowanych terminów (Reported EPS puste) —
    zwracamy WSZYSTKIE przeszłe wiersze z realnym EPS, plus WYŁĄCZNIE najbliższy
    nadchodzący termin (jeśli Yahoo go już publikuje), żeby run_query.py mogło pokazać
    datę kolejnych wyników bez osobnego zapytania.

    Zwraca listę krotek (Report_Date jako 'YYYY-MM-DD' string, EPS_Estimate,
    EPS_Reported, Surprise_Pct) posortowaną rosnąco po dacie. Zwraca [] przy
    błędzie/braku danych (spółka bez pokrycia tego API, np. wiele tickerów GPW) —
    nie rzuca wyjątku, żeby pojedyncza spółka bez danych nie przerywała całego
    przebiegu (spójne z resztą pipeline'u)."""
    try:
        df = yf.Ticker(yf_symbol).get_earnings_dates(limit=EARNINGS_HISTORY_LIMIT)
    except Exception as e:
        print(f"  ⚠️  Brak dat wyników dla {yf_symbol}: {e}")
        return []
    if df is None or df.empty:
        return []

    reported_rows = []
    future_candidates = []
    now = pd.Timestamp.today().normalize()
    for report_date, row in df.iterrows():
        ts = pd.Timestamp(report_date)
        if ts.tzinfo is not None:
            ts = ts.tz_localize(None)
        date_str = ts.strftime("%Y-%m-%d")
        eps_est = row.get("EPS Estimate")
        eps_rep = row.get("Reported EPS")
        surprise = row.get("Surprise(%)")
        eps_est = float(eps_est) if pd.notna(eps_est) else None
        eps_rep = float(eps_rep) if pd.notna(eps_rep) else None
        surprise = float(surprise) if pd.notna(surprise) else None
        if eps_rep is not None:
            reported_rows.append((date_str, eps_est, eps_rep, surprise))
        elif ts.normalize() > now:
            future_candidates.append((ts, date_str, eps_est))

    rows = reported_rows
    if future_candidates:
        future_candidates.sort(key=lambda t: t[0])
        _, date_str, eps_est = future_candidates[0]
        rows.append((date_str, eps_est, None, None))
    return sorted(rows, key=lambda r: r[0])


def update_earnings(con, tickers):
    """Pobiera i zapisuje historię dat/EPS wyników kwartalnych (tabela `earnings`) —
    zasila wykres EPS w stylu MarketSmith/IBD (linia raportowanego EPS + pionowe
    znaczniki dat wyników, patrz run_query.py::compute_eps_chart). Wywoływane
    WYŁĄCZNIE z pełnego (nie --indices-only) przebiegu — ceny poziomu indeksu
    odświeżane codziennie (daily_gem.yml) nie potrzebują danych o wynikach.

    Upsert PER TICKER (usuń stare wiersze tego tickera, wstaw świeże) — spółka, dla
    której fetch akurat zawiódł, ZACHOWUJE swoje stare dane zamiast je tracić, tak
    samo jak przy cenach. W odróżnieniu od `prices` NIE MA tu rolling
    retencji/przycinania — tabela jest mała (garstka wierszy na spółkę), a dłuższa
    historia wyników jest tu wartością (wieloletni kontekst wykresu), nie balastem.

    yfinance nie wspiera batchowania tego zapytania (patrz
    _fetch_earnings_rows_for_ticker), więc to len(tickers) osobnych zapytań
    sieciowych z krótkim throttlingiem między nimi — zauważalnie wydłuża pełny
    (miesięczny) przebieg fetch_data.py, ale to jednorazowy koszt per uruchomienie
    workflow, nie per dzień."""
    con.execute(f"CREATE TABLE IF NOT EXISTS earnings ({EARNINGS_SCHEMA})")
    n_ok, n_failed = 0, 0
    print(f"🔄 Daty/EPS wyników kwartalnych dla {len(tickers)} tickerów (osobne zapytania, może to chwilę potrwać)...")
    for i, ticker in enumerate(tickers, start=1):
        rows = _fetch_earnings_rows_for_ticker(_to_yf_symbol(ticker))
        if rows:
            con.execute(f"DELETE FROM earnings WHERE Ticker = '{ticker}'")
            df_insert = pd.DataFrame(rows, columns=["Report_Date", "EPS_Estimate", "EPS_Reported", "Surprise_Pct"])
            df_insert.insert(0, "Ticker", ticker)  # noqa: F841
            con.execute("INSERT INTO earnings SELECT * FROM df_insert")
            n_ok += 1
        else:
            n_failed += 1
        if i % 50 == 0 or i == len(tickers):
            print(f"  ...{i}/{len(tickers)} tickerów (wyniki: {n_ok} ok, {n_failed} bez danych)")
        time.sleep(EARNINGS_FETCH_SLEEP_SECONDS)
    print(f"✅ Wyniki kwartalne: {n_ok}/{len(tickers)} spółek z danymi ({n_failed} bez pokrycia/błędu).")


def _ensure_prices_ohlc_columns(con):
    """Migracja dla baz zapisanych PRZED dodaniem High/Low do `prices` (PRICES_SCHEMA
    ma je od poczatku dla nowych/bootstrapowanych baz — to dotyczy tylko istniejacej,
    zakomitowanej momentum_data.duckdb). Idempotentne: ADD COLUMN IF NOT EXISTS. Stare
    wiersze dostaja NULL w High/Low, dopoki nie wypadna z rolling okna retencji i nie
    zostana zastapione swiezymi danymi — run_query.py's CLV liczy wtedy neutralny
    (50/50) rozklad kupujacych/sprzedajacych zamiast sie wywalac (patrz
    _weekly_close_series w run_query.py)."""
    con.execute("ALTER TABLE prices ADD COLUMN IF NOT EXISTS High DOUBLE")
    con.execute("ALTER TABLE prices ADD COLUMN IF NOT EXISTS Low DOUBLE")


def update_prices_incremental(con, tickers, retention_months):
    """Odświeżenie przyrostowe: dogrywa tylko nowe dni dla znanych tickerów (od
    ostatniej znanej ceny wstecz o CATCHUP_OVERLAP_DAYS), robi pełny backfill
    tylko dla tickerów, których jeszcze nie ma w prices (np. nowy skład indeksu
    po podmianie CSV), a na końcu przycina historię do ostatnich retention_months
    miesięcy — tak żeby baza nie rosła w nieskończoność, mając zawsze tyle
    historii, ile potrzebuje momentum_value (M-14) + margines na fallback/staleness."""
    _ensure_prices_ohlc_columns(con)
    existing_tickers = set(con.execute("SELECT DISTINCT Ticker FROM prices").df()["Ticker"]) & set(tickers)
    new_tickers = [t for t in tickers if t not in existing_tickers]
    watermark = con.execute("SELECT MAX(Date) FROM prices").fetchone()[0]
    end_date = pd.Timestamp.today().strftime('%Y-%m-%d')

    if existing_tickers:
        catchup_start = (pd.Timestamp(watermark) - pd.Timedelta(days=CATCHUP_OVERLAP_DAYS)).strftime('%Y-%m-%d')
        print(f"🔄 Doszacowanie cen: {catchup_start} → {end_date} dla {len(existing_tickers)} znanych tickerów...")
        rows, fetched, failed = _download_price_rows(sorted(existing_tickers), catchup_start, end_date, include_ohlc=True)
        _upsert_price_rows(con, rows, sorted(fetched), catchup_start)
        if failed:
            print(f"⚠️  Brak świeżych cen dla: {sorted(set(failed))} — stare dane pozostają w bazie "
                  f"(zostaną odfiltrowane przez --max-staleness-days w run_query.py, jeśli się zestarzeją).")

    if new_tickers:
        backfill_start, _ = get_full_refresh_range(retention_months)
        print(f"🆕 Pełny backfill historii dla {len(new_tickers)} nowych spółek w indeksie "
              f"({backfill_start} → {end_date})...")
        rows, fetched, failed = _download_price_rows(new_tickers, backfill_start, end_date, include_ohlc=True)
        _upsert_price_rows(con, rows, sorted(fetched), backfill_start)
        if failed:
            print(f"⚠️  Brak historii dla nowych spółek: {sorted(set(failed))}.")

    cutoff = (pd.Timestamp.today() - pd.DateOffset(months=retention_months)).strftime('%Y-%m-%d')
    n_before = con.execute("SELECT COUNT(*) FROM prices").fetchone()[0]
    con.execute(f"DELETE FROM prices WHERE Date < DATE '{cutoff}'")
    n_after = con.execute("SELECT COUNT(*) FROM prices").fetchone()[0]
    print(f"🧹 Przycięto historię cen do ostatnich {retention_months} mies. "
          f"(usunięto {n_before - n_after} wierszy starszych niż {cutoff}).")


def _prices_table_has_rows(con):
    exists = con.execute("""
        SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'prices'
    """).fetchone()[0] > 0
    if not exists:
        return False
    return con.execute("SELECT COUNT(*) FROM prices").fetchone()[0] > 0


def _prices_history_is_shallow(con, lookback_months):
    """True gdy najstarszy zachowany dzień w `prices` NIE sięga wystarczająco daleko
    wstecz dla aktualnie skonfigurowanego --lookback-months — np. baza zapisana PRZED
    wydłużeniem retencji (patrz run_query.py::RS_PRICE_SMA_LONG_WEEKS/RS_MANSFIELD_*:
    SMA30 i oscylator Mansfield potrzebują realnego zapasu historii PRZED początkiem
    okna momentum, nie tylko samego okna). Zwykłe przyrostowe doszacowanie
    (update_prices_incremental) dogrywa dni WYŁĄCZNIE od watermarka w przód, nigdy w
    tył — więc samo podniesienie --lookback-months nie pogłębi już zapisanej historii
    bez jednorazowego pełnego re-bootstrapu, do którego ta funkcja jest sygnałem.
    Samoograniczające się: po jednym pełnym bootstrapie z nową głębią kolejne
    uruchomienia znów dostają False i wracają na zwykłą ścieżkę przyrostową. Margines
    14 dni, żeby nie re-bootstrapować przy różnicy rzędu pojedynczych dni (np. z
    powodu weekendu/święta na granicy okna)."""
    oldest = con.execute("SELECT MIN(Date) FROM prices").fetchone()[0]
    if oldest is None:
        return True
    needed_start = pd.Timestamp.today() - pd.DateOffset(months=lookback_months)
    return pd.Timestamp(oldest) > needed_start + pd.Timedelta(days=14)


def update_duckdb(lookback_months=22, min_coverage=0.8, indices_only=False, skip_earnings=False):
    con = duckdb.connect("momentum_data.duckdb")

    if indices_only:
        # Tylko poziom indeksu (^GSPC/^NDX/^DJI z yfinance + WIG20/MWIG40 syntetycznie
        # z ostatnich znanych cen skladnikow) dla Global Equity Momentum i Sily Relatywnej —
        # pomija skladniki (CSV + setki tickerow z yfinance), zeby moc odswiezac to
        # codziennie bez kosztu/limitow pelnego pobrania cen akcji (patrz workflow
        # daily_gem.yml — GEM ma byc aktualny codziennie, nie tylko raz w miesiacu).
        update_index_prices(con, lookback_months)
        con.close()
        return

    load_index_constituents(con)
    tickers = get_unique_tickers(con)
    if not tickers:
        print("❌ Brak tickerów. Przerywam.")
        con.close()
        return

    if _prices_table_has_rows(con) and not _prices_history_is_shallow(con, lookback_months):
        update_prices_incremental(con, tickers, retention_months=lookback_months)
    else:
        if _prices_table_has_rows(con):
            print(f"⏳ Zachowana historia cen nie sięga {lookback_months} mies. wstecz "
                  f"(rozszerzono retencję) — jednorazowy pełny re-bootstrap zamiast "
                  f"przyrostowego doszacowania (bootstrap_prices sam podmienia całą tabelę).")
        bootstrap_prices(con, tickers, lookback_months, min_coverage)

    update_index_prices(con, lookback_months)

    if skip_earnings:
        print("⏭️  Pomijam pobranie dat/EPS wyników kwartalnych (--skip-earnings).")
    else:
        update_earnings(con, tickers)

    con.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Odświeża bazę cen (bootstrap za pierwszym razem, potem przyrostowo: "
                     "dogrywa nowe dni + przycina historię do --lookback-months) i skład indeksów (CSV)."
    )
    parser.add_argument("--lookback-months", type=int, default=22,
                         help="Ile miesięcy historii cen trzymać w bazie (retencja) oraz zakres "
                              "pierwszego pełnego pobrania / backfillu nowych spółek. 22 (nie 15) "
                              "daje SMA30/oscylatorowi Mansfield realny zapas historii PRZED "
                              "początkiem ~14-miesięcznego okna momentum, patrz run_query.py.")
    parser.add_argument("--min-coverage", type=float, default=0.8,
                         help="Minimalne pokrycie tickerów wymagane przy PIERWSZYM (bootstrap) pobraniu.")
    parser.add_argument("--indices-only", action="store_true",
                         help="Odśwież WYŁĄCZNIE ceny poziomu indeksu (^GSPC/^NDX/^DJI z yfinance, WIG20/MWIG40 "
                              "syntetycznie) dla Global Equity "
                              "Momentum — pomija skład indeksów i ceny wszystkich składników. Do użycia w "
                              "codziennym workflow (patrz daily_gem.yml), osobno od pełnego miesięcznego "
                              "odświeżenia.")
    parser.add_argument("--skip-earnings", action="store_true",
                         help="Pomiń pobranie dat/EPS wyników kwartalnych (tabela `earnings`, zasila wykres EPS "
                              "w run_query.py). Przydatne przy lokalnym/szybkim teście pipeline'u — get_earnings_dates() "
                              "to osobne zapytanie PER TICKER (bez batchowania), więc zauważalnie wydłuża przebieg. "
                              "Bez wpływu na --indices-only, który i tak zawsze pomija wyniki.")
    args = parser.parse_args()
    update_duckdb(lookback_months=args.lookback_months, min_coverage=args.min_coverage,
                  indices_only=args.indices_only, skip_earnings=args.skip_earnings)
