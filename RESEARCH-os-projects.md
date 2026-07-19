# Open-Source Drawing Tools and Pane Management Research

Research date: 2026-07-16
Purpose: Find patterns for drawing tools, hit-testing, drag/resize, pane separators, and text annotations to adopt in OpenCharts.

---

## 1. Key Projects Found

### Tier 1: Directly Relevant (lightweight-charts v5 + drawing tools)

#### 1.1 deepentropy/lightweight-charts-drawing
- **URL:** https://github.com/deepentropy/lightweight-charts-drawing
- **npm:** `lightweight-charts-drawing` (0.1.1, published Feb 2026)
- **Stars:** ~65 | **Forks:** 23
- **LWC version:** v5
- **Tools:** 68 drawing tools (trend lines, Fibonacci, Gann, channels, pitchforks, shapes, annotations, forecasting)
- **Live demo:** https://deepentropy.github.io/lightweight-charts-drawing/

**Architecture:**
- Two-class pattern: Tool class (extends `Drawing`) holds anchors/state, implements hit testing and geometry. Pane view (implements `IPrimitivePaneView`) handles canvas rendering.
- `DrawingManager` orchestrates lifecycle, selection, drag-editing, and event emission.
- Source structure: `src/core/` (Drawing base, DrawingManager, geometry, types), `src/interaction/` (InteractionHandler FSM), `src/rendering/`, `src/tools/`, `src/registry/`

**Key patterns for us:**

**Hit testing (anchor points):**
```typescript
// From src/core/drawing.ts
hitTestAnchor(point: Point, viewport: Viewport): number | null {
  const controlPoints = this.getControlPoints(viewport);
  const threshold = 8; // pixels
  for (const cp of controlPoints) {
    const dx = point.x - cp.x;
    const dy = point.y - cp.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance <= threshold) {
      return cp.index;
    }
  }
  return null;
}
```

**DrawingManager drag flow:**
```typescript
// From src/core/drawing-manager.ts
private handleMouseDown(event: MouseEvent): void {
  const point = this.getPointFromEvent(event);
  // Check for anchor hit on selected drawing first
  if (this._selectedId) {
    const anchorIndex = this.hitTestAnchor(point);
    if (anchorIndex !== null) {
      this._isDragging = true;
      this._dragAnchorIndex = anchorIndex;
      drawing.setState('editing');
      return;
    }
  }
}

private handleMouseMove(event: MouseEvent): void {
  if (!this._isDragging || this._dragAnchorIndex === null) return;
  const point = this.getPointFromEvent(event);
  const viewport = this.getViewport();
  const time = viewport.timeScale.coordinateToTime(point.x);
  const price = viewport.priceScale.coordinateToPrice(point.y);
  if (time !== null && price !== null) {
    drawing.updateAnchor(this._dragAnchorIndex, { time, price });
    this.emit('drawing:updated', { drawingId: drawing.id, drawing });
  }
}
```

**Interaction state machine (FSM):**
```typescript
// From src/interaction/interaction-handler.ts
export type InteractionState = 'idle' | 'placing' | 'editing' | 'complete';

// State transitions:
// idle -> placing (mouseDown, first anchor)
// placing -> placing (mouseDown, subsequent anchors)
// placing -> complete (mouseDown, final anchor)
// complete -> editing (mouseDown on anchor)
// editing -> complete (mouseUp)
```

**Viewport abstraction (coordinate conversion):**
```typescript
// From src/core/drawing.ts
getViewport(): Viewport | null {
  const timeScale = this._chart.timeScale();
  return {
    width: timeScale.width(),
    height: this._container?.clientHeight ?? 400,
    timeScale: {
      coordinateToTime: (x) => timeScale.coordinateToTime(x),
      timeToCoordinate: (time) => timeScale.timeToCoordinate(time),
      logicalToCoordinate: (logical) => timeScale.logicalToCoordinate(logical),
    },
    priceScale: {
      coordinateToPrice: (y) => this._series.coordinateToPrice(y),
      priceToCoordinate: (price) => this._series.priceToCoordinate(price),
    },
  };
}
```

**What they DO NOT have:** Body drag (clicking inside a shape to move the whole shape). Only anchor-point dragging is implemented. No resize handles rendered visually on the canvas.

---

