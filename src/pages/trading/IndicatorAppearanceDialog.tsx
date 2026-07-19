import { useEffect } from "react";
import { X } from "lucide-react";
import {
  INDICATOR_REGISTRY,
  type IndicatorType,
  type IndicatorAppearance,
} from "../../lib/indicators.ts";
import { cn } from "../../lib/utils.ts";

interface Props {
  type: IndicatorType;
  appearance: IndicatorAppearance;
  onChange: (appearance: IndicatorAppearance) => void;
  onClose: () => void;
}

const LINE_STYLES = [
  { value: "solid", label: "Solid" },
  { value: "dashed", label: "Dashed" },
  { value: "dotted", label: "Dotted" },
] as const;

const COLOR_PRESETS = [
  "#f0b90b", "#e377c2", "#2196f3", "#26a69a", "#ff7043",
  "#ab47bc", "#42a5f5", "#f6465d", "#0ecb81", "#ff9800",
  "#9c27b0", "#00bcd4", "#ffeb3b", "#795548", "#607d8b",
];

export function IndicatorAppearanceDialog({ type, appearance, onChange, onClose }: Props) {
  const config = INDICATOR_REGISTRY.find((r) => r.type === type);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  if (!config) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="w-72 bg-card border border-border rounded-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: appearance.color }}
            />
            <span className="font-medium text-sm">{config.label} Appearance</span>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          {/* Color picker */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Color</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={appearance.color}
                onChange={(e) => onChange({ ...appearance, color: e.target.value })}
                className="w-8 h-8 rounded border border-border cursor-pointer bg-transparent p-0"
              />
              <input
                type="text"
                value={appearance.color}
                onChange={(e) => onChange({ ...appearance, color: e.target.value })}
                className="flex-1 px-2 py-1 text-sm bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="flex flex-wrap gap-1">
              {COLOR_PRESETS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => onChange({ ...appearance, color: c })}
                  className={cn(
                    "w-5 h-5 rounded border transition-transform hover:scale-110",
                    appearance.color === c ? "border-foreground ring-1 ring-foreground" : "border-border/40",
                  )}
                  style={{ backgroundColor: c }}
                  title={c}
                />
              ))}
            </div>
          </div>

          {/* Line width */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Line Width</label>
              <span className="text-xs text-muted-foreground ">{appearance.lineWidth}px</span>
            </div>
            <input
              type="range"
              value={appearance.lineWidth}
              min={1}
              max={5}
              step={1}
              onChange={(e) => onChange({ ...appearance, lineWidth: parseInt(e.target.value) })}
              className="w-full h-1.5 bg-secondary rounded-full appearance-none cursor-pointer accent-primary"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>1</span>
              <span>5</span>
            </div>
          </div>

          {/* Line style */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Line Style</label>
            <div className="flex gap-1">
              {LINE_STYLES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => onChange({ ...appearance, lineStyle: s.value })}
                  className={cn(
                    "flex-1 px-2 py-1 text-xs rounded border transition-colors",
                    appearance.lineStyle === s.value
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background border-border hover:bg-secondary",
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Visibility */}
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Visible</label>
            <button
              type="button"
              onClick={() => onChange({ ...appearance, visible: !appearance.visible })}
              className={cn(
                "relative w-9 h-5 rounded-full transition-colors",
                appearance.visible ? "bg-primary" : "bg-secondary",
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 w-4 h-4 rounded-full bg-foreground transition-transform",
                  appearance.visible ? "translate-x-4" : "translate-x-0.5",
                )}
              />
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border">
          <button
            onClick={() => {
              const cfg = INDICATOR_REGISTRY.find((r) => r.type === type);
              onChange({
                color: cfg?.color ?? "#888",
                lineWidth: 1,
                lineStyle: "solid",
                visible: true,
              });
            }}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Reset to defaults
          </button>
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}