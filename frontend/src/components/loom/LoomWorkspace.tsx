import React, { useMemo } from "react";
import { Alert, Box, Snackbar } from "@mui/material";
import { glassPanelSx } from "@/theme/havenTheme";
import { NavigatorPanel } from "@/components/loom/NavigatorPanel";
import { CanvasPanel } from "@/components/loom/CanvasPanel";
import { MarginaliaRail } from "@/components/loom/MarginaliaRail";
import { TopCommandBar } from "@/components/loom/TopCommandBar";
import { useHavenStore } from "@/haven/state/havenStore";
import { ThreadOverlay } from "@/components/loom/threads/ThreadOverlay";

export function LoomWorkspace(): React.ReactElement {
  const { state, dispatch } = useHavenStore();

  const title = useMemo(() => {
    switch (state.selection.view.kind) {
      case "library":
        return "Library";
      case "pipeline":
        return "Pipeline";
      case "hub":
        return "Hub";
      case "operators":
        return "Operators";
      case "profile":
        return "Profile";
      default: {
        const _exhaustive: never = state.selection.view;
        return _exhaustive;
      }
    }
  }, [state.selection.view]);

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: "300px 1fr 360px",
        gridTemplateRows: "56px 1fr",
        height: "100vh",
        padding: 2,
        gap: 2,
        boxSizing: "border-box",
      }}
    >
      <Box
        sx={{
          gridColumn: "1 / 4",
          gridRow: "1",
          ...glassPanelSx,
          borderRadius: 18,
          overflow: "hidden",
        }}
      >
        <TopCommandBar title={title} />
      </Box>

      <Box
        sx={{
          gridColumn: "1",
          gridRow: "2",
          ...glassPanelSx,
          borderRadius: 18,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <NavigatorPanel />
      </Box>

      <Box
        sx={{
          gridColumn: "2",
          gridRow: "2",
          ...glassPanelSx,
          borderRadius: 18,
          overflow: "hidden",
          position: "relative",
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
        }}
      >
        <CanvasPanel />
      </Box>

      <Box
        sx={{
          gridColumn: "3",
          gridRow: "2",
          ...glassPanelSx,
          borderRadius: 18,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
        }}
      >
        <MarginaliaRail />
      </Box>

      {/* Loom threads overlay spanning canvas + marginalia */}
      <Box
        sx={{
          gridColumn: "2 / 4",
          gridRow: "2",
          position: "relative",
          zIndex: 5,
          // Only capture pointer events when the user is in “Threads” mode,
          // so normal UI interactions remain frictionless.
          pointerEvents: state.selection.activeMarginaliaTab === "threads" ? "auto" : "none",
        }}
      >
        <Box sx={{ position: "absolute", inset: 0 }}>
          <ThreadOverlay />
        </Box>
      </Box>

      <Snackbar
        open={Boolean(state.ui.lastToast)}
        autoHideDuration={2600}
        onClose={() => dispatch({ type: "toast:clear" })}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          variant="filled"
          severity="info"
          onClose={() => dispatch({ type: "toast:clear" })}
          sx={{ width: "100%" }}
        >
          {state.ui.lastToast?.message ?? ""}
        </Alert>
      </Snackbar>
    </Box>
  );
}

