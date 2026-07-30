import { useEffect, useState, type ReactElement } from "react";
import type { IChartApi } from "lightweight-charts";
import { PaneResizeHandle } from "./PaneResizeHandle.tsx";

interface PaneResizeOverlayProps {
  chartRef: React.RefObject<IChartApi | null>;
  isDark: boolean;
  /** Increments on every chart recreation — used to re-bind observers. */
  chartEpoch: number;
}

/**
 * Renders a {@link PaneResizeHandle} between each pair of chart panes.
 *
 * The handle list is rebuilt whenever the pane count changes (indicators
 * added/removed), and the `chartEpoch` prop re-binds internal observers after
 * a chart instance is destroyed and recreated (e.g. theme toggle).
 */
export function PaneResizeOverlay({
  chartRef,
  isDark,
  chartEpoch,
}: PaneResizeOverlayProps) {
  // We can't call chart.panes() during render (ref is null on first paint).
  // The handle itself queries panes() in its effect, but we still need to
  // know how many handles to render — track pane count in state.
  const [paneCount, setPaneCount] = useState(1);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const update = () => setPaneCount(chart.panes().length);
    update();

    // Observe chart DOM for pane add/remove (lightweight-charts mutates
    // childList when addPane/removePane is called).
    const chartEl = chart.chartElement();
    const mo = new MutationObserver(update);
    mo.observe(chartEl, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [chartRef, chartEpoch]);

  // A handle is rendered at the top of each non-first pane, so we need one
  // per pane boundary. paneCount - 1 handles for paneCount panes.
  if (paneCount <= 1) return null;
  const handles: ReactElement[] = [];
  for (let i = 1; i < paneCount; i++) {
    handles.push(
      <PaneResizeHandle
        key={`pane-handle-${i}-${chartEpoch}`}
        chartRef={chartRef}
        paneIndexBelow={i}
        isDark={isDark}
        chartEpoch={chartEpoch}
      />,
    );
  }
  return <>{handles}</>;
}
