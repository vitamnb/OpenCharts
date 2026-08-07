/**
 * Technical Indicator Calculations
 * Pure functions for computing chart indicators from OHLCV candle data.
 */

export interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface IndicatorPoint {
  time: number;
  value: number;
}

// ── Simple Moving Average ────────────────────────────────────
export function sma(candles: CandleData[], period: number): IndicatorPoint[] {
  const result: IndicatorPoint[] = [];
  if (candles.length < period) return result;

  let sum = 0;
  for (let i = 0; i < period; i++) sum += candles[i]!.close;

  result.push({ time: candles[period - 1]!.time, value: sum / period });

  for (let i = period; i < candles.length; i++) {
    sum += candles[i]!.close - candles[i - period]!.close;
    result.push({ time: candles[i]!.time, value: sum / period });
  }
  return result;
}

// ── Exponential Moving Average ───────────────────────────────
export function ema(candles: CandleData[], period: number): IndicatorPoint[] {
  const result: IndicatorPoint[] = [];
  if (candles.length < period) return result;

  const k = 2 / (period + 1);

  // Seed with SMA
  let sum = 0;
  for (let i = 0; i < period; i++) sum += candles[i]!.close;
  let prev = sum / period;
  result.push({ time: candles[period - 1]!.time, value: prev });

  for (let i = period; i < candles.length; i++) {
    prev = candles[i]!.close * k + prev * (1 - k);
    result.push({ time: candles[i]!.time, value: prev });
  }
  return result;
}

// ── Relative Strength Index ──────────────────────────────────
export function rsi(candles: CandleData[], period = 14): IndicatorPoint[] {
  const result: IndicatorPoint[] = [];
  if (candles.length < period + 1) return result;

  let avgGain = 0;
  let avgLoss = 0;

  // First period
  for (let i = 1; i <= period; i++) {
    const change = candles[i]!.close - candles[i - 1]!.close;
    if (change > 0) avgGain += change;
    else avgLoss += Math.abs(change);
  }
  avgGain /= period;
  avgLoss /= period;

  const rs0 = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  result.push({ time: candles[period]!.time, value: rs0 });

  for (let i = period + 1; i < candles.length; i++) {
    const change = candles[i]!.close - candles[i - 1]!.close;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    const rsiVal = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    result.push({ time: candles[i]!.time, value: rsiVal });
  }
  return result;
}

// ── MACD ─────────────────────────────────────────────────────
export interface MACDResult {
  macd: IndicatorPoint[];
  signal: IndicatorPoint[];
  histogram: IndicatorPoint[];
}

export function macd(
  candles: CandleData[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9,
): MACDResult {
  const fastEma = ema(candles, fastPeriod);
  const slowEma = ema(candles, slowPeriod);

  // Align by time
  const slowTimes = new Map(slowEma.map((p) => [p.time, p.value]));
  const macdLine: IndicatorPoint[] = [];
  for (const fp of fastEma) {
    const sv = slowTimes.get(fp.time);
    if (sv !== undefined) {
      macdLine.push({ time: fp.time, value: fp.value - sv });
    }
  }

  // Signal line = EMA of MACD line
  const signalLine: IndicatorPoint[] = [];
  if (macdLine.length >= signalPeriod) {
    const k = 2 / (signalPeriod + 1);
    let sum = 0;
    for (let i = 0; i < signalPeriod; i++) sum += macdLine[i]!.value;
    let prev = sum / signalPeriod;
    signalLine.push({ time: macdLine[signalPeriod - 1]!.time, value: prev });

    for (let i = signalPeriod; i < macdLine.length; i++) {
      prev = macdLine[i]!.value * k + prev * (1 - k);
      signalLine.push({ time: macdLine[i]!.time, value: prev });
    }
  }

  // Histogram = MACD - Signal
  const signalTimes = new Map(signalLine.map((p) => [p.time, p.value]));
  const histogram: IndicatorPoint[] = [];
  for (const mp of macdLine) {
    const sv = signalTimes.get(mp.time);
    if (sv !== undefined) {
      histogram.push({ time: mp.time, value: mp.value - sv });
    }
  }

  return { macd: macdLine, signal: signalLine, histogram };
}

// ── Bollinger Bands ──────────────────────────────────────────
export interface BollingerResult {
  upper: IndicatorPoint[];
  middle: IndicatorPoint[];
  lower: IndicatorPoint[];
}

export function bollingerBands(
  candles: CandleData[],
  period = 20,
  stdDevMultiplier = 2,
): BollingerResult {
  const upper: IndicatorPoint[] = [];
  const middle: IndicatorPoint[] = [];
  const lower: IndicatorPoint[] = [];

  if (candles.length < period) return { upper, middle, lower };

  for (let i = period - 1; i < candles.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += candles[j]!.close;
    const avg = sum / period;

    let variance = 0;
    for (let j = i - period + 1; j <= i; j++) {
      variance += (candles[j]!.close - avg) ** 2;
    }
    const stdDev = Math.sqrt(variance / period);

    const t = candles[i]!.time;
    middle.push({ time: t, value: avg });
    upper.push({ time: t, value: avg + stdDevMultiplier * stdDev });
    lower.push({ time: t, value: avg - stdDevMultiplier * stdDev });
  }

  return { upper, middle, lower };
}

// ── Average True Range ───────────────────────────────────────
export function atr(candles: CandleData[], period = 14): IndicatorPoint[] {
  const result: IndicatorPoint[] = [];
  if (candles.length < period + 1) return result;

  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const tr = Math.max(
      candles[i]!.high - candles[i]!.low,
      Math.abs(candles[i]!.high - candles[i - 1]!.close),
      Math.abs(candles[i]!.low - candles[i - 1]!.close),
    );
    trs.push(tr);
  }

  let sum = 0;
  for (let i = 0; i < period; i++) sum += trs[i]!;
  let prev = sum / period;
  result.push({ time: candles[period]!.time, value: prev });

  for (let i = period; i < trs.length; i++) {
    prev = (prev * (period - 1) + trs[i]!) / period;
    result.push({ time: candles[i + 1]!.time, value: prev });
  }
  return result;
}

// ── Stochastic Oscillator ────────────────────────────────────
export interface StochasticResult {
  k: IndicatorPoint[];
  d: IndicatorPoint[];
}