#### 1.2 difurious/lightweight-charts-line-tools-core
- **URL:** https://github.com/difurious/lightweight-charts-line-tools-core
- **Stars:** 69 | **Forks:** 18
- **LWC version:** v5+
- **License:** MPL-2.0
- **Approach:** Core orchestrator + modular tool plugins (install only what you need)
- **Companion tools:** 12 separate packages (lines, rectangle, circle, triangle, path, parallel channel, fib retracement, price range, long/short position, text, market depth, freehand)

**Key patterns for us:**

**Interaction Manager (sophisticated drag/click detection):**
```typescript
// From src/interaction/interaction-manager.ts
const DRAG_THRESHOLD = 10; // Pixels to classify movement as drag
const CLICK_TIMEOUT = 300; // Milliseconds

// Tracks: _isEditing, _draggedTool, _draggedPointIndex, _originalDragPoints,
//         _dragStartPoint, _activeDragCursor
// Uses raw DOM events (mousedown, mousemove, mouseup) with capturing phase (true)
// to prevent event swallowing by LWC's own handlers.

chartElement.addEventListener('mousedown', this._boundHandleMouseDown, true);
chartElement.addEventListener('mousemove', this._boundHandleMouseMove, true);
window.addEventListener('mouseup', this._boundHandleMouseUp);
```

**Virtual Anchor Support:** Handles "virtual" resize handles that don't correspond to data points (e.g., 8-handle grid on a rectangle, mid-line handles on a parallel channel). This is the pattern for resize handles.

**Smart Cursors:** Dynamic cursor changes based on tool orientation and resize direction (NWSE vs NESW).

**Multi-Stage Culling:** AABB for shapes, sub-segment intersection for polylines. Skips rendering for off-screen tools.

**Price Axis Label Stacking:** Dedicated manager detects Y-axis label collisions and shifts them vertically in real-time.

**Multi-pane awareness:** The interaction manager tracks `_currentGlobalPoint` and computes which pane the mouse is in, bypassing LWC's resetting Y-coordinates from crosshair events. Pane Y-offset normalization:
```typescript
let normalizedY = (targetY - this._getActivePaneYOffset()) as Coordinate;
```

**Body drag:** The `eventPressedOtherMove` method in KLineChart's Overlay.ts (see below) shows the pattern. difurious likely has similar logic for whole-tool drag vs single-point drag.

**Known issues (from README):**
- Mouse pointer cursor transitions may not update immediately between hit-test regions (cosmetic).
- Text alignment perception can be subtle.

---

#### 1.3 tpunt/lwc-plugin-shape-drawing
- **URL:** https://github.com/tpunt/lwc-plugin-shape-drawing
- **npm:** `lwc-plugin-shape-drawing`
- **Stars:** 4
- **LWC version:** v5.0.0+
- **Focus:** Arbitrary shapes (triangles, rectangles, polygons) with full interactivity

**Key patterns for us:**

**Hit testing with both border AND fill detection:**
```typescript
// From src/shape-drawing.ts
public hitTest?(x: number, y: number): PrimitiveHoveredItem | null {
  // First check if near a corner (resize handle)
  this._selectedPointIndex = this._getPointIndexIfNearCorner(x, y, points);
  if (this._selectedPointIndex !== -1) {
    hovered = true;
  } else {
    // For 2 points: check if near line segment
    // For 3+ points: check if inside polygon (ray casting)
    switch (points.length) {
      case 2:
        if (this._isPointNearLine(x, y, points[0], points[1])) hovered = true;
      default:
        if (this._options.joinFirstToLastCorner) {
          if (this._isPointInPolygon(x, y, points)) hovered = true;
        }
    }
  }
  return { externalId: ..., cursorStyle: 'pointer', zOrder: 'top' };
}
```

**Point-to-line-segment distance (the key geometry function):**
```typescript
private _isPointNearLine(x, y, p1, p2): boolean {
  const hitRadius = this._options.hoveredBorderWidth / devicePixelRatio;
  const A = x - p1.x, B = y - p1.y;
  const C = p2.x - p1.x, D = p2.y - p1.y;
  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  if (lenSq === 0) return Math.sqrt(A*A + B*B) <= hitRadius;
  let t = Math.max(0, Math.min(1, dot / lenSq));
  const closestX = p1.x + t * C;
  const closestY = p1.y + t * D;
  const distance = Math.sqrt((x - closestX)**2 + (y - closestY)**2);
  return distance <= hitRadius;
}
```

