import { useEffect, useRef, useState } from "react";
import type { IChartApi } from "lightweight-charts";
import { cn } from "../../lib/utils.ts";

// Minimum heights enforced on each pane during a resize drag. The main chart
// pane needs enough room for OHLC candles plus the right price-scale labels;
// indicator panes are tighter because they're typically a single line/histogram.
const MIN_MAIN_PANE_HEIGHT = 100;
const MIN_INDICATOR_PANE_HEIGHT = 50;

// Height (in pixels) of the visible grab bar at the centre of each handle.
// The hit area is wider (HIT_AREA_PX) than the bar so the user doesn't have
// to land on a 4px line — anywhere in the strip works.
const HANDLE_BAR_HEIGHT = 4;
const HIT_AREA_HEIGHT = 12;

interface PaneResizeHandleProps {
  chartRef: React.RefObject<IChartApi | null>;
  /** Index of the pane BELOW this handle (0 = main chart, 1+ = indicators). */
  paneIndexBelow: number;
  /** True if the chart uses a dark theme (drives bar colour). */
  isDark: boolean;
  /** Chart epoch — increments on every chart recreation so the effect re-binds. */
  chartEpoch: number;
  /** Optional: refresh trigger from the parent (e.g. when pane count changes). */
  refreshKey?: number;
}

/**
 * Visible drag handle rendered between two chart panes.
 *
 * lightweight-charts v5 ships a built-in `enableResize` flag that makes the
 * 9px separator strip draggable, but the affordance is invisible and easy to
 * miss — the cursor flips to `row-resize` only when the pointer is exactly on
 * the separator. We disable that built-in drag (`layout.panes.enableResize:
 * false` in ChartPanel) and render our own full-width handles here, with a
 * clear grab bar and `cursor: row-resize` over a 12px-tall hit strip.
 *
 * Drag math:
 * - The handle sits at the bottom edge of the pane above (or the top edge of
 *   the chart, for handle 0) and the top edge of the pane below.
 * - Dragging up = the pane above gets shorter, the pane below gets taller.
 * - Heights are clamped to per-pane minima (100px main, 50px indicators) and
 *   re-applied on every move via `pane.setHeight()`.
 */
