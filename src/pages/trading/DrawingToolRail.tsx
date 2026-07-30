import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Circle,
  Clock,
  Equal,
  Square,
  type LucideIcon,
  ListTree,
  Minus,
  MousePointer2,
  MoveUpRight,
  MoveVertical,
  PanelLeft,
  Ruler,
  TrendingUp,
  TrendingUpDown,
  Triangle,
  Type,
  Magnet,
  Repeat,
  Trash2,
  PenTool,
  Waves,
  CandlestickChart,
  Check,
  ChevronRight,
  Plus,
} from "lucide-react";
import { useEffect, useRef, useState, type SVGProps } from "react";
import { useDragOffset } from "../../hooks/useDragOffset.ts";
import { cn } from "../../lib/utils.ts";
import type { DrawingTool, MagnetMode, Timeframe } from "./constants.ts";
import { TIMEFRAMES } from "./constants.ts";
import { PATTERN_LIST, type PatternMeta } from "./useCandlestickPatterns.ts";

// Custom icon for extended line: straight diagonal line with a dot about a third up
function ExtendedLineIcon({ size = 24, ...props }: { size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <line x1="4" y1="20" x2="20" y2="4" />
      <circle cx="9" cy="15" r="2" fill="currentColor" stroke="none" />
    </svg>
  );
}

interface ToolMeta {
  tool: DrawingTool;
  icon: LucideIcon;
  label: string;
}

interface ToolGroup {
  id: string;
  icon: LucideIcon;
  label: string;
  tools: ToolMeta[];
}

// TradingView-style left rail: tools grouped behind a flyout per category.
const GROUPS: ToolGroup[] = [
  {
    id: "lines",
    icon: TrendingUp,
    label: "Lines",
    tools: [
      { tool: "trendline", icon: TrendingUp, label: "Trend Line" },
      { tool: "ray", icon: MoveUpRight, label: "Ray" },
      { tool: "extended", icon: ExtendedLineIcon as LucideIcon, label: "Extended Line" },
      { tool: "horizontal", icon: Minus, label: "Horizontal Line" },
      { tool: "vertical", icon: MoveVertical, label: "Vertical Line" },
      { tool: "crossline", icon: Plus, label: "Crossline" },
      { tool: "channel", icon: Equal, label: "Parallel Channel" },
      { tool: "hchannel", icon: MoveVertical, label: "Horizontal Channel" },
    ],
  },
  {
    id: "fib",
    icon: Waves,
    label: "Fibonacci",
    tools: [
      { tool: "fibonacci", icon: Waves, label: "Fib Retracement" },
      { tool: "fibextension", icon: TrendingUpDown, label: "Fib Extension" },
    ],
  },
  {
    id: "shapes",
    icon: Square,
    label: "Shapes",
    tools: [
      { tool: "rectangle", icon: Square, label: "Rectangle" },
      { tool: "ellipse", icon: Circle, label: "Ellipse" },
      { tool: "triangle", icon: Triangle, label: "Triangle" },
      { tool: "arrow", icon: ArrowRight, label: "Arrow" },
      { tool: "brush", icon: PenTool, label: "Brush" },
    ],
  },
  {
    id: "trade",
    icon: ArrowUpRight,
    label: "Trade",
    tools: [
      { tool: "measure", icon: Ruler, label: "Measure" },
      { tool: "long-position", icon: ArrowUpRight, label: "Long Position" },
      { tool: "short-position", icon: ArrowDownRight, label: "Short Position" },
    ],
  },
];

