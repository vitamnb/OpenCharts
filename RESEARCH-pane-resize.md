# Pane Resize API Research — lightweight-charts v5.2.0

Date: 2026-07-16
Source: `node_modules/lightweight-charts/dist/typings.d.ts` (5037 lines), `ChartPanel.tsx`, `useIndicators.ts`

## 1. Layout Options for Panes — `enableResize` flag

The pane resize configuration lives under `layout.panes` in the chart options:

```typescript
export interface LayoutPanesOptions {
    /** Enable panes resizing. @defaultValue `true` */
    enableResize: boolean;
    /** Color of pane separator. @defaultValue `#2B2B43` */
    separatorColor: string;
    /** Color of pane separator background applied on hover. @defaultValue `rgba(178, 181, 189, 0.2)` */
    separatorHoverColor: string;
}
```

**Default values:**
- `enableResize`: `true` (panes are resizable by default)
- `separatorColor`: `#2B2B43`
- `separatorHoverColor`: `rgba(178, 181, 189, 0.2)`

The full default block from the type defs:
```
@defaultValue `{ enableResize: true, separatorColor: '#2B2B43', separatorHoverColor: 'rgba(178, 181, 189, 0.2)'}`
```

**Key finding:** `enableResize: true` is the default. Pane separators are draggable out of the box. You do not need to explicitly set it unless you want to disable resizing.

## 2. IPaneApi Methods for Sizing

The `IPaneApi<HorzScaleItem>` interface provides two methods for controlling pane size:

### setHeight(height: number): void
Sets the pane height in absolute pixels. This is a one-shot absolute resize.

```typescript
const pane = chart.panes()[1];
pane.setHeight(200); // pane 1 is now 200px tall
```

### getStretchFactor(): number / setStretchFactor(stretchFactor: number): void
Stretch factor determines relative pane height proportions. Default is 1 for all panes.

```typescript
// Example from the type definitions:
const pane1 = chart.addPane();
const pane2 = chart.addPane();
const pane3 = chart.addPane();
pane1.setStretchFactor(0.2); // 20% of total height
pane2.setStretchFactor(0.3); // 30% of total height
pane3.setStretchFactor(0.5); // 50% of total height
```

**Important note from the docs:** "if you have one pane with default stretch factor of 1 and set other pane's stretch factor to 50, library will try to make second pane 50 times smaller than the first pane." The stretch factors are relative ratios, not percentages.

### getHeight(): number
Returns the current pane height in pixels (read-only query).

### Other pane methods (not sizing-related):
- `moveTo(paneIndex)` — reorders pane position
- `paneIndex()` — returns current index
- `getSeries()` — series attached to this pane
- `getHTMLElement()` — DOM element
- `attachPrimitive()` / `detachPrimitive()` — pane-level primitives
- `priceScale(id)` — price scale within this pane
- `setPreserveEmptyPane(bool)` / `preserveEmptyPane()` — keep empty panes

### IChartApi pane management:
- `addPane(preserveEmptyPane?)` — add a new pane, returns IPaneApi
- `panes()` — returns array of all IPaneApi
- `removePane(index)` — remove pane by index
- `swapPanes(first, second)` — swap two panes
- `paneSize(paneIndex?)` — returns `{ width, height }` in pixels

## 3. Price Scale Resize vs Pane Separator Resize — Two Different Things

These are completely separate mechanisms:

### Price Scale Resize (right side drag — makes candles taller/shorter)
Controlled by `handleScale.axisPressedMouseMove.price`:

```typescript
export interface AxisPressedMouseMoveOptions {
    time: boolean;   // @defaultValue true — drag on time axis scales horizontally
    price: boolean;  // @defaultValue true — drag on price axis scales vertically
}
```

This lets the user drag the price axis (right edge) to manually set the visible price range. Double-click resets via `handleScale.axisDoubleClickReset.price`.

The price scale also has `scaleMargins` (`{ top: number, bottom: number }` in 0..1 range) which control what portion of the pane height is used for the price data vs padding. And `autoScale: boolean` toggles automatic scaling.

**This has nothing to do with pane separators.** It scales the price *within* a pane, not the pane height *between* panes.

### Pane Separator Resize (between indicator panes — makes panes taller/shorter)
Controlled by `layout.panes.enableResize`. When true (default), the horizontal separator lines between panes are draggable. The user grabs the separator between pane 0 (candles) and pane 1 (indicator) and drags up/down to resize.

This adjusts the stretch factors internally. The `setHeight()` and `setStretchFactor()` methods on IPaneApi are the programmatic equivalents.

**Summary of the distinction:**

| Mechanism | Config Path | What It Does | Default |
|-----------|------------|--------------|---------|
| Price scale drag | `handleScale.axisPressedMouseMove.price` | Scales price *within* a pane (zoom vertically) | `true` |
| Price scale double-click reset | `handleScale.axisDoubleClickReset.price` | Resets price scale to auto | `true` |
| Pane separator drag | `layout.panes.enableResize` | Resizes pane *heights* (between panes) | `true` |
| Pane programmatic | `pane.setHeight(px)` | Sets absolute pane height | n/a |
| Pane programmatic | `pane.setStretchFactor(n)` | Sets relative pane proportion | 1 |

