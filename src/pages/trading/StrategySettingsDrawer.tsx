// StrategySettingsDrawer — slide-out settings panel for backtest configuration
// Replaces the inline config form with a TradingView-style gear drawer
import { useState, useCallback, useEffect } from "react";
import { Settings, X, Sliders, Code } from "lucide-react";
import { cn } from "../../lib/utils.ts";
import { fetchStrategyHyperparameters, type Hyperparameter } from "../../lib/strategy-hyperparameters.ts";
import { syncCandles } from "../../services/api/jesse.ts";

interface StrategySettingsDrawerProps {
  open: boolean;
  onClose: () => void;
  // Current config values
  exchange: string;
  symbol: string;
  timeframe: string;
  dateRange: { start: string; end: string };
  initialCapital: number;
  // Updaters
  onExchangeChange: (v: string) => void;
  onSymbolChange: (v: string) => void;
  onTimeframeChange: (v: string) => void;
  onDateRangeChange: (d: { start: string; end: string }) => void;
  onInitialCapitalChange: (v: number) => void;
  // Advanced settings
  onApply: () => void;
  // Strategy name for hyperparameter display
  strategyName?: string;
}

const TIMEFRAMES = ["1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w"];
const EXCHANGES = [
  "Binance Perpetual Futures",
  "Binance",
  "Kucoin",
  "Coinbase",
  "Bitfinex",
];

