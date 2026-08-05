/**
 * VWAP+RSI S/R Confluence Indicator Hook
 *
 * Composite overlay indicator that combines:
 * 1. Signal stack: VWAP position + RSI momentum -> candle colours
 * 2. Location filter: Auto-detected S/R zones from pivot highs/lows
 * 3. Confluence markers: BULL/BEAR/X/! where signal stack and location agree
 *
 * Follows the useCandlestickPatterns.ts pattern for markers, but also
 * modifies candle colours per-bar and renders S/R zone line series.
 */
import { useEffect, useRef } from "react";
import type {
  IChartApi,
  ISeriesApi,
  CandlestickData,
  Time,
  SeriesMarker,
  LineData,
} from "lightweight-charts";
import { LineSeries, LineStyle, createSeriesMarkers } from "lightweight-charts";
import {
  vwapAnchored,
  rsiCustom,
  detectPivots,
  clusterZones,
  vwapRsiConfluence,
  type ConfluenceBar,
  type SRZone,
} from "../../lib/indicators.ts";
import { toIndicatorCandles } from "./utils.ts";

export interface VwapRsiSrParams {
  vwapAnchor: string;
  rsiLength: number;
  rsiMid: number;
  pivotLen: number;
  srLookback: number;
  srTolerance: number;
  maxZones: number;
  srExtend: number;
}

const DEFAULT_PARAMS: VwapRsiSrParams = {
  vwapAnchor: "1D",
  rsiLength: 21,
  rsiMid: 50,
  pivotLen: 5,
  srLookback: 50,
  srTolerance: 0.3,
  maxZones: 8,
  srExtend: 20,
};

// Colours for confluence candle states
const BULL_COLOR = "#0ecb81";
const BEAR_COLOR = "#f6465d";
const NEUTRAL_COLOR = "#888888";

// S/R zone line colours
const SUPPORT_LINE = "rgba(14, 203, 129, 0.6)";
const RESISTANCE_LINE = "rgba(246, 70, 93, 0.6)";

// Marker colours
const BULL_MARKER = "#0ecb81";
const BEAR_MARKER = "#f6465d";
const NOTRADE_MARKER = "#666666";
const COUNTER_MARKER = "#f0b90b";

