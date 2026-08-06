/**
 * Smart Money Concepts - Market Structure
 *
 * Ported from LuxAlgo "Market Structure & Scatter Dashboard" Pine Script.
 * Phase 1: Swing detection, BOS/CHoCH detection, candle heatmap.
 *
 * The heatmap colors candles based on the live impulse/pullback relation
 * between consecutive swing points. Bullish sequences (Low->High->Low pullback)
 * paint green, bearish sequences (High->Low->High pullback) paint orange.
 */

import type { CandleData, PivotPoint } from "../indicators.ts";

// ── Types ────────────────────────────────────────────────────

export type TrendState = 1 | -1 | 0; // bullish / bearish / undefined

export interface SwingPoint {
  index: number;
  time: number;
  price: number;
  type: "high" | "low";
}

export interface StructureBreak {
  index: number;        // bar index where the break occurred
  time: number;         // time of the break bar
  level: number;        // price level that was broken
  levelIndex: number;   // bar index of the swing point that defined the level
  levelTime: number;    // time of the swing point
  type: "BOS" | "CHoCH";
  direction: "bullish" | "bearish";
}

export interface HeatmapBar {
  time: number;
  color: string | null;  // null = no heatmap color (not enough swing data)
  impulse: number;       // impulse magnitude (%)
  pullback: number;      // pullback magnitude (%)
  score: number;         // combined score for gradient
}

export interface SMCResult {
  swings: SwingPoint[];
  breaks: StructureBreak[];
  heatmap: HeatmapBar[];
  trend: TrendState;
}

// ── Config ────────────────────────────────────────────────────

export interface SMCConfig {
  pivotLength: number;      // bars on each side for pivot detection
  maxHistory: number;       // max swing points to track
  heatmapMode: "Combined" | "Impulse" | "Pullback";
  bullColor: string;        // bullish heatmap color
  bearColor: string;        // bearish heatmap color
}

export const SMC_DEFAULTS: SMCConfig = {
  pivotLength: 10,
  maxHistory: 100,
  heatmapMode: "Pullback",
  bullColor: "#009688",
  bearColor: "#ff9800",
};

// ── Core Logic ────────────────────────────────────────────────

/**
 * Detect swing highs and lows using pivot detection.
 * A pivot high at index i means high[i] is the highest among [i-length, i+length].
 * Confirmed `length` bars after the pivot occurs.
 */
export function detectSMCPivots(
  candles: CandleData[],
  pivotLength: number,
): { highs: PivotPoint[]; lows: PivotPoint[] } {
  const highs: PivotPoint[] = [];
  const lows: PivotPoint[] = [];

  if (candles.length < pivotLength * 2 + 1) return { highs, lows };

  for (let i = pivotLength; i < candles.length - pivotLength; i++) {
    const candidate = candles[i]!;
    let isHigh = true;
    let isLow = true;

    for (let j = i - pivotLength; j <= i + pivotLength; j++) {
      if (j === i) continue;
      if (candles[j]!.high >= candidate.high) isHigh = false;
      if (candles[j]!.low <= candidate.low) isLow = false;
      if (!isHigh && !isLow) break;
    }

    // Pivot confirmed at i + pivotLength (i.e., `pivotLength` bars after the pivot)
    const confirmIndex = i + pivotLength;
    const confirmTime = candles[confirmIndex]!.time;

    if (isHigh) {
      highs.push({ index: i, time: confirmTime, price: candidate.high, type: "high" });
    }
    if (isLow) {
      lows.push({ index: i, time: confirmTime, price: candidate.low, type: "low" });
    }
  }

  return { highs, lows };
}

/**
 * Build alternating swing sequence from pivot highs and lows.
 * Only keeps the most extreme pivot if two consecutive highs/lows occur
 * without an intervening opposite pivot (same logic as LuxAlgo).
 */
export function buildSwingSequence(
  highs: PivotPoint[],
  lows: PivotPoint[],
  maxHistory: number,
): SwingPoint[] {
  // Merge and sort by index
  const all: SwingPoint[] = [
    ...highs.map((h) => ({ index: h.index, time: h.time, price: h.price, type: "high" as const })),
    ...lows.map((l) => ({ index: l.index, time: l.time, price: l.price, type: "low" as const })),
  ].sort((a, b) => a.index - b.index);

  const swings: SwingPoint[] = [];

  for (const p of all) {
    if (swings.length === 0) {
      swings.push(p);
      continue;
    }

    const last = swings[swings.length - 1]!;

    if (p.type !== last.type) {
      // Alternating pivot: always add
      swings.push(p);
    } else {
      // Same type: keep the more extreme one
      if (p.type === "high" && p.price > last.price) {
        swings[swings.length - 1] = p;
      } else if (p.type === "low" && p.price < last.price) {
        swings[swings.length - 1] = p;
      }
      // If less extreme, skip
    }
  }

  // Trim to max history
  if (swings.length > maxHistory) {
    return swings.slice(swings.length - maxHistory);
  }

  return swings;
}

