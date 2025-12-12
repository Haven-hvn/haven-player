import React, { useCallback, useMemo, useState } from "react";
import {
  Box,
  Button,
  Chip,
  Divider,
  FormControl,
  InputLabel,
  List,
  ListItemButton,
  ListItemText,
  MenuItem,
  Select,
  Tab,
  Tabs,
  Typography,
} from "@mui/material";
import type { Operator, PipelineJob } from "@/haven/model/types";
import type { PipelineStage } from "@/haven/model/enums";
import { useHavenStore } from "@/haven/state/havenStore";
import { createLocalId } from "@/haven/util/idFactory";
import { nowIso } from "@/haven/util/time";
import { contentMonoSx } from "@/theme/havenTheme";

type OperatorsTab = "marketplace" | "dashboard" | "rewards";

export function OperatorsPanel(): React.ReactElement {
  const { state, dispatch } = useHavenStore();
  const [tab, setTab] = useState<OperatorsTab>("marketplace");
  const [selectedOperatorId, setSelectedOperatorId] = useState<string>(Object.keys(state.entities.operators)[0] ?? "");

  const operators = useMemo(() => Object.values(state.entities.operators), [state.entities.operators]);
  const selectedOperator = selectedOperatorId ? state.entities.operators[selectedOperatorId as never] ?? null : null;

  const selectTab = useCallback((_: React.SyntheticEvent, v: OperatorsTab) => setTab(v), []);

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
        <Chip size="small" label={`${operators.length} operators`} sx={{ opacity: 0.85 }} />
        {selectedOperator && <Chip size="small" label={`selected: ${selectedOperator.displayName}`} sx={{ opacity: 0.75 }} />}
      </Box>

      <Tabs value={tab} onChange={selectTab} sx={{ mt: 2, "& .MuiTab-root": { textTransform: "none", fontWeight: 800 } }}>
        <Tab value="marketplace" label="Marketplace" />
        <Tab value="dashboard" label="Operator dashboard" />
        <Tab value="rewards" label="Rewards & settlement" />
      </Tabs>

      <Divider sx={{ my: 2 }} />

      {tab === "marketplace" && (
        <Marketplace
          selectedOperatorId={selectedOperatorId}
          onSelectOperatorId={setSelectedOperatorId}
        />
      )}
      {tab === "dashboard" && (
        <OperatorDashboard
          selectedOperatorId={selectedOperatorId}
          onSelectOperatorId={setSelectedOperatorId}
        />
      )}
      {tab === "rewards" && (
        <RewardsSettlement
          selectedOperatorId={selectedOperatorId}
          onSelectOperatorId={setSelectedOperatorId}
        />
      )}

      {/* Small toast for operator actions */}
      {state.ui.lastToast && (
        <Box sx={{ mt: 2 }}>
          <Typography sx={{ ...contentMonoSx, fontSize: "0.75rem", color: "text.secondary" }}>
            {state.ui.lastToast.message}
          </Typography>
        </Box>
      )}
    </Box>
  );
}

