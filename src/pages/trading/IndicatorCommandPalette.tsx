import { useEffect, useMemo, useRef, useState } from "react";
import { X, Search, CornerDownLeft } from "lucide-react";
import {
  INDICATOR_REGISTRY,
  type IndicatorType,
  type IndicatorCategory,
} from "../../lib/indicators.ts";
import { cn } from "../../lib/utils.ts";

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (type: IndicatorType) => void;
  activeIndicators: IndicatorType[];
}

const CATEGORY_ORDER: IndicatorCategory[] = [
  "Moving Averages",
  "Oscillators",
  "Volatility",
  "Volume",
  "Trend",
  "Confluence",
  "Smart Money Concepts",
];

export function IndicatorCommandPalette({ open, onClose, onSelect, activeIndicators }: Props) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Reset on open
  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
    }
  }, [open]);

  // Focus input on open
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Esc to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Filtered + grouped results
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = INDICATOR_REGISTRY.filter(
      (ind) =>
        q === "" ||
        ind.label.toLowerCase().includes(q) ||
        ind.shortLabel.toLowerCase().includes(q) ||
        ind.type.toLowerCase().includes(q) ||
        ind.category.toLowerCase().includes(q),
    );
    return CATEGORY_ORDER.filter((cat) =>
      filtered.some((ind) => ind.category === cat),
    ).map((cat) => ({
      category: cat,
      items: filtered.filter((ind) => ind.category === cat),
    }));
  }, [query]);

  // Flat list for keyboard nav
  const flatList = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  // Clamp active index when results change
  useEffect(() => {
    if (activeIndex >= flatList.length) setActiveIndex(0);
  }, [flatList.length, activeIndex]);

  // Keyboard nav
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, flatList.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = flatList[activeIndex];
      if (item) {
        onSelect(item.type);
        onClose();
      }
    }
  };

  // Scroll active item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${activeIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  if (!open) return null;

  let runningIdx = -1;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] bg-black/40"
      onClick={onClose}
    >
      <div
        className="w-[440px] max-w-[90vw] bg-card border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        {/* Search input */}
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            placeholder="Search indicators..."
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-secondary text-muted-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[360px] overflow-y-auto py-1">
          {flatList.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No indicators match "{query}"
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.category}>
                <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                  {group.category}
                </div>
                {group.items.map((ind) => {
                  runningIdx++;
                  const idx = runningIdx;
                  const isActive = activeIndicators.includes(ind.type);
                  return (
                    <button
                      key={ind.type}
                      data-idx={idx}
                      onClick={() => {
                        onSelect(ind.type);
                        onClose();
                      }}
                      onMouseEnter={() => setActiveIndex(idx)}
                      className={cn(
                        "w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors",
                        idx === activeIndex ? "bg-secondary" : "hover:bg-secondary/50",
                      )}
                    >
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: ind.color }}
                      />
                      <span className="flex-1 truncate">{ind.label}</span>
                      <span className="text-[10px] text-muted-foreground">{ind.shortLabel}</span>
                      <span className="text-[10px] text-muted-foreground/60 uppercase">{ind.pane}</span>
                      {isActive && (
                        <span className="text-[10px] text-primary font-medium">ACTIVE</span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-3 py-2 border-t border-border text-[10px] text-muted-foreground">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 rounded bg-secondary text-[9px]">↑↓</kbd>
              navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 rounded bg-secondary text-[9px]">
                <CornerDownLeft className="h-2.5 w-2.5 inline" />
              </kbd>
              select
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 rounded bg-secondary text-[9px]">esc</kbd>
              close
            </span>
          </div>
          <span>{flatList.length} results</span>
        </div>
      </div>
    </div>
  );
}