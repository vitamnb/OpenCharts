/**
 * Candlestick Pattern Detection Hook
 *
 * Uses lightweight-charts-indicators candlestickPortEntries to detect
 * 44 classic Japanese candlestick patterns and render markers on the chart.
 */
import { useEffect, useRef } from "react";
import type { IChartApi, ISeriesApi, CandlestickData, Time, SeriesMarker } from "lightweight-charts";
import { createSeriesMarkers } from "lightweight-charts";
import { candlestickPortEntries } from "lightweight-charts-indicators";
import { toIndicatorCandles } from "./utils.ts";
import type { CandleData } from "../../lib/indicators.ts";

// Build a static list of pattern metadata for the UI
export interface PatternMeta {
  id: string;
  title: string;
  shortTitle: string;
  sentiment: "bullish" | "bearish" | "neutral";
}

// Classify each pattern by sentiment for grouping in the flyout
const SENTIMENT_MAP: Record<string, "bullish" | "bearish" | "neutral"> = {
  "abandoned-baby-bullish": "bullish",
  "abandoned-baby-bearish": "bearish",
  "dark-cloud-cover": "bearish",
  "doji": "neutral",
  "doji-star-bearish": "bearish",
  "doji-star-bullish": "bullish",
  "downside-tasuki-gap": "bearish",
  "dragonfly-doji": "neutral",
  "engulfing-bearish": "bearish",
  "engulfing-bullish": "bullish",
  "evening-doji-star": "bearish",
  "evening-star": "bearish",
  "falling-three-methods": "bearish",
  "falling-window": "bearish",
  "gravestone-doji": "neutral",
  "hammer": "bullish",
  "hanging-man": "bearish",
  "harami-bearish": "bearish",
  "harami-bullish": "bullish",
  "harami-cross-bearish": "bearish",
  "harami-cross-bullish": "bullish",
  "inverted-hammer": "bullish",
  "kicking-bearish": "bearish",
  "kicking-bullish": "bullish",
  "long-lower-shadow": "bullish",
  "long-upper-shadow": "bearish",
  "marubozu-black": "bearish",
  "marubozu-white": "bullish",
  "morning-doji-star": "bullish",
  "morning-star": "bullish",
  "on-neck": "bearish",
  "piercing": "bullish",
  "rising-three-methods": "bullish",
  "rising-window": "bullish",
  "shooting-star": "bearish",
  "spinning-top-black": "neutral",
  "spinning-top-white": "neutral",
  "three-black-crows": "bearish",
  "three-white-soldiers": "bullish",
  "tri-star-bearish": "bearish",
  "tri-star-bullish": "bullish",
  "tweezer-bottom": "bullish",
  "tweezer-top": "bearish",
  "upside-tasuki-gap": "bullish",
};

// Build the pattern metadata list once
export const PATTERN_LIST: PatternMeta[] = candlestickPortEntries.map((e) => {
  const ind = e.indicator as { metadata: { title: string; shortTitle: string } };
  return {
    id: e.id,
    title: ind.metadata.title,
    shortTitle: ind.metadata.shortTitle,
    sentiment: SENTIMENT_MAP[e.id] ?? "neutral",
  };
});

// Sentiment-based colour scheme (overrides library defaults)
const SENTIMENT_COLORS: Record<"bullish" | "bearish" | "neutral", string> = {
  bullish: "#22c55e",   // green-500
  bearish: "#ef4444",   // red-500
  neutral: "#eab308",   // yellow-500
};

// Marker size (1 = default, 2 = larger for readability)
const PATTERN_MARKER_SIZE = 2;

// Map id -> indicator object for quick lookup
type PatternCalculator = {
  calculate: (
    bars: CandleData[],
    inputs?: Record<string, unknown>,
  ) => {
    markers: Array<{ time: number; position: string; shape: string; color: string; text?: string; size?: number }>;
  };
};
const PATTERN_INDICATORS = Object.fromEntries(
  candlestickPortEntries.map((e) => [e.id, e.indicator]),
) as Record<string, PatternCalculator>;

