// Annotation renderer — renders annotations on the chart using lightweight-charts v5
import {
  type IChartApi,
  type ISeriesApi,
  type IPriceLine,
  type ISeriesPrimitive,
  LineSeries,
  LineStyle,
  type Time,
} from "lightweight-charts";
import type { Annotation } from "./types";

// Track rendered annotation objects so we can clean them up
interface RenderedItem {
  id: string;
  priceLines: IPriceLine[];
  series: ISeriesApi<"Line">[];
  primitives: ISeriesPrimitive<Time>[];
}

export class AnnotationRenderer {
  private chart: IChartApi;
  private candleSeries: ISeriesApi<"Candlestick">;
  private rendered: Map<string, RenderedItem> = new Map();

  constructor(chart: IChartApi, candleSeries: ISeriesApi<"Candlestick">) {
    this.chart = chart;
    this.candleSeries = candleSeries;
  }

  /** Render a single annotation */
  render(ann: Annotation): void {
    // Remove existing render of this annotation first
    this.remove(ann.id);

    if (!ann.visible) return;

    try {
      switch (ann.kind) {
        case "horizontalLine":
          this.renderHorizontalLine(ann);
          break;
        case "horizontalRay":
          this.renderHorizontalRay(ann);
          break;
        case "trendLine":
          this.renderTrendLine(ann);
          break;
        case "rectangle":
          this.renderRectangle(ann);
          break;
        case "textLabel":
          this.renderTextLabel(ann);
          break;
        case "verticalLine":
          this.renderVerticalLine(ann);
          break;
        case "band":
          this.renderBand(ann);
          break;
        case "marker":
          this.renderMarker(ann);
          break;
      }
    } catch (err) {
      console.warn(`[annotations] Failed to render ${ann.kind} (${ann.id}):`, err);
    }
  }

  /** Remove a rendered annotation by id */
  remove(id: string): void {
    const item = this.rendered.get(id);
    if (!item) return;

    for (const pl of item.priceLines) {
      try { this.candleSeries.removePriceLine(pl); } catch { /* already removed */ }
    }
    for (const s of item.series) {
      try { this.chart.removeSeries(s); } catch { /* already removed */ }
    }
    for (const p of item.primitives) {
      try { this.candleSeries.detachPrimitive(p); } catch { /* already removed */ }
    }
    this.rendered.delete(id);
  }

  /** Remove all rendered annotations */
  clear(): void {
    for (const id of this.rendered.keys()) {
      this.remove(id);
    }
  }

  /** Re-render all annotations from a list */
  sync(annotations: Annotation[]): void {
    const activeIds = new Set(annotations.map((a) => a.id));

    // Remove annotations that are no longer present
    for (const id of this.rendered.keys()) {
      if (!activeIds.has(id)) this.remove(id);
    }

    // Render/update all current annotations
    for (const ann of annotations) {
      this.render(ann);
    }
  }

  /** Update the chart/series references (e.g. after chart recreation) */
  updateRefs(chart: IChartApi, candleSeries: ISeriesApi<"Candlestick">): void {
    this.clear();
    this.chart = chart;
    this.candleSeries = candleSeries;
  }

  private makeItem(id: string): RenderedItem {
    const item: RenderedItem = { id, priceLines: [], series: [], primitives: [] };
    this.rendered.set(id, item);
    return item;
  }

  private renderHorizontalLine(ann: Annotation): void {
    if (ann.price == null) return;
    const item = this.makeItem(ann.id);
    const line = this.candleSeries.createPriceLine({
      price: ann.price,
      color: ann.color,
      lineWidth: ann.lineWidth as 1 | 2 | 3 | 4,
      lineStyle: ann.lineStyle as LineStyle,
      axisLabelVisible: true,
      title: ann.title ?? "",
    });
    item.priceLines.push(line);
  }

  private renderHorizontalRay(ann: Annotation): void {
    if (ann.price == null) return;
    // For now, render as a full-width price line. A true ray (starting from a time)
    // would need a line series with a gap before the start time.
    const item = this.makeItem(ann.id);
    const line = this.candleSeries.createPriceLine({
      price: ann.price,
      color: ann.color,
      lineWidth: ann.lineWidth as 1 | 2 | 3 | 4,
      lineStyle: ann.lineStyle as LineStyle,
      axisLabelVisible: true,
      title: ann.title ?? "",
    });
    item.priceLines.push(line);
  }

  private renderTrendLine(ann: Annotation): void {
    if (ann.time1 == null || ann.price1 == null || ann.time2 == null || ann.price2 == null) return;
    const item = this.makeItem(ann.id);
    const series = this.chart.addSeries(LineSeries, {
      color: ann.color,
      lineWidth: ann.lineWidth as 1 | 2 | 3 | 4,
      lineStyle: ann.lineStyle as LineStyle,
      crosshairMarkerVisible: false,
      lastValueVisible: false,
      priceLineVisible: false,
    });
    series.setData([
      { time: ann.time1 as Time, value: ann.price1 },
      { time: ann.time2 as Time, value: ann.price2 },
    ]);
    item.series.push(series);
  }