export function PaneResizeHandle({
  chartRef,
  paneIndexBelow,
  isDark,
  chartEpoch,
  refreshKey,
}: PaneResizeHandleProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [topPx, setTopPx] = useState<number | null>(null);
  const dragStateRef = useRef<{
    startClientY: number;
    startPaneBelowHeight: number;
    startPaneAboveHeight: number;
  } | null>(null);
  // Cached pane height getters — re-queried on each move in case the chart
  // was recreated mid-drag. We use indexes (not pane refs) so we can resolve
  // a fresh `panes()` array on every drag-move.
  const indexRef = useRef<{ above: number; below: number } | null>(null);

  // Re-measure the handle's vertical position whenever the chart layout shifts:
  // pane count changes, container resizes, a user drag completes, etc.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const measure = () => {
      const panes = chart.panes();
      if (paneIndexBelow >= panes.length) {
        setTopPx(null);
        return;
      }
      // The handle sits at the top edge of pane `paneIndexBelow` (or the very
      // top of the chart for handle 0). Sum the heights of the panes above
      // it to get the y offset.
      let y = 0;
      for (let i = 0; i < paneIndexBelow; i++) {
        y += panes[i]?.getHeight() ?? 0;
      }
      setTopPx(y);
    };

    measure();

    // Observe each pane's DOM element for size changes (the chart mutates
    // these when a separator is dragged). Container resize is also covered
    // because the chart element's size changes too.
    const observers: ResizeObserver[] = [];
    for (const pane of chart.panes()) {
      const el = pane.getHTMLElement();
      if (el) {
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        observers.push(ro);
      }
    }
    const chartEl = chart.chartElement();
    const ro = new ResizeObserver(measure);
    ro.observe(chartEl);
    observers.push(ro);

    // MutationObserver catches pane add/remove (indicator toggled on/off
    // adds or removes a pane from the chart DOM).
    const mo = new MutationObserver(() => {
      // Re-attach observers to the (possibly new) pane set.
      for (const ro of observers) ro.disconnect();
      observers.length = 0;
      for (const pane of chart.panes()) {
        const el = pane.getHTMLElement();
        if (el) {
          const ro = new ResizeObserver(measure);
          ro.observe(el);
          observers.push(ro);
        }
      }
      const ro2 = new ResizeObserver(measure);
      ro2.observe(chartEl);
      observers.push(ro2);
      measure();
    });
    mo.observe(chartEl, { childList: true, subtree: true });

    return () => {
      for (const ro of observers) ro.disconnect();
      mo.disconnect();
    };
  }, [chartRef, chartEpoch, paneIndexBelow, refreshKey]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const chart = chartRef.current;
    if (!chart) return;
    const panes = chart.panes();
    if (paneIndexBelow <= 0 || paneIndexBelow >= panes.length) return;

    const paneBelow = panes[paneIndexBelow];
    const paneAbove = panes[paneIndexBelow - 1];
    if (!paneBelow || !paneAbove) return;
    dragStateRef.current = {
      startClientY: e.clientY,
      startPaneBelowHeight: paneBelow.getHeight(),
      startPaneAboveHeight: paneAbove.getHeight(),
    };
    indexRef.current = { above: paneIndexBelow - 1, below: paneIndexBelow };
    containerRef.current?.setPointerCapture(e.pointerId);
    // Stop propagation so the chart container's other listeners (drawing
    // tool manager, drag-to-zoom hook) don't also react to this mousedown.
    // The drag-to-zoom hook listens in the capture phase, so it may still
    // fire if the user clicks in the right 80px where zoom is active — but
    // pointer capture on the handle wins the actual move events.
    e.stopPropagation();
    e.preventDefault();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    const indexes = indexRef.current;
    if (!drag || !indexes) return;
    const chart = chartRef.current;
    if (!chart) return;
    const panes = chart.panes();
    const paneAbove = panes[indexes.above];
    const paneBelow = panes[indexes.below];
    if (!paneAbove || !paneBelow) return;

    const deltaY = e.clientY - drag.startClientY;
    // Dragging the handle DOWN makes the upper pane taller and the lower
    // pane shorter (and vice versa). deltaY > 0 => upper grows, lower shrinks.
    const newAboveHeight = drag.startPaneAboveHeight + deltaY;
    const newBelowHeight = drag.startPaneBelowHeight - deltaY;

    const minAbove = paneIndexBelow === 1 ? MIN_MAIN_PANE_HEIGHT : MIN_INDICATOR_PANE_HEIGHT;
    const minBelow =
      paneIndexBelow === panes.length - 1 ? MIN_MAIN_PANE_HEIGHT : MIN_INDICATOR_PANE_HEIGHT;

    const clampedAbove = Math.max(minAbove, newAboveHeight);
    const clampedBelow = Math.max(minBelow, newBelowHeight);

    // If clamping one side ate the whole delta, give the other side the same
    // share so the total height stays put (avoids the chart "shrinking" past
    // the bottom edge when the user drags hard into a min).
    const aboveClampDelta = clampedAbove - newAboveHeight;
    const belowClampDelta = clampedBelow - newBelowHeight;
    const totalClamp = aboveClampDelta + belowClampDelta;

    const finalAbove = clampedAbove + (totalClamp > 0 ? -belowClampDelta : 0);
    const finalBelow = clampedBelow + (totalClamp > 0 ? -aboveClampDelta : 0);

    try {
      paneAbove.setHeight(finalAbove);
      paneBelow.setHeight(finalBelow);
    } catch {
      // setHeight can throw if the chart was disposed mid-drag; ignore.
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStateRef.current) return;
    dragStateRef.current = null;
    indexRef.current = null;
    containerRef.current?.releasePointerCapture(e.pointerId);
  };

  if (topPx === null) return null;

  return (
    <div
      ref={containerRef}
      role="separator"
      aria-orientation="horizontal"
      aria-label={`Resize pane ${paneIndexBelow}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className={cn(
        "absolute left-0 right-0 z-[5] flex items-center justify-center group touch-none cursor-row-resize",
        "hover:bg-primary/10 active:bg-primary/20 transition-colors",
      )}
      style={{
        top: topPx - HIT_AREA_HEIGHT / 2,
        height: HIT_AREA_HEIGHT,
      }}
    >
      <div
        className={cn(
          "rounded-full transition-all",
          isDark
            ? "bg-white/15 group-hover:bg-white/30 group-active:bg-primary/60"
            : "bg-black/15 group-hover:bg-black/30 group-active:bg-primary/60",
        )}
        style={{ width: "100%", height: HANDLE_BAR_HEIGHT, maxWidth: 120 }}
      />
    </div>
  );
}
