"""
Testy jednostkowe dla watchlist.py — ladowanie recznie utrzymywanej listy
obserwowanych spolek (RLC, dr Eric Wish) z watchlist.json.
"""
from watchlist import load_watchlist_entries


class TestLoadWatchlistEntries:
    def test_missing_file_returns_empty_list(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        assert load_watchlist_entries() == []

    def test_string_entries_default_to_ticker_as_yf_symbol_and_usd(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        (tmp_path / "watchlist.json").write_text('{"tickers": ["AAPL", "MSFT"]}')

        entries = load_watchlist_entries()
        assert entries == [
            {"ticker": "AAPL", "yf_symbol": "AAPL", "currency": "USD"},
            {"ticker": "MSFT", "yf_symbol": "MSFT", "currency": "USD"},
        ]

    def test_dict_entry_with_custom_yf_symbol_and_currency(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        (tmp_path / "watchlist.json").write_text(
            '{"tickers": [{"ticker": "PKN", "yf_symbol": "PKN.WA", "currency": "pln"}]}'
        )

        entries = load_watchlist_entries()
        assert entries == [{"ticker": "PKN", "yf_symbol": "PKN.WA", "currency": "PLN"}]

    def test_bare_list_without_tickers_key_is_accepted(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        (tmp_path / "watchlist.json").write_text('["AAPL"]')

        entries = load_watchlist_entries()
        assert entries == [{"ticker": "AAPL", "yf_symbol": "AAPL", "currency": "USD"}]

    def test_duplicate_tickers_keep_first_occurrence(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        (tmp_path / "watchlist.json").write_text(
            '{"tickers": [{"ticker": "AAPL", "currency": "USD"}, {"ticker": "AAPL", "currency": "PLN"}]}'
        )

        entries = load_watchlist_entries()
        assert len(entries) == 1
        assert entries[0]["currency"] == "USD"

    def test_blank_ticker_entries_are_skipped(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        (tmp_path / "watchlist.json").write_text('{"tickers": ["", "  ", "AAPL"]}')

        entries = load_watchlist_entries()
        assert [e["ticker"] for e in entries] == ["AAPL"]

    def test_malformed_json_returns_empty_list_without_raising(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        (tmp_path / "watchlist.json").write_text("{not valid json")

        assert load_watchlist_entries() == []
