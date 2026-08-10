import { useState, useEffect } from "react";
import type { AlertType, AlertCondition } from "./alert-store";
import { useAlertStore } from "./alert-store";
import type { DrawingLine } from "../constants";

interface AddAlertDialogProps {
  open: boolean;
  onClose: () => void;
  symbol: string;
  currentPrice: number | null;
  drawings: DrawingLine[];
  preselectedPrice?: number | null;
  preselectedDrawingId?: string | null;
}

const CONDITIONS: { value: AlertCondition; label: string }[] = [
  { value: "crosses-up", label: "Crosses above" },
  { value: "crosses-down", label: "Crosses below" },
  { value: "crosses-both", label: "Crosses either direction" },
];

export function AddAlertDialog({
  open,
  onClose,
  symbol,
  currentPrice,
  drawings,
  preselectedPrice,
  preselectedDrawingId,
}: AddAlertDialogProps) {
  const addAlert = useAlertStore((s) => s.addAlert);
  const [type, setType] = useState<AlertType>("price");
  const [price, setPrice] = useState("");
  const [condition, setCondition] = useState<AlertCondition>("crosses-both");
  const [message, setMessage] = useState("");
  const [drawingId, setDrawingId] = useState("");
  const [sound, setSound] = useState(true);
  const [visual, setVisual] = useState(true);

  useEffect(() => {
    if (!open) return;
    setType(preselectedDrawingId ? "line-cross" : "price");
    setPrice(preselectedPrice != null ? preselectedPrice.toString() : currentPrice?.toString() ?? "");
    setDrawingId(preselectedDrawingId ?? "");
    setCondition("crosses-both");
    setMessage("");
    setSound(true);
    setVisual(true);
  }, [open, preselectedPrice, preselectedDrawingId, currentPrice]);

  if (!open) return null;

  const alertDrawings = drawings.filter(
    (d) => d.type === "horizontal" || d.type === "trendline",
  );

  const handleSubmit = () => {
    const base = {
      symbol,
      sound,
      visual,
      condition,
      message: message || "",
    };
    if (type === "price") {
      const p = parseFloat(price);
      if (isNaN(p)) return;
      addAlert({ ...base, type: "price", price: p });
    } else if (type === "line-cross") {
      if (!drawingId) return;
      addAlert({ ...base, type: "line-cross", drawingId });
    }
    // Any other type (indicator) is not created via this dialog
    onClose();
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#0b0e14",
          border: "1px solid #1e2230",
          borderRadius: 8,
          padding: 20,
          width: 380,
          maxWidth: "90vw",
          color: "#9298a5",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ margin: "0 0 16px", color: "#e0e3e8", fontSize: 16 }}>
          Add Alert
        </h3>

        {/* Alert type selector */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {(["price", "line-cross"] as AlertType[]).map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              style={{
                flex: 1,
                padding: "8px 12px",
                background: type === t ? "#1e2230" : "transparent",
                border: `1px solid ${type === t ? "#f0b90b" : "#1e2230"}`,
                borderRadius: 4,
                color: type === t ? "#f0b90b" : "#9298a5",
                cursor: "pointer",
                fontSize: 13,
                textTransform: "capitalize",
              }}
            >
              {t === "line-cross" ? "Line Cross" : "Price"}
            </button>
          ))}
        </div>

        {type === "price" && (
          <label style={{ display: "block", marginBottom: 12 }}>
            <span style={{ fontSize: 12, color: "#5d6673", marginBottom: 4, display: "block" }}>
              Price
            </span>
            <input
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder={currentPrice?.toString() ?? "0.00"}
              style={{
                width: "100%",
                padding: "8px 10px",
                background: "#0b0e14",
                border: "1px solid #1e2230",
                borderRadius: 4,
                color: "#e0e3e8",
                fontSize: 14,
              }}
            />
          </label>
        )}

        {type === "line-cross" && (
          <label style={{ display: "block", marginBottom: 12 }}>
            <span style={{ fontSize: 12, color: "#5d6673", marginBottom: 4, display: "block" }}>
              Drawing
            </span>
            <select
              value={drawingId}
              onChange={(e) => setDrawingId(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 10px",
                background: "#0b0e14",
                border: "1px solid #1e2230",
                borderRadius: 4,
                color: "#e0e3e8",
                fontSize: 14,
              }}
            >
              <option value="">Select a line...</option>
              {alertDrawings.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.type} @ {d.price.toFixed(2)}
                </option>
              ))}
            </select>
          </label>
        )}

        {/* Condition */}
        <label style={{ display: "block", marginBottom: 12 }}>
          <span style={{ fontSize: 12, color: "#5d6673", marginBottom: 4, display: "block" }}>
            Condition
          </span>
          <select
            value={condition}
            onChange={(e) => setCondition(e.target.value as AlertCondition)}
            style={{
              width: "100%",
              padding: "8px 10px",
              background: "#0b0e14",
              border: "1px solid #1e2230",
              borderRadius: 4,
              color: "#e0e3e8",
              fontSize: 14,
            }}
          >
            {CONDITIONS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>

        {/* Message */}
        <label style={{ display: "block", marginBottom: 12 }}>
          <span style={{ fontSize: 12, color: "#5d6673", marginBottom: 4, display: "block" }}>
            Message (optional)
          </span>
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Alert note..."
            style={{
              width: "100%",
              padding: "8px 10px",
              background: "#0b0e14",
              border: "1px solid #1e2230",
              borderRadius: 4,
              color: "#e0e3e8",
              fontSize: 14,
            }}
          />
        </label>

        {/* Notification options */}
        <div style={{ display: "flex", gap: 16, marginBottom: 20 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13 }}>
            <input type="checkbox" checked={sound} onChange={(e) => setSound(e.target.checked)} />
            Sound
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13 }}>
            <input type="checkbox" checked={visual} onChange={(e) => setVisual(e.target.checked)} />
            Visual flash
          </label>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{
              padding: "8px 16px",
              background: "transparent",
              border: "1px solid #1e2230",
              borderRadius: 4,
              color: "#9298a5",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            style={{
              padding: "8px 16px",
              background: "#f0b90b",
              border: "none",
              borderRadius: 4,
              color: "#0b0e14",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            Create Alert
          </button>
        </div>
      </div>
    </div>
  );
}