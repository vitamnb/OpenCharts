import { useEffect, useRef, useState } from "react";
import type { IChartApi, ISeriesApi, CandlestickData, Time } from "lightweight-charts";
import {
  LineStyle,
  LineSeries,
  HistogramSeries,
} from "lightweight-charts";
import {
  sma,
  ema,
  rsi,
  macd,
  bollingerBands,
  atr,
  stochastic,
  vwap,
  INDICATOR_REGISTRY,
  type IndicatorType,
  type IndicatorParams,
  type IndicatorAppearance,
} from "../../lib/indicators.ts";
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
): { paneMeta: Array<{ type: IndicatorType; label: string; color: string; paneIndex: number }> } {
  const indicatorSeriesRef = useRef<Map<string, ISeriesApi<"Line"> | ISeriesApi<"Histogram">>>(
    new Map(),
  );
  const colors = isDark ? CHART_COLORS.dark : CHART_COLORS.light;

  // Track which below-pane indicators are active and their pane indices
  // so the React layer can render HTML nametags over each pane.
  const [paneMeta, setPaneMeta] = useState<Array<{ type: IndicatorType; label: string; color: string; paneIndex: number }>>([]);

  useEffect(() => {
    if (!chartRef.current || !candleSeriesRef.current || chartData.length === 0) return;

    const chart = chartRef.current;
    const indCandles = toIndicatorCandles(chartData);

    // Helper to get param value (fall back to default if not set)
    const getParam = (type: IndicatorType, key: string): number => {
      const params = indicatorParams[type];
      if (params && params[key] !== undefined) return params[key]!;
      const cfg = INDICATOR_REGISTRY.find((r) => r.type === type);
      return cfg?.defaultParams[key] ?? 0;
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

      switch (type) {
        case "SMA": {
          const data = sma(indCandles, getParam("SMA", "period"));
          const app = getAppearance("SMA");
          const s = chart.addSeries(LineSeries, {
            color: app.color,
            lineWidth: app.lineWidth as 1 | 2 | 3 | 4,
            lineStyle: toLineStyle(app.lineStyle),
            priceScaleId: "right",
          }, 0);
          s.setData(data.map((p) => ({ time: p.time as Time, value: p.value })));
          indicatorSeriesRef.current.set("SMA", s);
          break;
        }
        case "EMA": {
          const data = ema(indCandles, getParam("EMA", "period"));
          const app = getAppearance("EMA");
          const s = chart.addSeries(LineSeries, {
            color: app.color,
            lineWidth: app.lineWidth as 1 | 2 | 3 | 4,
            lineStyle: toLineStyle(app.lineStyle),
            priceScaleId: "right",
          }, 0);
          s.setData(data.map((p) => ({ time: p.time as Time, value: p.value })));
          indicatorSeriesRef.current.set("EMA", s);
          break;
        }
        case "RSI": {
          const data = rsi(indCandles, getParam("RSI", "period"));
          const app = getAppearance("RSI");
          const s = chart.addSeries(LineSeries, {
            color: app.color,
            lineWidth: app.lineWidth as 1 | 2 | 3 | 4,
            lineStyle: toLineStyle(app.lineStyle),
            priceScaleId: "rsi",
          }, paneIndex);
          s.setData(data.map((p) => ({ time: p.time as Time, value: p.value })));
          indicatorSeriesRef.current.set("RSI", s);
          const refHigh = chart.addSeries(LineSeries, {
            color: "#555",
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            priceScaleId: "rsi",
          }, paneIndex);
          refHigh.setData(data.map((p) => ({ time: p.time as Time, value: 70 })));
          indicatorSeriesRef.current.set("RSI-70", refHigh);
          const refLow = chart.addSeries(LineSeries, {
            color: "#555",
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            priceScaleId: "rsi",
          }, paneIndex);
          refLow.setData(data.map((p) => ({ time: p.time as Time, value: 30 })));
          indicatorSeriesRef.current.set("RSI-30", refLow);

          break;
        }
        case "MACD": {
          const data = macd(
            indCandles,
            getParam("MACD", "fast"),
            getParam("MACD", "slow"),
            getParam("MACD", "signal"),
          );
          const mLine = chart.addSeries(LineSeries, {
            color: "#2196f3",
            lineWidth: 1,
            priceScaleId: "macd",
          }, paneIndex);
          mLine.setData(data.macd.map((p) => ({ time: p.time as Time, value: p.value })));
          indicatorSeriesRef.current.set("MACD-line", mLine);
          const sLine = chart.addSeries(LineSeries, {
            color: "#ff9800",
            lineWidth: 1,
            priceScaleId: "macd",
          }, paneIndex);
          sLine.setData(data.signal.map((p) => ({ time: p.time as Time, value: p.value })));
          indicatorSeriesRef.current.set("MACD-signal", sLine);
          const histo = chart.addSeries(HistogramSeries, {
            priceScaleId: "macd",
          }, paneIndex);
          histo.setData(
            data.histogram.map((p) => ({
              time: p.time as Time,
              value: p.value,
              color: p.value >= 0 ? colors.up + "99" : colors.down + "99",
            })),
          );
          indicatorSeriesRef.current.set("MACD-hist", histo);

          break;
        }
        case "BOLL": {
          const data = bollingerBands(
            indCandles,
            getParam("BOLL", "period"),
            getParam("BOLL", "stdDev"),
          );
          const app = getAppearance("BOLL");
          const ls = toLineStyle(app.lineStyle);
          const upper = chart.addSeries(LineSeries, {
            color: app.color + "80",
            lineWidth: app.lineWidth as 1 | 2 | 3 | 4,
            lineStyle: ls,
            priceScaleId: "right",
          }, 0);
          upper.setData(data.upper.map((p) => ({ time: p.time as Time, value: p.value })));
          indicatorSeriesRef.current.set("BOLL-upper", upper);
          const mid = chart.addSeries(LineSeries, {
            color: app.color,
            lineWidth: app.lineWidth as 1 | 2 | 3 | 4,
            lineStyle: ls,
            priceScaleId: "right",
          }, 0);
          mid.setData(data.middle.map((p) => ({ time: p.time as Time, value: p.value })));
          indicatorSeriesRef.current.set("BOLL-mid", mid);
          const lower = chart.addSeries(LineSeries, {
            color: app.color + "80",
            lineWidth: app.lineWidth as 1 | 2 | 3 | 4,
            lineStyle: ls,
            priceScaleId: "right",
          }, 0);
          lower.setData(data.lower.map((p) => ({ time: p.time as Time, value: p.value })));
          indicatorSeriesRef.current.set("BOLL-lower", lower);
          break;
        }
        case "ATR": {
          const data = atr(indCandles, getParam("ATR", "period"));
          const app = getAppearance("ATR");
          const s = chart.addSeries(LineSeries, {
            color: app.color,
            lineWidth: app.lineWidth as 1 | 2 | 3 | 4,
            lineStyle: toLineStyle(app.lineStyle),
            priceScaleId: "atr",
          }, paneIndex);
          s.setData(data.map((p) => ({ time: p.time as Time, value: p.value })));
          indicatorSeriesRef.current.set("ATR", s);

          break;
        }
        case "STOCH": {
          const data = stochastic(
            indCandles,
            getParam("STOCH", "kPeriod"),
            getParam("STOCH", "dPeriod"),
          );
          const app = getAppearance("STOCH");
          const kLine = chart.addSeries(LineSeries, {
            color: app.color,
            lineWidth: app.lineWidth as 1 | 2 | 3 | 4,
            lineStyle: toLineStyle(app.lineStyle),
            priceScaleId: "stoch",
          }, paneIndex);
          kLine.setData(data.k.map((p) => ({ time: p.time as Time, value: p.value })));
          indicatorSeriesRef.current.set("STOCH-K", kLine);
          const dLine = chart.addSeries(LineSeries, {
            color: "#ff7043",
            lineWidth: 1,
            priceScaleId: "stoch",
          }, paneIndex);
          dLine.setData(data.d.map((p) => ({ time: p.time as Time, value: p.value })));
          indicatorSeriesRef.current.set("STOCH-D", dLine);

          break;
        }
        case "VWAP": {
          const data = vwap(indCandles);
          const app = getAppearance("VWAP");
          const s = chart.addSeries(LineSeries, {
            color: app.color,
            lineWidth: (app.lineWidth ?? 2) as 1 | 2 | 3 | 4,
            lineStyle: toLineStyle(app.lineStyle ?? "dashed"),
            priceScaleId: "right",
          }, 0);
          s.setData(data.map((p) => ({ time: p.time as Time, value: p.value })));
          indicatorSeriesRef.current.set("VWAP", s);
          break;
        }
      }
    }

    // Update pane metadata for React nametag rendering
    const newPaneMeta = belowIndicators.map((t, i) => {
      const cfg = INDICATOR_REGISTRY.find((r) => r.type === t);
      return { type: t, label: cfg?.label ?? t, color: cfg?.color ?? "#888", paneIndex: i + 1 };
    });
    setPaneMeta(newPaneMeta);

    // Set stretch factors: main pane 3x, indicator panes 1x each
    const panes = chart.panes();
    if (panes.length > 1) {
      panes[0].setStretchFactor(3);
      for (let i = 1; i < panes.length; i++) {
        panes[i].setStretchFactor(1);
      }
    }

    // chartRef/candleSeriesRef are stable refs; colors derived from isDark dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndicators, chartData, isDark, indicatorParams, indicatorAppearance, hiddenIndicators]);

  return { paneMeta };
}