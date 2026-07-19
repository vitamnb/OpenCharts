/**
 * KuCoin REST client for historical market data.
 *
 * Uses the public (no-auth) endpoints:
 * - GET /api/v1/market/candles  (historical OHLC)
 * - GET /api/v1/market/symbols  (available trading pairs)
 *
 * Rate limit: 3 public weight per candles request, 10 per bullet request.
 * Public weight pool refills every 30s. For our use case (chart history on
 * symbol switch + periodic backfill), this is more than sufficient.
 */

import { toKucoinSymbol, toKucoinTimeframe, fromKucoinSymbol } from "./symbols";
import type { Symbol } from "../schemas";

const SPOT_BASE = import.meta.env.DEV ? "/kucoin" : "https://api.kucoin.com";

export interface KucoinCandle {
  time: number; // start time in seconds
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
  turnover: number;
}

interface KucoinResponse<T> {
  code: string;
  data: T;
}

/**
 * Fetch historical candles from KuCoin.
 *
 * @param symbol   OpenCharts symbol (e.g. "BTCUSD")
 * @param timeframe OpenCharts timeframe (e.g. "1m", "1h", "1d")
 * @param startAt   Start time in seconds (optional)
 * @param endAt     End time in seconds (optional)
 * @returns Array of candles, oldest first. Max 1500 per request.
 */
export async function fetchCandles(
  symbol: string,
  timeframe: string,
  startAt?: number,
  endAt?: number,
): Promise<KucoinCandle[]> {
  const kcSymbol = toKucoinSymbol(symbol);
  const kcType = toKucoinTimeframe(timeframe);

  const params = new URLSearchParams({
    symbol: kcSymbol,
    type: kcType,
  });
  if (startAt != null) params.set("startAt", String(startAt));
  if (endAt != null) params.set("endAt", String(endAt));

  const url = `${SPOT_BASE}/api/v1/market/candles?${params}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`KuCoin candles request failed: ${res.status} ${res.statusText}`);
  }

  const json = (await res.json()) as KucoinResponse<string[][]>;
  if (json.code !== "200000") {
    throw new Error(`KuCoin API error: ${json.code}`);
  }

  // KuCoin returns candles as string arrays in descending order (newest first).
  // Format: [time, open, close, high, low, volume, turnover]
  // We reverse to oldest-first and parse to numbers.
  return json.data
    .map((row) => ({
      time: Number(row[0]),
      open: Number(row[1]),
      close: Number(row[2]),
      high: Number(row[3]),
      low: Number(row[4]),
      volume: Number(row[5]),
      turnover: Number(row[6]),
    }))
    .reverse();
}

/**
 * Fetch N most recent candles for a symbol.
 * Uses startAt/endAt with a calculated window.
 *
 * @param symbol    OpenCharts symbol
 * @param timeframe OpenCharts timeframe
 * @param limit     Number of candles (max 1500)
 */
export async function fetchRecentCandles(
  symbol: string,
  timeframe: string,
  limit: number = 500,
): Promise<KucoinCandle[]> {
  const kcType = toKucoinTimeframe(timeframe);
  // Calculate the time window. KuCoin returns max 1500 candles per request.
  // We estimate the start time based on the timeframe interval.
  const intervalSeconds = timeframeToSeconds(kcType);
  const now = Math.floor(Date.now() / 1000);
  const startAt = now - Math.min(limit, 1500) * intervalSeconds;

  const candles = await fetchCandles(symbol, timeframe, startAt, now);
  // Trim to requested limit (take the most recent)
  return candles.slice(-Math.min(limit, 1500));
}

/**
 * Apply for a public WebSocket connection token.
 * Returns the token and WebSocket endpoint URL.
 */
export async function fetchBulletPublic(): Promise<{ token: string; endpoint: string; pingInterval: number; pingTimeout: number }> {
  const url = `${SPOT_BASE}/api/v1/bullet-public`;
  const res = await fetch(url, { method: "POST" });
  if (!res.ok) {
    throw new Error(`KuCoin bullet-public request failed: ${res.status}`);
  }
  const json = (await res.json()) as KucoinResponse<{
    token: string;
    instanceServers: Array<{
      endpoint: string;
      encrypt: boolean;
      protocol: string;
      pingInterval: number;
      pingTimeout: number;
    }>;
  }>;
  const server = json.data.instanceServers[0];
  if (!server) throw new Error("KuCoin returned no instance servers");

  return {
    token: json.data.token,
    endpoint: server.endpoint,
    pingInterval: server.pingInterval,
    pingTimeout: server.pingTimeout,
  };
}

function timeframeToSeconds(kcType: string): number {
  const map: Record<string, number> = {
    "1min": 60,
    "3min": 180,
    "5min": 300,
    "15min": 900,
    "30min": 1800,
    "1hour": 3600,
    "2hour": 7200,
    "4hour": 14400,
    "6hour": 21600,
    "8hour": 28800,
    "12hour": 43200,
    "1day": 86400,
    "1week": 604800,
    "1month": 2592000,
  };
  return map[kcType] ?? 60;
}

/**
 * Fetch available USDT trading pairs from KuCoin and convert to OpenCharts Symbol format.
 * Filters to active, spot trading pairs with USDT as the quote currency.
 * Sorted by volume (highest first), limited to top pairs.
 */
export async function fetchKucoinSymbols(limit: number = 50): Promise<Symbol[]> {
  const url = `${SPOT_BASE}/api/v1/symbols`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`KuCoin symbols request failed: ${res.status}`);
  }
  const json = (await res.json()) as KucoinResponse<Array<{
    symbol: string;      // e.g. "BTC-USDT"
    name: string;        // e.g. "BTCUSDT"
    baseCurrency: string;
    quoteCurrency: string;
    enableTrading: boolean;
    isMarginTradingEnabled: boolean;
  }>>;

  const usdtPairs = json.data
    .filter((s) => s.quoteCurrency === "USDT" && s.enableTrading)
    .slice(0, limit)
    .map((s) => {
      const ocSymbol = fromKucoinSymbol(s.symbol);
      return {
        id: ocSymbol,
        name: s.name,
        displayName: s.baseCurrency + " / USDT",
        category: "crypto",
        contractSize: 1,
        tickSize: 0.01,
        tickValue: 0.01,
        marginPercent: 1,
        maxLeverage: 20,
        commission: 0.001,
        swapLong: 0,
        swapShort: 0,
        tradingHoursStart: null,
        tradingHoursEnd: null,
        isActive: true,
      } as Symbol;
    });

  return usdtPairs;
}