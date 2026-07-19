import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Circle,
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
  Spline,
  TrendingUp,
  TrendingUpDown,
  Triangle,
  Type,
  Magnet,
  Repeat,
  Trash2,
  PenTool,
  Waves,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useDragOffset } from "../../hooks/useDragOffset.ts";
import { cn } from "../../lib/utils.ts";
import type { DrawingTool, MagnetMode } from "./constants.ts";

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
      { tool: "extended", icon: Spline, label: "Extended Line" },
      { tool: "horizontal", icon: Minus, label: "Horizontal Line" },
      { tool: "vertical", icon: MoveVertical, label: "Vertical Line" },
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
    ],
  },
  {
    id: "trade",
    icon: ArrowUpRight,
    label: "Trade",
    tools: [
      { tool: "long-position", icon: ArrowUpRight, label: "Long Position" },
      { tool: "short-position", icon: ArrowDownRight, label: "Short Position" },
      { tool: "measure", icon: Ruler, label: "Measure" },
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
}: DrawingToolRailProps) {
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [docked, setDocked] = useState(() => localStorage.getItem("drawingRailDocked") === "true");
  const ref = useRef<HTMLDivElement>(null);
  const drag = useDragOffset();

  // Persist dock state
  useEffect(() => {
    localStorage.setItem("drawingRailDocked", String(docked));
  }, [docked]);

  useEffect(() => {
    if (!openGroup) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpenGroup(null);
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