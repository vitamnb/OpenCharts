// Expanded metrics components for the Strategy Backtest Panel
// Long/Short breakdown and Monthly Returns table

import type { JesseTrade } from "../../services/api/jesse.ts";
import { formatCurrency } from "../../lib/backtest-markers.ts";
import { cn } from "../../lib/utils.ts";

// ── Long/Short Breakdown ──────────────────────────────
export function LongShortBreakdown({ trades }: { trades: JesseTrade[] }) {
  const longs = trades.filter((t) => t.type === "long");
  const shorts = trades.filter((t) => t.type === "short");

  const calcStats = (group: JesseTrade[]) => {
    const wins = group.filter((t) => (t.pnl ?? 0) >= 0);
    const losses = group.filter((t) => (t.pnl ?? 0) < 0);
    const netPnl = group.reduce((sum, t) => sum + (t.pnl ?? 0), 0);
    const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + (t.pnl ?? 0), 0) / wins.length : 0;
    const avgLoss = losses.length > 0 ? losses.reduce((s, t) => s + (t.pnl ?? 0), 0) / losses.length : 0;
    return {
      count: group.length,
      winRate: group.length > 0 ? (wins.length / group.length) * 100 : 0,
      netPnl,
      avgWin,
      avgLoss,
    };
  };

  const longStats = calcStats(longs);
  const shortStats = calcStats(shorts);

  if (longs.length === 0 && shorts.length === 0) return null;

  const renderRow = (label: string, stats: ReturnType<typeof calcStats>, color: string) => (
    <div className="flex items-center gap-3 px-3 py-1.5 text-xs">
      <span className={`font-semibold ${color} w-12 shrink-0`}>{label}</span>
      <span className="text-muted-foreground w-16">{stats.count} trades</span>
      <span className={stats.netPnl >= 0 ? "text-buy w-20" : "text-sell w-20"}>
        {formatCurrency(stats.netPnl)}
      </span>
      <span className="text-muted-foreground w-16">{stats.winRate.toFixed(1)}% WR</span>
      <span className="text-buy w-20">Avg W {formatCurrency(stats.avgWin)}</span>
      <span className="text-sell w-20">Avg L {formatCurrency(stats.avgLoss)}</span>
    </div>
  );

  return (
    <div className="border-b border-border">
      <div className="text-[9px] text-muted-foreground uppercase tracking-wide px-3 pt-2">
        Long/Short Breakdown
      </div>
      {longs.length > 0 && renderRow("Long", longStats, "text-buy")}
      {shorts.length > 0 && renderRow("Short", shortStats, "text-sell")}
    </div>
  );
}

// ── Monthly Returns ───────────────────────────────────
export function MonthlyReturns({ trades }: { trades: JesseTrade[] }) {
  const monthly = new Map<string, { pnl: number; trades: number }>();

  for (const t of trades) {
    const ts = t.closed_at ?? t.opened_at;
    if (!ts) continue;
    const d = new Date(ts);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const entry = monthly.get(key) ?? { pnl: 0, trades: 0 };
    entry.pnl += t.pnl ?? 0;
    entry.trades += 1;
    monthly.set(key, entry);
  }

  const months = Array.from(monthly.entries()).sort(([a], [b]) => a.localeCompare(b));
  if (months.length === 0) return null;

  return (
    <div className="border-b border-border">
      <div className="text-[9px] text-muted-foreground uppercase tracking-wide px-3 pt-2">
        Monthly Returns
      </div>
      <div className="flex items-center gap-2 px-3 py-1.5 overflow-x-auto no-scrollbar">
        {months.map(([key, data]) => (
          <div key={key} className="flex flex-col shrink-0 items-center min-w-[60px]">
            <span className="text-[9px] text-muted-foreground">{key}</span>
            <span className={cn("text-xs font-bold", data.pnl >= 0 ? "text-buy" : "text-sell")}>
              {formatCurrency(data.pnl)}
            </span>
            <span className="text-[9px] text-muted-foreground">{data.trades} trades</span>
          </div>
        ))}
      </div>
    </div>
  );
}