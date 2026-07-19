/**
 * Live data API facade.
 *
 * When live mode is enabled, market data (symbols, candles, ticks) comes from
 * KuCoin REST API. Trading (accounts, orders, positions) still uses the
 * in-browser paper trading engine, so the user can trade against live prices
 * without real money.
 *
 * This mirrors the demo API structure but replaces market data methods with
 * KuCoin REST calls. Methods not related to market data delegate to demoApi.
 */

import { demoApi } from "../demo/api";
import { DEMO_SYMBOLS } from "../demo/instruments";
import { fetchRecentCandles } from "../kucoin/rest";
import type { MarketDataCandlesPayload, MarketDataCandle } from "../api/market-data";

// KuCoin symbol metadata is different from our Symbol schema.
// We fetch the real symbol list from KuCoin and map it.
import { fetchKucoinSymbols } from "../kucoin/rest";
import type { Symbol } from "../schemas";

// Fallback symbols if the API call fails
const FALLBACK_SYMBOLS = DEMO_SYMBOLS;

// Cache the symbol list so we don't refetch on every render
let cachedSymbols: Symbol[] | null = null;

const candlesMeta = (candles: MarketDataCandle[]): MarketDataCandlesPayload => ({
  candles,
  metadata: { isPartial: false, backfillQueued: false, historicalCoverageStart: candles[0]?.time ?? null },
});

// Convert KuCoin candle to OpenCharts Candle schema
function toCandle(kc: {
  time: number;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
}): MarketDataCandle {
  return {
    time: kc.time,
    open: kc.open,
    high: kc.high,
    low: kc.low,
    close: kc.close,
    volume: kc.volume,
    timestamp: kc.time * 1000, // ms
  };
}

export const liveApi = {
  // ── Auth (still demo, no real auth needed for charting) ──
  login: demoApi.login,
  demoLogin: demoApi.demoLogin,
  register: demoApi.register,
  completeMfaLogin: demoApi.completeMfaLogin,
  logout: demoApi.logout,
  refreshToken: demoApi.refreshToken,
  getMyProfile: demoApi.getMyProfile,
  getMe: demoApi.getMe,

  // ── Accounts (still paper trading engine) ──
  getMyAccounts: demoApi.getMyAccounts,
  getAccount: demoApi.getAccount,
  getEquityHistory: demoApi.getEquityHistory,
  getLedger: demoApi.getLedger,
  getAccountStats: demoApi.getAccountStats,
  setAccountLabel: demoApi.setAccountLabel,
  getAccountMetrics: demoApi.getAccountMetrics,

  // ── Symbols & market data (KuCoin live) ──
  getSymbols: async (): Promise<Symbol[]> => {
    if (cachedSymbols) return cachedSymbols;
    try {
      cachedSymbols = await fetchKucoinSymbols();
      return cachedSymbols;
    } catch {
      return FALLBACK_SYMBOLS;
    }
  },

  getCandles: async (symbol: string, timeframe: string, limit?: number): Promise<MarketDataCandle[]> => {
    const candles = await fetchRecentCandles(symbol, timeframe, limit ?? 500);
    return candles.map(toCandle);
  },

  getCandlesWithMeta: async (symbol: string, timeframe: string, limit?: number): Promise<MarketDataCandlesPayload> => {
    const candles = await fetchRecentCandles(symbol, timeframe, limit ?? 500);
    return candlesMeta(candles.map(toCandle));
  },

  getTick: (symbol: string) => {
    // In live mode, ticks come from the WebSocket, not REST.
    // Return a zero-spread placeholder; the store will be updated by WS ticks.
    const price = 0;
    return Promise.resolve({ symbol, bid: price, ask: price, timestamp: Date.now() });
  },

  getMarketDataHealth: () => Promise.resolve({ status: "live", provider: "KuCoin" }),
  getEconomicCalendar: demoApi.getEconomicCalendar,

  // ── Trading (still paper trading engine) ──
  placeOrder: demoApi.placeOrder,
  cancelOrder: demoApi.cancelOrder,
  modifyOrder: demoApi.modifyOrder,
  cancelAllOrders: demoApi.cancelAllOrders,
  getOrders: demoApi.getOrders,
  getPositions: demoApi.getPositions,
  getOpenPositionCount: demoApi.getOpenPositionCount,
  closePosition: demoApi.closePosition,
  closeAllPositions: demoApi.closeAllPositions,
  modifyPosition: demoApi.modifyPosition,
  getFills: demoApi.getFills,
  getClosedPositions: demoApi.getClosedPositions,
  getClosedPositionsSummary: demoApi.getClosedPositionsSummary,
  getFillQuality: demoApi.getFillQuality,

  // ── Trade journal ──
  getJournalEntries: demoApi.getJournalEntries,
  createJournalEntry: demoApi.createJournalEntry,
  updateJournalEntry: demoApi.updateJournalEntry,
  deleteJournalEntry: demoApi.deleteJournalEntry,

  // ── Chart persistence ──
  chartDrawings: demoApi.chartDrawings,
  savePreferences: demoApi.savePreferences,

  // ── Feature gating / misc ──
  getFeatureFlags: demoApi.getFeatureFlags,
  isAiTraderEnabled: demoApi.isAiTraderEnabled,
  getAnnouncements: demoApi.getAnnouncements,
  getAnnouncementsUnreadCount: demoApi.getAnnouncementsUnreadCount,
  replayGetSession: demoApi.replayGetSession,
};