function Marketplace(props: {
  selectedOperatorId: string;
  onSelectOperatorId: (id: string) => void;
}): React.ReactElement {
  const { state, dispatch } = useHavenStore();

  const operators = useMemo(
    () => Object.values(state.entities.operators).sort((a, b) => b.reputationScore - a.reputationScore),
    [state.entities.operators]
  );

  const eligibleJobs = useMemo(() => {
    const stages: PipelineStage[] = ["capture", "archive"];
    return Object.values(state.entities.pipelineJobs)
      .filter((j) => stages.includes(j.stage) && (j.status === "queued" || j.status === "running"))
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  }, [state.entities.pipelineJobs]);

  const [jobId, setJobId] = useState<string>(eligibleJobs[0]?.id ?? "");

  const assign = useCallback(() => {
    const op = state.entities.operators[props.selectedOperatorId as never] as Operator | undefined;
    const job = state.entities.pipelineJobs[jobId as never] as PipelineJob | undefined;
    if (!op || !job) return;
    dispatch({ type: "pipeline:assignOperator", jobId: job.id, operatorId: op.id });
    dispatch({
      type: "pipeline:updateJob",
      jobId: job.id,
      patch: { lastMessage: `Assigned to ${op.displayName} (simulated).`, updatedAt: nowIso() },
    });
    dispatch({ type: "toast:set", id: createLocalId("toast"), message: `Assigned ${op.displayName} to job ${job.id}` });
  }, [dispatch, jobId, props.selectedOperatorId, state.entities.operators, state.entities.pipelineJobs]);

  return (
    <Box sx={{ display: "grid", gridTemplateColumns: "1fr 420px", gap: 2 }}>
      <List dense>
        {operators.map((op) => (
          <ListItemButton
            key={op.id}
            selected={props.selectedOperatorId === op.id}
            onClick={() => props.onSelectOperatorId(op.id)}
            sx={{ borderRadius: 2, mb: 0.5 }}
          >
            <ListItemText
              primary={<Typography sx={{ fontWeight: 900 }}>{op.displayName}</Typography>}
              secondary={
                <Typography variant="body2" sx={{ color: "text.secondary" }}>
                  {op.locationHint} • {op.uptimePercent.toFixed(1)}% uptime • {op.storageGbAvailable} GB free • {op.pricePerJob} HVN/job (sim)
                </Typography>
              }
            />
          </ListItemButton>
        ))}
      </List>

      <Box sx={{ p: 2, borderRadius: 2, border: "1px solid rgba(255,255,255,0.10)", backgroundColor: "rgba(0,0,0,0.18)" }}>
        <Typography sx={{ fontWeight: 900, mb: 1 }}>Assign operator (simulated)</Typography>
        <FormControl fullWidth size="small">
          <InputLabel id="job-select-label">Job</InputLabel>
          <Select
            labelId="job-select-label"
            value={jobId}
            label="Job"
            onChange={(e) => setJobId(String(e.target.value))}
          >
            {eligibleJobs.map((j) => (
              <MenuItem key={j.id} value={j.id}>
                {j.stage} • {state.entities.artifacts[j.artifactId]?.title ?? j.artifactId}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Button sx={{ mt: 1.5 }} fullWidth variant="contained" onClick={assign} disabled={!jobId || !props.selectedOperatorId}>
          Assign selected operator
        </Button>
        {eligibleJobs.length === 0 && (
          <Typography variant="body2" sx={{ color: "text.secondary", mt: 1 }}>
            No capture/archive jobs are currently queued or running.
          </Typography>
        )}
      </Box>
    </Box>
  );
}

function OperatorDashboard(props: {
  selectedOperatorId: string;
  onSelectOperatorId: (id: string) => void;
}): React.ReactElement {
  const { state } = useHavenStore();
  const operators = Object.values(state.entities.operators);
  const selected = props.selectedOperatorId ? state.entities.operators[props.selectedOperatorId as never] ?? null : null;
  const jobs = useMemo(() => {
    if (!selected) return [];
    return Object.values(state.entities.pipelineJobs).filter((j) => j.assignedOperatorId === selected.id);
  }, [selected, state.entities.pipelineJobs]);

  return (
    <Box sx={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 2 }}>
      <List dense>
        {operators.map((op) => (
          <ListItemButton
            key={op.id}
            selected={props.selectedOperatorId === op.id}
            onClick={() => props.onSelectOperatorId(op.id)}
            sx={{ borderRadius: 2, mb: 0.5 }}
          >
            <ListItemText primary={op.displayName} secondary={`${op.uptimePercent.toFixed(1)}% uptime`} />
          </ListItemButton>
        ))}
      </List>

      <Box sx={{ p: 2, borderRadius: 2, border: "1px solid rgba(255,255,255,0.10)", backgroundColor: "rgba(0,0,0,0.18)" }}>
        {selected ? (
          <>
            <Typography sx={{ fontWeight: 900 }}>{selected.displayName}</Typography>
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              {selected.locationHint} • reputation {selected.reputationScore}/100
            </Typography>
            <Divider sx={{ my: 1.5 }} />
            <Typography sx={{ fontWeight: 800 }}>Capacity</Typography>
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              Storage available: {selected.storageGbAvailable} GB
            </Typography>
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              Uptime: {selected.uptimePercent.toFixed(1)}%
            </Typography>
            <Divider sx={{ my: 1.5 }} />
            <Typography sx={{ fontWeight: 800 }}>Assigned jobs</Typography>
            <List dense>
              {jobs.map((j) => (
                <ListItemText
                  key={j.id}
                  primary={<Typography sx={{ fontWeight: 800 }}>{state.entities.artifacts[j.artifactId]?.title ?? j.artifactId}</Typography>}
                  secondary={<Typography variant="body2" sx={{ color: "text.secondary" }}>{j.stage} • {j.status} • {j.progressPercent}%</Typography>}
                  sx={{ mb: 1 }}
                />
              ))}
            </List>
            {jobs.length === 0 && (
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                No jobs assigned yet.
              </Typography>
            )}
          </>
        ) : (
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            Select an operator.
          </Typography>
        )}
      </Box>
    </Box>
  );
}

function RewardsSettlement(props: {
  selectedOperatorId: string;
  onSelectOperatorId: (id: string) => void;
}): React.ReactElement {
  const { state } = useHavenStore();
  const operators = Object.values(state.entities.operators);
  const selected = props.selectedOperatorId ? state.entities.operators[props.selectedOperatorId as never] ?? null : null;

  const completedJobs = useMemo(() => {
    if (!selected) return [];
    return Object.values(state.entities.pipelineJobs)
      .filter((j) => j.assignedOperatorId === selected.id && j.status === "completed")
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  }, [selected, state.entities.pipelineJobs]);

  const totalRewards = useMemo(() => {
    if (!selected) return 0;
    // UI-only: reward per completed job is derived from pricePerJob (placeholder economics)
    return completedJobs.reduce((sum, _j) => sum + selected.pricePerJob, 0);
  }, [completedJobs, selected]);

  return (
    <Box sx={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 2 }}>
      <List dense>
        {operators.map((op) => (
          <ListItemButton
            key={op.id}
            selected={props.selectedOperatorId === op.id}
            onClick={() => props.onSelectOperatorId(op.id)}
            sx={{ borderRadius: 2, mb: 0.5 }}
          >
            <ListItemText primary={op.displayName} secondary={`${op.pricePerJob} HVN/job`} />
          </ListItemButton>
        ))}
      </List>

      <Box sx={{ p: 2, borderRadius: 2, border: "1px solid rgba(255,255,255,0.10)", backgroundColor: "rgba(0,0,0,0.18)" }}>
        {selected ? (
          <>
            <Typography sx={{ fontWeight: 900 }}>Settlement ledger (simulated)</Typography>
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              “No Service, No Rewards” — rewards are only shown for completed jobs.
            </Typography>
            <Divider sx={{ my: 1.5 }} />
            <Typography sx={{ fontWeight: 800 }}>
              Total rewards:{" "}
              <Typography component="span" sx={{ ...contentMonoSx }}>
                {totalRewards.toFixed(2)} HVN
              </Typography>
            </Typography>
            <Divider sx={{ my: 1.5 }} />
            <List dense>
              {completedJobs.map((j) => (
                <ListItemText
                  key={j.id}
                  primary={<Typography sx={{ fontWeight: 800 }}>{state.entities.artifacts[j.artifactId]?.title ?? j.artifactId}</Typography>}
                  secondary={<Typography variant="body2" sx={{ color: "text.secondary" }}>{j.stage} • +{selected.pricePerJob} HVN</Typography>}
                  sx={{ mb: 1 }}
                />
              ))}
            </List>
            {completedJobs.length === 0 && (
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                No completed jobs yet; no rewards issued.
              </Typography>
            )}
          </>
        ) : (
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            Select an operator.
          </Typography>
        )}
      </Box>
    </Box>
  );
}

