# Measure Tool — Rectangle Redesign

## Summary

The Measure tool (`Alt+M` / Ruler button) used to draw a dashed line from point A to point B with a small stats tooltip. It now draws a semi-transparent rectangle that frames the measured range, with the same Δprice / % / bars readout floating just above (or below, if there's no headroom) the box.

The tool is still a transient gesture: it never commits to the drawings array, lives only as the `setPreview` drawing, and clears on the next pointer-down / Escape.

## What changed

### 1. `src/pages/trading/constants.ts`

Removed `"measure"` from the placement-alias exclusion list so it becomes a first-class `DrawingType`. The working copy already had a partial refactor toward this state (brush tool was added in the same patch); this change keeps it consistent and lets the measure preview carry `type: "measure"` rather than masquerading as a trendline.

```diff
-  "none" | "ray" | "extended" | "long-position" | "short-position" | "measure"
+  "none" | "ray" | "extended" | "long-position" | "short-position"
```

### 2. `src/lib/chart-plugins/drawing-tools/renderers.ts`

Added a `case "measure":` in `renderEntry` that dispatches to a new `renderMeasure` function.

`renderMeasure`:
- Draws a filled rectangle (alpha 0.08) using the drawing's color, matching the rectangle tool's fill pattern
- Draws a dashed border (forced — even if a future style default tries to set it solid, the measure keeps its dashed look)
- Lighter visual weight than the regular rectangle tool so users can tell at a glance that it's a measurement overlay, not a user-drawn shape
- Calls `drawMeasureStatsBox` to render the readout

`drawMeasureStatsBox` is a centred dark label box that:
- Sits above the rectangle when there's room, falls through to below if the rectangle is at the top of the pane
- Is clamped to the pane edges horizontally so it never gets cut off
- Uses the same border color as the rectangle for visual cohesion
- Reuses the existing `trendlineStats` data (Δprice, %, bar count) — the angle line that gets appended by `drawStatsBox` is intentionally omitted (an angle on a rectangle is meaningless)

### 3. `src/lib/chart-plugins/drawing-tools/resolve.ts`

Added a `d.type === "measure"` branch that always populates `entry.stats` (no state check needed, since measure is always preview state and never gets hovered/selected). This reuses the existing `trendlineStats` helper — Δprice, percentage change, and bar count are all computed the same way for a rectangle's two corners as for a line's two endpoints.

### 4. `src/lib/chart-plugins/drawing-tools/manager.ts`

Two changes:

- `buildNew` (used during drag preview): changed `type: "trendline"` to `type: "measure"` for the measure tool. Color and dashed style preserved.
- `finishMeasure` (called on drag commit): same — the preview drawing now carries `type: "measure"` instead of masquerading as a trendline.

`makeNew` already short-circuits measure (`if (tool === "measure") return d;`) so the user's style defaults never override the measure's fixed look.

### 5. `src/lib/chart-plugins/drawing-tools/hit-test.ts`

Added a `case "measure":` returning `null`. Measure is never in the drawings array (preview only), so it should never appear in a hit-test. The explicit case is defensive — if a future change ever commits a measure to the drawings, this prevents accidental interaction with it.

## Behaviour preserved

- Click-drag from one point to another works identically
- Live preview while dragging (now a rectangle, was a line)
- Same stats content: Δprice, percentage change, bar count
- Tool auto-arms to "none" and disarms cursor on commit (unchanged)
- Pressing Escape clears the preview (unchanged)
- `clearMeasure` on next pointer-down (unchanged)
- Neutral grey color (`#b2b5be`) and dashed line style preserved so the measure overlay still looks like a measurement, not a user drawing

## Visual distinction from the rectangle tool

| Aspect | Rectangle tool | Measure tool |
|--------|---------------|--------------|
| Fill alpha | 0.14 | 0.08 (lighter) |
| Border | Solid (or user's style) | Dashed (forced) |
| Default color | User's color | Neutral grey `#b2b5be` |
| Persists | Yes | No (preview only) |
| Stats box | No | Yes (above/below rect) |
| Resizable | Yes (handles) | No |

## Type check

`npx tsc --noEmit` — no new errors introduced. The 6 pre-existing errors in the drawing-tools folder (broken `ISeriesPrimitivePaneRenderer` import in `drawings-primitive.ts`, missing `makeBrushPreview` / `commitBrush` methods in `manager.ts` brush tool code, and the `applyDash(scope, ctx, dash)` signature mismatch in `renderChannel`) are all present on the working copy before and after these changes — they're broken pieces of the brush tool refactor in flight, not regressions.
