/**
 * API facade.
 *
 * OpenCharts runs without a backend: all real data the terminal needs is served
 * by the in-browser demo layer (services/demo) or, when live mode is enabled,
 * by KuCoin REST + WebSocket (services/kucoin + services/live).
 *
 * `api` is the active implementation wrapped in a Proxy whose fallback returns
 * a benign async no-op for any method not implemented — so leftover calls from
 * non-terminal code resolve harmlessly instead of throwing network errors.
 */

import { demoApi } from "./demo/api.ts";
import { liveApi } from "./live/api.ts";
import { isLiveMode } from "./ws.ts";

export const API_BASE = "";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

// Select the active API based on live mode flag
const activeApi = isLiveMode() ? liveApi : demoApi;

// react-query rejects `undefined` query results, so resolve to null instead.
const benign = () => Promise.resolve(null);

export const api = new Proxy(activeApi as Record<string, unknown>, {
  get(target, prop: string) {
    if (prop in target) return target[prop];
    return benign;
  },
}) as typeof demoApi & Record<string, (...args: never[]) => Promise<unknown>>;