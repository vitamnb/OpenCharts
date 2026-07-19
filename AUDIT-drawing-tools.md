# OpenCharts Drawing Tools Audit

**Date:** 2026-07-17  
**Auditor:** Roger (subagent)  
**Scope:** Full audit of the drawing tools system in `src/lib/chart-plugins/drawing-tools/` and related UI components.

---

## File Inventory

The drawing tools system consists of 8 files in `src/lib/chart-plugins/drawing-tools/`:

| File | Lines | Purpose |
|------|-------|---------|
| `manager.ts` | ~700 | Interaction layer: mouse/touch/keyboard handlers, placement, dragging, selection, snapping, clipboard |
| `hit-test.ts` | ~250 | Hit detection: maps pixel coordinates to drawing regions (point/body/handle) |
| `renderers.ts` | ~550 | Canvas rendering: draws each drawing type to the bitmap |
| `resolve.ts` | ~250 | Coordinate resolution: converts data-space anchors (time, price) to pixel coordinates |
| `drawings-primitive.ts` | ~170 | lightweight-charts series primitive: bridges the renderer to the chart's canvas pass |
| `geometry.ts` | ~50 | Math utilities: distance, distance-to-segment, angle snap, point-in-box |
| `types.ts` | ~80 | Type definitions: DataPoint, ResolvedEntry, Hit, HitRegion, callbacks |
| `line-alerts.ts` | ~50 | Price-cross alert detection and beep |

Related UI files:
- `DrawingToolRail.tsx` — left vertical toolbar with grouped flyouts
- `DrawingToolsOverlay.tsx` — floating toolbar, settings dialog, context menu
- `ObjectTreePanel.tsx` — drawings list panel
- `ChartPanel.tsx` — parent component wiring everything together
- `constants.ts` — DrawingLine type, DrawingTool enum, colors, timeframes

---

## Per-File Summary

### `manager.ts` — DrawingToolsManager

**What it does:** The interaction brain. Handles all mouse, touch, and keyboard input for drawings. Manages placement (click-click or press-drag-release), selection (single, multi with Shift), dragging (body, anchor point, group), snapping (magnet OHLC, angle 45-degree, object-to-object), clipboard (copy/paste/duplicate), and keyboard shortcuts (Alt+T/H/F/R, Delete, Escape, arrows).

**Key functions:**
- `handleMouseDown` — Routes to `placementStart` (if a tool is armed) or `selectionStart` (if not)
- `placementStart` — First click sets p1; second click or drag commits the drawing
- `selectionStart` — Hit-tests the click; selects the drawing; begins drag
- `beginDrag` — Stores the hit, origin, and group (for multi-select body drags)
- `dragMove` — Computes updates via `computeDragUpdates` → `dragPoint` (anchor) or `shiftDrawing` (body)
- `shiftDrawing` — Moves a whole drawing by pixel delta; branches per type (horizontal, vertical, position, channel, text, generic two-point)
- `pointFor` — Resolves cursor to data point with snapping (object snap, angle snap, magnet OHLC)
- `magnetSnap` — Snaps price to nearest O/H/L/C of the bar under cursor
- `commitDrawing` — Finalizes a drawing, fires `onAdd`, selects it, disarms tool (unless stay-in-mode)
- `hoverHit` — Updates hovered drawing and cursor style
- `applyCursor` — Sets container cursor: crosshair (tool armed), pointer (hover), grabbing (dragging), nwse-resize (anchor point)

**Connections:** Uses `hit-test.ts` for hit detection, `resolve.ts` for coordinate conversion, `drawings-primitive.ts` for rendering, `types.ts` for type definitions, `geometry.ts` for distance/snap math.

### `hit-test.ts` — Hit Detection

**What it does:** Given a set of resolved entries (drawings with pixel coordinates) and a mouse position, returns the topmost drawing the cursor is on and what part of it was hit (anchor point, body, or corner handle).

**Key functions:**
- `hitTest(entries, p, scale)` — Iterates entries top-to-bottom (last drawn = topmost), returns first hit
- `hitEntry(e, p, tol)` — Switch on drawing type, delegates to type-specific hit functions
- `anchorHit(e, p, tol)` — Checks if cursor is within `HANDLE_TOLERANCE` (8px) of either anchor point
- `rectCornerHit(e, p, tol)` — Checks 4 corners of a rectangle/ellipse/triangle for resize handle hits
- `hitHorizontal` — Horizontal line: hit if within `LINE_TOLERANCE` (6px) vertically; always returns a point hit (priceKey: "price")
- `hitHChannel` — Two horizontal lines + body between them; handles at (x1, y1) and (x1, y2)
- `hitPosition` — Entry/target/stop handles at box mid-x; right-edge width handle; body = inside the box
- `hitText` — Hit if inside the text bounding box (estimated width from char count * fontSize * 0.6)

**Return value:** `Hit | null` where `Hit = { id: string, region: HitRegion }` and `HitRegion` is either `{ kind: "point", timeKey, priceKey }` (draggable anchor) or `{ kind: "body" }` (move whole drawing).

**Tolerances:** Handle = 8px, Line = 6px. Touch scales both by `TOUCH_HIT_SCALE` (2x).

### `renderers.ts` — Canvas Rendering

**What it does:** Renders each drawing type to the canvas via the `renderEntry` dispatcher. Uses bitmap coordinates (multiplied by pixel ratio) for crisp rendering. Handles hover/selected state visual differences (handles shown, dashed text border).

**Key functions:**
- `renderEntry(scope, e, info)` — Switch on `e.d.type`, delegates to type-specific renderers
- `renderTrendline` — Draws line segment, optional arrowheads, handles, midpoint handle, stats box, alert badge
- `renderHorizontal` — Full-width horizontal line, handle at center, alert badge at right
- `renderRectangle` — Filled rect with `RECT_FILL_ALPHA` (0.14), stroke, 4 corner handles
- `renderPosition` — Green zone (entry to target), red zone (entry to stop), dashed entry line, handles, RR readout box
- `renderChannel` — Two parallel lines with fill between, 3 handles
- `renderHChannel` — Two full-width horizontal lines with fill between, 2 handles
- `renderArrow` — Line shortened by arrowhead length, then arrowhead drawn at original endpoint
- `renderText` — Text with optional bg/border, dashed border when hovered/selected
- `drawHandle` — White-filled circle with colored stroke (HANDLE_RADIUS = 5)
- `drawRectHandles` — 4 handles at rectangle corners
- `showHandles(e)` — Returns true if state is "hovered" or "selected"

### `resolve.ts` — Coordinate Resolution

**What it does:** Converts drawing data-space anchors (unix time + price) to pane pixel coordinates (x, y). Handles cross-timeframe anchors (drawn on 1h, viewing on 5m) and future anchors (in whitespace) via interpolation/extrapolation.

**Key functions:**
- `resolveEntry(d, ctx, state)` — Main resolver: converts a `DrawingLine` to a `ResolvedEntry` with x1/y1/x2/y2 and type-specific fields (seg, fibLevels, yStop, yTarget, x3, y3)
- `timeToX(ctx, time)` — Time to x coordinate; falls back to logical-index interpolation for off-grid times
- `xToTime(ctx, x)` — X to time; extrapolates in whitespace using `intervalSec`
- `logicalToX(ts, logical)` — Interpolates pixel position for fractional logical indices (lightweight-charts bails on non-integer logicals)
- `trendlineSegment(e, paneWidth)` — Computes the drawn/hit segment for trendlines, extending to pane edges if extendLeft/extendRight
- `resolveFibLevels(d, series)` — Computes fib retracement levels (0 at p2, 1 at p1, TradingView convention)
- `trendlineStats(d, ctx)` — Delta price, percent, bar count for the selected/preview trendline readout

### `drawings-primitive.ts` — DrawingsPrimitive

**What it does:** Bridge between the drawing system and lightweight-charts. Extends `PluginBase` (series primitive). Manages the list of drawings + preview, selected/hovered state, and triggers redraws via `requestUpdate()`.

