import { useEffect, useRef } from "react";
import { useAlertStore, type PriceAlert } from "./alert-store";
import { playAlertBeep, linePriceAt } from "../../../lib/chart-plugins/drawing-tools/line-alerts";
import type { DrawingLine } from "../constants";

interface UseAlertEngineParams {
  symbol: string;
  midPrice: number | null;
  drawings: DrawingLine[];
  /** Fired callback for UI notification (toast, flash, etc.) */
  onAlertFired?: (alert: PriceAlert, triggerPrice: number) => void;
}

/**
 * Alert engine hook. Runs on every mid-price update and checks:
 * 1. Price alerts (price crosses a value)
 * 2. Line-cross alerts (price crosses an alert-enabled drawing)
 * 3. Indicator alerts (evaluated externally, not here)
 *
 * Snoozed alerts are skipped until snoozedUntil passes.
 * Fired alerts are marked and not re-triggered.
 */
export function useAlertEngine({
  symbol,
  midPrice,
  drawings,
  onAlertFired,
}: UseAlertEngineParams) {
  const prevMidRef = useRef<number | null>(null);
  const firedCooldownRef = useRef<Map<string, number>>(new Map());
  const alerts = useAlertStore((s) => s.alerts);
  const updateAlert = useAlertStore((s) => s.updateAlert);
  const onAlertFiredRef = useRef(onAlertFired);
  onAlertFiredRef.current = onAlertFired;

  // Clean up cooldown entries for alerts that no longer exist
  useEffect(() => {
    const alertIds = new Set(alerts.map((a) => a.id));
    for (const key of firedCooldownRef.current.keys()) {
      if (!alertIds.has(key)) firedCooldownRef.current.delete(key);
    }
  }, [alerts]);

  useEffect(() => {
    if (midPrice == null) return;
    const prev = prevMidRef.current;
    prevMidRef.current = midPrice;
    if (prev == null) return;

    const now = Date.now();
    const nowSec = Math.floor(now / 1000);

    for (const alert of alerts) {
      if (alert.symbol !== symbol) continue;
      if (alert.status === "fired" || alert.status === "dismissed") continue;
      if (alert.status === "snoozed" && alert.snoozedUntil && now < alert.snoozedUntil) continue;
      if (alert.status === "snoozed" && alert.snoozedUntil && now >= alert.snoozedUntil) {
        updateAlert(alert.id, { status: "active", snoozedUntil: undefined });
      }

      const cooldown = firedCooldownRef.current.get(alert.id) ?? 0;
      if (nowSec - cooldown < 30) continue;

      let triggered = false;
      let triggerPrice = midPrice;

      if (alert.type === "price" && alert.price != null) {
        const target = alert.price;
        const cond = alert.condition ?? "crosses-both";
        if (cond === "crosses-up" && prev < target && midPrice >= target) {
          triggered = true;
        } else if (cond === "crosses-down" && prev > target && midPrice <= target) {
          triggered = true;
        } else if (cond === "crosses-both" && (prev < target) !== (midPrice < target)) {
          triggered = true;
        }
        triggerPrice = target;
      } else if (alert.type === "line-cross" && alert.drawingId) {
        const drawing = drawings.find((d) => d.id === alert.drawingId);
        if (drawing) {
          const linePrice = linePriceAt(drawing, nowSec);
          if (linePrice != null) {
            if ((prev < linePrice) !== (midPrice < linePrice)) {
              triggered = true;
              triggerPrice = linePrice;
            }
          }
        }
      }

      if (triggered) {
        firedCooldownRef.current.set(alert.id, nowSec);
        updateAlert(alert.id, { status: "fired", firedAt: now });
        if (alert.sound) playAlertBeep();
        onAlertFiredRef.current?.(alert, triggerPrice);
      }
    }
  }, [midPrice, alerts, symbol, drawings, updateAlert]);
}