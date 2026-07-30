/**
 * Indicator Library Adapter
 *
 * Bridges lightweight-charts-indicators (deepentropy) to our indicator UI.
 * Maps the library's inputConfig/plotConfig/calculate to our registry/settings/series wiring.
 *
 * The adapter is the gateway: once built, each new indicator is just a registry entry.
 */

// The library's input config shape
export interface LibInputConfig {
  id: string;
  type: "int" | "float" | "source" | "string" | "bool";
  title: string;
  defval: number | string | boolean;
  min?: number;
  max?: number;
  step?: number;
  options?: string[]; // for "string" type (dropdowns)
}

// The library's plot config shape
export interface LibPlotConfig {
  id: string;
  title: string;
  color: string;
  lineWidth: number;
  display?: string; // "none" to hide
  style?: string; // "linebr" for line-break style (e.g. Supertrend)
}

// The library's hline config shape
export interface LibHlineConfig {
  id: string;
  price: number;
  color: string;
  linestyle: string;
  title: string;
}

// The library's fill config shape
export interface LibFillConfig {
  plot1: string;
  plot2: string;
  options: { color: string; transp: number; title?: string };
}

// Result from calculate()
export interface LibCalcResult {
  metadata: { title: string; shortTitle: string; overlay: boolean };
  plots: Record<string, Array<{ time: number; value: number | null }>>;
  fills: LibFillConfig[];
  markers: unknown;
}

// Our param descriptor for the settings UI
export interface AdapterParamDescriptor {
  key: string;
  label: string;
  type: "number" | "select" | "bool" | "source";
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
  default: number | string | boolean;
}

// Convert library inputConfig to our param descriptors
// (kept for reference but not currently used, the registry has its own param descriptors)
// export function inputConfigToParams(...)

// Get visible plots (display !== "none")
// (kept for reference, not currently used)
// export function getVisiblePlots(...)

// Map library plot data to { time, value }[] with nulls filtered for line series
export function plotToLineData(
  data: Array<{ time: number; value: number | null }>,
): Array<{ time: number; value: number }> {
  return data
    .filter((p) => p.value !== null && p.value !== undefined && !Number.isNaN(p.value))
    .map((p) => ({ time: p.time, value: p.value as number }));
}

// Build the inputs object from our flat params (key -> value)
// (kept for reference, not currently used, buildLibInputs in useIndicators does this inline)
// export function buildInputs(...)

// Get hline values (horizontal reference lines like RSI 70/30)
// (kept for reference, not currently used)
// export function getHlines(...)