export function useCandlestickPatterns(
  chartRef: React.RefObject<IChartApi | null>,
  candleSeriesRef: React.RefObject<ISeriesApi<"Candlestick"> | null>,
  chartData: CandlestickData<Time>[],
  activePatterns: string[],
  volumeData?: Array<{ time: Time; value: number }>,
): void {
  const markersRef = useRef<ReturnType<typeof createSeriesMarkers<Time>> | null>(null);

  useEffect(() => {
    if (!chartRef.current || !candleSeriesRef.current || chartData.length === 0) {
      // Clear existing markers if chart isn't ready
      if (markersRef.current) {
        markersRef.current.setMarkers([]);
      }
      return;
    }

    const indCandles = toIndicatorCandles(chartData, volumeData);

    // Build a price lookup so we can offset markers by a percentage of the candle range
    const priceLookup = new Map<number, { high: number; low: number }>();
    for (const c of chartData) {
      priceLookup.set(c.time as number, { high: c.high, low: c.low });
    }

    // Collect markers from all active patterns
    const allMarkers: SeriesMarker<Time>[] = [];

    for (const patternId of activePatterns) {
      const ind = PATTERN_INDICATORS[patternId];
      if (!ind) continue;

      try {
        const result = ind.calculate(indCandles);
        const sentiment = SENTIMENT_MAP[patternId] ?? "neutral";
        const color = SENTIMENT_COLORS[sentiment];
        if (result.markers && result.markers.length > 0) {
          // Override library marker styling with our sentiment-based scheme
          // Bullish: green arrow up, below bar (points up at the candle)
          // Bearish: red arrow down, above bar (points down at the candle)
          // Neutral: yellow circle, below bar
          for (const m of result.markers) {
            const t = m.time as number;
            const candle = priceLookup.get(t);
            const shape = sentiment === "bullish" ? "arrowUp" : sentiment === "bearish" ? "arrowDown" : "circle";

            if (candle) {
              // Position marker at a price offset from the candle, giving breathing room
              const range = candle.high - candle.low;
              const offset = range * 0.2; // 20% of candle range as gap
              if (sentiment === "bearish") {
                allMarkers.push({
                  time: t as Time,
                  position: "atPriceTop",
                  shape: shape as "arrowUp" | "arrowDown" | "circle",
                  color,
                  text: m.text,
                  size: PATTERN_MARKER_SIZE,
                  price: candle.high + offset,
                } as SeriesMarker<Time>);
              } else {
                allMarkers.push({
                  time: t as Time,
                  position: "atPriceBottom",
                  shape: shape as "arrowUp" | "arrowDown" | "circle",
                  color,
                  text: m.text,
                  size: PATTERN_MARKER_SIZE,
                  price: candle.low - offset,
                } as SeriesMarker<Time>);
              }
            } else {
              // Fallback to bar-relative positioning if candle not found
              const position = sentiment === "bearish" ? "aboveBar" : "belowBar";
              allMarkers.push({
                time: t as Time,
                position: position as "aboveBar" | "belowBar" | "inBar",
                shape: shape as "arrowUp" | "arrowDown" | "circle",
                color,
                text: m.text,
                size: PATTERN_MARKER_SIZE,
              } as SeriesMarker<Time>);
            }
          }
        }
      } catch {
        // Pattern calculation can fail on edge cases (not enough bars, etc)
        // Silently skip, don't crash the whole chart
      }
    }

    // Sort markers by time (required by lightweight-charts)
    allMarkers.sort((a, b) => (a.time as number) - (b.time as number));

    // Apply markers to the candle series
    if (!markersRef.current) {
      markersRef.current = createSeriesMarkers(candleSeriesRef.current, allMarkers);
    } else {
      markersRef.current.setMarkers(allMarkers);
    }
  }, [chartRef, candleSeriesRef, chartData, activePatterns, volumeData]);
}