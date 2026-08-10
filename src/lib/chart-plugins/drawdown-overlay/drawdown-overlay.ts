// Drawdown overlay plugin for lightweight-charts
// Renders drawdown as a red area series on a separate pane or overlaid on the main chart

import {
  type IChartApi,
  type ISeriesApi,
  type LineData,
  type Time,
  AreaSeries,
} from "lightweight-charts";
import type { DrawdownPoint } from "../../drawdown.ts";

export class DrawdownOverlay {
  private chart: IChartApi;
  private series: ISeriesApi<"Area"> | null = null;

  constructor(chart: IChartApi) {
    this.chart = chart;
  }

  setData(data: DrawdownPoint[]) {
    if (data.length === 0) {
      this.remove();
      return;
    }

    if (!this.series) {
      this.series = this.chart.addSeries(AreaSeries, {
        topColor: "rgba(239, 68, 68, 0.4)",
        bottomColor: "rgba(239, 68, 68, 0.02)",
        lineColor: "rgba(239, 68, 68, 0.8)",
        lineStyle: 0,
        lineWidth: 1,
        priceScaleId: "drawdown",
        visible: true,
      });

      // Configure the drawdown scale on the left side
      this.chart.priceScale("drawdown").applyOptions({
        scaleMargins: { top: 0.7, bottom: 0 },
        visible: false,
      });
    }

    const lineData: LineData<Time>[] = data.map((p) => ({
      time: p.time as Time,
      value: p.drawdown,
    }));

    this.series.setData(lineData);
  }

  remove() {
    if (this.series) {
      this.chart.removeSeries(this.series);
      this.series = null;
    }
  }

  setVisible(visible: boolean) {
    if (this.series) {
      this.series.applyOptions({ visible });
    }
  }
}