export function useVwapRsiConfluence(
  chartRef: React.RefObject<IChartApi | null>,
  candleSeriesRef: React.RefObject<ISeriesApi<"Candlestick"> | null>,
  chartData: CandlestickData<Time>[],
  enabled: boolean,
  params: Partial<VwapRsiSrParams>,
  volumeData?: Array<{ time: Time; value: number }>,
): void {
  const markersRef = useRef<ReturnType<typeof createSeriesMarkers<Time>> | null>(null);
  const zoneSeriesRef = useRef<ISeriesApi<"Line">[]>([]);
  const vwapSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const originalDataRef = useRef<CandlestickData<Time>[]>([]);

  useEffect(() => {
    const chart = chartRef.current;
    const series = candleSeriesRef.current;

    // Cleanup function: remove all series and restore original candles
    const cleanup = () => {
      // Remove zone line series
      for (const s of zoneSeriesRef.current) {
        try {
          chart?.removeSeries(s);
        } catch {
          // already removed
        }
      }
      zoneSeriesRef.current = [];

      // Remove VWAP line
      if (vwapSeriesRef.current) {
        try {
          chart?.removeSeries(vwapSeriesRef.current);
        } catch {
          // already removed
        }
        vwapSeriesRef.current = null;
      }

      // Clear markers
      if (markersRef.current) {
        markersRef.current.setMarkers([]);
      }

      // Restore original candle data
      if (series && originalDataRef.current.length > 0) {
        series.setData(originalDataRef.current);
        originalDataRef.current = [];
      }
    };

    if (!chart || !series || chartData.length === 0 || !enabled) {
      cleanup();
      return;
    }

    const p = { ...DEFAULT_PARAMS, ...params };
    const indCandles = toIndicatorCandles(chartData, volumeData);

    if (indCandles.length < p.rsiLength + p.pivotLen * 2 + 1) {
      // Not enough data for calculations
      cleanup();
      return;
    }

    // Store original candle data for restoration on cleanup
    originalDataRef.current = chartData;

    // ── 1. Calculate VWAP ──────────────────────────────────
    const vwapData = vwapAnchored(
      indCandles,
      p.vwapAnchor as "1D" | "1W" | "1M" | "12M",
    );

    // ── 2. Calculate RSI ───────────────────────────────────
    const rsiData = rsiCustom(indCandles, p.rsiLength, "close");

    // ── 3. Detect pivots and cluster into zones ────────────
    const { highs, lows } = detectPivots(indCandles, p.pivotLen, p.pivotLen);

    // Only use pivots within the lookback window
    const lookbackStart = Math.max(0, indCandles.length - p.srLookback);
    const recentHighs = highs.filter((h) => h.index >= lookbackStart);
    const recentLows = lows.filter((l) => l.index >= lookbackStart);

    const resistances = clusterZones(recentHighs, p.srTolerance, p.maxZones);
    const supports = clusterZones(recentLows, p.srTolerance, p.maxZones);

    // ── 4. Calculate confluence state per bar ──────────────
    const confluence = vwapRsiConfluence(
      indCandles,
      vwapData,
      rsiData,
      supports,
      resistances,
      p.rsiMid,
      p.srTolerance,
    );

    // ── 5. Apply candle colours ────────────────────────────
    const confluenceMap = new Map<number, ConfluenceBar>();
    for (const cb of confluence) {
      confluenceMap.set(cb.time, cb);
    }

    const colouredData: CandlestickData<Time>[] = chartData.map((c) => {
      const cb = confluenceMap.get(c.time as number);
      if (!cb) return c;

      const color = cb.state === "bullish" ? BULL_COLOR
        : cb.state === "bearish" ? BEAR_COLOR
        : NEUTRAL_COLOR;

      return {
        ...c,
        color,
        wickColor: color,
        borderColor: color,
      };
    });

    series.setData(colouredData);

    // ── 6. Render VWAP line ────────────────────────────────
    // Remove old VWAP series if it exists
    if (vwapSeriesRef.current) {
      try {
        chart.removeSeries(vwapSeriesRef.current);
      } catch {
        // already removed
      }
    }

    const vwapLineData: LineData[] = vwapData.map((v) => ({
      time: v.time as Time,
      value: v.value,
    }));

    if (vwapLineData.length > 0) {
      vwapSeriesRef.current = chart.addSeries(LineSeries, {
        color: "#42a5f5",
        lineWidth: 2,
        lineStyle: LineStyle.Solid,
        priceScaleId: "right",
        priceLineVisible: false,
        lastValueVisible: false,
      }, 0);
      vwapSeriesRef.current.setData(vwapLineData);
    }

    // ── 7. Render S/R zone line series ─────────────────────
    // Remove old zone series
    for (const s of zoneSeriesRef.current) {
      try {
        chart.removeSeries(s);
      } catch {
        // already removed
      }
    }
    zoneSeriesRef.current = [];

    // Calculate extension time: add srExtend bars worth of time from the last bar
    const lastTime = chartData[chartData.length - 1]!.time as number;
    const firstTime = chartData[0]!.time as number;
    const barInterval = chartData.length > 1
      ? (chartData[1]!.time as number) - (chartData[0]!.time as number)
      : 0;

    const renderZone = (zone: SRZone, lineColor: string) => {
      const zoneStart = Math.max(zone.firstTime, firstTime);
      const zoneEnd = Math.max(zone.lastTime, lastTime) + p.srExtend * barInterval;

      // Top edge of zone
      const topData: LineData[] = [
        { time: zoneStart as Time, value: zone.price },
        { time: zoneEnd as Time, value: zone.price },
      ];

      // Bottom edge (slightly below for visual band effect)
      // Use a small offset based on tolerance to create a visible band
      const bandOffset = zone.price * (p.srTolerance / 100) * 0.5;
      const bottomData: LineData[] = [
        { time: zoneStart as Time, value: zone.price - bandOffset },
        { time: zoneEnd as Time, value: zone.price - bandOffset },
      ];

      const topSeries = chart.addSeries(LineSeries, {
        color: lineColor,
        lineWidth: 1,
        lineStyle: LineStyle.Solid,
        priceScaleId: "right",
        priceLineVisible: false,
        lastValueVisible: false,
      }, 0);
      topSeries.setData(topData);
      zoneSeriesRef.current.push(topSeries);

      const botSeries = chart.addSeries(LineSeries, {
        color: lineColor,
        lineWidth: 1,
        lineStyle: LineStyle.Solid,
        priceScaleId: "right",
        priceLineVisible: false,
        lastValueVisible: false,
      }, 0);
      botSeries.setData(bottomData);
      zoneSeriesRef.current.push(botSeries);
    };

    for (const s of supports) {
      if (s.touches >= 1) renderZone(s, SUPPORT_LINE);
    }
    for (const r of resistances) {
      if (r.touches >= 1) renderZone(r, RESISTANCE_LINE);
    }

    // ── 8. Render confluence markers ───────────────────────
    const markers: SeriesMarker<Time>[] = [];

    for (const cb of confluence) {
      if (!cb.signal) continue;

      const t = cb.time as Time;
      let marker: SeriesMarker<Time>;

      switch (cb.signal) {
        case "bull":
          marker = {
            time: t,
            position: "belowBar",
            shape: "arrowUp",
            color: BULL_MARKER,
            text: "BULL",
            size: 1,
          };
          break;
        case "bear":
          marker = {
            time: t,
            position: "aboveBar",
            shape: "arrowDown",
            color: BEAR_MARKER,
            text: "BEAR",
            size: 1,
          };
          break;
        case "notrade":
          marker = {
            time: t,
            position: "inBar",
            shape: "circle",
            color: NOTRADE_MARKER,
            text: "X",
            size: 1,
          };
          break;
        case "counter":
          marker = {
            time: t,
            position: "aboveBar",
            shape: "circle",
            color: COUNTER_MARKER,
            text: "!",
            size: 1,
          };
          break;
        default:
          continue;
      }

      markers.push(marker);
    }

    // Sort markers by time (required by lightweight-charts)
    markers.sort((a, b) => (a.time as number) - (b.time as number));

    if (!markersRef.current) {
      markersRef.current = createSeriesMarkers(series, markers);
    } else {
      markersRef.current.setMarkers(markers);
    }

    return cleanup;
  }, [chartRef, candleSeriesRef, chartData, enabled, params, volumeData]);
}