export function stochastic(candles: CandleData[], kPeriod = 14, dPeriod = 3): StochasticResult {
  const kLine: IndicatorPoint[] = [];
  if (candles.length < kPeriod) return { k: [], d: [] };

  for (let i = kPeriod - 1; i < candles.length; i++) {
    let highest = -Infinity;
    let lowest = Infinity;
    for (let j = i - kPeriod + 1; j <= i; j++) {
      if (candles[j]!.high > highest) highest = candles[j]!.high;
      if (candles[j]!.low < lowest) lowest = candles[j]!.low;
    }
    const range = highest - lowest;
    const kVal = range === 0 ? 50 : ((candles[i]!.close - lowest) / range) * 100;
    kLine.push({ time: candles[i]!.time, value: kVal });
  }

  // %D = SMA of %K
  const dLine: IndicatorPoint[] = [];
  if (kLine.length >= dPeriod) {
    let sum = 0;
    for (let i = 0; i < dPeriod; i++) sum += kLine[i]!.value;
    dLine.push({ time: kLine[dPeriod - 1]!.time, value: sum / dPeriod });
    for (let i = dPeriod; i < kLine.length; i++) {
      sum += kLine[i]!.value - kLine[i - dPeriod]!.value;
      dLine.push({ time: kLine[i]!.time, value: sum / dPeriod });
    }
  }

  return { k: kLine, d: dLine };
}

// ── Volume Weighted Average Price ────────────────────────────
export function vwap(candles: CandleData[]): IndicatorPoint[] {
  const result: IndicatorPoint[] = [];
  let cumVolPrice = 0;
  let cumVol = 0;

  for (const c of candles) {
    const typicalPrice = (c.high + c.low + c.close) / 3;
    const vol = c.volume || 1;
    cumVolPrice += typicalPrice * vol;
    cumVol += vol;
    result.push({ time: c.time, value: cumVolPrice / cumVol });
  }
  return result;
}

// ── Anchored VWAP ───────────────────────────────────────────
export function vwapAnchored(
  candles: CandleData[],
  anchorPeriod: "1D" | "1W" | "1M" | "12M",
): IndicatorPoint[] {
  const result: IndicatorPoint[] = [];
  let cumVolPrice = 0;
  let cumVol = 0;
  let prevPeriodKey = "";

  for (const c of candles) {
    const date = new Date(c.time * 1000);
    let periodKey: string;

    switch (anchorPeriod) {
      case "1D":
        periodKey = `${date.getUTCFullYear()}-${date.getUTCMonth()}-${date.getUTCDate()}`;
        break;
      case "1W": {
        // ISO week number
        const tmp = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
        const dayNum = (tmp.getUTCDay() + 6) % 7;
        tmp.setUTCDate(tmp.getUTCDate() - dayNum + 3);
        const firstThursday = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 4));
        const weekNum = 1 + Math.round(((tmp.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
        periodKey = `${tmp.getUTCFullYear()}-W${weekNum}`;
        break;
      }
      case "1M":
        periodKey = `${date.getUTCFullYear()}-${date.getUTCMonth()}`;
        break;
      case "12M":
        periodKey = `${date.getUTCFullYear()}`;
        break;
      default:
        periodKey = `${date.getUTCFullYear()}-${date.getUTCMonth()}-${date.getUTCDate()}`;
    }

    if (periodKey !== prevPeriodKey) {
      cumVolPrice = 0;
      cumVol = 0;
      prevPeriodKey = periodKey;
    }

    const typicalPrice = (c.high + c.low + c.close) / 3;
    const vol = c.volume || 1;
    cumVolPrice += typicalPrice * vol;
    cumVol += vol;
    result.push({ time: c.time, value: cumVol > 0 ? cumVolPrice / cumVol : typicalPrice });
  }
  return result;
}

// ── RSI with configurable source ────────────────────────────
export function rsiCustom(
  candles: CandleData[],
  period: number,
  source: "open" | "high" | "low" | "close" | "hl2" | "hlc3" | "ohlc4" = "close",
): IndicatorPoint[] {
  const result: IndicatorPoint[] = [];
  if (candles.length < period + 1) return result;

  const getSource = (c: CandleData): number => {
    switch (source) {
      case "open": return c.open;
      case "high": return c.high;
      case "low": return c.low;
      case "hl2": return (c.high + c.low) / 2;
      case "hlc3": return (c.high + c.low + c.close) / 3;
      case "ohlc4": return (c.open + c.high + c.low + c.close) / 4;
      default: return c.close;
    }
  };

  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 1; i <= period; i++) {
    const change = getSource(candles[i]!) - getSource(candles[i - 1]!);
    if (change > 0) avgGain += change;
    else avgLoss += Math.abs(change);
  }
  avgGain /= period;
  avgLoss /= period;

  const rs0 = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  result.push({ time: candles[period]!.time, value: rs0 });

  for (let i = period + 1; i < candles.length; i++) {
    const change = getSource(candles[i]!) - getSource(candles[i - 1]!);
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    const rsiVal = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    result.push({ time: candles[i]!.time, value: rsiVal });
  }
  return result;
}

// ── Pivot Detection ─────────────────────────────────────────
export interface PivotPoint {
  index: number;
  time: number;
  price: number;
  type: "high" | "low";
}

export function detectPivots(
  candles: CandleData[],
  leftBars: number,
  rightBars: number,
): { highs: PivotPoint[]; lows: PivotPoint[] } {
  const highs: PivotPoint[] = [];
  const lows: PivotPoint[] = [];

  if (candles.length < leftBars + rightBars + 1) return { highs, lows };

  for (let i = leftBars; i < candles.length - rightBars; i++) {
    const pivotCandidate = candles[i]!;
    let isHigh = true;
    let isLow = true;

    for (let j = i - leftBars; j <= i + rightBars; j++) {
      if (j === i) continue;
      if (candles[j]!.high >= pivotCandidate.high) isHigh = false;
      if (candles[j]!.low <= pivotCandidate.low) isLow = false;
      if (!isHigh && !isLow) break;
    }

    if (isHigh) {
      highs.push({ index: i, time: pivotCandidate.time, price: pivotCandidate.high, type: "high" });
    }
    if (isLow) {
      lows.push({ index: i, time: pivotCandidate.time, price: pivotCandidate.low, type: "low" });
    }
  }

  return { highs, lows };
}

// ── S/R Zone Clustering ─────────────────────────────────────
export interface SRZone {
  price: number;
  touches: number;
  firstTime: number;
  lastTime: number;
  lastIndex: number;
}

