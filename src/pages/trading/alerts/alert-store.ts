import { create } from "zustand";
import { persist } from "zustand/middleware";

export type AlertType = "price" | "line-cross" | "indicator";
export type AlertCondition = "crosses-up" | "crosses-down" | "crosses-both";
export type AlertStatus = "active" | "snoozed" | "fired" | "dismissed";

export interface PriceAlert {
  id: string;
  type: AlertType;
  symbol: string;
  status: AlertStatus;
  message: string;
  createdAt: number;
  firedAt?: number;
  snoozedUntil?: number;
  // Price alert fields
  price?: number;
  condition?: AlertCondition;
  // Line-cross alert fields
  drawingId?: string;
  // Indicator alert fields
  indicatorId?: string;
  indicatorName?: string;
  threshold?: number;
  // Notification settings
  sound: boolean;
  visual: boolean;
}

interface AlertState {
  alerts: PriceAlert[];
  addAlert: (alert: Omit<PriceAlert, "id" | "createdAt" | "status">) => string;
  removeAlert: (id: string) => void;
  updateAlert: (id: string, patch: Partial<PriceAlert>) => void;
  dismissAlert: (id: string) => void;
  snoozeAlert: (id: string, minutes: number) => void;
  clearFired: () => void;
  clearAll: () => void;
}

function genId(): string {
  return `alert_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export const useAlertStore = create<AlertState>()(
  persist(
    (set) => ({
      alerts: [],
      addAlert: (alert) => {
        const id = genId();
        const full: PriceAlert = {
          ...alert,
          id,
          createdAt: Date.now(),
          status: "active",
        };
        set((s) => ({ alerts: [full, ...s.alerts] }));
        return id;
      },
      removeAlert: (id) =>
        set((s) => ({ alerts: s.alerts.filter((a) => a.id !== id) })),
      updateAlert: (id, patch) =>
        set((s) => ({
          alerts: s.alerts.map((a) => (a.id === id ? { ...a, ...patch } : a)),
        })),
      dismissAlert: (id) =>
        set((s) => ({
          alerts: s.alerts.map((a) =>
            a.id === id ? { ...a, status: "dismissed" } : a,
          ),
        })),
      snoozeAlert: (id, minutes) =>
        set((s) => ({
          alerts: s.alerts.map((a) =>
            a.id === id
              ? {
                  ...a,
                  status: "snoozed",
                  snoozedUntil: Date.now() + minutes * 60_000,
                }
              : a,
          ),
        })),
      clearFired: () =>
        set((s) => ({ alerts: s.alerts.filter((a) => a.status !== "fired") })),
      clearAll: () => set({ alerts: [] }),
    }),
    { name: "opencharts-alerts" },
  ),
);