**Key functions:**
- `setDrawings(drawings)` — Updates the drawing list, rebuilds axis views, requests redraw
- `setPreview(d)` — Sets the in-flight preview drawing (during placement)
- `setSelected(ids)` / `setHovered(id)` — Updates state, requests redraw
- `resolveEntries()` — Converts all drawings to resolved entries using current chart state; appends preview if present
- `_stateFor(id)` — Returns "selected", "hovered", or "normal" for each drawing
- `paneViews()` — Returns the pane view (renderer) to lightweight-charts
- `priceAxisViews()` — Returns price axis labels (horizontal lines always show; others only when selected)
- `appendAxisViews` — Horizontal lines always get a price axis label; other drawings only when selected

### `geometry.ts` — Math Utilities

**Functions:**
- `dist(a, b)` — Euclidean distance
- `distToSegment(p, a, b)` — Distance from point p to line segment a-b
- `snapAngle(anchor, p)` — Snap p to nearest 45-degree increment around anchor
- `pointInBox(p, x1, y1, x2, y2, tolerance)` — True if p is inside the box (expanded by tolerance)

### `types.ts` — Type Definitions

**Key types:**
- `DataPoint` — `{ time: number, price: number }` (chart data space)
- `EntryState` — `"normal" | "hovered" | "selected" | "preview"`
- `ResolvedEntry` — Drawing with pixel coordinates + state + type-specific fields (seg, fibLevels, yStop, yTarget, x3, y3, stats)
- `HitRegion` — `{ kind: "point", timeKey, priceKey } | { kind: "body" }`
- `Hit` — `{ id: string, region: HitRegion }`
- `DrawingCallbacks` — `onAdd`, `onUpdate`, `onRemove`, `onToolFinished`, `onSelectionChange`, `onRequestSettings`, `onContextMenu`, `onSelectTool`, `onUndo`, `onRedo`

### `line-alerts.ts` — Price Alerts

**Functions:**
- `linePriceAt(d, timeSec)` — Returns the price of an alert-enabled line at a given time (horizontal = constant, trendline = interpolated)
- `detectCrossings(drawings, prevMid, mid, nowSec, firedAt)` — Returns drawings whose line the mid price just crossed; 30-second cooldown per drawing
- `playAlertBeep()` — 880Hz WebAudio beep, 150ms duration

---

## System Map

### 1. Creation Flow

**Two placement modes** (TradingView-style dual mode):

**Mode A: Click-click**
1. User arms a tool via the rail or Alt+shortcut. `manager.setTool(tool)` is called.
2. `handleMouseDown` fires. Tool is armed, so `placementStart(pos, e)` is called.
3. First click: `pointFor(pos)` resolves the data point. For single-point tools (horizontal, vertical, text), `commitDrawing` fires immediately. For two-point tools, `placing = { p1, startX, startY }` is set and a preview is shown.
4. Mouse moves: `placingMove(pos)` updates the preview via `primitive.setPreview()`.
5. Second click: `placementStart` sees `this.placing` is set, calls `commitPlacement(p1, pt)`.
6. `commitDrawing(d)` finalizes: adds to `drawings`, calls `primitive.setDrawings()`, fires `onAdd` callback, selects the drawing, disarms the tool (unless `stayInMode`).

**Mode B: Press-drag-release**
1. Same arm step.
2. `handleMouseDown` → `placementStart` sets `placing` with p1.
3. User drags: `handleMouseMove` → `placingMove` updates preview.
4. `handleMouseUp` → `maybeCommitPlacement(pos)` checks if the pointer moved > `DRAG_COMMIT_THRESHOLD_PX` (10px) from start. If yes, commits via `commitPlacement`.

**State transitions:**
- `tool = "none"` → `tool = "trendline"` (user arms) → `placing = { p1 }` (first click) → `placing = null` + drawing added (second click or drag release) → `tool = "none"` (unless stay-in-mode)

### 2. Rendering Flow

1. `DrawingsPrimitive.resolveEntries()` is called by `DrawingsPaneView.update()`.
2. For each drawing, `resolveEntry(d, ctx, state)` converts time/price anchors to pixel x/y using `timeToX` and `series.priceToCoordinate`.
3. `DrawingsPaneRenderer.draw(target)` is called by lightweight-charts during the canvas pass.
4. `target.useBitmapCoordinateSpace(scope => ...)` maps media coordinates to bitmap coordinates (pixel ratio scaling).
5. For each resolved entry, `renderEntry(scope, e, info)` dispatches to the type-specific renderer.
6. Each renderer draws using the canvas 2D context (`scope.context`):
   - `strokeLine` for line segments (with optional dash pattern)
   - `ctx.fillRect` / `ctx.strokeRect` for rectangles
   - `ctx.ellipse` for ellipses
   - `ctx.fillText` for text
   - `drawHandle` for anchor handles (white circle, colored stroke)
7. **Hover/selected states** affect rendering via `showHandles(e)`: returns true when `state === "hovered" || state === "selected"`. Handles are only drawn when this is true. Text drawings get a dashed border. Trendlines get a midpoint handle and stats box.

### 3. Hit Testing Flow

1. `handleMouseMove` (no tool armed, no drag) calls `hoverHit(hitTest(this.resolveAll(), pos))`.
2. `hitTest(entries, pos, scale)` iterates entries **top-to-bottom** (last drawn = topmost, matching visual stacking).
3. For each entry, `hitEntry(e, pos, tol)` switches on `e.d.type`:
   - **Trendline/Arrow:** `anchorHit` (8px circles at p1/p2) → `distToSegment` (6px from line segment)
   - **Horizontal:** `Math.abs(p.y - e.y1) <= tol.line` (6px vertical band). Always returns a point hit (priceKey: "price").
   - **Rectangle:** `rectCornerHit` (4 corners at 8px) → `pointInBox` (inside rect + 6px tolerance)
   - **Position:** Handle at entry/target/stop (mid-x), width handle (right edge), body = inside box
   - **HChannel:** Handle at (x1, y1) and (x1, y2), on either line (6px), or between them (body)
   - **Text:** Inside estimated bounding box (char count * fontSize * 0.6 width, lines * fontSize * 1.3 height)
4. Returns `Hit` with `region.kind`:
   - `"point"` — cursor is on an anchor handle. `timeKey`/`priceKey` tell the manager which data field to update on drag.
   - `"body"` — cursor is on the drawing body. Dragging moves the whole drawing.
5. `hoverHit` sets cursor: `"nwse-resize"` for point hits, `"pointer"` for body hits, default for no hit.

### 4. Dragging Flow

**mouseDown on a drawing (no tool armed):**
1. `selectionStart(pos, e, false)` calls `hitTest(entries, pos)`.
2. If hit: selects the drawing (if not already selected), calls `beginDrag(hit, pos, entries, false)`.
3. `beginDrag` stores `DragState = { hit, startX, startY, origin (copy), originEntry, group (other selected drawings), moved: false }`.
4. Cursor set to `"grabbing"`.

**mouseMove during drag:**
5. `dragMove(pos, shiftKey)` calls `computeDragUpdates(drag, pos, shiftKey)`.
6. If `hit.region.kind === "point"`: calls `dragPoint(drag, pos, shiftKey)`.
   - `pointFor(pos, shiftKey, dragAnchorPx(drag))` resolves the cursor to a data point (with snapping/angle-snap).
   - Updates `drag.origin[timeKey]` and/or `drag.origin[priceKey]` with the new time/price.
   - Position tool special cases: dragging entry handle moves stop+target together; width handle can't flip the box.
7. If `hit.region.kind === "body"`: calls `shiftDrawing(origin, entry, dx, dy)` for the primary + all group members.
   - `dx = pos.x - drag.startX`, `dy = pos.y - drag.startY`
   - `shiftDrawing` branches by type:
     - **Horizontal:** Only moves price (via `series.coordinateToPrice(entry.y1 + dy)`)
     - **Vertical:** Only moves time (via `shiftPoint(entry.x1, entry.y1, dx, 0)`)
     - **Text:** Moves single anchor (x1, y1) by (dx, dy)
     - **Channel/HChannel:** Moves all 3 anchors together
     - **Position:** Shifts box in time, all price rows (entry/stop/target) by the same delta
     - **Generic (trendline, rectangle, etc.):** Moves both anchors by (dx, dy)
8. Updates `this.drawings` and calls `primitive.setDrawings()` for live redraw.

**mouseUp:**
9. `endDrag()` fires `onUpdate` callbacks for all moved drawings (only if `drag.moved` is true).

