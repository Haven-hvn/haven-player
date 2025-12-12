import React, { useCallback, useMemo } from "react";
import { Box, Chip, Divider, List, ListItemButton, ListItemText, Tab, Tabs, Typography } from "@mui/material";
import { useHavenStore } from "@/haven/state/havenStore";
import type { Comment, LoomThread } from "@/haven/model/types";
import { contentMonoSx } from "@/theme/havenTheme";

export function MarginaliaRail(): React.ReactElement {
  const { state, dispatch } = useHavenStore();

  const selectedArtifact = state.selection.selectedArtifactId
    ? state.entities.artifacts[state.selection.selectedArtifactId] ?? null
    : null;

  const threads = useMemo(() => Object.values(state.entities.threads), [state.entities.threads]);
  const filteredThreads = useMemo(() => {
    if (state.filters.threadTypes.length === 0) return threads;
    return threads.filter((t) => state.filters.threadTypes.includes(t.type));
  }, [state.filters.threadTypes, threads]);

  const selectedThread = state.selection.selectedThreadId
    ? state.entities.threads[state.selection.selectedThreadId] ?? null
    : null;

  const setTab = useCallback(
    (_: React.SyntheticEvent, value: string) => {
      dispatch({ type: "selection:setMarginaliaTab", tab: value as never });
    },
    [dispatch]
  );

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <Box sx={{ px: 2.5, pt: 2, pb: 1 }}>
        <Typography variant="body2" sx={{ color: "text.secondary", fontWeight: 700, letterSpacing: "0.08em" }}>
          MARGINALIA
        </Typography>
        <Typography sx={{ mt: 0.5, fontWeight: 800, letterSpacing: "-0.01em" }}>
          {selectedArtifact ? selectedArtifact.title : "No artifact selected"}
        </Typography>
      </Box>

      <Tabs
        value={state.selection.activeMarginaliaTab}
        onChange={setTab}
        variant="scrollable"
        scrollButtons="auto"
        sx={{
          px: 1,
          minHeight: 42,
          "& .MuiTab-root": { minHeight: 42, textTransform: "none", fontWeight: 700, fontSize: "0.78rem" },
        }}
      >
        <Tab value="threads" label="Threads" />
        <Tab value="discussion" label="Discussion" />
        <Tab value="curator_notes" label="Curator notes" />
        <Tab value="metadata" label="Metadata" />
        <Tab value="provenance" label="Provenance" />
        <Tab value="history" label="History" />
      </Tabs>

      <Divider />

      <Box sx={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        {state.selection.activeMarginaliaTab === "threads" && (
          <ThreadList
            threads={filteredThreads}
            selectedThreadId={selectedThread?.id ?? null}
            onSelect={(id) => dispatch({ type: "selection:setSelectedThread", threadId: id })}
          />
        )}

        {state.selection.activeMarginaliaTab === "discussion" && <DiscussionPanel />}

        {state.selection.activeMarginaliaTab === "curator_notes" && <CuratorNotesPanel />}

        {state.selection.activeMarginaliaTab === "metadata" && <MetadataPanel />}

        {state.selection.activeMarginaliaTab === "provenance" && <ProvenancePanel />}

        {state.selection.activeMarginaliaTab === "history" && <HistoryPanel />}
      </Box>

      {selectedThread && (
        <>
          <Divider />
          <Box sx={{ p: 2 }}>
            <Typography sx={{ fontWeight: 800, mb: 1 }}>Selected thread</Typography>
            <Typography sx={{ ...contentMonoSx, fontSize: "0.82rem", color: "text.secondary" }}>
              {selectedThread.label}
            </Typography>
          </Box>
        </>
      )}
    </Box>
  );
}