export function clusterZones(
  pivots: PivotPoint[],
  tolerancePct: number,
  maxZones: number,
): SRZone[] {
  const zones: SRZone[] = [];

  for (const p of pivots) {
    const tolerance = p.price * (tolerancePct / 100);

    // Find closest existing zone
    let closestIdx = -1;
    let closestDist = Infinity;
    for (let i = 0; i < zones.length; i++) {
      const dist = Math.abs(zones[i]!.price - p.price);
      if (dist < closestDist) {
        closestDist = dist;
        closestIdx = i;
      }
    }

    if (closestIdx >= 0 && closestDist <= tolerance) {
      // Merge into existing zone: update weighted midpoint
      const z = zones[closestIdx]!;
      z.price = (z.price * z.touches + p.price) / (z.touches + 1);
      z.touches++;
      z.lastTime = p.time;
      z.lastIndex = p.index;
    } else {
      // Create new zone
      zones.push({
        price: p.price,
        touches: 1,
        firstTime: p.time,
        lastTime: p.time,
        lastIndex: p.index,
      });
    }

    // Cap zones: remove weakest if over max
    if (zones.length > maxZones) {
      let minIdx = 0;
      let minTouches = zones[0]!.touches;
      for (let i = 1; i < zones.length; i++) {
        if (zones[i]!.touches < minTouches) {
          minTouches = zones[i]!.touches;
          minIdx = i;
        }
      }
      zones.splice(minIdx, 1);
    }
  }

  return zones;
}

// ── VWAP+RSI Confluence State ───────────────────────────────
export type ConfluenceState = "bullish" | "bearish" | "neutral";
export type ConfluenceSignal = "bull" | "bear" | "notrade" | "counter" | null;

export interface ConfluenceBar {
  time: number;
  state: ConfluenceState;
  atSupport: boolean;
  atResistance: boolean;
  signal: ConfluenceSignal;
}

export function vwapRsiConfluence(
  candles: CandleData[],
  vwapData: IndicatorPoint[],
  rsiData: IndicatorPoint[],
  supports: SRZone[],
  resistances: SRZone[],
  rsiMid: number,
  tolerancePct: number,
): ConfluenceBar[] {
  const result: ConfluenceBar[] = [];

  // Build lookup maps
  const vwapMap = new Map<number, number>();
  for (const v of vwapData) vwapMap.set(v.time, v.value);
  const rsiMap = new Map<number, number>();
  for (const r of rsiData) rsiMap.set(r.time, r.value);

  for (const c of candles) {
    const vwap = vwapMap.get(c.time);
    const rsi = rsiMap.get(c.time);

    if (vwap === undefined || rsi === undefined) {
      result.push({ time: c.time, state: "neutral", atSupport: false, atResistance: false, signal: null });
      continue;
    }

    const isBullish = c.close > vwap && rsi > rsiMid;
    const isBearish = c.close < vwap && rsi < rsiMid;
    const state: ConfluenceState = isBullish ? "bullish" : isBearish ? "bearish" : "neutral";

    // Check proximity to zones
    const supTol = c.close * (tolerancePct / 100);
    let atSupport = false;
    let atResistance = false;

    for (const s of supports) {
      if (Math.abs(c.close - s.price) <= supTol) {
        atSupport = true;
        break;
      }
    }
    for (const r of resistances) {
      if (Math.abs(c.close - r.price) <= supTol) {
        atResistance = true;
        break;
      }
    }

    // Determine confluence signal
    let signal: ConfluenceSignal = null;
    if (atSupport && state === "bullish") signal = "bull";
    else if (atResistance && state === "bearish") signal = "bear";
    else if ((atSupport || atResistance) && state === "neutral") signal = "notrade";
    else if ((atSupport && state === "bearish") || (atResistance && state === "bullish")) signal = "counter";

    result.push({ time: c.time, state, atSupport, atResistance, signal });
  }

  return result;
}

// ── VWAP+RSI + SMC Confluence ────────────────────────────────

export type SMCConfluenceSignal = "bull" | "bear" | "notrade" | "counter" | null;

export interface SMCConfluenceBar {
  time: number;
  state: ConfluenceState;        // VWAP+RSI signal state
  smcTrend: TrendState;           // SMC market structure trend
  atSwing: boolean;               // price is near any swing point
  recentBreak: "BOS" | "CHoCH" | null;  // most recent structure break
  breakDirection: "bullish" | "bearish" | null;
  signal: SMCConfluenceSignal;
  strength: "strong" | "weak" | null; // strong = fresh break/swing; weak = trend-aligned only
  nearestSwingDistancePct: number | null; // distance to closest swing high/low as % of price
  isSweep: boolean;              // true if this bar's structural break was a failed sweep
}

import type { TrendState, StructureBreak, SwingPoint } from "./indicators/smc-market-structure";

export interface VwapRsiSmcParams {
  vwapAnchor: string;
  rsiLength: number;
  rsiMid: number;
  pivotLength: number;
  maxHistory: number;
  swingTolerance: number;
  heatmapMode: string;
  showVwapLine: boolean;
  showSwings: boolean;
  showBreaks: boolean;
  showHeatmap: boolean;
  showWeakSignals: boolean;
  breakLookback: number;
  swingLookback: number;
  sweepLookforward: number;
  structureTimeframe: string;
  useAtrTolerance: boolean;
  atrMultiplier: number;
  chopFilter: boolean;
  chopAtrRatio: number;
  requireHtfAlignment: boolean;
}

// ── ATR for swing tolerance ──────────────────────────────────

function computeAtrForSwing(candles: CandleData[], period = 14): Map<number, number> {
  const atrMap = new Map<number, number>();
  if (candles.length < period + 1) return atrMap;

  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const tr = Math.max(
      candles[i]!.high - candles[i]!.low,
      Math.abs(candles[i]!.high - candles[i - 1]!.close),
      Math.abs(candles[i]!.low - candles[i - 1]!.close),
    );
    trs.push(tr);
  }

  let sum = 0;
  for (let i = 0; i < period; i++) sum += trs[i]!;
  let prev = sum / period;
  // ATR at index period corresponds to candle at index period (time-based)
  atrMap.set(candles[period]!.time, prev);

  for (let i = period; i < trs.length; i++) {
    prev = (prev * (period - 1) + trs[i]!) / period;
    atrMap.set(candles[i + 1]!.time, prev);
  }
  return atrMap;
}

