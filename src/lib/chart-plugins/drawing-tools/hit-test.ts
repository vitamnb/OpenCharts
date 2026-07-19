import { dist, distToSegment, type Pt, pointInBox } from "./geometry";
import type { Hit, PriceKey, ResolvedEntry, TimeKey } from "./types";

const HANDLE_TOLERANCE = 8;
const LINE_TOLERANCE = 6;

// ── Text measurement ───────────────────────────────────────────────────────
//
// The hit test needs accurate text dimensions to match the rendered text box.
// We use a shared offscreen canvas for `measureText` so the hit box matches
// what the user actually sees, not a rough `charCount × 0.6` estimate.

let _measureCtx: CanvasRenderingContext2D | null | undefined;

function measureCtx(): CanvasRenderingContext2D | null {
  if (_measureCtx === undefined) {
    _measureCtx =
      typeof document !== "undefined"
        ? document.createElement("canvas").getContext("2d")
        : null;
  }
  return _measureCtx;
}

/**
 * Measure text width/height in CSS pixels, matching the renderer's font.
 * Falls back to a rough character-count estimate when no canvas is available
 * (SSR / test environments without a DOM).
 */
function textDimensions(
  text: string,
  fontSize: number,
  bold?: boolean,
  italic?: boolean,
): { w: number; h: number } {
  const lines = text.split("\n");
  const lineH = fontSize * 1.3;
  const h = lines.length * lineH;
  const ctx = measureCtx();
  if (ctx) {
    const style = italic ? "italic " : "";
    const weight = bold ? "bold " : "";
    ctx.font = `${style}${weight}${Math.round(fontSize)}px sans-serif`;
    const w = Math.max(...lines.map((l) => ctx.measureText(l).width), 0);
    // Brave's canvas fingerprinting protection makes measureText return 0
    // for dynamically created canvas contexts. Fall back to the estimate.
    if (w > 0) return { w, h };
  }
  // Fallback: rough estimate (same as the old heuristic)
  const longest = lines.reduce((m, l) => Math.max(m, l.length), 4);
  return { w: longest * fontSize * 0.6, h };
}

/** Pixel tolerances, scaled up for touch input (fat-finger friendly). */
interface Tol {
  handle: number;
  line: number;
}

/**
 * Topmost (last-drawn) drawing wins, matching visual stacking order.
 * `scale` multiplies hit tolerances — pass ~2 for touch input.
 */
export function hitTest(entries: ResolvedEntry[], p: Pt, scale = 1): Hit | null {
  const tol: Tol = { handle: HANDLE_TOLERANCE * scale, line: LINE_TOLERANCE * scale };
  for (let i = entries.length - 1; i >= 0; i--) {
    const hit = hitEntry(entries[i]!, p, tol);
    if (hit) return hit;
  }
  return null;
}

function hitEntry(e: ResolvedEntry, p: Pt, tol: Tol): Hit | null {
  switch (e.d.type) {
    case "trendline":
      return hitTrendline(e, p, tol);
    case "horizontal":
      return hitHorizontal(e, p, tol);
    case "rectangle":
      return hitRectangle(e, p, tol);
    case "fibonacci":
      return hitFibonacci(e, p, tol);
    case "position":
      return hitPosition(e, p, tol);
    case "arrow":
      return hitTrendline(e, p, tol);
    case "fibextension":
      return hitFibonacci(e, p, tol);
    case "vertical":
      return hitVertical(e, p, tol);
    case "channel":
      return hitChannel(e, p, tol);
    case "hchannel":
      return hitHChannel(e, p, tol);
    case "ellipse":
    case "triangle":
      return hitBoxShape(e, p, tol);
    case "text":
      return hitText(e, p, tol);
    default:
      return null;
  }
}

function hitVertical(e: ResolvedEntry, p: Pt, tol: Tol): Hit | null {
  if (e.x1 === null || Math.abs(p.x - e.x1) > tol.line) return null;
  return { id: e.d.id, region: { kind: "point", timeKey: "time", priceKey: null } };
}

