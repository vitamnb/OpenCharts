/**
 * Symbol mapping between OpenCharts internal names and KuCoin pair names.
 *
 * OpenCharts uses compact names (BTCUSD, ETHUSD) while KuCoin uses
 * dash-separated pair names (BTC-USDT, ETH-USDT). This module translates
 * between the two so the rest of the app doesn't need to know about KuCoin's
 * naming convention.
 */

// Default quote currency for the pipeline. KuCoin supports USDT, USDC, etc.
// We standardise on USDT for spot trading.
const DEFAULT_QUOTE = "USDT";

// Explicit overrides where the OpenCharts name doesn't map cleanly.
// e.g. BTCUSD -> BTC-USDT (not BTC-USD)
const SYMBOL_OVERRIDES: Record<string, string> = {
  BTCUSD: "BTC-USDT",
  ETHUSD: "ETH-USDT",
  SOLUSD: "SOL-USDT",
  BNBUSD: "BNB-USDT",
  XRPUSD: "XRP-USDT",
  ADAUSD: "ADA-USDT",
  DOGEUSD: "DOGE-USDT",
  LINKUSD: "LINK-USDT",
  AVAXUSD: "AVAX-USDT",
  DOTUSD: "DOT-USDT",
  MATICUSD: "MATIC-USDT",
};

/**
 * Convert an OpenCharts symbol (e.g. "BTCUSD") to a KuCoin pair (e.g. "BTC-USDT").
 * If the symbol is already in KuCoin format (contains a dash), return as-is.
 */
export function toKucoinSymbol(symbol: string): string {
  if (symbol.includes("-")) return symbol;
  if (SYMBOL_OVERRIDES[symbol]) return SYMBOL_OVERRIDES[symbol];
  // Generic fallback: strip trailing USD and append -USDT
  if (symbol.endsWith("USD")) {
    return symbol.slice(0, -3) + "-" + DEFAULT_QUOTE;
  }
  return symbol;
}

/**
 * Convert a KuCoin pair (e.g. "BTC-USDT") back to an OpenCharts symbol (e.g. "BTCUSD").
 */
export function fromKucoinSymbol(kucoinSymbol: string): string {
  // Find the override that maps to this KuCoin symbol
  for (const [oc, kc] of Object.entries(SYMBOL_OVERRIDES)) {
    if (kc === kucoinSymbol) return oc;
  }
  // Generic: strip the quote currency
  const base = kucoinSymbol.split("-")[0];
  if (base) return base + "USD";
  return kucoinSymbol;
}

/**
 * Map OpenCharts timeframe strings to KuCoin candle types.
 * OpenCharts uses: 1m, 5m, 15m, 30m, 1h, 4h, 1d, 1w
 * KuCoin uses: 1min, 3min, 5min, 15min, 30min, 1hour, 2hour, 4hour, 6hour, 8hour, 12hour, 1day, 1week, 1month
 */
const TIMEFRAME_MAP: Record<string, string> = {
  "1m": "1min",
  "3m": "3min",
  "5m": "5min",
  "15m": "15min",
  "30m": "30min",
  "1h": "1hour",
  "2h": "2hour",
  "4h": "4hour",
  "6h": "6hour",
  "8h": "8hour",
  "12h": "12hour",
  "1d": "1day",
  "1w": "1week",
};

export function toKucoinTimeframe(tf: string): string {
  return TIMEFRAME_MAP[tf] ?? tf;
}

export function fromKucoinTimeframe(tf: string): string {
  for (const [oc, kc] of Object.entries(TIMEFRAME_MAP)) {
    if (kc === tf) return oc;
  }
  return tf;
}