**Why the text tool cursor jumps to the left edge:**
This is Bug #1, detailed below.

### 5. Resizing (Resize Handles)

**How they work in theory:**
- `rectCornerHit` in `hit-test.ts` checks 4 corners of rectangles/ellipses/triangles. Each corner maps to specific `timeKey`/`priceKey` pairs (e.g. top-left = `time` + `price`, bottom-right = `time2` + `price2`, top-right = `time2` + `price`, bottom-left = `time` + `price2`).
- When a corner is hit, the `Hit.region` is `{ kind: "point", timeKey, priceKey }`.
- During drag, `dragPoint` updates only the specified `timeKey`/`priceKey` fields, effectively resizing the rectangle.

**Are they rendered visually?** Yes. `drawRectHandles` draws 4 handles at the rectangle corners when `showHandles(e)` is true (hovered or selected).

**Does it actually work?** Yes for rectangles, ellipses, and triangles. The corner hit test maps correctly to the data fields. The drag updates only the dragged corner's time/price, which resizes the shape.

**However**, there are issues with cursor feedback. See Bug #2 below.

### 6. State Management

**Three states:** `"normal"`, `"hovered"`, `"selected"`, plus `"preview"` for in-flight placement.

**How state transitions work:**
- **Hover:** `handleMouseMove` (no tool, no drag) → `hoverHit(hit)` → if hit id differs from `hoveredId`, calls `primitive.setHovered(id)`. The primitive stores `_hoveredId` and calls `requestUpdate()` to trigger a redraw.
- **Selection:** `select(ids)` → `primitive.setSelected(ids)` → stores `_selectedIds` as a Set, rebuilds axis views (selected drawings show price labels), calls `requestUpdate()`.
- **Normal:** When hover/selection is cleared, the primitive reverts the drawing to "normal" state on next resolve.

**How the primitive triggers redraws:**
- `DrawingsPrimitive` extends `PluginBase`, which has `requestUpdate()` from the lightweight-charts `attached()` lifecycle.
- `requestUpdate()` is a callback provided by lightweight-charts that schedules a pane repaint.
- The primitive calls `requestUpdate()` whenever drawings, preview, selection, hover, or account equity change.
- On repaint, `DrawingsPaneView.update()` calls `resolveEntries()` which re-resolves all drawings with current chart state (scroll, zoom, timeframe), then `DrawingsPaneRenderer.draw()` renders them all.

---

## Bug Analysis

### Bug 1: Text tool cursor jumps to left edge when dragging from inside the box

**Root cause:** In `manager.ts`, `shiftDrawing()` for text type (line ~390) moves the single anchor `(x1, y1)` by the pixel delta `(dx, dy)`. The anchor is the top-left corner of the text box. The `shiftPoint(entry.x1, entry.y1, dx, dy)` call converts the new pixel position back to a data point via `toPoint({ x: x + dx, y: y + dy })`.

The problem is in `hitText()` in `hit-test.ts` (line ~138). The hit test returns `bodyHit(e)` for any click inside the text bounding box. When the body drag starts, `beginDrag()` stores `drag.startX` and `drag.startY` as the mouse position. Then `shiftDrawing` computes `dx = pos.x - drag.startX` and `dy = pos.y - drag.startY`.

