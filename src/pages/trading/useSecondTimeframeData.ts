/**
 * Fetches candle data for the second timeframe overlay.
 * Uses KuCoin REST API (not WebSocket) to keep the implementation simple.
 * Returns chart-formatted candlestick data ready for series.setData().
 */

import { useQuery } from "@tanstack/react-query";
import type { CandlestickData, Time } from "lightweight-charts";
import { useMemo } from "react";
import { fetchRecentCandles } from "../../services/kucoin/rest";
import type { Candle } from "../../services/schemas";

// Query key factory for the second timeframe candles
const secondTfKeys = {
  candles: (symbol: string, tf: string) => ["secondTfCandles", symbol, tf] as const,
};

/**
 * Convert a KuCoin candle to lightweight-charts CandlestickData.
 * KuCoin returns time in seconds, which is what lightweight-charts expects.
 */
function toCandlestickData(c: Candle): CandlestickData<Time> {
  return {
    time: c.time as Time,
    open: Number(c.open),
    high: Number(c.high),
    low: Number(c.low),
    close: Number(c.close),
  };
}

/**
 * Hook that fetches candles for the second timeframe overlay.
 * Only fetches when enabled (secondTimeframe is set and showSecondTimeframe is true).
 *
 * @param symbol    The selected symbol (e.g. "BTCUSD")
 * @param secondTimeframe  The overlay timeframe (e.g. "1h") or null
 * @param show  Whether the overlay is visible
 * @returns { data, isLoading, isError } where data is CandlestickData<Time>[]
 */
export function useSecondTimeframeData(
  symbol: string,
  secondTimeframe: string | null,
  show: boolean,
): {
  data: CandlestickData<Time>[];
  isLoading: boolean;
  isError: boolean;
} {
  const enabled = show && secondTimeframe != null && symbol.length > 0;

  const query = useQuery<Candle[], Error>({
    queryKey: secondTfKeys.candles(symbol, secondTimeframe ?? ""),
    queryFn: async () => {
      const tf = secondTimeframe!;
      // Fetch ~500 recent candles for the second timeframe
      const candles = await fetchRecentCandles(symbol, tf, 500);
      return candles.map((c) => ({
        time: c.time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
      })) as Candle[];
    },
    enabled,
    staleTime: 30_000,
    refetchInterval: 60_000, // refresh every minute for the overlay
    refetchOnWindowFocus: false,
  });

  const chartData = useMemo(() => {
    if (!query.data || query.data.length === 0) return [];
    return query.data
      .map(toCandlestickData)
      .filter((c) => (c.time as number) > 0)
      .sort((a, b) => (a.time as number) - (b.time as number));
  }, [query.data]);

  return {
    data: chartData,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}