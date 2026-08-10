import { useEffect, useRef, useState } from "react";
import { agentBridge, type AgentBridgeMessage } from "./AgentBridgeClient";
import { useAnnotationStore, buildAnnotation } from "../annotations/store";

// Category styling for agent annotations
const CATEGORY_COLORS: Record<string, string> = {
  smc: "#3B82F6",
  sr: "#A855F7",
  pattern: "#F97316",
  "trade-setup": "#22C55E",
  "indicator-dynamic": "#EAB308",
  "agent-note": "#6B7280",
};

const CATEGORY_PREFIX: Record<string, string> = {
  smc: "[SMC]",
  sr: "[S/R]",
  pattern: "[Pattern]",
  "trade-setup": "[Setup]",
  "indicator-dynamic": "[Div]",
  "agent-note": "[Note]",
};

interface UseAgentBridgeOptions {
  enabled: boolean;
  chartKey: string;
}

export function useAgentBridge({ enabled, chartKey }: UseAgentBridgeOptions) {
  const [bridgeConnected, setBridgeConnected] = useState(false);
  const [agentAnnotationsVisible, setAgentAnnotationsVisible] = useState(true);
  const [activeCategories, setActiveCategories] = useState<Set<string>>(
    new Set(["smc", "sr", "pattern", "trade-setup", "indicator-dynamic", "agent-note"])
  );
  const drawnIdsRef = useRef<Set<string>>(new Set());

  // Connect/disconnect WebSocket
  useEffect(() => {
    if (!enabled) {
      agentBridge.disconnect();
      setBridgeConnected(false);
      return;
    }

    let cancelled = false;

    agentBridge.connect();

    const interval = setInterval(() => {
      if (cancelled) return;
      setBridgeConnected(agentBridge.isConnected());
    }, 2000);

    return () => {
      cancelled = true;
      clearInterval(interval);
      // Don't disconnect on cleanup. The singleton client handles reconnection.
      // Only disconnect if the component is truly unmounting (not strict mode re-run).
      // We use a small delay so strict mode's re-mount can reuse the connection.
    };
  }, [enabled]);

  // Show/hide: toggle the visible field on all agent-drawn annotations
  useEffect(() => {
    const store = useAnnotationStore.getState();
    const allAnns = store.annotations[chartKey] ?? [];
    const agentAnns = allAnns.filter((a) => a.createdBy === "agent");
    if (agentAnns.length === 0) return;

    // Toggle visible on each agent annotation
    for (const ann of agentAnns) {
      useAnnotationStore.setState((state) => {
        const list = state.annotations[chartKey] ?? [];
        return {
          annotations: {
            ...state.annotations,
            [chartKey]: list.map((a) =>
              a.id === ann.id ? { ...a, visible: agentAnnotationsVisible } : a
            ),
          },
        };
      });
    }
  }, [agentAnnotationsVisible, chartKey]);

  // Listen for bridge messages
  useEffect(() => {
    if (!enabled) return;

    const removeListener = agentBridge.onMessage((msg: AgentBridgeMessage) => {
      // Accept all messages. Chart key filtering is handled by the annotation store.
      // Price-only annotations (horizontal lines) should work across all timeframes.

      const category = msg.metadata?.category ?? "agent-note";
      if (!activeCategories.has(category)) return;

      console.log("[agent-bridge] Received message:", msg.action, "payload:", msg.payload);

      // Handle clear action - clear both symbol and timeframe keys
      if (msg.type === "clear" || msg.action === "clearAll") {
        const symbolKey = chartKey.split(":")[0] ?? chartKey;
        useAnnotationStore.getState().clearAll(chartKey);
        useAnnotationStore.getState().clearAll(symbolKey);
        drawnIdsRef.current.clear();
        return;
      }

      if (msg.type !== "annotation" && msg.type !== "indicator" && msg.type !== "analysis") return;

      // Build annotation options from payload
      const payload = msg.payload ?? {};
      const categoryColor = CATEGORY_COLORS[category] ?? "#6B7280";
      const prefix = CATEGORY_PREFIX[category] ?? "[Agent]";
      const label = msg.metadata?.label ? `${prefix} ${msg.metadata.label}` : prefix;

      // Merge category-based styling. Agent annotations are editable by default.
      const options: Record<string, unknown> = {
        ...payload,
        color: payload.color ?? categoryColor,
        title: payload.title ?? label,
        editable: payload.editable ?? true,
      };

      // Price-only annotations use symbol-only key so they persist across timeframes.
      // Time-based annotations use the full symbol:timeframe key.
      const PRICE_ONLY_ACTIONS = new Set(["addHorizontalLine", "addHorizontalRay", "addBand"]);
      const isPriceOnly = PRICE_ONLY_ACTIONS.has(msg.action);
      const targetKey = isPriceOnly ? (chartKey.split(":")[0] ?? chartKey) : chartKey;

      try {
        // Map action names to annotation kinds
        const kindMap: Record<string, string> = {
          addHorizontalLine: "horizontalLine",
          addTrendLine: "trendLine",
          addRectangle: "rectangle",
          addText: "textLabel",
          addVerticalLine: "verticalLine",
          addBand: "band",
          addMarker: "marker",
        };

        const kind = kindMap[msg.action] ?? msg.action;
        const ann = buildAnnotation(kind as any, options, "agent");
        const id = useAnnotationStore.getState().add(targetKey, ann);
        if (id) {
          drawnIdsRef.current.add(id);
          console.log("[agent-bridge] Drew annotation id:", id, "on key:", targetKey);
        }
      } catch (e) {
        console.error("[agent-bridge] Drawing error:", e);
      }
    });

    return () => {
      removeListener();
    };
  }, [enabled, chartKey, activeCategories]);

  const toggleCategory = (category: string) => {
    setActiveCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const clearAgentAnnotations = () => {
    const symbolKey = chartKey.split(":")[0] ?? chartKey;
    useAnnotationStore.getState().clearAll(chartKey);
    useAnnotationStore.getState().clearAll(symbolKey);
    drawnIdsRef.current.clear();
  };

  return {
    bridgeConnected,
    agentAnnotationsVisible,
    setAgentAnnotationsVisible,
    activeCategories,
    toggleCategory,
    clearAgentAnnotations,
  };
}