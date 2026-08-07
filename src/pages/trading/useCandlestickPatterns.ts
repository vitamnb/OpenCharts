/**
 * Candlestick Pattern Detection Hook
 *
 * Uses lightweight-charts-indicators candlestickPortEntries to detect
 * 44 classic Japanese candlestick patterns and render markers on the chart.
 *
 * The library's MarkerData type declares shapes/positions that are NOT all
 * valid in lightweight-charts v5.2.0's SeriesMarker type:
 *
 *   Runtime shapes from library:  arrowDown, arrowUp, circle, square,
 *     cross, diamond, labelDown, labelUp, triangleDown, triangleUp
 *   Valid SeriesMarkerShape:      arrowDown, arrowUp, circle, square
 *   Invalid shapes:              cross, diamond, labelDown, labelUp,
 *                                triangleDown, triangleUp
 *
 *   Runtime positions from library: aboveBar, belowBar, inBar, top_right
 *   Valid SeriesMarkerPosition:    aboveBar, belowBar, inBar,
 *                                atPriceTop, atPriceBottom, atPriceMiddle
 *   Invalid positions:             top_right
 *
 * We override ALL shape/position values with our sentiment-based mapping:
 *   - Bullish patterns: green arrowUp below the bar
 *   - Bearish patterns: red arrowDown above the bar
 *   - Neutral patterns: yellow circle in-bar
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

// Map id -> indicator object for quick lookup.
// The library's MarkerData type uses `position: string` and `shape: string`
// because it can emit values not in SeriesMarkerShape (e.g. "labelUp",
// "triangleUp", "diamond", "cross", "xcross") and positions not in
// SeriesMarkerPosition (e.g. "top_right"). We override all of these
// with our own validated shape/position, so the loose types are fine.
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
          // Override library marker styling with our sentiment-based scheme.
          // This is necessary because the library can emit shapes ("labelUp",
          // "triangleUp", "diamond", "cross", "xcross") and positions
          // ("top_right") that are NOT valid in lightweight-charts v5's
          // SeriesMarkerShape/SeriesMarkerBarPosition types.
          for (const m of result.markers) {
            const t = m.time as number;

            // Bullish: green arrowUp below bar (arrow pointing up at the buy signal)
            // Bearish: red arrowDown above bar (arrow pointing down at the sell signal)
            // Neutral: yellow circle inside the bar
            const position: "aboveBar" | "belowBar" | "inBar" =
              sentiment === "bullish" ? "belowBar" : sentiment === "bearish" ? "aboveBar" : "inBar";
            const shape: "arrowUp" | "arrowDown" | "circle" =
              sentiment === "bullish" ? "arrowUp" : sentiment === "bearish" ? "arrowDown" : "circle";

            allMarkers.push({
              time: t as Time,
              position,
              shape,
              color,
              text: m.text,
              size: PATTERN_MARKER_SIZE,
            });
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