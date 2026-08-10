// Annotation Zustand store — scoped by chart key
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Annotation, AnnotationKind, chartKey as _ck } from "./types";

const MAX_STORAGE_BYTES = 1_000_000; // 1MB per chart key

function genId(): string {
  return `ann_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

interface AnnotationState {
  /** All annotations across all chart keys */
  annotations: Record<string, Annotation[]>;
  /** Add an annotation to a chart key */
  add: (chartKey: string, ann: Omit<Annotation, "chartKey" | "createdAt"> & { id?: string }) => string;
  /** Remove one annotation by id */
  remove: (id: string) => void;
  /** Remove all annotations in a group for a chart key */
  clearGroup: (chartKey: string, group: string) => void;
  /** Remove all annotations for a chart key */
  clearAll: (chartKey: string) => void;
  /** Get annotations for a chart key */
  list: (chartKey: string) => Annotation[];
  /** Get a snapshot of all annotations for a chart key */
  snapshot: (chartKey: string) => Annotation[];
  /** Restore from a snapshot */
  restore: (chartKey: string, snap: Annotation[]) => void;
  /** Internal: rebuild from persisted state */
  _rehydrate: () => void;
}

export const useAnnotationStore = create<AnnotationState>()(
  persist(
    (set, get) => ({
      annotations: {},

      add: (chartKey, ann) => {
        const id = ann.id ?? genId();
        const full: Annotation = {
          ...ann,
          id,
          chartKey,
          createdAt: Date.now(),
        };
        set((state) => {
          const list = state.annotations[chartKey] ?? [];
          // Enforce storage size limit
          const updated = [...list, full];
          const serialized = JSON.stringify(updated);
          if (serialized.length > MAX_STORAGE_BYTES) {
            // Drop oldest annotations to stay under limit
            const trimmed = updated.slice(Math.max(1, Math.floor(updated.length * 0.8)));
            return { annotations: { ...state.annotations, [chartKey]: trimmed } };
          }
          return { annotations: { ...state.annotations, [chartKey]: updated } };
        });
        return id;
      },

      remove: (id) => {
        set((state) => {
          const next: Record<string, Annotation[]> = {};
          for (const [key, list] of Object.entries(state.annotations)) {
            next[key] = list.filter((a) => a.id !== id);
          }
          return { annotations: next };
        });
      },

      clearGroup: (chartKey, group) => {
        set((state) => {
          const list = state.annotations[chartKey] ?? [];
          return {
            annotations: {
              ...state.annotations,
              [chartKey]: list.filter((a) => a.group !== group),
            },
          };
        });
      },

      clearAll: (chartKey) => {
        set((state) => ({
          annotations: { ...state.annotations, [chartKey]: [] },
        }));
      },

      list: (chartKey) => {
        return get().annotations[chartKey] ?? [];
      },

      snapshot: (chartKey) => {
        return get().annotations[chartKey] ?? [];
      },

      restore: (chartKey, snap) => {
        set((state) => ({
          annotations: { ...state.annotations, [chartKey]: snap },
        }));
      },

      _rehydrate: () => {
        // Trigger persist rehydration
        get()._rehydrate?.();
      },
    }),
    {
      name: "opencharts-annotations",
      storage: createJSONStorage(() => localStorage),
      // Only persist the annotations map
      partialize: (state) => ({ annotations: state.annotations }),
    },
  ),
);

// Helper to build an annotation from options
export function buildAnnotation(
  kind: AnnotationKind,
  options: Record<string, unknown>,
  createdBy: "agent" | "user" = "agent",
): Omit<Annotation, "chartKey" | "createdAt"> & { id?: string } {
  const base = {
    kind,
    group: (options.group as string) ?? "default",
    title: options.title as string | undefined,
    color: (options.color as string) ?? "#2196F3",
    lineStyle: (options.lineStyle as Annotation["lineStyle"]) ?? 0,
    lineWidth: (options.lineWidth as number) ?? 1,
    visible: options.visible ?? true,
    editable: options.editable ?? false,
    locked: options.locked ?? false,
    createdBy,
  };

  // Extract kind-specific fields
  const fields: Record<string, unknown> = {};
  const known = new Set([
    "id", "group", "title", "color", "lineStyle", "lineWidth",
    "visible", "editable", "locked",
  ]);
  for (const [k, v] of Object.entries(options)) {
    if (!known.has(k)) fields[k] = v;
  }

  return { ...base, ...fields } as Omit<Annotation, "chartKey" | "createdAt"> & { id?: string };
}