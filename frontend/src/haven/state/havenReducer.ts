import type { IsoDateTime, PipelineStage } from "@/haven/model/enums";
import type { HubRole } from "@/haven/model/enums";
import type {
  Artifact,
  ArtifactAnalysisTag,
  ArtifactSummarySegment,
  Collection,
  Comment,
  DiscussionThread,
  GovernanceProposal,
  GovernanceProposalStatus,
  HubMember,
  ModerationAction,
  ModerationCase,
  HavenState,
  HavenView,
  PipelineJob,
} from "@/haven/model/types";
import type {
  ArtifactId,
  CollectionId,
  CommentId,
  DiscussionThreadId,
  GovernanceProposalId,
  HubId,
  ModerationCaseId,
  OperatorId,
  PipelineJobId,
  ThreadId,
  UserId,
} from "@/haven/model/ids";

export type HavenAction =
  | { type: "view:navigate"; view: HavenView }
  | { type: "selection:setArtifact"; artifactId: ArtifactId | null }
  | { type: "selection:setCollection"; collectionId: CollectionId | null }
  | { type: "selection:setMarginaliaTab"; tab: HavenState["selection"]["activeMarginaliaTab"] }
  | { type: "selection:setHoveredThread"; threadId: ThreadId | null }
  | { type: "selection:setSelectedThread"; threadId: ThreadId | null }
  | { type: "split:setEnabled"; enabled: boolean }
  | { type: "split:setSecondaryArtifact"; artifactId: ArtifactId | null }
  | { type: "filters:setQuery"; query: string }
  | { type: "filters:setOnlyNeedsAttention"; only: boolean }
  | { type: "filters:setThreadTypes"; threadTypes: HavenState["filters"]["threadTypes"] }
  | { type: "ui:setCommandPaletteOpen"; open: boolean }
  | { type: "artifact:create"; artifact: Artifact; thread: DiscussionThread }
  | {
      type: "artifact:update";
      artifactId: ArtifactId;
      patch: Partial<Pick<Artifact, "title" | "accessPolicy" | "encryptedBeforeUpload" | "tags" | "curatorNotesMarkdown">>;
    }
  | { type: "artifact:addAnalysisTag"; artifactId: ArtifactId; tag: ArtifactAnalysisTag }
  | { type: "artifact:addSummarySegment"; artifactId: ArtifactId; segment: ArtifactSummarySegment }
  | { type: "artifact:setIntegrity"; artifactId: ArtifactId; patch: Partial<Artifact["integrity"]> }
  | { type: "artifact:addProvenance"; artifactId: ArtifactId; step: Artifact["provenance"][number] }
  | { type: "collection:create"; collection: Collection }
  | { type: "collection:rename"; collectionId: CollectionId; name: string }
  | { type: "collection:togglePinned"; collectionId: CollectionId; pinned: boolean }
  | { type: "collection:reorderArtifact"; collectionId: CollectionId; fromIndex: number; toIndex: number }
  | { type: "collection:addArtifact"; collectionId: CollectionId; artifactId: ArtifactId }
  | { type: "collection:removeArtifact"; collectionId: CollectionId; artifactId: ArtifactId }
  | { type: "comment:add"; threadId: DiscussionThreadId; comment: Comment }
  | { type: "comment:update"; commentId: CommentId; bodyMarkdown: string; updatedAt: string }
  | { type: "pipeline:createJob"; job: PipelineJob }
  | { type: "pipeline:updateJob"; jobId: PipelineJobId; patch: Partial<Pick<PipelineJob, "status" | "progressPercent" | "lastMessage" | "updatedAt" | "assignedOperatorId" | "retryCount">> }
  | { type: "pipeline:assignOperator"; jobId: PipelineJobId; operatorId: OperatorId | null }
  | { type: "hub:setActive"; hubId: HubId }
  | { type: "hub:addMember"; hubId: HubId; userId: UserId; role: HubRole; joinedAt: IsoDateTime }
  | { type: "hub:removeMember"; hubId: HubId; userId: UserId }
  | { type: "hub:setMemberRole"; hubId: HubId; userId: UserId; role: HubRole }
  | { type: "governance:createProposal"; proposal: GovernanceProposal }
  | { type: "governance:setStatus"; proposalId: GovernanceProposalId; status: GovernanceProposalStatus }
  | { type: "governance:castVote"; proposalId: GovernanceProposalId; voterId: UserId; choice: "yes" | "no" | "abstain"; weight: number; castAt: IsoDateTime }
  | { type: "moderation:resolve"; caseId: ModerationCaseId; decidedAction: ModerationAction; decidedAt: IsoDateTime; decidedBy: UserId }
  | { type: "toast:set"; id: string; message: string }
  | { type: "toast:clear" };