function ThreadList(props: {
  threads: LoomThread[];
  selectedThreadId: string | null;
  onSelect: (id: LoomThread["id"]) => void;
}): React.ReactElement {
  const { state, dispatch } = useHavenStore();

  const typeChip = (type: LoomThread["type"]) => {
    const color =
      type === "link" ? "rgba(122,167,255,0.22)" : type === "transclusion" ? "rgba(46,196,182,0.22)" : "rgba(255,159,28,0.22)";
    return <Chip size="small" label={type} sx={{ backgroundColor: color, border: "1px solid rgba(255,255,255,0.08)" }} />;
  };

  const active = state.filters.threadTypes;
  const toggleType = (type: LoomThread["type"]) => {
    const next = active.includes(type) ? active.filter((t) => t !== type) : [...active, type];
    dispatch({ type: "filters:setThreadTypes", threadTypes: next });
  };

  return (
    <List dense sx={{ p: 2 }}>
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 1 }}>
        <Chip
          size="small"
          label="link"
          onClick={() => toggleType("link")}
          variant={active.includes("link") ? "filled" : "outlined"}
          sx={{ cursor: "pointer" }}
        />
        <Chip
          size="small"
          label="transclusion"
          onClick={() => toggleType("transclusion")}
          variant={active.includes("transclusion") ? "filled" : "outlined"}
          sx={{ cursor: "pointer" }}
        />
        <Chip
          size="small"
          label="discussion"
          onClick={() => toggleType("discussion")}
          variant={active.includes("discussion") ? "filled" : "outlined"}
          sx={{ cursor: "pointer" }}
        />
        {active.length > 0 && (
          <Chip
            size="small"
            label="clear"
            onClick={() => dispatch({ type: "filters:setThreadTypes", threadTypes: [] })}
            sx={{ cursor: "pointer", opacity: 0.9 }}
          />
        )}
      </Box>
      {props.threads.map((t) => (
        <ListItemButton
          key={t.id}
          selected={props.selectedThreadId === t.id}
          onClick={() => props.onSelect(t.id)}
          sx={{ borderRadius: 2, mb: 0.5, gap: 1 }}
        >
          {typeChip(t.type)}
          <ListItemText
            primary={<Typography sx={{ fontWeight: 800 }}>{t.label}</Typography>}
            secondary={<Typography variant="body2" sx={{ color: "text.secondary" }}>strength {(t.strength * 100).toFixed(0)}%</Typography>}
          />
        </ListItemButton>
      ))}
      {props.threads.length === 0 && (
        <Box sx={{ p: 2 }}>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            No threads yet.
          </Typography>
        </Box>
      )}
    </List>
  );
}

function DiscussionPanel(): React.ReactElement {
  const { state } = useHavenStore();
  const artifactId = state.selection.selectedArtifactId;
  if (!artifactId) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          Select an artifact to view discussion.
        </Typography>
      </Box>
    );
  }
  const artifact = state.entities.artifacts[artifactId];
  const thread = artifact ? state.entities.discussionThreads[artifact.discussionThreadId] : null;
  const comments = thread ? thread.commentIds.map((id) => state.entities.comments[id]).filter(Boolean) as Comment[] : [];
  return (
    <List dense sx={{ p: 2 }}>
      {comments.map((c) => {
        const author = state.entities.users[c.authorId];
        return (
          <Box key={c.id} sx={{ mb: 1.5, p: 1.5, borderRadius: 2, border: "1px solid rgba(255,255,255,0.10)", backgroundColor: "rgba(0,0,0,0.18)" }}>
            <Typography sx={{ fontWeight: 800, fontSize: "0.85rem" }}>
              {author ? author.displayName : c.authorId}
            </Typography>
            <Typography sx={{ ...contentMonoSx, fontSize: "0.82rem", color: "text.secondary", mt: 0.25 }}>
              {c.bodyMarkdown}
            </Typography>
            {typeof c.artifactTimestampSeconds === "number" && (
              <Chip size="small" label={`@ ${c.artifactTimestampSeconds}s`} sx={{ mt: 1, opacity: 0.85 }} />
            )}
          </Box>
        );
      })}
      {comments.length === 0 && (
        <Box sx={{ p: 2 }}>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            No discussion yet.
          </Typography>
        </Box>
      )}
    </List>
  );
}

function CuratorNotesPanel(): React.ReactElement {
  const { state, dispatch } = useHavenStore();
  const artifactId = state.selection.selectedArtifactId;
  const artifact = artifactId ? state.entities.artifacts[artifactId] : null;
  if (!artifact) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          Select an artifact to view curator notes.
        </Typography>
      </Box>
    );
  }
  return (
    <Box sx={{ p: 2 }}>
      <Typography sx={{ fontWeight: 900, mb: 1 }}>Curator notes</Typography>
      <Typography variant="body2" sx={{ color: "text.secondary" }}>
        Keep context close; don’t force navigation.
      </Typography>
      <Box sx={{ mt: 1.5 }}>
        <textarea
          value={artifact.curatorNotesMarkdown}
          onChange={(e) =>
            dispatch({
              type: "artifact:update",
              artifactId: artifact.id,
              patch: { curatorNotesMarkdown: e.target.value },
            })
          }
          style={{
            width: "100%",
            minHeight: 160,
            resize: "vertical",
            borderRadius: 12,
            padding: 12,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(0,0,0,0.18)",
            color: "rgba(237,239,245,0.92)",
            fontFamily:
              '"JetBrains Mono", "SF Mono", ui-monospace, Menlo, Monaco, Consolas, monospace',
            fontSize: 12,
            lineHeight: 1.5,
          }}
        />
      </Box>
    </Box>
  );
}

