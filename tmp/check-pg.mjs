import { Client } from 'pg';
const client = new Client({ host: 'localhost', port: 5432, database: 'jesse_db', user: 'jesse_user', password: 'password' });
await client.connect();
const res = await client.query("SELECT id, status, exchange, symbol, timeframe, strategy, started_at, finished_at FROM backtestsession ORDER BY started_at DESC LIMIT 5");
console.log(JSON.stringify(res.rows, null, 2));
await client.end();