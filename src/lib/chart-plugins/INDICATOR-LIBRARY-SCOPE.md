# Indicator Library Integration

## Status: COMPLETE (Phase 1-3)

All 10 existing indicators have been swapped to use `lightweight-charts-indicators` (deepentropy, MIT licensed, 446 indicators, built for lightweight-charts v5).

## What Shipped

### Adapter Layer (`src/lib/indicator-adapter.ts`)
Generic bridge between the library's `inputConfig`/`plotConfig`/`calculate()` API and our UI types. Maps library params to our settings dialog, library plots to chart series.

### Indicators Swapped (all `useLib: true`)
1. **RSI** - Source selector, Smoothing MA (SMA/EMA/RMA/WMA/VWMA/Bollinger), MA Length, BB StdDev, configurable upper/lower reference lines
2. **MACD** - Fast/Slow/Signal lengths, Source selector
3. **SMA** - Length, Source, Offset, Smoothing MA + Bollinger Bands
4. **EMA** - Length, Source, Offset, Smoothing MA + Bollinger Bands
5. **Bollinger Bands** - Length, Basis MA Type (SMA/EMA/RMA/WMA/VWMA), Source, StdDev, Offset
6. **ATR** - Length, Smoothing (RMA/SMA/EMA/WMA)
7. **Stochastic** - %K Length, %K Smoothing, %D Smoothing
8. **VWAP** - Anchor Period (1D/1W/1M), Source, Show Bands toggle, Band Multiplier
9. **Supertrend** (NEW) - ATR Length, Factor
10. **OBV** (NEW) - Smoothing MA + Bollinger Bands

### New Indicators Added
- **Supertrend** - Trend category, overlay, ATR-based trend following
- **OBV (On Balance Volume)** - Volume category, below pane, with optional smoothing MA

### Settings Dialog Upgrades
Both `IndicatorDialog.tsx` and `IndicatorSettingsDialog.tsx` now support:
- `number` - slider control (existing)
- `select` - dropdown for enum options (MA type, smoothing, anchor period)
- `source` - dropdown for price source (close, open, high, low, hl2, hlc3, ohlc4)
- `bool` - toggle switch

### Command Palette
`CATEGORY_ORDER` updated to include "Trend" category for Supertrend.

## Architecture

```
INDICATOR_REGISTRY (indicators.ts)
  └── per indicator: useLib: true, defaultParams, LIB_KEY mapping
       └── useIndicators.ts: addLibIndicator(type, paneIndex)
            └── getLibInd(type) → library indicator object
            └── buildLibInputs(type, libInd) → inputs from our params
            └── libInd.calculate(bars, inputs) → plot results
            └── for each visible plot: chart.addSeries(LineSeries, ...)
            └── hlines (reference lines) if provided
            └── RSI special case: configurable upper/lower from our params
```

Adding a new indicator from the library's 446:
1. Add to `IndicatorType` union
2. Add to `LIB_KEY` mapping
3. Add to `INDICATOR_REGISTRY` with `useLib: true`
4. Add to `getParamDescriptors` with the library's inputConfig params
5. Add category to `CATEGORY_ORDER` if new category
6. Done. The adapter handles the rest.

## Remaining Work

### Candlestick Patterns (Phase 4)
44 pattern detectors in the library. These return markers instead of line data. Would need:
- New "Patterns" category in the palette
- Toggle UI (checkbox list rather than add/remove)
- Marker rendering via `series.setMarkers()` instead of line series
- Pattern stacking on same bar

Estimated effort: 1-2h (adapter already built, just marker rendering instead of line series)

### Dead Code Cleanup
The hand-rolled indicator functions (`sma`, `ema`, `rsi`, `macd`, `bollingerBands`, `atr`, `stochastic`, `vwap`) in `indicators.ts` are now dead code. Not imported anywhere. Can be removed in a cleanup pass.

### Bundle Size
446 indicators are installed. Need to verify tree-shaking is working and we're not shipping all 446 in the bundle. Currently importing via `import * as IndLib` which might prevent tree-shaking. Could switch to named imports per indicator if bundle size is an issue.