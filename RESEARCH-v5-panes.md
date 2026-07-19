# Research: Lightweight-Charts v5 Pane API & Position Tool Resizing

## Date: 2026-07-16
## Scope: How v5 panes work, position tool resize behavior, indicator nametag binding

---

## 1. How v5 Panes Work

### 1.1 Pane Model

Lightweight-charts v5 introduced a multi-pane model. A chart always has at least one pane (pane 0, the main chart). Additional panes are created by passing a `paneIndex` to `chart.addSeries()` or by calling `chart.addPane()`.

Key API surfaces from `typings.d.ts`:

```typescript
// IChartApi
chart.panes(): IPaneApi<Time>[]         // all panes, ordered top-to-bottom
chart.addPane(preserveEmptyPane?): IPaneApi<Time>  // add a new pane
chart.removePane(index: number): void   // remove pane by index
chart.swapPanes(first: number, second: number): void  // swap two panes
chart.paneSize(paneIndex?): PaneSize    // { width, height } of a pane
chart.priceScale(id: string, paneIndex?: number): IPriceScaleApi  // price scale in a pane

// ISeriesApi
series.moveToPane(paneIndex: number): void  // move series to a different pane
```

### 1.2 IPaneApi Methods

Full interface from `typings.d.ts` lines 2011-2130:

```typescript
interface IPaneApi<HorzScaleItem> {
  getHeight(): number;
  setHeight(height: number): void;        // set absolute pixel height
  moveTo(paneIndex: number): void;         // reorder pane
  paneIndex(): number;                      // get pane's current index
  getSeries(): ISeriesApi<SeriesType>[];    // series in this pane
  getHTMLElement(): HTMLElement | null;     // DOM element for the pane
  attachPrimitive(primitive: IPanePrimitive): void;
  detachPrimitive(primitive: IPanePrimitive): void;
  priceScale(priceScaleId: string): IPriceScaleApi;
  setPreserveEmptyPane(preserve: boolean): void;
  preserveEmptyPane(): boolean;
  getStretchFactor(): number;               // relative size weight (default 1)
  setStretchFactor(stretchFactor: number): void;
  addSeries(definition, options?): ISeriesApi;  // add series to this pane
  addCustomSeries(customPaneView, options?): ISeriesApi;
}
```

### 1.3 How to Enable Pane Resizing (Drag Handles Between Panes)

Pane resizing is built into v5. It is controlled by `layout.panes` options:

```typescript
interface LayoutPanesOptions {
  enableResize: boolean;           // default: true
  separatorColor: string;          // default: '#2B2B43'
  separatorHoverColor: string;     // default: 'rgba(178, 181, 189, 0.2)'
}
```

**By default, `enableResize` is `true`.** The chart draws a separator bar between panes. The user can drag this separator to resize panes. The library handles all the mouse/touch interaction internally.

To enable in chart creation:

```typescript
const chart = createChart(container, {
  layout: {
    panes: {
      enableResize: true,                    // already the default
      separatorColor: isDark ? "#2A2E39" : "#E0E3EB",
      separatorHoverColor: "rgba(120, 140, 180, 0.3)",
    },
  },
});
```

**Current state in OpenCharts:** The chart creation code in `ChartPanel.tsx` does NOT set `layout.panes` options. Since `enableResize` defaults to `true`, pane resizing should already work. However, the separator colors use the library defaults (`#2B2B43`), which may not match the dark/light theme.

### 1.4 Pane State Change Events

There is **no dedicated pane resize/reorder event** in the v5 API. The available event hooks are:

- `chart.timeScale().subscribeSizeChange(handler)` - fires when the time scale size changes (width/height). This fires when panes resize because the time scale height is constant but the overall chart height changes affect pane heights.
- `ResizeObserver` on the chart element - fires when the chart container resizes, but NOT when panes are internally resized (panes share the same container height).

**To detect pane resizing:** Poll `chart.panes()` and compare `pane.getHeight()` values, or use a `MutationObserver` on the pane separator elements. The cleanest approach is a `ResizeObserver` on each pane's HTML element (via `pane.getHTMLElement()`).

### 1.5 Stretch Factor vs Fixed Height

Two models for pane sizing:

1. **Stretch factor** (default): Each pane gets a `stretchFactor` (default 1). The total height is divided proportionally. When the chart resizes, panes scale proportionally.
2. **Fixed height**: `pane.setHeight(px)` sets an absolute pixel height. This overrides the stretch factor.

