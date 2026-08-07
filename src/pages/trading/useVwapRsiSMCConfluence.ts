/**
 * VWAP+RSI + SMC Confluence Indicator Hook
 *
 * Composite overlay that replaces S/R zones with SMC market structure:
 * 1. Signal stack: VWAP position + RSI momentum -> directional bias
 * 2. Location filter: SMC market structure (BOS/CHoCH, swing points) -> structural context
 * 3. Confluence markers: BULL/BEAR/X/! where signal stack and market structure agree
 * 4. Candle heatmap: SMC impulse/pullback coloring (optional)
 * 5. VWAP line, swing point markers, BOS/CHoCH dashed lines
 *
 * When both layers agree (trend aligned + VWAP+RSI aligned) = strong signal.
 * When they conflict = counter-trend (higher risk) or no-trade.
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
  vwapRsiSMCConfluence,
  type CandleData,
} from "../../lib/indicators.ts";
import {
  calculateSMC,
  type SMCConfig,
} from "../../lib/indicators/smc-market-structure.ts";
import { toIndicatorCandles, aggregateCandlesForSMC } from "./utils.ts";
import { TF_INTERVAL_MS, type Timeframe } from "./constants.ts";

export interface VwapRsiSmcParams {
  vwapAnchor: string;
  rsiLength: number;
  rsiMid: number;
  pivotLength: number;
  maxHistory: number;
  swingTolerance: number;
  heatmapMode: "Combined" | "Impulse" | "Pullback";
  showVwapLine: boolean;
  showSwings: boolean;
  showBreaks: boolean;
  showHeatmap: boolean;
  showWeakSignals: boolean;
  breakLookback: number;
  swingLookback: number;
  /** Higher timeframe for SMC structure analysis (e.g. "4h").
   *  When set and higher than the chart timeframe, candles are aggregated
   *  to this TF for swing/BOS/CHoCH detection, while VWAP/RSI stay on the
   *  chart timeframe. Empty string or same-as-chart = no HTF aggregation. */
  structureTimeframe: string;
  useAtrTolerance: boolean;
  atrMultiplier: number;
  chopFilter: boolean;
  requireHtfAlignment: boolean;
}

const DEFAULT_PARAMS: VwapRsiSmcParams = {
  vwapAnchor: "1D",
  rsiLength: 21,
  rsiMid: 50,
  pivotLength: 10,
  maxHistory: 100,
  swingTolerance: 0.3,
  heatmapMode: "Pullback",
  showVwapLine: true,
  showSwings: true,
  showBreaks: true,
  showHeatmap: true,
  showWeakSignals: false,
  breakLookback: 5,
  swingLookback: 15,
  structureTimeframe: "",
  useAtrTolerance: true,
  atrMultiplier: 0.5,
  chopFilter: true,
  requireHtfAlignment: true,
};

// Confluence candle colours
const BULL_COLOR = "#0ecb81";
const BEAR_COLOR = "#f6465d";
const NOTRADE_MARKER = "#ff9800";
const COUNTER_MARKER = "#f0b90b";
const VWAP_COLOR = "#42a5f5";

// Swing point colours
const SWING_HIGH_COLOR = "#ff9800";
const SWING_LOW_COLOR = "#26a69a";

// BOS/CHoCH line colours
const BOS_COLOR = "#42a5f5";
const CHOCH_COLOR = "#e040fb";

// Marker colours
const BULL_MARKER = "#0ecb81";
const BEAR_MARKER = "#f6465d";

