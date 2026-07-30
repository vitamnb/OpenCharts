import { useEffect } from "react";
import { X } from "lucide-react";
import {
  INDICATOR_REGISTRY,
  getParamDescriptors,
  type IndicatorType,
  type IndicatorParams,
  type IndicatorParamValue,
} from "../../lib/indicators.ts";
import { IndicatorControl } from "./IndicatorControl.tsx";

interface Props {
  type: IndicatorType;
  params: IndicatorParams;
  onChange: (params: IndicatorParams) => void;
  onClose: () => void;
}

export function IndicatorSettingsDialog({ type, params, onChange, onClose }: Props) {
  const config = INDICATOR_REGISTRY.find((r) => r.type === type);
  const descriptors = getParamDescriptors(type);

  // Close on Escape
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
        className="w-80 bg-card border border-border rounded-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: config.color }}
            />
            <span className="font-medium text-sm">{config.label} Settings</span>
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
          {descriptors.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No adjustable parameters for this indicator.
            </p>
          ) : (
            descriptors.map((desc) => {
              const paramVal: IndicatorParamValue = params[desc.key] ?? config.defaultParams[desc.key] ?? 0;
              return (
                <IndicatorControl
                  key={desc.key}
                  desc={desc}
                  paramVal={paramVal}
                  onChange={(key, val) => onChange({ ...params, [key]: val })}
                />
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border">
          <button
            onClick={() => {
              const defaults: IndicatorParams = {};
              for (const desc of descriptors) {
                const cfg = INDICATOR_REGISTRY.find((r) => r.type === type);
                if (cfg?.defaultParams[desc.key] !== undefined) {
                  defaults[desc.key] = cfg.defaultParams[desc.key]!;
                }
              }
              onChange(defaults);
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