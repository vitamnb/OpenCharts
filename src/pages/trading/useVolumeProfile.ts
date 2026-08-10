import { useEffect, useRef, type MutableRefObject } from "react";
import type { IChartApi, ISeriesApi, IPriceLine } from "lightweight-charts";
import { BarSeries } from "lightweight-charts";
import { computeVolumeProfile, type VolumeProfileResult } from "../../lib/volume-profile.ts";

interface VolumeProfileData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface UseVolumeProfileParams {
  chartRef: MutableRefObject<IChartApi | null>;
  candles: VolumeProfileData[] | null;
  enabled: boolean;
  bins?: number;
}

/**
 * Renders a volume profile histogram on the right side of the chart.
 * Uses a bar series as a makeshift horizontal histogram, positioned at
 * the price level of each bin. Green for buy volume, red for sell volume.
 *
 * Also marks POC, VAH, VAL with price lines via createPriceLine.
 */
export function useVolumeProfile({
  chartRef,
  candles,
  enabled,
  bins = 50,
}: UseVolumeProfileParams) {
  const barSeriesRef = useRef<ISeriesApi<"Bar"> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !enabled || !candles || candles.length === 0) {
      if (barSeriesRef.current && chart) {
        chart.removeSeries(barSeriesRef.current);
        barSeriesRef.current = null;
      }
      priceLinesRef.current = [];
      return;
    }

    const result: VolumeProfileResult = computeVolumeProfile(candles, bins);
    if (result.levels.length === 0) return;

    // Remove old series if exists
    if (barSeriesRef.current) {
      chart.removeSeries(barSeriesRef.current);
    }

    barSeriesRef.current = chart.addSeries(BarSeries, {
      priceScaleId: "vp",
      priceFormat: { type: "volume" },
      visible: true,
    } as any);

    const series = barSeriesRef.current;
    const lastTime = candles[candles.length - 1]?.time;
    if (!lastTime) return;

    const data = result.levels.map((l) => ({
      time: lastTime,
      open: l.price - 0.01,
      high: l.price,
      low: l.price - 0.01,
      close: l.price,
    }));

    series.setData(data as any);

    chart.priceScale("vp" as any)?.applyOptions({
      scaleMargins: { top: 0.1, bottom: 0.1 },
      visible: false,
    } as any);

    // Clear old price lines
    priceLinesRef.current.forEach((pl) => {
      try { series.removePriceLine(pl); } catch { /* already removed */ }
    });
    priceLinesRef.current = [];

    const pocLine = series.createPriceLine({
      price: result.poc,
      color: "#f0b90b",
      lineWidth: 1,
      lineStyle: 0,
      axisLabelVisible: true,
      title: "POC",
    });
    priceLinesRef.current.push(pocLine);

    const vahLine = series.createPriceLine({
      price: result.vah,
      color: "#0ecb81",
      lineWidth: 1,
      lineStyle: 1,
      axisLabelVisible: true,
      title: "VAH",
    });
    priceLinesRef.current.push(vahLine);

    const valLine = series.createPriceLine({
      price: result.val,
      color: "#f6465d",
      lineWidth: 1,
      lineStyle: 1,
      axisLabelVisible: true,
      title: "VAL",
    });
    priceLinesRef.current.push(valLine);

    return () => {
      if (barSeriesRef.current && chart) {
        chart.removeSeries(barSeriesRef.current);
        barSeriesRef.current = null;
      }
      priceLinesRef.current = [];
    };
  }, [chartRef, candles, enabled, bins]);
}