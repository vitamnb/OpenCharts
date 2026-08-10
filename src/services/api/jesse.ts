// Jesse backtest API client

const JESSE_BASE = "/api/jesse";

// Auth token = sha256("jesse_dev") from jesse-project/.env PASSWORD=jesse_dev
const JESSE_AUTH_TOKEN =
  "8e8718c0ec8e160026556b800be8f54964f5cacc73a80d4545383a2137f7249e";

function jesseHeaders(): HeadersInit {
  return {
    "Content-Type": "application/json",
    Authorization: JESSE_AUTH_TOKEN,
  };
}

export interface JesseStrategy {
  name: string;
  path: string;
}

export interface JesseBacktestMetrics {
  net_profit?: number;
  net_profit_percentage?: number;
  total?: number;
  winning_trades?: number;
  losing_trades?: number;
  win_rate?: number;
  max_drawdown?: number;
  sharpe_ratio?: number;
  sortino_ratio?: number;
  profit_factor?: number;
  calmar_ratio?: number;
  annual_return?: number;
  expectancy?: number;
  total_fees?: number;
  avg_holding_period?: string;
  average_profit?: number;
  average_loss?: number;
  largest_profit?: number;
  largest_loss?: number;
  total_winning_trades?: number;
  total_losing_trades?: number;
}

export interface JesseTrade {
  id: string;
  symbol: string;
  type: "long" | "short";
  entry_price: number;
  exit_price: number | null;
  qty: number;
  pnl: number | null;
  pnl_percentage: number | null;
  // Jesse API returns capital PNL, map in transformer
  PNL?: number;
  PNL_percentage?: number;
  opened_at: number;
  closed_at: number | null;
  status: "open" | "closed";
  strategy_name?: string;
  exchange?: string;
  timeframe?: string;
  leverage?: number;
  fee?: number;
  holding_period?: string;
}

export interface JesseEquityPoint {
  timestamp: number;
  equity: number;
}

export interface JesseBacktestSession {
  id: string;
  status: "running" | "finished" | "stopped" | "cancelled" | "terminated" | "error";
  metrics: JesseBacktestMetrics | null;
  trades: JesseTrade[];
  equity_curve: JesseEquityPoint[];
  execution_duration: number | null;
  created_at: number;
  updated_at: number;
  title: string | null;
  description: string | null;
  exception: string | null;
  traceback: string | null;
}

export interface JesseBacktestConfig {
  exchange: string;
  symbol: string;
  timeframe: string;
  strategy: string;
  start_date: string;
  finish_date: string;
  initial_capital?: number;
}

export interface JesseCandle {
  time: number; // unix seconds
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
}

