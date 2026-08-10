// Data source toggle store: switches between live KuCoin and Jesse historical candles

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type CandleDataSource = "live" | "jesse";

interface DataSourceState {
  source: CandleDataSource;
  jesseExchange: string;
  setSource: (s: CandleDataSource) => void;
  setJesseExchange: (e: string) => void;
}

export const useDataSourceStore = create<DataSourceState>()(
  persist(
    (set) => ({
      source: "live",
      jesseExchange: "Binance Perpetual Futures",
      setSource: (s) => set({ source: s }),
      setJesseExchange: (e) => set({ jesseExchange: e }),
    }),
    { name: "opencharts-data-source" },
  ),
);