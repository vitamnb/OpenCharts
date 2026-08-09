import { useState, useEffect, useRef, useCallback } from "react";
import { Play, Square, RefreshCw, FolderOpen } from "lucide-react";
import {
  type JesseStrategy,
  type JesseBacktestSession,
  type JesseBacktestConfig,
  type JesseTrade,
  type JesseBacktestMetrics,
  listStrategies,
  startBacktest,
  cancelBacktest,
  pollBacktestStatus,
  listBacktestSessions,
} from "../../services/api/jesse";
import {
  formatMetric,
  formatPercentage,
  formatCurrency,
} from "../../lib/backtest-markers";
import { toast } from "../../services/toast";
import { cn } from "../../lib/utils";

type BacktestState = "idle" | "running" | "done" | "error";

interface StrategyBacktestPanelProps {
  symbol: string;
  timeframe: string;
  onTradesUpdate?: (trades: JesseTrade[]) => void;
  onSessionComplete?: (session: JesseBacktestSession) => void;
}

const TIMEFRAMES = ["1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w"];
const EXCHANGES = ["Binance Perpetual Futures", "Binance", "Kucoin", "Coinbase", "Bitfinex"];

function defaultDateRange(): { start: string; end: string } {
  const end = new Date();
  const start = new Date();
  start.setMonth(start.getMonth() - 6);
  return {
    start: start.toISOString().split("T")[0] ?? "",
    end: end.toISOString().split("T")[0] ?? "",
  };
}

