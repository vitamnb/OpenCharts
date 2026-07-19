/**
 * KuCoin WebSocket client.
 *
 * Implements the same public surface as DemoWsClient so MarketDataBridge,
 * ConnectionIndicator, and the store don't need any changes.
 *
 * Flow:
 * 1. POST /api/v1/bullet-public to get a temporary token + WS endpoint
 * 2. Connect to wss://endpoint?token=...[&acceptCountry=...]
 * 3. Send subscribe messages for /market/ticker and /market/candles
 * 4. Parse incoming messages and publish to the same "market-data" channel
 *    that MarketDataBridge listens on
 * 5. Ping every pingInterval to keep the connection alive
 *
 * No API key required for public market data channels.
 */

import { fetchBulletPublic } from "./rest";
import { toKucoinSymbol, toKucoinTimeframe, fromKucoinSymbol, fromKucoinTimeframe } from "./symbols";

// Connection states match the shared interface from ws.ts
export type ConnectionState = "connected" | "connecting" | "reconnecting" | "disconnected";
export type WsHandler = (event: unknown) => void;


interface KucoinWsMessage {
  type: string;
  topic: string;
  subject: string;
  data: Record<string, unknown>;
  id?: string;
}

interface Subscription {
  symbol: string;
  timeframe: string;
}

type ChannelHandler = (event: unknown) => void;

// Minimal event bus to match the demo bus interface.
// We could import from demo/bus.ts but keeping this self-contained
// means the live client has zero dependency on demo code.
const channels = new Map<string, Set<ChannelHandler>>();

function publish(channel: string, event: unknown): void {
  const set = channels.get(channel);
  if (!set) return;
  for (const handler of set) handler(event);
}

function subscribeChannel(channel: string, handler: ChannelHandler): () => void {
  let set = channels.get(channel);
  if (!set) {
    set = new Set();
    channels.set(channel, set);
  }
  set.add(handler);
  return () => {
    set?.delete(handler);
  };
}

class KucoinWsClient {
  private _state: ConnectionState = "disconnected";
  private stateListeners = new Set<(s: ConnectionState) => void>();
  private ws: WebSocket | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private token: string | null = null;
  private endpoint: string | null = null;
  private pingInterval = 18000;
  // pingTimeout returned by API. Used for connection health monitoring.
  public pingTimeout = 10000;

  // What we're subscribed to. Updated via setSymbolInterest.
  private subscriptions: Subscription[] = [];

  // Track whether we've been intentionally disconnected
  private intentionalDisconnect = false;

  // Reconnect backoff
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT_DELAY = 30000;

  get state(): ConnectionState {
    return this._state;
  }

  private setState(next: ConnectionState): void {
    this._state = next;
    for (const cb of this.stateListeners) cb(next);
  }

  async connect(_token?: string): Promise<void> {
    this.intentionalDisconnect = false;
    this.setState("connecting");

    try {
      const bullet = await fetchBulletPublic();
      this.token = bullet.token;
      this.endpoint = bullet.endpoint;
      this.pingInterval = bullet.pingInterval;
      this.pingTimeout = bullet.pingTimeout;

      const wsUrl = `${this.endpoint}?token=${this.token}`;
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.setState("connected");
        this.reconnectAttempts = 0;
        this.startPing();
        this.resubscribeAll();
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data as string);
      };

      this.ws.onerror = () => {
        // Error will be followed by close, which triggers reconnect
      };