function hitChannel(e: ResolvedEntry, p: Pt, tol: Tol): Hit | null {
  const anchor = anchorHit(e, p, tol);
  if (anchor) return anchor;
  if (e.x1 !== null && e.y3 != null && dist(p, { x: e.x1, y: e.y3 }) <= tol.handle) {
    return { id: e.d.id, region: { kind: "point", timeKey: "time3", priceKey: "price3" } };
  }
  if (e.x1 === null || e.y1 === null || e.x2 === null || e.y2 === null || e.y3 == null) return null;
  const dy = e.y3 - e.y1;
  const onMain = distToSegment(p, { x: e.x1, y: e.y1 }, { x: e.x2, y: e.y2 }) <= tol.line;
  const onOff = distToSegment(p, { x: e.x1, y: e.y3 }, { x: e.x2, y: e.y2 + dy }) <= tol.line;
  // Also allow grabbing anywhere between the two channel lines
  const inChannel = pointInBox(p, e.x1, Math.min(e.y1, e.y3), e.x2, Math.max(e.y2, e.y2 + dy), 0);
  return onMain || onOff || inChannel ? bodyHit(e) : null;
}

// Horizontal channel: two horizontal lines at y1 and y2, full chart width.
// 2-click tool: click top, click bottom. Both lines span edge-to-edge.
// Handles are grabbable anywhere along the line (full width), not just at x1.
function hitHChannel(e: ResolvedEntry, p: Pt, tol: Tol): Hit | null {
  if (e.y1 === null || e.y2 === null) return null;
  // Handle on the first line (move whole channel) - any x position
  if (Math.abs(p.y - e.y1) <= tol.handle) {
    return { id: e.d.id, region: { kind: "point", timeKey: "time", priceKey: "price" } };
  }
  // Handle on the second line (resize channel height) - any x position
  if (Math.abs(p.y - e.y2) <= tol.handle) {
    return { id: e.d.id, region: { kind: "point", timeKey: "time2", priceKey: "price2" } };
  }
  // Between the two lines (body grab)
  const yMin = Math.min(e.y1, e.y2);
  const yMax = Math.max(e.y1, e.y2);
  if (p.y >= yMin && p.y <= yMax) return bodyHit(e);
  return null;
}

// Ellipse / triangle: corner anchors resize, body = inside the bounding box.
function hitBoxShape(e: ResolvedEntry, p: Pt, tol: Tol): Hit | null {
  if (e.x1 === null || e.y1 === null || e.x2 === null || e.y2 === null) return null;
  const corner = rectCornerHit(e, p, tol);
  if (corner) return corner;
  return pointInBox(p, e.x1, e.y1, e.x2, e.y2, tol.line) ? bodyHit(e) : null;
}

function hitText(e: ResolvedEntry, p: Pt, tol: Tol): Hit | null {
  if (e.x1 === null || e.y1 === null) return null;
  const size = e.d.fontSize ?? 14;
  const text = e.d.text ?? "Text";
  const { w, h } = textDimensions(text, size, e.d.bold, e.d.italic);
  // The renderer adds 4px padding around the text for bg/border. Use the
  // larger of the measured width and a minimum so short text is still
  // grabbable.
  const pad = 4;
  const left = e.x1 - pad - tol.line;
  const right = e.x1 + w + pad + tol.line;
  const top = e.y1 - pad - tol.line;
  const bottom = e.y1 + h + pad + tol.line;
  const inside = p.x >= left && p.x <= right && p.y >= top && p.y <= bottom;
  return inside ? bodyHit(e) : null;
}

function pointHit(e: ResolvedEntry, timeKey: TimeKey | null, priceKey: PriceKey | null): Hit {
  return { id: e.d.id, region: { kind: "point", timeKey, priceKey } };
}

// Position handles: entry / target / stop sit at the box mid-x; the right edge
// resizes the box width. Body = anywhere inside the entry↔stop↔target span.
function hitPosition(e: ResolvedEntry, p: Pt, tol: Tol): Hit | null {
  const { x1, x2, y1, yStop, yTarget } = e;
  if (x1 === null || x2 === null || y1 === null) return null;
  const xa = Math.min(x1, x2);
  const xb = Math.max(x1, x2);
  const xm = (xa + xb) / 2;
  if (yTarget != null && dist(p, { x: xm, y: yTarget }) <= tol.handle) {
    return pointHit(e, null, "targetPrice");
  }
  if (yStop != null && dist(p, { x: xm, y: yStop }) <= tol.handle) {
    return pointHit(e, null, "stopPrice");
  }
  if (dist(p, { x: xm, y: y1 }) <= tol.handle) return pointHit(e, null, "price");
  if (dist(p, { x: xb, y: y1 }) <= tol.handle) return pointHit(e, "time2", null);
  const ys = [y1, yStop ?? y1, yTarget ?? y1];
  const top = Math.min(...ys);
  const bot = Math.max(...ys);
  const inside =
    p.x >= xa - tol.line && p.x <= xb + tol.line && p.y >= top - tol.line && p.y <= bot + tol.line;
  return inside ? bodyHit(e) : null;
}