export async function fetchJesseCandles(
  exchange: string,
  symbol: string,
  timeframe: string,
): Promise<JesseCandle[]> {
  const id = crypto.randomUUID();
  // Normalise symbol to dashed format for Jesse
  const dashedSymbol = symbol.includes("-")
    ? symbol.replace(/-USD$/, "-USDT")
    : symbol.replace(/^(\w+)(USDT|USD)$/, "$1-USDT");

  const res = await fetch(`${JESSE_BASE}/candles/get`, {
    method: "POST",
    headers: jesseHeaders(),
    body: JSON.stringify({
      id,
      exchange,
      symbol: dashedSymbol,
      timeframe,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to fetch Jesse candles: ${err}`);
  }

  const data = await res.json();
  // Jesse returns { id, data: [[time, open, close, high, low, volume], ...] }
  const raw: number[][] = data.data || [];
  return raw.map((c) => ({
    time: c[0] ?? 0,
    open: c[1] ?? 0,
    close: c[2] ?? 0,
    high: c[3] ?? 0,
    low: c[4] ?? 0,
    volume: c[5] ?? 0,
  }));
}

export async function checkJesseHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${JESSE_BASE}/`);
    return res.ok;
  } catch {
    return false;
  }
}

/** Sync candles from exchange into Jesse's PostgreSQL storage. */
export async function syncCandles(
  exchange: string,
  symbol: string,
  timeframe: string,
  startDate: string,
  endDate: string,
): Promise<{ success: boolean; count: number; message: string }> {
  const id = crypto.randomUUID();
  const dashedSymbol = symbol.includes("-")
    ? symbol.replace(/-USD$/, "-USDT")
    : symbol.replace(/^(\w+)(USDT|USD)$/, "$1-USDT");

  try {
    const res = await fetch(`${JESSE_BASE}/candles/sync`, {
      method: "POST",
      headers: jesseHeaders(),
      body: JSON.stringify({
        id,
        exchange,
        symbol: dashedSymbol,
        timeframe,
        start_date: startDate,
        finish_date: endDate,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return { success: false, count: 0, message: err };
    }

    const data = await res.json();
    return { success: true, count: data.count ?? 0, message: data.message ?? "Synced" };
  } catch (err) {
    return { success: false, count: 0, message: String(err) };
  }
}

export async function listStrategies(): Promise<JesseStrategy[]> {
  // Jesse's /strategy/index endpoint requires GET, not POST
  try {
    const res = await fetch(`${JESSE_BASE}/strategy/index`, {
      method: "GET",
      headers: jesseHeaders(),
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        return data.map((s: { name: string; path?: string }) => ({
          name: s.name,
          path: s.path || s.name,
        }));
      }
    }
  } catch {
    // fall through to static list
  }
  // Fallback: known strategies in jesse-project/strategies/
  return [
    { name: "Staircase", path: "Staircase" },
    { name: "VwapRsiConfluence", path: "VwapRsiConfluence" },
  ];
}

export async function startBacktest(
  config: JesseBacktestConfig,
): Promise<{ sessionId: string }> {
  const id = crypto.randomUUID();
  // Ensure symbol uses dashed format (BTC-USDT, not BTCUSDT)
  // Normalise BTC-USD to BTC-USDT since our candle data is under USDT
  const dashedSymbol = config.symbol.includes("-")
    ? config.symbol.replace(/-USD$/, "-USDT")
    : config.symbol.replace(/^(\w+)(USDT|USD)$/, "$1-USDT");

  // Determine exchange type based on exchange name
  const isFutures = config.exchange.toLowerCase().includes("futures") ||
    config.exchange.toLowerCase().includes("perpetual");
  const exchangeType = isFutures ? "futures" : "spot";

  const body = {
    id,
    debug_mode: false,
    config: {
      exchange: config.exchange,
      starting_balance: config.initial_capital ?? 10000,
      fee: 0.001,
      futures_leverage: 1,
      futures_leverage_mode: "cross",
      warm_up_candles: 240,
      logging: {
        strategy_execution: false,
        order_submission: false,
        order_cancellation: false,
        order_execution: false,
        position_opened: false,
        position_increased: false,
        position_reduced: false,
        position_closed: false,
        shorter_period_candles: false,
        trading_candles: false,
        balance_update: false,
        exchange_ws_reconnection: false,
      },
      exchanges: {
        [config.exchange]: {
          name: config.exchange,
          fee: 0.001,
          type: exchangeType,
          balance: config.initial_capital ?? 10000,
          ...(isFutures ? { futures_leverage: 1, futures_leverage_mode: "cross" } : {}),
        },
      },
    },
    exchange: config.exchange,
    routes: [
      {
        exchange: config.exchange,
        symbol: dashedSymbol,
        timeframe: config.timeframe,
        strategy: config.strategy,
      },
    ],
    data_routes: [],
    start_date: config.start_date,
    finish_date: config.finish_date,
    export_chart: false,
    export_tradingview: false,
    export_csv: false,
    export_json: true,
    fast_mode: false,
    benchmark: true,
    theme: "dark",
  };

  const res = await fetch(`${JESSE_BASE}/backtest`, {
    method: "POST",
    headers: jesseHeaders(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Backtest failed to start: ${err}`);
  }

  return { sessionId: id };
}

export async function getBacktestSession(
  sessionId: string,
): Promise<JesseBacktestSession> {
  const res = await fetch(`${JESSE_BASE}/backtest/sessions/${sessionId}`, {
    method: "POST",
    headers: jesseHeaders(),
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch backtest session: ${res.statusText}`);
  }

  const data = await res.json();
  const session = data.session as JesseBacktestSession;
  // Map Jesse's capital PNL fields to our lowercase interface
  if (session.trades) {
    session.trades = session.trades.map((t: JesseTrade) => ({
      ...t,
      pnl: t.pnl ?? t.PNL ?? null,
      pnl_percentage: t.pnl_percentage ?? t.PNL_percentage ?? null,
    }));
  }
  return session;
}

export async function listBacktestSessions(
  limit = 20,
  offset = 0,
): Promise<{ sessions: JesseBacktestSession[]; count: number }> {
  const res = await fetch(`${JESSE_BASE}/backtest/sessions`, {
    method: "POST",
    headers: jesseHeaders(),
    body: JSON.stringify({ limit, offset }),
  });

  if (!res.ok) {
    throw new Error("Failed to list backtest sessions");
  }

  return res.json();
}

export async function cancelBacktest(sessionId: string): Promise<void> {
  await fetch(`${JESSE_BASE}/backtest/cancel`, {
    method: "POST",
    headers: jesseHeaders(),
    body: JSON.stringify({ id: sessionId }),
  });
}

export function pollBacktestStatus(
  sessionId: string,
  onUpdate: (session: JesseBacktestSession) => void,
  onComplete: (session: JesseBacktestSession) => void,
  onError: (error: Error) => void,
  intervalMs = 2000,
  maxPollAttempts = 30,
): () => void {
  let cancelled = false;
  let pollCount = 0;
  let consecutiveErrors = 0;

  const poll = async () => {
    if (cancelled) return;
    pollCount++;

    if (pollCount > maxPollAttempts) {
      onError(new Error(`Backtest timed out after ${maxPollAttempts} polling attempts (${Math.round(maxPollAttempts * intervalMs / 1000)}s). The backtest process may have crashed silently.`));
      return;
    }

    try {
      const session = await getBacktestSession(sessionId);
      consecutiveErrors = 0;
      onUpdate(session);

      const done = [
        "finished",
        "stopped",
        "cancelled",
        "terminated",
        "error",
      ].includes(session.status);

      if (done) {
        onComplete(session);
        return;
      }
    } catch (err) {
      consecutiveErrors++;
      // Backtest subprocess takes ~5-8s to write the session to the DB.
      // Allow up to 10 consecutive errors (20s) before giving up.
      if (consecutiveErrors >= 10) {
        onError(err as Error);
        return;
      }
    }

    if (!cancelled) {
      setTimeout(poll, intervalMs);
    }
  };

  // Delay first poll by 3s to give the backtest subprocess time to write the session
  setTimeout(poll, 3000);

  return () => {
    cancelled = true;
  };
}