function RailButton({
  icon: Icon,
  title,
  active,
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        "p-1.5 rounded hover:bg-secondary",
        active ? "bg-primary/20 text-primary" : "text-muted-foreground",
      )}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function RailGroup({
  group,
  activeTool,
  open,
  onToggle,
  onSelect,
}: {
  group: ToolGroup;
  activeTool: DrawingTool;
  open: boolean;
  onToggle: () => void;
  onSelect: (t: DrawingTool) => void;
}) {
  const activeMeta = group.tools.find((t) => t.tool === activeTool);
  const Icon = activeMeta?.icon ?? group.icon;
  return (
    <div className="relative">
      <RailButton icon={Icon} title={group.label} active={Boolean(activeMeta)} onClick={onToggle} />
      {open && (
        <div className="absolute left-full top-0 ml-1 z-30 min-w-[180px] rounded-md bg-card border border-border shadow-xl py-1">
          {group.tools.map((t) => (
            <button
              key={t.tool}
              type="button"
              onClick={() => onSelect(t.tool)}
              className={cn(
                "w-full flex items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-secondary text-left",
                activeTool === t.tool && "bg-secondary text-primary",
              )}
            >
              <t.icon className="h-3.5 w-3.5 shrink-0" />
              {t.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export interface DrawingToolRailProps {
  drawingTool: DrawingTool;
  onDrawingTool: (t: DrawingTool) => void;
  drawings?: { id: string }[];
  onClearDrawings?: () => void;
  magnetMode?: MagnetMode;
  onCycleMagnet?: () => void;
  stayInDrawingMode?: boolean;
  onToggleStayInDrawingMode?: () => void;
  onOpenObjectTree?: () => void;
  onOpenIndicatorPalette?: () => void;
  timeframe?: Timeframe;
  onTimeframeChange?: (tf: Timeframe) => void;
  activePatterns?: string[];
  onTogglePattern?: (id: string) => void;
  onClearPatterns?: () => void;
}

export function DrawingToolRail({
  drawingTool,
  onDrawingTool,
  drawings = [],
  onClearDrawings,
  magnetMode = "none",
  onCycleMagnet,
  stayInDrawingMode = false,
  onToggleStayInDrawingMode,
  onOpenObjectTree,
  onOpenIndicatorPalette,
  timeframe,
  onTimeframeChange,
  activePatterns = [],
  onTogglePattern,
  onClearPatterns,
}: DrawingToolRailProps) {
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [openSubGroup, setOpenSubGroup] = useState<string | null>(null);
  const [docked, setDocked] = useState(() => localStorage.getItem("drawingRailDocked") === "true");
  const ref = useRef<HTMLDivElement>(null);
  const drag = useDragOffset();

  // Persist dock state
  useEffect(() => {
    localStorage.setItem("drawingRailDocked", String(docked));
  }, [docked]);

  useEffect(() => {
    if (!openGroup) {
      setOpenSubGroup(null);
      return;
    }
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpenGroup(null);
        setOpenSubGroup(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [openGroup]);

  const select = (t: DrawingTool) => {
    onDrawingTool(drawingTool === t ? "none" : t);
    setOpenGroup(null);
  };

  // Shared tool buttons used in both docked and floating modes
  const toolButtons = (
    <>
      <RailButton
        icon={MousePointer2}
        title="Cursor"
        active={drawingTool === "none"}
        onClick={() => {
          onDrawingTool("none");
          setOpenGroup(null);
        }}
      />
      {GROUPS.map((g) => (
        <RailGroup
          key={g.id}
          group={g}
          activeTool={drawingTool}
          open={openGroup === g.id}
          onToggle={() => setOpenGroup((o) => (o === g.id ? null : g.id))}
          onSelect={select}
        />
      ))}
      {/* Text tool as a direct button, no popup */}
      <RailButton
        icon={Type}
        title="Text"
        active={drawingTool === "text"}
        onClick={() => select("text")}
      />
      {/* Indicators button */}
      {onOpenIndicatorPalette && (
        <RailButton
          icon={Activity}
          title="Indicators"
          onClick={onOpenIndicatorPalette}
        />
      )}
      {/* Candlestick patterns two-tier flyout */}
      {onTogglePattern && (
        <div className="relative">
          <RailButton
            icon={CandlestickChart}
            title="Candlestick Patterns"
            active={openGroup === "patterns" || activePatterns.length > 0}
            onClick={() => setOpenGroup((o) => (o === "patterns" ? null : "patterns"))}
          />
          {openGroup === "patterns" && (
            <div className="absolute left-full top-0 ml-1 z-30 min-w-[180px] rounded-md bg-card border border-border shadow-xl py-1">
              {activePatterns.length > 0 && (
                <button
                  type="button"
                  onClick={() => onClearPatterns?.()}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-secondary text-left text-muted-foreground border-b border-border/50 mb-1"
                >
                  <Trash2 className="h-3 w-3" />
                  Clear all ({activePatterns.length})
                </button>
              )}
              {(["bullish", "bearish", "neutral"] as const).map((sentiment) => {
                const patterns = PATTERN_LIST.filter((p) => p.sentiment === sentiment);
                if (patterns.length === 0) return null;
                const colorClass = sentiment === "bullish" ? "text-emerald-500" : sentiment === "bearish" ? "text-red-500" : "text-yellow-500";
                const activeInGroup = patterns.filter((p) => activePatterns.includes(p.id)).length;
                return (
                  <div key={sentiment} className="relative group/sub">
                    <button
                      type="button"
                      onClick={() => setOpenSubGroup((o) => (o === sentiment ? null : sentiment))}
                      className={cn(
                        "w-full flex items-center justify-between gap-2 px-3 py-1.5 text-sm hover:bg-secondary text-left",
                        openSubGroup === sentiment && "bg-secondary",
                      )}
                    >
                      <span className={cn("flex items-center gap-2", colorClass)}>
                        <span className="capitalize font-medium">{sentiment}</span>
                      </span>
                      <span className="flex items-center gap-1.5">
                        {activeInGroup > 0 && (
                          <span className="text-xs text-muted-foreground">{activeInGroup}</span>
                        )}
                        <ChevronRight className="h-3 w-3 text-muted-foreground" />
                      </span>
                    </button>
                    {openSubGroup === sentiment && (
                      <div className="absolute left-full top-0 ml-1 z-40 min-w-[200px] rounded-md bg-card border border-border shadow-xl py-1 max-h-[400px] overflow-y-auto">
                        {patterns.map((p: PatternMeta) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => onTogglePattern(p.id)}
                            className={cn(
                              "w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-secondary text-left",
                              activePatterns.includes(p.id) && "bg-secondary",
                            )}
                          >
                            <span className={cn("h-3.5 w-3.5 shrink-0 flex items-center justify-center", activePatterns.includes(p.id) ? colorClass : "text-transparent")}>
                              <Check className="h-3 w-3" />
                            </span>
                            <span className="truncate">{p.title}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      {/* Timeframe flyout */}
      {timeframe && onTimeframeChange && (
        <div className="relative">
          <RailButton
            icon={Clock}
            title="Timeframe"
            active={openGroup === "tf"}
            onClick={() => setOpenGroup((o) => (o === "tf" ? null : "tf"))}
          />
          {openGroup === "tf" && (
            <div className="absolute left-full top-0 ml-1 z-30 min-w-[80px] rounded-md bg-card border border-border shadow-xl py-1">
              {TIMEFRAMES.map((tf) => (
                <button
                  key={tf}
                  type="button"
                  onClick={() => { onTimeframeChange(tf); setOpenGroup(null); }}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-secondary text-left",
                    timeframe === tf && "bg-secondary text-primary",
                  )}
                >
                  {tf}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );

  // Shared settings section (magnet, stay in mode, object tree, clear)
  const settingsSection = (
    <>
      <div className="my-0.5 w-full border-t border-border/50" />
      {onOpenObjectTree && drawings.length > 0 && (
        <RailButton
          icon={ListTree}
          title="Object tree (drawings)"
          onClick={onOpenObjectTree}
        />
      )}
      {onCycleMagnet && (
        <RailButton
          icon={Magnet}
          title={`Magnet: ${magnetMode}`}
          active={magnetMode !== "none"}
          onClick={onCycleMagnet}
        />
      )}
      {onToggleStayInDrawingMode && (
        <RailButton
          icon={Repeat}
          title="Stay in drawing mode"
          active={stayInDrawingMode}
          onClick={onToggleStayInDrawingMode}
        />
      )}
      {drawings.length > 0 && onClearDrawings && (
        <RailButton
          icon={Trash2}
          title="Clear all drawings"
          onClick={onClearDrawings}
        />
      )}
    </>
  );

  // Docked: fixed to the left edge, pushes content right via padding
  if (docked) {
    return (
      <>
        {/* Spacer to push chart content right */}
        <div className="absolute left-0 top-0 bottom-0 z-10 w-[44px] border-r border-border bg-card/95" />
        <div
          ref={ref}
          className="absolute left-0 top-0 bottom-0 z-20 flex flex-col items-center gap-0.5 py-2 w-[44px]"
        >
          {/* Dock/undock toggle at the top */}
          <button
            type="button"
            title="Undock toolbar (float)"
            onClick={() => setDocked(false)}
            className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors mb-1"
          >
            <PanelLeft className="h-3.5 w-3.5" />
          </button>
          <div className="w-full border-t border-border/50 mb-1" />

          {toolButtons}

          <div className="mt-auto" />
          {settingsSection}
        </div>
      </>
    );
  }

  // Floating: draggable with a grip handle, dock button to snap back
  return (
    <div
      ref={ref}
      style={drag.style}
      className="absolute left-1 top-1 z-20 flex flex-col items-center gap-0.5 rounded-md bg-card/90 border border-border p-0.5 backdrop-blur-sm"
    >
      <div className="flex w-full items-center justify-between gap-0.5">
        <div
          onPointerDown={drag.onPointerDown}
          title="Drag to move"
          className="flex cursor-move justify-center py-0.5 text-muted-foreground/50 hover:text-muted-foreground flex-1"
        >
          <PenTool className="h-3.5 w-3.5" />
        </div>
        <button
          type="button"
          title="Dock to left edge"
          onClick={() => setDocked(true)}
          className="p-0.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
        >
          <PanelLeft className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="w-full border-t border-border/50" />

      {toolButtons}

      <div className="mt-auto" />
      {settingsSection}
    </div>
  );
}