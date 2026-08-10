// Data source toggle: switch between live KuCoin and Jesse historical candles

import { Database, Radio } from "lucide-react";
import { useDataSourceStore, type CandleDataSource } from "./data-source-store.ts";

const OPTIONS: { value: CandleDataSource; label: string; icon: typeof Radio }[] = [
  { value: "live", label: "Live", icon: Radio },
  { value: "jesse", label: "Jesse", icon: Database },
];

export function DataSourceToggle() {
  const source = useDataSourceStore((s) => s.source);
  const setSource = useDataSourceStore((s) => s.setSource);

  return (
    <div className="flex items-center gap-1 rounded-md border border-border bg-card/50 px-1 py-0.5">
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          onClick={() => setSource(value)}
          className={`
            flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors
            ${source === value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-accent"}
          `}
          title={value === "live" ? "Live KuCoin data" : "Jesse historical candle database"}
        >
          <Icon className="h-3 w-3" />
          {label}
        </button>
      ))}
    </div>
  );
}