## 4. Exact Config for Draggable Pane Separators

The current ChartPanel.tsx already has the correct config:

```typescript
const chart = createChart(containerRef.current, {
    layout: {
        background: { type: ColorType.Solid, color: colors.background },
        textColor: colors.text,
        fontFamily: "'JetBrains Mono', 'SF Mono', 'Fira Code', 'Cascadia Code', monospace",
        fontSize: 11,
        attributionLogo: false,
        panes: {
            enableResize: true,  // <-- this is the key flag (default: true)
            separatorColor: isDark ? "#2A2E39" : "#D1D4DC",
            separatorHoverColor: isDark
                ? "rgba(180, 200, 240, 0.15)"
                : "rgba(100, 120, 160, 0.15)",
        },
    },
    // ... other options
});
```

**That's all that's needed.** The `enableResize: true` flag makes the separators between panes draggable. The `separatorColor` and `separatorHoverColor` are visual styling for the separator line.

No additional config is required. The library handles:
- Mouse hit-testing on the separator
- Drag cursor
- Resizing pane heights
- Updating stretch factors

## 5. Examples and Comments in Type Definitions

### Stretch factor example (from IPaneApi.setStretchFactor docs):
```typescript
const pane1 = chart.addPane();
const pane2 = chart.addPane();
const pane3 = chart.addPane();
pane1.setStretchFactor(0.2);
pane2.setStretchFactor(0.3);
pane3.setStretchFactor(0.5);
// First pane: 20% height, second: 30%, third: 50%
```

### Default panes config (from LayoutOptions.panes docs):
```typescript
// @defaultValue `{ enableResize: true, separatorColor: '#2B2B43', separatorHoverColor: 'rgba(178, 181, 189, 0.2)'}`
```

### addDefaultPane option:
```typescript
// Whether to add a default pane to the chart
// Disable this option when you want to create a chart with no panes and add them manually
// @defaultValue true
addDefaultPane: boolean;
```

### No explicit comments about resize behavior quirks
The type definitions do not mention any special behavior, gotchas, or limitations around pane resizing beyond the stretch factor ratio note. There are no comments about minimum pane heights, maximum pane heights, or animation behavior.

## 6. Current ChartPanel.tsx State

The chart is created with pane resize **already enabled**:

- `layout.panes.enableResize: true` — separators are draggable
- `layout.panes.separatorColor` — themed (dark/light)
- `layout.panes.separatorHoverColor` — themed (dark/light)

The `useIndicators` hook sets stretch factors after indicator panes are created:
```typescript
// Set stretch factors: main pane 3x, indicator panes 1x each
const panes = chart.panes();
if (panes.length > 1) {
    panes[0].setStretchFactor(3);
    for (let i = 1; i < panes.length; i++) {
        panes[i].setStretchFactor(1);
    }
}
```

This gives the main chart pane 3x the height of each indicator pane. The user can then drag separators to override these proportions interactively.

### Potential issue: stretch factors reset on indicator changes
The `useIndicators` effect runs on `activeIndicators` / `chartData` / `isDark` / `indicatorParams` / `indicatorAppearance` changes. Each time it runs, it calls `setStretchFactor(3)` on pane 0 and `setStretchFactor(1)` on indicator panes. This means:

**If the user manually drags a pane separator to resize panes, then changes an indicator setting, their manual resize is overridden.** The stretch factors are reset to 3:1:1... every time the indicator effect re-runs.

This is a known pattern in lightweight-charts v5 — there is no built-in "user resize persistence" API. To preserve user drags, you would need to:
1. Track stretch factors in React state
2. Listen for pane resize events (if available — no dedicated event exists in the type definitions)
3. Only apply default stretch factors when panes are first created, not on every indicator update

## 7. No Pane Resize Event

There is no `subscribePaneResize` or similar event in `IChartApi` or `IPaneApi`. The type definitions show no callback mechanism for pane resize events. This means:

- You cannot detect when a user has manually dragged a separator
- You cannot persist user pane heights without polling `pane.getHeight()` on an interval
- The only way to know pane heights is to query `getHeight()` or `paneSize()` on demand

## Summary

| Question | Answer |
|----------|--------|
| Is there an `enableResize` flag? | Yes, `layout.panes.enableResize`, default `true` |
| Default values? | `enableResize: true`, `separatorColor: #2B2B43`, `separatorHoverColor: rgba(178,181,189,0.2)` |
| IPaneApi sizing methods? | `setHeight(px)`, `setStretchFactor(n)`, `getHeight()`, `getStretchFactor()` |
| Price scale resize vs pane separator? | Different mechanisms. Price scale: `handleScale.axisPressedMouseMove.price`. Pane separator: `layout.panes.enableResize`. |
| Exact config for draggable separators? | `layout.panes.enableResize: true` (already set in ChartPanel.tsx) |
| Examples in type defs? | Stretch factor ratio example in `setStretchFactor` docs |
| Pane resize event? | None exists. No way to detect user drags programmatically. |
| Current ChartPanel.tsx state? | Already correctly configured. Stretch factors set to 3:1 in useIndicators. |