export function StrategyBacktestPanel({
  symbol,
  timeframe,
  onTradesUpdate,
  onSessionComplete,
}: StrategyBacktestPanelProps) {
  const [strategies, setStrategies] = useState<JesseStrategy[]>([]);
  const [selectedStrategy, setSelectedStrategy] = useState<string>("");
  const [exchange, setExchange] = useState<string>("Binance Perpetual Futures");
  const [btSymbol, setBtSymbol] = useState<string>(symbol || "BTC-USDT");
  const [btTimeframe, setBtTimeframe] = useState<string>(timeframe || "1h");
  const [dateRange, setDateRange] = useState(defaultDateRange);
  const [initialCapital, setInitialCapital] = useState(10000);
  const [state, setState] = useState<BacktestState>("idle");
  const [session, setSession] = useState<JesseBacktestSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelPollRef = useRef<(() => void) | null>(null);

  // Load strategies on mount
  useEffect(() => {
    listStrategies()
      .then((s) => {
        if (s && s.length > 0) {
          setStrategies(s);
          if (!selectedStrategy && s[0]) {
            setSelectedStrategy(s[0].name);
          }
        }
      })
      .catch(() => {
        setStrategies([{ name: "Staircase", path: "Staircase" }]);
        setSelectedStrategy("Staircase");
      });
  }, []);

  // Update symbol/timeframe when parent changes
  useEffect(() => {
    if (symbol) setBtSymbol(symbol);
  }, [symbol]);
  useEffect(() => {
    if (timeframe) setBtTimeframe(timeframe);
  }, [timeframe]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => cancelPollRef.current?.();
  }, []);

  const handleRun = useCallback(async () => {
    if (!selectedStrategy) {
      toast.warning("No Strategy", "Select a strategy first");
      return;
    }

    setState("running");
    setError(null);
    setSession(null);

    const config: JesseBacktestConfig = {
      exchange,
      symbol: btSymbol,
      timeframe: btTimeframe,
      strategy: selectedStrategy,
      start_date: dateRange.start,
      finish_date: dateRange.end,
      initial_capital: initialCapital,
    };

    try {
      const { sessionId } = await startBacktest(config);

      cancelPollRef.current = pollBacktestStatus(
        sessionId,
        (s) => {
          setSession(s);
          if (s.trades.length > 0) {
            onTradesUpdate?.(s.trades);
          }
        },
        (s) => {
          setState(s.status === "error" ? "error" : "done");
          setSession(s);
          if (s.trades.length > 0) {
            onTradesUpdate?.(s.trades);
          }
          onSessionComplete?.(s);
          if (s.status === "error" || s.exception) {
            setError(s.exception || "Backtest failed");
            toast.error("Backtest Failed", s.exception || "Unknown error");
          } else {
            toast.success(
              "Backtest Complete",
              `${s.trades.length} trades, ${formatPercentage(s.metrics?.net_profit_percentage)}`,
            );
          }
        },
        (err) => {
          setState("error");
          setError(err.message);
          toast.error("Backtest Error", err.message);
        },
      );
    } catch (err) {
      setState("error");
      setError((err as Error).message);
      toast.error("Backtest Failed", (err as Error).message);
    }
  }, [selectedStrategy, exchange, btSymbol, btTimeframe, dateRange, initialCapital, onTradesUpdate, onSessionComplete]);

  const handleCancel = useCallback(async () => {
    if (session?.id) {
      try {
        await cancelBacktest(session.id);
        cancelPollRef.current?.();
        setState("idle");
        toast.info("Backtest Cancelled", "The backtest was cancelled");
      } catch {
        toast.error("Cancel Failed", "Could not cancel the backtest");
      }
    }
  }, [session?.id]);

  const handleReset = useCallback(() => {
    setState("idle");
    setSession(null);
    setError(null);
    onTradesUpdate?.([]);
  }, [onTradesUpdate]);

  // Load a saved backtest JSON from public/backtests/
  const handleLoadSaved = useCallback(async () => {
    try {
      const res = await fetch("/backtests/v5b-shorts.json");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const trades: JesseTrade[] = data.trades || [];
      if (trades.length === 0) {
        toast.warning("No Trades", "Saved backtest file has no trades");
        return;
      }
      setState("done");
      setSession({
        id: data.sessionId || "saved",
        status: "finished",
        metrics: data.metrics || null,
        trades,
        equity_curve: [],
        execution_duration: null,
        created_at: Date.now(),
        updated_at: Date.now(),
        title: data.title || "Saved Backtest",
        description: null,
        exception: null,
        traceback: null,
      });
      onTradesUpdate?.(trades);
      toast.success("Loaded", `${trades.length} trades from ${data.title || "saved backtest"}`);
    } catch (err) {
      toast.error("Load Failed", (err as Error).message);
    }
  }, [onTradesUpdate]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Config Form */}
      {(state === "idle" || state === "error") && (
        <div className="p-3 space-y-2 overflow-auto">
          <div className="flex items-center gap-2 flex-wrap">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
              Strategy
            </label>
            <select
              value={selectedStrategy}
              onChange={(e) => setSelectedStrategy(e.target.value)}
              className="bg-secondary text-xs rounded px-2 py-1 border border-border/50 focus:outline-none focus:border-primary"
            >
              {strategies.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>

            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide ml-2">
              Exchange
            </label>
            <select
              value={exchange}
              onChange={(e) => setExchange(e.target.value)}
              className="bg-secondary text-xs rounded px-2 py-1 border border-border/50 focus:outline-none focus:border-primary"
            >
              {EXCHANGES.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>

            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide ml-2">
              Symbol
            </label>
            <input
              type="text"
              value={btSymbol}
              onChange={(e) => setBtSymbol(e.target.value)}
              className="bg-secondary text-xs rounded px-2 py-1 border border-border/50 focus:outline-none focus:border-primary w-24"
              placeholder="BTC-USDT"
            />

            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide ml-2">
              TF
            </label>
            <select
              value={btTimeframe}
              onChange={(e) => setBtTimeframe(e.target.value)}
              className="bg-secondary text-xs rounded px-2 py-1 border border-border/50 focus:outline-none focus:border-primary"
            >
              {TIMEFRAMES.map((tf) => (
                <option key={tf} value={tf}>
                  {tf}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
              From
            </label>
            <input
              type="date"
              value={dateRange.start}
              onChange={(e) =>
                setDateRange((d) => ({ ...d, start: e.target.value }))
              }
              className="bg-secondary text-xs rounded px-2 py-1 border border-border/50 focus:outline-none focus:border-primary"
            />
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide ml-2">
              To
            </label>
            <input
              type="date"
              value={dateRange.end}
              onChange={(e) =>
                setDateRange((d) => ({ ...d, end: e.target.value }))
              }
              className="bg-secondary text-xs rounded px-2 py-1 border border-border/50 focus:outline-none focus:border-primary"
            />
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide ml-2">
              Capital
            </label>
            <input
              type="number"
              value={initialCapital}
              onChange={(e) =>
                setInitialCapital(parseInt(e.target.value) || 10000)
              }
              className="bg-secondary text-xs rounded px-2 py-1 border border-border/50 focus:outline-none focus:border-primary w-24"
            />

            <button
              onClick={handleRun}
              className="flex items-center gap-1 px-3 py-1 rounded bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 disabled:opacity-50"
            >
              <Play className="h-3 w-3" />
              Run Backtest
            </button>
            <button
              onClick={handleLoadSaved}
              className="flex items-center gap-1 px-2 py-1 rounded bg-secondary text-xs font-semibold hover:bg-secondary/80"
              title="Load V5b saved backtest"
            >
              <FolderOpen className="h-3 w-3" />
              Load V5b
            </button>

            {state === "error" && (
              <span className="text-xs text-destructive">{error}</span>
            )}
          </div>
        </div>
      )}

      {/* Running state */}
      {state === "running" && (
        <div className="p-3 flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <span className="text-xs font-semibold">
              Running backtest: {selectedStrategy} on {btSymbol} {btTimeframe}
            </span>
          </div>
          {session && (
            <span className="text-[10px] text-muted-foreground">
              Status: {session.status}
            </span>
          )}
          <button
            onClick={handleCancel}
            className="flex items-center gap-1 px-2 py-1 rounded bg-destructive text-destructive-foreground text-xs font-semibold hover:bg-destructive/90 ml-auto"
          >
            <Square className="h-3 w-3" />
            Cancel
          </button>
        </div>
      )}

      {/* Results */}
      {(state === "done" || (state === "running" && session?.trades?.length)) && (
        <div className="flex flex-col min-h-0 flex-1">
          {session?.metrics && <MetricsCard metrics={session.metrics} />}
          {session?.equity_curve && session.equity_curve.length > 0 && (
            <EquityCurveMini data={session.equity_curve} />
          )}
          {session?.trades && session.trades.length > 0 && (
            <BacktestTradesTable trades={session.trades} />
          )}

          {state === "done" && (
            <div className="p-2 flex items-center gap-2 border-t border-border">
              <button
                onClick={handleReset}
                className="flex items-center gap-1 px-2 py-1 rounded bg-secondary text-xs font-semibold hover:bg-secondary/80"
              >
                <RefreshCw className="h-3 w-3" />
                New Backtest
              </button>
              {session?.execution_duration && (
                <span className="text-[10px] text-muted-foreground">
                  Completed in {session.execution_duration.toFixed(1)}s
                </span>
              )}
              <PreviousSessions />
            </div>
          )}
        </div>
      )}

      {/* Idle empty state */}
      {state === "idle" && !session && (
        <div className="flex items-center justify-center h-full text-muted-foreground text-xs py-4">
          Configure a backtest above and hit Run
        </div>
      )}
    </div>
  );
}

// ── Metrics Card ──────────────────────────────────────────
function MetricsCard({ metrics }: { metrics: JesseBacktestMetrics }) {
  const items = [
    {
      label: "Net Profit",
      value: formatCurrency(metrics.net_profit),
      highlight: (metrics.net_profit ?? 0) >= 0 ? "text-buy" : "text-sell",
    },
    {
      label: "Return",
      value: formatPercentage(metrics.net_profit_percentage),
      highlight: (metrics.net_profit_percentage ?? 0) >= 0 ? "text-buy" : "text-sell",
    },
    { label: "Trades", value: formatMetric(metrics.total) },
    {
      label: "Win Rate",
      value: metrics.win_rate != null ? `${(metrics.win_rate * 100).toFixed(1)}%` : "--",
    },
    {
      label: "Max DD",
      value: formatPercentage(metrics.max_drawdown),
      highlight: "text-sell",
    },
    { label: "Sharpe", value: formatMetric(metrics.sharpe_ratio) },
    { label: "Sortino", value: formatMetric(metrics.sortino_ratio) },
    { label: "PF", value: formatMetric(metrics.profit_factor) },
    { label: "Calmar", value: formatMetric(metrics.calmar_ratio) },
    { label: "Expectancy", value: formatCurrency(metrics.expectancy) },
    { label: "Annual", value: formatPercentage(metrics.annual_return) },
  ];

  return (
    <div className="flex items-center gap-3 px-3 py-2 border-b border-border overflow-x-auto no-scrollbar">
      {items.map((item) => (
        <div key={item.label} className="flex flex-col shrink-0">
          <span className="text-[9px] text-muted-foreground uppercase tracking-wide">
            {item.label}
          </span>
          <span
            className={cn(
              "text-xs font-bold",
              item.highlight ?? "text-foreground",
            )}
          >
            {item.value}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Trades Table ──────────────────────────────────────────
function BacktestTradesTable({ trades }: { trades: JesseTrade[] }) {
  return (
    <div className="flex-1 overflow-auto">
      <table className="w-full text-[11px]">
        <thead className="sticky top-0 bg-card z-10">
          <tr>
            <th>Opened</th>
            <th>Closed</th>
            <th>Symbol</th>
            <th>Side</th>
            <th>Qty</th>
            <th>Entry</th>
            <th>Exit</th>
            <th>PnL</th>
            <th>PnL %</th>
            <th>Hold</th>
          </tr>
        </thead>
        <tbody>
          {trades.map((t) => {
            const isWin = (t.pnl ?? 0) >= 0;
            return (
              <tr key={t.id} className="hover:bg-secondary/30">
                <td className="text-muted-foreground">
                  {new Date(t.opened_at).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </td>
                <td className="text-muted-foreground">
                  {t.closed_at
                    ? new Date(t.closed_at).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "--"}
                </td>
                <td className="font-semibold">{t.symbol}</td>
                <td className={t.type === "long" ? "text-buy" : "text-sell"}>
                  {t.type === "long" ? "L" : "S"}
                </td>
                <td>{t.qty?.toFixed(4) ?? "--"}</td>
                <td>{t.entry_price?.toFixed(2) ?? "--"}</td>
                <td>{t.exit_price?.toFixed(2) ?? "--"}</td>
                <td className={isWin ? "text-buy" : "text-sell"}>
                  {t.pnl != null ? formatCurrency(t.pnl) : "--"}
                </td>
                <td className={isWin ? "text-buy" : "text-sell"}>
                  {t.pnl_percentage != null
                    ? formatPercentage(t.pnl_percentage)
                    : "--"}
                </td>
                <td className="text-muted-foreground">{t.holding_period ?? "--"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Equity Curve Mini Chart ──────────────────────────────
function EquityCurveMini({ data }: { data: Array<{ timestamp: number; equity: number }> }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length < 2) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = 40;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.height = h + "px";
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, w, h);

    const equities = data.map((d) => d.equity);
    const min = Math.min(...equities);
    const max = Math.max(...equities);
    const range = max - min || 1;
    const stepX = w / (data.length - 1 || 1);

    // Area fill
    ctx.beginPath();
    ctx.moveTo(0, h);
    data.forEach((d, i) => {
      const x = i * stepX;
      const y = h - ((d.equity - min) / range) * (h - 4) - 2;
      ctx.lineTo(x, y);
    });
    ctx.lineTo(w, h);
    ctx.closePath();
    const lastEquity = equities[equities.length - 1] ?? 0;
    const firstEquity = equities[0] ?? 0;
    const isPositive = lastEquity >= firstEquity;
    ctx.fillStyle = isPositive ? "rgba(34, 197, 94, 0.1)" : "rgba(239, 68, 68, 0.1)";
    ctx.fill();

    // Line
    ctx.beginPath();
    data.forEach((d, i) => {
      const x = i * stepX;
      const y = h - ((d.equity - min) / range) * (h - 4) - 2;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = isPositive ? "#22c55e" : "#ef4444";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }, [data]);

  return (
    <div className="flex items-center gap-2 px-3 py-1 border-b border-border/40">
      <span className="text-[9px] text-muted-foreground uppercase tracking-wide shrink-0">
        Equity
      </span>
      <canvas ref={canvasRef} className="flex-1 h-10" />
      {data.length > 0 && (
        <span
          className={cn(
            "text-xs font-bold shrink-0",
            (data[data.length - 1]?.equity ?? 0) >= (data[0]?.equity ?? 0)
              ? "text-buy"
              : "text-sell",
          )}
        >
          {formatCurrency(data[data.length - 1]?.equity)}
        </span>
      )}
    </div>
  );
}

// ── Previous Sessions Dropdown ────────────────────────────
function PreviousSessions() {
  const [open, setOpen] = useState(false);
  const [sessions, setSessions] = useState<JesseBacktestSession[]>([]);
  const [loading, setLoading] = useState(false);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listBacktestSessions(10, 0);
      setSessions(res.sessions);
    } catch {
      // silent fail
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div className="relative">
      <button
        onClick={() => {
          if (!open) loadSessions();
          setOpen(!open);
        }}
        className="flex items-center gap-1 px-2 py-1 rounded bg-secondary text-xs font-semibold hover:bg-secondary/80"
      >
        History
        {loading && (
          <div className="h-3 w-3 border border-primary border-t-transparent rounded-full animate-spin" />
        )}
      </button>
      {open && sessions.length > 0 && (
        <div className="absolute bottom-full left-0 mb-1 bg-card border border-border rounded shadow-lg max-h-48 overflow-auto z-50 min-w-[200px]">
          {sessions.map((s) => (
            <div
              key={s.id}
              className="px-2 py-1 hover:bg-secondary/50 cursor-pointer text-[11px]"
              onClick={() => setOpen(false)}
            >
              <span className="font-semibold">{s.title || s.id.slice(0, 8)}</span>
              <span className="text-muted-foreground ml-2">
                {new Date(s.created_at).toLocaleDateString()}
              </span>
              {s.metrics?.net_profit_percentage != null && (
                <span
                  className={cn(
                    "ml-2 font-semibold",
                    s.metrics.net_profit_percentage >= 0
                      ? "text-buy"
                      : "text-sell",
                  )}
                >
                  {formatPercentage(s.metrics.net_profit_percentage)}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}