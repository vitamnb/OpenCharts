// useAnnotations — React hook that wires the annotation store, renderer, and API into ChartPanel
import { useEffect, useRef } from "react";
import { useAnnotationStore } from "./store";
import { AnnotationRenderer } from "./renderer";
import { mountAnnotationApi, setCurrentChartKey } from "./api";
import { chartKey as makeChartKey } from "./types";
import type { IChartApi, ISeriesApi } from "lightweight-charts";

export function useAnnotations(
  chartRef: React.RefObject<IChartApi | null>,
  candleSeriesRef: React.RefObject<ISeriesApi<"Candlestick"> | null>,
  symbol: string,
  timeframe: string,
): void {
  const rendererRef = useRef<AnnotationRenderer | null>(null);
  const currentKeyRef = useRef<string>("");

  // Mount the window API once
  useEffect(() => {
    mountAnnotationApi();
    return () => {
      // Don't unmount on every render — keep the API persistent
      // Only unmount if the component is truly unmounting (hard to detect with refs)
      // For now, leave it mounted. It's idempotent.
    };
  }, []);

  // Update chart key when symbol/timeframe changes
  useEffect(() => {
    const key = makeChartKey(symbol, timeframe);
    currentKeyRef.current = key;
    setCurrentChartKey(key);
  }, [symbol, timeframe]);

  // Create renderer when chart is ready, sync annotations on store changes
  useEffect(() => {
    const chart = chartRef.current;
    const candleSeries = candleSeriesRef.current;
    if (!chart || !candleSeries) return;

    // Create or update renderer
    if (!rendererRef.current) {
      rendererRef.current = new AnnotationRenderer(chart, candleSeries);
    } else {
      rendererRef.current.updateRefs(chart, candleSeries);
    }

    // Sync initial annotations for this chart key, plus symbol-level (price-only) annotations
    const key = currentKeyRef.current;
    if (key) {
      const symbolKey = symbol; // symbol-only key for cross-timeframe annotations
      const tfAnnotations = useAnnotationStore.getState().list(key);
      const symbolAnnotations = useAnnotationStore.getState().list(symbolKey);
      console.log(`[annotations] Initial sync for key=${key}, symbolKey=${symbolKey}, tfCount=${tfAnnotations.length}, symbolCount=${symbolAnnotations.length}`);
      rendererRef.current.sync([...tfAnnotations, ...symbolAnnotations]);
    }

    // Subscribe to store changes
    const unsubscribe = useAnnotationStore.subscribe((state, prevState) => {
      const key = currentKeyRef.current;
      if (!key) return;
      const symbolKey = symbol;
      
      // Check if annotations for this chart key or symbol key changed
      const current = [...(state.annotations[key] ?? []), ...(state.annotations[symbolKey] ?? [])];
      const previous = [...(prevState.annotations[key] ?? []), ...(prevState.annotations[symbolKey] ?? [])];
      
      // Quick length check first
      if (current.length !== previous.length) {
        rendererRef.current?.sync(current);
        return;
      }
      
      // Deep compare (IDs and visibility)
      const currentIds = current.map((a) => `${a.id}:${a.visible}`).join(",");
      const previousIds = previous.map((a) => `${a.id}:${a.visible}`).join(",");
      if (currentIds !== previousIds) {
        console.log(`[annotations] Store change detected for key=${key}, symbolKey=${symbolKey}, count=${current.length}`);
        rendererRef.current?.sync(current);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [chartRef, candleSeriesRef, symbol, timeframe]);

  // Cleanup renderer on unmount
  useEffect(() => {
    return () => {
      rendererRef.current?.clear();
      rendererRef.current = null;
    };
  }, []);
}