  private renderRectangle(ann: Annotation): void {
    if (ann.time1 == null || ann.price1 == null || ann.time2 == null || ann.price2 == null) return;
    const item = this.makeItem(ann.id);
    // Top and bottom price lines
    const top = this.candleSeries.createPriceLine({
      price: Math.max(ann.price1, ann.price2),
      color: ann.color,
      lineWidth: ann.lineWidth as 1 | 2 | 3 | 4,
      lineStyle: ann.lineStyle as LineStyle,
      axisLabelVisible: false,
      title: ann.title ?? "",
    });
    const bottom = this.candleSeries.createPriceLine({
      price: Math.min(ann.price1, ann.price2),
      color: ann.color,
      lineWidth: ann.lineWidth as 1 | 2 | 3 | 4,
      lineStyle: ann.lineStyle as LineStyle,
      axisLabelVisible: false,
      title: "",
    });
    item.priceLines.push(top, bottom);
    // Left and right vertical lines via line series
    const leftSeries = this.chart.addSeries(LineSeries, {
      color: ann.color,
      lineWidth: ann.lineWidth as 1 | 2 | 3 | 4,
      lineStyle: ann.lineStyle as LineStyle,
      crosshairMarkerVisible: false,
      lastValueVisible: false,
      priceLineVisible: false,
    });
    const rightSeries = this.chart.addSeries(LineSeries, {
      color: ann.color,
      lineWidth: ann.lineWidth as 1 | 2 | 3 | 4,
      lineStyle: ann.lineStyle as LineStyle,
      crosshairMarkerVisible: false,
      lastValueVisible: false,
      priceLineVisible: false,
    });
    const pHigh = Math.max(ann.price1, ann.price2);
    const pLow = Math.min(ann.price1, ann.price2);
    // Need to extend the vertical lines beyond the rectangle for the full chart height
    // Use a wide price range so the lines are visible
    const range = pHigh - pLow;
    const extHigh = pHigh + range * 0.01;
    const extLow = pLow - range * 0.01;
    
    const t1 = Math.min(ann.time1, ann.time2) as Time;
    const t2 = Math.max(ann.time1, ann.time2) as Time;
    
    leftSeries.setData([
      { time: t1, value: pLow },
      { time: t1, value: pHigh },
    ]);
    rightSeries.setData([
      { time: t2, value: pLow },
      { time: t2, value: pHigh },
    ]);
    item.series.push(leftSeries, rightSeries);
  }

  private renderTextLabel(ann: Annotation): void {
    if (ann.price == null || ann.text == null) return;
    const item = this.makeItem(ann.id);
    // Use a price line with the text as the title for the axis label
    const line = this.candleSeries.createPriceLine({
      price: ann.price,
      color: "transparent",
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: ann.text,
    });
    item.priceLines.push(line);
  }

  private renderVerticalLine(ann: Annotation): void {
    if (ann.time == null) return;
    const item = this.makeItem(ann.id);
    
    // Get visible price range to make the line span the chart
    const candleData = this.candleSeries.data();
    if (candleData.length === 0) return;
    
    // Find the price range in the visible area
    let pHigh = -Infinity;
    let pLow = Infinity;
    for (const c of candleData) {
      const h = (c as any).high ?? (c as any).value ?? 0;
      const l = (c as any).low ?? (c as any).value ?? 0;
      if (h > pHigh) pHigh = h;
      if (l < pLow) pLow = l;
    }
    if (pHigh === -Infinity || pLow === Infinity) return;
    const range = pHigh - pLow;
    const extHigh = pHigh + range * 0.1;
    const extLow = pLow - range * 0.1;
    
    const series = this.chart.addSeries(LineSeries, {
      color: ann.color,
      lineWidth: ann.lineWidth as 1 | 2 | 3 | 4,
      lineStyle: ann.lineStyle as LineStyle,
      crosshairMarkerVisible: false,
      lastValueVisible: false,
      priceLineVisible: false,
    });
    series.setData([
      { time: ann.time as Time, value: extLow },
      { time: ann.time as Time, value: extHigh },
    ]);
    item.series.push(series);
  }

  private renderBand(ann: Annotation): void {
    if (ann.price1 == null || ann.price2 == null) return;
    const item = this.makeItem(ann.id);
    const top = this.candleSeries.createPriceLine({
      price: Math.max(ann.price1, ann.price2),
      color: ann.color,
      lineWidth: ann.lineWidth as 1 | 2 | 3 | 4,
      lineStyle: ann.lineStyle as LineStyle,
      axisLabelVisible: true,
      title: ann.title ?? "",
    });
    const bottom = this.candleSeries.createPriceLine({
      price: Math.min(ann.price1, ann.price2),
      color: ann.color,
      lineWidth: ann.lineWidth as 1 | 2 | 3 | 4,
      lineStyle: ann.lineStyle as LineStyle,
      axisLabelVisible: true,
      title: "",
    });
    item.priceLines.push(top, bottom);
  }

  private renderMarker(ann: Annotation): void {
    if (ann.time == null || ann.price == null) return;
    const item = this.makeItem(ann.id);
    const line = this.candleSeries.createPriceLine({
      price: ann.price,
      color: ann.color,
      lineWidth: 1,
      lineStyle: LineStyle.Dotted,
      axisLabelVisible: true,
      title: ann.text ?? ann.title ?? "",
    });
    item.priceLines.push(line);
  }
}