function MetadataPanel(): React.ReactElement {
  const { state } = useHavenStore();
  const artifactId = state.selection.selectedArtifactId;
  const artifact = artifactId ? state.entities.artifacts[artifactId] : null;
  if (!artifact) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          Select an artifact to view metadata.
        </Typography>
      </Box>
    );
  }
  const hub = state.entities.hubs[artifact.hubId];
  const tags = artifact.tags.map((id) => state.entities.tags[id]).filter(Boolean);
  return (
    <Box sx={{ p: 2 }}>
      <Typography sx={{ fontWeight: 800, mb: 1 }}>Artifact metadata</Typography>
      <Typography variant="body2" sx={{ color: "text.secondary" }}>
        Hub: {hub ? hub.name : artifact.hubId}
      </Typography>
      <Typography variant="body2" sx={{ color: "text.secondary" }}>
        Source: {artifact.sourcePlatform}
      </Typography>
      <Typography variant="body2" sx={{ color: "text.secondary" }}>
        Access: {artifact.accessPolicy}
      </Typography>
      <Typography variant="body2" sx={{ color: "text.secondary" }}>
        Encrypt before upload: {artifact.encryptedBeforeUpload ? "On (UI)" : "Off (UI)"}
      </Typography>
      <Divider sx={{ my: 2 }} />
      <Typography variant="body2" sx={{ color: "text.secondary" }}>
        Tags
      </Typography>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mt: 1 }}>
        {tags.map((t) => (
          <Chip key={t.id} label={t.label} sx={{ border: `1px solid ${t.color}`, backgroundColor: "rgba(0,0,0,0.18)" }} />
        ))}
      </Box>
    </Box>
  );
}

function ProvenancePanel(): React.ReactElement {
  const { state } = useHavenStore();
  const artifactId = state.selection.selectedArtifactId;
  const artifact = artifactId ? state.entities.artifacts[artifactId] : null;
  if (!artifact) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          Select an artifact to view provenance.
        </Typography>
      </Box>
    );
  }
  return (
    <List dense sx={{ p: 2 }}>
      {artifact.provenance.map((p) => {
        const user = state.entities.users[p.actorUserId];
        return (
          <Box key={p.id} sx={{ mb: 1.2, p: 1.5, borderRadius: 2, border: "1px solid rgba(255,255,255,0.10)", backgroundColor: "rgba(0,0,0,0.18)" }}>
            <Typography sx={{ fontWeight: 900, fontSize: "0.85rem" }}>
              {p.stage.toUpperCase()} • {user ? user.displayName : p.actorUserId}
            </Typography>
            <Typography sx={{ ...contentMonoSx, fontSize: "0.78rem", color: "text.secondary" }}>{p.at}</Typography>
            <Typography sx={{ fontSize: "0.82rem", color: "text.secondary", mt: 0.5 }}>{p.note}</Typography>
          </Box>
        );
      })}
    </List>
  );
}

function HistoryPanel(): React.ReactElement {
  const { state } = useHavenStore();
  const artifactId = state.selection.selectedArtifactId;
  const artifact = artifactId ? state.entities.artifacts[artifactId] : null;
  if (!artifact) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          Select an artifact to view history.
        </Typography>
      </Box>
    );
  }
  const versions = artifact.versions.map((id) => state.entities.versions[id]).filter(Boolean);
  return (
    <List dense sx={{ p: 2 }}>
      {versions.map((v) => (
        <ListItemText
          key={v.id}
          primary={<Typography sx={{ fontWeight: 800 }}>{v.changeSummary}</Typography>}
          secondary={<Typography variant="body2" sx={{ color: "text.secondary" }}>{v.createdAt}</Typography>}
          sx={{ mb: 1 }}
        />
      ))}
      {versions.length === 0 && (
        <Box sx={{ p: 2 }}>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            No saved versions yet.
          </Typography>
        </Box>
      )}
    </List>
  );
}

