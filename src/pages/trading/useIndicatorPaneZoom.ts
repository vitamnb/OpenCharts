import { useEffect, useRef, type RefObject } from "react";
import type { IChartApi } from "lightweight-charts";
import type { IndicatorType } from "../../lib/indicators.ts";

// Map indicator type to its custom overlay price scale ID.
// These are the IDs used when calling chart.addSeries(..., { priceScaleId: id })
// and chart.priceScale(id).applyOptions(...).
const INDICATOR_PRICE_SCALE_ID: Partial<Record<IndicatorType, string>> = {
  RSI: "rsi",
  MACD: "macd",
  ATR: "atr",
  STOCH: "stoch",
};

// Width of the price scale area on the right edge of the chart (in pixels).
// The user must press within this zone to start a drag-to-zoom.
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
    priceScaleId: string;
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

      // Compute pane boundaries. Panes are stacked vertically; each pane has
      // a height property. The total chart height is the sum of pane heights
      // plus separators, but pane.height gives the actual pixel height of
      // each pane.
      let yCursor = y;
      let paneIndex = -1;
      for (let i = 0; i < panes.length; i++) {
        const paneHeight = panes[i].height;
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

      // Read current scaleMargins from the price scale.
      const priceScale = chart.priceScale(priceScaleId);
      const options = priceScale.options();
      const startTop = options.scaleMargins?.top ?? 0.1;
      const startBottom = options.scaleMargins?.bottom ?? 0.1;

      const paneHeight = panes[paneIndex].height;

      dragRef.current = {
        active: true,
        priceScaleId,
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
      if (!drag?.active) return;

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

      chart.priceScale(drag.priceScaleId).applyOptions({
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