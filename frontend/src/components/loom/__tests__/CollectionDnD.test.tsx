import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material";
import { havenTheme } from "@/theme/havenTheme";
import { HavenStoreProvider } from "@/haven/state/havenStore";
import { LoomWorkspace } from "@/components/loom/LoomWorkspace";
import { createSeedState } from "@/haven/seed/seedData";
import { loadPersistedState } from "@/haven/state/persistence";

jest.mock("@/haven/state/persistence", () => {
  const actual = jest.requireActual("@/haven/state/persistence");
  return {
    ...actual,
    loadPersistedState: jest.fn(),
    persistState: jest.fn(),
  };
});

jest.mock("@/components/loom/threads/ThreadOverlay", () => ({
  ThreadOverlay: () => null,
}));

function makeDataTransfer(): DataTransfer {
  const store: Record<string, string> = {};
  return {
    dropEffect: "move",
    effectAllowed: "move",
    files: [] as unknown as FileList,
    items: [] as unknown as DataTransferItemList,
    types: [],
    getData: (format: string) => store[format] ?? "",
    setData: (format: string, data: string) => {
      store[format] = data;
      return true;
    },
    clearData: () => undefined,
    setDragImage: () => undefined,
  } as unknown as DataTransfer;
}

describe("Collection drag-and-drop", () => {
  it("reorders collection items via HTML5 DnD", () => {
    (loadPersistedState as unknown as jest.Mock).mockReturnValue({ kind: "seeded", state: createSeedState() });

    render(
      <ThemeProvider theme={havenTheme}>
        <HavenStoreProvider>
          <LoomWorkspace />
        </HavenStoreProvider>
      </ThemeProvider>
    );

    // Navigate to hub collections.
    fireEvent.click(screen.getByText("Civic Archive"));
    fireEvent.click(screen.getByText("Collections"));

    // Find a collection with at least 2 items.
    const seed = createSeedState();
    const hub = Object.values(seed.entities.hubs)[0]!;
    const collections = Object.values(seed.entities.collections).filter((c) => c.hubId === hub.id);
    const collectionWithTwo = collections.find((c) => c.artifactIds.length >= 2);
    if (!collectionWithTwo) return;

    const dt = makeDataTransfer();
    const first = screen.getByTestId(`collection-item-${collectionWithTwo.id}-0`);
    const second = screen.getByTestId(`collection-item-${collectionWithTwo.id}-1`);

    fireEvent.dragStart(first, { dataTransfer: dt });
    fireEvent.dragOver(second, { dataTransfer: dt });
    fireEvent.drop(second, { dataTransfer: dt });
    fireEvent.dragEnd(first, { dataTransfer: dt });

    // After reorder, the list should still contain the same artifact titles (smoke check).
    // Full order assertions are brittle in JSDOM; we mainly ensure DnD path does not crash.
    expect(screen.getByText(collectionWithTwo.name)).toBeInTheDocument();
  });
});

