import { useEffect, useRef, type MutableRefObject } from "react";
import type { IChartApi, ISeriesApi, Time } from "lightweight-charts";
import type { OrderBookSnapshot } from "./useOrderBook";

interface OrderBookHeatmapProps {
  chartRef: MutableRefObject<IChartApi | null>;
  candleSeriesRef: MutableRefObject<ISeriesApi<"Candlestick"> | null>;
  containerRef: MutableRefObject<HTMLDivElement | null>;
  snapshots: OrderBookSnapshot[];
  enabled: boolean;
  isDark: boolean;
}

// Maximum number of snapshots to render in the heatmap
const RENDER_SNAPSHOTS = 100;

/**
 * Canvas overlay that renders the order book heatmap behind the candlesticks.
 *
 * X axis = time (mapped via chart.timeScale), Y axis = price (mapped via
 * series.priceToCoordinate). Colour intensity = order size, green for bids,
 * red for asks. Semi-transparent so candles remain visible.
 *
 * The canvas is positioned absolutely over the chart container and resizes
 * with it via a ResizeObserver. requestAnimationFrame drives the render loop
 * to keep it smooth.
 */
export function OrderBookHeatmap({
  chartRef,
  candleSeriesRef,
  containerRef,
  snapshots,
  enabled,
  isDark,
}: OrderBookHeatmapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const sizeRef = useRef({ width: 0, height: 0 });
  const snapshotsRef = useRef(snapshots);
  const enabledRef = useRef(enabled);

  // Keep refs in sync so the rAF loop reads current values without restarting
  useEffect(() => {
    snapshotsRef.current = snapshots;
  }, [snapshots]);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  // Main render effect: set up canvas, ResizeObserver, and rAF loop
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    const chart = chartRef.current;
    const series = candleSeriesRef.current;
    if (!container || !canvas || !chart || !series) return;
    if (!enabled) {
      canvas.style.display = "none";
      return;
    }

    canvas.style.display = "block";
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Resize canvas to match the chart container
    const resize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      sizeRef.current = { width: rect.width, height: rect.height };
    };
    resize();

    const ro = new ResizeObserver(resize);
    ro.observe(container);

    // Render loop using requestAnimationFrame
    const render = () => {
      const chartInstance = chartRef.current;
      const candleSeries = candleSeriesRef.current;
      const cvs = canvasRef.current;
      if (!chartInstance || !candleSeries || !cvs || !enabledRef.current) {
        rafRef.current = requestAnimationFrame(render);
        return;
      }

      const c = cvs.getContext("2d");
      if (!c) {
        rafRef.current = requestAnimationFrame(render);
        return;
      }

      const { width, height } = sizeRef.current;
      c.clearRect(0, 0, width, height);

      const snaps = snapshotsRef.current;
      if (snaps.length === 0) {
        rafRef.current = requestAnimationFrame(render);
        return;
      }

      // Get the visible time range from the chart
      const timeScale = chartInstance.timeScale();
      const visibleRange = timeScale.getVisibleRange();
      if (!visibleRange) {
        rafRef.current = requestAnimationFrame(render);
        return;
      }

      const fromTime = visibleRange.from as number;
      const toTime = visibleRange.to as number;
      const timeSpan = toTime - fromTime;
      if (timeSpan <= 0) {
        rafRef.current = requestAnimationFrame(render);
        return;
      }

      // Use only the most recent RENDER_SNAPSHOTS snapshots
      const renderSnaps = snaps.slice(-RENDER_SNAPSHOTS);
      const snapCount = renderSnaps.length;
      if (snapCount < 2) {
        rafRef.current = requestAnimationFrame(render);
        return;
      }

      // Calculate the column width: each snapshot gets a slice of the X axis.
      // The most recent snapshot is at the right edge of the visible range.
      const newestTs = renderSnaps[snapCount - 1]!.timestamp;
      const oldestTs = renderSnaps[0]!.timestamp;
      const tsSpan = newestTs - oldestTs;
      if (tsSpan <= 0) {
        rafRef.current = requestAnimationFrame(render);
        return;
      }

      // Find global max size for normalisation
      let maxSize = 0;
      for (const snap of renderSnaps) {
        for (const l of snap.bids) if (l.size > maxSize) maxSize = l.size;
        for (const l of snap.asks) if (l.size > maxSize) maxSize = l.size;
      }
      if (maxSize === 0) {
        rafRef.current = requestAnimationFrame(render);
        return;
      }

      // Render each snapshot as a vertical column
      for (let i = 0; i < snapCount; i++) {
        const snap = renderSnaps[i]!;
        // Map timestamp to X coordinate: oldest snap at left, newest at right
        // of the visible time range
        const tsProgress = (snap.timestamp - oldestTs) / tsSpan;
        const x = (tsProgress * timeSpan + fromTime);
        const xCoord = timeScale.timeToCoordinate(x as Time);
        if (xCoord == null) continue;

        // Column width: distance to next snapshot, or a minimum
        let colWidth: number;
        if (i < snapCount - 1) {
          const nextTsProgress = (renderSnaps[i + 1]!.timestamp - oldestTs) / tsSpan;
          const nextX = (nextTsProgress * timeSpan + fromTime);
          const nextXCoord = timeScale.timeToCoordinate(nextX as Time);
          if (nextXCoord == null) continue;
          colWidth = Math.max(1, nextXCoord - xCoord);
        } else {
          colWidth = Math.max(1, width / snapCount);
        }

        // Render bid levels (green, below mid)
        for (const level of snap.bids) {
          const yCoord = candleSeries.priceToCoordinate(level.price);
          if (yCoord == null) continue;
          const intensity = Math.min(1, level.size / maxSize);
          // Green for bids, alpha scales with intensity
          const alpha = 0.05 + intensity * 0.35;
          c.fillStyle = isDark
            ? `rgba(14, 203, 129, ${alpha})`
            : `rgba(14, 203, 129, ${alpha * 0.8})`;
          c.fillRect(xCoord, yCoord, colWidth, 2);
        }

        // Render ask levels (red, above mid)
        for (const level of snap.asks) {
          const yCoord = candleSeries.priceToCoordinate(level.price);
          if (yCoord == null) continue;
          const intensity = Math.min(1, level.size / maxSize);
          const alpha = 0.05 + intensity * 0.35;
          c.fillStyle = isDark
            ? `rgba(246, 70, 93, ${alpha})`
            : `rgba(246, 70, 93, ${alpha * 0.8})`;
          c.fillRect(xCoord, yCoord, colWidth, 2);
        }
      }

      rafRef.current = requestAnimationFrame(render);
    };

    rafRef.current = requestAnimationFrame(render);

    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      ro.disconnect();
      const c = canvasRef.current?.getContext("2d");
      if (c && canvasRef.current) {
        const { width, height } = sizeRef.current;
        c.clearRect(0, 0, width, height);
      }
    };
  }, [chartRef, candleSeriesRef, containerRef, enabled, isDark]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 1,
      }}
    />
  );
}