**Point-in-polygon (ray casting):**
```typescript
private _isPointInPolygon(x, y, points): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i].x, yi = points[i].y;
    const xj = points[j].x, yj = points[j].y;
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}
```

**Corner hit detection (circle and square shapes):**
```typescript
private _getPointIndexIfNearCorner(x, y, points): number {
  switch (this._options.hoveredCornerShape) {
    case HoveredCornerShape.Circle: {
      const cornerRadius = this._options.hoveredCornerSize / devicePixelRatio / 2;
      const distance = Math.sqrt((p.x - x)**2 + (p.y - y)**2);
      hit = distance <= cornerRadius;
      break;
    }
    case HoveredCornerShape.Square: {
      const halfSize = this._options.hoveredCornerSize / devicePixelRatio / 2;
      hit = x >= p.x - halfSize && x <= p.x + halfSize &&
            y >= p.y - halfSize && y <= p.y + halfSize;
      break;
    }
  }
}
```

**Body move (moveBy):**
```typescript
public moveBy(pointDelta: Point, pointIndex: number = -1) {
  if (pointIndex !== -1) {
    // Move single point
    this._points[pointIndex].price += pointDelta.price;
    this._points[pointIndex].time += pointDelta.time;
  } else {
    // Move entire shape (body drag)
    this._points.forEach(p => {
      p.price += pointDelta.price;
      p.time += pointDelta.time;
    });
  }
}
```

**HoveredObject encoding (for passing hit info through LWC events):**
```typescript
export class HoveredObject {
  static readonly separator = '+++';
  // Encodes as "objectId+++pointIndex" so you can parse which corner was grabbed
  static parseHoveredObjectId(hoveredObjectId: string): HoveredObject | null {
    const parts = hoveredObjectId.split(HoveredObject.separator);
    return new HoveredObject(parts[0], Number(parts[1]));
  }
}
```

---

#### 1.4 TradingView Official Rectangle Drawing Tool (plugin example)
- **URL:** https://github.com/tradingview/lightweight-charts/tree/master/plugin-examples/src/plugins/rectangle-drawing-tool
- **Live demo:** https://tradingview.github.io/lightweight-charts/plugin-examples/plugins/rectangle-drawing-tool/example/
- **LWC version:** v5 (master branch)

**Key patterns:**

**Simple click-to-draw flow (no drag during creation):**
```typescript
// Uses chart.subscribeClick for placement, subscribeCrosshairMove for preview
private _onClick(param: MouseEventParams) {
  const price = this._series.coordinateToPrice(param.point.y);
  this._addPoint({ time: param.time, price });
  if (this._points.length >= 2) {
    this._addNewRectangle(this._points[0], this._points[1]);
    this.stopDrawing();
  }
}
```

**Preview rectangle (ghost while drawing):**
```typescript
class PreviewRectangle extends Rectangle {
  public updateEndPoint(p: Point) {
    this._p2 = p;
    this._paneViews[0].update();
    this._timeAxisViews[1].movePoint(p);
    this._priceAxisViews[1].movePoint(p);
    this.requestUpdate();
  }
}
```

**Axis labels (price and time axis views):**
The official example shows the full pattern for rendering labels on both axes with proper `ISeriesPrimitiveAxisView` implementation. Each point gets a `RectangleTimeAxisView` and `RectanglePriceAxisView`.

**What this does NOT have:** No hit testing, no selection, no dragging, no resize handles. It's a minimal draw-only example.

---

### Tier 2: Different Charting Library (KLineChart) with Strong Drawing System

#### 1.5 klinecharts/KLineChart + klinecharts/pro
- **URL:** https://github.com/klinecharts/KLineChart (3.9K stars)
- **Pro URL:** https://github.com/klinecharts/pro (292 stars)
- **LWC version:** N/A (own library, zero dependencies)
- **Drawing system:** Built-in overlay system with 15+ overlay types
- **Why relevant:** KLineChart has the most mature open-source drawing tool system we found. The overlay architecture directly addresses body drag, resize handles, and pane separators.

**Key patterns for us:**

**Overlay system (from src/component/Overlay.ts):**

