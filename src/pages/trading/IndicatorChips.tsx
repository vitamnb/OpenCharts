import { Eye, EyeOff, X, SlidersHorizontal } from "lucide-react";
import type { IndicatorType } from "../../lib/indicators.ts";
import { INDICATOR_REGISTRY } from "../../lib/indicators.ts";
import { cn } from "../../lib/utils.ts";

interface Props {
  activeIndicators: IndicatorType[];
  hiddenIndicators?: IndicatorType[];
  isDark: boolean;
  onRemove: (type: IndicatorType) => void;
  onToggleVisibility?: (type: IndicatorType) => void;
  onSettings: (type: IndicatorType) => void;
}

/**
 * Indicator chip buttons rendered below the bid/ask data in the chart's
 * top-left corner. Each chip shows the indicator name, a settings gear,
 * and a remove button. Chips stack vertically, one per line.
 */
export function IndicatorChips({
  activeIndicators,
  hiddenIndicators = [],
  isDark,
  onRemove,
  onToggleVisibility,
  onSettings,
}: Props) {
  if (activeIndicators.length === 0) return null;

  return (
    <div
      className="absolute z-10 pointer-events-none flex flex-col gap-0.5"
      style={{ top: "3.25rem", left: "calc(0.75rem + var(--rail-w, 0px))" }}
    >
      {activeIndicators.map((type) => {
        const config = INDICATOR_REGISTRY.find((r) => r.type === type);
        if (!config) return null;
        const isHidden = hiddenIndicators.includes(type);
        return (
          <div
            key={type}
            onClick={() => onSettings(type)}
            className={cn(
              "group flex items-center gap-1.5 rounded px-2 py-1 text-xs pointer-events-auto",
              "border backdrop-blur-sm transition-colors cursor-pointer",
              isHidden
                ? "opacity-40"
                : "",
              isDark
                ? "bg-card/70 border-border/40 hover:border-border/70"
                : "bg-card/70 border-border/40 hover:border-border/70",
            )}
          >
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: config.color }}
            />
            <span className={cn("text-foreground/80 font-medium", isHidden && "line-through")}>{config.label}</span>
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onSettings(type);
              }}
              className="ml-1 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-secondary text-muted-foreground hover:text-foreground transition-opacity"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
            </span>
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onToggleVisibility?.(type);
              }}
              className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-secondary text-muted-foreground hover:text-foreground transition-opacity"
              title={isHidden ? "Show indicator" : "Hide indicator"}
            >
              {isHidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </span>
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onRemove(type);
              }}
              className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-secondary text-muted-foreground hover:text-foreground transition-opacity"
            >
              <X className="h-2.5 w-2.5" />
            </span>
          </div>
        );
      })}
    </div>
  );
}