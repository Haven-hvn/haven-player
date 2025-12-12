import React, { useCallback, useMemo } from "react";
import { Box, Divider, List, ListItemButton, ListItemText, Typography } from "@mui/material";
import { useHavenStore } from "@/haven/state/havenStore";
import type { Hub } from "@/haven/model/types";
import { pipelineStageLabel } from "@/haven/state/havenReducer";

export function NavigatorPanel(): React.ReactElement {
  const { state, dispatch } = useHavenStore();

  const hubs = useMemo(() => Object.values(state.entities.hubs), [state.entities.hubs]);

  const goLibrary = useCallback(() => dispatch({ type: "view:navigate", view: { kind: "library" } }), [dispatch]);
  const goOperators = useCallback(() => dispatch({ type: "view:navigate", view: { kind: "operators" } }), [dispatch]);

  const goPipeline = useCallback(
    (stage: "capture" | "analyze" | "archive" | "replay") =>
      dispatch({ type: "view:navigate", view: { kind: "pipeline", stage } }),
    [dispatch]
  );

  const goHub = useCallback((hub: Hub) => dispatch({ type: "hub:setActive", hubId: hub.id }), [dispatch]);

  const goProfile = useCallback(() => {
    const firstUser = Object.values(state.entities.users)[0];
    if (firstUser) {
      dispatch({ type: "view:navigate", view: { kind: "profile", userId: firstUser.id } });
    }
  }, [dispatch, state.entities.users]);

  const isActive = useCallback(
    (kind: string) => state.selection.view.kind === kind,
    [state.selection.view.kind]
  );

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <Box sx={{ px: 2, pt: 2, pb: 1 }}>
        <Typography variant="body2" sx={{ color: "text.secondary", fontWeight: 700, letterSpacing: "0.08em" }}>
          NAVIGATOR
        </Typography>
      </Box>
      <List dense sx={{ px: 1 }}>
        <ListItemButton selected={isActive("library")} onClick={goLibrary} sx={{ borderRadius: 2 }}>
          <ListItemText primary="Library" secondary="Artifacts across hubs" />
        </ListItemButton>
        <ListItemButton selected={isActive("operators")} onClick={goOperators} sx={{ borderRadius: 2 }}>
          <ListItemText primary="Operators" secondary="DePIN marketplace" />
        </ListItemButton>
        <ListItemButton selected={isActive("profile")} onClick={goProfile} sx={{ borderRadius: 2 }}>
          <ListItemText primary="Profile" secondary="Proof of helpfulness" />
        </ListItemButton>
      </List>

      <Divider sx={{ my: 1 }} />

      <Box sx={{ px: 2, pb: 1 }}>
        <Typography variant="body2" sx={{ color: "text.secondary", fontWeight: 700, letterSpacing: "0.08em" }}>
          PIPELINE
        </Typography>
      </Box>
      <List dense sx={{ px: 1 }}>
        {(["capture", "analyze", "archive", "replay"] as const).map((stage) => (
          <ListItemButton
            key={stage}
            selected={state.selection.view.kind === "pipeline" && state.selection.view.stage === stage}
            onClick={() => goPipeline(stage)}
            sx={{ borderRadius: 2 }}
          >
            <ListItemText primary={pipelineStageLabel(stage)} secondary="Queue, progress, outputs" />
          </ListItemButton>
        ))}
      </List>

      <Divider sx={{ my: 1 }} />

      <Box sx={{ px: 2, pb: 1 }}>
        <Typography variant="body2" sx={{ color: "text.secondary", fontWeight: 700, letterSpacing: "0.08em" }}>
          HUBS
        </Typography>
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        <List dense sx={{ px: 1 }}>
          {hubs.map((hub) => (
            <ListItemButton
              key={hub.id}
              selected={state.selection.view.kind === "hub" && state.selection.view.hubId === hub.id}
              onClick={() => goHub(hub)}
              sx={{ borderRadius: 2 }}
            >
              <ListItemText primary={hub.name} secondary={`${hub.memberIds.length} members`} />
            </ListItemButton>
          ))}
        </List>
      </Box>
    </Box>
  );
}

