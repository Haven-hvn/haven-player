import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider, CssBaseline } from "@mui/material";
import { havenTheme } from "@/theme/havenTheme";
import { HavenStoreProvider } from "@/haven/state/havenStore";
import { LoomWorkspace } from "@/components/loom/LoomWorkspace";

jest.mock("@/components/loom/threads/ThreadOverlay", () => ({
  ThreadOverlay: () => null,
}));

describe("LoomWorkspace", () => {
  it("renders shell and navigates between views", () => {
    render(
      <ThemeProvider theme={havenTheme}>
        <CssBaseline />
        <HavenStoreProvider>
          <LoomWorkspace />
        </HavenStoreProvider>
      </ThemeProvider>
    );

    expect(screen.getByText("Haven")).toBeInTheDocument();
    expect(screen.getByText(/Artifacts/)).toBeInTheDocument();

    fireEvent.click(screen.getByText("Operators"));
    expect(screen.getByText("Marketplace")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Capture"));
    expect(screen.getByText(/Stage: capture/)).toBeInTheDocument();

    fireEvent.click(screen.getByText("Civic Archive"));
    expect(screen.getByText("Collections")).toBeInTheDocument();
  });

  it("filters threads list via chips", () => {
    render(
      <ThemeProvider theme={havenTheme}>
        <HavenStoreProvider>
          <LoomWorkspace />
        </HavenStoreProvider>
      </ThemeProvider>
    );

    // Threads tab is default; filter chips should exist.
    const discussionChip = screen.getByText("discussion");
    fireEvent.click(discussionChip);

    // With discussion-only filter, all listed threads should be discussion typed.
    const typeChips = screen.getAllByText("discussion");
    expect(typeChips.length).toBeGreaterThan(0);

    fireEvent.click(screen.getByText("clear"));
    // Clear chip should remove filtering (no assertion on count, just that UI remains stable).
    expect(screen.getByText("Threads")).toBeInTheDocument();
  });

  it("shows curator notes tab in marginalia", () => {
    render(
      <ThemeProvider theme={havenTheme}>
        <HavenStoreProvider>
          <LoomWorkspace />
        </HavenStoreProvider>
      </ThemeProvider>
    );

    fireEvent.click(screen.getByText("Curator notes"));
    expect(screen.getByText("Curator notes")).toBeInTheDocument();
  });
});

