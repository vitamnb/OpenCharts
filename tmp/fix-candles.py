import psycopg2, json, uuid, time, datetime
conn = psycopg2.connect(host="localhost", port=5432, database="jesse_db", user="jesse_user", password="password")
cur = conn.cursor()

# Check what candle data exists
cur.execute("SELECT exchange, symbol, timeframe, MIN(timestamp), MAX(timestamp), COUNT(*) FROM candle GROUP BY exchange, symbol, timeframe")
rows = cur.fetchall()
for r in rows:
    exchange, symbol, tf, min_ts, max_ts, count = r
    min_dt = datetime.datetime.fromtimestamp(min_ts/1000, tz=datetime.timezone.utc)
    max_dt = datetime.datetime.fromtimestamp(max_ts/1000, tz=datetime.timezone.utc)
    print(f"{exchange} {symbol} {tf}: {min_dt} to {max_dt} ({count} candles)")

# Generate 1h candles from 1m data for the gap (Jan 20 to Jan 30)
cur.execute("""
    SELECT timestamp, open, close, high, low, volume
    FROM candle
    WHERE exchange='Binance Perpetual Futures' AND symbol='BTC-USDT' AND timeframe='1m'
    AND timestamp >= 1737331200000 AND timestamp < 1738243200000
    ORDER BY timestamp ASC
""")
minutes = cur.fetchall()
print(f"\n1m candles in gap range: {len(minutes)}")

# Aggregate into 1h candles
from collections import defaultdict
hours = defaultdict(list)
for ts, o, c, h, l, v in minutes:
    hour_ts = (ts // 3600000) * 3600000
    hours[hour_ts].append((ts, o, c, h, l, v))

inserted = 0
for hour_ts, candles in sorted(hours.items()):
    candles.sort(key=lambda x: x[0])
    open_price = candles[0][1]
    close_price = candles[-1][2]
    high_price = max(x[3] for x in candles)
    low_price = min(x[4] for x in candles)
    volume = sum(x[5] for x in candles)
    candle_id = str(uuid.uuid4())
    cur.execute(
        "INSERT INTO candle (id, exchange, symbol, timeframe, timestamp, open, close, high, low, volume) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s) ON CONFLICT DO NOTHING",
        (candle_id, 'Binance Perpetual Futures', 'BTC-USDT', '1h', hour_ts, open_price, close_price, high_price, low_price, volume)
    )
    inserted += cur.rowcount

conn.commit()
print(f"\nInserted {inserted} new 1h candles for the gap")

# Verify coverage now
cur.execute("SELECT MIN(timestamp), MAX(timestamp), COUNT(*) FROM candle WHERE exchange='Binance Perpetual Futures' AND symbol='BTC-USDT' AND timeframe='1h'")
r = cur.fetchone()
min_dt = datetime.datetime.fromtimestamp(r[0]/1000, tz=datetime.timezone.utc)
max_dt = datetime.datetime.fromtimestamp(r[1]/1000, tz=datetime.timezone.utc)
print(f"1h coverage now: {min_dt} to {max_dt} ({r[2]} candles)")

cur.close()
conn.close()