The `Overlay` interface includes both drawing and interaction callbacks:
```typescript
export interface OverlayEventCollection<E> {
  onDrawStart, onDrawing, onDrawEnd,
  onClick, onDoubleClick, onRightClick,
  onPressedMoveStart, onPressedMoving, onPressedMoveEnd,
  onMouseMove, onMouseEnter, onMouseLeave,
  onSelected, onDeselected
}
```

**Body drag (eventPressedOtherMove):**
```typescript
// When dragging the body (not a specific point), ALL points shift by the delta
eventPressedOtherMove(point, chartStore): void {
  if (this._prevPressedPoint !== null) {
    let difDataIndex = point.dataIndex - this._prevPressedPoint.dataIndex;
    let difValue = point.value - this._prevPressedPoint.value;
    this.points = this._prevPressedPoints.map(p => {
      const newPoint = { ...p };
      newPoint.dataIndex = dataIndex + difDataIndex;
      newPoint.value = p.value + difValue;
      return newPoint;
    });
  }
}
```

This is the pattern we need: store `_prevPressedPoint` and `_prevPressedPoints` on mouseDown, then on mouseMove compute the delta and apply it to ALL points. This gives body drag without any per-point geometry math.

**Single point drag (eventPressedPointMove):**
```typescript
eventPressedPointMove(point, pointIndex): void {
  this.points[pointIndex].timestamp = point.timestamp;
  this.points[pointIndex].dataIndex = point.dataIndex;
  this.points[pointIndex].value = point.value;
}
```

**Drawing modes:**
```typescript
type OverlayDrawingMode = 'step' | 'continuous';
// 'step' = click to place each point
// 'continuous' = mouse down, drag, release (freehand)
```

**Overlay modes (magnet/snap):**
```typescript
type OverlayMode = 'normal' | 'weak_magnet' | 'strong_magnet';
// modeSensitivity: number (pixels, default 8)
```

