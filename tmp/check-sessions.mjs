import Database from 'better-sqlite3';
const db = new Database('C:/Users/vitamnb/.openclaw/workspace/trading-stack/jesse-project/storage/jesse.db', { readonly: true });
const rows = db.prepare("SELECT id, status, exchange, symbol, timeframe, strategy, started_at, finished_at FROM backtestsession ORDER BY started_at DESC LIMIT 5").all();
console.log(JSON.stringify(rows, null, 2));