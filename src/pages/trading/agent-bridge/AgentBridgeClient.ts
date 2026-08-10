// Agent Bridge Client
// Connects to the agent bridge WebSocket server, receives annotation
// messages, and renders them on the chart via the existing annotation API.

export interface AgentBridgeMessage {
  type: "annotation" | "indicator" | "analysis" | "clear";
  chartKey?: string;
  action: string;
  payload: Record<string, unknown>;
  agentId?: string;
  timestamp?: number;
  metadata?: {
    label?: string;
    category?: string;
    confidence?: number;
    expiresAt?: number;
  };
}

type Listener = (msg: AgentBridgeMessage) => void;

class AgentBridgeClient {
  private ws: WebSocket | null = null;
  private url: string;
  private listeners: Set<Listener> = new Set();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 1000;
  private maxReconnectDelay = 30000;
  private connected = false;

  constructor(url: string) {
    this.url = url;
  }

  connect(): void {
    if (this.ws) return;

    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        this.connected = true;
        this.reconnectDelay = 1000;
        console.log("[agent-bridge] connected");
      };

      this.ws.onclose = () => {
        this.connected = false;
        this.ws = null;
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        this.connected = false;
      };

      this.ws.onmessage = (event: MessageEvent) => {
        try {
          const msg: AgentBridgeMessage = JSON.parse(event.data);
          for (const listener of this.listeners) {
            listener(msg);
          }
        } catch {
          // ignore malformed messages
        }
      };
    } catch {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
      this.connect();
    }, this.reconnectDelay);
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }

  onMessage(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  isConnected(): boolean {
    return this.connected;
  }
}

// Singleton instance
export const agentBridge = new AgentBridgeClient("ws://127.0.0.1:18790/agent-bridge");