But the text anchor `(x1, y1)` is the top-left of the text, not where the user clicked. So the text moves correctly by the delta, BUT the issue is that `shiftPoint` uses `entry.x1` (the anchor's current pixel x) plus `dx`. If the user clicks in the middle of the text box, the anchor is at the left edge, and the delta is computed from the click point. The text moves by the correct delta, but it **appears** to jump because the anchor (top-left) is far from the cursor.

Actually, looking more carefully: the text DOES move by the correct delta. The "jump" happens because the user expects the text to follow the cursor position (grab point stays under cursor), but instead the text moves by the delta from `startX/startY`. Since `startX/startY` is the initial click position and the anchor is at the left edge, the text's left edge moves by `dx` from the click point, not from the anchor. This means the text shifts left by the distance between the click point and the anchor.

**Wait, re-examining:** `shiftDrawing` for text does:
```
const p = this.shiftPoint(entry.x1, entry.y1, dx, dy);
return p ? { ...origin, time: p.time, price: p.price } : null;
```
Where `dx = pos.x - drag.startX` and `dy = pos.y - drag.startY`.

`shiftPoint(x, y, dx, dy)` returns `toPoint({ x: x + dx, y: y + dy })`.

So the new position is `entry.x1 + (pos.x - drag.startX)`. If the user clicks at the center of the text box (say, 50px right of x1), then `drag.startX = pos.x` (the click point), and on the first move, `dx = newPos.x - drag.startX` which is the mouse movement delta. The text anchor moves by the same delta. This should work correctly.

**The actual bug:** Looking at `hitText()` more carefully:
```typescript
function hitText(e: ResolvedEntry, p: Pt, tol: Tol): Hit | null {
  if (e.x1 === null || e.y1 === null) return null;
  const size = e.d.fontSize ?? 14;
  const lines = (e.d.text ?? "Text").split("\n");
  const longest = lines.reduce((m, l) => Math.max(m, l.length), 4);
  const w = longest * size * 0.6;
  const h = lines.length * size * 1.3;
  const inside =
    p.x >= e.x1 - tol.line &&
    p.x <= e.x1 + w + tol.line &&
    p.y >= e.y1 - tol.line &&
    p.y <= e.y1 + h + tol.line;
  return inside ? bodyHit(e) : null;
}
```

The hit test returns `bodyHit(e)` which is `{ id: e.d.id, region: { kind: "body" } }`. This is correct for dragging.

**The real root cause:** The text tool is a **single-click placement** tool. In `placementStart()`:
```typescript
if (this.tool === "horizontal" || this.tool === "vertical" || this.tool === "text") {
  this.commitDrawing(this.makeNew(this.tool, pt, pt));
  return;
}
```
It commits immediately on first click with `p1 === p2`. So the text is placed at the click position. That's fine.

The "cursor jumps to left edge" bug is about **dragging an existing text box**. When you click inside the text box body and drag, the body drag works via `shiftDrawing` which moves `(x1, y1)` by `(dx, dy)`. This should be correct.

**But wait:** The text renderer in `renderText()` draws text at `(at.x, at.y)` which is `(e.x1, e.y1)` in bitmap space. The text is left-aligned at the anchor point. The hit test estimates the box width as `longest * size * 0.6`. If the user clicks at the right side of the text, `drag.startX` is at the right side, but the anchor `entry.x1` is at the left side. The delta `dx = pos.x - drag.startX` is the mouse movement. `shiftPoint(entry.x1, entry.y1, dx, dy)` moves the anchor by the same delta. So the text should follow the mouse correctly.

**Actually, I think the bug is different.** Let me re-read the bug description: "Text tool cursor jumps to left edge when dragging from inside the box." This might mean: when you click inside the text box to select it, the cursor (the text editing cursor? or the mouse cursor?) jumps to the left edge. 

**Most likely interpretation:** When the user clicks inside the text body to drag it, the text box instantly snaps so its left edge is at the cursor position. This would happen if `shiftDrawing` used the cursor position directly instead of computing a delta. But the code uses delta correctly.

**Re-examining `beginDrag`:** `drag.startX = pos.x` (the mouse position). `drag.origin = { ...origin }` (a copy of the drawing). On first `dragMove`, `dx = pos.x - drag.startX`. This is the mouse delta. `shiftDrawing(drag.origin, drag.originEntry, dx, dy)` uses `entry.x1 + dx`. Since `entry` is the resolved entry (pixel coords) and `drag.originEntry` is that resolved entry, `entry.x1` is the pixel x of the anchor. So the new pixel x is `entry.x1 + dx`. Converting back to time gives the new time. This should move the text by the correct delta.

**Conclusion:** After careful analysis, the text dragging code appears correct. If the bug is reproducible, it may be a rendering issue where the text box is re-rendered at the new position but the cursor visually appears to be at the left edge because the text box is narrow (default "Text" is only ~30px wide). The cursor is at the grab point, but the text box left edge is near the cursor, making it look like it jumped.

**However**, if the bug is that the text snaps to the cursor's x position (not delta-based), that would indicate `dx` is being computed as `pos.x - entry.x1` instead of `pos.x - drag.startX`. Looking at the code again: `computeDragUpdates` for body hits does `const dx = pos.x - drag.startX;` which is correct. The `shiftDrawing` receives `dx, dy` and applies them to `entry.x1, entry.y1`.

**Final assessment:** The text drag code looks correct. If the bug exists, it's likely a perceptual issue: the text box is small and the anchor is at the top-left, so when you grab it from the right side and start moving, the left edge follows at a fixed offset, making it feel like the text "jumped" to align its left edge with the cursor. The fix would be to store the grab offset (distance from cursor to anchor) and maintain it during the drag, so the cursor stays at the same relative position within the text box.

**Fix needed:** In `beginDrag()`, compute the offset between the cursor and the drawing anchor(s), and in `dragMove()`, use `pos - offset` instead of `anchor + delta`. OR: store `drag.startX/Y` as the anchor position (not cursor position), and compute `dx = pos.x - drag.startX` which would then be the cursor-to-anchor distance. But this would break other body drags.

**Better fix:** The current delta-based approach is correct for body drags. The "jump" is perceptual. To fix it, store the grab offset in `DragState` and subtract it from the target position. Specifically for text:

In `beginDrag()`, add `grabOffsetX` and `grabOffsetY`:
```typescript
this.drag = {
  ...,
  grabOffsetX: pos.x - (originEntry.x1 ?? 0),
  grabOffsetY: pos.y - (originEntry.y1 ?? 0),
};
```

In `computeDragUpdates()` for body hits, adjust:
```typescript
const dx = pos.x - drag.startX;
const dy = pos.y - drag.startY;
```
This is already delta-based and correct. The text should move by exactly the mouse delta. If it's jumping, the bug is elsewhere.

**Alternative root cause:** The `setDrawings` method in `DrawingsPrimitive` may be receiving stale data. During a drag, `manager.setDrawings()` is called by the parent component (via the `useEffect` that syncs `visibleDrawings`). But `setDrawings` has a guard: `if (this.drag) return;` — it skips updates mid-drag. So the local copy is authoritative during the drag. This is correct.

**Wait — there's a subtlety.** After `dragMove` updates `this.drawings` and calls `this.primitive.setDrawings()`, the parent component's state hasn't updated yet (the `onUpdate` callback only fires on `endDrag`). So the primitive has the latest drawing, but the parent's `drawings` prop is stale. If the parent re-renders for any reason during the drag, the `useEffect` that syncs `visibleDrawings` would try to call `drawingManagerRef.current?.setDrawings(visibleDrawings)` with stale data. But `setDrawings` has the `if (this.drag) return;` guard, so it's skipped. Good.

**Final answer for Bug 1:** The text drag code is actually correct in its delta computation. The "jump to left edge" is a perceptual issue caused by the text box being anchored at its top-left corner. When you grab the text from the right side of a small text box and start dragging, the entire box moves by the correct delta, but visually the left edge of the text appears to jump to near the cursor because the box is narrow. 

**Fix:** Store the grab offset (cursor position relative to the anchor) in `DragState` and use it to position the text so the cursor stays at the same relative position within the box. This is a UX polish, not a logic bug.

In `beginDrag()`, add:
```typescript
grabOffsetX: pos.x - (originEntry.x1 ?? pos.x),
grabOffsetY: pos.y - (originEntry.y1 ?? pos.y),
```

In `shiftDrawing()` for text, instead of using `dx/dy`:
```typescript
const newX = pos.x - drag.grabOffsetX;
const newY = pos.y - drag.grabOffsetY;
const p = this.toPoint({ x: newX, y: newY });
return p ? { ...origin, time: p.time, price: p.price } : null;
```

This requires passing `pos` and `grabOffset` into `shiftDrawing` or handling text specially in `computeDragUpdates`.

---

### Bug 2: Resize handles don't work (cursor doesn't change, dragging does nothing)

**Root cause:** The cursor for point hits is set in `hoverHit()`:
```typescript
if (hit?.region.kind === "point") {
  this.applyCursor("resize" as any);
}
```

This sets `nwse-resize` for ALL point hits. But the issue is that `hoverHit` is only called when there's no tool armed and no drag in progress. If a tool is armed, `handleMouseMove` goes to `placingMove` instead. So the cursor should work when no tool is armed.

**But the actual bug is about corner handles for rectangles/ellipses/triangles.** Looking at `rectCornerHit()`, it returns `{ kind: "point", timeKey, priceKey }` for corner hits. The `hoverHit` function should set the resize cursor. And `beginDrag` → `dragPoint` should update the corner's time/price.

**The issue:** `dragPoint()` in `manager.ts` calls `pointFor(pos, shiftKey, this.dragAnchorPx(drag))`. `dragAnchorPx` returns the opposite anchor's pixel position for trendlines only:
```typescript
private dragAnchorPx(drag: DragState): Pt | null {
  if (drag.origin.type !== "trendline" || drag.hit.region.kind !== "point") return null;
  ...
}
```

For rectangle corners, `dragAnchorPx` returns `null`, which means no angle snapping. That's fine. `pointFor` with `null` anchor just converts the position to a data point. The `dragPoint` method then sets `updated[timeKey] = pt.time` and `updated[priceKey] = pt.price`. For a rectangle corner like `{ timeKey: "time", priceKey: "price2" }`, this updates the top-left corner's time and the bottom-right's price, effectively resizing. This should work.

**Testing the actual behavior:** The hit test for rectangles calls `rectCornerHit` first, then falls back to `pointInBox` for body. If the corner hit works, the cursor should change to `nwse-resize` and dragging should resize.

**Possible issue:** The `HANDLE_TOLERANCE` is 8px, which is quite small. The handles are drawn with `HANDLE_RADIUS = 5` (so 10px diameter visual). The hit area (8px radius) is smaller than the visual handle (5px radius circle = 10px diameter = 5px radius). Wait, 8px tolerance > 5px radius, so the hit area is actually larger than the visual handle. That should be fine.

**Actually found it:** Looking at `applyCursor`:
```typescript
private applyCursor(interactionCursor: "pointer" | "grabbing" | "resize" | null): void {
  if (interactionCursor === "resize") {
    this.container.style.cursor = "nwse-resize";
    return;
  }
  if (interactionCursor) {
    this.container.style.cursor = interactionCursor;
    return;
  }
  this.container.style.cursor = this.tool !== "none" ? "crosshair" : "";
}
```

And `hoverHit`:
```typescript
if (hit?.region.kind === "point") {
  this.applyCursor("resize" as any);
} else if (hit) {
  this.applyCursor("pointer");
} else {
  this.applyCursor(null);
}
```

This passes `"resize" as any` to `applyCursor` which checks for `"resize"` and sets `nwse-resize`. This should work. But the cursor is always `nwse-resize` regardless of which corner is being dragged. For top-right and bottom-left corners, `nesw-resize` would be more appropriate, but `nwse-resize` is still a resize cursor, so it should visually work.

**The real issue might be that the hit test for corners is failing.** Let me trace through `rectCornerHit`:
```typescript
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
```

This uses `e.x1!` and `e.x2!` with non-null assertions. If `e.x1` or `e.x2` is null (e.g. the drawing has no time anchor), this would produce `NaN` coordinates and the distance check would fail. But for a properly placed rectangle, `x1` and `x2` should be non-null.

**I think the resize handles actually DO work.** The bug report might be about a specific drawing type or a specific scenario. Let me check if there's a case where corner hits don't work:

For **ellipse** and **triangle**, `hitBoxShape` is used:
```typescript
function hitBoxShape(e: ResolvedEntry, p: Pt, tol: Tol): Hit | null {
  if (e.x1 === null || e.y1 === null || e.x2 === null || e.y2 === null) return null;
  const corner = rectCornerHit(e, p, tol);
  if (corner) return corner;
  return pointInBox(p, e.x1, e.y1, e.x2, e.y2, tol.line) ? bodyHit(e) : null;
}
```

This delegates to `rectCornerHit` which should work.

**Conclusion for Bug 2:** The resize handle code appears correct. If the bug is reproducible, it may be caused by:
1. The chart's own event handlers intercepting the mousedown before the drawing manager's capture-phase listener. But the manager uses `addEventListener("mousedown", this.handleMouseDown, true)` (capture phase), so it should fire first.
2. A race condition where `setDrawings` from the parent overwrites the local state during a drag. But `setDrawings` has the `if (this.drag) return;` guard.
3. The handles being too small to grab reliably (8px tolerance in a high-DPI canvas).

**Most likely actual cause:** The `applyCursor` method is called with `"resize" as any` but the parameter type is `"pointer" | "grabbing" | "resize" | null`. The `as any` cast suggests there was a type mismatch. Looking at the function signature: `applyCursor(interactionCursor: "pointer" | "grabbing" | "resize" | null)`. The `"resize"` is actually in the union type, so the `as any` is unnecessary but not harmful.

**Actually, I found the real issue.** In `hoverHit`, the cursor is set to `"resize"` for ALL point hits. But `hoverHit` is only called from `handleMouseMove` when `!this.drag && !this.placing && this.tool === "none"`. If the user has a tool armed, hover doesn't fire. But for resize to work, the user should have no tool armed (tool = "none"), which is the default after committing a drawing.

**Wait, let me re-read the bug:** "Resize handles don't work (cursor doesn't change, dragging does nothing)." If the cursor doesn't change, it means `hoverHit` isn't detecting the point hit. This could be because:
1. The resolved entry's coordinates are stale (but `resolveAll()` is called fresh each time)
2. The tolerance is too small (8px is reasonable)
3. The handles are at the wrong position

Looking at `renderRectangle`: handles are drawn at `(a.x, a.y)`, `(b.x, b.y)`, `(a.x, b.y)`, `(b.x, a.y)` where `a = toBitmap(scope, e.x1, e.y1)` and `b = toBitmap(scope, e.x2, e.y2)`. These are in bitmap space. The hit test uses `e.x1, e.y1` etc. in media space. The `toBitmap` function multiplies by pixel ratio. So the visual handle is at `e.x1 * hpr` in bitmap space, but the hit test checks `dist(p, { x: e.x1, y: e.y1 })` in media space. Since `p` comes from `eventPos(e)` which uses `posFromClient` returning media-space coordinates, and `e.x1` is also media space, the hit test should work.

**I'm now fairly confident the resize handles DO work for rectangles.** The bug may be specific to a certain scenario or may have been fixed. If the bug persists, the fix would be to increase `HANDLE_TOLERANCE` from 8 to 10-12px, and to add cursor variation per corner direction.

---

### Bug 3: Rectangle button has a circle icon instead of a square

**Root cause:** In `DrawingToolRail.tsx`, the shapes group:
```typescript
{
  id: "shapes",
  icon: Circle,
  label: "Shapes",
  tools: [
    { tool: "rectangle", icon: Square, label: "Rectangle" },
    ...
  ],
},
```

The rectangle tool uses `Square` icon from lucide-react. But the **group icon** is `Circle`. When no tool in the group is active, the group button shows the group's icon (`Circle`). When a tool is active, it shows the active tool's icon.

**The bug:** When the user looks at the shapes group button (before opening the flyout), they see a `Circle` icon, not a `Square`. This is the group icon, not the rectangle icon. The rectangle tool inside the flyout correctly uses `Square`.

**But the user reports "Rectangle button has a circle icon."** This likely means the group button shows `Circle` when no shape tool is active, and the user expects to see a square/rectangle icon for the shapes group.

**Fix:** Change the group icon from `Circle` to `Square` (or better, use a shape that represents "shapes" generically, like `Shapes` from lucide-react if available, or `Square` as the default shape):

In `DrawingToolRail.tsx`, line ~32:
```typescript
// Before:
{
  id: "shapes",
  icon: Circle,  // ← this is the group icon shown when no shape is active
  label: "Shapes",
  tools: [...]
},
// After:
{
  id: "shapes",
  icon: Square,  // or use a more generic shapes icon
  label: "Shapes",
  tools: [...]
},
```

**Location:** `DrawingToolRail.tsx`, line ~32, the `GROUPS` array, `id: "shapes"` group, `icon: Circle`.

---

### Bug 4: Object tree button only opens, doesn't toggle

**Root cause:** In `DrawingToolRail.tsx`, the object tree button:
```typescript
{onOpenObjectTree && drawings.length > 0 && (
  <RailButton
    icon={ListTree}
    title="Object tree (drawings)"
    onClick={onOpenObjectTree}
  />
)}
```

The `onClick` calls `onOpenObjectTree` directly. In `ChartPanel.tsx`, the prop is:
```typescript
onOpenObjectTree={() => setShowObjectTree((v) => !v)}
```

This IS a toggle (uses `(v) => !v`). So the rail button should toggle.

**But there's also the context menu path.** In `ChartPanel.tsx`, the chart context menu has:
```typescript
onOpenObjectTree={() => setShowObjectTree((v) => !v)}
```

And the `ObjectTreeOverlay` component:
```typescript
onToggle={() => setShowObjectTree((v) => !v)}
```

And the `ObjectTreePanel` has a close button (X) that calls `onClose`, which is `onToggle`, which is `setShowObjectTree((v) => !v)`.

**So the toggle should work.** Let me check if there's a case where it doesn't:

The `ObjectTreeOverlay` component:
```typescript
function ObjectTreeOverlay({ ..., open, onToggle, ... }) {
  if (drawings.length === 0) return null;
  if (!open) return null;
  return <ObjectTreePanel ... onClose={onToggle} />;
}
```

When `open` is false, it returns null (panel not shown). When the rail button is clicked, `setShowObjectTree((v) => !v)` toggles to true. The panel renders. When the X button is clicked, `onToggle` → `setShowObjectTree((v) => !v)` toggles to false. The panel disappears.

**But what about the rail button when the panel is open?** The rail button calls `onOpenObjectTree` which is `setShowObjectTree((v) => !v)`. So clicking the rail button when the panel is open should close it. This should work.

**Wait — the rail button's `onClick` is `onOpenObjectTree`, not `onToggle`.** But `onOpenObjectTree` in `ChartPanel.tsx` is `() => setShowObjectTree((v) => !v)`, which is a toggle. So it should work.

**Unless the issue is that the flyout closes before the click registers.** The rail has a `useEffect` that closes `openGroup` on outside click:
```typescript
useEffect(() => {
  if (!openGroup) return;
  const handler = (e: MouseEvent) => {
    if (ref.current && !ref.current.contains(e.target as Node)) setOpenGroup(null);
  };
  document.addEventListener("mousedown", handler);
  return () => document.removeEventListener("mousedown", handler);
}, [openGroup]);
```

This only closes the flyout group, not the object tree. The object tree is managed by `ChartPanel`'s state, not the rail's local state.

**Actually found the issue.** The `ObjectTreePanel` has its own close button (X) that calls `onClose`. But the rail button should toggle. Let me trace:

1. Rail button click → `onOpenObjectTree()` → `setShowObjectTree((v) => !v)` → `showObjectTree = true` → panel opens.
2. Rail button click again → `onOpenObjectTree()` → `setShowObjectTree((v) => !v)` → `showObjectTree = false` → panel closes.

This should work. **Unless the rail button is not visible when the panel is open.** The rail button is conditionally rendered:
```typescript
{onOpenObjectTree && drawings.length > 0 && (
  <RailButton ... />
)}
```

`drawings.length > 0` is still true when the panel is open. So the button should still be visible and clickable.

**Possible issue:** The object tree panel overlays the chart on the right side. The rail is on the left side. They don't overlap. So clicking the rail button should work.

**Conclusion for Bug 4:** The toggle logic appears correct in the code. If the bug exists, it may be a stale closure issue or a state batching issue. The fix would be to ensure the toggle function is stable:

In `ChartPanel.tsx`, instead of inline arrow functions, use `useCallback`:
```typescript
const toggleObjectTree = useCallback(() => setShowObjectTree(v => !v), []);
```
And pass `toggleObjectTree` to both the rail and the context menu.

**But actually, re-reading the code more carefully:** The `DrawingToolRail` receives `onOpenObjectTree` as a prop and the rail button calls it directly. The prop is an inline arrow function `() => setShowObjectTree((v) => !v)`. This creates a new function on every render, but the toggle logic is correct. The issue might be that the rail component re-renders and the `onClick` handler changes, but functionally it should still toggle.

**I think this bug might not be reproducible from the code alone.** It could be a timing issue or a specific interaction pattern. The fix is straightforward: ensure the toggle function is memoized.

---

### Bug 5: Arrow tool triangle doesn't extend past the line

**Root cause:** In `renderArrow()` in `renderers.ts`:

```typescript
function renderArrow(scope: BitmapCoordinatesRenderingScope, e: ResolvedEntry): void {
  if (e.x1 === null || e.y1 === null || e.x2 === null || e.y2 === null) return;
  const a = toBitmap(scope, e.x1, e.y1);
  const b = toBitmap(scope, e.x2, e.y2);
  // Shorten the line so it ends where the arrowhead base begins,
  // making the arrowhead extend past the original line endpoint.
  const arrowLen = 12 * scope.horizontalPixelRatio;
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  const bShortened: BPt = {
    x: b.x - arrowLen * Math.cos(ang),
    y: b.y - arrowLen * Math.sin(ang),
  };
  strokeLine(scope, a, bShortened, e.d.color, e.d.width ?? LINE_WIDTH, dashFor(e.d.lineStyle));
  // Draw arrowhead with tip at the original endpoint (b), extending beyond the line
  drawArrowhead(scope, a, b, e.d.color);
  if (showHandles(e)) {
    drawHandle(scope, a, e.d.color);
    drawHandle(scope, b, e.d.color);
  }
}
```

The line is shortened by `arrowLen` (12px * pixel ratio) and the arrowhead is drawn from `a` to `b` (the original endpoint). The `drawArrowhead` function:

```typescript
function drawArrowhead(scope, from, to, color): void {
  const ang = Math.atan2(to.y - from.y, to.x - from.x);
  const len = 12 * scope.horizontalPixelRatio;
  const spread = Math.PI / 7;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);  // tip at original endpoint
  ctx.lineTo(to.x - len * Math.cos(ang - spread), to.y - len * Math.sin(ang - spread));
  ctx.lineTo(to.x - len * Math.cos(ang + spread), to.y - len * Math.sin(ang + spread));
  ctx.closePath();
  ctx.fill();
}
```

The arrowhead tip is at `to` (which is `b`, the original endpoint). The arrowhead extends **backward** from the tip toward the line. So the arrowhead's tip IS at the original endpoint, and the base is 12px back from there.

**The bug:** The arrowhead does extend past the shortened line (which ends 12px before `b`), and the tip is at `b`. But the user reports the triangle "doesn't extend past the line." This suggests the arrowhead is being drawn AT the line endpoint, not PAST it.

Looking at the code: the line is shortened to `bShortened` (12px before `b`), and the arrowhead tip is at `b`. So the arrowhead starts at `b` and extends backward. The visual effect is: line ends 12px before the endpoint, arrowhead fills that 12px gap with its tip at the endpoint. The arrowhead does NOT extend PAST the endpoint; it fills the gap.

**What the user wants:** The arrowhead should extend PAST the original line endpoint, so the line goes all the way to `b`, and the arrowhead tip is beyond `b`.

**Fix:** Don't shorten the line. Draw the full line to `b`, then draw the arrowhead starting at `b` with the tip extending beyond:

In `renderArrow()`:
```typescript
// Draw the full line to the original endpoint
strokeLine(scope, a, b, e.d.color, e.d.width ?? LINE_WIDTH, dashFor(e.d.lineStyle));
// Draw arrowhead starting at b, extending past it
drawArrowhead(scope, a, b, e.d.color);
```

And in `drawArrowhead()`, the tip should be at `to + len * direction`:
```typescript
function drawArrowhead(scope, from, to, color): void {
  const ang = Math.atan2(to.y - from.y, to.x - from.x);
  const len = 12 * scope.horizontalPixelRatio;
  const spread = Math.PI / 7;
  const tipX = to.x + len * Math.cos(ang);  // extend past the endpoint
  const tipY = to.y + len * Math.sin(ang);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);  // tip beyond the endpoint
  ctx.lineTo(to.x, to.y);  // base at the endpoint
  ctx.lineTo(to.x + len * Math.cos(ang - spread), to.y + len * Math.sin(ang - spread));
  // Wait, this isn't right either. Let me think...
}
```

**Correct fix:** The arrowhead should have its base at the line endpoint `b` and its tip beyond. The current code has the tip at `b` and the base 12px back. To extend past the line:

```typescript
function drawArrowhead(scope, from, to, color): void {
  const ang = Math.atan2(to.y - from.y, to.x - from.x);
  const len = 12 * scope.horizontalPixelRatio;
  const spread = Math.PI / 7;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(to.x + len * Math.cos(ang), to.y + len * Math.sin(ang));  // tip past endpoint
  ctx.lineTo(to.x, to.y);  // base corner 1 at endpoint
  ctx.lineTo(to.x + len * Math.cos(ang - spread) - len * Math.cos(ang), 
             to.y + len * Math.sin(ang - spread) - len * Math.sin(ang));
  // Actually this is getting complicated. Simpler approach:
}
```

**Simplest fix:** Don't shorten the line at all. Draw the line to `b`, then draw the arrowhead with the tip at `b + len * direction`:

```typescript
function renderArrow(scope, e): void {
  // ... (same setup)
  // Draw full line (no shortening)
  strokeLine(scope, a, b, e.d.color, e.d.width ?? LINE_WIDTH, dashFor(e.d.lineStyle));
  // Draw arrowhead extending past b
  drawArrowhead(scope, a, b, e.d.color);
  // ... (handles)
}

function drawArrowhead(scope, from, to, color): void {
  const ang = Math.atan2(to.y - from.y, to.x - from.x);
  const len = 12 * scope.horizontalPixelRatio;
  const spread = Math.PI / 7;
  const tip = { x: to.x + len * Math.cos(ang), y: to.y + len * Math.sin(ang) };
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(tip.x, tip.y);
  ctx.lineTo(to.x + len * 0.5 * Math.cos(ang - spread), to.y + len * 0.5 * Math.sin(ang - spread));
  ctx.lineTo(to.x + len * 0.5 * Math.cos(ang + spread), to.y + len * 0.5 * Math.sin(ang + spread));
  ctx.closePath();
  ctx.fill();
}
```

**Location:** `renderers.ts`, `renderArrow()` function (line ~265) and `drawArrowhead()` function (line ~285).

---

### Bug 6: Horizontal channel can only be grabbed from a fixed spot

**Root cause:** In `hitHChannel()` in `hit-test.ts`:

```typescript
function hitHChannel(e: ResolvedEntry, p: Pt, tol: Tol): Hit | null {
  if (e.y1 === null || e.y2 === null) return null;
  // Handle at the first line's anchor point (for moving the whole channel)
  if (e.x1 !== null && dist(p, { x: e.x1, y: e.y1 }) <= tol.handle) {
    return { id: e.d.id, region: { kind: "point", timeKey: "time", priceKey: "price" } };
  }
  // Handle at the second line's anchor point (for resizing the channel height)
  if (e.x1 !== null && dist(p, { x: e.x1, y: e.y2 }) <= tol.handle) {
    return { id: e.d.id, region: { kind: "point", timeKey: "time2", priceKey: "price2" } };
  }
  // On either horizontal line
  const onTop = Math.abs(p.y - e.y1) <= tol.line;
  const onBottom = Math.abs(p.y - e.y2) <= tol.line;
  // Between the two lines (body grab)
  const yMin = Math.min(e.y1, e.y2);
  const yMax = Math.max(e.y1, e.y2);
  const between = p.y >= yMin && p.y <= yMax;
  return onTop || onBottom || between ? bodyHit(e) : null;
}
```

The handles are at `(e.x1, e.y1)` and `(e.x1, e.y2)`. `e.x1` is the x-coordinate of the first anchor, which is the time the user clicked to place the channel. This is a **single fixed x position** somewhere on the chart.

The body hit ("between the two lines") only works when `p.y >= yMin && p.y <= yMax`. But if the two horizontal lines are very close together (e.g. 2px apart on screen), the "between" region is too thin to grab. And the "on either line" check uses `tol.line` (6px), which gives a 6px band on each line.

**The bug:** The horizontal channel is two full-width horizontal lines. The body grab region ("between") only works between the two lines. If the lines are close together, there's almost no body to grab. The handles are at a single x position (the first anchor's time), so they're only grabbable at one spot on the chart.