      this.ws.onclose = () => {
        this.stopPing();
        if (!this.intentionalDisconnect) {
          this.scheduleReconnect();
        } else {
          this.setState("disconnected");
        }
      };
    } catch (err) {
      this.setState("reconnecting");
      this.scheduleReconnect();
    }
  }

  disconnect(): void {
    this.intentionalDisconnect = true;
    this.stopPing();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.setState("disconnected");
  }

  reauthenticate(_token: string): void {
    // Public channels don't need auth refresh.
    // If we later add private channels, this would re-fetch bullet and reconnect.
  }

  subscribe(channel: string, handler: WsHandler): () => void {
    return subscribeChannel(channel, handler);
  }

  subscribeAccounts(_accountIds: string[]): void {
    // Account events require private channels (auth needed).
    // Not implemented in the public-only client. Paper trading engine
    // still handles account/position/order events in demo mode.
  }

  /**
   * Set which symbols the client should stream.
   * Called by the app when the user switches charts or timeframes.
   * Unsubscribes from old topics, then subscribes to new ones.
   * Subscribes to ticker for live bids/asks plus candle updates
   * for the active timeframe.
   */
  setSymbolInterest(symbols: string[], timeframe?: string): void {
    const tf = timeframe ?? "1m";

    // Unsubscribe from old candle topics (keep ticker, it'll be re-subscribed)
    if (this.ws && this._state === "connected") {
      for (const sub of this.subscriptions) {
        const kcSymbol = toKucoinSymbol(sub.symbol);
        const kcType = toKucoinTimeframe(sub.timeframe);
        this.sendUnsubscribe(`/market/candles:${kcSymbol}_${kcType}`);
      }
    }

    const newSubs: Subscription[] = [];
    for (const symbol of symbols) {
      newSubs.push({ symbol, timeframe: tf });
    }
    this.subscriptions = newSubs;

    // If connected, subscribe immediately
    if (this.ws && this._state === "connected") {
      this.resubscribeAll();
    }
  }

  onStateChange(cb: (s: ConnectionState) => void): () => void {
    this.stateListeners.add(cb);
    cb(this._state);
    return () => {
      this.stateListeners.delete(cb);
    };
  }

  // ── Internal ──

  private startPing(): void {
    this.stopPing();
    // KuCoin requires ping messages to keep the connection alive.
    // Ping interval is returned by the bullet endpoint (typically 18s).
    this.pingTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ id: Date.now(), type: "ping" }));
      }
    }, this.pingInterval);
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private scheduleReconnect(): void {
    this.setState("reconnecting");
    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), this.MAX_RECONNECT_DELAY);
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  private resubscribeAll(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    // Subscribe to ticker for each symbol
    const tickerSymbols = this.subscriptions
      .map((s) => toKucoinSymbol(s.symbol))
      .join(",");

    if (tickerSymbols) {
      this.sendSubscribe(`/market/ticker:${tickerSymbols}`);
    }

    // Subscribe to candles for each symbol/timeframe
    for (const sub of this.subscriptions) {
      const kcSymbol = toKucoinSymbol(sub.symbol);
      const kcType = toKucoinTimeframe(sub.timeframe);
      this.sendSubscribe(`/market/candles:${kcSymbol}_${kcType}`);
    }
  }

  private sendSubscribe(topic: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(
      JSON.stringify({
        id: Date.now(),
        type: "subscribe",
        topic,
        privateChannel: false,
        response: true,
      }),
    );
  }

  private sendUnsubscribe(topic: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(
      JSON.stringify({
        id: Date.now(),
        type: "unsubscribe",
        topic,
        privateChannel: false,
        response: true,
      }),
    );
  }

  private handleMessage(raw: string): void {
    let msg: KucoinWsMessage;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    // Ack messages: ignore
    if (msg.type === "ack") return;
    // Pong messages: ignore
    if (msg.type === "pong") return;

    // Welcome message
    if (msg.type === "welcome") return;

    // Market data messages
    if (msg.type === "message") {
      this.handleMarketData(msg);
    }
  }

  private handleMarketData(msg: KucoinWsMessage): void {
    // Ticker: /market/ticker:BTC-USDT
    if (msg.subject === "trade.ticker") {
      const data = msg.data as {
        price: string;
        bestBid: string;
        bestAsk: string;
        size: string;
        Time: string;
      };
      // Extract the symbol from the topic: /market/ticker:BTC-USDT
      const kcSymbol = msg.topic.split(":")[1];
      if (!kcSymbol) return;
      const symbol = fromKucoinSymbol(kcSymbol);

      publish("market-data", {
        eventType: "MarketTick",
        symbol,
        bid: Number(data.bestBid),
        ask: Number(data.bestAsk),
        occurredAt: Number(data.Time),
      });
      return;
    }

    // Candle update: /market/candles:BTC-USDT_1hour
    if (msg.subject === "trade.candles.update") {
      const data = msg.data as {
        symbol: string;
        candles: string[];
        time: string;
      };
      // Parse the candle array: [startTime, open, close, high, low, volume, turnover]
      const candles = data.candles;
      if (!candles || candles.length < 6) return;

      // Extract symbol and timeframe from topic: /market/candles:BTC-USDT_1hour
      const topicPart = msg.topic.split(":")[1];
      if (!topicPart) return;
      const [kcSymbol, kcType] = topicPart.split("_");
      if (!kcSymbol || !kcType) return;

      const symbol = fromKucoinSymbol(kcSymbol);
      const timeframe = fromKucoinTimeframe(kcType);

      publish("market-data", {
        eventType: "CandleUpdate",
        symbol,
        timeframe,
        open: Number(candles[1]),
        close: Number(candles[2]),
        high: Number(candles[3]),
        low: Number(candles[4]),
        volume: Number(candles[5]),
        timestamp: Number(candles[0]) * 1000, // convert seconds to ms
      });
      return;
    }
  }

  /** Allow external code to push events through the same channel (parity with DemoWsClient). */
  emit(channel: string, event: unknown): void {
    publish(channel, event);
  }
}

export const kucoinWsClient = new KucoinWsClient();