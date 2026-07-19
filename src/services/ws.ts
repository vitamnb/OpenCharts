/**
 * WebSocket client switch.
 *
 * OpenCharts ships in demo mode by default (bundled real OHLC, in-process
 * paper trading engine). When live mode is enabled, this module swaps the
 * DemoWsClient for KucoinWsClient, which connects to KuCoin's public
 * WebSocket feed for real-time market data.
 *
 * Both clients expose the same public surface (connect / subscribe /
 * subscribeAccounts / onStateChange / state / disconnect / reauthenticate),
 * so no consumer (MarketDataBridge, ConnectionIndicator, store, ...) needs
 * to change.
 *
 * Mode is controlled by the VITE_LIVE_DATA env var or localStorage flag
 * "oc_live_data". Set either to "true" to use KuCoin live data.
 */

import { DemoWsClient } from "./demo/wsClient";
import { kucoinWsClient } from "./kucoin/client";

export type ConnectionState = "connected" | "connecting" | "reconnecting" | "disconnected";
export type WsHandler = (event: unknown) => void;

// ── Mode detection ──

function detectLiveMode(): boolean {
  // Check env var first (build-time), then localStorage (runtime toggle)
  if (import.meta.env.VITE_LIVE_DATA === "true") return true;
  try {
    return localStorage.getItem("oc_live_data") === "true";
  } catch {
    return false;
  }
}

export function isLiveMode(): boolean {
  return detectLiveMode();
}

export function setLiveMode(enabled: boolean): void {
  try {
    localStorage.setItem("oc_live_data", enabled ? "true" : "false");
  } catch {
    // ignore
  }
  // Force reload so the ws client and API layer re-initialise
  window.location.reload();
}

export function getLiveDataStatus(): { live: boolean; provider: string } {
  return {
    live: detectLiveMode(),
    provider: detectLiveMode() ? "KuCoin" : "Demo",
  };
}

// ── Client selection ──

// We export a single wsClient that's either the demo or live client.
// The demo client is re-exported from here (was the original export).
// The live client is used when VITE_LIVE_DATA or localStorage says so.

const liveMode = detectLiveMode();

// In demo mode, use the existing DemoWsClient.
// In live mode, use the KucoinWsClient.
// Both implement the same interface.
const client = liveMode ? kucoinWsClient : new DemoWsClient();

export const wsClient = client;