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
import { toIndicatorCandles } from "./utils.ts";

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
};

// Confluence candle colours
const BULL_COLOR = "#0ecb81";
const BEAR_COLOR = "#f6465d";
const NEUTRAL_COLOR = "#ffffff";

// VWAP line colour
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
const NOTRADE_MARKER = "#ff9800";
const COUNTER_MARKER = "#f0b90b";

export function useVwapRsiSMCConfluence(
  chartRef: React.RefObject<IChartApi | null>,
  candleSeriesRef: React.RefObject<ISeriesApi<"Candlestick"> | null>,
  chartData: CandlestickData<Time>[],
  enabled: boolean,
  params: Partial<VwapRsiSmcParams>,
  volumeData?: Array<{ time: Time; value: number }>,
): void {
  const markersRef = useRef<ReturnType<typeof createSeriesMarkers<Time>> | null>(null);
  const swingSeriesRef = useRef<ISeriesApi<"Line">[]>([]);
  const breakSeriesRef = useRef<ISeriesApi<"Line">[]>([]);
  const vwapSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const originalDataRef = useRef<CandlestickData<Time>[]>([]);

  useEffect(() => {
    const chart = chartRef.current;
    const series = candleSeriesRef.current;

    const cleanup = () => {
      for (const s of swingSeriesRef.current) {
        try { chart?.removeSeries(s); } catch { /* already removed */ }
      }
      swingSeriesRef.current = [];

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
    const smcResult = calculateSMC(indCandles, smcConfig);

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
    );

    // ── 5. Apply candle colours (heatmap or confluence) ─────
    const confluenceMap = new Map(confluence.map(c => [c.time, c]));
    const heatmapMap = new Map(smcResult.heatmap.map(h => [h.time, h]));

    const colouredData: CandlestickData<Time>[] = chartData.map((c) => {
      const cb = confluenceMap.get(c.time as number);
      const hm = heatmapMap.get(c.time as number);

      let color: string | undefined;

      if (p.showHeatmap && hm?.color) {
        // Use SMC heatmap color as base
        color = hm.color;
      } else if (cb) {
        // Fall back to confluence state coloring
        color = cb.state === "bullish" ? BULL_COLOR
          : cb.state === "bearish" ? BEAR_COLOR
          : NEUTRAL_COLOR;
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
    for (const s of swingSeriesRef.current) {
      try { chart.removeSeries(s); } catch { /* */ }
    }
    swingSeriesRef.current = [];

    if (p.showSwings) {
      for (const sw of smcResult.swings) {
        const color = sw.type === "high" ? SWING_HIGH_COLOR : SWING_LOW_COLOR;
        const dotData: LineData[] = [
          { time: sw.time as Time, value: sw.price },
        ];

        const dotSeries = chart.addSeries(LineSeries, {
          color,
          lineWidth: 1,
          lineStyle: LineStyle.Solid,
          pointMarkersVisible: true,
          priceScaleId: "right",
          priceLineVisible: false,
          lastValueVisible: false,
        }, 0);
        dotSeries.setData(dotData);
        swingSeriesRef.current.push(dotSeries);
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

    // ── 9. Render confluence markers ──────────────────────
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

    markers.sort((a, b) => (a.time as number) - (b.time as number));

    if (!markersRef.current) {
      markersRef.current = createSeriesMarkers(series, markers);
    } else {
      markersRef.current.setMarkers(markers);
    }

    return cleanup;
  }, [chartRef, candleSeriesRef, chartData, enabled, params, volumeData]);
}