/**
 * Detect BOS (Break of Structure) and CHoCH (Change of Character).
 *
 * BOS: Price breaks a swing point in the direction of the existing trend.
 * CHoCH: Price breaks a swing point against the existing trend (trend reversal signal).
 *
 * The "level" is the most recent unbroken swing high (for bullish breaks)
 * or swing low (for bearish breaks). Once broken, it's marked as crossed
 * and won't trigger again until a new swing forms.
 */
export function detectStructureBreaks(
  candles: CandleData[],
  swings: SwingPoint[],
): { breaks: StructureBreak[]; finalTrend: TrendState } {
  const breaks: StructureBreak[] = [];

  // Track the most recent unbroken swing high and low
  let topY: number | null = null;
  let topX: number | null = null;  // swing index
  let topTime: number | null = null;
  let topCrossed = true;

  let btmY: number | null = null;
  let btmX: number | null = null;
  let btmTime: number | null = null;
  let btmCrossed = true;

  let trend: TrendState = 0;

  // Walk through candles in order, updating swing levels as we encounter them
  let swingIdx = 0;

  for (let i = 0; i < candles.length; i++) {
    // Update swing levels: if a swing point's confirmation index has been reached
    while (swingIdx < swings.length && swings[swingIdx]!.index <= i) {
      const s = swings[swingIdx]!;
      if (s.type === "high") {
        topY = s.price;
        topX = s.index;
        topTime = s.time;
        topCrossed = false;
      } else {
        btmY = s.price;
        btmX = s.index;
        btmTime = s.time;
        btmCrossed = false;
      }
      swingIdx++;
    }

    // Check for bullish break (close above swing high)
    if (topY !== null && !topCrossed && candles[i]!.close > topY) {
      topCrossed = true;
      const isChoch = trend <= 0;
      trend = 1;
      breaks.push({
        index: i,
        time: candles[i]!.time,
        level: topY,
        levelIndex: topX!,
        levelTime: topTime!,
        type: isChoch ? "CHoCH" : "BOS",
        direction: "bullish",
      });
    }

    // Check for bearish break (close below swing low)
    if (btmY !== null && !btmCrossed && candles[i]!.close < btmY) {
      btmCrossed = true;
      const isChoch = trend >= 0;
      trend = -1;
      breaks.push({
        index: i,
        time: candles[i]!.time,
        level: btmY,
        levelIndex: btmX!,
        levelTime: btmTime!,
        type: isChoch ? "CHoCH" : "BOS",
        direction: "bearish",
      });
    }
  }

  return { breaks, finalTrend: trend };
}

/**
 * Calculate candle heatmap based on impulse/pullback relationship.
 *
 * For each bar, we look at the last 3 alternating swing points:
 * - Bullish sequence: Low0 -> High1 -> Low2 (current pullback up)
 *   impulse = (High1 - Low0) / Low0 * 100
 *   pullback = (High1 - Low2) / High1 * 100  (how far price has pulled back from the high)
 *
 * - Bearish sequence: High0 -> Low1 -> High2 (current pullback down)
 *   impulse = (High0 - Low1) / High0 * 100
 *   pullback = (High2 - Low1) / Low1 * 100  (how far price has retraced from the low)
 *
 * The score maps to a gradient between bearColor and bullColor.
 */
