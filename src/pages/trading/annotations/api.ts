// Annotation API — exposes window.openCharts.annotations namespace
import { useAnnotationStore, buildAnnotation } from "./store";
import type {
  HorizontalLineOptions,
  HorizontalRayOptions,
  TrendLineOptions,
  RectangleOptions,
  TextLabelOptions,
  VerticalLineOptions,
  BandOptions,
  MarkerOptions,
  Annotation,
  AnnotationSnapshot,
} from "./types";

// Track the current chart key for the API
let currentChartKey = "";

export function setCurrentChartKey(key: string): void {
  currentChartKey = key;
}

function ensureChartKey(): string {
  if (!currentChartKey) {
    console.warn("[annotations] No chart key set. Call setCurrentChartKey first.");
  }
  return currentChartKey;
}

// Default colors
const DEFAULT_COLOR = "#2196F3";
const DEFAULT_GROUP = "default";

function mergeDefaults(options: unknown, color?: string): Record<string, unknown> {
  return {
    color: color ?? DEFAULT_COLOR,
    group: DEFAULT_GROUP,
    ...((options ?? {}) as Record<string, unknown>),
  };
}

export const annotationsApi = {
  // ── Primitives ──────────────────────────────────────────────

  addHorizontalLine(options: HorizontalLineOptions): string {
    const opts = mergeDefaults(options, "#2196F3");
    const ann = buildAnnotation("horizontalLine", opts);
    return useAnnotationStore.getState().add(ensureChartKey(), ann);
  },

  addPriceLine(options: HorizontalLineOptions): string {
    return this.addHorizontalLine(options);
  },

  addHorizontalRay(options: HorizontalRayOptions): string {
    const opts = mergeDefaults(options, "#FF9800");
    const ann = buildAnnotation("horizontalRay", opts);
    return useAnnotationStore.getState().add(ensureChartKey(), ann);
  },

  addTrendLine(options: TrendLineOptions): string {
    const opts = mergeDefaults(options, "#4CAF50");
    const ann = buildAnnotation("trendLine", opts);
    return useAnnotationStore.getState().add(ensureChartKey(), ann);
  },

  addRectangle(options: RectangleOptions): string {
    const opts = mergeDefaults(options, "#9C27B0");
    const ann = buildAnnotation("rectangle", opts);
    return useAnnotationStore.getState().add(ensureChartKey(), ann);
  },

  addTextLabel(options: TextLabelOptions): string {
    const opts = mergeDefaults(options, "#FFFFFF");
    const ann = buildAnnotation("textLabel", opts);
    return useAnnotationStore.getState().add(ensureChartKey(), ann);
  },

  addVerticalLine(options: VerticalLineOptions): string {
    const opts = mergeDefaults(options, "#F44336");
    const ann = buildAnnotation("verticalLine", opts);
    return useAnnotationStore.getState().add(ensureChartKey(), ann);
  },

  addBand(options: BandOptions): string {
    const opts = mergeDefaults(options, "#00BCD4");
    const ann = buildAnnotation("band", opts);
    return useAnnotationStore.getState().add(ensureChartKey(), ann);
  },

  addMarker(options: MarkerOptions): string {
    const opts = mergeDefaults(options, "#FFEB3B");
    const ann = buildAnnotation("marker", opts);
    return useAnnotationStore.getState().add(ensureChartKey(), ann);
  },

  // ── Management ──────────────────────────────────────────────

  removeAnnotation(id: string): void {
    useAnnotationStore.getState().remove(id);
  },

  clearGroup(group: string): void {
    useAnnotationStore.getState().clearGroup(ensureChartKey(), group);
  },

  clearAll(): void {
    useAnnotationStore.getState().clearAll(ensureChartKey());
  },

  list(): Annotation[] {
    return useAnnotationStore.getState().list(ensureChartKey());
  },

  snapshot(): AnnotationSnapshot {
    return useAnnotationStore.getState().snapshot(ensureChartKey());
  },

  restore(snap: AnnotationSnapshot): void {
    useAnnotationStore.getState().restore(ensureChartKey(), snap);
  },

  // ── Persistence ─────────────────────────────────────────────

  persist(group?: string): void {
    // Zustand persist middleware handles localStorage automatically
    // This is a no-op stub for API compatibility with the spec
    // The store already persists to localStorage
    void group; // suppress unused warning
  },

  load(): void {
    // Zustand persist middleware auto-loads from localStorage
    useAnnotationStore.persist.rehydrate();
  },

  forget(group?: string): void {
    if (group) {
      useAnnotationStore.getState().clearGroup(ensureChartKey(), group);
    } else {
      useAnnotationStore.getState().clearAll(ensureChartKey());
    }
  },
};

// Type for the window namespace
declare global {
  interface Window {
    openCharts?: {
      annotations: typeof annotationsApi;
    };
  }
}

/** Mount the annotation API on window.openCharts */
export function mountAnnotationApi(): void {
  if (typeof window === "undefined") return;
  if (!window.openCharts) {
    window.openCharts = { annotations: annotationsApi };
  } else {
    window.openCharts.annotations = annotationsApi;
  }
}

/** Unmount the annotation API (cleanup) */
export function unmountAnnotationApi(): void {
  if (typeof window === "undefined") return;
  if (window.openCharts) {
    delete (window.openCharts as Record<string, unknown>).annotations;
  }
}