export function useVwapRsiSMCConfluence(
  chartRef: React.RefObject<IChartApi | null>,
  candleSeriesRef: React.RefObject<ISeriesApi<"Candlestick"> | null>,
  chartData: CandlestickData<Time>[],
  enabled: boolean,
  params: Partial<VwapRsiSmcParams>,
  volumeData: Array<{ time: Time; value: number }> | undefined,
  timeframe?: Timeframe,
): void {
  const markersRef = useRef<ReturnType<typeof createSeriesMarkers<Time>> | null>(null);
  const breakSeriesRef = useRef<ISeriesApi<"Line">[]>([]);
  const vwapSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const originalDataRef = useRef<CandlestickData<Time>[]>([]);

  useEffect(() => {
    const chart = chartRef.current;
    const series = candleSeriesRef.current;

    const cleanup = () => {
      for (const s of breakSeriesRef.current) {
        try { chart?.removeSeries(s); } catch { /* already removed */ }
      }
      breakSeriesRef.current = [];

      if (vwapSeriesRef.current) {
        try { chart?.removeSeries(vwapSeriesRef.current); } catch { /* already removed */ }
        vwapSeriesRef.current = null;
      }

      if (markersRef.current) {
        markersRef.current.setMarkers([]);
      }

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
    const indCandles: CandleData[] = toIndicatorCandles(chartData, volumeData);

    if (indCandles.length < p.rsiLength + p.pivotLength * 2 + 1) {
      cleanup();
      return;
    }

    originalDataRef.current = chartData;

    // ── HTF aggregation ──────────────────────────────────
    // If structureTimeframe is set and higher than the chart timeframe,
    // aggregate chart candles to that TF for SMC structure analysis.
    const currentMs = timeframe ? (TF_INTERVAL_MS[timeframe] ?? 0) : 0;
    const stfMs = p.structureTimeframe ? (TF_INTERVAL_MS[p.structureTimeframe as Timeframe] ?? 0) : 0;
    const useHTF = stfMs > 0 && currentMs > 0 && stfMs > currentMs;
    const smcCandles: CandleData[] = useHTF
      ? aggregateCandlesForSMC(indCandles, stfMs, currentMs)
      : indCandles;

    // ── 1. Calculate VWAP ──────────────────────────────────
    const vwapData = vwapAnchored(
      indCandles,
      p.vwapAnchor as "1D" | "1W" | "1M" | "12M",
    );

    // ── 2. Calculate RSI ───────────────────────────────────
    const rsiData = rsiCustom(indCandles, p.rsiLength, "close");

    // ── 3. Calculate SMC Market Structure ─────────────────
    const smcConfig: Partial<SMCConfig> = {
      pivotLength: p.pivotLength,
      maxHistory: p.maxHistory,
      heatmapMode: p.heatmapMode,
    };
    const smcResult = calculateSMC(smcCandles, smcConfig);

    // ── 4. Calculate SMC Confluence ────────────────────────
    const confluence = vwapRsiSMCConfluence(
      indCandles,
      vwapData,
      rsiData,
      smcResult.swings,
      smcResult.breaks,
      smcResult.trend,
      p.rsiMid,
      p.swingTolerance,
      p.breakLookback,
      p.swingLookback,
      smcCandles !== indCandles ? smcCandles : undefined,
      {
        useAtrTolerance: p.useAtrTolerance,
        atrMultiplier: p.atrMultiplier,
        chopFilter: p.chopFilter,
        requireHtfAlignment: p.requireHtfAlignment,
      },
    );

    // ── 5. Apply candle colours (heatmap only or signal only) ─────
    const confluenceMap = new Map(confluence.map(c => [c.time, c]));
    const heatmapMap = new Map(smcResult.heatmap.map(h => [h.time, h]));

    const colouredData: CandlestickData<Time>[] = chartData.map((c) => {
      const cb = confluenceMap.get(c.time as number);
      const hm = heatmapMap.get(c.time as number);

      let color: string | undefined;

      if (p.showHeatmap && hm?.color) {
        // SMC heatmap color as base
        color = hm.color;
      } else if (cb?.signal) {
        // Only colour candles that actually have a confluence signal
        color = cb.signal === "bull" ? BULL_COLOR
          : cb.signal === "bear" ? BEAR_COLOR
          : cb.signal === "counter" ? COUNTER_MARKER
          : NOTRADE_MARKER;
      }

      if (!color) return c;

      return { ...c, color, wickColor: color, borderColor: color };
    });

    series.setData(colouredData);

    // ── 6. Render VWAP line ────────────────────────────────
    if (vwapSeriesRef.current) {
      try { chart.removeSeries(vwapSeriesRef.current); } catch { /* */ }
    }

    const vwapLineData: LineData[] = vwapData.map(v => ({
      time: v.time as Time,
      value: v.value,
    }));

    if (vwapLineData.length > 0 && p.showVwapLine) {
      vwapSeriesRef.current = chart.addSeries(LineSeries, {
        color: VWAP_COLOR,
        lineWidth: 2,
        lineStyle: LineStyle.Solid,
        priceScaleId: "right",
        priceLineVisible: false,
        lastValueVisible: false,
        pointMarkersVisible: false,
      }, 0);
      vwapSeriesRef.current.setData(vwapLineData);
    }

    // ── 7. Render swing point markers ──────────────────────
    // Render swing points as SeriesMarkers (one marker per swing point)
    // instead of one LineSeries per dot. Swing highs get a downward arrow
    // above the bar; swing lows get an upward arrow below the bar.
    const swingMarkers: SeriesMarker<Time>[] = [];
    if (p.showSwings) {
      for (const sw of smcResult.swings) {
        const isHigh = sw.type === "high";
        swingMarkers.push({
          time: sw.time as Time,
          position: isHigh ? "aboveBar" : "belowBar",
          shape: isHigh ? "arrowDown" : "arrowUp",
          color: isHigh ? SWING_HIGH_COLOR : SWING_LOW_COLOR,
          size: 1,
        });
      }
    }

    // ── 8. Render BOS/CHoCH lines ──────────────────────────
    for (const s of breakSeriesRef.current) {
      try { chart.removeSeries(s); } catch { /* */ }
    }
    breakSeriesRef.current = [];

    if (p.showBreaks) {
      for (const br of smcResult.breaks) {
        const color = br.type === "CHoCH" ? CHOCH_COLOR : BOS_COLOR;
        const lineData: LineData[] = [
          { time: br.levelTime as Time, value: br.level },
          { time: br.time as Time, value: br.level },
        ];

        const lineSeries = chart.addSeries(LineSeries, {
          color,
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          priceScaleId: "right",
          priceLineVisible: false,
          lastValueVisible: false,
          pointMarkersVisible: false,
        }, 0);
        lineSeries.setData(lineData);
        breakSeriesRef.current.push(lineSeries);
      }
    }

    // ── 9. Render confluence markers + swing markers ─────
    const markers: SeriesMarker<Time>[] = [...swingMarkers];

    for (const cb of confluence) {
      if (!cb.signal) continue;
      if (cb.strength !== "strong" && !p.showWeakSignals) continue;

      const t = cb.time as Time;
      let marker: SeriesMarker<Time>;

      switch (cb.signal) {
        case "bull":
          marker = {
            time: t,
            position: "belowBar",
            shape: "arrowUp",
            color: BULL_MARKER,
            size: 2,
          };
          break;
        case "bear":
          marker = {
            time: t,
            position: "aboveBar",
            shape: "arrowDown",
            color: BEAR_MARKER,
            size: 2,
          };
          break;
        case "counter":
          marker = {
            time: t,
            position: "aboveBar",
            shape: "circle",
            color: COUNTER_MARKER,
            size: 2,
          };
          break;
        default:
          continue;
      }

      markers.push(marker);
    }

    markers.sort((a, b) => (a.time as number) - (b.time as number));

    if (!markersRef.current) {
      markersRef.current = createSeriesMarkers(series, markers);
    } else {
      markersRef.current.setMarkers(markers);
    }

    return cleanup;
  }, [chartRef, candleSeriesRef, chartData, enabled, params, volumeData, timeframe]);
}