**Fix:** The body hit should also include the area near (within tolerance of) each line, not just strictly between them. The "on either line" check already does this (6px band), but the body hit should be the primary grab method. The real fix is to make the body hit work across the full width of the chart, not just at the anchor x position.

Looking at the hit test again: `onTop || onBottom || between` returns `bodyHit(e)`. The `onTop` and `onBottom` checks use `Math.abs(p.y - e.y1) <= tol.line` which is a 6px band across the **full width** (no x constraint). The `between` check also has no x constraint. So the body hit should work anywhere on the horizontal lines or between them.

**But the handles are only at `(e.x1, e.y1)` and `(e.x1, e.y2)`.** If the user wants to resize the channel (move one line independently), they can only grab the handle at `e.x1`. Since `e.x1` is a single point on the chart, the user has to find that exact spot.

**The fix:** Make the handles accessible across the full width. Instead of point handles at `(e.x1, e.y1)`, the hit test should return a point hit (with `priceKey: "price"`) when the user clicks anywhere on the top line, and a point hit (with `priceKey: "price2"`) when they click on the bottom line. This is how `hitHorizontal` works for a single horizontal line.

**Fix in `hitHChannel`:**
```typescript
function hitHChannel(e: ResolvedEntry, p: Pt, tol: Tol): Hit | null {
  if (e.y1 === null || e.y2 === null) return null;
  // Top line: dragging moves price (top line)
  if (Math.abs(p.y - e.y1) <= tol.line) {
    return { id: e.d.id, region: { kind: "point", timeKey: null, priceKey: "price" } };
  }
  // Bottom line: dragging moves price2 (bottom line)
  if (Math.abs(p.y - e.y2) <= tol.line) {
    return { id: e.d.id, region: { kind: "point", timeKey: null, priceKey: "price2" } };
  }
  // Between the two lines: body grab moves the whole channel
  const yMin = Math.min(e.y1, e.y2);
  const yMax = Math.max(e.y1, e.y2);
  if (p.y >= yMin && p.y <= yMax) return bodyHit(e);
  return null;
}
```

