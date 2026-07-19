# Drawing Tools System Research Report

Date: 2026-07-16
Scope: hit-testing, dragging, resizing, and text tool behaviour across manager.ts, hit-test.ts, renderers.ts, resolve.ts, types.ts, geometry.ts

---

## A. HIT TESTING

Hit testing is performed by `hitTest()` in `hit-test.ts`. It iterates drawings topmost-last (last drawn wins, matching visual stacking order). Each drawing type has a dedicated `hit*` function. Two tolerance constants govern everything:

- `HANDLE_TOLERANCE = 8px` (anchor points)
- `LINE_TOLERANCE = 6px` (line segments and body fills)

Touch input scales both by `TOUCH_HIT_SCALE = 2` (16px handle, 12px line).

### Per-shape hit test breakdown

| Shape | Hit Function | Anchor Points Tested | Body / Line Region | Tolerance |
|-------|-------------|---------------------|-------------------|----------|
| **trendline** (includes ray, extended) | `hitTrendline` | p1 (time,price), p2 (time2,price2) via `anchorHit` | Distance to the drawn segment (`e.seg`, which accounts for extendLeft/extendRight) | handle: 8px, line: 6px via `distToSegment` |
| **horizontal** | `hitHorizontal` | None (single price anchor) | Horizontal line at y1 across full width | 6px vertical band (`Math.abs(p.y - e.y1) > tol.line`) |
| **vertical** | `hitVertical` | None (single time anchor) | Vertical line at x1 full height | 6px horizontal band (`Math.abs(p.x - e.x1) > tol.line`) |
| **rectangle** | `hitRectangle` | All 4 corners via `rectCornerHit`: (x1,y1), (x2,y2), (x1,y2), (x2,y1) | `pointInBox` expanded by 6px tolerance | handle: 8px at corners, body: 6px expanded box |
| **fibonacci / fibextension** | `hitFibonacci` | p1, p2 via `anchorHit` | Any fib level line within 6px vertical band, within x1..x2 horizontal bounds | handle: 8px, line: 6px per level |
| **position** | `hitPosition` | Entry (xm, y1), Target (xm, yTarget), Stop (xm, yStop), Right edge (xb, y1) | Bounding box of entry/stop/target spans, expanded by 6px | handle: 8px, body: 6px box |
| **channel** | `hitChannel` | p1, p2 via `anchorHit`, plus p3 (time3,price3) | Both lines (main + offset) via `distToSegment` | handle: 8px, line: 6px |
| **hchannel** | `hitChannel` (shared) | p1, p2 via `anchorHit`, plus p3 | Both horizontal lines via distance check | handle: 8px, line: 6px |
| **text** | `hitText` | Single anchor at (x1, y1) | Estimated text bounding box: width = longestLine * fontSize * 0.6, height = lineCount * fontSize * 1.3, expanded by 6px | 6px tolerance box |
| **ellipse / triangle** | `hitBoxShape` | 2 corners via `rectCornerHit` | `pointInBox` expanded by 6px | handle: 8px, body: 6px |

### Can you grab a shape from inside its bounding box?

**It depends on the shape type:**

- **Rectangle, ellipse, triangle, position**: YES. These use `pointInBox` with tolerance, so clicking anywhere inside the filled area registers as a body hit. The body hit returns `{ kind: "body" }`, which triggers a full-move drag.
- **Trendline (including ray/extended)**: NO. Body hit is distance-to-segment only (6px). You must click on the line itself, not the area it spans. There is no bounding-box fill test for trendlines.
- **Horizontal/vertical**: NO body hit at all. These only test the line band (6px). A horizontal line hit returns `{ kind: "point", priceKey: "price" }`, meaning any grab is an anchor drag, not a body move.
- **Channel/hchannel**: YES if you click on either line (main or offset). Both lines are tested via `distToSegment`. The area between the two lines is NOT tested. So you must click on a line, not between lines.
- **Fibonacci**: YES if you click on any fib level line (6px band). The area between levels is not tested.
- **Text**: YES. The hit test approximates the text bounding box and any click inside it (with 6px tolerance) registers as a hit. However, the hit returns `{ kind: "point", timeKey: "time", priceKey: "price" }`, NOT `{ kind: "body" }`. This is a critical distinction explained in section D.

---

## B. DRAGGING

### How shiftDrawing works per shape

When a body drag is initiated (`hit.region.kind === "body"`), `computeDragUpdates` calculates a pixel delta `(dx, dy)` from the drag start position to the current cursor position, then calls `shiftDrawing()` for the primary drawing and all group members.

`shiftDrawing` handles each type differently:

| Shape | What moves | Mechanism |
|-------|-----------|-----------|
| **horizontal** | Price only | `coordinateToPrice(y1 + dy)` — only vertical movement, no time shift |
| **vertical** | Time only | `shiftPoint(x1, y1, dx, 0)` — only horizontal movement, no price shift |
| **position** | Entry price + stop + target + time range | `shiftPosition`: shifts time/time2 by dt, price/stopPrice/targetPrice by dPrice |
| **channel / hchannel** | All 3 anchors together | `shiftChannel`: p1, p2, p3 all shifted by (dx, dy) |
| **text** | Single anchor | `shiftPoint(x1, y1, dx, dy)` — moves both time and price |
| **trendline, rectangle, fibonacci, arrow, ellipse, triangle** | Both anchors | `shiftPoint` for p1 and p2, each shifted by (dx, dy) |

### Does the cursor stay where you grabbed it, or jump to an anchor?

**It jumps.** This is the core dragging problem.

The drag system works as follows:

1. `beginDrag` records `startX`, `startY` (the cursor position at drag start) and `origin` (a copy of the drawing at drag start).
2. `dragMove` computes `dx = pos.x - drag.startX`, `dy = pos.y - drag.startY`.
3. `shiftDrawing` applies that delta to the drawing's resolved pixel anchors (`entry.x1 + dx`, `entry.y1 + dy`), then converts back to data space via `toPoint`.

The delta is computed from `startX/startY` (where you first clicked), not from the drawing's anchor position. So if you click in the middle of a rectangle body, the cursor stays at its own position relative to the start point, and the rectangle shifts by the same delta. In that sense, the cursor DOES stay where you grabbed it relative to the shape, because the whole shape moves by the same delta.

**However**, for point drags (anchor drags), the behaviour is different. When you grab an anchor point (`hit.region.kind === "point"`), `dragPoint` is called. It converts the cursor position directly to a data point via `pointFor` / `toPoint`, and sets the anchor to that data point. There is no offset mechanism. The anchor jumps to the cursor position.

**For text specifically**, the problem is more subtle. Text hit testing returns `{ kind: "point", timeKey: "time", priceKey: "price" }` even for clicks inside the text body (see section D). So when you click in the middle of the text box and drag, the system treats it as an anchor drag, not a body drag. The anchor (x1, y1) jumps to the cursor position. Since the text is rendered starting from (x1, y1) as the top-left corner, the text box's top-left corner snaps to the cursor. This is why the cursor appears to "jump to the left edge."

### Is there a cursor offset mechanism?

**No.** There is no offset/cursor-grab-point mechanism anywhere in the code. The system does not record where inside the shape the user clicked relative to the anchor. There are two drag modes:

1. **Body drag**: delta-based (cursor delta from start position applied to all anchors). This works correctly for shapes that return `body` hits, because the whole shape moves by the same delta. The cursor stays in the same relative spot within the shape.

