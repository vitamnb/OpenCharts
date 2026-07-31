import type { IChartApi, ISeriesApi, Time } from "lightweight-charts";

export interface BacktestShadingOptions {
  data: Array<{
    startTime: Time;
    endTime: Time;
    isWin: boolean;
    tradeId: string;
  }>;
}

/**
 * Backtest hold-period shading.
 * Renders semi-transparent rectangles behind the candlesticks
 * for each trade's hold period. Green for wins, red for losses.
 *
 * Uses canvas overlay rendered on the chart's main pane.
 */
export class BacktestShadingPlugin {
  private _chart: IChartApi | null = null;
  private _series: ISeriesApi<any> | null = null;
  private _data: BacktestShadingOptions["data"] = [];
  private _canvas: HTMLCanvasElement | null = null;
  private _ctx: CanvasRenderingContext2D | null = null;
  private _container: HTMLElement | null = null;

  constructor(options: BacktestShadingOptions) {
    this._data = options.data;
  }

  attach(chart: IChartApi, series: ISeriesApi<any>): void {
    this._chart = chart;
    this._series = series;
    this._container = (chart as any)._chartElement as HTMLElement;

    if (!this._container) return;

    // Create overlay canvas
    this._canvas = document.createElement("canvas");
    this._canvas.style.position = "absolute";
    this._canvas.style.top = "0";
    this._canvas.style.left = "0";
    this._canvas.style.width = "100%";
    this._canvas.style.height = "100%";
    this._canvas.style.pointerEvents = "none";
    this._canvas.style.zIndex = "0";
    this._container.insertBefore(this._canvas, this._container.firstChild);
    this._ctx = this._canvas.getContext("2d");

    this._resizeCanvas();
    this._draw();

    // Redraw on chart changes
    chart.timeScale().subscribeVisibleLogicalRangeChange(() => this._draw());
    chart.subscribeCrosshairMove(() => this._draw());
  }

  detach(): void {
    if (this._canvas && this._container) {
      this._container.removeChild(this._canvas);
    }
    this._canvas = null;
    this._ctx = null;
    this._chart = null;
    this._series = null;
    this._container = null;
  }

  updateData(data: BacktestShadingOptions["data"]): void {
    this._data = data;
    this._draw();
  }

  private _resizeCanvas(): void {
    if (!this._canvas || !this._container) return;
    const dpr = window.devicePixelRatio || 1;
    const w = this._container.clientWidth;
    const h = this._container.clientHeight;
    this._canvas.width = w * dpr;
    this._canvas.height = h * dpr;
    this._canvas.style.width = w + "px";
    this._canvas.style.height = h + "px";
    this._ctx?.scale(dpr, dpr);
  }

  private _draw(): void {
    if (!this._ctx || !this._chart || !this._series || !this._canvas) return;

    this._resizeCanvas();
    const ctx = this._ctx;
    const w = this._canvas.clientWidth;
    const h = this._canvas.clientHeight;

    ctx.clearRect(0, 0, w, h);

    if (!this._data || this._data.length === 0) return;

    const timeScale = this._chart.timeScale();

    for (const item of this._data) {
      const x1 = timeScale.timeToCoordinate(item.startTime);
      const x2 = timeScale.timeToCoordinate(item.endTime);

      if (x1 == null || x2 == null) continue;

      const x = Math.min(x1, x2);
      const width = Math.abs(x2 - x1);
      if (width < 1) continue;

      const color = item.isWin
        ? "rgba(34, 197, 94, 0.08)"
        : "rgba(239, 68, 68, 0.08)";

      ctx.fillStyle = color;
      ctx.fillRect(x, 0, width, h);

      // Draw border lines at entry and exit
      const borderColor = item.isWin
        ? "rgba(34, 197, 94, 0.2)"
        : "rgba(239, 68, 68, 0.2)";

      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x1, 0);
      ctx.lineTo(x1, h);
      ctx.stroke();

      if (width > 2) {
        ctx.beginPath();
        ctx.moveTo(x2, 0);
        ctx.lineTo(x2, h);
        ctx.stroke();
      }
    }
  }
}