**Location:** `hit-test.ts`, `hitHChannel()` function (line ~95).

**But wait:** This changes the behavior so that clicking on either line always returns a point hit (resize), never a body hit. The body hit only works between the lines. This matches TradingView behavior: click on a line to drag that line, click between lines to move the whole channel.

**Also need to update `shiftDrawing`** in `manager.ts` to handle hchannel point drags. Currently `shiftDrawing` for hchannel calls `shiftChannel` which moves all 3 anchors. For point hits on hchannel, `dragPoint` is used, which updates the specific `timeKey`/`priceKey`. Since the hit returns `priceKey: "price"` or `priceKey: "price2"` with `timeKey: null`, `dragPoint` will update only the price, leaving time unchanged. This should work correctly — dragging the top line changes `price`, dragging the bottom line changes `price2`.

---

### Bug 7: Pane separator between indicator panes doesn't work (can't drag to resize)

**Root cause:** In `ChartPanel.tsx`, the chart creation includes:
```typescript
layout: {
  ...
  panes: {
    enableResize: true,
    separatorColor: isDark ? "#2A2E39" : "#D1D4DC",
    separatorHoverColor: isDark
      ? "rgba(180, 200, 240, 0.15)"
      : "rgba(100, 120, 160, 0.15)",
  },
},
```

