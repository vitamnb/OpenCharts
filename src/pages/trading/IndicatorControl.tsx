/**
 * Shared indicator parameter controls.
 * Used by both IndicatorDialog (full settings + appearance) and IndicatorSettingsDialog (settings only).
 */
import type { IndicatorParamValue } from "../../lib/indicators.ts";
import { cn } from "../../lib/utils.ts";

export interface ControlDescriptor {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  controlType?: "number" | "select" | "source" | "bool";
  options?: string[];
}

interface Props {
  desc: ControlDescriptor;
  paramVal: IndicatorParamValue;
  onChange: (key: string, value: IndicatorParamValue) => void;
}

export function IndicatorControl({ desc, paramVal, onChange }: Props) {
  const ctrlType = desc.controlType ?? "number";

  if (ctrlType === "select") {
    return (
      <div key={desc.key} className="space-y-1.5">
        <label className="text-sm font-medium">{desc.label}</label>
        <select
          value={paramVal as string}
          onChange={(e) => onChange(desc.key, e.target.value)}
          className="w-full px-2 py-1.5 text-sm bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
        >
          {(desc.options ?? []).map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      </div>
    );
  }

  if (ctrlType === "source") {
    return (
      <div key={desc.key} className="space-y-1.5">
        <label className="text-sm font-medium">{desc.label}</label>
        <select
          value={paramVal as string}
          onChange={(e) => onChange(desc.key, e.target.value)}
          className="w-full px-2 py-1.5 text-sm bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary capitalize"
        >
          {(desc.options ?? ["close", "open", "high", "low", "hl2", "hlc3", "ohlc4"]).map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      </div>
    );
  }

  if (ctrlType === "bool") {
    return (
      <div key={desc.key} className="flex items-center justify-between">
        <label className="text-sm font-medium">{desc.label}</label>
        <button
          type="button"
          onClick={() => onChange(desc.key, !paramVal)}
          className={cn(
            "relative w-9 h-5 rounded-full transition-colors",
            paramVal ? "bg-primary" : "bg-secondary",
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform",
              paramVal ? "translate-x-4" : "translate-x-0.5",
            )}
          />
        </button>
      </div>
    );
  }

  // Default: numeric slider + number input
  return (
    <div key={desc.key} className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">{desc.label}</label>
        <input
          type="number"
          value={paramVal as number}
          min={desc.min}
          max={desc.max}
          step={desc.step}
          onChange={(e) => {
            const val = parseFloat(e.target.value);
            if (!isNaN(val)) {
              onChange(desc.key, val);
            }
          }}
          className="w-20 px-2 py-1.5 text-sm bg-background border border-border rounded text-right focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
      <input
        type="range"
        value={paramVal as number}
        min={desc.min}
        max={desc.max}
        step={desc.step}
        onChange={(e) => {
          const val = parseFloat(e.target.value);
          if (!isNaN(val)) {
            onChange(desc.key, val);
          }
        }}
        className="w-full h-1.5 bg-secondary rounded-full appearance-none cursor-pointer accent-primary"
      />
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>{desc.min}</span>
        <span>{desc.max}</span>
      </div>
    </div>
  );
}