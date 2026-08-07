import type { CandlestickData, Time } from "lightweight-charts";
import type { CandleData } from "../../lib/indicators.ts";
import { KNOWN_CURRENCIES, TF_INTERVAL_MS } from "./constants.ts";
import type { Timeframe } from "./constants.ts";

/** Derive pip (decimal) precision from symbolInfo.tickSize or symbol name */
export function getPipDigits(
  symbolInfo?: { tickSize?: number | string },
  symbolName?: string,
): number {
  const symbolDecimals = _symbolNameDecimals(symbolName);
  if (symbolInfo?.tickSize) {
    const s = String(symbolInfo.tickSize);
    const tickDecimals = s.includes(".")
      ? s.split(".")[1]!.replace(/0+$/, "").length || s.split(".")[1]!.length
      : 0;
    // Use the higher of tick-derived or symbol-name-derived so forex pairs
    // (tickSize=0.0001) still show 5 decimal places instead of 4.
    return Math.max(tickDecimals, symbolDecimals, 2);
  }
  return symbolDecimals;
}

function _symbolNameDecimals(symbolName?: string): number {
  if (!symbolName) return 5;
  const n = symbolName.toUpperCase();
  if (n.includes("JPY") || n.includes("XAU") || n.includes("GOLD")) return 3;
  if (n.includes("BTC") || n.includes("ETH")) return 2;
  if (n.includes("US30") || n.includes("SPX") || n.includes("NAS") || n.includes("DAX")) return 2;
  return 5;
}

/** Get the minMove for lightweight-charts priceFormat from pip digits */
export function getMinMove(pipDigits: number): number {
  return Number((1 / Math.pow(10, pipDigits)).toFixed(pipDigits + 1));
}

/** Parse timestamp to unix seconds */
export function toUnixSeconds(ts: number | string | Date): number {
  if (typeof ts === "number") return ts > 1e12 ? Math.floor(ts / 1000) : ts;
  return Math.floor(new Date(ts).getTime() / 1000);
}

/** Normalise a numeric timestamp to unix milliseconds (accepts seconds or ms) */
export function toUnixMs(ts: number): number {
  return ts > 1e12 ? ts : ts * 1000;
}

/** Convert candles for indicator lib */
export function toIndicatorCandles(
  candles: CandlestickData<Time>[],
  volumeData?: Array<{ time: Time; value: number }>,
): CandleData[] {
  const volMap = new Map<number, number>();
  if (volumeData) {
    for (const v of volumeData) {
      volMap.set(v.time as number, v.value);
    }
  }
  return candles.map((c) => ({
    time: c.time as number,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: volMap.get(c.time as number) ?? 0,
  }));
}

/** Format seconds remaining as M:SS or H:MM:SS */
export function formatCountdown(totalSec: number): string {
  if (totalSec <= 0) return "0:00";
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = Math.floor(totalSec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Extract currency codes from a symbol name */
export function extractCurrencies(symbol: string): string[] {
  const upper = symbol.toUpperCase().replace(/[^A-Z]/g, "");
  const found: string[] = [];
  for (const c of KNOWN_CURRENCIES) {
    if (upper.includes(c)) found.push(c);
  }
  if (found.length === 0 && upper.length >= 6) {
    found.push(upper.slice(0, 3), upper.slice(3, 6));
  }
  return [...new Set(found)];
}

/** Return the candle-bucket start (unix seconds) for a given timestamp */
export function getCandleBucketTime(timestampMs: number, tf: Timeframe): number {
  const SEC = 1000;
  const intervals: Record<Timeframe, number> = {
    "1m": 60 * SEC,
    "5m": 5 * 60 * SEC,
    "15m": 15 * 60 * SEC,
    "30m": 30 * 60 * SEC,
    "1h": 60 * 60 * SEC,
    "4h": 4 * 60 * 60 * SEC,
    "1d": 24 * 60 * 60 * SEC,
    "1w": 7 * 24 * 60 * 60 * SEC,
    "1M": 30 * 24 * 60 * 60 * SEC,
  };
  const ms = intervals[tf];
  return Math.floor((Math.floor(timestampMs / ms) * ms) / 1000);
}

/** Aggregate lower-timeframe candles into higher-timeframe candles.
 *
 *  Overload 1: specify target timeframe as a Timeframe string.
 *  Input/output times are assumed to be unix seconds.
 */
export function aggregateCandles(
  candles: CandlestickData<Time>[],
  targetTf: Timeframe,
): CandlestickData<Time>[] {
  if (candles.length === 0) return [];

  type BucketRow = CandlestickData<Time> & { volume: number };
  const bucketMs = TF_INTERVAL_MS[targetTf];
  const buckets = new Map<number, BucketRow>();

  for (const c of candles) {
    const t = typeof c.time === "string" ? Date.parse(c.time) / 1000 : (c.time as number);
    const bucketS = Math.floor((Math.floor(t * 1000 / bucketMs) * bucketMs) / 1000);
    const cvol = (c as CandlestickData<Time> & { volume?: number }).volume ?? 0;

    const existing = buckets.get(bucketS);
    if (!existing) {
      buckets.set(bucketS, {
        time: bucketS as Time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: cvol,
      });
    } else {
      existing.high = Math.max(existing.high, c.high);
      existing.low = Math.min(existing.low, c.low);
      existing.close = c.close;
      existing.volume += cvol;
    }
  }

  return Array.from(buckets.values()).sort((a, b) => (a.time as number) - (b.time as number));
}

/** Aggregate lower-timeframe CandleData into higher-timeframe CandleData.
 *
 *  Overload 2: specify target timeframe in milliseconds and current timeframe in
 *  milliseconds. Uses bucket alignment math consistent with getCandleBucketTime.
 *  Input `lowerCandles` times are unix seconds (CandleData format).
 *  Returns CandleData[] aggregated to the target timeframe.
 *  If targetMs <= currentMs or no aggregation needed, returns input as-is.
 */
export function aggregateCandlesForSMC(
  lowerCandles: CandleData[],
  targetMs: number,
  currentMs: number,
): CandleData[] {
  if (targetMs <= currentMs || lowerCandles.length === 0) return lowerCandles;

  // Map from bucket start (unix seconds) -> aggregated candle
  const buckets = new Map<number, CandleData>();

  for (const c of lowerCandles) {
    const bucketS = Math.floor(Math.floor(c.time * 1000 / targetMs) * targetMs / 1000);

    const existing = buckets.get(bucketS);
    if (!existing) {
      buckets.set(bucketS, {
        time: bucketS,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume ?? 0,
      });
    } else {
      existing.high = Math.max(existing.high, c.high);
      existing.low = Math.min(existing.low, c.low);
      existing.close = c.close;
      existing.volume = (existing.volume ?? 0) + (c.volume ?? 0);
    }
  }

  return Array.from(buckets.values()).sort((a, b) => a.time - b.time);
}