// ── Simplified ADX (trend strength) ──────────────────────────

function computeSimplifiedAdx(candles: CandleData[], period = 14): Map<number, number> {
  const adxMap = new Map<number, number>();
  if (candles.length < period * 2 + 1) return adxMap;

  // Compute +DM, -DM, TR
  const plusDm: number[] = [];
  const minusDm: number[] = [];
  const trArr: number[] = [];

  for (let i = 1; i < candles.length; i++) {
    const upMove = candles[i]!.high - candles[i - 1]!.high;
    const downMove = candles[i - 1]!.low - candles[i]!.low;
    plusDm.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDm.push(downMove > upMove && downMove > 0 ? downMove : 0);
    trArr.push(Math.max(
      candles[i]!.high - candles[i]!.low,
      Math.abs(candles[i]!.high - candles[i - 1]!.close),
      Math.abs(candles[i]!.low - candles[i - 1]!.close),
    ));
  }

  // Wilder smoothing (RMA) for +DI, -DI
  let smoothPlusDm = 0, smoothMinusDm = 0, smoothTr = 0;
  for (let i = 0; i < period; i++) {
    smoothPlusDm += plusDm[i]!;
    smoothMinusDm += minusDm[i]!;
    smoothTr += trArr[i]!;
  }
  smoothPlusDm /= period;
  smoothMinusDm /= period;
  smoothTr /= period;

  const dxValues: { time: number; dx: number }[] = [];

  for (let i = period; i < plusDm.length; i++) {
    smoothPlusDm = smoothPlusDm * (period - 1) / period + plusDm[i]!;
    smoothMinusDm = smoothMinusDm === 0 ? 0 : smoothMinusDm * (period - 1) / period + minusDm[i]!;
    smoothTr = smoothTr * (period - 1) / period + trArr[i]!;

    const plusDi = smoothTr !== 0 ? (smoothPlusDm / smoothTr) * 100 : 0;
    const minusDi = smoothTr !== 0 ? (smoothMinusDm / smoothTr) * 100 : 0;
    const dx = (plusDi + minusDi) !== 0 ? Math.abs(plusDi - minusDi) / (plusDi + minusDi) * 100 : 0;
    dxValues.push({ time: candles[i + 1]!.time, dx });
  }

  // Smooth DX with RMA to get ADX
  if (dxValues.length < period) return adxMap;

  let adx = 0;
  for (let i = 0; i < period; i++) adx += dxValues[i]!.dx;
  adx /= period;
  adxMap.set(dxValues[period - 1]!.time, adx);

  for (let i = period; i < dxValues.length; i++) {
    adx = adx * (period - 1) / period + dxValues[i]!.dx / period;
    adxMap.set(dxValues[i]!.time, adx);
  }

  return adxMap;
}

