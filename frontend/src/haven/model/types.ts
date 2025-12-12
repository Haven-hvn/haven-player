import type {
  AccessPolicy,
  HubRole,
  IsoDateTime,
  ModerationAction,
  PipelineJobStatus,
  PipelineStage,
  ThreadType,
} from "@/haven/model/enums";
import type {
  AnchorId,
  ArtifactId,
  CollectionId,
  CommentId,
  DiscussionThreadId,
  GovernanceProposalId,
  HubId,
  ModerationCaseId,
  OperatorId,
  PipelineJobId,
  TagId,
  ThreadId,
  UserId,
  VersionId,
} from "@/haven/model/ids";

export type ReputationDimension =
  | "reliability"
  | "quality"
  | "cultural_contribution"
  | "safety";

export type GovernanceProposalStatus = "draft" | "open" | "closed" | "executed";

export type VoteChoice = "yes" | "no" | "abstain";

export interface Tag {
  id: TagId;
  label: string;
  color: string; // hex
}

export interface UserProfile {
  id: UserId;
  displayName: string;
  handle: string;
  avatarSeed: string;
}

export interface HubMember {
  userId: UserId;
  role: HubRole;
  joinedAt: IsoDateTime;
}

export interface Hub {
  id: HubId;
  name: string;
  description: string;
  normsMarkdown: string;
  createdAt: IsoDateTime;
  createdBy: UserId;
  memberIds: UserId[];
  members: Record<UserId, HubMember>;
  featuredCollectionIds: CollectionId[];
}

export interface Collection {
  id: CollectionId;
  hubId: HubId;
  name: string;
  description: string;
  artifactIds: ArtifactId[];
  pinned: boolean;
  createdAt: IsoDateTime;
  createdBy: UserId;
}

export interface ArtifactAnalysisTag {
  tagId: TagId;
  atSeconds: number;
  label: string;
  confidence: number; // 0..1
}

export interface ArtifactSummarySegment {
  startSeconds: number;
  endSeconds: number;
  summary: string;
}

export interface ArtifactIntegrity {
  cid: string | null;
  phash: string | null;
  dedupMatches: Array<{ artifactId: ArtifactId; similarity: number }>;
  verifiedBy: UserId[];
}

export interface ArtifactProvenanceStep {
  id: string;
  stage: PipelineStage;
  at: IsoDateTime;
  actorUserId: UserId;
  note: string;
}

export interface Artifact {
  id: ArtifactId;
  hubId: HubId;
  title: string;
  sourcePlatform: string;
  sourceUrl: string;
  creatorAttribution: string;
  accessPolicy: AccessPolicy;
  encryptedBeforeUpload: boolean; // UI-only toggle
  curatorNotesMarkdown: string;
  createdAt: IsoDateTime;
  createdBy: UserId;
  tags: TagId[];
  analysis: {
    tags: ArtifactAnalysisTag[];
    summaries: ArtifactSummarySegment[];
  };
  integrity: ArtifactIntegrity;
  provenance: ArtifactProvenanceStep[];
  discussionThreadId: DiscussionThreadId;
  versions: VersionId[];
}

export interface ArtifactVersion {
  id: VersionId;
  artifactId: ArtifactId;
  createdAt: IsoDateTime;
  createdBy: UserId;
  changeSummary: string;
  snapshot: Pick<
    Artifact,
    | "title"
    | "tags"
    | "analysis"
    | "accessPolicy"
    | "encryptedBeforeUpload"
    | "provenance"
  >;
}

export interface Comment {
  id: CommentId;
  threadId: DiscussionThreadId;
  authorId: UserId;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime | null;
  bodyMarkdown: string;
  parentCommentId: CommentId | null;
  artifactTimestampSeconds: number | null;
}

export interface DiscussionThread {
  id: DiscussionThreadId;
  artifactId: ArtifactId;
  commentIds: CommentId[];
}

export interface PipelineJob {
  id: PipelineJobId;
  stage: PipelineStage;
  status: PipelineJobStatus;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  artifactId: ArtifactId;
  assignedOperatorId: OperatorId | null;
  progressPercent: number; // 0..100
  lastMessage: string;
  retryCount: number;
}