export function StrategySettingsDrawer({
  open,
  onClose,
  exchange,
  symbol,
  timeframe,
  dateRange,
  initialCapital,
  onExchangeChange,
  onSymbolChange,
  onTimeframeChange,
  onDateRangeChange,
  onInitialCapitalChange,
  onApply,
  strategyName,
}: StrategySettingsDrawerProps) {
  // Local state for advanced settings (not yet wired to Jesse config)
  const [commission, setCommission] = useState(0.1);
  const [slippage, setSlippage] = useState(0);
  const [leverage, setLeverage] = useState(1);
  const [marginMode, setMarginMode] = useState<"cross" | "isolated">("cross");
  const [hyperparams, setHyperparams] = useState<Hyperparameter[]>([]);
  const [showHyperparams, setShowHyperparams] = useState(false);
  const [loadingHyperparams, setLoadingHyperparams] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  useEffect(() => {
    if (!strategyName || !open) return;
    setLoadingHyperparams(true);
    fetchStrategyHyperparameters(strategyName)
      .then((params) => {
        setHyperparams(params);
        setLoadingHyperparams(false);
      })
      .catch(() => {
        setHyperparams([]);
        setLoadingHyperparams(false);
      });
  }, [strategyName, open]);

  const handleApply = useCallback(() => {
    onApply();
    onClose();
  }, [onApply, onClose]);

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/20"
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <div
        className={cn(
          "absolute right-0 top-0 z-50 h-full w-72 bg-card border-l border-border shadow-xl transition-transform duration-200 overflow-y-auto",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-border sticky top-0 bg-card z-10">
          <div className="flex items-center gap-2">
            <Sliders className="h-4 w-4" />
            <span className="text-xs font-semibold">Backtest Settings</span>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-3 space-y-4">
          {/* Market section */}
          <div className="space-y-2">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Market
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground">Exchange</label>
              <select
                value={exchange}
                onChange={(e) => onExchangeChange(e.target.value)}
                className="w-full bg-secondary text-xs rounded px-2 py-1.5 border border-border/50 focus:outline-none focus:border-primary"
              >
                {EXCHANGES.map((e) => (
                  <option key={e} value={e}>{e}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground">Symbol</label>
              <input
                type="text"
                value={symbol}
                onChange={(e) => onSymbolChange(e.target.value)}
                className="w-full bg-secondary text-xs rounded px-2 py-1.5 border border-border/50 focus:outline-none focus:border-primary"
                placeholder="BTC-USDT"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground">Timeframe</label>
              <select
                value={timeframe}
                onChange={(e) => onTimeframeChange(e.target.value)}
                className="w-full bg-secondary text-xs rounded px-2 py-1.5 border border-border/50 focus:outline-none focus:border-primary"
              >
                {TIMEFRAMES.map((tf) => (
                  <option key={tf} value={tf}>{tf}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Strategy hyperparameters */}
          {strategyName && (
            <div className="space-y-2">
              <button
                onClick={() => setShowHyperparams((v) => !v)}
                className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
              >
                <Code className="h-3 w-3" />
                Hyperparameters
                {loadingHyperparams && <span className="text-[9px]">loading...</span>}
                {hyperparams.length > 0 && <span className="text-[9px] bg-secondary px-1 rounded">{hyperparams.length}</span>}
              </button>
              {showHyperparams && hyperparams.length > 0 && (
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {hyperparams.map((hp) => (
                    <div key={hp.name} className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground font-mono">{hp.name}</span>
                      <span className="font-bold font-mono">{String(hp.value)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Candle data sync */}
          <div className="space-y-2">
            <button
              onClick={async () => {
                setSyncing(true);
                setSyncResult(null);
                const result = await syncCandles(exchange, symbol, timeframe, dateRange.start, dateRange.end);
                setSyncing(false);
                setSyncResult(result.success ? `Synced ${result.count} candles` : `Failed: ${result.message}`);
              }}
              disabled={syncing}
              className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              <span>{syncing ? "Syncing..." : "Sync Candles"}</span>
            </button>
            {syncResult && <div className="text-[10px] text-muted-foreground">{syncResult}</div>}
          </div>

          {/* Date range */}
          <div className="space-y-2">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Date Range
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground">From</label>
                <input
                  type="date"
                  value={dateRange.start}
                  onChange={(e) => onDateRangeChange({ ...dateRange, start: e.target.value })}
                  className="w-full bg-secondary text-xs rounded px-2 py-1.5 border border-border/50 focus:outline-none focus:border-primary"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground">To</label>
                <input
                  type="date"
                  value={dateRange.end}
                  onChange={(e) => onDateRangeChange({ ...dateRange, end: e.target.value })}
                  className="w-full bg-secondary text-xs rounded px-2 py-1.5 border border-border/50 focus:outline-none focus:border-primary"
                />
              </div>
            </div>
          </div>

          {/* Capital */}
          <div className="space-y-2">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Capital
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground">Initial balance</label>
              <input
                type="number"
                value={initialCapital}
                onChange={(e) => onInitialCapitalChange(parseInt(e.target.value) || 10000)}
                className="w-full bg-secondary text-xs rounded px-2 py-1.5 border border-border/50 focus:outline-none focus:border-primary"
                min={100}
                step={100}
              />
            </div>
          </div>

          {/* Advanced (futures-specific) */}
          <div className="space-y-2">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Advanced
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground">Commission %</label>
              <input
                type="number"
                value={commission}
                onChange={(e) => setCommission(parseFloat(e.target.value) || 0)}
                className="w-full bg-secondary text-xs rounded px-2 py-1.5 border border-border/50 focus:outline-none focus:border-primary"
                min={0}
                max={1}
                step={0.01}
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground">Slippage (bps)</label>
              <input
                type="number"
                value={slippage}
                onChange={(e) => setSlippage(parseFloat(e.target.value) || 0)}
                className="w-full bg-secondary text-xs rounded px-2 py-1.5 border border-border/50 focus:outline-none focus:border-primary"
                min={0}
                step={1}
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground">Leverage</label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  value={leverage}
                  onChange={(e) => setLeverage(parseInt(e.target.value))}
                  className="flex-1"
                  min={1}
                  max={100}
                  step={1}
                />
                <span className="text-xs font-bold w-8 text-right">{leverage}x</span>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground">Margin mode</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setMarginMode("cross")}
                  className={cn(
                    "flex-1 text-xs py-1 rounded border",
                    marginMode === "cross"
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-secondary border-border/50",
                  )}
                >
                  Cross
                </button>
                <button
                  onClick={() => setMarginMode("isolated")}
                  className={cn(
                    "flex-1 text-xs py-1 rounded border",
                    marginMode === "isolated"
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-secondary border-border/50",
                  )}
                >
                  Isolated
                </button>
              </div>
            </div>
          </div>

          {/* Apply button */}
          <button
            onClick={handleApply}
            className="w-full flex items-center justify-center gap-1 px-3 py-2 rounded bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90"
          >
            <Settings className="h-3 w-3" />
            Apply & Close
          </button>
        </div>
      </div>
    </>
  );
}