This enables pane resizing in lightweight-charts v5. The `enableResize: true` option should allow dragging the separator between panes.

**But the drawing tools manager intercepts mouse events.** In `manager.ts`:
```typescript
this.container.addEventListener("mousedown", this.handleMouseDown, true);
```

This is a **capture-phase** listener on the chart container. It fires before lightweight-charts' own event handlers. When the user clicks on the pane separator, `handleMouseDown` fires first:

```typescript
private handleMouseDown = (e: MouseEvent): void => {
  if (e.button !== 0) return;
  const pos = this.eventPos(e);
  if (!pos) return;
  this.clearMeasure();
  if (this.tool !== "none") {
    this.placementStart(pos, e);
    return;
  }
  this.selectionStart(pos, e, false);
};
```

If no tool is armed (`this.tool === "none"`), it calls `selectionStart(pos, e, false)`. This calls `hitTest(this.resolveAll(), pos)`. If no drawing is hit, `hitTest` returns `null`, and `selectionStart` calls `this.select([])` (deselect) and returns `null`. The event is NOT stopped or prevented in this case, so lightweight-charts should still receive it.

**But wait:** `selectionStart` only calls `e.preventDefault()` and `e.stopPropagation()` when a hit is found. When no hit is found and `!e.shiftKey`, it calls `this.select([])` and returns null. The event propagates normally. So lightweight-charts should still handle the pane separator drag.

**The actual issue:** The pane separator in lightweight-charts v5 is a thin HTML element overlaid on the chart. The drawing manager's `mousedown` listener is on the `container` element (the chart's parent div). The pane separator might be a child of the chart's own DOM, not the container. The capture-phase listener on the container would fire before the chart's own handlers, but since `selectionStart` returns without stopping propagation when no drawing is hit, the event should reach the chart.

**Possible cause:** The `handleMouseMove` handler on `window`:
```typescript
window.addEventListener("mousemove", this.handleMouseMove);
```

This fires on every mouse move. When dragging the pane separator:
```typescript
private handleMouseMove = (e: MouseEvent): void => {
  const pos = this.eventPos(e);
  if (this.drag) { ... return; }
  if (!pos) { this.hoverHit(null); return; }
  if (this.placing) { ... return; }
  if (this.tool === "none") this.hoverHit(hitTest(this.resolveAll(), pos));
};
```

This calls `hoverHit` which calls `applyCursor`. If the cursor is over a drawing, it sets `"pointer"` or `"nwse-resize"`. If not, it sets `""` (default). This might override the `ns-resize` or `row-resize` cursor that lightweight-charts sets for the pane separator.

**That's the bug.** The `applyCursor(null)` call in `hoverHit` sets `this.container.style.cursor = ""` when no drawing is hit. This clears any cursor set by lightweight-charts on the pane separator, preventing the resize cursor from showing.

**Fix:** In `hoverHit` or `applyCursor`, don't clear the cursor when the mouse is not over a drawing. Instead, only set the cursor when a drawing is hit, and leave it alone otherwise:

```typescript
private applyCursor(interactionCursor: "pointer" | "grabbing" | "resize" | null): void {
  if (interactionCursor === "resize") {
    this.container.style.cursor = "nwse-resize";
    return;
  }
  if (interactionCursor) {
    this.container.style.cursor = interactionCursor;
    return;
  }
  // Only set crosshair when a tool is armed; otherwise leave the cursor alone
  // so lightweight-charts can manage it (e.g. pane separator resize cursor).
  if (this.tool !== "none") {
    this.container.style.cursor = "crosshair";
  } else {
    this.container.style.cursor = "";
  }
}
```

**Actually, the current code already does this:** `this.container.style.cursor = this.tool !== "none" ? "crosshair" : "";`. When `tool === "none"`, it sets `""` which clears the cursor. This overrides the pane separator cursor.

**Better fix:** When no tool is armed and no drawing is hit, don't touch the cursor at all:
```typescript
private applyCursor(interactionCursor: "pointer" | "grabbing" | "resize" | null): void {
  if (interactionCursor === "resize") {
    this.container.style.cursor = "nwse-resize";
    return;
  }
  if (interactionCursor) {
    this.container.style.cursor = interactionCursor;
    return;
  }
  if (this.tool !== "none") {
    this.container.style.cursor = "crosshair";
  }
  // When tool is "none" and no interaction cursor, don't clear — let lightweight-charts manage it
}
```

**Location:** `manager.ts`, `applyCursor()` method (line ~680).

**But there's a second issue:** Even if the cursor is fixed, the `mousedown` capture-phase listener might interfere with the drag. When `selectionStart` finds no hit, it calls `this.select([])` but doesn't prevent default or stop propagation. So the mousedown should propagate to lightweight-charts. But the `handleMouseMove` on `window` fires on every move and calls `hoverHit` which resets the cursor. During a pane separator drag, this would continuously reset the cursor.

