import { useEffect, useState } from "react";
import { Eye, SlidersHorizontal } from "lucide-react";
import type { IChartApi } from "lightweight-charts";
import type { IndicatorType } from "../../lib/indicators.ts";
import { cn } from "../../lib/utils.ts";

interface PaneMeta {
  type: IndicatorType;
  label: string;
  color: string;
  paneIndex: number;
}

interface Props {
  chartRef: React.RefObject<IChartApi | null>;
  paneMeta: PaneMeta[];
  isDark: boolean;
  onSettings?: (type: IndicatorType) => void;
  onToggleVisibility?: (type: IndicatorType) => void;
  onAppearance?: (type: IndicatorType) => void;
}

/**
 * HTML overlay nametags rendered in the top-left corner of each below-pane.
 * Each nametag sits in its own pane, stacked vertically by pane position.
 */
export function IndicatorPaneNametags({
  chartRef,
  paneMeta,
  isDark,
  onSettings,
  onToggleVisibility,
  onAppearance,
}: Props) {
  const [panePositions, setPanePositions] = useState<Array<{ top: number }>>([]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const update = () => {
      const panes = chart.panes();
      const positions: Array<{ top: number }> = [];

      for (const meta of paneMeta) {
        let yOff = 0;
        for (let i = 0; i < meta.paneIndex; i++) {
          yOff += panes[i]?.getHeight() ?? 0;
        }
        positions.push({ top: yOff + 25 });
      }

      setPanePositions(positions);
    };

    update();

    // Observe each pane's HTML element for internal resizes (separator drags)
    const observers: ResizeObserver[] = [];
    const observe = (el: HTMLElement | null) => {
      if (!el) return;
      const ro = new ResizeObserver(update);
      ro.observe(el);
      observers.push(ro);
    };

    for (const pane of chart.panes()) {
      observe(pane.getHTMLElement());
    }

    // Also observe the chart element for container resizes
    const chartEl = chart.chartElement();
    observe(chartEl);

    // Re-observe when pane count changes (indicators added/removed)
    const mo = new MutationObserver(() => {
      for (const ro of observers) ro.disconnect();
      observers.length = 0;
      for (const pane of chart.panes()) {
        observe(pane.getHTMLElement());
      }
      observe(chart.chartElement());
      update();
    });
    mo.observe(chartEl, { childList: true, subtree: true });

    return () => {
      for (const ro of observers) ro.disconnect();
      mo.disconnect();
    };
  }, [chartRef, paneMeta]);

  if (paneMeta.length === 0) return null;

  return (
    <div className="absolute inset-0 pointer-events-none z-10">
      {paneMeta.map((meta, i) => {
        const pos = panePositions[i];
        if (!pos) return null;
        return (
          <div
            key={meta.type}
            style={{
              position: "absolute",
              top: pos.top,
              left: "calc(20px + var(--rail-w, 0px))",
            }}
            className="pointer-events-auto inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs backdrop-blur-sm border bg-card/70 max-w-[calc(100%-12px)]"
          >
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: meta.color }}
            />
            <span className={cn(
              "font-semibold tracking-wide truncate",
              isDark ? "text-foreground/90" : "text-foreground/80",
            )}>
              {meta.label}
            </span>

            <div className="flex items-center gap-1 ml-1">
              <button
                type="button"
                title={`${meta.label} settings`}
                onClick={() => onSettings?.(meta.type)}
                className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
              </button>

              <button
                type="button"
                title={`Toggle ${meta.label} visibility`}
                onClick={() => onToggleVisibility?.(meta.type)}
                className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              >
                <Eye className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}