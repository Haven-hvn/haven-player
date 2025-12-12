import React, { useCallback, useMemo, useState } from "react";
import {
  Box,
  Button,
  Chip,
  Divider,
  FormControl,
  InputLabel,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  MenuItem,
  Select,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import type { Artifact, Collection, GovernanceProposal, Hub, HubMember, ModerationCase } from "@/haven/model/types";
import type { HubRole } from "@/haven/model/enums";
import { useHavenStore } from "@/haven/state/havenStore";
import { createLocalId } from "@/haven/util/idFactory";
import { nowIso } from "@/haven/util/time";
import { asCollectionId, asGovernanceProposalId } from "@/haven/model/ids";
import { contentMonoSx } from "@/theme/havenTheme";
import { exportArkivWeeklyCatalog } from "@/haven/pipeline/arkivCatalog";

type HubTab = "overview" | "collections" | "members" | "governance" | "moderation";

export function HubPanel(props: { hubId: Hub["id"] }): React.ReactElement {
  const { state, dispatch } = useHavenStore();
  const hub = state.entities.hubs[props.hubId];
  const [tab, setTab] = useState<HubTab>("overview");

  const activeUser = useMemo(() => Object.values(state.entities.users)[0] ?? null, [state.entities.users]);
  const role: HubRole | null = useMemo(() => {
    if (!activeUser) return null;
    return hub.members[activeUser.id]?.role ?? null;
  }, [activeUser, hub.members]);

  const collections = useMemo(() => {
    return Object.values(state.entities.collections).filter((c) => c.hubId === hub.id);
  }, [hub.id, state.entities.collections]);

  const proposals = useMemo(() => {
    return Object.values(state.entities.governanceProposals).filter((p) => p.hubId === hub.id);
  }, [hub.id, state.entities.governanceProposals]);

  const moderationCases = useMemo(() => {
    return Object.values(state.entities.moderationCases).filter((c) => c.hubId === hub.id);
  }, [hub.id, state.entities.moderationCases]);

  const selectTab = useCallback((_: React.SyntheticEvent, v: HubTab) => setTab(v), []);

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
        <Chip size="small" label={`Role: ${role ?? "guest"}`} sx={{ opacity: 0.85 }} />
        <Chip size="small" label={`${hub.memberIds.length} members`} sx={{ opacity: 0.75 }} />
        <Chip size="small" label={`${collections.length} collections`} sx={{ opacity: 0.75 }} />
      </Box>

      <Tabs
        value={tab}
        onChange={selectTab}
        sx={{ mt: 2, "& .MuiTab-root": { textTransform: "none", fontWeight: 800 } }}
      >
        <Tab value="overview" label="Overview" />
        <Tab value="collections" label="Collections" />
        <Tab value="members" label="Members & Roles" />
        <Tab value="governance" label="Governance" />
        <Tab value="moderation" label="Moderation" />
      </Tabs>

      <Divider sx={{ my: 2 }} />

      {tab === "overview" && <HubOverview hub={hub} />}
      {tab === "collections" && <HubCollections hub={hub} collections={collections} role={role} />}
      {tab === "members" && <HubMembers hub={hub} role={role} />}
      {tab === "governance" && <HubGovernance hub={hub} proposals={proposals} role={role} />}
      {tab === "moderation" && <HubModeration hub={hub} cases={moderationCases} role={role} />}
    </Box>
  );
}