export function vwapRsiSMCConfluence(
  candles: CandleData[],
  vwapData: IndicatorPoint[],
  rsiData: IndicatorPoint[],
  swings: SwingPoint[],
  breaks: StructureBreak[],
  smcTrend: TrendState,
  rsiMid: number,
  swingTolerancePct: number,
  breakLookbackBars = 5,
  swingLookbackBars = 15,
  _smcCandles?: CandleData[],
  _params?: Partial<VwapRsiSmcParams>,
): SMCConfluenceBar[] {
  const result: SMCConfluenceBar[] = [];

  const p = {
    useAtrTolerance: true,
    atrMultiplier: 0.5,
    chopFilter: true,
    chopAtrRatio: 0.001,
    sweepLookforward: 3,
    requireHtfAlignment: true,
    ..._params,
  };

  const vwapMap = new Map<number, number>();
  for (const v of vwapData) vwapMap.set(v.time, v.value);
  const rsiMap = new Map<number, number>();
  for (const r of rsiData) rsiMap.set(r.time, r.value);

  // Pre-compute ATR for swing tolerance if needed
  const atrMap = p.useAtrTolerance ? computeAtrForSwing(candles, 14) : null;

  // Pre-compute simplified ADX for chop filter if needed
  const adxMap = p.chopFilter ? computeSimplifiedAdx(candles, 14) : null;

  // Pre-compute ATR values for chop filter (ATR/price ratio) if needed
  const atrForChop = p.chopFilter ? computeAtrForSwing(candles, 14) : null;

  // ── Sweep detection: pre-process breaks to find failed sweeps ──
  // For each break, check if the next 1-3 bars reverse back through
  // the broken level. If so, mark it as a sweep.
  const sweepSet = new Set<number>(); // indices into breaks[] that are sweeps
  const candleTimeMap = new Map<number, number>(); // time -> index
  for (let i = 0; i < candles.length; i++) candleTimeMap.set(candles[i]!.time, i);

  for (let bi = 0; bi < breaks.length; bi++) {
    const br = breaks[bi]!;
    // Find the bar index where the break occurred
    const breakBarIdx = candleTimeMap.get(br.time);
    if (breakBarIdx === undefined) continue;

    // Check the next 1-3 bars after the break
    for (let offset = 1; offset <= p.sweepLookforward; offset++) {
      const nextIdx = breakBarIdx + offset;
      if (nextIdx >= candles.length) break;
      const nextBar = candles[nextIdx]!;

      if (br.direction === "bullish") {
        // Bullish break of swing high level: price broke above level
        // Sweep = price closes back below the level within 3 bars
        if (nextBar.close < br.level) {
          sweepSet.add(bi);
          break;
        }
      } else {
        // Bearish break of swing low level: price broke below level
        // Sweep = price closes back above the level within 3 bars
        if (nextBar.close > br.level) {
          sweepSet.add(bi);
          break;
        }
      }
    }
  }

  // Build a time-indexed map of the most recent break at each point in time
  let breakIdx = 0;
  let lastBreak: StructureBreak | null = null;
  let lastBreakIsSweep = false;
  let runningTrend: TrendState = smcTrend;

  // HTF break tracking: since breaks/swings are computed from smcCandles,
  // the last break direction IS the HTF trend when HTF is active.
  let htfLastBreakDirection: "bullish" | "bearish" | null = null;
  let swingPtr = 0; // pointer into swings[] for look-ahead-free recent swings

  // Median bar interval (robust against gaps from weekends, low liquidity)
  // Computed once before the main loop
  let barMs = 0;
  if (candles.length >= 3) {
    const diffs: number[] = [];
    for (let i = 1; i < candles.length; i++) {
      const d = candles[i]!.time - candles[i - 1]!.time;
      if (d > 0) diffs.push(d);
    }
    if (diffs.length > 0) {
      diffs.sort((a, b) => a - b);
      barMs = diffs[Math.floor(diffs.length / 2)]!;
    }
  } else if (candles.length >= 2) {
    barMs = candles[1]!.time - candles[0]!.time;
  }

  for (let ci = 0; ci < candles.length; ci++) {
    const c = candles[ci]!;

    // Advance break pointer
    while (breakIdx < breaks.length && breaks[breakIdx]!.time <= c.time) {
      lastBreak = breaks[breakIdx]!;
      lastBreakIsSweep = sweepSet.has(breakIdx);
      runningTrend = lastBreak.direction === "bullish" ? 1 : -1;

      // Track HTF break direction
      if (_smcCandles && _smcCandles.length > 0 && p.requireHtfAlignment) {
        htfLastBreakDirection = lastBreak.direction;
      }

      breakIdx++;
    }

    // Clear HTF direction when structureTimeframe is empty (no stale phantom trend)
    if (!_smcCandles || _smcCandles.length === 0) {
      htfLastBreakDirection = null;
    }

    const vwap = vwapMap.get(c.time);
    const rsi = rsiMap.get(c.time);

    if (vwap === undefined || rsi === undefined) {
      result.push({
        time: c.time, state: "neutral", smcTrend: runningTrend,
        atSwing: false, recentBreak: lastBreak?.type ?? null,
        breakDirection: lastBreak?.direction ?? null, signal: null,
        strength: null,
        nearestSwingDistancePct: null,
        isSweep: false,
      });
      continue;
    }

    // ── ATR-normalized swing tolerance ──
    let swingTol: number;
    if (p.useAtrTolerance && atrMap) {
      const atrVal = atrMap.get(c.time);
      if (atrVal !== undefined && atrVal > 0) {
        swingTol = atrVal * p.atrMultiplier;
      } else {
        // Fallback to percentage-based if ATR not available for this bar
        swingTol = c.close * (swingTolerancePct / 100);
      }
    } else {
      swingTol = c.close * (swingTolerancePct / 100);
    }

    // ── Chop/regime filter ──
    if (p.chopFilter) {
      const adxVal = adxMap?.get(c.time);
      const atrRatio = atrForChop?.get(c.time);
      // Chop conditions: ADX < 20 OR ATR/price < 0.1%
      const adxChop = adxVal !== undefined && adxVal < 20;
      const atrChop = atrRatio !== undefined && c.close > 0
        ? (atrRatio / c.close) < p.chopAtrRatio
        : false;
      if (adxChop || atrChop) {
        // Choppy market, suppress signal
        result.push({
          time: c.time, state: "neutral", smcTrend: runningTrend,
          atSwing: false, recentBreak: lastBreak?.type ?? null,
          breakDirection: lastBreak?.direction ?? null, signal: null,
          strength: null,
          nearestSwingDistancePct: null,
          isSweep: false,
        });
        continue;
      }
    }

    // VWAP+RSI signal stack
    const isBullish = c.close > vwap && rsi > rsiMid;
    const isBearish = c.close < vwap && rsi < rsiMid;
    const state: ConfluenceState = isBullish ? "bullish" : isBearish ? "bearish" : "neutral";

    // Determine confluence signal using SMC as the location/filter layer.
    // A signal only fires when VWAP+RSI agrees with a *fresh* structural
    // event. "Fresh" means within a small lookback window so old breaks and
    // distant swings don't pollute the chart.
    let signal: SMCConfluenceSignal = null;
    let strength: SMCConfluenceBar["strength"] = null;
    let isSweep = false;

    const freshBreak =
      lastBreak !== null &&
      barMs > 0 &&
      c.time - lastBreak.time <= breakLookbackBars * barMs;

    // Look-ahead-free recent swings: only include swings at or before current bar time
    while (swingPtr < swings.length && swings[swingPtr]!.time <= c.time) {
      swingPtr++;
    }
    const recentSwings = swings.slice(Math.max(0, swingPtr - swingLookbackBars), swingPtr);
    const atSwing = recentSwings.some((s) => Math.abs(c.close - s.price) <= swingTol);

    const trendAligned =
      (state === "bullish" && runningTrend === 1) ||
      (state === "bearish" && runningTrend === -1);

    // ── Sweep detection: invert signal on failed breaks ──
    // If the most recent fresh break is a sweep (failed breakout),
    // invert the signal direction.
    let effectiveDirection: "bullish" | "bearish" | null = null;
    if (freshBreak && lastBreak !== null) {
      if (lastBreakIsSweep) {
        // Sweep detected: invert the break direction
        effectiveDirection = lastBreak.direction === "bullish" ? "bearish" : "bullish";
        isSweep = true;
      } else {
        effectiveDirection = lastBreak.direction;
      }
    }

    // ── HTF directional alignment filter ──
    if (freshBreak || atSwing) {
      if (freshBreak && effectiveDirection !== null) {
        // Signal comes from a structural break (possibly swept)
        const sigDirection = effectiveDirection === "bullish" ? "bull" as const : "bear" as const;

        // Check HTF alignment
        if (p.requireHtfAlignment && _smcCandles && _smcCandles.length > 0) {
          if (htfLastBreakDirection !== null) {
            // HTF trend is known
            const htfBullish = htfLastBreakDirection === "bullish";
            const sigBullish = sigDirection === "bull";
            if (htfBullish === sigBullish) {
              // Aligned: strong signal
              signal = sigDirection;
              strength = "strong";
            } else {
              // Counter HTF: no signal (suppress)
              // Only allow if state also agrees with the inverted direction
              if (
                (sigDirection === "bull" && state === "bullish") ||
                (sigDirection === "bear" && state === "bearish")
              ) {
                signal = "counter";
                strength = "weak";
              }
            }
          } else {
            // HTF trend unclear, allow but mark weak
            signal = sigDirection;
            strength = "weak";
          }
        } else {
          // No HTF alignment required, or no HTF candles
          signal = sigDirection;
          strength = "strong";
        }

        // Only emit if VWAP+RSI state agrees (or we're in counter territory)
        if (signal !== null && signal !== "counter") {
          const stateMatchesSignal =
            (signal === "bull" && state === "bullish") ||
            (signal === "bear" && state === "bearish");
          if (!stateMatchesSignal) {
            signal = null;
            strength = null;
          }
        }
      } else {
        // No fresh break, but at swing point
        if (trendAligned && atSwing) {
          // Check HTF alignment for swing-based signals
          let htfOk = true;
          if (p.requireHtfAlignment && _smcCandles && _smcCandles.length > 0 && htfLastBreakDirection !== null) {
            const htfBullish = htfLastBreakDirection === "bullish";
            const stateBullish = state === "bullish";
            if (htfBullish !== stateBullish) {
              htfOk = false;
            }
          }

          if (htfOk) {
            signal = state === "bullish" ? "bull" : "bear";
            strength = "strong";
          } else {
            // Counter HTF at swing
            signal = "counter";
            strength = "weak";
          }
        }
      }
    }

    // Compute nearest swing distance as % of current price
    let nearestSwingDistancePct: number | null = null;
    if (recentSwings.length > 0) {
      let minDist = Infinity;
      for (const sw of recentSwings) {
        const dist = Math.abs(c.close - sw.price);
        if (dist < minDist) minDist = dist;
      }
      nearestSwingDistancePct = c.close !== 0 ? (minDist / c.close) * 100 : null;
    }

    result.push({
      time: c.time, state, smcTrend: runningTrend,
      atSwing, recentBreak: lastBreak?.type ?? null,
      breakDirection: lastBreak?.direction ?? null, signal, strength,
      nearestSwingDistancePct,
      isSweep,
    });
  }

  return result;
}