When the user drags a separator, the library adjusts the stretch factors internally. `pane.getStretchFactor()` reflects the new ratio after a drag.

---

## 2. Position Tool: Current Resize Behavior

### 2.1 Data Model

The position tool stores in `DrawingLine`:
```typescript
{
  type: "position",
  side: "long" | "short",
  price: number,          // entry price
  time: number,           // left anchor time
  time2: number,          // right anchor time (box width)
  stopPrice: number,      // stop loss price
  targetPrice: number,    // take profit price
  riskPct: number,        // % of account equity risked (default 1)
  color: string,
}
```

### 2.2 Rendering (renderers.ts)

`renderPosition()` draws:
- Two filled zones: green (entry to target) and red (entry to stop)
- A dashed horizontal entry line at `y1` from `xa` to `xb`
- Four drag handles (when hovered/selected):
  - `(xm, y1)` - entry price handle (mid-x)
  - `(xm, yTarget)` - target price handle (mid-x)
  - `(xm, yStop)` - stop price handle (mid-x)
  - `(xb, y1)` - right edge width handle
- A readout label box to the right of the box with RR, target %, stop %, risk $

Where `xa = min(x1, x2)`, `xb = max(x1, x2)`, `xm = (xa + xb) / 2`.

### 2.3 Hit Testing (hit-test.ts)

`hitPosition()` tests in this order:
1. Target handle: `dist(p, {x: xm, y: yTarget}) <= tol.handle` -> `pointHit(null, "targetPrice")`
2. Stop handle: `dist(p, {x: xm, y: yStop}) <= tol.handle` -> `pointHit(null, "stopPrice")`
3. Entry handle: `dist(p, {x: xm, y: y1}) <= tol.handle` -> `pointHit(null, "price")`
4. Width handle: `dist(p, {x: xb, y: y1}) <= tol.handle` -> `pointHit("time2", null)`
5. Body: inside the bounding box of all three price rows -> `bodyHit`

### 2.4 Drag Handling (manager.ts)

**Point drag** (`dragPoint`): Updates the specific field on the drawing:
- Dragging the entry handle (`priceKey: "price"`) moves only the entry price. Stop and target stay at their original prices. **This is a bug** - the user expects the whole position to move (entry + stop + target together) when dragging the entry line.
- Dragging the target handle (`priceKey: "targetPrice"`) moves only the target price.
- Dragging the stop handle (`priceKey: "stopPrice"`) moves only the stop price.
- Dragging the width handle (`timeKey: "time2"`) changes only `time2` (the box width).

**Body drag** (`shiftPosition`): Moves the entire position in time and price. All prices (entry, stop, target) shift by the same `dPrice`, and both times shift by the same `dTime`. This is correct.

### 2.5 What's Broken

#### Bug 1: Entry handle drag doesn't move stop/target

When dragging the entry price handle, `dragPoint` sets only `updated.price = pt.price`. The stop and target prices stay fixed. The body drag (`shiftPosition`) correctly shifts all three together, but the entry handle drag doesn't.

**Fix:** In `dragPoint`, when the position tool's entry handle is dragged, shift stop and target by the same delta:

```typescript
// In manager.ts, dragPoint method, after setting updated[priceKey]:
if (drag.origin.type === "position" && priceKey === "price") {
  const dPrice = pt.price - drag.origin.price;
  if (updated.stopPrice != null) updated.stopPrice = drag.origin.stopPrice + dPrice;
  if (updated.targetPrice != null) updated.targetPrice = drag.origin.targetPrice + dPrice;
}
```

#### Bug 2: Width handle only changes time2, doesn't move entry line end

Dragging the width handle changes `time2` but the entry line is drawn from `xa` to `xb`. If `time2` moves past `time` (left of the entry anchor), the box flips. This isn't really a bug but could be confusing. TradingView clamps the width so `time2 >= time`.

**Fix (optional):** Clamp in `dragPoint`:
```typescript
if (drag.origin.type === "position" && timeKey === "time2") {
  if (pt.time < drag.origin.time) pt.time = drag.origin.time;  // prevent flip
}
```

#### Bug 3: No handle to drag the risk/reward ratio (changing both stop and target together)

TradingView's position tool lets you drag the target or stop independently, but also has a "risk" handle. OpenCharts lacks this. Not a bug per se, just a missing feature.

### 2.6 Position Tool and Pane Resizing