function HubOverview(props: { hub: Hub }): React.ReactElement {
  const { state, dispatch } = useHavenStore();

  const hubArtifacts = useMemo(() => {
    return Object.values(state.entities.artifacts).filter((a) => a.hubId === props.hub.id);
  }, [props.hub.id, state.entities.artifacts]);

  const moderationOpenCount = useMemo(() => {
    return Object.values(state.entities.moderationCases).filter((c) => c.hubId === props.hub.id && c.status === "open").length;
  }, [props.hub.id, state.entities.moderationCases]);

  const verifyThree = useCallback(() => {
    const user = Object.values(state.entities.users)[0];
    if (!user) return;
    const toVerify = hubArtifacts
      .filter((a) => !a.integrity.verifiedBy.includes(user.id))
      .slice(0, 3);
    if (toVerify.length === 0) {
      dispatch({ type: "toast:set", id: createLocalId("toast"), message: "Nothing left to verify (simulated)" });
      return;
    }
    toVerify.forEach((a) => {
      dispatch({
        type: "artifact:setIntegrity",
        artifactId: a.id,
        patch: { verifiedBy: [...a.integrity.verifiedBy, user.id] },
      });
      dispatch({
        type: "artifact:addProvenance",
        artifactId: a.id,
        step: {
          id: createLocalId("prov_verify"),
          stage: "replay",
          at: nowIso(),
          actorUserId: user.id,
          note: "Verified via hub prompt (simulated).",
        },
      });
    });
    dispatch({ type: "toast:set", id: createLocalId("toast"), message: `Verified ${toVerify.length} artifacts (simulated)` });
  }, [dispatch, hubArtifacts, state.entities.users]);

  const reviewModeration = useCallback(() => {
    dispatch({ type: "toast:set", id: createLocalId("toast"), message: "Opening moderation queue…" });
    // Switch to moderation tab by navigating in Canvas: we can’t change HubPanel local tab here,
    // so we hint via toast and rely on the user to click Moderation. (Kept simple by design.)
  }, [dispatch]);

  const publishWeekly = useCallback(() => {
    const payload = exportArkivWeeklyCatalog(
      {
        hub: props.hub,
        artifacts: hubArtifacts.slice(0, 10),
      },
      nowIso()
    );
    dispatch({
      type: "toast:set",
      id: createLocalId("toast"),
      message: `Published weekly Arkiv catalog (simulated): ${payload.artifacts.length} artifacts`,
    });
  }, [dispatch, hubArtifacts, props.hub]);

  return (
    <Box>
      <Typography sx={{ fontWeight: 900, fontSize: "1.05rem" }}>{props.hub.description}</Typography>
      <Typography sx={{ ...contentMonoSx, color: "text.secondary", whiteSpace: "pre-wrap", mt: 2 }}>
        {props.hub.normsMarkdown}
      </Typography>

      <Divider sx={{ my: 2 }} />

      <Typography sx={{ fontWeight: 900, mb: 1 }}>Reciprocity prompts</Typography>
      <Typography variant="body2" sx={{ color: "text.secondary" }}>
        Small rituals that keep the archive trustworthy and alive (sample-data UX).
      </Typography>

      <Box sx={{ display: "grid", gridTemplateColumns: "1fr", gap: 1.5, mt: 1.5 }}>
        <Box sx={{ p: 1.5, borderRadius: 2, border: "1px solid rgba(255,255,255,0.10)", backgroundColor: "rgba(0,0,0,0.18)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1 }}>
          <Box>
            <Typography sx={{ fontWeight: 900 }}>Verify 3 artifacts</Typography>
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              Adds verification marks and provenance steps to unverified items.
            </Typography>
          </Box>
          <Button variant="outlined" onClick={verifyThree}>
            Do it
          </Button>
        </Box>

        <Box sx={{ p: 1.5, borderRadius: 2, border: "1px solid rgba(255,255,255,0.10)", backgroundColor: "rgba(0,0,0,0.18)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1 }}>
          <Box>
            <Typography sx={{ fontWeight: 900 }}>Review moderation queue</Typography>
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              {moderationOpenCount} open case{moderationOpenCount === 1 ? "" : "s"} in this hub.
            </Typography>
          </Box>
          <Button variant="outlined" onClick={reviewModeration}>
            Do it
          </Button>
        </Box>

        <Box sx={{ p: 1.5, borderRadius: 2, border: "1px solid rgba(255,255,255,0.10)", backgroundColor: "rgba(0,0,0,0.18)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1 }}>
          <Box>
            <Typography sx={{ fontWeight: 900 }}>Publish weekly Arkiv catalog</Typography>
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              Exports a portable weekly catalog payload (simulated).
            </Typography>
          </Box>
          <Button variant="outlined" onClick={publishWeekly}>
            Do it
          </Button>
        </Box>
      </Box>
    </Box>
  );
}

function HubCollections(props: {
  hub: Hub;
  collections: Collection[];
  role: HubRole | null;
}): React.ReactElement {
  const { state, dispatch } = useHavenStore();
  const [name, setName] = useState("New collection");
  const [description, setDescription] = useState("A curated set of artifacts.");

  const canCurate = props.role === "curator" || props.role === "archivist" || props.role === "moderator";

  const createCollection = useCallback(() => {
    if (!canCurate) return;
    const user = Object.values(state.entities.users)[0];
    if (!user) return;
    const now = nowIso();
    const collection: Collection = {
      id: asCollectionId(createLocalId("collection")),
      hubId: props.hub.id,
      name: name.trim() || "Untitled collection",
      description,
      artifactIds: [],
      pinned: false,
      createdAt: now,
      createdBy: user.id,
    };
    dispatch({ type: "collection:create", collection });
    dispatch({ type: "toast:set", id: createLocalId("toast"), message: "Collection created (simulated)" });
    setName("New collection");
  }, [canCurate, description, dispatch, name, props.hub.id, state.entities.users]);

  const artifacts = useMemo(() => Object.values(state.entities.artifacts).filter((a) => a.hubId === props.hub.id), [props.hub.id, state.entities.artifacts]);

  return (
    <Box sx={{ display: "grid", gridTemplateColumns: "1fr 420px", gap: 2 }}>
      <Box sx={{ minWidth: 0 }}>
        <List dense>
          {props.collections.map((c) => (
            <CollectionCard key={c.id} collection={c} artifacts={artifacts} canCurate={canCurate} />
          ))}
        </List>
        {props.collections.length === 0 && (
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            No collections yet.
          </Typography>
        )}
      </Box>

      <Box sx={{ p: 2, borderRadius: 2, border: "1px solid rgba(255,255,255,0.10)", backgroundColor: "rgba(0,0,0,0.18)" }}>
        <Typography sx={{ fontWeight: 900, mb: 1 }}>Create collection</Typography>
        <TextField fullWidth size="small" label="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <TextField
          fullWidth
          size="small"
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          sx={{ mt: 1.5 }}
        />
        <Button fullWidth sx={{ mt: 1.5 }} variant="contained" onClick={createCollection} disabled={!canCurate}>
          Create (simulated)
        </Button>
        {!canCurate && (
          <Typography variant="body2" sx={{ color: "text.secondary", mt: 1 }}>
            Only Curator/Moderator/Archivist roles can curate collections (UI gating).
          </Typography>
        )}
      </Box>
    </Box>
  );
}

function CollectionCard(props: {
  collection: Collection;
  artifacts: Artifact[];
  canCurate: boolean;
}): React.ReactElement {
  const { state, dispatch } = useHavenStore();
  const [addArtifactId, setAddArtifactId] = useState<string>(props.artifacts[0]?.id ?? "");
  const [dragFromIndex, setDragFromIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const add = useCallback(() => {
    if (!props.canCurate) return;
    const artifact = state.entities.artifacts[addArtifactId as never] as Artifact | undefined;
    if (!artifact) return;
    dispatch({ type: "collection:addArtifact", collectionId: props.collection.id, artifactId: artifact.id });
  }, [addArtifactId, dispatch, props.canCurate, props.collection.id, state.entities.artifacts]);

  const togglePin = useCallback(() => {
    if (!props.canCurate) return;
    dispatch({ type: "collection:togglePinned", collectionId: props.collection.id, pinned: !props.collection.pinned });
  }, [dispatch, props.canCurate, props.collection.id, props.collection.pinned]);

  return (
    <Box sx={{ mb: 2, p: 2, borderRadius: 2, border: "1px solid rgba(255,255,255,0.10)", backgroundColor: "rgba(0,0,0,0.18)" }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
        <Box>
          <Typography sx={{ fontWeight: 900 }}>{props.collection.name}</Typography>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>{props.collection.description}</Typography>
        </Box>
        <Button size="small" variant={props.collection.pinned ? "contained" : "outlined"} onClick={togglePin} disabled={!props.canCurate}>
          {props.collection.pinned ? "Pinned" : "Pin"}
        </Button>
      </Box>

      <Divider sx={{ my: 1.5 }} />

      <Typography variant="body2" sx={{ color: "text.secondary" }}>
        Items
      </Typography>
      <List dense>
        {props.collection.artifactIds.map((id, idx) => {
          const isDragging = dragFromIndex === idx;
          const isDropTarget = dragOverIndex === idx && dragFromIndex !== null && dragFromIndex !== idx;
          return (
            <Box
              key={id}
              data-testid={`collection-item-${props.collection.id}-${idx}`}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                borderRadius: 2,
                border: isDropTarget ? "1px dashed rgba(122,167,255,0.55)" : "1px solid transparent",
                backgroundColor: isDragging ? "rgba(255,255,255,0.04)" : "transparent",
                opacity: isDragging ? 0.75 : 1,
              }}
              draggable={props.canCurate}
              onDragStart={(e: React.DragEvent<HTMLDivElement>) => {
                if (!props.canCurate) return;
                setDragFromIndex(idx);
                setDragOverIndex(idx);
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", String(idx));
              }}
              onDragOver={(e: React.DragEvent<HTMLDivElement>) => {
                if (!props.canCurate) return;
                e.preventDefault(); // allow drop
                setDragOverIndex(idx);
                e.dataTransfer.dropEffect = "move";
              }}
              onDragLeave={() => {
                if (!props.canCurate) return;
                setDragOverIndex(null);
              }}
              onDrop={(e: React.DragEvent<HTMLDivElement>) => {
                if (!props.canCurate) return;
                e.preventDefault();
                const raw = e.dataTransfer.getData("text/plain");
                const from = Number(raw);
                const to = idx;
                if (Number.isFinite(from) && from >= 0 && from < props.collection.artifactIds.length && from !== to) {
                  dispatch({
                    type: "collection:reorderArtifact",
                    collectionId: props.collection.id,
                    fromIndex: from,
                    toIndex: to,
                  });
                  dispatch({ type: "toast:set", id: createLocalId("toast"), message: "Reordered collection (drag-and-drop)" });
                }
                setDragFromIndex(null);
                setDragOverIndex(null);
              }}
              onDragEnd={() => {
                if (!props.canCurate) return;
                setDragFromIndex(null);
                setDragOverIndex(null);
              }}
            >
              <ListItemButton
                sx={{ borderRadius: 2, flex: 1 }}
                onClick={() => dispatch({ type: "selection:setArtifact", artifactId: id })}
              >
                <ListItemText
                  primary={state.entities.artifacts[id]?.title ?? id}
                  secondary={idx === 0 ? "Top" : undefined}
                />
              </ListItemButton>
              {props.canCurate && (
                <Box sx={{ display: "flex", gap: 0.5 }}>
                  <IconButton
                    size="small"
                    aria-label="Remove from collection"
                    onClick={() =>
                      dispatch({
                        type: "collection:removeArtifact",
                        collectionId: props.collection.id,
                        artifactId: id,
                      })
                    }
                  >
                    <DeleteOutlineIcon fontSize="inherit" />
                  </IconButton>
                </Box>
              )}
            </Box>
          );
        })}
      </List>

      {props.canCurate && (
        <Typography variant="body2" sx={{ color: "text.secondary", mt: 1 }}>
          Tip: drag items to reorder this collection.
        </Typography>
      )}

      {props.canCurate && (
        <>
          <Divider sx={{ my: 1.5 }} />
          <FormControl fullWidth size="small">
            <InputLabel id={`${props.collection.id}-add`}>Add artifact</InputLabel>
            <Select
              labelId={`${props.collection.id}-add`}
              value={addArtifactId}
              label="Add artifact"
              onChange={(e) => setAddArtifactId(String(e.target.value))}
            >
              {props.artifacts.map((a) => (
                <MenuItem key={a.id} value={a.id}>
                  {a.title}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Button sx={{ mt: 1.5 }} fullWidth variant="outlined" onClick={add}>
            Add to collection
          </Button>
        </>
      )}
    </Box>
  );
}

function HubMembers(props: { hub: Hub; role: HubRole | null }): React.ReactElement {
  const { state, dispatch } = useHavenStore();
  const canManage = props.role === "moderator" || props.role === "archivist";

  const [newMemberUserId, setNewMemberUserId] = useState<string>("");
  const [newMemberRole, setNewMemberRole] = useState<HubRole>("member");

  const members = props.hub.memberIds
    .map((id) => state.entities.users[id])
    .filter(Boolean)
    .map((u) => ({ user: u, member: props.hub.members[u.id] as HubMember }));

  const availableUsers = useMemo(() => {
    const current = new Set(props.hub.memberIds);
    return Object.values(state.entities.users).filter((u) => !current.has(u.id));
  }, [props.hub.memberIds, state.entities.users]);

  const addMember = useCallback(() => {
    if (!canManage) return;
    if (!newMemberUserId) return;
    dispatch({
      type: "hub:addMember",
      hubId: props.hub.id,
      userId: newMemberUserId as never,
      role: newMemberRole,
      joinedAt: nowIso(),
    });
    dispatch({ type: "toast:set", id: createLocalId("toast"), message: "Member added (simulated)" });
    setNewMemberUserId("");
    setNewMemberRole("member");
  }, [canManage, dispatch, newMemberRole, newMemberUserId, props.hub.id]);

  return (
    <Box>
      <Typography sx={{ fontWeight: 900, mb: 1 }}>Members</Typography>
      <List dense>
        {members.map((m) => (
          <Box key={m.user.id} sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
            <Box sx={{ flex: 1 }}>
              <Typography sx={{ fontWeight: 800 }}>{m.user.displayName}</Typography>
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                @{m.user.handle}
              </Typography>
            </Box>

            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel id={`role-${m.user.id}`}>Role</InputLabel>
              <Select
                labelId={`role-${m.user.id}`}
                label="Role"
                value={m.member.role}
                onChange={(e) => {
                  if (!canManage) return;
                  dispatch({
                    type: "hub:setMemberRole",
                    hubId: props.hub.id,
                    userId: m.user.id,
                    role: String(e.target.value) as HubRole,
                  });
                  dispatch({ type: "toast:set", id: createLocalId("toast"), message: "Role updated (simulated)" });
                }}
                disabled={!canManage}
              >
                <MenuItem value="member">Member</MenuItem>
                <MenuItem value="curator">Curator</MenuItem>
                <MenuItem value="moderator">Moderator</MenuItem>
                <MenuItem value="archivist">Archivist</MenuItem>
              </Select>
            </FormControl>

            {canManage && (
              <IconButton
                size="small"
                aria-label="Remove member"
                onClick={() => {
                  dispatch({ type: "hub:removeMember", hubId: props.hub.id, userId: m.user.id });
                  dispatch({ type: "toast:set", id: createLocalId("toast"), message: "Member removed (simulated)" });
                }}
              >
                <DeleteOutlineIcon fontSize="inherit" />
              </IconButton>
            )}
          </Box>
        ))}
      </List>

      <Divider sx={{ my: 2 }} />
      <Typography sx={{ fontWeight: 900, mb: 1 }}>Add member</Typography>
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
        <FormControl size="small" sx={{ minWidth: 220, flex: 1 }}>
          <InputLabel id="add-member-user">User</InputLabel>
          <Select
            labelId="add-member-user"
            label="User"
            value={newMemberUserId}
            onChange={(e) => setNewMemberUserId(String(e.target.value))}
            disabled={!canManage}
          >
            {availableUsers.map((u) => (
              <MenuItem key={u.id} value={u.id}>
                {u.displayName} (@{u.handle})
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel id="add-member-role">Role</InputLabel>
          <Select
            labelId="add-member-role"
            label="Role"
            value={newMemberRole}
            onChange={(e) => setNewMemberRole(String(e.target.value) as HubRole)}
            disabled={!canManage}
          >
            <MenuItem value="member">Member</MenuItem>
            <MenuItem value="curator">Curator</MenuItem>
            <MenuItem value="moderator">Moderator</MenuItem>
            <MenuItem value="archivist">Archivist</MenuItem>
          </Select>
        </FormControl>
        <Button variant="contained" onClick={addMember} disabled={!canManage || !newMemberUserId}>
          Add
        </Button>
      </Box>
      {!canManage && (
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          Role assignment is visible but only moderators/archivists can manage (UI gating).
        </Typography>
      )}
    </Box>
  );
}

function HubGovernance(props: { hub: Hub; proposals: GovernanceProposal[]; role: HubRole | null }): React.ReactElement {
  const { state, dispatch } = useHavenStore();
  const user = Object.values(state.entities.users)[0] ?? null;
  const canPropose = props.role === "curator" || props.role === "moderator" || props.role === "archivist";

  const [title, setTitle] = useState("New proposal");
  const [desc, setDesc] = useState("Describe the change…");

  const createProposal = useCallback(() => {
    if (!canPropose || !user) return;
    const now = nowIso();
    const proposal: GovernanceProposal = {
      id: asGovernanceProposalId(createLocalId("proposal")),
      hubId: props.hub.id,
      title: title.trim() || "Untitled proposal",
      descriptionMarkdown: desc,
      status: "open",
      createdAt: now,
      createdBy: user.id,
      openFrom: now,
      openUntil: null,
      votes: [],
    };
    dispatch({ type: "governance:createProposal", proposal });
    dispatch({ type: "toast:set", id: createLocalId("toast"), message: "Proposal created (simulated)" });
  }, [canPropose, desc, dispatch, props.hub.id, title, user]);

  const castVote = useCallback(
    (proposalId: GovernanceProposal["id"], choice: "yes" | "no" | "abstain") => {
      if (!user) return;
      dispatch({
        type: "governance:castVote",
        proposalId,
        voterId: user.id,
        choice,
        weight: 1,
        castAt: nowIso(),
      });
      dispatch({ type: "toast:set", id: createLocalId("toast"), message: `Voted ${choice} (simulated)` });
    },
    [dispatch, user]
  );

  return (
    <Box sx={{ display: "grid", gridTemplateColumns: "1fr 420px", gap: 2 }}>
      <Box sx={{ minWidth: 0 }}>
        {props.proposals.map((p) => (
          <Box key={p.id} sx={{ mb: 2, p: 2, borderRadius: 2, border: "1px solid rgba(255,255,255,0.10)", backgroundColor: "rgba(0,0,0,0.18)" }}>
            <Typography sx={{ fontWeight: 900 }}>{p.title}</Typography>
            <Typography sx={{ ...contentMonoSx, fontSize: "0.8rem", color: "text.secondary", whiteSpace: "pre-wrap", mt: 1 }}>
              {p.descriptionMarkdown}
            </Typography>
            <Typography variant="body2" sx={{ color: "text.secondary", mt: 1 }}>
              Status: {p.status} • Votes: {p.votes.length}
            </Typography>
            <Box sx={{ display: "flex", gap: 1, mt: 1, flexWrap: "wrap" }}>
              <Button size="small" variant="contained" onClick={() => castVote(p.id, "yes")}>
                Yes
              </Button>
              <Button size="small" variant="outlined" onClick={() => castVote(p.id, "no")}>
                No
              </Button>
              <Button size="small" variant="outlined" onClick={() => castVote(p.id, "abstain")}>
                Abstain
              </Button>
            </Box>
          </Box>
        ))}
        {props.proposals.length === 0 && (
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            No proposals yet.
          </Typography>
        )}
      </Box>

      <Box sx={{ p: 2, borderRadius: 2, border: "1px solid rgba(255,255,255,0.10)", backgroundColor: "rgba(0,0,0,0.18)" }}>
        <Typography sx={{ fontWeight: 900, mb: 1 }}>Create proposal</Typography>
        <TextField fullWidth size="small" label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <TextField
          fullWidth
          size="small"
          label="Description"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          multiline
          minRows={4}
          sx={{ mt: 1.5 }}
        />
        <Button fullWidth sx={{ mt: 1.5 }} variant="contained" onClick={createProposal} disabled={!canPropose}>
          Propose (simulated)
        </Button>
        {!canPropose && (
          <Typography variant="body2" sx={{ color: "text.secondary", mt: 1 }}>
            Only Curator/Moderator/Archivist roles can propose (UI gating).
          </Typography>
        )}
      </Box>
    </Box>
  );
}

function HubModeration(props: { hub: Hub; cases: ModerationCase[]; role: HubRole | null }): React.ReactElement {
  const { state, dispatch } = useHavenStore();
  const user = Object.values(state.entities.users)[0] ?? null;
  const canModerate = props.role === "moderator" || props.role === "archivist";

  const resolve = useCallback(
    (caseId: ModerationCase["id"], decidedAction: ModerationCase["decidedAction"]) => {
      if (!canModerate || !user) return;
      dispatch({
        type: "moderation:resolve",
        caseId,
        decidedAction,
        decidedAt: nowIso(),
        decidedBy: user.id,
      });
      dispatch({ type: "toast:set", id: createLocalId("toast"), message: `Moderation case resolved: ${decidedAction}` });
    },
    [canModerate, dispatch, user]
  );

  return (
    <Box>
      <Typography sx={{ fontWeight: 900, mb: 1 }}>Moderation queue</Typography>
      {props.cases.map((c) => (
        <Box key={c.id} sx={{ mb: 2, p: 2, borderRadius: 2, border: "1px solid rgba(255,255,255,0.10)", backgroundColor: "rgba(0,0,0,0.18)" }}>
          <Typography sx={{ fontWeight: 900 }}>
            {c.targetType} • {c.status}
          </Typography>
          <Typography sx={{ ...contentMonoSx, fontSize: "0.78rem", color: "text.secondary" }}>
            target: {c.targetId}
          </Typography>
          <Typography variant="body2" sx={{ color: "text.secondary", mt: 1 }}>
            {c.reason}
          </Typography>

          {canModerate && c.status === "open" && (
            <Box sx={{ display: "flex", gap: 1, mt: 1, flexWrap: "wrap" }}>
              <Button size="small" variant="outlined" onClick={() => resolve(c.id, "warn")}>
                Warn
              </Button>
              <Button size="small" variant="outlined" onClick={() => resolve(c.id, "restrict_posting")}>
                Restrict posting
              </Button>
              <Button size="small" variant="outlined" onClick={() => resolve(c.id, "remove_from_hub")}>
                Remove from hub
              </Button>
              <Button size="small" variant="contained" onClick={() => resolve(c.id, "ban_member")}>
                Ban member
              </Button>
            </Box>
          )}
          {!canModerate && (
            <Typography variant="body2" sx={{ color: "text.secondary", mt: 1 }}>
              Only moderators/archivists can take action (UI gating).
            </Typography>
          )}
        </Box>
      ))}
      {props.cases.length === 0 && (
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          No cases.
        </Typography>
      )}
    </Box>
  );
}

