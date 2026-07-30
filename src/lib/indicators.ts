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

// ── Indicator Registry (for UI) ──────────────────────────────
export type IndicatorType = "SMA" | "EMA" | "RSI" | "MACD" | "BOLL" | "ATR" | "STOCH" | "VWAP" | "SUPERTREND" | "OBV";

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
  | "Trend";

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
];