The position tool renders entirely within pane 0 (the main chart pane). It uses `series.priceToCoordinate()` and `timeToX()` which are pane-aware. When panes resize, the position tool will automatically re-render correctly because the primitive's `updateAll()` recalculates coordinates from the underlying data.

**No issue here.** The position tool works correctly across pane resizes.

---

## 3. Indicator Nametags and Pane Binding

### 3.1 Current Implementation (IndicatorPaneNametags.tsx)

The nametags are HTML overlays positioned absolutely on top of the chart container. They calculate their `top` offset by summing pane heights:

```typescript
const update = () => {
  const panes = chart.panes();
  const positions: Array<{ top: number }> = [];
  for (const meta of paneMeta) {
    let yOff = 0;
    for (let i = 0; i < meta.paneIndex; i++) {
      yOff += panes[i]?.getHeight() ?? 0;
    }
    positions.push({ top: yOff + 4 });
  }
  setPanePositions(positions);
};

update();
const ro = new ResizeObserver(update);
ro.observe(chart.chartElement());
```

### 3.2 What's Broken

The `ResizeObserver` watches `chart.chartElement()` (the outer chart container). It fires when the **container** resizes. It does **NOT** fire when panes are internally resized (user drags a separator), because the container height doesn't change, only the internal pane heights do.

**Result:** When the user drags a pane separator, the nametags stay at their old positions until the container itself resizes.

### 3.3 Fix: Subscribe to Pane Resize Events

There are two approaches:

#### Option A: ResizeObserver on each pane's HTML element (recommended)

```typescript
useEffect(() => {
  const chart = chartRef.current;
  if (!chart) return;

  const update = () => {
    const panes = chart.panes();
    const positions: Array<{ top: number }> = [];
    for (const meta of paneMeta) {
      let yOff = 0;
      for (let i = 0; i < meta.paneIndex; i++) {
        yOff += panes[i]?.getHeight() ?? 0;
      }
      positions.push({ top: yOff + 4 });
    }
    setPanePositions(positions);
  };

  update();

  // Observe each pane's HTML element for internal resizes
  const panes = chart.panes();
  const observers: ResizeObserver[] = [];
  for (const pane of panes) {
    const el = pane.getHTMLElement();
    if (el) {
      const ro = new ResizeObserver(update);
      ro.observe(el);
      observers.push(ro);
    }
  }

  return () => {
    for (const ro of observers) ro.disconnect();
  };
}, [chartRef, paneMeta]);
```

#### Option B: Poll pane heights on a timer

Less efficient, not recommended.

#### Option C: Use timeScale().subscribeSizeChange

```typescript
chart.timeScale().subscribeSizeChange(update);
```

This fires when the time scale changes size, which correlates with pane changes but isn't a direct pane resize event. It may miss some cases (e.g., pane separator drag that doesn't change the time scale).

**Recommendation:** Option A is the most reliable. Each pane has its own DOM element. ResizeObserver on those elements fires when the pane height changes, including when the user drags a separator.

---

## 4. Chart Creation: Pane Options to Add

### 4.1 Enable Pane Resizing with Theme Colors

In the chart creation effect in `ChartPanel.tsx`, add pane separator colors to the layout:

```typescript
const chart = createChart(containerRef.current, {
  layout: {
    background: { type: ColorType.Solid, color: colors.background },
    textColor: colors.text,
    fontFamily: "...",
    fontSize: 11,
    attributionLogo: false,
    panes: {
      enableResize: true,  // default, but explicit
      separatorColor: isDark ? "#2A2E39" : "#D1D4DC",
      separatorHoverColor: isDark
        ? "rgba(180, 200, 240, 0.15)"
        : "rgba(100, 120, 160, 0.15)",
    },
  },
  // ... rest of existing options
});
```

