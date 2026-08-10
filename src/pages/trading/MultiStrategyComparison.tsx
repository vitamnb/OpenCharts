// Multi-strategy comparison: run multiple strategies and compare metrics side by side
import { useState, useCallback } from "react";
import { type JesseBacktestSession, type JesseBacktestConfig, startBacktest, pollBacktestStatus } from "../../services/api/jesse.ts";

interface StrategyRun {
  strategy: string;
  session: JesseBacktestSession | null;
  loading: boolean;
  error: string | null;
}

interface MultiStrategyComparisonProps {
  symbol: string;
  timeframe: string;
  exchange: string;
  dateRange: { start: string; end: string };
  initialCapital: number;
  availableStrategies: string[];
}

export function MultiStrategyComparison({
  symbol,
  timeframe,
  exchange,
  dateRange,
  initialCapital,
  availableStrategies,
}: MultiStrategyComparisonProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const [runs, setRuns] = useState<StrategyRun[]>([]);
  const [running, setRunning] = useState(false);

  const toggleStrategy = (name: string) => {
    setSelected((s) =>
      s.includes(name) ? s.filter((x) => x !== name) : [...s, name],
    );
  };

  const runComparison = useCallback(async () => {
    if (selected.length === 0) return;
    setRunning(true);
    setRuns(selected.map((s) => ({ strategy: s, session: null, loading: true, error: null })));

    const config: Omit<JesseBacktestConfig, "strategy"> = {
      exchange,
      symbol,
      timeframe,
      start_date: dateRange.start,
      finish_date: dateRange.end,
      initial_capital: initialCapital,
    };

    let completed = 0;
    const total = selected.length;

    for (let i = 0; i < selected.length; i++) {
      const strat = selected[i];
      if (!strat) continue;
      try {
        const { sessionId } = await startBacktest({ ...config, strategy: strat });
        pollBacktestStatus(
          sessionId,
          (session) => {
            setRuns((prev) => prev.map((r, idx) =>
              idx === i ? { ...r, session } : r,
            ));
          },
          (session) => {
            setRuns((prev) => prev.map((r, idx) =>
              idx === i ? { ...r, session, loading: false } : r,
            ));
            completed++;
            if (completed >= total) setRunning(false);
          },
          (err) => {
            setRuns((prev) => prev.map((r, idx) =>
              idx === i ? { ...r, error: err.message, loading: false } : r,
            ));
            completed++;
            if (completed >= total) setRunning(false);
          },
          2000,
          30,
        );
      } catch (err) {
        setRuns((prev) => prev.map((r, idx) =>
          idx === i ? { ...r, error: String(err), loading: false } : r,
        ));
        completed++;
        if (completed >= total) setRunning(false);
      }
    }
  }, [selected, exchange, symbol, timeframe, dateRange, initialCapital]);

  const completedRuns = runs.filter((r) => r.session && r.session.metrics);
  const bestNetProfit = Math.max(...completedRuns.map((r) => r.session?.metrics?.net_profit ?? -Infinity));
  const bestWinRate = Math.max(...completedRuns.map((r) => r.session?.metrics?.win_rate ?? -Infinity));
  const bestPF = Math.max(...completedRuns.map((r) => r.session?.metrics?.profit_factor ?? -Infinity));
  const bestSharpe = Math.max(...completedRuns.map((r) => r.session?.metrics?.sharpe_ratio ?? -Infinity));

  return (
    <div style={{ padding: 12, color: "#9298a5", fontSize: 12 }}>
      <div style={{ marginBottom: 12, fontWeight: 600, color: "#e0e3e8" }}>
        Multi-Strategy Comparison
      </div>

      {/* Strategy selector */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
        {availableStrategies.map((s) => (
          <button
            key={s}
            onClick={() => toggleStrategy(s)}
            style={{
              padding: "4px 10px",
              background: selected.includes(s) ? "#1e2230" : "transparent",
              border: `1px solid ${selected.includes(s) ? "#f0b90b" : "#1e2230"}`,
              borderRadius: 4,
              color: selected.includes(s) ? "#f0b90b" : "#9298a5",
              cursor: "pointer",
              fontSize: 11,
            }}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Run button */}
      {selected.length > 0 && (
        <button
          onClick={runComparison}
          disabled={running}
          style={{
            padding: "6px 16px",
            background: "#f0b90b",
            border: "none",
            borderRadius: 4,
            color: "#0b0e14",
            cursor: running ? "not-allowed" : "pointer",
            fontSize: 12,
            fontWeight: 600,
            marginBottom: 12,
            opacity: running ? 0.5 : 1,
          }}
        >
          {running ? "Running..." : `Compare ${selected.length} strategies`}
        </button>
      )}

      {/* Results table */}
      {completedRuns.length > 0 && (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #1e2230", color: "#5d6673", textTransform: "uppercase", fontSize: 10 }}>
              <th style={{ textAlign: "left", padding: "6px 8px" }}>Strategy</th>
              <th style={{ textAlign: "right", padding: "6px 8px" }}>Net PnL</th>
              <th style={{ textAlign: "right", padding: "6px 8px" }}>Win Rate</th>
              <th style={{ textAlign: "right", padding: "6px 8px" }}>PF</th>
              <th style={{ textAlign: "right", padding: "6px 8px" }}>Sharpe</th>
              <th style={{ textAlign: "right", padding: "6px 8px" }}>Max DD</th>
              <th style={{ textAlign: "right", padding: "6px 8px" }}>Trades</th>
            </tr>
          </thead>
          <tbody>
            {completedRuns.map((r) => {
              const m = r.session!.metrics!;
              return (
                <tr key={r.strategy} style={{ borderBottom: "1px solid #151923" }}>
                  <td style={{ padding: "6px 8px", color: "#e0e3e8" }}>{r.strategy}</td>
                  <td style={{ padding: "6px 8px", textAlign: "right", color: (m.net_profit ?? 0) >= 0 ? "#0ecb81" : "#f6465d", fontWeight: m.net_profit === bestNetProfit ? 700 : 400 }}>
                    {m.net_profit != null ? `$${m.net_profit.toFixed(2)}` : "-"}
                  </td>
                  <td style={{ padding: "6px 8px", textAlign: "right", color: m.win_rate === bestWinRate ? "#f0b90b" : "#9298a5", fontWeight: m.win_rate === bestWinRate ? 700 : 400 }}>
                    {m.win_rate != null ? `${(m.win_rate * 100).toFixed(1)}%` : "-"}
                  </td>
                  <td style={{ padding: "6px 8px", textAlign: "right", color: m.profit_factor === bestPF ? "#f0b90b" : "#9298a5", fontWeight: m.profit_factor === bestPF ? 700 : 400 }}>
                    {m.profit_factor != null ? m.profit_factor.toFixed(2) : "-"}
                  </td>
                  <td style={{ padding: "6px 8px", textAlign: "right", color: m.sharpe_ratio === bestSharpe ? "#f0b90b" : "#9298a5", fontWeight: m.sharpe_ratio === bestSharpe ? 700 : 400 }}>
                    {m.sharpe_ratio != null ? m.sharpe_ratio.toFixed(2) : "-"}
                  </td>
                  <td style={{ padding: "6px 8px", textAlign: "right", color: "#f6465d" }}>
                    {m.max_drawdown != null ? `${(m.max_drawdown * 100).toFixed(1)}%` : "-"}
                  </td>
                  <td style={{ padding: "6px 8px", textAlign: "right" }}>
                    {m.total ?? "-"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {/* Loading indicators */}
      {runs.filter((r) => r.loading).map((r) => (
        <div key={r.strategy} style={{ padding: "4px 0", fontSize: 11, color: "#5d6673" }}>
          {r.strategy}: running backtest...
        </div>
      ))}

      {/* Errors */}
      {runs.filter((r) => r.error).map((r) => (
        <div key={r.strategy} style={{ padding: "4px 0", fontSize: 11, color: "#f6465d" }}>
          {r.strategy}: {r.error}
        </div>
      ))}

      {selected.length === 0 && (
        <div style={{ color: "#5d6673", fontSize: 11, padding: "8px 0" }}>
          Select strategies above to compare.
        </div>
      )}
    </div>
  );
}