2. **Point drag**: absolute positioning (anchor set to cursor's data point). The anchor jumps to the cursor. No offset is stored or applied.

### How would you add a cursor offset?

For point drags (anchor drags), you would need to:

1. In `beginDrag`, record the offset between the cursor and the anchor being dragged: `offsetX = pos.x - anchorX`, `offsetY = pos.y - anchorY`.
2. In `dragPoint`, subtract the offset before converting to data space: `pt = this.toPoint({ x: pos.x - offsetX, y: pos.y - offsetY })`.

For body drags, the delta-based approach already preserves the grab point, so no change is needed.

For the text tool specifically, the fix is different (see section D): the hit test should return `{ kind: "body" }` for clicks inside the text bounding box, not `{ kind: "point" }`. Then the body drag mechanism would move the text by delta, preserving the cursor position within the text box.

---

## C. RESIZING

### After a shape is placed, can you resize it?

**Partially.** Resizing is implemented via anchor point drags, but the availability depends on the shape type:

| Shape | Resize Handles | How resizing works |
|-------|---------------|-------------------|
| **trendline** | p1, p2 endpoints | Drag either endpoint to move that anchor independently. The line recalculates. No explicit "resize" concept, just anchor repositioning. |
| **ray / extended** | Same as trendline (p1, p2) | Same. Extension is a display property, not a handle. |
| **rectangle** | 4 corner handles | `rectCornerHit` maps each corner to the appropriate time/price keys. Dragging a corner resizes the rectangle by moving that corner's time and/or price. |
| **fibonacci** | p1, p2 endpoints | Dragging endpoints re-anchors the fib retracement. Levels recalculate. |
| **position** | Entry, Target, Stop, Right-edge | 4 handles: entry price (mid-x), target price (mid-x), stop price (mid-x), right edge (time2, width). Dragging target/stop moves that price independently. Dragging entry moves all prices together. Right edge adjusts time width. |
| **channel** | p1, p2, p3 | 3 anchor handles. p3 controls the offset line's position. |
| **hchannel** | p1, p2, p3 | Same as channel. |
| **horizontal** | None (single price) | Any grab is a point drag of the price. No resize. |
| **vertical** | None (single time) | Any grab is a point drag of the time. No resize. |
| **text** | None | No resize handles. Text box size is determined by content and font size. |
| **ellipse / triangle** | 2 corners (p1, p2) | `rectCornerHit` provides corner resize. |

### What drag handles exist in the hit test?

The hit test checks for handles in this order: anchor points first, then body. The handles are:

- **Trendline**: p1, p2 (8px radius circles). Also a midpoint handle is RENDERED but NOT in the hit test.
- **Rectangle**: 4 corners (8px radius). All 4 are in the hit test via `rectCornerHit`.
- **Position**: 4 handles (8px). Entry, target, stop at mid-x; right edge at (xb, y1). All in the hit test.
- **Channel**: p1, p2, p3 (8px). All in the hit test.
- **Fibonacci**: p1, p2 (8px). In the hit test.
- **Horizontal**: single handle at mid-width (rendered only, hit test uses the full line band).
- **Text**: no handles rendered, no handles in hit test.

### Are these handles rendered visually on the chart?

**YES, conditionally.** The `showHandles(e)` function returns true when `e.state === "hovered" || e.state === "selected"`. So handles appear when you hover over or select a drawing. The rendering varies by type:

- **Trendline**: 2 circular handles at endpoints + 1 square midpoint handle. The midpoint handle is rendered by `drawMidpointHandle` but has NO corresponding hit test entry. It is decorative only, suggesting you can grab it to move the whole line, but the hit test doesn't check for it. The line body (6px from segment) IS hit-testable for a body drag though.
- **Rectangle**: 4 circular handles at all corners via `drawRectHandles`.
- **Position**: 4 circular handles (entry, target, stop, right edge) via `renderPositionHandles`.
- **Channel**: 3 circular handles (p1, p2, p3).
- **Fibonacci**: 2 circular handles at the connector endpoints.
- **Horizontal**: 1 circular handle at center of line.
- **Vertical**: 1 circular handle at vertical center.
- **Text**: Dashed border rectangle around the text box (when hovered/selected). No circular handles.
- **Ellipse/Triangle**: 2 circular handles at opposite corners.
- **Arrow**: 2 circular handles at endpoints.

### The midpoint handle on trendlines is a dead control

`drawMidpointHandle` renders a small square at the midpoint of the trendline. The comment says "grabbing it body-drags the whole line (the hit-test already treats the line body as a move target)." However, the hit test does NOT check for the midpoint specifically. It checks for endpoint anchors (8px) and then the line segment (6px). If the cursor is near the midpoint, it will hit the line segment test and get a body hit, which does trigger a body drag. So the midpoint handle is visually suggesting functionality that exists via a different path (body hit on the line), not via the handle itself. It works, but the visual cue and the hit mechanism are disconnected.

---

## D. TEXT TOOL

### How does the text tool handle hit testing?

`hitText` in `hit-test.ts`:

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
  return inside
    ? { id: e.d.id, region: { kind: "point", timeKey: "time", priceKey: "price" } }
    : null;
}
```

Key observations:

1. The hit test estimates the text bounding box from the anchor point (x1, y1) as the top-left corner. Width is approximated as `longestLine * fontSize * 0.6`. Height is `lineCount * fontSize * 1.3`.
2. Any click inside this estimated box returns a hit with `region.kind = "point"`, NOT `region.kind = "body"`.
3. This means EVERY interaction with the text tool is treated as an anchor drag, not a body move.

### How does the text tool handle dragging?

When you click on the text and drag, `beginDrag` sees `hit.region.kind === "point"` and calls `dragPoint`. `dragPoint` converts the cursor position directly to a data point and sets `updated.time = pt.time` and `updated.price = pt.price`. The text anchor (x1, y1) jumps to the cursor position.

Since the text is rendered starting from (x1, y1) as the top-left corner, the entire text box snaps so its top-left corner is at the cursor. If you grabbed the middle of the text box, the text shifts left and up so the cursor is now at the top-left corner.

### Why does the cursor jump to the left edge?

Because:
1. `hitText` returns `{ kind: "point" }` instead of `{ kind: "body" }`.
2. Point drags use absolute positioning (anchor = cursor position), not delta-based movement.
3. The anchor (x1, y1) is the top-left rendering origin of the text.
4. So the top-left of the text box snaps to the cursor, making it look like the cursor "jumped" to the left edge.

The fix is straightforward: change `hitText` to return `{ kind: "body" }` for clicks inside the text box (not on the anchor point itself). The body drag mechanism in `shiftDrawing` already has a `text` case that moves the single anchor by (dx, dy), which would preserve the cursor's relative position within the text box.

Alternatively, if point-drag behaviour is desired for precision, add a cursor offset mechanism as described in section B.

### Text tool also has no resize handles

There are no resize handles rendered or hit-tested for text. The text box size is purely a function of content length and font size. To resize text, the user would need to use the settings dialog (double-click) to change `fontSize` or edit the text content.

---

## E. BROKEN vs NEVER IMPLEMENTED

### 1. Body drag for shapes (trendline, channel, fib)

**Status: IMPLEMENTED and WORKING for shapes that return body hits.**

Body drags work correctly for rectangle, ellipse, triangle, position, trendline, channel, hchannel, and fibonacci. The `shiftDrawing` function handles each type with appropriate anchor shifting. The delta-based movement preserves the cursor's relative position within the shape.

The only gap is that trendline body drag requires clicking within 6px of the line itself, not anywhere in its bounding box. This is by design (matching TradingView behaviour where trendlines are thin objects), not a bug.

### 2. Resize handles

**Status: IMPLEMENTED and WORKING, with one gap.**

Endpoint/corner resize handles exist in both the hit test and the renderer for all two-point shapes (trendline, rectangle, fibonacci, position, channel, ellipse, triangle). Dragging an endpoint/corner moves that anchor independently, effectively resizing the shape.

**Gap: The trendline midpoint handle is rendered but has no hit-test entry.** The comment in `renderers.ts` says "grabbing it body-drags the whole line (the hit-test already treats the line body as a move target)." This is technically true (clicking near the midpoint hits the line segment and gets a body hit), but the square midpoint visual suggests a specific grab point that doesn't exist in the hit test. If you click exactly on the midpoint square, you're within 6px of the segment, so you get a body hit anyway. It works, but the visual affordance and the hit mechanism are separate paths. This is a minor UX inconsistency, not a bug.

**Text has no resize handles at all: NEVER IMPLEMENTED.** There is no mechanism to drag-resize the text box. Size is controlled only via font size in settings.

### 3. Text cursor jump

**Status: NEVER IMPLEMENTED (body drag for text), not broken.**

The text tool was never given a body drag mode. `hitText` returns `{ kind: "point" }` for all hits, including clicks in the middle of the text box. The body drag path (`shiftDrawing` with `kind: "body"`) has a `text` case that would work correctly, but it is never triggered because the hit test never returns a body hit for text.

This is an implementation gap, not a regression. The `shiftDrawing` text case exists (suggesting someone intended to support it), but the hit test was never updated to return body hits for text. The fix is a one-line change in `hitText`: return `{ kind: "body" }` for clicks inside the text bounding box that are not near the anchor point.

### Summary Table

| Issue | Status | Root Cause |
|-------|--------|-----------|
| Body drag for trendlines | Working | `hitTrendline` returns body hit for 6px segment proximity. By design. |
| Body drag for rectangles/boxes | Working | `pointInBox` returns body hit. Delta-based shift preserves cursor. |
| Body drag for channels | Working | Both lines tested via `distToSegment`, returns body hit. |
| Body drag for text | **Never implemented** | `hitText` returns `point` not `body` for clicks inside text box. `shiftDrawing` has the text body case ready but never triggered. |
| Resize handles (endpoints) | Working | `anchorHit` / `rectCornerHit` in hit test, `drawHandle` in renderer. |
| Resize handles (midpoint on trendline) | Visual only | `drawMidpointHandle` renders a square, but no hit-test entry. Works via line body hit by proximity. Minor UX inconsistency. |
| Resize handles (text) | **Never implemented** | No hit-test or render code for text resize handles. |
| Cursor offset for point drags | **Never implemented** | `dragPoint` uses absolute positioning. No offset recorded in `beginDrag`. Affects all point drags, but most noticeable on text. |
| Text cursor jump to left edge | **Never implemented** (consequence of above) | `hitText` returns `point` hit, `dragPoint` sets anchor = cursor position, anchor is top-left of text box. |

---

## File Inventory

| File | Purpose | Key exports |
|------|---------|-------------|
| `types.ts` | Type definitions: DataPoint, ResolvedEntry, Hit, HitRegion, DrawingCallbacks | `Hit`, `HitRegion`, `ResolvedEntry` |
| `geometry.ts` | Math helpers: distance, dist-to-segment, angle snap, point-in-box | `dist`, `distToSegment`, `snapAngle`, `pointInBox` |
| `resolve.ts` | Data-space to pixel-space conversion, including cross-timeframe and future anchor extrapolation | `resolveEntry`, `timeToX`, `xToTime`, `makeResolveCtx` |
| `hit-test.ts` | Hit testing for all shape types | `hitTest` |
| `renderers.ts` | Canvas rendering for all shape types | `renderEntry` |
| `manager.ts` | Interaction layer: placement, selection, dragging, snapping, keyboard shortcuts | `DrawingToolsManager` |