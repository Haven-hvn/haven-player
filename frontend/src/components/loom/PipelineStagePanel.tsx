import React, { useCallback, useMemo, useState } from "react";
import {
  Box,
  Button,
  Chip,
  Divider,
  FormControl,
  InputLabel,
  LinearProgress,
  MenuItem,
  Select,
  TextField,
  Typography,
} from "@mui/material";
import type { PipelineJobStatus, PipelineStage } from "@/haven/model/enums";
import type { Artifact, PipelineJob, Tag, UserProfile } from "@/haven/model/types";
import { useHavenStore } from "@/haven/state/havenStore";
import { nowIso } from "@/haven/util/time";
import { createLocalId } from "@/haven/util/idFactory";
import { asArtifactId, asDiscussionThreadId, asPipelineJobId } from "@/haven/model/ids";
import { exportPortableAiMetadata, parsePortableAiMetadata } from "@/haven/pipeline/portableMetadata";
import { exportArkivCatalog } from "@/haven/pipeline/arkivCatalog";
import { contentMonoSx } from "@/theme/havenTheme";

export function PipelineStagePanel(props: { stage: PipelineStage }): React.ReactElement {
  const { state, dispatch } = useHavenStore();
  const [selectedArtifactId, setSelectedArtifactId] = useState<string>(
    state.selection.selectedArtifactId ?? Object.keys(state.entities.artifacts)[0] ?? ""
  );
  const [captureSource, setCaptureSource] = useState<"LiveKit" | "WebRTC" | "Pump.fun" | "Upload">("LiveKit");
  const [captureUrl, setCaptureUrl] = useState("https://example.invalid/source");
  const [importRaw, setImportRaw] = useState("");
  const [replaySource, setReplaySource] = useState<"local" | "gateway">("local");
  const [showProvenanceOverlay, setShowProvenanceOverlay] = useState(true);

  const artifacts = useMemo(() => Object.values(state.entities.artifacts), [state.entities.artifacts]);

  const jobs = useMemo(() => {
    return Object.values(state.entities.pipelineJobs)
      .filter((j) => j.stage === props.stage)
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  }, [props.stage, state.entities.pipelineJobs]);

  const createJob = useCallback(() => {
    const artifact = state.entities.artifacts[selectedArtifactId as never] as Artifact | undefined;
    if (!artifact) return;
    const now = nowIso();
    const job: PipelineJob = {
      id: asPipelineJobId(createLocalId(`job_${props.stage}`)),
      stage: props.stage,
      status: "queued",
      createdAt: now,
      updatedAt: now,
      artifactId: artifact.id,
      assignedOperatorId: null,
      progressPercent: 0,
      lastMessage: `Queued ${props.stage} job (simulated).`,
      retryCount: 0,
    };
    dispatch({ type: "pipeline:createJob", job });
  }, [dispatch, props.stage, selectedArtifactId, state.entities.artifacts]);

  const ingestNewArtifactAndCapture = useCallback(() => {
    const hub = Object.values(state.entities.hubs)[0];
    const user = Object.values(state.entities.users)[0];
    if (!hub || !user) return;

    const now = nowIso();
    const artifactId = asArtifactId(createLocalId("artifact"));
    const threadId = asDiscussionThreadId(createLocalId("discussion"));
    const tagIds = Object.values(state.entities.tags).slice(0, 2).map((t) => t.id);

    dispatch({
      type: "artifact:create",
      artifact: {
        id: artifactId,
        hubId: hub.id,
        title: `New capture target (${captureSource})`,
        sourcePlatform: captureSource,
        sourceUrl: captureUrl,
        creatorAttribution: "Unknown / pending",
        accessPolicy: "hub_only",
        encryptedBeforeUpload: true,
        curatorNotesMarkdown: "",
        createdAt: now,
        createdBy: user.id,
        tags: tagIds,
        analysis: { tags: [], summaries: [] },
        integrity: { cid: null, phash: null, dedupMatches: [], verifiedBy: [] },
        provenance: [
          {
            id: createLocalId("prov"),
            stage: "capture",
            at: now,
            actorUserId: user.id,
            note: "Ingested as a new capture target (simulated).",
          },
        ],
        discussionThreadId: threadId,
        versions: [],
      },
      thread: { id: threadId, artifactId, commentIds: [] },
    });

    dispatch({
      type: "pipeline:createJob",
      job: {
        id: asPipelineJobId(createLocalId("job_capture")),
        stage: "capture",
        status: "queued",
        createdAt: now,
        updatedAt: now,
        artifactId,
        assignedOperatorId: null,
        progressPercent: 0,
        lastMessage: "Queued capture for new target (simulated).",
        retryCount: 0,
      },
    });
    dispatch({ type: "view:navigate", view: { kind: "pipeline", stage: "capture" } });
  }, [captureSource, captureUrl, dispatch, state.entities.hubs, state.entities.tags, state.entities.users]);

  const updateJob = useCallback(
    (job: PipelineJob, patch: Partial<Pick<PipelineJob, "status" | "progressPercent" | "lastMessage" | "assignedOperatorId" | "retryCount">>) => {
      dispatch({
        type: "pipeline:updateJob",
        jobId: job.id,
        patch: { ...patch, updatedAt: nowIso() },
      });
    },
    [dispatch]
  );

  const advance = useCallback(
    (job: PipelineJob) => {
      const next = Math.min(100, job.progressPercent + 10);
      const status: PipelineJobStatus = next >= 100 ? "completed" : job.status === "queued" ? "running" : job.status;
      updateJob(job, {
        progressPercent: next,
        status,
        lastMessage: status === "completed" ? "Completed (simulated)." : `Processing… ${next}%`,
      });

      if (status === "completed") {
        const actor = Object.values(state.entities.users)[0];
        if (!actor) return;
        dispatch({
          type: "artifact:addProvenance",
          artifactId: job.artifactId,
          step: {
            id: createLocalId("prov"),
            stage: job.stage,
            at: nowIso(),
            actorUserId: actor.id,
            note: `Completed ${job.stage} (simulated).`,
          },
        });

        if (job.stage === "analyze") {
          const firstTag = Object.values(state.entities.tags)[0];
          if (!firstTag) return;
          dispatch({
            type: "artifact:addAnalysisTag",
            artifactId: job.artifactId,
            tag: {
              tagId: firstTag.id,
              atSeconds: 30,
              label: "Auto-tag (simulated)",
              confidence: 0.77,
            },
          });
          dispatch({
            type: "artifact:addSummarySegment",
            artifactId: job.artifactId,
            segment: { startSeconds: 0, endSeconds: 60, summary: "Auto-summary generated by VLM (simulated)." },
          });
        }

        if (job.stage === "archive") {
          dispatch({
            type: "artifact:setIntegrity",
            artifactId: job.artifactId,
            patch: { cid: `bafy...${createLocalId("cid").slice(-8)}` },
          });
        }
      }
    },
    [dispatch, state.entities.tags, state.entities.users, updateJob]
  );

  const fail = useCallback(
    (job: PipelineJob) => {
      updateJob(job, { status: "failed", lastMessage: "Failed (simulated)." });
    },
    [updateJob]
  );

  const retry = useCallback(
    (job: PipelineJob) => {
      updateJob(job, {
        status: "queued",
        progressPercent: 0,
        retryCount: job.retryCount + 1,
        lastMessage: "Retry queued (simulated).",
      });
    },
    [updateJob]
  );

  const exportJson = useMemo(() => {
    const artifact = state.entities.artifacts[selectedArtifactId as never] as Artifact | undefined;
    if (!artifact) return "";
    const payload = exportPortableAiMetadata(artifact, nowIso());
    return JSON.stringify(payload, null, 2);
  }, [selectedArtifactId, state.entities.artifacts]);

  const importJson = useCallback(() => {
    const artifact = state.entities.artifacts[selectedArtifactId as never] as Artifact | undefined;
    if (!artifact) return;
    const parsed = parsePortableAiMetadata(importRaw);
    if (!parsed) {
      dispatch({ type: "toast:set", id: createLocalId("toast"), message: "Invalid .AI.json payload" });
      return;
    }

    // Import as new analysis segments. We map tags to the first global tag (UI-only).
    const tagId = artifact.tags[0] ?? (Object.keys(state.entities.tags)[0] as never);
    parsed.analysis.tags.forEach((t) => {
      dispatch({
        type: "artifact:addAnalysisTag",
        artifactId: artifact.id,
        tag: { tagId, atSeconds: t.atSeconds, label: t.label, confidence: t.confidence },
      });
    });
    parsed.analysis.summaries.forEach((s) => {
      dispatch({ type: "artifact:addSummarySegment", artifactId: artifact.id, segment: s });
    });
    dispatch({ type: "toast:set", id: createLocalId("toast"), message: "Imported analysis into artifact (simulated)" });
    setImportRaw("");
  }, [dispatch, importRaw, selectedArtifactId, state.entities.artifacts, state.entities.tags]);

  const arkivCatalogJson = useMemo(() => {
    if (props.stage !== "archive") return "";
    const artifact = state.entities.artifacts[selectedArtifactId as never] as Artifact | undefined;
    if (!artifact) return "";
    const hub = state.entities.hubs[artifact.hubId];
    if (!hub) return "";
    const tags: Tag[] = artifact.tags.map((id) => state.entities.tags[id]).filter((t): t is Tag => Boolean(t));
    const contributors: UserProfile[] = [artifact.createdBy, ...artifact.integrity.verifiedBy]
      .map((id) => state.entities.users[id])
      .filter((u): u is UserProfile => Boolean(u));
    return JSON.stringify(exportArkivCatalog({ artifact, hub, tags, contributors }, nowIso()), null, 2);
  }, [props.stage, selectedArtifactId, state.entities.artifacts, state.entities.hubs, state.entities.tags, state.entities.users]);

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
        <Chip size="small" label={`Stage: ${props.stage}`} sx={{ opacity: 0.85 }} />
        <Chip size="small" label={`${jobs.length} jobs`} sx={{ opacity: 0.75 }} />
      </Box>

      <Box sx={{ display: "grid", gridTemplateColumns: "1fr 420px", gap: 2, mt: 2 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontWeight: 900, mb: 1 }}>Jobs</Typography>
          {jobs.map((job) => (
            <Box
              key={job.id}
              sx={{
                mb: 1.5,
                p: 2,
                borderRadius: 2,
                border: "1px solid rgba(255,255,255,0.10)",
                backgroundColor: "rgba(0,0,0,0.18)",
              }}
            >
              <Typography sx={{ fontWeight: 800 }}>
                {state.entities.artifacts[job.artifactId]?.title ?? job.artifactId}
              </Typography>
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                {job.status} • {job.progressPercent}% • retries {job.retryCount}
              </Typography>
              <Typography sx={{ ...contentMonoSx, fontSize: "0.78rem", color: "text.secondary", mt: 0.5 }}>
                {job.lastMessage}
              </Typography>
              <Box sx={{ mt: 1 }}>
                <LinearProgress variant="determinate" value={job.progressPercent} />
              </Box>
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mt: 1 }}>
                <Button size="small" variant="contained" onClick={() => advance(job)} disabled={job.status === "completed" || job.status === "cancelled"}>
                  Advance +10%
                </Button>
                <Button size="small" variant="outlined" onClick={() => fail(job)} disabled={job.status === "completed" || job.status === "cancelled"}>
                  Fail
                </Button>
                <Button size="small" variant="outlined" onClick={() => retry(job)} disabled={job.status !== "failed"}>
                  Retry
                </Button>
              </Box>
            </Box>
          ))}
          {jobs.length === 0 && (
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              No jobs yet for this stage.
            </Typography>
          )}
        </Box>

        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontWeight: 900, mb: 1 }}>Create / Import / Export</Typography>
          <Box sx={{ p: 2, borderRadius: 2, border: "1px solid rgba(255,255,255,0.10)", backgroundColor: "rgba(0,0,0,0.18)" }}>
            {props.stage === "capture" && (
              <>
                <Typography sx={{ fontWeight: 800, mb: 1 }}>Capture source</Typography>
                <FormControl fullWidth size="small">
                  <InputLabel id="capture-source-label">Source</InputLabel>
                  <Select
                    labelId="capture-source-label"
                    value={captureSource}
                    label="Source"
                    onChange={(e) => setCaptureSource(String(e.target.value) as typeof captureSource)}
                  >
                    <MenuItem value="LiveKit">LiveKit</MenuItem>
                    <MenuItem value="WebRTC">WebRTC</MenuItem>
                    <MenuItem value="Pump.fun">Pump.fun</MenuItem>
                    <MenuItem value="Upload">Upload</MenuItem>
                  </Select>
                </FormControl>
                <TextField
                  fullWidth
                  size="small"
                  label="Source URL / path"
                  value={captureUrl}
                  onChange={(e) => setCaptureUrl(e.target.value)}
                  sx={{ mt: 1.5 }}
                />
                <Button sx={{ mt: 1.5 }} fullWidth variant="contained" onClick={ingestNewArtifactAndCapture}>
                  Ingest as new artifact + queue capture
                </Button>
                <Divider sx={{ my: 2 }} />
              </>
            )}

            <FormControl fullWidth size="small">
              <InputLabel id="artifact-select-label">Artifact</InputLabel>
              <Select
                labelId="artifact-select-label"
                value={selectedArtifactId}
                label="Artifact"
                onChange={(e) => setSelectedArtifactId(String(e.target.value))}
              >
                {artifacts.map((a) => (
                  <MenuItem key={a.id} value={a.id}>
                    {a.title}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <Button sx={{ mt: 1.5 }} fullWidth variant="contained" onClick={createJob} disabled={!selectedArtifactId}>
              Create {props.stage} job (simulated)
            </Button>

            <Divider sx={{ my: 2 }} />

            <Typography sx={{ fontWeight: 800, mb: 1 }}>Portable .AI.json</Typography>
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              {props.stage === "analyze"
                ? "Export analysis metadata (simulated)."
                : "Import analysis metadata into an artifact (simulated)."}
            </Typography>

            <TextField
              fullWidth
              multiline
              minRows={6}
              value={props.stage === "analyze" ? exportJson : importRaw}
              onChange={(e) => setImportRaw(e.target.value)}
              placeholder="{ ... }"
              sx={{ mt: 1.5 }}
              InputProps={{ sx: { ...contentMonoSx, fontSize: "0.78rem" }, readOnly: props.stage === "analyze" }}
            />
            <Box sx={{ display: "flex", gap: 1, mt: 1 }}>
              <Button variant="outlined" onClick={importJson} disabled={props.stage === "analyze" || !importRaw.trim()}>
                Import
              </Button>
              <Button
                variant="outlined"
                onClick={() => dispatch({ type: "toast:set", id: createLocalId("toast"), message: "Copy in your OS menu (UI-only)" })}
              >
                Copy hint
              </Button>
            </Box>

            {props.stage === "archive" && (
              <>
                <Divider sx={{ my: 2 }} />
                <Typography sx={{ fontWeight: 800, mb: 1 }}>Share to Arkiv (catalog)</Typography>
                <Typography variant="body2" sx={{ color: "text.secondary" }}>
                  UI-only publish flow: this represents the portable catalog sync.
                </Typography>
                <TextField
                  fullWidth
                  multiline
                  minRows={6}
                  value={arkivCatalogJson}
                  sx={{ mt: 1.5 }}
                  InputProps={{ sx: { ...contentMonoSx, fontSize: "0.78rem" }, readOnly: true }}
                />
                <Button
                  sx={{ mt: 1.5 }}
                  fullWidth
                  variant="outlined"
                  onClick={() => dispatch({ type: "toast:set", id: createLocalId("toast"), message: "Arkiv catalog published (simulated)" })}
                >
                  Publish (simulated)
                </Button>
              </>
            )}

            {props.stage === "replay" && (
              <>
                <Divider sx={{ my: 2 }} />
                <Typography sx={{ fontWeight: 800, mb: 1 }}>Replay controls (UI-only)</Typography>
                <FormControl fullWidth size="small">
                  <InputLabel id="replay-source-label">Playback source</InputLabel>
                  <Select
                    labelId="replay-source-label"
                    value={replaySource}
                    label="Playback source"
                    onChange={(e) => setReplaySource(String(e.target.value) as typeof replaySource)}
                  >
                    <MenuItem value="local">Local storage</MenuItem>
                    <MenuItem value="gateway">IPFS gateway (simulated)</MenuItem>
                  </Select>
                </FormControl>
                <Typography variant="body2" sx={{ color: "text.secondary", mt: 1 }}>
                  Source: <Typography component="span" sx={{ ...contentMonoSx }}>{replaySource}</Typography>
                </Typography>
                <Button
                  sx={{ mt: 1.5 }}
                  fullWidth
                  variant={showProvenanceOverlay ? "contained" : "outlined"}
                  onClick={() => setShowProvenanceOverlay((v) => !v)}
                >
                  Provenance overlay: {showProvenanceOverlay ? "On" : "Off"}
                </Button>
                <Button
                  sx={{ mt: 1 }}
                  fullWidth
                  variant="outlined"
                  onClick={() => dispatch({ type: "toast:set", id: createLocalId("toast"), message: "Opening replay surface (simulated)" })}
                >
                  Open replay surface
                </Button>
              </>
            )}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