export function calculateHeatmap(
  candles: CandleData[],
  swings: SwingPoint[],
  config: SMCConfig,
): HeatmapBar[] {
  const result: HeatmapBar[] = [];
  const { heatmapMode, bullColor, bearColor } = config;

  // Track running max for normalization
  let currMaxX = 1.0;
  let currMaxY = 1.0;

  // Build a map from candle index to the swing sequence state at that point
  // We need at least 3 swings to compute impulse/pullback
  let swingPtr = 0;

  for (let i = 0; i < candles.length; i++) {
    // Advance swing pointer to include all swings with index <= i
    while (swingPtr < swings.length && swings[swingPtr]!.index <= i) {
      swingPtr++;
    }

    // Need at least 3 swings to compute the relationship
    if (swingPtr < 3) {
      result.push({ time: candles[i]!.time, color: null, impulse: 0, pullback: 0, score: 0 });
      continue;
    }

    // Get the last 3 swings available at this point
    const s0 = swings[swingPtr - 3]!;
    const s1 = swings[swingPtr - 2]!;
    const s2 = swings[swingPtr - 1]!;

    // Update running max from historical swings (scan through all available)
    if (swingPtr >= 3) {
      for (let k = 2; k < swingPtr; k++) {
        const p0 = swings[k - 2]!;
        const p1 = swings[k - 1]!;
        const p2 = swings[k]!;

        if (p2.type === "high") {
          // Bearish: High0 -> Low1 -> High2
          const imp = (p0.price - p1.price) / p0.price * 100;
          const pull = (p2.price - p1.price) / p1.price * 100;
          if (imp > 0 && pull > 0) {
            currMaxX = Math.max(currMaxX, imp);
            currMaxY = Math.max(currMaxY, pull);
          }
        } else {
          // Bullish: Low0 -> High1 -> Low2
          const imp = (p1.price - p0.price) / p0.price * 100;
          const pull = (p1.price - p2.price) / p1.price * 100;
          if (imp > 0 && pull > 0) {
            currMaxX = Math.max(currMaxX, imp);
            currMaxY = Math.max(currMaxY, pull);
          }
        }
      }
    }

    // Current bar: use the last 3 swings + current close as the "live" swing
    const p0 = s0.price;
    const p1 = s1.price;
    const p2 = candles[i]!.close;
    const t2 = s2.type === "high" ? "low" : "high"; // opposite of last swing

    let impulse = 0;
    let pullback = 0;
    let valid = false;

    if (t2 === "high") {
      // Bullish: Low0 -> High1 -> current (pulling back from high)
      impulse = (p1 - p0) / p0 * 100;
      pullback = (p1 - p2) / p1 * 100;
      if (impulse > 0 && pullback > 0) valid = true;
    } else {
      // Bearish: High0 -> Low1 -> current (pulling back from low)
      impulse = (p0 - p1) / p0 * 100;
      pullback = (p2 - p1) / p1 * 100;
      if (impulse > 0 && pullback > 0) valid = true;
    }

    if (!valid) {
      result.push({ time: candles[i]!.time, color: null, impulse: 0, pullback: 0, score: 0 });
      continue;
    }

    // Compute score based on heatmap mode
    let score = 0;
    let minScore = 0;
    let maxScore = 0;

    if (heatmapMode === "Combined") {
      // Impulse positive = bullish (right side), negative = bearish (left side)
      // Pullback positive = bullish (top), negative = bearish (bottom)
      const px = t2 === "high" ? -impulse : impulse;
      const py = t2 === "high" ? -pullback : pullback;
      score = px + py;
      minScore = -currMaxX - currMaxY;
      maxScore = currMaxX + currMaxY;
    } else if (heatmapMode === "Impulse") {
      score = t2 === "high" ? -impulse : impulse;
      minScore = -currMaxX;
      maxScore = currMaxX;
    } else {
      // Pullback (default)
      score = t2 === "high" ? -pullback : pullback;
      minScore = -currMaxY;
      maxScore = currMaxY;
    }

    // Clamp score to [minScore, maxScore] for gradient
    const clampedScore = Math.max(minScore, Math.min(maxScore, score));
    const t = maxScore === minScore ? 0.5 : (clampedScore - minScore) / (maxScore - minScore);

    // Interpolate between bear and bull color
    const color = lerpColor(bearColor, bullColor, t);

    result.push({
      time: candles[i]!.time,
      color,
      impulse,
      pullback,
      score: clampedScore,
    });
  }

  return result;
}

// ── Color Utilities ───────────────────────────────────────────

/**
 * Linear interpolation between two hex colors.
 * t=0 returns color1, t=1 returns color2.
 */
function lerpColor(color1: string, color2: string, t: number): string {
  const c1 = hexToRgb(color1);
  const c2 = hexToRgb(color2);
  if (!c1 || !c2) return color1;

  const r = Math.round(c1.r + (c2.r - c1.r) * t);
  const g = Math.round(c1.g + (c2.g - c1.g) * t);
  const b = Math.round(c1.b + (c2.b - c1.b) * t);

  return `rgb(${r}, ${g}, ${b})`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const match = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!match) return null;
  return {
    r: parseInt(match[1]!, 16),
    g: parseInt(match[2]!, 16),
    b: parseInt(match[3]!, 16),
  };
}

// ── Main Entry Point ──────────────────────────────────────────

export function calculateSMC(
  candles: CandleData[],
  config: Partial<SMCConfig> = {},
): SMCResult {
  const cfg = { ...SMC_DEFAULTS, ...config };

  // 1. Detect pivots
  const { highs, lows } = detectSMCPivots(candles, cfg.pivotLength);

  // 2. Build alternating swing sequence
  const swings = buildSwingSequence(highs, lows, cfg.maxHistory);

  // 3. Detect BOS/CHoCH
  const { breaks, finalTrend } = detectStructureBreaks(candles, swings);

  // 4. Calculate heatmap
  const heatmap = calculateHeatmap(candles, swings, cfg);

  return {
    swings,
    breaks,
    heatmap,
    trend: finalTrend,
  };
}