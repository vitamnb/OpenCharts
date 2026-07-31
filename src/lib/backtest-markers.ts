import type { SeriesMarker, Time } from "lightweight-charts";
import type { JesseTrade } from "../services/api/jesse";

export type BacktestMarker = SeriesMarker<Time> & {
  tradeId: string;
};

export function tradesToMarkers(trades: JesseTrade[]): BacktestMarker[] {
  const markers: BacktestMarker[] = [];

  for (const trade of trades) {
    if (trade.opened_at) {
      markers.push({
        time: Math.floor(trade.opened_at / 1000) as Time,
        position: trade.type === "long" ? "belowBar" : "aboveBar",
        color: trade.type === "long" ? "#22c55e" : "#ef4444",
        shape: trade.type === "long" ? "arrowUp" : "arrowDown",
        text: `${trade.type === "long" ? "Long" : "Short"} Entry`,
        tradeId: trade.id,
      });
    }

    if (trade.closed_at && trade.exit_price != null) {
      const isWin = (trade.pnl ?? 0) >= 0;
      markers.push({
        time: Math.floor(trade.closed_at / 1000) as Time,
        position: trade.type === "long" ? "aboveBar" : "belowBar",
        color: isWin ? "#22c55e" : "#ef4444",
        shape: "circle",
        text: `Exit ${trade.pnl != null ? (trade.pnl >= 0 ? "+" : "") + trade.pnl.toFixed(2) : ""}`,
        tradeId: trade.id,
      });
    }
  }

  // Sort by time (lightweight-charts requires markers sorted by time)
  markers.sort((a, b) => (a.time as number) - (b.time as number));

  return markers;
}

export interface BacktestShadingData {
  startTime: Time;
  endTime: Time;
  isWin: boolean;
  tradeId: string;
}

export function tradesToShading(trades: JesseTrade[]): BacktestShadingData[] {
  return trades
    .filter((t) => t.opened_at && t.closed_at)
    .map((t) => ({
      startTime: Math.floor(t.opened_at / 1000) as Time,
      endTime: Math.floor(t.closed_at! / 1000) as Time,
      isWin: (t.pnl ?? 0) >= 0,
      tradeId: t.id,
    }));
}

export function formatMetric(value: number | undefined | null, suffix = ""): string {
  if (value == null || isNaN(value)) return "--";
  if (Math.abs(value) >= 1000) {
    return value.toLocaleString(undefined, { maximumFractionDigits: 1 }) + suffix;
  }
  return value.toFixed(2) + suffix;
}

export function formatPercentage(value: number | undefined | null): string {
  if (value == null || isNaN(value)) return "--";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export function formatCurrency(value: number | undefined | null): string {
  if (value == null || isNaN(value)) return "--";
  return `${value >= 0 ? "+" : ""}$${Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}