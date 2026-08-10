// Hook to render drawdown overlay on the chart from backtest equity curve data

import { useEffect, useRef } from "react";
import type { IChartApi } from "lightweight-charts";
import { DrawdownOverlay } from "../../lib/chart-plugins/drawdown-overlay/drawdown-overlay.ts";
import { calculateDrawdown } from "../../lib/drawdown.ts";
import type { JesseEquityPoint } from "../../services/api/jesse.ts";

export function useDrawdownOverlay(
  chartRef: React.RefObject<IChartApi | null>,
  equityCurve: JesseEquityPoint[] | undefined,
  enabled: boolean,
) {
  const overlayRef = useRef<DrawdownOverlay | null>(null);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !enabled) {
      overlayRef.current?.remove();
      overlayRef.current = null;
      return;
    }

    if (!equityCurve || equityCurve.length === 0) return;

    if (!overlayRef.current) {
      overlayRef.current = new DrawdownOverlay(chart);
    }

    const drawdownData = calculateDrawdown(equityCurve);
    overlayRef.current.setData(drawdownData);

    return () => {
      overlayRef.current?.remove();
      overlayRef.current = null;
    };
  }, [chartRef, equityCurve, enabled]);

  return overlayRef;
}