**Full fix:** 
1. In `applyCursor`, don't clear the cursor when no tool is armed (let lightweight-charts manage it).
2. In `hoverHit`, skip the cursor update when the mouse is not over a drawing AND no tool is armed:
```typescript
private hoverHit(hit: Hit | null): void {
  const id = hit?.id ?? null;
  if (id !== this.hoveredId) {
    this.hoveredId = id;
    this.primitive.setHovered(id);
  }
  if (hit?.region.kind === "point") {
    this.applyCursor("resize" as any);
  } else if (hit) {
    this.applyCursor("pointer");
  } else if (this.tool !== "none") {
    this.applyCursor(null);
  }
  // When no hit and no tool: don't touch cursor, let lightweight-charts handle it
}
```

---

### Bug 8: Price line shows both red and green lines instead of one direction-aware line

**Root cause:** In `ChartPanel.tsx`, the `applyBidAskLines` function creates THREE price lines:
1. `bidLine` — green, shown when `showBidLine` is true
2. `askLine` — red, shown when `showAskLine` is true
3. `midLine` — direction-aware (green when up, red when down), always shown

The candle series has `priceLineVisible: false` and `lastValueVisible: false`, so the default close-price line is hidden. The three custom lines are the only price lines.

**The bug:** The user sees both red and green lines. This happens because:
1. The `midLine` is always shown and is direction-aware (green/red).
2. The `bidLine` (green) and `askLine` (red) are shown when their respective prefs are enabled.

If `showBidLine` and `showAskLine` are both enabled (or enabled by default), the user sees:
- Green bid line
- Red ask line
- Green/red mid line

That's 3 lines, with green and red always visible (bid is green, ask is red).

**The fix:** The `midLine` is meant to be the single direction-aware line. The bid/ask lines should be disabled by default (or removed entirely if the mid line is the intended display). Check `useChartPreferences` for the default values of `showBidLine` and `showAskLine`.

Looking at the `applyBidAskLines` function:
```typescript
upsertPriceLine(ctx.bidLine, series, prefs.showBidLine, { ... });
upsertPriceLine(ctx.askLine, series, prefs.showAskLine, { ... });
// Mid line: single direction-aware line. Green when price moved up, red when down.
const mid = (tick.bid + tick.ask) / 2;
const goingUp = prevMidPrice == null || mid >= prevMidPrice;
const midColor = goingUp ? "#0ecb81" : "#f6465d";
upsertPriceLine(ctx.midLine, series, true, { ... });
```

The mid line is always shown (`true` as the `enabled` arg). The bid/ask lines are conditional on prefs.

**Fix:** Either:
1. Disable bid/ask lines by default in `useChartPreferences`.
2. Remove the bid/ask lines entirely and only show the mid line.
3. When the mid line is shown, hide the bid/ask lines (they're redundant).

**Simplest fix:** In `applyBidAskLines`, don't show bid/ask lines when the mid line is shown (which is always):
```typescript
// Only show individual bid/ask lines if the mid line is somehow disabled
// (it's currently always on). This prevents the 3-line stack.
const showMid = true; // mid line is always on
upsertPriceLine(ctx.bidLine, series, prefs.showBidLine && !showMid, { ... });
upsertPriceLine(ctx.askLine, series, prefs.showAskLine && !showMid, { ... });
```

**Or better:** Remove the bid/ask lines entirely since the mid line is the intended display. The bid/ask lines were probably added before the mid line was implemented.

**Location:** `ChartPanel.tsx`, `applyBidAskLines()` function (line ~430).

---

## Summary Table

| Bug | File(s) | Root Cause | Fix Difficulty |
|-----|---------|------------|----------------|
| 1. Text cursor jumps to left edge | `manager.ts` | Perceptual: anchor at top-left, narrow text box. Delta computation is correct. | Medium — add grab offset to DragState |
| 2. Resize handles don't work | `manager.ts`, `hit-test.ts` | Likely works; may be cursor feedback issue or tolerance too small | Low — increase tolerance, verify cursor |
| 3. Rectangle button has circle icon | `DrawingToolRail.tsx` | Group icon is `Circle`, not `Square` | Trivial — change `icon: Circle` to `icon: Square` |
| 4. Object tree only opens | `DrawingToolRail.tsx`, `ChartPanel.tsx` | Toggle logic appears correct; may be stale closure | Low — memoize toggle function |
| 5. Arrow triangle doesn't extend past line | `renderers.ts` | Line is shortened, arrowhead fills gap instead of extending past endpoint | Low — don't shorten line, draw arrowhead past endpoint |
| 6. HChannel only grabbable from fixed spot | `hit-test.ts` | Handles only at single x position; body grab between lines only | Low — make line hits return point hits across full width |
| 7. Pane separator doesn't work | `manager.ts` | `applyCursor(null)` clears cursor, overriding lightweight-charts' resize cursor | Low — don't clear cursor when no tool armed |
| 8. Price line shows red and green | `ChartPanel.tsx` | Bid (green) + Ask (red) + Mid (direction-aware) = 3 lines always visible | Low — disable bid/ask when mid is shown, or remove them |

---

## Architecture Notes

### Data Flow

```
User Input (mouse/touch/keyboard)
    ↓
DrawingToolsManager (manager.ts)
    ↓ hitTest()        → hit-test.ts
    ↓ resolveAll()     → resolve.ts → ResolvedEntry[]
    ↓ pointFor()       → resolve.ts (timeToX, xToTime) + geometry.ts (snapAngle)
    ↓ shiftDrawing()   → resolve.ts (coordinate conversion)
    ↓
DrawingsPrimitive (drawings-primitive.ts)
    ↓ setDrawings() / setPreview() / setSelected() / setHovered()
    ↓ requestUpdate()  → lightweight-charts schedules repaint
    ↓
DrawingsPaneView.update() → resolveEntries()
    ↓
DrawingsPaneRenderer.draw() → renderEntry() → renderers.ts
    ↓
Canvas (bitmap coordinate space)
```

### State Ownership

- **DrawingToolsManager** owns: `tool`, `drawings` (local copy), `placing`, `drag`, `selectedIds`, `hoveredId`, `magnetMode`, `stayInMode`, `clipboard`, `styleDefaults`
- **DrawingsPrimitive** owns: `_drawings`, `_preview`, `_selectedIds`, `_hoveredId`, `_intervalSec`, `_accountEquity`, `_axisViews`
- **ChartPanel** owns: `showObjectTree`, `showDrawingSettings`, `contextMenu`, `chartMenu`, `showChartSettings`, `selectedDrawingIds` (synced via callbacks)

The manager is the source of truth during interaction. The parent component (ChartPanel) is the source of truth for the drawings array between interactions. They sync via `setDrawings()` (parent → manager) and `onAdd/onUpdate/onRemove` callbacks (manager → parent).

### Coordinate Systems

1. **Data space:** unix-seconds time + price (stored in `DrawingLine`)
2. **Media space:** pixel coordinates relative to chart pane (used by hit-test, manager)
3. **Bitmap space:** media coordinates × pixel ratio (used by renderers)

Conversion: `timeToX` / `xToTime` (data ↔ media), `toBitmap` (media → bitmap).

### lightweight-charts Integration

The `DrawingsPrimitive` extends `PluginBase` (which implements `ISeriesPrimitive`). It's attached to the candle series via `series.attachPrimitive()`. The primitive provides:
- `paneViews()` — returns `ISeriesPrimitivePaneView[]` for canvas rendering
- `priceAxisViews()` — returns `ISeriesPrimitiveAxisView[]` for price axis labels

The primitive doesn't handle input — all input is handled by `DrawingToolsManager` which attaches DOM listeners to the chart container.

---

## Recommendations

1. **Bug 3** (rectangle icon) is a one-line fix, do it first.
2. **Bug 5** (arrow) and **Bug 6** (hchannel) are clear rendering/hit-test bugs with straightforward fixes.
3. **Bug 7** (pane separator) requires careful cursor management to not interfere with lightweight-charts.
4. **Bug 8** (price lines) requires a product decision: keep bid/ask lines as optional, or remove them.
5. **Bug 1** (text drag) needs a grab-offset mechanism for better UX, but the current delta-based drag is technically correct.
6. **Bug 2** (resize handles) needs verification — the code looks correct. May need testing with specific drawings.
7. **Bug 4** (object tree toggle) needs verification — the code looks correct. May be a React state issue.

---

*End of audit.*