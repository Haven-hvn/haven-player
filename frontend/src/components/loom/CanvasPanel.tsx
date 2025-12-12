import React, { useMemo } from "react";
import { Box, Chip, Divider, List, ListItemButton, ListItemText, Typography } from "@mui/material";
import { useHavenStore } from "@/haven/state/havenStore";
import { contentMonoSx } from "@/theme/havenTheme";
import type { Artifact } from "@/haven/model/types";
import { pipelineStageLabel } from "@/haven/state/havenReducer";
import { ArtifactDetailPanel } from "@/components/loom/ArtifactDetailPanel";
import { PipelineStagePanel } from "@/components/loom/PipelineStagePanel";
import { HubPanel } from "@/components/loom/HubPanel";
import { OperatorsPanel } from "@/components/loom/OperatorsPanel";

export function CanvasPanel(): React.ReactElement {
  const { state, dispatch } = useHavenStore();

  const artifacts = useMemo(() => Object.values(state.entities.artifacts), [state.entities.artifacts]);
  const selectedArtifact = state.selection.selectedArtifactId
    ? state.entities.artifacts[state.selection.selectedArtifactId]
    : null;

  const filteredArtifacts = useMemo(() => {
    const q = state.filters.searchQuery.trim().toLowerCase();
    if (!q) return artifacts;
    return artifacts.filter((a) => {
      const haystack = `${a.title} ${a.creatorAttribution} ${a.sourcePlatform}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [artifacts, state.filters.searchQuery]);

  const split = state.selection.splitView;
  const secondaryArtifact = split.secondaryArtifactId
    ? state.entities.artifacts[split.secondaryArtifactId] ?? null
    : null;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <Box sx={{ px: 3, pt: 3, pb: 2 }}>
        {state.selection.view.kind === "library" && (
          <>
            <Typography variant="h1">Artifacts</Typography>
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              Browse, curate, and weave context. Select an artifact to open it.
            </Typography>
          </>
        )}

        {state.selection.view.kind === "pipeline" && (
          <>
            <Typography variant="h1">{pipelineStageLabel(state.selection.view.stage)} Pipeline</Typography>
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              Queue and inspect jobs. All statuses are simulated.
            </Typography>
          </>
        )}

        {state.selection.view.kind === "hub" && (
          <>
            <Typography variant="h1">{state.entities.hubs[state.selection.view.hubId]?.name ?? "Hub"}</Typography>
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              Library + studio + community hall.
            </Typography>
          </>
        )}

        {state.selection.view.kind === "operators" && (
          <>
            <Typography variant="h1">Operators</Typography>
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              Compare reliability, capacity, and pricing (simulated).
            </Typography>
          </>
        )}

        {state.selection.view.kind === "profile" && (
          <>
            <Typography variant="h1">Profile</Typography>
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              Proof of helpfulness surfaces and contribution history.
            </Typography>
          </>
        )}
      </Box>

      <Divider />

      <Box sx={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        {state.selection.view.kind === "library" && (
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: split.enabled ? "340px 1fr 1fr" : "340px 1fr",
              height: "100%",
              minHeight: 0,
            }}
          >
            <Box sx={{ borderRight: "1px solid rgba(255,255,255,0.10)", minHeight: 0, overflow: "auto" }}>
              <ArtifactList
                artifacts={filteredArtifacts}
                selectedId={state.selection.selectedArtifactId}
                onSelect={(id) => dispatch({ type: "selection:setArtifact", artifactId: id })}
              />
            </Box>

            <Box sx={{ minHeight: 0, overflow: "hidden" }}>
              {selectedArtifact ? (
                <ArtifactDetailPanel artifactId={selectedArtifact.id} variant="primary" />
              ) : (
                <Box sx={{ p: 3 }}>
                  <Typography variant="body2" sx={{ color: "text.secondary" }}>
                    Select an artifact from the list to open its page.
                  </Typography>
                </Box>
              )}
            </Box>

            {split.enabled && (
              <Box sx={{ borderLeft: "1px solid rgba(255,255,255,0.10)", minHeight: 0, overflow: "hidden" }}>
                {secondaryArtifact ? (
                  <ArtifactDetailPanel artifactId={secondaryArtifact.id} variant="secondary" />
                ) : (
                  <Box sx={{ p: 3 }}>
                    <Typography variant="body2" sx={{ color: "text.secondary" }}>
                      Select a second artifact for side-by-side comparison.
                    </Typography>
                  </Box>
                )}
              </Box>
            )}
          </Box>
        )}

        {state.selection.view.kind === "pipeline" && (
          <PipelineStagePanel stage={state.selection.view.stage} />
        )}

        {state.selection.view.kind === "hub" && <HubPanel hubId={state.selection.view.hubId} />}

        {state.selection.view.kind === "operators" && <OperatorsPanel />}

        {state.selection.view.kind === "profile" && <ProfileOverview />}
      </Box>

      {/* Subtle “document surface” hint */}
      {selectedArtifact && state.selection.view.kind === "library" && !split.enabled && (
        <Box
          sx={{
            position: "absolute",
            right: 18,
            bottom: 18,
            px: 1.5,
            py: 0.75,
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.12)",
            backgroundColor: "rgba(0,0,0,0.25)",
          }}
        >
          <Typography sx={{ ...contentMonoSx, fontSize: "0.78rem", color: "text.secondary" }}>
            Selected: {selectedArtifact.title}
          </Typography>
        </Box>
      )}
    </Box>
  );
}

function ArtifactList(props: {
  artifacts: Artifact[];
  selectedId: string | null;
  onSelect: (id: Artifact["id"]) => void;
}): React.ReactElement {
  return (
    <List dense sx={{ p: 2 }}>
      {props.artifacts.map((a) => (
        <ListItemButton
          key={a.id}
          selected={props.selectedId === a.id}
          onClick={() => props.onSelect(a.id)}
          sx={{ borderRadius: 2, mb: 0.5 }}
        >
          <ListItemText
            primary={
              <Typography sx={{ fontWeight: 700, letterSpacing: "-0.01em" }}>{a.title}</Typography>
            }
            secondary={
              <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap", mt: 0.5 }}>
                <Chip size="small" label={a.sourcePlatform} sx={{ opacity: 0.85 }} />
                <Chip size="small" label={a.accessPolicy.replace("_", " ")} sx={{ opacity: 0.7 }} />
              </Box>
            }
          />
        </ListItemButton>
      ))}
      {props.artifacts.length === 0 && (
        <Box sx={{ p: 2 }}>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            No artifacts match your search.
          </Typography>
        </Box>
      )}
    </List>
  );
}

function ProfileOverview(): React.ReactElement {
  const { state } = useHavenStore();
  const userId = state.selection.view.kind === "profile" ? state.selection.view.userId : null;
  const profile = userId ? state.entities.users[userId] : null;
  const rep = userId ? state.entities.reputations[userId] : null;
  if (!profile || !rep) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          No profile selected.
        </Typography>
      </Box>
    );
  }
  return (
    <Box sx={{ p: 3 }}>
      <Typography sx={{ fontWeight: 800, letterSpacing: "-0.01em" }}>
        {profile.displayName} (@{profile.handle})
      </Typography>
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mt: 2 }}>
        {Object.entries(rep.dimensions).map(([k, v]) => (
          <Chip key={k} label={`${k}: ${v}`} sx={{ opacity: 0.9 }} />
        ))}
      </Box>
      <Divider sx={{ my: 2 }} />
      <Typography variant="body2" sx={{ color: "text.secondary" }}>
        Recent evidence
      </Typography>
      <List dense>
        {rep.evidence.map((e, idx) => (
          <ListItemText
            key={idx}
            primary={<Typography sx={{ ...contentMonoSx }}>{e.label}</Typography>}
            secondary={<Typography variant="body2" sx={{ color: "text.secondary" }}>{e.at} • Δ{e.delta}</Typography>}
          />
        ))}
      </List>
    </Box>
  );
}

