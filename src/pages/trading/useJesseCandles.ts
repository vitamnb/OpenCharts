// Hook to fetch candles from Jesse's PostgreSQL database via the Jesse Flask API
// when the data source toggle is set to "jesse".

import { useEffect, useState } from "react";
import { useDataSourceStore } from "./data-source-store.ts";
import { fetchJesseCandles } from "../../services/api/jesse.ts";
import type { Candle } from "../../services/schemas.ts";

export function useJesseCandles(symbol: string, timeframe: string) {
  const source = useDataSourceStore((s) => s.source);
  const jesseExchange = useDataSourceStore((s) => s.jesseExchange);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (source !== "jesse") return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchJesseCandles(jesseExchange, symbol, timeframe)
      .then((raw) => {
        if (cancelled) return;
        const mapped: Candle[] = raw.map((c) => ({
          time: c.time,
          timestamp: c.time * 1000,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume,
        }));
        setCandles(mapped);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [source, jesseExchange, symbol, timeframe]);

  return { candles, loading, error, isActive: source === "jesse" };
}