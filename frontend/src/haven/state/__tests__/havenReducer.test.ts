import { createSeedState } from "@/haven/seed/seedData";
import { havenReducer } from "@/haven/state/havenReducer";
import { asCollectionId, asCommentId, asGovernanceProposalId } from "@/haven/model/ids";
import { nowIso } from "@/haven/util/time";
import { createLocalId } from "@/haven/util/idFactory";

describe("havenReducer", () => {
  it("navigates views and selects entities", () => {
    const seed = createSeedState();
    const firstHubId = Object.keys(seed.entities.hubs)[0] as never;

    const s1 = havenReducer(seed, { type: "view:navigate", view: { kind: "operators" } });
    expect(s1.selection.view.kind).toBe("operators");

    const s2 = havenReducer(s1, { type: "hub:setActive", hubId: firstHubId });
    expect(s2.selection.view.kind).toBe("hub");
    if (s2.selection.view.kind === "hub") {
      expect(s2.selection.view.hubId).toBe(firstHubId);
    }
  });

  it("updates filters and UI flags", () => {
    const seed = createSeedState();
    const s1 = havenReducer(seed, { type: "filters:setQuery", query: "rally" });
    expect(s1.filters.searchQuery).toBe("rally");

    const s2 = havenReducer(s1, { type: "filters:setOnlyNeedsAttention", only: true });
    expect(s2.filters.onlyNeedsAttention).toBe(true);

    const s3 = havenReducer(s2, { type: "filters:setThreadTypes", threadTypes: ["discussion"] });
    expect(s3.filters.threadTypes).toEqual(["discussion"]);

    const s4 = havenReducer(s3, { type: "ui:setCommandPaletteOpen", open: true });
    expect(s4.ui.commandPaletteOpen).toBe(true);
  });

  it("creates and edits collections and reorders items", () => {
    const seed = createSeedState();
    const hubId = Object.values(seed.entities.hubs)[0]!.id;
    const userId = Object.values(seed.entities.users)[0]!.id;
    const now = nowIso();

    const newCollectionId = asCollectionId("collection_test");
    const created = havenReducer(seed, {
      type: "collection:create",
      collection: {
        id: newCollectionId,
        hubId,
        name: "Test",
        description: "Desc",
        artifactIds: [],
        pinned: false,
        createdAt: now,
        createdBy: userId,
      },
    });
    expect(created.entities.collections[newCollectionId].name).toBe("Test");
    expect(created.selection.selectedCollectionId).toBe(newCollectionId);

    const renamed = havenReducer(created, { type: "collection:rename", collectionId: newCollectionId, name: "Renamed" });
    expect(renamed.entities.collections[newCollectionId].name).toBe("Renamed");

    const pinned = havenReducer(renamed, { type: "collection:togglePinned", collectionId: newCollectionId, pinned: true });
    expect(pinned.entities.collections[newCollectionId].pinned).toBe(true);

    const artifacts = Object.values(seed.entities.artifacts);
    const a1 = artifacts[0]!.id;
    const a2 = artifacts[1]!.id;
    const withA1 = havenReducer(pinned, { type: "collection:addArtifact", collectionId: newCollectionId, artifactId: a1 });
    const withA2 = havenReducer(withA1, { type: "collection:addArtifact", collectionId: newCollectionId, artifactId: a2 });
    expect(withA2.entities.collections[newCollectionId].artifactIds).toEqual([a1, a2]);

    const reordered = havenReducer(withA2, {
      type: "collection:reorderArtifact",
      collectionId: newCollectionId,
      fromIndex: 0,
      toIndex: 1,
    });
    expect(reordered.entities.collections[newCollectionId].artifactIds).toEqual([a2, a1]);

    const removed = havenReducer(reordered, { type: "collection:removeArtifact", collectionId: newCollectionId, artifactId: a2 });
    expect(removed.entities.collections[newCollectionId].artifactIds).toEqual([a1]);
  });

  it("updates artifact analysis, integrity, provenance, and comments", () => {
    const seed = createSeedState();
    const artifact = Object.values(seed.entities.artifacts)[0]!;
    const tagId = artifact.tags[0]!;

    const s1 = havenReducer(seed, {
      type: "artifact:addAnalysisTag",
      artifactId: artifact.id,
      tag: { tagId, atSeconds: 10, label: "Test tag", confidence: 0.5 },
    });
    expect(s1.entities.artifacts[artifact.id].analysis.tags.some((t) => t.label === "Test tag")).toBe(true);

    const s2 = havenReducer(s1, {
      type: "artifact:addSummarySegment",
      artifactId: artifact.id,
      segment: { startSeconds: 0, endSeconds: 5, summary: "Hello" },
    });
    expect(s2.entities.artifacts[artifact.id].analysis.summaries.some((s) => s.summary === "Hello")).toBe(true);

    const s3 = havenReducer(s2, {
      type: "artifact:setIntegrity",
      artifactId: artifact.id,
      patch: { cid: "bafy_test" },
    });
    expect(s3.entities.artifacts[artifact.id].integrity.cid).toBe("bafy_test");

    const s4 = havenReducer(s3, {
      type: "artifact:addProvenance",
      artifactId: artifact.id,
      step: {
        id: "prov_test",
        stage: "archive",
        at: nowIso(),
        actorUserId: Object.values(seed.entities.users)[0]!.id,
        note: "Archived",
      },
    });
    expect(s4.entities.artifacts[artifact.id].provenance.some((p) => p.id === "prov_test")).toBe(true);

    const commentId = asCommentId(createLocalId("comment"));
    const s5 = havenReducer(s4, {
      type: "comment:add",
      threadId: artifact.discussionThreadId,
      comment: {
        id: commentId,
        threadId: artifact.discussionThreadId,
        authorId: Object.values(seed.entities.users)[0]!.id,
        createdAt: nowIso(),
        updatedAt: null,
        bodyMarkdown: "New comment",
        parentCommentId: null,
        artifactTimestampSeconds: null,
      },
    });
    expect(s5.entities.comments[commentId].bodyMarkdown).toBe("New comment");
    expect(s5.entities.discussionThreads[artifact.discussionThreadId].commentIds).toContain(commentId);
  });

  it("creates and updates pipeline jobs and assigns operators", () => {
    const seed = createSeedState();
    const job = Object.values(seed.entities.pipelineJobs)[0]!;
    const operator = Object.values(seed.entities.operators)[0]!;

    const s1 = havenReducer(seed, { type: "pipeline:assignOperator", jobId: job.id, operatorId: operator.id });
    expect(s1.entities.pipelineJobs[job.id].assignedOperatorId).toBe(operator.id);

    const s2 = havenReducer(s1, {
      type: "pipeline:updateJob",
      jobId: job.id,
      patch: { progressPercent: 33, lastMessage: "Working", updatedAt: nowIso() },
    });
    expect(s2.entities.pipelineJobs[job.id].progressPercent).toBe(33);
    expect(s2.entities.pipelineJobs[job.id].lastMessage).toBe("Working");
  });

  it("creates governance proposals and casts votes", () => {
    const seed = createSeedState();
    const hubId = Object.values(seed.entities.hubs)[0]!.id;
    const userId = Object.values(seed.entities.users)[0]!.id;
    const now = nowIso();
    const proposalId = asGovernanceProposalId("proposal_test");

    const created = havenReducer(seed, {
      type: "governance:createProposal",
      proposal: {
        id: proposalId,
        hubId,
        title: "Test proposal",
        descriptionMarkdown: "desc",
        status: "open",
        createdAt: now,
        createdBy: userId,
        openFrom: now,
        openUntil: null,
        votes: [],
      },
    });
    expect(created.entities.governanceProposals[proposalId].title).toBe("Test proposal");

    const voted = havenReducer(created, {
      type: "governance:castVote",
      proposalId,
      voterId: userId,
      choice: "yes",
      weight: 1,
      castAt: now,
    });
    expect(voted.entities.governanceProposals[proposalId].votes.length).toBe(1);
    expect(voted.entities.governanceProposals[proposalId].votes[0]!.choice).toBe("yes");
  });

  it("resolves moderation cases", () => {
    const seed = createSeedState();
    const c = Object.values(seed.entities.moderationCases)[0]!;
    const userId = Object.values(seed.entities.users)[0]!.id;
    const now = nowIso();

    const resolved = havenReducer(seed, {
      type: "moderation:resolve",
      caseId: c.id,
      decidedAction: "warn",
      decidedAt: now,
      decidedBy: userId,
    });
    expect(resolved.entities.moderationCases[c.id].status).toBe("resolved");
    expect(resolved.entities.moderationCases[c.id].decidedAction).toBe("warn");
  });

  it("sets and clears toast", () => {
    const seed = createSeedState();
    const s1 = havenReducer(seed, { type: "toast:set", id: "t1", message: "Hello" });
    expect(s1.ui.lastToast?.message).toBe("Hello");
    const s2 = havenReducer(s1, { type: "toast:clear" });
    expect(s2.ui.lastToast).toBeNull();
  });

  it("adds/removes hub members and updates roles", () => {
    const seed = createSeedState();
    const hub = Object.values(seed.entities.hubs)[0]!;
    const allUsers = Object.values(seed.entities.users);
    const existing = new Set(hub.memberIds);
    const candidate = allUsers.find((u) => !existing.has(u.id)) ?? null;
    if (!candidate) {
      // Seed may already include all users in hub; in that case just assert role update on an existing member.
      const memberId = hub.memberIds[0]!;
      const updated = havenReducer(seed, { type: "hub:setMemberRole", hubId: hub.id, userId: memberId, role: "moderator" });
      expect(updated.entities.hubs[hub.id].members[memberId].role).toBe("moderator");
      return;
    }

    const joinedAt = nowIso();
    const added = havenReducer(seed, { type: "hub:addMember", hubId: hub.id, userId: candidate.id, role: "member", joinedAt });
    expect(added.entities.hubs[hub.id].memberIds).toContain(candidate.id);
    expect(added.entities.hubs[hub.id].members[candidate.id].joinedAt).toBe(joinedAt);

    const promoted = havenReducer(added, { type: "hub:setMemberRole", hubId: hub.id, userId: candidate.id, role: "curator" });
    expect(promoted.entities.hubs[hub.id].members[candidate.id].role).toBe("curator");

    const removed = havenReducer(promoted, { type: "hub:removeMember", hubId: hub.id, userId: candidate.id });
    expect(removed.entities.hubs[hub.id].memberIds).not.toContain(candidate.id);
    expect(removed.entities.hubs[hub.id].members[candidate.id]).toBeUndefined();
  });
});

