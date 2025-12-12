import type { HavenState } from "@/haven/model/types";
import { createSeedState } from "@/haven/seed/seedData";

const STORAGE_KEY = "haven-player:havenState:v1";

export type PersistenceResult =
  | { kind: "loaded"; state: HavenState }
  | { kind: "seeded"; state: HavenState }
  | { kind: "failed"; state: HavenState; reason: string };

export function loadPersistedState(): PersistenceResult {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { kind: "seeded", state: createSeedState() };
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!isHavenState(parsed)) {
      return {
        kind: "failed",
        state: createSeedState(),
        reason: "Invalid persisted state shape; reseeded.",
      };
    }
    return { kind: "loaded", state: parsed };
  } catch (error) {
    return {
      kind: "failed",
      state: createSeedState(),
      reason: error instanceof Error ? error.message : "Unknown persistence error",
    };
  }
}

export function persistState(state: HavenState): void {
  const payload = JSON.stringify(state);
  localStorage.setItem(STORAGE_KEY, payload);
}

// Lightweight runtime guard (kept intentionally minimal; state is typed at compile time).
function isHavenState(value: unknown): value is HavenState {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Partial<HavenState>;
  if (typeof v !== "object") return false;
  if (!v.entities || !v.selection || !v.filters || !v.ui) return false;
  // Essential collections
  if (typeof v.entities !== "object" || v.entities === null) return false;
  if (typeof v.selection !== "object" || v.selection === null) return false;
  if (typeof v.filters !== "object" || v.filters === null) return false;
  if (typeof v.ui !== "object" || v.ui === null) return false;
  return true;
}

