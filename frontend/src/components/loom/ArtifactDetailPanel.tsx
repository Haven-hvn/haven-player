import React, { useCallback, useMemo, useState } from "react";
import {
  Box,
  Button,
  Chip,
  Divider,
  FormControlLabel,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import type { AccessPolicy, PipelineStage } from "@/haven/model/enums";
import type { Artifact, Tag } from "@/haven/model/types";
import { useHavenStore } from "@/haven/state/havenStore";
import { nowIso } from "@/haven/util/time";
import { createLocalId } from "@/haven/util/idFactory";
import { asCommentId, asPipelineJobId } from "@/haven/model/ids";
import { contentMonoSx } from "@/theme/havenTheme";

export function ArtifactDetailPanel(props: {
  artifactId: Artifact["id"];
  variant: "primary" | "secondary";
}): React.ReactElement {
  const { state, dispatch } = useHavenStore();
  const artifact = state.entities.artifacts[props.artifactId];
  const hub = state.entities.hubs[artifact.hubId];
  const tags = artifact.tags.map((id) => state.entities.tags[id]).filter(Boolean) as Tag[];

  const [newTagLabel, setNewTagLabel] = useState("");
  const [newTagAt, setNewTagAt] = useState("0");
  const [newSummaryStart, setNewSummaryStart] = useState("0");
  const [newSummaryEnd, setNewSummaryEnd] = useState("60");
  const [newSummaryText, setNewSummaryText] = useState("");
  const [newCommentText, setNewCommentText] = useState("");

  const updateTitle = useCallback(
    (value: string) => dispatch({ type: "artifact:update", artifactId: artifact.id, patch: { title: value } }),
    [artifact.id, dispatch]
  );

  const updateCuratorNotes = useCallback(
    (value: string) =>
      dispatch({
        type: "artifact:update",
        artifactId: artifact.id,
        patch: { curatorNotesMarkdown: value },
      }),
    [artifact.id, dispatch]
  );

  const updateAccessPolicy = useCallback(
    (_: React.MouseEvent<HTMLElement>, value: AccessPolicy | null) => {
      if (!value) return;
      dispatch({ type: "artifact:update", artifactId: artifact.id, patch: { accessPolicy: value } });
    },
    [artifact.id, dispatch]
  );

  const toggleEncrypt = useCallback(
    (_: React.ChangeEvent<HTMLInputElement>, checked: boolean) => {
      dispatch({ type: "artifact:update", artifactId: artifact.id, patch: { encryptedBeforeUpload: checked } });
    },
    [artifact.id, dispatch]
  );

  const addAnalysisTag = useCallback(() => {
    const atSeconds = Number(newTagAt);
    if (!Number.isFinite(atSeconds) || atSeconds < 0) return;
    const label = newTagLabel.trim();
    if (!label) return;

    // For now, treat label-only tags as timeline labels (not global Tag objects).
    dispatch({
      type: "artifact:addAnalysisTag",
      artifactId: artifact.id,
      tag: {
        tagId: artifact.tags[0] ?? Object.keys(state.entities.tags)[0]!,
        atSeconds,
        label,
        confidence: 0.5,
      },
    });
    setNewTagLabel("");
  }, [artifact.id, artifact.tags, dispatch, newTagAt, newTagLabel, state.entities.tags]);

  const addSummary = useCallback(() => {
    const startSeconds = Number(newSummaryStart);
    const endSeconds = Number(newSummaryEnd);
    if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds)) return;
    if (startSeconds < 0 || endSeconds <= startSeconds) return;
    const summary = newSummaryText.trim();
    if (!summary) return;

    dispatch({
      type: "artifact:addSummarySegment",
      artifactId: artifact.id,
      segment: { startSeconds, endSeconds, summary },
    });
    setNewSummaryText("");
  }, [artifact.id, dispatch, newSummaryEnd, newSummaryStart, newSummaryText]);

  const startPipelineJob = useCallback(
    (stage: PipelineStage) => {
      const id = asPipelineJobId(createLocalId(`job_${stage}`));
      const now = nowIso();
      dispatch({
        type: "pipeline:createJob",
        job: {
          id,
          stage,
          status: "queued",
          createdAt: now,
          updatedAt: now,
          artifactId: artifact.id,
          assignedOperatorId: null,
          progressPercent: 0,
          lastMessage: `Queued ${stage} job (simulated).`,
          retryCount: 0,
        },
      });
      dispatch({ type: "view:navigate", view: { kind: "pipeline", stage } });
    },
    [artifact.id, dispatch]
  );

  const addComment = useCallback(() => {
    const body = newCommentText.trim();
    if (!body) return;
    const now = nowIso();
    const id = asCommentId(createLocalId("comment"));
    const author = Object.values(state.entities.users)[0];
    if (!author) return;
    dispatch({
      type: "comment:add",
      threadId: artifact.discussionThreadId,
      comment: {
        id,
        threadId: artifact.discussionThreadId,
        authorId: author.id,
        createdAt: now,
        updatedAt: null,
        bodyMarkdown: body,
        parentCommentId: null,
        artifactTimestampSeconds: null,
      },
    });
    setNewCommentText("");
    dispatch({ type: "selection:setMarginaliaTab", tab: "discussion" });
  }, [artifact.discussionThreadId, dispatch, newCommentText, state.entities.users]);

  const verifyProvenance = useCallback(() => {
    const user = Object.values(state.entities.users)[0];
    if (!user) return;
    if (artifact.integrity.verifiedBy.includes(user.id)) return;
    dispatch({
      type: "artifact:setIntegrity",
      artifactId: artifact.id,
      patch: { verifiedBy: [...artifact.integrity.verifiedBy, user.id] },
    });
    dispatch({
      type: "artifact:addProvenance",
      artifactId: artifact.id,
      step: {
        id: createLocalId("prov_verify"),
        stage: "replay",
        at: nowIso(),
        actorUserId: user.id,
        note: "Verified provenance indicators (simulated).",
      },
    });
    dispatch({ type: "toast:set", id: createLocalId("toast"), message: "Provenance verified (simulated)" });
  }, [artifact.id, artifact.integrity.verifiedBy, dispatch, state.entities.users]);

  const promptChips = useMemo(() => {
    const prompts: Array<{ label: string; description: string; onClick: () => void }> = [];
    if (artifact.integrity.verifiedBy.length === 0) {
      prompts.push({
        label: "Verify provenance",
        description: "Add a verification mark to build trust.",
        onClick: verifyProvenance,
      });
    }
    if (!artifact.curatorNotesMarkdown.trim()) {
      prompts.push({
        label: "Add curator notes",
        description: "Explain why it matters and what to watch for.",
        onClick: () => updateCuratorNotes("### Curator notes\n\n- "),
      });
    }
    if (artifact.analysis.tags.length === 0) {
      prompts.push({
        label: "Tag a key moment",
        description: "Add a timestamp tag to improve discoverability.",
        onClick: () => {
          setNewTagAt("30");
          setNewTagLabel("Key moment (simulated prompt)");
        },
      });
    }
    if (artifact.accessPolicy === "public" && artifact.encryptedBeforeUpload) {
      prompts.push({
        label: "Review access policy",
        description: "Public + encrypt is unusual; confirm intent.",
        onClick: () => dispatch({ type: "toast:set", id: createLocalId("toast"), message: "Review access policy (prompt)" }),
      });
    }
    return prompts;
  }, [
    artifact.accessPolicy,
    artifact.analysis.tags.length,
    artifact.curatorNotesMarkdown,
    artifact.encryptedBeforeUpload,
    artifact.integrity.verifiedBy.length,
    dispatch,
    updateCuratorNotes,
    verifyProvenance,
  ]);

  const integrityLabel = useMemo(() => {
    const cid = artifact.integrity.cid ? "CID ✓" : "CID —";
    const phash = artifact.integrity.phash ? "pHash ✓" : "pHash —";
    const verified = artifact.integrity.verifiedBy.length > 0 ? `verified by ${artifact.integrity.verifiedBy.length}` : "unverified";
    return `${cid} • ${phash} • ${verified}`;
  }, [artifact.integrity.cid, artifact.integrity.phash, artifact.integrity.verifiedBy.length]);

  return (
    <Box sx={{ p: 2.5, height: "100%", overflow: "auto" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
        <Chip size="small" label={hub ? hub.name : artifact.hubId} sx={{ opacity: 0.85 }} />
        <Chip size="small" label={artifact.sourcePlatform} sx={{ opacity: 0.8 }} />
        <Chip size="small" label={integrityLabel} sx={{ opacity: 0.75 }} />
        {props.variant === "secondary" && (
          <Chip size="small" label="Split view" sx={{ opacity: 0.7 }} />
        )}
      </Box>

      <Box sx={{ mt: 2 }}>
        <TextField
          fullWidth
          value={artifact.title}
          onChange={(e) => updateTitle(e.target.value)}
          variant="outlined"
          label="Artifact title"
          InputProps={{ sx: { fontWeight: 900, letterSpacing: "-0.015em" } }}
        />
        <Typography variant="body2" sx={{ color: "text.secondary", mt: 1 }}>
          Creator: {artifact.creatorAttribution} • Source:{" "}
          <Typography component="span" sx={{ ...contentMonoSx }}>
            {artifact.sourceUrl}
          </Typography>
        </Typography>
      </Box>

      <Divider sx={{ my: 2.5 }} />

      <Typography sx={{ fontWeight: 900, mb: 1 }}>Reciprocity prompts</Typography>
      <Typography variant="body2" sx={{ color: "text.secondary" }}>
        Suggested contributions that strengthen the archive (sample-data UX).
      </Typography>
      <Box sx={{ display: "grid", gridTemplateColumns: "1fr", gap: 1.5, mt: 1.5 }}>
        {promptChips.map((p) => (
          <Box
            key={p.label}
            sx={{
              p: 1.5,
              borderRadius: 2,
              border: "1px solid rgba(255,255,255,0.10)",
              backgroundColor: "rgba(0,0,0,0.18)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 1,
            }}
          >
            <Box>
              <Typography sx={{ fontWeight: 900 }}>{p.label}</Typography>
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                {p.description}
              </Typography>
            </Box>
            <Button variant="outlined" onClick={p.onClick}>
              Do it
            </Button>
          </Box>
        ))}
        {promptChips.length === 0 && (
          <Box sx={{ p: 1.5, borderRadius: 2, border: "1px solid rgba(255,255,255,0.10)", backgroundColor: "rgba(0,0,0,0.18)" }}>
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              No prompts right now — this artifact looks well-curated.
            </Typography>
          </Box>
        )}
      </Box>

      <Divider sx={{ my: 2.5 }} />

      <Typography sx={{ fontWeight: 900, mb: 1 }}>Access policy</Typography>
      <ToggleButtonGroup
        exclusive
        value={artifact.accessPolicy}
        onChange={updateAccessPolicy}
        size="small"
        sx={{
          "& .MuiToggleButton-root": {
            borderColor: "rgba(255,255,255,0.12)",
            color: "text.primary",
          },
        }}
      >
        <ToggleButton value="public">Public</ToggleButton>
        <ToggleButton value="hub_only">Hub-only</ToggleButton>
        <ToggleButton value="private">Private</ToggleButton>
      </ToggleButtonGroup>

      <Box sx={{ mt: 1 }}>
        <FormControlLabel
          control={<Switch checked={artifact.encryptedBeforeUpload} onChange={toggleEncrypt} />}
          label="Encrypt before upload (UI-only)"
        />
      </Box>

      <Divider sx={{ my: 2.5 }} />

      <Typography sx={{ fontWeight: 900, mb: 1 }}>Pipeline actions (simulated)</Typography>
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
        <Button variant="contained" onClick={() => startPipelineJob("capture")}>
          Schedule capture
        </Button>
        <Button variant="contained" color="secondary" onClick={() => startPipelineJob("analyze")}>
          Run analysis
        </Button>
        <Button variant="outlined" onClick={() => startPipelineJob("archive")}>
          Start archive
        </Button>
        <Button variant="outlined" onClick={() => startPipelineJob("replay")}>
          Replay
        </Button>
      </Box>

      <Divider sx={{ my: 2.5 }} />

      <Typography sx={{ fontWeight: 900, mb: 1 }}>Tags</Typography>
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
        {tags.map((t) => (
          <Chip
            key={t.id}
            label={t.label}
            sx={{ border: `1px solid ${t.color}`, backgroundColor: "rgba(0,0,0,0.18)" }}
          />
        ))}
      </Box>

      <Divider sx={{ my: 2.5 }} />

      <Typography sx={{ fontWeight: 900, mb: 1 }}>Curator notes</Typography>
      <Typography variant="body2" sx={{ color: "text.secondary" }}>
        Context that turns sharing into a meaningful social act.
      </Typography>
      <TextField
        fullWidth
        multiline
        minRows={4}
        value={artifact.curatorNotesMarkdown}
        onChange={(e) => updateCuratorNotes(e.target.value)}
        sx={{ mt: 1.5 }}
        InputProps={{ sx: { ...contentMonoSx, fontSize: "0.82rem" } }}
      />

      <Divider sx={{ my: 2.5 }} />

      <Typography sx={{ fontWeight: 900, mb: 1 }}>Analysis timeline</Typography>
      <Box sx={{ display: "grid", gridTemplateColumns: "1fr", gap: 2 }}>
        <Box sx={{ p: 2, borderRadius: 2, border: "1px solid rgba(255,255,255,0.10)", backgroundColor: "rgba(0,0,0,0.18)" }}>
          <Typography sx={{ fontWeight: 800, mb: 1 }}>Timestamp tags</Typography>
          {artifact.analysis.tags.map((t, idx) => (
            <Typography key={idx} sx={{ ...contentMonoSx, fontSize: "0.82rem", color: "text.secondary" }}>
              {t.atSeconds}s • {t.label} • conf {t.confidence.toFixed(2)}
            </Typography>
          ))}
          {artifact.analysis.tags.length === 0 && (
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              No tags yet.
            </Typography>
          )}

          <Box sx={{ display: "flex", gap: 1, mt: 2, flexWrap: "wrap" }}>
            <TextField
              size="small"
              label="at (s)"
              value={newTagAt}
              onChange={(e) => setNewTagAt(e.target.value)}
              sx={{ width: 110 }}
              inputProps={{ inputMode: "numeric" }}
            />
            <TextField
              size="small"
              label="label"
              value={newTagLabel}
              onChange={(e) => setNewTagLabel(e.target.value)}
              sx={{ flex: 1, minWidth: 180 }}
            />
            <Button variant="outlined" onClick={addAnalysisTag}>
              Add tag
            </Button>
          </Box>
        </Box>

        <Box sx={{ p: 2, borderRadius: 2, border: "1px solid rgba(255,255,255,0.10)", backgroundColor: "rgba(0,0,0,0.18)" }}>
          <Typography sx={{ fontWeight: 800, mb: 1 }}>Summaries</Typography>
          {artifact.analysis.summaries.map((s, idx) => (
            <Box key={idx} sx={{ mb: 1 }}>
              <Typography sx={{ ...contentMonoSx, fontSize: "0.8rem", color: "text.secondary" }}>
                {s.startSeconds}s–{s.endSeconds}s
              </Typography>
              <Typography sx={{ fontSize: "0.85rem" }}>{s.summary}</Typography>
            </Box>
          ))}
          {artifact.analysis.summaries.length === 0 && (
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              No summaries yet.
            </Typography>
          )}

          <Box sx={{ display: "flex", gap: 1, mt: 2, flexWrap: "wrap" }}>
            <TextField
              size="small"
              label="start (s)"
              value={newSummaryStart}
              onChange={(e) => setNewSummaryStart(e.target.value)}
              sx={{ width: 120 }}
              inputProps={{ inputMode: "numeric" }}
            />
            <TextField
              size="small"
              label="end (s)"
              value={newSummaryEnd}
              onChange={(e) => setNewSummaryEnd(e.target.value)}
              sx={{ width: 120 }}
              inputProps={{ inputMode: "numeric" }}
            />
            <TextField
              size="small"
              label="summary"
              value={newSummaryText}
              onChange={(e) => setNewSummaryText(e.target.value)}
              sx={{ flex: 1, minWidth: 220 }}
            />
            <Button variant="outlined" onClick={addSummary}>
              Add summary
            </Button>
          </Box>
        </Box>
      </Box>

      <Divider sx={{ my: 2.5 }} />

      <Typography sx={{ fontWeight: 900, mb: 1 }}>Add discussion comment</Typography>
      <Box sx={{ display: "flex", gap: 1 }}>
        <TextField
          fullWidth
          size="small"
          placeholder="Add context, ask for verification, link related artifacts…"
          value={newCommentText}
          onChange={(e) => setNewCommentText(e.target.value)}
        />
        <Button variant="contained" onClick={addComment}>
          Post
        </Button>
      </Box>
    </Box>
  );
}

