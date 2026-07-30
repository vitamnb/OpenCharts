import { useEffect, useRef, type RefObject } from "react";
import type { IChartApi, ISeriesApi, SeriesType, Time } from "lightweight-charts";
import type { IndicatorType } from "../../lib/indicators.ts";

// Map indicator type to its custom overlay price scale ID.
// Used to find the first series on the pane with that ID.
const INDICATOR_PRICE_SCALE_ID: Partial<Record<IndicatorType, string>> = {
  RSI: "rsi",
  MACD: "macd",
  ATR: "atr",
  STOCH: "stoch",
};

// Width of the price scale area on the right edge of the chart (in pixels).
const PRICE_SCALE_WIDTH = 80;

// Clamp scaleMargins to [0, 0.45] so the indicator content never gets
// squeezed to zero or overflows the pane.
const MIN_MARGIN = 0;
const MAX_MARGIN = 0.45;

interface PaneMeta {
  type: IndicatorType;
  paneIndex: number;
}

/**
 * Drag-to-zoom on indicator pane price scales.
 *
 * lightweight-charts v5 does not support drag-to-zoom on custom overlay price
 * scales (only the main chart's right price scale has it natively). This hook
 * adds a custom mouse handler: when the user presses the mouse button near the
 * right edge of an indicator pane and drags up/down, the pane's price scale
 * margins are adjusted to zoom in/out the indicator content.
 *
 * Key v5 detail: overlay price scales (like 'rsi', 'macd') must be accessed
 * through `series.priceScale()`, NOT `chart.priceScale(id)`. The chart-level
 * priceScale() only works for built-in 'right' and 'left' scales.
 *
 * Pattern mirrors useSlTpDrag: capture-phase mousedown on container,
 * mousemove + mouseup on container and window, re-binds on chartEpoch.
 */
export function useIndicatorPaneZoom(
  containerRef: RefObject<HTMLDivElement | null>,
  chartRef: RefObject<IChartApi | null>,
  paneMeta: PaneMeta[],
  chartEpoch: number,
): void {
  const dragRef = useRef<{
    active: boolean;
    series: ISeriesApi<SeriesType, Time> | null;
    startY: number;
    startTop: number;
    startBottom: number;
    paneHeight: number;
  } | null>(null);

  const paneMetaRef = useRef(paneMeta);
  paneMetaRef.current = paneMeta;

  useEffect(() => {
    const container = containerRef.current;
    const chart = chartRef.current;
    if (!container || !chart) return;

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;

      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // Only start drag if cursor is in the price scale area (right edge).
      if (x < rect.width - PRICE_SCALE_WIDTH) return;

      // Determine which pane the cursor is over.
      const panes = chart.panes();
      if (panes.length <= 1) return; // no indicator panes

      // Compute pane boundaries using getHeight() (lightweight-charts v5 API).
      let yCursor = y;
      let paneIndex = -1;
      for (let i = 0; i < panes.length; i++) {
        const paneHeight = panes[i]?.getHeight() ?? 0;
        if (yCursor <= paneHeight) {
          paneIndex = i;
          break;
        }
        yCursor -= paneHeight;
      }

      // Only indicator panes (paneIndex >= 1), not the main chart pane.
      if (paneIndex < 1) return;

      // Map pane index to price scale ID via paneMeta.
      const meta = paneMetaRef.current.find((m) => m.paneIndex === paneIndex);
      if (!meta) return;

      const priceScaleId = INDICATOR_PRICE_SCALE_ID[meta.type];
      if (!priceScaleId) return;

      // In lightweight-charts v5, overlay price scales must be accessed
      // through the series, not chart.priceScale(). Find the first series
      // on this pane whose priceScaleId matches.
      const pane = panes[paneIndex];
      const seriesList = pane?.getSeries() ?? [];
      const targetSeries = seriesList.find(
        (s) => s.options().priceScaleId === priceScaleId,
      );
      if (!targetSeries) return;

      // Access the price scale through the series (v5 API).
      const priceScale = targetSeries.priceScale();
      const options = priceScale.options();
      const startTop = options.scaleMargins?.top ?? 0.1;
      const startBottom = options.scaleMargins?.bottom ?? 0.1;

      const paneHeight = panes[paneIndex]?.getHeight() ?? 100;

      dragRef.current = {
        active: true,
        series: targetSeries,
        startY: y,
        startTop,
        startBottom,
        paneHeight,
      };

      // Disable chart scrolling while dragging.
      chart.applyOptions({
        handleScroll: {
          mouseWheel: true,
          pressedMouseMove: false,
          horzTouchDrag: false,
          vertTouchDrag: false,
        },
      });
      container.style.cursor = "ns-resize";
    };

    const handleMouseMove = (e: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag?.active || !drag.series) return;

      const rect = container.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const deltaY = y - drag.startY;

      // Convert pixel delta to margin fraction.
      const deltaFraction = deltaY / drag.paneHeight;

      // Drag up (negative deltaY) = zoom in = decrease margins.
      // Drag down (positive deltaY) = zoom out = increase margins.
      // Adjust both top and bottom symmetrically.
      const newTop = Math.max(
        MIN_MARGIN,
        Math.min(MAX_MARGIN, drag.startTop + deltaFraction),
      );
      const newBottom = Math.max(
        MIN_MARGIN,
        Math.min(MAX_MARGIN, drag.startBottom + deltaFraction),
      );

      // Apply through the series' price scale (v5 overlay API).
      drag.series.priceScale().applyOptions({
        scaleMargins: { top: newTop, bottom: newBottom },
      });
    };

    const handleMouseUp = () => {
      const drag = dragRef.current;
      if (!drag?.active) return;

      dragRef.current = null;

      // Re-enable chart scrolling.
      chart.applyOptions({
        handleScroll: {
          mouseWheel: true,
          pressedMouseMove: true,
          horzTouchDrag: true,
          vertTouchDrag: true,
        },
      });
      container.style.cursor = "default";
    };

    container.addEventListener("mousedown", handleMouseDown, true);
    container.addEventListener("mousemove", handleMouseMove);
    container.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      container.removeEventListener("mousedown", handleMouseDown, true);
      container.removeEventListener("mousemove", handleMouseMove);
      container.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("mouseup", handleMouseUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chart/container live in refs; chartEpoch re-binds after chart recreation
  }, [chartEpoch]);
}