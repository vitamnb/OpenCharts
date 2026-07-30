import { useEffect, useRef, useState } from "react";
import type { IChartApi, ISeriesApi, CandlestickData, Time } from "lightweight-charts";
import {
  LineStyle,
  LineSeries,
  HistogramSeries,
} from "lightweight-charts";
import {
  INDICATOR_REGISTRY,
  type IndicatorType,
  type IndicatorParams,
  type IndicatorAppearance,
  type IndicatorParamValue,
  LIB_KEY,
} from "../../lib/indicators.ts";
import { plotToLineData, type LibInputConfig } from "../../lib/indicator-adapter.ts";
import * as IndLib from "lightweight-charts-indicators";
import { toIndicatorCandles } from "./utils.ts";
import { CHART_COLORS } from "./constants.ts";

// Map indicator type -> pane index (0 = main chart, 1+ = below panes)
function getPaneIndex(type: IndicatorType, belowIndicators: IndicatorType[]): number {
  const cfg = INDICATOR_REGISTRY.find((r) => r.type === type);
  if (cfg?.pane !== "below") return 0;
  return belowIndicators.indexOf(type) + 1;
}

export function useIndicators(
  chartRef: React.RefObject<IChartApi | null>,
  candleSeriesRef: React.RefObject<ISeriesApi<"Candlestick"> | null>,
  chartData: CandlestickData<Time>[],
  activeIndicators: IndicatorType[],
  isDark: boolean,
  indicatorParams: Partial<Record<IndicatorType, IndicatorParams>>,
  indicatorAppearance: Partial<Record<IndicatorType, IndicatorAppearance>>,
  hiddenIndicators: IndicatorType[] = [],
  volumeData?: Array<{ time: Time; value: number }>,
): { paneMeta: Array<{ type: IndicatorType; label: string; color: string; paneIndex: number }> } {
  const indicatorSeriesRef = useRef<Map<string, ISeriesApi<"Line"> | ISeriesApi<"Histogram">>>(
    new Map(),
  );
  const colors = isDark ? CHART_COLORS.dark : CHART_COLORS.light;

  // Track which below-pane indicators are active and their pane indices
  // so the React layer can render HTML nametags over each pane.
  const [paneMeta, setPaneMeta] = useState<Array<{ type: IndicatorType; label: string; color: string; paneIndex: number }>>([]);

  // Track the number of below-pane indicators we last set stretch factors for.
  // Only set defaults for newly-added panes — otherwise we'd wipe any
  // user-driven separator drag every time an indicator is added or chart data
  // updates (chartData changes on every live tick).
  const lastPaneCountRef = useRef<number>(0);

  useEffect(() => {
    if (!chartRef.current || !candleSeriesRef.current || chartData.length === 0) return;

    const chart = chartRef.current;
    const indCandles = toIndicatorCandles(chartData, volumeData);

    // Helper to get param value (fall back to default if not set)
    const getParam = (type: IndicatorType, key: string): IndicatorParamValue => {
      const params = indicatorParams[type];
      if (params && params[key] !== undefined) return params[key]!;
      const cfg = INDICATOR_REGISTRY.find((r) => r.type === type);
      return cfg?.defaultParams[key] ?? 0;
    };

    // Helper to get a numeric param (for hand-rolled indicators that expect number)
    const getNumParam = (type: IndicatorType, key: string): number => {
      const v = getParam(type, key);
      return typeof v === "number" ? v : Number(v) || 0;
    };

    // Helper to get appearance value (fall back to default if not set)
    const getAppearance = (type: IndicatorType): IndicatorAppearance => {
      const app = indicatorAppearance[type];
      const cfg = INDICATOR_REGISTRY.find((r) => r.type === type);
      return {
        color: app?.color ?? cfg?.color ?? "#888",
        lineWidth: app?.lineWidth ?? 1,
        lineStyle: app?.lineStyle ?? "solid",
        visible: app?.visible ?? true,
      };
    };

    // Convert line style string to lightweight-charts LineStyle enum
    const toLineStyle = (s?: "solid" | "dashed" | "dotted"): LineStyle => {
      if (s === "dashed") return LineStyle.Dashed;
      if (s === "dotted") return LineStyle.Dotted;
      return LineStyle.Solid;
    };

    // ── Library adapter helper ─────────────────────────────────
    // Generic function to wire any library indicator to chart series.
    type LibInd = {
      calculate: (bars: typeof indCandles, inputs: Record<string, unknown>) => {
        plots: Record<string, Array<{ time: number; value: number | null }>>;
        fills: unknown[];
        markers: unknown;
      };
      inputConfig: LibInputConfig[];
      plotConfig: { id: string; title: string; color: string; lineWidth: number; display?: string; style?: string }[];
      hlineConfig?: { id: string; price: number; color: string; linestyle: string; title: string }[];
    };

    // Get the library indicator object for a given type
    const getLibInd = (type: IndicatorType): LibInd | null => {
      const libKey = LIB_KEY[type];
      if (!libKey) return null;
      return (IndLib as Record<string, unknown>)[libKey] as LibInd;
    };

    // Build inputs object from our params, mapping our param keys to the library's inputConfig ids
    const buildLibInputs = (type: IndicatorType, libInd: LibInd): Record<string, unknown> => {
      const inputs: Record<string, unknown> = {};
      for (const inp of libInd.inputConfig) {
        const val = getParam(type, inp.id);
        inputs[inp.id] = val !== undefined ? val : inp.defval;
      }
      return inputs;
    };

    // Add a library indicator to the chart. Returns a map of series keys.
    const addLibIndicator = (type: IndicatorType, paneIndex: number) => {
      const libInd = getLibInd(type);
      if (!libInd) return;

      const inputs = buildLibInputs(type, libInd);
      const result = libInd.calculate(indCandles, inputs);
      const app = getAppearance(type);
      const ls = toLineStyle(app.lineStyle);
      const priceScaleId = 'right';

      // Plot colors: use the indicator's configured color for plot0, library colors for secondary plots
      const plotColors: Record<string, string> = {};
      for (const pc of libInd.plotConfig) {
        plotColors[pc.id] = pc.id === "plot0" ? app.color : (pc.color || "#888");
      }

      // Add each visible plot as a series
      for (const pc of libInd.plotConfig) {
        if (pc.display === "none") continue;
        const plotData = result.plots[pc.id] ?? [];
        const lineData = plotToLineData(plotData);
        if (lineData.length === 0) continue;

          // For overlay indicators, use paneIndex 0 (main chart). For below-pane indicators, use the assigned paneIndex.
        const cfg = INDICATOR_REGISTRY.find((r) => r.type === type);
        const targetPane = cfg?.pane === "overlay" ? 0 : paneIndex;

        // Determine series type: histogram for MACD plot0, line for everything else
        const isHistogram = type === "MACD" && pc.id === "plot0";

        if (isHistogram) {
          const s = chart.addSeries(HistogramSeries, {
            priceScaleId,
            priceLineVisible: false,
            lastValueVisible: false,
          }, targetPane);
          s.setData(lineData.map((p) => ({
            time: p.time as Time,
            value: p.value,
            color: p.value >= 0 ? colors.up + "99" : colors.down + "99",
          })));
          indicatorSeriesRef.current.set(`${type}-${pc.id}`, s);
        } else if (pc.style === "linebr") {
          // Line-break style (e.g. Supertrend): split into contiguous non-null segments
          // so the line doesn't connect across gaps where the other trend is active
          const segments: Array<Array<{ time: number; value: number }>> = [];
          let current: Array<{ time: number; value: number }> = [];
          for (const p of plotData) {
            if (p.value !== null && p.value !== undefined && !Number.isNaN(p.value)) {
              current.push({ time: p.time, value: p.value });
            } else {
              if (current.length > 0) {
                segments.push(current);
                current = [];
              }
            }
          }
          if (current.length > 0) segments.push(current);

          for (let si = 0; si < segments.length; si++) {
            const seg = segments[si]!;
            const s = chart.addSeries(LineSeries, {
              color: plotColors[pc.id] ?? app.color,
              lineWidth: (pc.lineWidth || app.lineWidth) as 1 | 2 | 3 | 4,
              lineStyle: ls,
              priceScaleId,
            priceLineVisible: false,
            lastValueVisible: false,
          }, targetPane);
            s.setData(seg.map((p) => ({ time: p.time as Time, value: p.value })));
            indicatorSeriesRef.current.set(`${type}-${pc.id}-${si}`, s);
          }
        } else {
          const s = chart.addSeries(LineSeries, {
            color: plotColors[pc.id] ?? app.color,
            lineWidth: (pc.lineWidth || app.lineWidth) as 1 | 2 | 3 | 4,
            lineStyle: ls,
            priceScaleId,
            priceLineVisible: false,
            lastValueVisible: false,
          }, targetPane);
          s.setData(lineData.map((p) => ({ time: p.time as Time, value: p.value })));
          indicatorSeriesRef.current.set(`${type}-${pc.id}`, s);
        }
      }

      // Add hlines (reference lines like RSI 70/30) if the library provides them
      if (libInd.hlineConfig) {
        for (const hl of libInd.hlineConfig) {
          const hlData = plotToLineData(result.plots[hl.id] ?? []);
          if (hlData.length > 0) {
            const s = chart.addSeries(LineSeries, {
              color: hl.color,
              lineWidth: 1,
              lineStyle: LineStyle.Dashed,
              priceScaleId,
              priceLineVisible: false,
              lastValueVisible: false,
            }, paneIndex);
            s.setData(hlData.map((p) => ({ time: p.time as Time, value: p.value })));
            indicatorSeriesRef.current.set(`${type}-${hl.id}`, s);
          } else {
            // Static hline (constant value like 70/30)
            const refData = plotToLineData(result.plots["plot0"] ?? []);
            if (refData.length > 0) {
              const s = chart.addSeries(LineSeries, {
                color: hl.color,
                lineWidth: 1,
                lineStyle: LineStyle.Dashed,
              priceScaleId,
              priceLineVisible: false,
              lastValueVisible: false,
            }, paneIndex);
              s.setData(refData.map((p) => ({ time: p.time as Time, value: hl.price })));
              indicatorSeriesRef.current.set(`${type}-${hl.id}`, s);
            }
          }
        }
      }

      // RSI: add configurable upper/lower reference lines from our params
      if (type === "RSI") {
        const rsiData = plotToLineData(result.plots["plot0"] ?? []);
        const refHigh = chart.addSeries(LineSeries, {
          color: "#555",
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          priceScaleId: 'right',
          priceLineVisible: false,
          lastValueVisible: false,
        }, paneIndex);
        refHigh.setData(rsiData.map((p) => ({ time: p.time as Time, value: getNumParam("RSI", "upper") })));
        indicatorSeriesRef.current.set("RSI-upper", refHigh);
        const refLow = chart.addSeries(LineSeries, {
          color: "#555",
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          priceScaleId: 'right',
          priceLineVisible: false,
          lastValueVisible: false,
        }, paneIndex);
        refLow.setData(rsiData.map((p) => ({ time: p.time as Time, value: getNumParam("RSI", "lower") })));
        indicatorSeriesRef.current.set("RSI-lower", refLow);
      }
    };

    // Remove old indicator series
    for (const [_key, series] of indicatorSeriesRef.current) {
      try {
        chart.removeSeries(series);
      } catch {
        /* already removed */
      }
    }
    indicatorSeriesRef.current.clear();

    // Determine which indicators go in below panes (exclude hidden)
    const visibleIndicators = activeIndicators.filter((t) => !hiddenIndicators.includes(t));
    const belowIndicators = visibleIndicators.filter((t) => {
      const cfg = INDICATOR_REGISTRY.find((r) => r.type === t);
      return cfg?.pane === "below";
    });

    for (const type of visibleIndicators) {
      const config = INDICATOR_REGISTRY.find((r) => r.type === type);
      if (!config) continue;

      const paneIndex = getPaneIndex(type, belowIndicators);

      if (config.useLib) {
        addLibIndicator(type, paneIndex);
        continue;
      }

      // Hand-rolled fallback (shouldn't reach here anymore, all use useLib: true)
      switch (type) {
        default:
          break;
      }
    }

    // Update pane metadata for React nametag rendering
    const newPaneMeta = belowIndicators.map((t, i) => {
      const cfg = INDICATOR_REGISTRY.find((r) => r.type === t);
      return { type: t, label: cfg?.label ?? t, color: cfg?.color ?? "#888", paneIndex: i + 1 };
    });
    setPaneMeta(newPaneMeta);

    // Set the main pane's stretch factor only on first paint (so the initial
    // 3:1 main:indicator ratio holds) and on pane count changes (a new
    // indicator pane was just added and needs the default 1:1 with siblings).
    // Crucially, this does NOT touch pane heights the user has manually
    // dragged — those are preserved across re-renders.
    const panes = chart.panes();
    if (panes.length > 1) {
      const mainPane = panes[0];
      if (lastPaneCountRef.current === 0) {
        // First paint with at least one indicator pane: set 3:1 defaults.
        mainPane?.setStretchFactor(3);
        for (let i = 1; i < panes.length; i++) {
          panes[i]?.setStretchFactor(1);
        }
      } else if (panes.length > lastPaneCountRef.current) {
        // A new indicator pane was added (e.g. user just enabled RSI).
        // Reset the main pane to its 3x weight relative to a 1x new pane so
        // the new pane doesn't gobble the screen. Leave any panes the user
        // already dragged alone — the new pane inherits the 1x default.
        mainPane?.setStretchFactor(3);
        panes[panes.length - 1]?.setStretchFactor(1);
      }
      // If panes.length === lastPaneCountRef.current, the user dragged but
      // didn't add/remove an indicator. Do nothing — the chart already has
      // their preferred ratios in its internal stretch factors.
      lastPaneCountRef.current = panes.length;
    } else {
      lastPaneCountRef.current = panes.length;
    }

    // chartRef/candleSeriesRef are stable refs; colors derived from isDark dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndicators, chartData, isDark, indicatorParams, indicatorAppearance, hiddenIndicators, volumeData]);

  return { paneMeta };
}