// ── Indicator Registry (for UI) ──────────────────────────────
export type IndicatorType = "SMA" | "EMA" | "RSI" | "MACD" | "BOLL" | "ATR" | "STOCH" | "VWAP" | "SUPERTREND" | "OBV" | "VWAP_RSI_SR" | "SMC_MS" | "VWAP_RSI_SMC";

// Map our indicator types to the lightweight-charts-indicators library export names
export const LIB_KEY: Partial<Record<IndicatorType, string>> = {
  RSI: "RSI",
  MACD: "MACD",
  BOLL: "BollingerBands",
  ATR: "ATR",
  STOCH: "Stochastic",
  SMA: "SMA",
  EMA: "EMA",
  VWAP: "VWAP",
  SUPERTREND: "Supertrend",
  OBV: "OBV",
};

export type IndicatorPane = "overlay" | "below";

export type IndicatorCategory =
  | "Moving Averages"
  | "Oscillators"
  | "Volatility"
  | "Volume"
  | "Trend"
  | "Confluence"
  | "Smart Money Concepts";

export interface IndicatorConfig {
  type: IndicatorType;
  label: string;
  shortLabel: string;
  pane: IndicatorPane;
  category: IndicatorCategory;
  defaultParams: IndicatorParams;
  color: string;
  // Whether this indicator uses the library adapter (vs hand-rolled math)
  useLib?: boolean;
}

// Per-indicator parameter values (key = param name, value = number)
// Per-indicator appearance settings
export interface IndicatorAppearance {
  color: string;
  lineWidth: number;
  lineStyle?: "solid" | "dashed" | "dotted";
  visible: boolean;
}

// Params can now be number, string (source/select), or boolean
export type IndicatorParamValue = number | string | boolean;
export type IndicatorParams = Record<string, IndicatorParamValue>;

// Get the default params for an indicator type as a flat object
export function getDefaultParams(type: IndicatorType): IndicatorParams {
  const cfg = INDICATOR_REGISTRY.find((r) => r.type === type);
  return { ...(cfg?.defaultParams ?? {}) };
}

// Get the param descriptors for an indicator type (for rendering settings UI)
export interface ParamDescriptor {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  // For non-numeric params (select, source, bool)
  controlType?: "number" | "select" | "source" | "bool";
  options?: string[]; // for select
}