export function havenReducer(state: HavenState, action: HavenAction): HavenState {
  switch (action.type) {
    case "view:navigate": {
      return { ...state, selection: { ...state.selection, view: action.view } };
    }
    case "selection:setArtifact": {
      return { ...state, selection: { ...state.selection, selectedArtifactId: action.artifactId } };
    }
    case "selection:setCollection": {
      return { ...state, selection: { ...state.selection, selectedCollectionId: action.collectionId } };
    }
    case "selection:setMarginaliaTab": {
      return { ...state, selection: { ...state.selection, activeMarginaliaTab: action.tab } };
    }
    case "selection:setHoveredThread": {
      return { ...state, selection: { ...state.selection, hoveredThreadId: action.threadId } };
    }
    case "selection:setSelectedThread": {
      return { ...state, selection: { ...state.selection, selectedThreadId: action.threadId } };
    }
    case "split:setEnabled": {
      const nextSplit = { ...state.selection.splitView, enabled: action.enabled };
      if (!action.enabled) {
        nextSplit.secondaryArtifactId = null;
      }
      return { ...state, selection: { ...state.selection, splitView: nextSplit } };
    }
    case "split:setSecondaryArtifact": {
      return {
        ...state,
        selection: {
          ...state.selection,
          splitView: { ...state.selection.splitView, secondaryArtifactId: action.artifactId },
        },
      };
    }
    case "filters:setQuery": {
      return { ...state, filters: { ...state.filters, searchQuery: action.query } };
    }
    case "filters:setOnlyNeedsAttention": {
      return { ...state, filters: { ...state.filters, onlyNeedsAttention: action.only } };
    }
    case "filters:setThreadTypes": {
      return { ...state, filters: { ...state.filters, threadTypes: action.threadTypes } };
    }
    case "ui:setCommandPaletteOpen": {
      return { ...state, ui: { ...state.ui, commandPaletteOpen: action.open } };
    }
    case "artifact:create": {
      return {
        ...state,
        entities: {
          ...state.entities,
          artifacts: { ...state.entities.artifacts, [action.artifact.id]: action.artifact },
          discussionThreads: {
            ...state.entities.discussionThreads,
            [action.thread.id]: action.thread,
          },
        },
        selection: {
          ...state.selection,
          selectedArtifactId: action.artifact.id,
        },
      };
    }
    case "artifact:update": {
      const current = state.entities.artifacts[action.artifactId];
      if (!current) return state;
      const updated: Artifact = { ...current, ...action.patch };
      return {
        ...state,
        entities: {
          ...state.entities,
          artifacts: { ...state.entities.artifacts, [action.artifactId]: updated },
        },
      };
    }
    case "artifact:addAnalysisTag": {
      const current = state.entities.artifacts[action.artifactId];
      if (!current) return state;
      const updated: Artifact = {
        ...current,
        analysis: {
          ...current.analysis,
          tags: [...current.analysis.tags, action.tag].sort((a, b) => a.atSeconds - b.atSeconds),
        },
      };
      return {
        ...state,
        entities: {
          ...state.entities,
          artifacts: { ...state.entities.artifacts, [action.artifactId]: updated },
        },
      };
    }
    case "artifact:addSummarySegment": {
      const current = state.entities.artifacts[action.artifactId];
      if (!current) return state;
      const updated: Artifact = {
        ...current,
        analysis: {
          ...current.analysis,
          summaries: [...current.analysis.summaries, action.segment].sort(
            (a, b) => a.startSeconds - b.startSeconds
          ),
        },
      };
      return {
        ...state,
        entities: {
          ...state.entities,
          artifacts: { ...state.entities.artifacts, [action.artifactId]: updated },
        },
      };
    }
    case "artifact:setIntegrity": {
      const current = state.entities.artifacts[action.artifactId];
      if (!current) return state;
      const updated: Artifact = {
        ...current,
        integrity: { ...current.integrity, ...action.patch },
      };
      return {
        ...state,
        entities: {
          ...state.entities,
          artifacts: { ...state.entities.artifacts, [action.artifactId]: updated },
        },
      };
    }
    case "artifact:addProvenance": {
      const current = state.entities.artifacts[action.artifactId];
      if (!current) return state;
      const updated: Artifact = {
        ...current,
        provenance: [...current.provenance, action.step],
      };
      return {
        ...state,
        entities: {
          ...state.entities,
          artifacts: { ...state.entities.artifacts, [action.artifactId]: updated },
        },
      };
    }
    case "collection:create": {
      return {
        ...state,
        entities: {
          ...state.entities,
          collections: { ...state.entities.collections, [action.collection.id]: action.collection },
        },
        selection: { ...state.selection, selectedCollectionId: action.collection.id },
      };
    }
    case "collection:rename": {
      const current = state.entities.collections[action.collectionId];
      if (!current) return state;
      return {
        ...state,
        entities: {
          ...state.entities,
          collections: {
            ...state.entities.collections,
            [action.collectionId]: { ...current, name: action.name },
          },
        },
      };
    }
    case "collection:togglePinned": {
      const current = state.entities.collections[action.collectionId];
      if (!current) return state;
      return {
        ...state,
        entities: {
          ...state.entities,
          collections: {
            ...state.entities.collections,
            [action.collectionId]: { ...current, pinned: action.pinned },
          },
        },
      };
    }
    case "collection:reorderArtifact": {
      const current = state.entities.collections[action.collectionId];
      if (!current) return state;
      const { fromIndex, toIndex } = action;
      if (fromIndex < 0 || fromIndex >= current.artifactIds.length) return state;
      if (toIndex < 0 || toIndex >= current.artifactIds.length) return state;
      const next = [...current.artifactIds];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return {
        ...state,
        entities: {
          ...state.entities,
          collections: {
            ...state.entities.collections,
            [action.collectionId]: { ...current, artifactIds: next },
          },
        },
      };
    }
    case "collection:addArtifact": {
      const current = state.entities.collections[action.collectionId];
      if (!current) return state;
      if (current.artifactIds.includes(action.artifactId)) return state;
      return {
        ...state,
        entities: {
          ...state.entities,
          collections: {
            ...state.entities.collections,
            [action.collectionId]: { ...current, artifactIds: [...current.artifactIds, action.artifactId] },
          },
        },
      };
    }
    case "collection:removeArtifact": {
      const current = state.entities.collections[action.collectionId];
      if (!current) return state;
      return {
        ...state,
        entities: {
          ...state.entities,
          collections: {
            ...state.entities.collections,
            [action.collectionId]: {
              ...current,
              artifactIds: current.artifactIds.filter((id) => id !== action.artifactId),
            },
          },
        },
      };
    }
    case "comment:add": {
      const thread = state.entities.discussionThreads[action.threadId];
      if (!thread) return state;
      return {
        ...state,
        entities: {
          ...state.entities,
          comments: { ...state.entities.comments, [action.comment.id]: action.comment },
          discussionThreads: {
            ...state.entities.discussionThreads,
            [action.threadId]: {
              ...thread,
              commentIds: [...thread.commentIds, action.comment.id],
            },
          },
        },
      };
    }
    case "comment:update": {
      const current = state.entities.comments[action.commentId];
      if (!current) return state;
      const updated: Comment = { ...current, bodyMarkdown: action.bodyMarkdown, updatedAt: action.updatedAt };
      return {
        ...state,
        entities: {
          ...state.entities,
          comments: { ...state.entities.comments, [action.commentId]: updated },
        },
      };
    }
    case "pipeline:createJob": {
      return {
        ...state,
        entities: {
          ...state.entities,
          pipelineJobs: { ...state.entities.pipelineJobs, [action.job.id]: action.job },
        },
      };
    }
    case "pipeline:updateJob": {
      const current = state.entities.pipelineJobs[action.jobId];
      if (!current) return state;
      const updated: PipelineJob = { ...current, ...action.patch };
      return {
        ...state,
        entities: {
          ...state.entities,
          pipelineJobs: { ...state.entities.pipelineJobs, [action.jobId]: updated },
        },
      };
    }
    case "pipeline:assignOperator": {
      const current = state.entities.pipelineJobs[action.jobId];
      if (!current) return state;
      const updated: PipelineJob = { ...current, assignedOperatorId: action.operatorId };
      return {
        ...state,
        entities: {
          ...state.entities,
          pipelineJobs: { ...state.entities.pipelineJobs, [action.jobId]: updated },
        },
      };
    }
    case "hub:setActive": {
      return { ...state, selection: { ...state.selection, view: { kind: "hub", hubId: action.hubId } } };
    }
    case "hub:addMember": {
      const hub = state.entities.hubs[action.hubId];
      if (!hub) return state;
      if (hub.memberIds.includes(action.userId)) return state;
      const member: HubMember = { userId: action.userId, role: action.role, joinedAt: action.joinedAt };
      return {
        ...state,
        entities: {
          ...state.entities,
          hubs: {
            ...state.entities.hubs,
            [action.hubId]: {
              ...hub,
              memberIds: [...hub.memberIds, action.userId],
              members: { ...hub.members, [action.userId]: member },
            },
          },
        },
      };
    }
    case "hub:removeMember": {
      const hub = state.entities.hubs[action.hubId];
      if (!hub) return state;
      if (!hub.memberIds.includes(action.userId)) return state;
      const nextMembers = { ...hub.members };
      delete nextMembers[action.userId];
      return {
        ...state,
        entities: {
          ...state.entities,
          hubs: {
            ...state.entities.hubs,
            [action.hubId]: {
              ...hub,
              memberIds: hub.memberIds.filter((id) => id !== action.userId),
              members: nextMembers,
            },
          },
        },
      };
    }
    case "hub:setMemberRole": {
      const hub = state.entities.hubs[action.hubId];
      if (!hub) return state;
      const current = hub.members[action.userId];
      if (!current) return state;
      return {
        ...state,
        entities: {
          ...state.entities,
          hubs: {
            ...state.entities.hubs,
            [action.hubId]: {
              ...hub,
              members: {
                ...hub.members,
                [action.userId]: { ...current, role: action.role },
              },
            },
          },
        },
      };
    }
    case "governance:createProposal": {
      return {
        ...state,
        entities: {
          ...state.entities,
          governanceProposals: {
            ...state.entities.governanceProposals,
            [action.proposal.id]: action.proposal,
          },
        },
      };
    }
    case "governance:setStatus": {
      const proposal = state.entities.governanceProposals[action.proposalId];
      if (!proposal) return state;
      return {
        ...state,
        entities: {
          ...state.entities,
          governanceProposals: {
            ...state.entities.governanceProposals,
            [proposal.id]: { ...proposal, status: action.status },
          },
        },
      };
    }
    case "governance:castVote": {
      const proposal = state.entities.governanceProposals[action.proposalId];
      if (!proposal) return state;
      const nextVotes = [
        ...proposal.votes.filter((v) => v.voterId !== action.voterId),
        { voterId: action.voterId, choice: action.choice, weight: action.weight, castAt: action.castAt },
      ];
      return {
        ...state,
        entities: {
          ...state.entities,
          governanceProposals: {
            ...state.entities.governanceProposals,
            [proposal.id]: { ...proposal, votes: nextVotes },
          },
        },
      };
    }
    case "moderation:resolve": {
      const current = state.entities.moderationCases[action.caseId];
      if (!current) return state;
      const updated: ModerationCase = {
        ...current,
        status: "resolved",
        decidedAction: action.decidedAction,
        decidedAt: action.decidedAt,
        decidedBy: action.decidedBy,
      };
      return {
        ...state,
        entities: {
          ...state.entities,
          moderationCases: { ...state.entities.moderationCases, [action.caseId]: updated },
        },
      };
    }
    case "toast:set": {
      return { ...state, ui: { ...state.ui, lastToast: { id: action.id, message: action.message } } };
    }
    case "toast:clear": {
      return { ...state, ui: { ...state.ui, lastToast: null } };
    }
    default: {
      const _exhaustive: never = action;
      return state;
    }
  }
}

export function pipelineStageLabel(stage: PipelineStage): string {
  switch (stage) {
    case "capture":
      return "Capture";
    case "analyze":
      return "Analyze";
    case "archive":
      return "Archive";
    case "replay":
      return "Replay";
    default: {
      const _exhaustive: never = stage;
      return _exhaustive;
    }
  }
}

