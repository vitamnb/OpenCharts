# Indicator Pane Resize

**Date:** 2026-07-30
**Status:** Shipped
**Author:** Roger (subagent)

## Problem

Indicator pane heights (RSI, Stoch, MACD, etc.) were not user-resizable. The
chart was created with `layout.panes.enableResize: true`, so lightweight-charts
showed its built-in `row-resize` cursor when the pointer crossed a pane
boundary — but two things made the affordance useless in practice:

1. **Hit area was 9px and invisible.** The native separator is a 1px line
   with a 9px hit strip and no visual chrome. Easy to miss, especially on
   busy charts.
2. **`useIndicators` reset stretch factors on every effect run.** The hook
   re-ran on every `chartData` change (every live tick), every theme toggle,
   every indicator param tweak, and every visibility toggle. Each run called
   `setStretchFactor(3)` on the main pane and `setStretchFactor(1)` on the
   indicator panes, wiping any user-driven drag from the previous frame.
   Even when the native drag *did* work, the next live tick erased it.

## Solution

Two-pronged fix:

1. **Disable the native lightweight-charts drag** (`layout.panes.enableResize:
   false`) and render a **custom visible drag handle** between each pair of
   panes, full chart width, with a `cursor-row-resize` over a 12px-tall hit
   strip and a small grab bar that lights up on hover/active.
2. **Stop wiping user resizes** in `useIndicators`: only set default stretch
   factors on first paint and on pane-count changes (an indicator was just
   added/removed). Live ticks, theme toggles, and param changes preserve
   whatever the user has dragged.

## Files

| File | Change |
|------|--------|
| `src/pages/trading/ChartPanel.tsx` | Set `layout.panes.enableResize: false`. Render `<PaneResizeOverlay />` over the chart container. |
| `src/pages/trading/useIndicators.ts` | Track last pane count in a ref. Only call `setStretchFactor` on first paint (`lastPaneCountRef === 0`) or when a new pane was just added (`panes.length > last`). Skip on every re-render. |
| `src/pages/trading/PaneResizeHandle.tsx` (new) | Single drag handle between two panes. Pointer events drive `pane.setHeight()` with min-height clamping (100px main, 50px indicator). |
| `src/pages/trading/PaneResizeOverlay.tsx` (new) | Renders one `PaneResizeHandle` per pane boundary. Tracks pane count via `MutationObserver` on the chart element so handles appear/disappear as indicators toggle. |

## Drag Math

- The handle sits at the **top edge** of pane `i` (or the top of the chart
  for handle 0). Vertical position is computed by summing
  `panes[i-1].getHeight()` for each pane above the boundary.
- On drag: `deltaY = e.clientY - startY`. New heights are
  `startAbove + deltaY` and `startBelow - deltaY`.
- Min heights:
  - Pane 0 (main chart): 100px
  - Pane 1..n-1 (indicator): 50px
  - Pane n-1 (bottom, if it's the main chart after a swap): 100px
- If clamping one side ate the whole delta, the unused clamp allowance is
  transferred to the other side so the **total chart height stays put**
  when the user drags hard into a minimum.
- Heights are re-applied on every move via `paneAbove.setHeight(finalAbove)`
  and `paneBelow.setHeight(finalBelow)`. lightweight-charts then
  proportionally scales the other panes (via internal stretch factors)
  to keep the total fixed, which is exactly the behavior we want.

## Persistence

The new handles do **not** persist user heights across page reloads.
`useIndicators` only sets default stretch factors on first paint, but a
page reload creates a fresh chart with the same defaults. Persistence is
out of scope for this change — the original task asked for the resize to
work, not to be remembered. If persistence is needed later, store
`panes[i].getStretchFactor()` snapshots in localStorage and reapply on
chart creation.

## Known Conflicts

`useIndicatorPaneZoom` (price-scale drag-to-zoom) listens in the capture
phase on the chart container. The 12px-tall resize handle is **full chart
width**, so the right 80px × 12px overlap zone could in theory trigger
both a zoom drag and a resize drag. In practice:

- `setPointerCapture` on the handle wins the move events.
- The zoom hook's `mousedown` handler also fires in that overlap, but its
  move handler is bound to `mousemove` on the container, which our handle
  doesn't dispatch (we use pointer events on the captured element).
- If the user reports confusion in that corner, the fix is to have the
  zoom hook skip when the target is a `role="separator"` element.

## Verification

```
$ npx tsc --noEmit
```

Output: **0 new errors** introduced by this change. The two pre-existing
TypeScript errors in `useIndicators.ts` (`panes[i]` possibly undefined under
`noUncheckedIndexedAccess`) were fixed as a side effect of the refactor
that already needed `paneAbove`/`paneBelow` non-null assertions in the
drag handler.

## Out of Scope

- Persisting pane heights across reloads.
- Animated transition when an indicator is added/removed (the chart already
  does its own thing here).
- A "reset to default" UI button.