export function getParamDescriptors(type: IndicatorType): ParamDescriptor[] {
  const descriptors: Record<IndicatorType, ParamDescriptor[]> = {
    SMA: [
      { key: "len", label: "Length", min: 1, max: 500, step: 1 },
      { key: "src", label: "Source", min: 0, max: 0, step: 0, controlType: "source", options: ["open", "high", "low", "close", "hl2", "hlc3", "ohlc4"] },
      { key: "offset", label: "Offset", min: -500, max: 500, step: 1 },
      { key: "maType", label: "Smoothing Type", min: 0, max: 0, step: 0, controlType: "select", options: ["None", "SMA", "SMA + Bollinger Bands", "EMA", "SMMA (RMA)", "WMA", "VWMA"] },
      { key: "maLength", label: "Smoothing Length", min: 1, max: 200, step: 1 },
      { key: "bbMult", label: "BB StdDev", min: 0.001, max: 50, step: 0.1 },
    ],
    EMA: [
      { key: "length", label: "Length", min: 1, max: 500, step: 1 },
      { key: "src", label: "Source", min: 0, max: 0, step: 0, controlType: "source", options: ["open", "high", "low", "close", "hl2", "hlc3", "ohlc4"] },
      { key: "offset", label: "Offset", min: -500, max: 500, step: 1 },
      { key: "maType", label: "Smoothing Type", min: 0, max: 0, step: 0, controlType: "select", options: ["None", "SMA", "SMA + Bollinger Bands", "EMA", "SMMA (RMA)", "WMA", "VWMA"] },
      { key: "maLength", label: "Smoothing Length", min: 1, max: 200, step: 1 },
      { key: "bbMult", label: "BB StdDev", min: 0.001, max: 50, step: 0.1 },
    ],
    RSI: [
      { key: "length", label: "Length", min: 2, max: 50, step: 1 },
      { key: "upper", label: "Upper Level", min: 50, max: 100, step: 1 },
      { key: "lower", label: "Lower Level", min: 0, max: 50, step: 1 },
      { key: "src", label: "Source", min: 0, max: 0, step: 0, controlType: "source", options: ["open", "high", "low", "close", "hl2", "hlc3", "ohlc4"] },
      { key: "maType", label: "Smoothing Type", min: 0, max: 0, step: 0, controlType: "select", options: ["None", "SMA", "SMA + Bollinger Bands", "EMA", "SMMA (RMA)", "WMA", "VWMA"] },
      { key: "maLength", label: "Smoothing Length", min: 1, max: 200, step: 1 },
      { key: "bbMult", label: "BB StdDev", min: 0.001, max: 50, step: 0.1 },
    ],
    MACD: [
      { key: "fastLength", label: "Fast Length", min: 1, max: 200, step: 1 },
      { key: "slowLength", label: "Slow Length", min: 1, max: 200, step: 1 },
      { key: "signalLength", label: "Signal Smoothing", min: 1, max: 200, step: 1 },
      { key: "src", label: "Source", min: 0, max: 0, step: 0, controlType: "source", options: ["open", "high", "low", "close", "hl2", "hlc3", "ohlc4"] },
    ],
    BOLL: [
      { key: "length", label: "Length", min: 1, max: 500, step: 1 },
      { key: "maType", label: "Basis MA Type", min: 0, max: 0, step: 0, controlType: "select", options: ["SMA", "EMA", "SMMA (RMA)", "WMA", "VWMA"] },
      { key: "src", label: "Source", min: 0, max: 0, step: 0, controlType: "source", options: ["open", "high", "low", "close", "hl2", "hlc3", "ohlc4"] },
      { key: "mult", label: "StdDev", min: 0.001, max: 50, step: 0.1 },
      { key: "offset", label: "Offset", min: -500, max: 500, step: 1 },
    ],
    ATR: [
      { key: "length", label: "Length", min: 1, max: 200, step: 1 },
      { key: "smoothing", label: "Smoothing", min: 0, max: 0, step: 0, controlType: "select", options: ["RMA", "SMA", "EMA", "WMA"] },
    ],
    STOCH: [
      { key: "periodK", label: "%K Length", min: 1, max: 200, step: 1 },
      { key: "smoothK", label: "%K Smoothing", min: 1, max: 200, step: 1 },
      { key: "periodD", label: "%D Smoothing", min: 1, max: 200, step: 1 },
    ],
    VWAP: [
      { key: "anchor", label: "Anchor Period", min: 0, max: 0, step: 0, controlType: "select", options: ["1D", "1W", "1M"] },
      { key: "src", label: "Source", min: 0, max: 0, step: 0, controlType: "source", options: ["open", "high", "low", "close", "hl2", "hlc3", "ohlc4"] },
      { key: "showBands", label: "Show Bands", min: 0, max: 0, step: 0, controlType: "bool" },
      { key: "bandMult", label: "Band Multiplier", min: 0.1, max: 50, step: 0.1 },
    ],
    SUPERTREND: [
      { key: "atrPeriod", label: "ATR Length", min: 1, max: 200, step: 1 },
      { key: "factor", label: "Factor", min: 0.01, max: 100, step: 0.01 },
    ],
    OBV: [
      { key: "maType", label: "Smoothing Type", min: 0, max: 0, step: 0, controlType: "select", options: ["None", "SMA", "SMA + Bollinger Bands", "EMA", "SMMA (RMA)", "WMA", "VWMA"] },
      { key: "maLength", label: "Smoothing Length", min: 1, max: 200, step: 1 },
      { key: "bbMult", label: "BB StdDev", min: 0.001, max: 50, step: 0.1 },
    ],
    VWAP_RSI_SR: [
      { key: "vwapAnchor", label: "VWAP Anchor", min: 0, max: 0, step: 0, controlType: "select", options: ["1D", "1W", "1M", "12M"] },
      { key: "rsiLength", label: "RSI Length", min: 2, max: 50, step: 1 },
      { key: "rsiMid", label: "RSI Midline", min: 1, max: 99, step: 1 },
      { key: "pivotLen", label: "Pivot Length", min: 1, max: 20, step: 1 },
      { key: "srLookback", label: "S/R Lookback", min: 10, max: 200, step: 1 },
      { key: "srTolerance", label: "S/R Tolerance %", min: 0.05, max: 2.0, step: 0.05 },
      { key: "maxZones", label: "Max Zones/Side", min: 1, max: 20, step: 1 },
      { key: "srExtend", label: "Zone Extension", min: 0, max: 100, step: 1 },
      { key: "showVwapLine", label: "Show VWAP Line", min: 0, max: 0, step: 0, controlType: "bool" },
    ],
    SMC_MS: [
      { key: "pivotLength", label: "Pivot Length", min: 1, max: 50, step: 1 },
      { key: "maxHistory", label: "Max History", min: 10, max: 500, step: 10 },
      { key: "heatmapMode", label: "Heatmap Mode", min: 0, max: 0, step: 0, controlType: "select", options: ["Combined", "Impulse", "Pullback"] },
      { key: "neutralThreshold", label: "Neutral Threshold", min: 0, max: 0.5, step: 0.05 },
      { key: "showHeatmap", label: "Show Heatmap", min: 0, max: 0, step: 0, controlType: "bool" },
      { key: "showSwings", label: "Show Swings", min: 0, max: 0, step: 0, controlType: "bool" },
      { key: "showBreaks", label: "Show BOS/CHoCH", min: 0, max: 0, step: 0, controlType: "bool" },
    ],
    VWAP_RSI_SMC: [
      { key: "vwapAnchor", label: "VWAP Anchor", min: 0, max: 0, step: 0, controlType: "select", options: ["1D", "1W", "1M", "12M"] },
      { key: "rsiLength", label: "RSI Length", min: 2, max: 50, step: 1 },
      { key: "rsiMid", label: "RSI Midline", min: 1, max: 99, step: 1 },
      { key: "pivotLength", label: "SMC Pivot Length", min: 1, max: 50, step: 1 },
      { key: "maxHistory", label: "SMC Max History", min: 10, max: 500, step: 10 },
      { key: "structureTimeframe", label: "Structure TF", min: 0, max: 0, step: 0, controlType: "select", options: ["", "1h", "4h", "1d", "1w"] },
      { key: "breakLookback", label: "Break Lookback (bars)", min: 1, max: 50, step: 1 },
      { key: "swingLookback", label: "Swing Lookback (bars)", min: 1, max: 100, step: 1 },
      { key: "sweepLookforward", label: "Sweep Lookforward (bars)", min: 1, max: 10, step: 1 },
      { key: "swingTolerance", label: "Swing Tolerance %", min: 0.05, max: 2.0, step: 0.05 },
      { key: "useAtrTolerance", label: "ATR Swing Tolerance", min: 0, max: 0, step: 0, controlType: "bool" },
      { key: "atrMultiplier", label: "ATR Multiplier", min: 0.1, max: 2.0, step: 0.1 },
      { key: "chopFilter", label: "Chop Filter", min: 0, max: 0, step: 0, controlType: "bool" },
      { key: "chopAtrRatio", label: "Chop ATR Ratio", min: 0.0001, max: 0.01, step: 0.0001 },
      { key: "requireHtfAlignment", label: "HTF Alignment", min: 0, max: 0, step: 0, controlType: "bool" },
      { key: "heatmapMode", label: "Heatmap Mode", min: 0, max: 0, step: 0, controlType: "select", options: ["Combined", "Impulse", "Pullback"] },
      { key: "showVwapLine", label: "Show VWAP Line", min: 0, max: 0, step: 0, controlType: "bool" },
      { key: "showSwings", label: "Show Swings", min: 0, max: 0, step: 0, controlType: "bool" },
      { key: "showBreaks", label: "Show BOS/CHoCH", min: 0, max: 0, step: 0, controlType: "bool" },
      { key: "showHeatmap", label: "Show Heatmap", min: 0, max: 0, step: 0, controlType: "bool" },
      { key: "showWeakSignals", label: "Show Weak Signals", min: 0, max: 0, step: 0, controlType: "bool" },
    ],
  };
  return descriptors[type] ?? [];
}

