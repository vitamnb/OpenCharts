import { useAlertStore, type PriceAlert } from "./alert-store";

interface AlertPanelProps {
  symbol: string;
}

const STATUS_COLORS: Record<string, string> = {
  active: "#0ecb81",
  snoozed: "#f0b90b",
  fired: "#f6465d",
  dismissed: "#5d6673",
};

const TYPE_LABELS: Record<string, string> = {
  price: "Price",
  "line-cross": "Line",
  indicator: "Indicator",
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString("en-AU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function AlertRow({
  alert,
  onDismiss,
  onSnooze,
  onRemove,
}: {
  alert: PriceAlert;
  onDismiss: (id: string) => void;
  onSnooze: (id: string, min: number) => void;
  onRemove: (id: string) => void;
}) {
  const statusColor = STATUS_COLORS[alert.status] ?? "#5d6673";
  const target =
    alert.type === "price" && alert.price != null
      ? `$${alert.price.toFixed(2)}`
      : alert.type === "line-cross"
        ? "Line cross"
        : alert.indicatorName ?? "Indicator";

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "80px 70px 1fr 110px 90px 80px",
        alignItems: "center",
        gap: 8,
        padding: "6px 12px",
        borderBottom: "1px solid #151923",
        fontSize: 12,
        color: "#9298a5",
        cursor: "default",
      }}
    >
      <span style={{ color: statusColor, fontWeight: 600, textTransform: "capitalize" }}>
        {alert.status}
      </span>
      <span style={{ color: "#5d6673" }}>{TYPE_LABELS[alert.type]}</span>
      <span style={{ color: "#e0e3e8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {target}{alert.message ? ` - ${alert.message}` : ""}
      </span>
      <span style={{ color: "#5d6673" }}>{formatTime(alert.createdAt)}</span>
      <span style={{ color: "#5d6673" }}>
        {alert.firedAt ? formatTime(alert.firedAt) : "-"}
      </span>
      <div style={{ display: "flex", gap: 4 }}>
        {alert.status === "active" && (
          <>
            <button
              title="Snooze 10 min"
              onClick={() => onSnooze(alert.id, 10)}
              style={btnStyle}
            >
              Z
            </button>
            <button
              title="Dismiss"
              onClick={() => onDismiss(alert.id)}
              style={btnStyle}
            >
              x
            </button>
          </>
        )}
        <button title="Remove" onClick={() => onRemove(alert.id)} style={btnStyle}>
          del
        </button>
      </div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding: "2px 6px",
  background: "transparent",
  border: "1px solid #1e2230",
  borderRadius: 3,
  color: "#5d6673",
  cursor: "pointer",
  fontSize: 11,
};

export function AlertPanel({ symbol: _symbol }: AlertPanelProps) {
  const alerts = useAlertStore((s) => s.alerts);
  const dismissAlert = useAlertStore((s) => s.dismissAlert);
  const snoozeAlert = useAlertStore((s) => s.snoozeAlert);
  const removeAlert = useAlertStore((s) => s.removeAlert);
  const clearFired = useAlertStore((s) => s.clearFired);
  const clearAll = useAlertStore((s) => s.clearAll);

  const active = alerts.filter((a) => a.status === "active").length;
  const fired = alerts.filter((a) => a.status === "fired").length;
  const snoozed = alerts.filter((a) => a.status === "snoozed").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", color: "#9298a5" }}>
      {/* Header bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "8px 12px",
          borderBottom: "1px solid #1e2230",
          fontSize: 12,
        }}
      >
        <span style={{ color: "#e0e3e8", fontWeight: 600 }}>Alerts</span>
        <span style={{ color: "#0ecb81" }}>{active} active</span>
        {snoozed > 0 && <span style={{ color: "#f0b90b" }}>{snoozed} snoozed</span>}
        {fired > 0 && <span style={{ color: "#f6465d" }}>{fired} fired</span>}
        <div style={{ flex: 1 }} />
        {fired > 0 && (
          <button onClick={clearFired} style={headerBtnStyle}>Clear fired</button>
        )}
        {alerts.length > 0 && (
          <button onClick={clearAll} style={headerBtnStyle}>Clear all</button>
        )}
      </div>

      {/* Column headers */}
      {alerts.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "80px 70px 1fr 110px 90px 80px",
            gap: 8,
            padding: "6px 12px",
            borderBottom: "1px solid #1e2230",
            fontSize: 11,
            color: "#5d6673",
            textTransform: "uppercase",
          }}
        >
          <span>Status</span>
          <span>Type</span>
          <span>Target</span>
          <span>Created</span>
          <span>Fired</span>
          <span>Actions</span>
        </div>
      )}

      {/* Alert list */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {alerts.length === 0 ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              color: "#5d6673",
              fontSize: 13,
            }}
          >
            No alerts. Right-click on the chart to add one.
          </div>
        ) : (
          alerts.map((a) => (
            <AlertRow
              key={a.id}
              alert={a}
              onDismiss={dismissAlert}
              onSnooze={snoozeAlert}
              onRemove={removeAlert}
            />
          ))
        )}
      </div>
    </div>
  );
}

const headerBtnStyle: React.CSSProperties = {
  padding: "4px 10px",
  background: "transparent",
  border: "1px solid #1e2230",
  borderRadius: 4,
  color: "#9298a5",
  cursor: "pointer",
  fontSize: 11,
};