// Annotation API types
// See planning/opencharts-annotations-api.md for the full spec

export type LineStyleOption = 0 | 1 | 2 | 3 | 4;

export interface AnnotationOptions {
  /** Auto-generated UUID if omitted */
  id?: string;
  /** Grouping key, e.g. "sr", "pattern", "session", "strategy" */
  group?: string;
  /** Shown in tooltip/legend */
  title?: string;
  /** Hex color string */
  color?: string;
  /** lightweight-charts line styles: 0=solid, 1=dotted, 2=dashed, 3=large_dashed, 4=sparse_dotted */
  lineStyle?: LineStyleOption;
  lineWidth?: number;
  visible?: boolean;
  /** Allow drag in UI (phase 2) */
  editable?: boolean;
  /** Prevent agent/user edits */
  locked?: boolean;
}

export interface HorizontalLineOptions extends AnnotationOptions {
  price: number;
}

export interface HorizontalRayOptions extends AnnotationOptions {
  price: number;
  /** Unix timestamp (seconds) where the ray starts */
  time: number;
}

export interface TrendLineOptions extends AnnotationOptions {
  /** Start point */
  time1: number;
  price1: number;
  /** End point */
  time2: number;
  price2: number;
}

export interface RectangleOptions extends AnnotationOptions {
  time1: number;
  price1: number;
  time2: number;
  price2: number;
  /** Fill opacity 0-1 */
  fillOpacity?: number;
}

export interface TextLabelOptions extends AnnotationOptions {
  time: number;
  price: number;
  text: string;
  fontSize?: number;
  /** Anchor: where the text sits relative to the point */
  anchor?: "left" | "right" | "center";
}

export interface VerticalLineOptions extends AnnotationOptions {
  time: number;
}

export interface BandOptions extends AnnotationOptions {
  price1: number;
  price2: number;
  fillOpacity?: number;
}

export interface MarkerOptions extends AnnotationOptions {
  time: number;
  price?: number;
  shape?: "circle" | "arrow" | "square";
  text?: string;
}

export type AnnotationKind =
  | "horizontalLine"
  | "horizontalRay"
  | "trendLine"
  | "rectangle"
  | "textLabel"
  | "verticalLine"
  | "band"
  | "marker";

export interface Annotation {
  id: string;
  kind: AnnotationKind;
  group: string;
  title?: string;
  color: string;
  lineStyle: LineStyleOption;
  lineWidth: number;
  visible: boolean;
  editable: boolean;
  locked: boolean;
  // Kind-specific fields
  price?: number;
  price1?: number;
  price2?: number;
  time?: number;
  time1?: number;
  time2?: number;
  text?: string;
  fontSize?: number;
  anchor?: "left" | "right" | "center";
  fillOpacity?: number;
  shape?: "circle" | "arrow" | "square";
  chartKey: string;
  createdAt: number;
  createdBy: "agent" | "user";
}

export type AnnotationSnapshot = Annotation[];

// Chart key helper
export function chartKey(symbol: string, timeframe: string): string {
  return `${symbol}:${timeframe}`;
}