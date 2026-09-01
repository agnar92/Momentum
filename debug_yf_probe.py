import yfinance as yf

symbols = ["WIG20.WA", "MWIG40.WA"]

def sep(msg):
    print("\n" + "="*70)
    print(msg)
    print("="*70)

for sym in symbols:
    sep(f"{sym}: yf.download start/end 15mo")
    try:
        df = yf.download(sym, start="2025-05-31", end="2026-08-31", interval="1d", auto_adjust=False)
        print("shape:", df.shape, "empty:", df.empty)
        if not df.empty:
            print(df.head(2)); print(df.tail(2))
    except Exception as e:
        print("EXC:", repr(e))

    sep(f"{sym}: yf.download period=1y")
    try:
        df = yf.download(sym, period="1y", interval="1d", auto_adjust=False)
        print("shape:", df.shape, "empty:", df.empty)
        if not df.empty:
            print(df.head(2)); print(df.tail(2))
    except Exception as e:
        print("EXC:", repr(e))

    sep(f"{sym}: yf.download period=1mo")
    try:
        df = yf.download(sym, period="1mo", interval="1d", auto_adjust=False)
        print("shape:", df.shape, "empty:", df.empty)
        if not df.empty:
            print(df.head(2)); print(df.tail(2))
    except Exception as e:
        print("EXC:", repr(e))

    sep(f"{sym}: Ticker().history(period='5d')")
    try:
        t = yf.Ticker(sym)
        df = t.history(period="5d")
        print("shape:", df.shape, "empty:", df.empty)
        if not df.empty:
            print(df.tail(3))
    except Exception as e:
        print("EXC:", repr(e))

    sep(f"{sym}: Ticker().history(period='2y', interval='1wk')")
    try:
        t = yf.Ticker(sym)
        df = t.history(period="2y", interval="1wk")
        print("shape:", df.shape, "empty:", df.empty)
        if not df.empty:
            print(df.head(2)); print(df.tail(2))
    except Exception as e:
        print("EXC:", repr(e))

    sep(f"{sym}: Ticker().fast_info")
    try:
        t = yf.Ticker(sym)
        print(dict(t.fast_info))
    except Exception as e:
        print("EXC:", repr(e))

# Also sanity-check a known-good individual GPW stock ticker for comparison
sep("PKN.WA (individual stock, control): yf.download start/end 15mo")
try:
    df = yf.download("PKN.WA", start="2025-05-31", end="2026-08-31", interval="1d", auto_adjust=False)
    print("shape:", df.shape, "empty:", df.empty)
    if not df.empty:
        print(df.head(2)); print(df.tail(2))
except Exception as e:
    print("EXC:", repr(e))
