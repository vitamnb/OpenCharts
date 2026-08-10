import { useState } from "react";

interface AgentAnnotationToggleProps {
  connected: boolean;
  visible: boolean;
  onToggleVisible: () => void;
  activeCategories: Set<string>;
  onToggleCategory: (category: string) => void;
  onClear: () => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  smc: "SMC",
  sr: "S/R",
  pattern: "Pattern",
  "trade-setup": "Setup",
  "indicator-dynamic": "Dynamic",
  "agent-note": "Notes",
};

const CATEGORY_COLORS: Record<string, string> = {
  smc: "#3B82F6",
  sr: "#A855F7",
  pattern: "#F97316",
  "trade-setup": "#22C55E",
  "indicator-dynamic": "#EAB308",
  "agent-note": "#6B7280",
};

export function AgentAnnotationToggle({
  connected,
  visible,
  onToggleVisible,
  activeCategories,
  onToggleCategory,
  onClear,
}: AgentAnnotationToggleProps) {
  const [expanded, setExpanded] = useState(false);

  const btnStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 4,
    padding: "4px 8px",
    fontSize: 11,
    borderRadius: 4,
    border: "1px solid var(--color-border, #2a2e39)",
    background: "var(--color-bg-secondary, #131722)",
    color: "var(--color-text, #d1d4dc)",
    cursor: "pointer",
    transition: "all 0.15s",
  };

  const dotStyle = (color: string, active: boolean): React.CSSProperties => ({
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: color,
    opacity: active ? 1 : 0.3,
    border: "none",
    cursor: "pointer",
    transition: "opacity 0.15s",
  });

  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
      <button
        style={{
          ...btnStyle,
          borderColor: connected ? "#22C55E" : "var(--color-border, #2a2e39)",
        }}
        onClick={() => setExpanded(!expanded)}
        title={connected ? "Agent bridge connected" : "Agent bridge disconnected"}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: connected ? "#22C55E" : "#6B7280",
            boxShadow: connected ? "0 0 4px #22C55E" : "none",
            animation: connected ? "pulse 2s infinite" : "none",
          }}
        />
        Agent Bridge
      </button>

      {expanded && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            marginTop: 4,
            padding: 8,
            borderRadius: 6,
            border: "1px solid var(--color-border, #2a2e39)",
            background: "var(--color-bg-secondary, #131722)",
            boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
            zIndex: 100,
            minWidth: 180,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 8,
              fontSize: 11,
              color: "var(--color-text, #d1d4dc)",
              fontWeight: 600,
            }}
          >
            <span>Agent Annotations</span>
            <button
              style={{ ...btnStyle, padding: "2px 6px", fontSize: 10 }}
              onClick={onToggleVisible}
            >
              {visible ? "Hide" : "Show"}
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
              <div
                key={key}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 11,
                  color: "var(--color-text, #d1d4dc)",
                  cursor: "pointer",
                  padding: "2px 0",
                }}
                onClick={() => onToggleCategory(key)}
              >
                <span style={dotStyle(CATEGORY_COLORS[key] ?? "#6B7280", activeCategories.has(key))} />
                {label}
              </div>
            ))}
          </div>

          <button
            style={{ ...btnStyle, marginTop: 8, width: "100%", justifyContent: "center" }}
            onClick={onClear}
          >
            Clear All
          </button>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}