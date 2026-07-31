import psycopg2, json
conn = psycopg2.connect(host="localhost", port=5432, database="jesse_db", user="jesse_user", password="password")
cur = conn.cursor()
cur.execute("SELECT id, status, metrics, exception, execution_duration, created_at FROM backtestsession ORDER BY created_at DESC LIMIT 5")
rows = cur.fetchall()
for r in rows:
    sid = str(r[0])
    status = r[1]
    exc = r[3]
    dur = r[4]
    created = str(r[5])
    metrics = json.loads(r[2]) if r[2] else None
    print(f"id={sid[:12]} status={status} dur={dur} exc={exc} created={created}")
    if metrics:
        print(f"  metrics keys: {list(metrics.keys())[:10]}")
cur.close()
conn.close()