export interface Operator {
  id: OperatorId;
  displayName: string;
  locationHint: string;
  uptimePercent: number; // 0..100
  storageGbAvailable: number;
  pricePerJob: number;
  reputationScore: number; // 0..100 aggregate
}

export interface ReputationProfile {
  userId: UserId;
  dimensions: Record<ReputationDimension, number>; // 0..100
  evidence: Array<{ at: IsoDateTime; label: string; delta: number }>;
}

export interface GovernanceVote {
  voterId: UserId;
  choice: VoteChoice;
  weight: number;
  castAt: IsoDateTime;
}

export interface GovernanceProposal {
  id: GovernanceProposalId;
  hubId: HubId;
  title: string;
  descriptionMarkdown: string;
  status: GovernanceProposalStatus;
  createdAt: IsoDateTime;
  createdBy: UserId;
  openFrom: IsoDateTime | null;
  openUntil: IsoDateTime | null;
  votes: GovernanceVote[];
}

export interface ModerationCase {
  id: ModerationCaseId;
  hubId: HubId;
  createdAt: IsoDateTime;
  createdBy: UserId;
  targetType: "artifact" | "comment" | "user";
  targetId: string;
  reason: string;
  status: "open" | "resolved";
  decidedAction: ModerationAction;
  decidedAt: IsoDateTime | null;
  decidedBy: UserId | null;
}

export interface Anchor {
  id: AnchorId;
  kind: "artifact_timeline" | "collection_item" | "comment" | "provenance_step";
  label: string;
  artifactId: ArtifactId | null;
  hubId: HubId | null;
  collectionId: CollectionId | null;
  commentId: CommentId | null;
  provenanceStepId: string | null;
}

export interface LoomThread {
  id: ThreadId;
  type: ThreadType;
  fromAnchorId: AnchorId;
  toAnchorId: AnchorId;
  label: string;
  strength: number; // 0..1
  createdAt: IsoDateTime;
}

export type HavenView =
  | { kind: "library" }
  | { kind: "pipeline"; stage: PipelineStage }
  | { kind: "hub"; hubId: HubId }
  | { kind: "operators" }
  | { kind: "profile"; userId: UserId };

export interface HavenEntities {
  tags: Record<TagId, Tag>;
  users: Record<UserId, UserProfile>;
  hubs: Record<HubId, Hub>;
  collections: Record<CollectionId, Collection>;
  artifacts: Record<ArtifactId, Artifact>;
  versions: Record<VersionId, ArtifactVersion>;
  discussionThreads: Record<DiscussionThreadId, DiscussionThread>;
  comments: Record<CommentId, Comment>;
  pipelineJobs: Record<PipelineJobId, PipelineJob>;
  operators: Record<OperatorId, Operator>;
  reputations: Record<UserId, ReputationProfile>;
  governanceProposals: Record<GovernanceProposalId, GovernanceProposal>;
  moderationCases: Record<ModerationCaseId, ModerationCase>;
  anchors: Record<AnchorId, Anchor>;
  threads: Record<ThreadId, LoomThread>;
}

export interface HavenSelectionState {
  view: HavenView;
  selectedArtifactId: ArtifactId | null;
  selectedCollectionId: CollectionId | null;
  selectedThreadId: ThreadId | null;
  hoveredThreadId: ThreadId | null;
  activeMarginaliaTab:
    | "threads"
    | "discussion"
    | "curator_notes"
    | "metadata"
    | "provenance"
    | "history";
  splitView: { enabled: boolean; secondaryArtifactId: ArtifactId | null };
}

export interface HavenFilterState {
  searchQuery: string;
  tagIds: TagId[];
  accessPolicies: AccessPolicy[];
  onlyNeedsAttention: boolean;
  threadTypes: ThreadType[];
}

export interface HavenState {
  entities: HavenEntities;
  selection: HavenSelectionState;
  filters: HavenFilterState;
  ui: {
    commandPaletteOpen: boolean;
    lastToast: { id: string; message: string } | null;
  };
}