This needs to go in the `createChart` call. Since the chart is recreated when `isDark` changes (it's in the dependency array), the separator colors will update correctly.

### 4.2 Set Stretch Factors for Indicator Panes

When `useIndicators` creates below-panes, it passes `paneIndex` to `chart.addSeries()`. The library auto-creates panes as needed. The default stretch factor is 1 for all panes, meaning equal heights.

To make the main pane larger than indicator panes:

```typescript
// After creating all indicator series, set stretch factors
const panes = chart.panes();
if (panes.length > 1) {
  panes[0].setStretchFactor(3);  // main pane gets 3x the height
  for (let i = 1; i < panes.length; i++) {
    panes[i].setStretchFactor(1);  // each indicator pane gets 1x
  }
}
```

This should be done in `useIndicators` after all series are created, right before `setPaneMeta`.

---

## 5. Position Tool: Recommended Fixes

### 5.1 Fix Entry Handle Drag (move all three prices together)

In `manager.ts`, `dragPoint` method, add after the generic field update:

```typescript
private dragPoint(drag: DragState, pos: Pt, shiftKey: boolean): DrawingLine | null {
  if (drag.hit.region.kind !== "point") return null;
  const pt = this.pointFor(pos, shiftKey, this.dragAnchorPx(drag));
  if (!pt) return null;
  const updated: DrawingLine = { ...drag.origin };
  const { timeKey, priceKey } = drag.hit.region;
  if (timeKey) updated[timeKey] = pt.time;
  if (priceKey) updated[priceKey] = pt.price;

  // Position tool: dragging entry handle moves stop + target together
  if (drag.origin.type === "position" && priceKey === "price") {
    const dPrice = pt.price - drag.origin.price;
    if (drag.origin.stopPrice != null) {
      updated.stopPrice = drag.origin.stopPrice + dPrice;
    }
    if (drag.origin.targetPrice != null) {
      updated.targetPrice = drag.origin.targetPrice + dPrice;
    }
  }

  return updated;
}
```

### 5.2 Fix Width Handle (prevent box flip)

Add clamping in the same `dragPoint` method:

```typescript
// Position tool: prevent time2 from going before time
if (drag.origin.type === "position" && timeKey === "time2") {
  const minTime = drag.origin.time ?? 0;
  if (pt.time < minTime) {
    updated.time2 = minTime;
  }
}
```

### 5.3 Render Enhancement: Show Price Labels on Handles

Currently the position tool draws a readout box with RR, target, stop, and risk. But the individual handles don't show their prices during drag. Add a small price tooltip near the dragged handle:

In `renderPosition`, when `e.state === "selected"` or `"hovered"`, add price labels next to each handle:

```typescript
// After renderPositionHandles, if dragging:
if (e.state === "selected") {
  const prices = [
    { y: y1, label: info.priceFormat(e.d.price) },
    { y: e.yTarget, label: info.priceFormat(e.d.targetPrice) },
    { y: e.yStop, label: info.priceFormat(e.d.stopPrice) },
  ];
  for (const p of prices) {
    if (p.y == null) continue;
    const at = toBitmap(scope, xa - 8, p.y);
    drawSmallLabel(scope, at.x, at.y, p.label, e.d.color);
  }
}
```

---

## 6. Indicator Nametags: Full Fix

### 6.1 Updated IndicatorPaneNametags Component

```tsx
useEffect(() => {
  const chart = chartRef.current;
  if (!chart) return;

  const update = () => {
    const panes = chart.panes();
    const positions: Array<{ top: number }> = [];
    for (const meta of paneMeta) {
      let yOff = 0;
      for (let i = 0; i < meta.paneIndex; i++) {
        yOff += panes[i]?.getHeight() ?? 0;
      }
      positions.push({ top: yOff + 4 });
    }
    setPanePositions(positions);
  };

  update();

  // Observe each pane's HTML element for resize events
  // This catches pane separator drags that don't change the container size
  const roTargets: ResizeObserver[] = [];
  const observePane = (el: HTMLElement | null) => {
    if (!el) return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    roTargets.push(ro);
  };

  // Observe all current panes
  for (const pane of chart.panes()) {
    observePane(pane.getHTMLElement());
  }

  // Also observe the chart element for container resizes
  const chartEl = chart.chartElement();
  const chartRo = new ResizeObserver(update);
  chartRo.observe(chartEl);
  roTargets.push(chartRo);

  // Re-observe panes when pane count changes (indicators added/removed)
  // Use a MutationObserver on the chart element's children
  const mo = new MutationObserver(() => {
    // Pane count changed, re-observe new panes
    for (const ro of roTargets) ro.disconnect();
    roTargets.length = 0;

    for (const pane of chart.panes()) {
      observePane(pane.getHTMLElement());
    }
    const newChartEl = chart.chartElement();
    if (newChartEl) {
      const ro = new ResizeObserver(update);
      ro.observe(newChartEl);
      roTargets.push(ro);
    }
    update();
  });
  mo.observe(chartEl, { childList: true, subtree: true });

  return () => {
    for (const ro of roTargets) ro.disconnect();
    mo.disconnect();
  };
}, [chartRef, paneMeta]);
```

### 6.2 Simpler Alternative: Poll on requestAnimationFrame

If the MutationObserver approach is too complex, a simpler fallback:

```tsx
useEffect(() => {
  const chart = chartRef.current;
  if (!chart) return;

  let raf = 0;
  const update = () => {
    raf = requestAnimationFrame(updatePositions);
  };

  const updatePositions = () => {
    const panes = chart.panes();
    // ... same position calculation
  };

  // Run once to set initial positions
  updatePositions();

  // Listen for pane size changes via ResizeObserver on pane elements
  const ro = new ResizeObserver(() => update());
  for (const pane of chart.panes()) {
    const el = pane.getHTMLElement();
    if (el) ro.observe(el);
  }
  ro.observe(chart.chartElement());

  return () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
  };
}, [chartRef, paneMeta]);
```

---

## 7. Summary of Changes Needed

### Priority 1: Fix pane separator colors (trivial)

**File:** `ChartPanel.tsx`, chart creation effect (~line 450)
**Change:** Add `panes` to `layout` in `createChart` options.
**Risk:** None. Just colors the separator.

### Priority 2: Fix indicator nametag pane tracking (medium)

**File:** `IndicatorPaneNametags.tsx`
**Change:** Replace single `ResizeObserver` on chart element with `ResizeObserver` on each pane's HTML element.
**Risk:** Low. Need to re-observe when pane count changes (indicator add/remove).

### Priority 3: Fix position tool entry handle drag (medium)

**File:** `manager.ts`, `dragPoint` method
**Change:** When dragging the entry price handle on a position tool, shift stop and target prices by the same delta.
**Risk:** Low. Body drag already does this correctly, so the behavior is consistent.

### Priority 4: Set stretch factors for pane proportions (low)

**File:** `useIndicators.ts`, after series creation
**Change:** Set main pane stretch factor to 3, indicator panes to 1.
**Risk:** None. Better default proportions.

### Priority 5: Position tool width handle clamp (low)

**File:** `manager.ts`, `dragPoint` method
**Change:** Clamp `time2` so it can't go before `time`.
**Risk:** None. Prevents visual confusion.

---

## 8. API Reference Summary

### IPaneApi (v5.0)

| Method | Returns | Description |
|--------|---------|-------------|
| `getHeight()` | `number` | Pane height in pixels |
| `setHeight(px)` | `void` | Set absolute height |
| `moveTo(index)` | `void` | Reorder pane |
| `paneIndex()` | `number` | Current pane index |
| `getSeries()` | `ISeriesApi[]` | Series in this pane |
| `getHTMLElement()` | `HTMLElement \| null` | DOM element |
| `attachPrimitive(p)` | `void` | Attach pane primitive |
| `detachPrimitive(p)` | `void` | Detach pane primitive |
| `priceScale(id)` | `IPriceScaleApi` | Price scale in this pane |
| `setPreserveEmptyPane(b)` | `void` | Keep pane when empty |
| `preserveEmptyPane()` | `boolean` | Check if preserved |
| `getStretchFactor()` | `number` | Relative size weight |
| `setStretchFactor(n)` | `void` | Set relative size weight |
| `addSeries(def, opts?)` | `ISeriesApi` | Add series to this pane |

### IChartApi Pane Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `panes()` | `IPaneApi[]` | All panes |
| `addPane(preserve?)` | `IPaneApi` | Add new pane |
| `removePane(index)` | `void` | Remove pane |
| `swapPanes(a, b)` | `void` | Swap two panes |
| `paneSize(index?)` | `PaneSize` | `{ width, height }` |
| `priceScale(id, paneIndex?)` | `IPriceScaleApi` | Price scale in pane |

### LayoutPanesOptions

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enableResize` | `boolean` | `true` | Drag-to-resize between panes |
| `separatorColor` | `string` | `'#2B2B43'` | Separator line color |
| `separatorHoverColor` | `string` | `'rgba(178, 181, 189, 0.2)'` | Separator hover color |

### ISeriesApi Pane Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `moveToPane(index)` | `void` | Move series to a different pane |

---

## 9. No Pane State Change Event

There is no `subscribePaneResize` or `subscribePaneChange` event in v5. The only ways to detect pane changes:

1. `ResizeObserver` on `pane.getHTMLElement()` - fires when pane DOM element resizes
2. Polling `pane.getHeight()` on a timer
3. `chart.timeScale().subscribeSizeChange()` - fires on time scale size changes (indirect)

**Recommendation:** Use ResizeObserver on pane HTML elements. It's the most reliable and performant.