**SeparatorWidget (pane resizing):**
- KLineChart has a dedicated `SeparatorWidget` (src/widget/SeparatorWidget.ts) that handles drag-to-resize between panes.
- Known bug: drag-to-resize stops when cursor leaves widget bounding box (issue #490). They solve this by capturing mouse events at the window level during drag.
- The separator is a visible HTML element rendered between panes, not a canvas-drawn line.

**KLineChart Pro Drawing Bar:**
- `src/widget/drawing-bar/index.tsx` provides a toolbar UI for selecting drawing tools, with sub-toolbar for styling (color, opacity, thickness, line style).

---

### Tier 3: Other Notable Projects

#### 1.6 dtau00/tv-lwc-chart-drawing-tools
- **URL:** https://github.com/dtau00/tv-lwc-chart-drawing-tools
- **Stars:** 4
- **LWC version:** v5 (appears to be, based on plugin system usage)
- **Features:** Toolbar, sub-toolbar for styling, auto save/load, synced toolbar between charts, synced drawings of same symbol
- **Approach:** Framework-first (builds a complete drawing package, not just plugins)
- **Pattern:** Updates go through the plugin, not directly to the chart. This pads the chart for extended drawings (rays that go beyond last data point).

#### 1.7 IliiaDenisov/interactive-lw-charts-tools
- **URL:** https://github.com/IliiaDenisov/interactive-lw-charts-tools
- **Stars:** 2
- **npm:** `interactive-lw-charts-tools`
- **LWC version:** v5
- **Tools:** Trend line, Time line, Polyline, Curve, Fibonacci Spiral, Fibonacci Retracement, Fibonacci Wedge
- **Indicators:** Bollinger Bands, SMA
- **Pattern:** Each tool is a class that attaches as a primitive. `startDrawing()` / `stopDrawing()` API for interactive mode.

#### 1.8 Prithvi101/lwc-drawing-tools
- **URL:** https://github.com/Prithvi101/lwc-drawing-tools
- **npm:** `lwc-plugin-drawing-tools` (1.0.0, published May 2026, 31 weekly downloads)
- **LWC version:** v5 (uses plugin system)
- **Status:** Early stage, minimal features

#### 1.9 GreatJambo/tv-lite-demo
- **URL:** https://github.com/GreatJambo/tv-lite-demo
- **Stars:** 1
- **LWC version:** v5
- **Features:** Candlestick chart, SMA/EMA, Volume/RSI/MACD indicator panes, Fibonacci retracement tool, realtime WebSocket streaming
- **Relevance:** Good reference for multi-pane indicator management with LWC v5. Uses React.

#### 1.10 difurious/lightweight-charts-line-tools-* (individual tool packages)
- **Lines:** https://github.com/difurious/lightweight-charts-line-tools-lines (TrendLine, Ray, Arrow, ExtendedLine, HorizontalLine, HorizontalRay, VerticalLine, CrossLine, Callout)
- **Rectangle:** https://github.com/difurious/lightweight-charts-line-tools-rectangle
- **Circle:** https://github.com/difurious/lightweight-charts-line-tools-circle
- **Triangle:** https://github.com/difurious/lightweight-charts-line-tools-triangle
- **Text:** https://github.com/difurious/lightweight-charts-line-tools-text
- **Parallel Channel:** https://github.com/difurious/lightweight-charts-line-tools-parallel-channel
- **Fib Retracement:** https://github.com/difurious/lightweight-charts-line-tools-fib-retracement
- Each is a separate npm package that registers with the core.

---

## 2. npm Packages Summary

| Package | Version | Downloads | LWC v5 | Drawing Tools | Notes |
|---------|---------|-----------|--------|---------------|-------|
| `lightweight-charts-drawing` | 0.1.1 | - | Yes | 68 tools | Most comprehensive. MIT. |
| `lwc-plugin-drawing-tools` | 1.0.0 | 31/wk | Yes | Basic | Early stage. MIT. |
| `lwc-plugin-shape-drawing` | - | - | Yes | Shapes only | Good hit-test code. |
| `interactive-lw-charts-tools` | - | - | Yes | 6 tools + indicators | Small collection. |

---

## 3. Patterns to Adopt in OpenCharts

### 3.1 Shape Body Drag (click anywhere inside shape to move it)

**Pattern from tpunt + KLineChart:**

1. On `hitTest()`, distinguish between corner hits (resize) and body hits (move).
2. Encode the distinction in the `externalId` returned to LWC: use `"objectId+++pointIndex"` for corner hits, `"objectId"` for body hits.
3. On mouseDown, store the starting point AND a snapshot of all current points (`_prevPressedPoint`, `_prevPressedPoints`).
4. On mouseMove, compute delta from start point and apply to all points:
```typescript
const deltaPrice = currentPrice - startPrice;
const deltaTime = currentTime - startTime;
this._points.forEach(p => {
  p.price += deltaPrice;
  p.time += deltaTime;
});
```
5. On mouseUp, clear the drag state.

**Critical:** Store the delta in price/time space, not pixel space, so the shape stays anchored to chart data when the viewport scrolls.

### 3.2 Resize Handles (visually rendered and draggable)

**Pattern from tpunt:**

1. Render corner shapes (circles or squares) at each vertex when the shape is selected or hovered.
2. Use `devicePixelRatio` to convert hit-test radius to logical pixels.
3. Check corners FIRST in hit test (before body), so corner grab takes priority.
4. Return the corner index through the `externalId` so the mouseDown handler knows which corner to drag.

**Pattern from difurious (Virtual Anchors):**

1. For rectangles, generate 8 virtual handles (4 corners + 4 edge midpoints) rather than just data points.
2. Edge midpoint handles resize two adjacent corners simultaneously.
3. The handle index is stored as `_draggedPointIndex` and the interaction manager maps it to the appropriate point mutation logic.

**Implementation sketch for OpenCharts:**
```typescript
// In the pane renderer, when shape is selected:
if (shape.isSelected() || shape.isHovered()) {
  const cornerSize = 8; // logical pixels
  ctx.fillStyle = theme.accentColor;
  for (const point of shape.points) {
    const pixel = anchorToPixel(point);
    if (pixel) {
      ctx.fillRect(pixel.x - cornerSize/2, pixel.y - cornerSize/2, cornerSize, cornerSize);
    }
  }
}
```

### 3.3 Pane Separators That Actually Resize When Dragged

**From TradingView LWC v5 native:**
- LWC v5.2 has built-in pane support with `LayoutPanesOptions`:
  - `enableResize: boolean` (default true)
  - `separatorColor: string`
  - `separatorHoverColor: string`
- The `IPaneApi` provides `getHeight()`, `setHeight()`, `moveTo()`.
- Native pane separators handle drag internally.

**From KLineChart SeparatorWidget:**
- KLineChart uses a dedicated HTML widget element for separators (not canvas).
- The widget listens for mousedown, then captures mousemove at the document level (not the element level) to handle drag even when the cursor leaves the separator.
- This is the fix for the common bug where drag stops when the cursor moves off the thin separator element.

**For OpenCharts:**
Since LWC v5.2 has native pane resize with `enableResize: true`, we should use the built-in functionality first. If we need custom separators:
1. Render an HTML div (not canvas) between panes with `cursor: ns-resize`.
2. On mousedown, `document.addEventListener('mousemove', dragHandler)` and `document.addEventListener('mouseup', upHandler)`.
3. In the drag handler, compute new heights based on mouse Y delta and call `pane.setHeight()`.
4. Remove document listeners on mouseup.

### 3.4 Text Annotations That Don't Jump the Cursor on Drag

**Problem:** When dragging a text annotation, the cursor position relative to the text anchor can shift because text has width/height. If you anchor to the text center but compute the hit test from the top-left, the text "jumps" when you start dragging.

**Pattern from difurious text tool:**
- Use `text.box.alignment` (alignment of the entire text box relative to the anchor point) rather than `text.alignment` (internal text alignment).
- The anchor point is the logical position on the chart. The text box is rendered relative to the anchor.
- During drag, only update the anchor point, never the offset.

**Pattern from KLineChart simpleAnnotation:**
- Annotations have a single point (1 anchor). The annotation renders text/box at an offset from that point.
- The offset is a style property, not a position property. Dragging moves the anchor, the offset stays constant.

**Implementation for OpenCharts:**
```typescript
class TextAnnotation extends Drawing {
  // Anchor: { time, price } - the logical chart position
  // Style: { offsetX, offsetY, alignment, ... } - visual positioning

  hitTest(point, viewport): boolean {
    const anchorPixel = this.anchorToPixel(this._anchors[0], viewport);
    if (!anchorPixel) return false;
    // Check if point is within the text bounding box
    const boxX = anchorPixel.x + this._style.offsetX;
    const boxY = anchorPixel.y + this._style.offsetY;
    const boxWidth = this._measuredTextWidth;
    const boxHeight = this._measuredTextHeight;
    return point.x >= boxX && point.x <= boxX + boxWidth &&
           point.y >= boxY && point.y <= boxY + boxHeight;
  }

  // During drag, ONLY update the anchor. Never touch offsetX/offsetY.
  onDrag(newAnchor: Anchor): void {
    this._anchors[0] = newAnchor;
    // offset stays the same, so the text doesn't jump
  }
}
```

**Critical insight:** The cursor jump happens when the hit test uses the bounding box (with offset) but the drag updates the anchor (without offset). The fix is to compute the initial grab point relative to the anchor, then during drag, the new anchor position = cursor position minus the grab offset. This keeps the text exactly where the user grabbed it.

```typescript
// On mouseDown:
const grabOffsetX = cursorX - (anchorPixelX + style.offsetX);
const grabOffsetY = cursorY - (anchorPixelY + style.offsetY);

// On mouseMove:
const newAnchorPixelX = cursorX - grabOffsetX - style.offsetX;
const newAnchorPixelY = cursorY - grabOffsetY - style.offsetY;
// Convert pixel back to time/price for the anchor
```

---

## 4. Architecture Recommendation for OpenCharts

Based on the research, here's the recommended architecture:

### 4.1 Layer Structure

```
DrawingManager (orchestrator)
  |-- Drawing (abstract base class)
       |-- anchors: Anchor[]
       |-- style: DrawingStyle
       |-- state: 'normal' | 'selected' | 'editing'
       |-- testHit(point, viewport): boolean  [abstract]
       |-- hitTestAnchor(point, viewport): number | null
       |-- computeGeometry(viewport): Geometry[]  [abstract]
       |-- paneViews(): IPrimitivePaneView[]
  |-- InteractionHandler (FSM for placement)
  |-- PaneView (canvas rendering)
  |-- AxisView (price/time labels)
```

### 4.2 Hit Test Priority Order

1. **Anchor/resize handles first** (8px radius circle around each handle)
2. **Body/border/fill second** (line distance or polygon containment)
3. Return `externalId` encoding both object ID and what was hit (body vs handle index)

### 4.3 Drag Modes

- **Anchor drag:** Move a single anchor point. State: `editing`, `draggedPointIndex` set.
- **Body drag:** Move all anchors by the same delta. Store snapshot on mouseDown, apply delta on mouseMove.
- **Creation drag:** Click-to-place (step mode) or click-drag-release (continuous mode).

### 4.4 Event Handling

- Use raw DOM events (mousedown, mousemove, mouseup) on the chart container, NOT LWC's `subscribeClick` for drag handling. LWC's click events reset Y coordinates and don't support drag.
- Use capturing phase (`addEventListener('mousedown', handler, true)`) to prevent LWC from swallowing events.
- Attach mouseup to `window` (not the chart element) so drag continues even when cursor leaves the chart.
- Use LWC's `subscribeCrosshairMove` for hover/preview rendering during creation.

### 4.5 Coordinate Conversion

- Always store anchors in chart space (time, price), never pixel space.
- Convert to pixels for rendering and hit testing, convert back to chart space for storage.
- Be aware of multi-pane Y-offset: `normalizedY = mouseY - paneYOffset`.

### 4.6 Pane Management

- Use LWC v5.2 native pane API (`chart.panes()`, `pane.getHeight()`, `pane.setHeight()`).
- Enable `layout.panes.enableResize: true` for built-in separator drag.
- If custom separators needed, use HTML overlay divs with document-level event capture during drag.

---

## 5. Links Quick Reference

| Project | URL | LWC v5 | Stars | Key Takeaway |
|---------|-----|--------|-------|--------------|
| deepentropy/lwc-charts-drawing | [GitHub](https://github.com/deepentropy/lightweight-charts-drawing) / [npm](https://www.npmjs.com/package/lightweight-charts-drawing) | Yes | 65 | 68 tools, DrawingManager + FSM, MIT |
| difurious/lwc-line-tools-core | [GitHub](https://github.com/difurious/lightweight-charts-line-tools-core) | Yes | 69 | Best interaction manager, virtual anchors, smart cursors |
| tpunt/lwc-plugin-shape-drawing | [GitHub](https://github.com/tpunt/lwc-plugin-shape-drawing) / [npm](https://www.npmjs.com/package/lwc-plugin-shape-drawing) | Yes | 4 | Clean hit-test code, body drag, polygon containment |
| TV official rectangle example | [GitHub](https://github.com/tradingview/lightweight-charts/tree/master/plugin-examples/src/plugins/rectangle-drawing-tool) | Yes | - | Reference for plugin structure, axis labels |
| klinecharts/KLineChart | [GitHub](https://github.com/klinecharts/KLineChart) | N/A | 3.9K | Best overlay system, body drag pattern, SeparatorWidget |
| klinecharts/pro | [GitHub](https://github.com/klinecharts/pro) | N/A | 292 | Drawing bar UI, styling toolbar |
| dtau00/tv-lwc-chart-drawing-tools | [GitHub](https://github.com/dtau00/tv-lwc-chart-drawing-tools) | Yes | 4 | Synced drawings, auto save/load |
| IliiaDenisov/interactive-lw-charts-tools | [GitHub](https://github.com/IliiaDenisov/interactive-lw-charts-tools) | Yes | 2 | Fib tools, indicators as primitives |
| GreatJambo/tv-lite-demo | [GitHub](https://github.com/GreatJambo/tv-lite-demo) | Yes | 1 | Multi-pane indicators, React, WebSocket streaming |
| difurious line-tools (12 packages) | [GitHub org](https://github.com/difurious) | Yes | - | Modular tool plugins, register what you need |
| LWC v5 Panes docs | [Docs](https://tradingview.github.io/lightweight-charts/docs/panes) | v5.2 | - | Native pane API, enableResize, separatorColor |
| LWC v5 hit test PR #2076 | [GitHub](https://github.com/tradingview/lightweight-charts/pull/2076) | v5.2 | - | Series hit testing + hoveredSeriesOnTop |
| LWC v5.2 release notes | [Docs](https://tradingview.github.io/lightweight-charts/docs/release-notes) | v5.2 | - | New hit test API, mouse event enhancements |