function bodyHit(e: ResolvedEntry): Hit {
  return { id: e.d.id, region: { kind: "body" } };
}

/** Anchor-handle check shared by all two-point drawings. */
function anchorHit(e: ResolvedEntry, p: Pt, tol: Tol): Hit | null {
  if (e.x1 !== null && e.y1 !== null && dist(p, { x: e.x1, y: e.y1 }) <= tol.handle) {
    return { id: e.d.id, region: { kind: "point", timeKey: "time", priceKey: "price" } };
  }
  if (e.x2 !== null && e.y2 !== null && dist(p, { x: e.x2, y: e.y2 }) <= tol.handle) {
    return { id: e.d.id, region: { kind: "point", timeKey: "time2", priceKey: "price2" } };
  }
  return null;
}

function hitTrendline(e: ResolvedEntry, p: Pt, tol: Tol): Hit | null {
  const anchor = anchorHit(e, p, tol);
  if (anchor) return anchor;
  const seg =
    e.seg ??
    (e.x1 !== null && e.y1 !== null && e.x2 !== null && e.y2 !== null
      ? { x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2 }
      : null);
  if (!seg) return null;
  const near = distToSegment(p, { x: seg.x1, y: seg.y1 }, { x: seg.x2, y: seg.y2 }) <= tol.line;
  return near ? bodyHit(e) : null;
}

// A horizontal line only has a price — dragging it anywhere moves the price.
function hitHorizontal(e: ResolvedEntry, p: Pt, tol: Tol): Hit | null {
  if (e.y1 === null || Math.abs(p.y - e.y1) > tol.line) return null;
  return { id: e.d.id, region: { kind: "point", timeKey: null, priceKey: "price" } };
}

function hitRectangle(e: ResolvedEntry, p: Pt, tol: Tol): Hit | null {
  if (e.x1 === null || e.y1 === null || e.x2 === null || e.y2 === null) return null;
  const corner = rectCornerHit(e, p, tol);
  if (corner) return corner;
  return pointInBox(p, e.x1, e.y1, e.x2, e.y2, tol.line) ? bodyHit(e) : null;
}

// Each corner maps to the time/price keys it controls, so dragging a derived
// corner (e.g. x1,y2) resizes via time + price2 like TradingView.
function rectCornerHit(e: ResolvedEntry, p: Pt, tol: Tol): Hit | null {
  const corners = [
    { x: e.x1!, y: e.y1!, timeKey: "time", priceKey: "price" },
    { x: e.x2!, y: e.y2!, timeKey: "time2", priceKey: "price2" },
    { x: e.x1!, y: e.y2!, timeKey: "time", priceKey: "price2" },
    { x: e.x2!, y: e.y1!, timeKey: "time2", priceKey: "price" },
  ] as const;
  for (const c of corners) {
    if (dist(p, c) <= tol.handle) {
      return { id: e.d.id, region: { kind: "point", timeKey: c.timeKey, priceKey: c.priceKey } };
    }
  }
  return null;
}

function hitFibonacci(e: ResolvedEntry, p: Pt, tol: Tol): Hit | null {
  const anchor = anchorHit(e, p, tol);
  if (anchor) return anchor;
  if (e.x1 === null || e.x2 === null || !e.fibLevels) return null;
  if (p.x < Math.min(e.x1, e.x2) - tol.line) return null;
  if (p.x > Math.max(e.x1, e.x2) + tol.line) return null;
  const onLevel = e.fibLevels.some((lvl) => lvl.y !== null && Math.abs(p.y - lvl.y) <= tol.line);
  if (onLevel) return bodyHit(e);
  // Also allow grabbing anywhere between the fib's vertical range
  const ys = e.fibLevels.map((lvl) => lvl.y).filter((y): y is number => y !== null);
  if (ys.length < 2) return null;
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  if (p.y >= yMin && p.y <= yMax) return bodyHit(e);
  return null;
}