export function getDefaultAppearance(type: IndicatorType): IndicatorAppearance {
  const cfg = INDICATOR_REGISTRY.find((r) => r.type === type);
  return {
    color: cfg?.color ?? "#888",
    lineWidth: 1,
    lineStyle: "solid",
    visible: true,
  };
}

export const INDICATOR_REGISTRY: IndicatorConfig[] = [
  {
    type: "SMA",
    label: "Simple Moving Average",
    shortLabel: "SMA",
    pane: "overlay",
    category: "Moving Averages",
    defaultParams: { len: 9, src: "close", offset: 0, maType: "None", maLength: 14, bbMult: 2 },
    color: "#f0b90b",
    useLib: true,
  },
  {
    type: "EMA",
    label: "Exponential Moving Average",
    shortLabel: "EMA",
    pane: "overlay",
    category: "Moving Averages",
    defaultParams: { length: 9, src: "close", offset: 0, maType: "None", maLength: 14, bbMult: 2 },
    color: "#e377c2",
    useLib: true,
  },
  {
    type: "RSI",
    label: "Relative Strength Index",
    shortLabel: "RSI",
    pane: "below",
    category: "Oscillators",
    defaultParams: { length: 14, upper: 70, lower: 30, src: "close", maType: "None", maLength: 14, bbMult: 2 },
    color: "#8884d8",
    useLib: true,
  },
  {
    type: "MACD",
    label: "MACD",
    shortLabel: "MACD",
    pane: "below",
    category: "Oscillators",
    defaultParams: { fastLength: 12, slowLength: 26, signalLength: 9, src: "close" },
    color: "#2196f3",
    useLib: true,
  },
  {
    type: "BOLL",
    label: "Bollinger Bands",
    shortLabel: "BB",
    pane: "overlay",
    category: "Volatility",
    defaultParams: { length: 20, maType: "SMA", src: "close", mult: 2, offset: 0 },
    color: "#26a69a",
    useLib: true,
  },
  {
    type: "ATR",
    label: "Average True Range",
    shortLabel: "ATR",
    pane: "below",
    category: "Volatility",
    defaultParams: { length: 14, smoothing: "RMA" },
    color: "#ff7043",
    useLib: true,
  },
  {
    type: "STOCH",
    label: "Stochastic Oscillator",
    shortLabel: "Stoch",
    pane: "below",
    category: "Oscillators",
    defaultParams: { periodK: 14, smoothK: 1, periodD: 3 },
    color: "#ab47bc",
    useLib: true,
  },
  {
    type: "VWAP",
    label: "Volume Weighted Avg Price",
    shortLabel: "VWAP",
    pane: "overlay",
    category: "Volume",
    defaultParams: { anchor: "1D", src: "hlc3", showBands: false, bandMult: 1 },
    color: "#42a5f5",
    useLib: true,
  },
  {
    type: "SUPERTREND",
    label: "Supertrend",
    shortLabel: "ST",
    pane: "overlay",
    category: "Trend",
    defaultParams: { atrPeriod: 10, factor: 3 },
    color: "#26a69a",
    useLib: true,
  },
  {
    type: "OBV",
    label: "On Balance Volume",
    shortLabel: "OBV",
    pane: "below",
    category: "Volume",
    defaultParams: { maType: "None", maLength: 14, bbMult: 2 },
    color: "#9c27b0",
    useLib: true,
  },
  {
    type: "VWAP_RSI_SR",
    label: "VWAP+RSI S/R Confluence",
    shortLabel: "Confluence",
    pane: "overlay",
    category: "Confluence",
    defaultParams: { vwapAnchor: "1D", rsiLength: 21, rsiMid: 50, pivotLen: 5, srLookback: 50, srTolerance: 0.3, maxZones: 8, srExtend: 20, showVwapLine: true },
    color: "#42a5f5",
    useLib: false,
  },
  {
    type: "SMC_MS",
    label: "Market Structure (SMC)",
    shortLabel: "SMC",
    pane: "overlay",
    category: "Smart Money Concepts",
    defaultParams: { pivotLength: 10, maxHistory: 100, heatmapMode: "Pullback", neutralThreshold: 0.15, showHeatmap: true, showSwings: true, showBreaks: true },
    color: "#009688",
    useLib: false,
  },
  {
    type: "VWAP_RSI_SMC",
    label: "VWAP+RSI SMC Confluence",
    shortLabel: "SMC+",
    pane: "overlay",
    category: "Confluence",
    defaultParams: { vwapAnchor: "1D", rsiLength: 21, rsiMid: 50, pivotLength: 10, maxHistory: 100, structureTimeframe: "", breakLookback: 5, swingLookback: 15, sweepLookforward: 3, swingTolerance: 0.3, heatmapMode: "Pullback", showVwapLine: true, showSwings: true, showBreaks: true, showHeatmap: false, showWeakSignals: false, useAtrTolerance: true, atrMultiplier: 0.5, chopFilter: true, chopAtrRatio: 0.001, requireHtfAlignment: true },
    color: "#42a5f5",
    useLib: false,
  },
];
