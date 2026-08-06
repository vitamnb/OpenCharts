/**
 * SMC Heatmap Hook
 *
 * Applies candle heatmap colors from the SMC Market Structure indicator
 * to the candlestick series. Runs as a separate effect AFTER the main
 * data effect in ChartPanel, so colors survive data updates.
 *
 * When the SMC indicator is active and showHeatmap is true, each candle
 * gets colored based on the impulse/pullback relationship between
 * consecutive swing points. Bullish pullbacks paint green, bearish
 * pullbacks paint orange, with gradient intensity based on magnitude.
 *
 * When SMC is not active or showHeatmap is false, candles revert to
 * their default up/down colors.
 */

import { useEffect, useRef } from "react";
import type { IChartApi, ISeriesApi, CandlestickData, Time } from "lightweight-charts";
import { calculateSMC, type SMCConfig } from "../../lib/indicators/smc-market-structure.ts";
import { toIndicatorCandles } from "./utils.ts";
import { CHART_COLORS } from "./constants.ts";
import type { IndicatorParams } from "../../lib/indicators.ts";

export function useSMCHeatmap(
  chartRef: React.RefObject<IChartApi | null>,
  candleSeriesRef: React.RefObject<ISeriesApi<"Candlestick"> | null>,
  chartData: CandlestickData<Time>[],
  smcEnabled: boolean,
  smcParams: Partial<IndicatorParams> | undefined,
  volumeData: Array<{ time: Time; value: number }> | undefined,
  isDark: boolean,
) {
  const prevColorsRef = useRef<Map<number, string>>(new Map());

  useEffect(() => {
    if (!chartRef.current || !candleSeriesRef.current || chartData.length === 0) return;

    const series = candleSeriesRef.current;
    const colors = isDark ? CHART_COLORS.dark : CHART_COLORS.light;

    // If SMC is not enabled or heatmap is off, restore default candle colors
    const showHeatmap = smcParams?.showHeatmap !== false;
    if (!smcEnabled || !showHeatmap) {
      // Restore default up/down colors
      const defaultData = chartData.map((c) => ({
        ...c,
        color: (c.close >= c.open) ? colors.up : colors.down,
      }));
      series.setData(defaultData);
      prevColorsRef.current.clear();
      return;
    }

    // Build SMC config from params
    const config: Partial<SMCConfig> = {
      pivotLength: (smcParams?.pivotLength as number) ?? 10,
      maxHistory: (smcParams?.maxHistory as number) ?? 100,
      heatmapMode: (smcParams?.heatmapMode as "Combined" | "Impulse" | "Pullback") ?? "Pullback",
      bullColor: (smcParams?.bullColor as string) ?? "#009688",
      bearColor: (smcParams?.bearColor as string) ?? "#ff9800",
    };

    // Calculate SMC
    const indCandles = toIndicatorCandles(chartData, volumeData);
    const result = calculateSMC(indCandles, config);

    // Build heatmap color map
    const heatmapByTime = new Map<number, string>();
    for (const h of result.heatmap) {
      if (h.color) heatmapByTime.set(h.time, h.color);
    }

    // Apply colors to candle data
    const coloredData = chartData.map((c) => {
      const heatmapColor = heatmapByTime.get(c.time as number);
      if (heatmapColor) {
        return { ...c, color: heatmapColor };
      }
      // No heatmap data for this bar: use default up/down
      return { ...c, color: (c.close >= c.open) ? colors.up : colors.down };
    });

    series.setData(coloredData);
    prevColorsRef.current = heatmapByTime;

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartData, smcEnabled, smcParams, isDark, volumeData]);
}