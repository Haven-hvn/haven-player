import React, { createContext, useContext, useEffect, useMemo, useReducer } from "react";
import type { HavenState } from "@/haven/model/types";
import { createSeedState } from "@/haven/seed/seedData";
import { havenReducer, type HavenAction } from "@/haven/state/havenReducer";
import { loadPersistedState, persistState } from "@/haven/state/persistence";

export interface HavenStore {
  state: HavenState;
  dispatch: React.Dispatch<HavenAction>;
}

const HavenStoreContext = createContext<HavenStore | null>(null);

export function HavenStoreProvider(props: { children: React.ReactNode }): React.ReactElement {
  const initial = useMemo((): HavenState => {
    if (typeof window === "undefined") {
      return createSeedState();
    }
    const loaded = loadPersistedState();
    return loaded.state;
  }, []);

  const [state, dispatch] = useReducer(havenReducer, initial);

  useEffect(() => {
    if (typeof window === "undefined") return;
    persistState(state);
  }, [state]);

  const value = useMemo<HavenStore>(() => ({ state, dispatch }), [state]);

  return <HavenStoreContext.Provider value={value}>{props.children}</HavenStoreContext.Provider>;
}

export function useHavenStore(): HavenStore {
  const ctx = useContext(HavenStoreContext);
  if (!ctx) {
    throw new Error("useHavenStore must be used within HavenStoreProvider");
  }
  return ctx;
}

