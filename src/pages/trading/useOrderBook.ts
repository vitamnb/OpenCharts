import { useEffect, useRef, useState, useCallback } from "react";
import { toKucoinSymbol } from "../../services/kucoin/symbols";
import { fetchBulletPublic } from "../../services/kucoin/rest";

// ── Types ────────────────────────────────────────────────────────────────────

/** A single price level in the order book. */
export interface OrderBookLevel {
  price: number;
  size: number;
}

/** A snapshot of the order book at a point in time. */
export interface OrderBookSnapshot {
  /** Unix milliseconds when this snapshot was captured. */
  timestamp: number;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
}

/** Ring buffer of recent order book snapshots for heatmap rendering. */
export interface OrderBookHistory {
  snapshots: OrderBookSnapshot[];
}

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_SNAPSHOTS = 150;
const DEPTH = 100;
const SNAPSHOT_INTERVAL_MS = 500;
const REST_BASE = import.meta.env.DEV ? "/kucoin" : "https://api.kucoin.com";

// ── REST: fetch initial order book snapshot ──────────────────────────────────

interface KucoinOrderBookResponse {
  code: string;
  data: {
    bids: [string, string][];
    asks: [string, string][];
    time: number;
  };
}

async function fetchOrderBookSnapshot(symbol: string): Promise<OrderBookSnapshot | null> {
  const kcSymbol = toKucoinSymbol(symbol);
  const url = `${REST_BASE}/api/v1/market/orderbook/level2/depth?symbol=${kcSymbol}&depth=${DEPTH}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = (await res.json()) as KucoinOrderBookResponse;
    if (json.code !== "200000") return null;
    const ts = Date.now();
    return {
      timestamp: ts,
      bids: json.data.bids.map(([p, s]) => ({ price: Number(p), size: Number(s) })),
      asks: json.data.asks.map(([p, s]) => ({ price: Number(p), size: Number(s) })),
    };
  } catch {
    return null;
  }
}

// ── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Connects to KuCoin's order book level2 WebSocket and maintains a ring buffer
 * of snapshots over time. The WebSocket delivers incremental changes which
 * are applied to a working snapshot. A timer periodically promotes the working
 * snapshot into the ring buffer for the heatmap to render.
 *
 * @param symbol OpenCharts symbol (e.g. "BTCUSD")
 * @param enabled Whether the hook should actively collect data
 * @returns Ring buffer of order book snapshots
 */
export function useOrderBook(symbol: string, enabled: boolean): OrderBookHistory {
  const [snapshots, setSnapshots] = useState<OrderBookSnapshot[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const promoteTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const workingBidsRef = useRef<Map<number, number>>(new Map());
  const workingAsksRef = useRef<Map<number, number>>(new Map());
  const lastSnapshotTimeRef = useRef<number>(0);
  const intentionalCloseRef = useRef(false);
  const reconnectAttemptsRef = useRef(0);

  const promoteSnapshot = useCallback(() => {
    const now = Date.now();
    if (now - lastSnapshotTimeRef.current < SNAPSHOT_INTERVAL_MS) return;
    lastSnapshotTimeRef.current = now;

    const bids: OrderBookLevel[] = [];
    for (const [price, size] of workingBidsRef.current) {
      if (size > 0) bids.push({ price, size });
    }
    bids.sort((a, b) => b.price - a.price);

    const asks: OrderBookLevel[] = [];
    for (const [price, size] of workingAsksRef.current) {
      if (size > 0) asks.push({ price, size });
    }
    asks.sort((a, b) => a.price - b.price);

    const snap: OrderBookSnapshot = { timestamp: now, bids, asks };
    setSnapshots((prev) => {
      const next = [...prev, snap];
      if (next.length > MAX_SNAPSHOTS) next.shift();
      return next;
    });
  }, []);

  const connect = useCallback(async () => {
    if (!enabled) return;
    intentionalCloseRef.current = false;

    try {
      // Fetch initial snapshot via REST
      const initial = await fetchOrderBookSnapshot(symbol);
      if (!initial) {
        scheduleReconnect();
        return;
      }

      // Seed working maps from REST snapshot
      workingBidsRef.current = new Map(initial.bids.map((l) => [l.price, l.size]));
      workingAsksRef.current = new Map(initial.asks.map((l) => [l.price, l.size]));
      lastSnapshotTimeRef.current = Date.now();

      // Fetch WS bullet for connection
      const bullet = await fetchBulletPublic();
      const wsUrl = `${bullet.endpoint}?token=${bullet.token}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectAttemptsRef.current = 0;
        // Subscribe to level2 channel
        const kcSymbol = toKucoinSymbol(symbol);
        ws.send(
          JSON.stringify({
            id: Date.now(),
            type: "subscribe",
            topic: `/market/level2:${kcSymbol}`,
            privateChannel: false,
            response: true,
          }),
        );
        // Start ping
        pingTimerRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ id: Date.now(), type: "ping" }));
          }
        }, bullet.pingInterval);
        // Start snapshot promotion timer
        promoteTimerRef.current = setInterval(promoteSnapshot, SNAPSHOT_INTERVAL_MS);
      };

      ws.onmessage = (event) => {
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(event.data as string);
        } catch {
          return;
        }
        if (msg.type === "ack" || msg.type === "pong" || msg.type === "welcome") return;
        if (msg.type === "message" && msg.subject === "trade.l2update") {
          // L2 update: data contains changes array
          const data = msg.data as { changes: [string, string, string][] };
          if (!data?.changes) return;
          for (const [side, priceStr, sizeStr] of data.changes) {
            const price = Number(priceStr);
            const size = Number(sizeStr);
            if (Number.isNaN(price)) continue;
            if (side === "buy") {
              if (size === 0) workingBidsRef.current.delete(price);
              else workingBidsRef.current.set(price, size);
            } else if (side === "sell") {
              if (size === 0) workingAsksRef.current.delete(price);
              else workingAsksRef.current.set(price, size);
            }
          }
        }
      };

      ws.onclose = () => {
        stopTimers();
        if (!intentionalCloseRef.current) scheduleReconnect();
      };

      ws.onerror = () => {
        // close handler will reconnect
      };
    } catch {
      scheduleReconnect();
    }
  }, [symbol, enabled, promoteSnapshot]);

  const scheduleReconnectRef = useRef<() => void>(() => {});

  const scheduleReconnect = useCallback(() => {
    if (intentionalCloseRef.current) return;
    reconnectAttemptsRef.current++;
    const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
    reconnectTimerRef.current = setTimeout(() => {
      void scheduleReconnectRef.current();
    }, delay);
  }, []);

  // Update the ref to point to the latest connect function
  useEffect(() => {
    scheduleReconnectRef.current = connect;
  }, [connect]);

  const stopTimers = useCallback(() => {
    if (pingTimerRef.current) {
      clearInterval(pingTimerRef.current);
      pingTimerRef.current = null;
    }
    if (promoteTimerRef.current) {
      clearInterval(promoteTimerRef.current);
      promoteTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      // Cleanup on disable
      intentionalCloseRef.current = true;
      stopTimers();
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      workingBidsRef.current.clear();
      workingAsksRef.current.clear();
      setSnapshots([]);
      return;
    }

    // Reset state for new symbol
    setSnapshots([]);
    workingBidsRef.current.clear();
    workingAsksRef.current.clear();
    reconnectAttemptsRef.current = 0;
    void connect();

    return () => {
      intentionalCloseRef.current = true;
      stopTimers();
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [symbol, enabled, connect, stopTimers, scheduleReconnect]);

  return { snapshots };
}
