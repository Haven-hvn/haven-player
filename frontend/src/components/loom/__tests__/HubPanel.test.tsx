import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider, Box } from "@mui/material";
import { havenTheme } from "@/theme/havenTheme";
import { HavenStoreProvider } from "@/haven/state/havenStore";
import { HubPanel } from "@/components/loom/HubPanel";
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

describe("HubPanel", () => {
  it("renders members tab and allows role change controls to appear (UI gating)", () => {
    // Ensure provider uses a deterministic seed.
    (loadPersistedState as unknown as jest.Mock).mockReturnValue({ kind: "seeded", state: createSeedState() });

    const seed = createSeedState();
    const hubId = Object.values(seed.entities.hubs)[0]!.id;

    render(
      <ThemeProvider theme={havenTheme}>
        <HavenStoreProvider>
          <HubPanel hubId={hubId} />
        </HavenStoreProvider>
      </ThemeProvider>
    );

    fireEvent.click(screen.getByText("Members & Roles"));
    expect(screen.getByText("Add member")).toBeInTheDocument();
    // Role selects exist for current members.
    expect(screen.getAllByText("Role").length).toBeGreaterThan(0);
  });

  it("renders hub reciprocity prompts and clicking verify triggers a toast", () => {
    (loadPersistedState as unknown as jest.Mock).mockReturnValue({ kind: "seeded", state: createSeedState() });
    const seed = createSeedState();
    const hubId = Object.values(seed.entities.hubs)[0]!.id;

    render(
      <ThemeProvider theme={havenTheme}>
        <HavenStoreProvider>
          {/* LoomWorkspace hosts the Snackbar toast UI */}
          <LoomWorkspace />
          <Box sx={{ display: "none" }}>
            <HubPanel hubId={hubId} />
          </Box>
        </HavenStoreProvider>
      </ThemeProvider>
    );

    // Navigate to the hub view using the Navigator.
    fireEvent.click(screen.getByText("Civic Archive"));
    expect(screen.getByText("Reciprocity prompts")).toBeInTheDocument();

    // Click verify prompt.
    fireEvent.click(screen.getAllByText("Do it")[0]!);
    expect(screen.getByText(/Verified/)).toBeInTheDocument();
  });
});

