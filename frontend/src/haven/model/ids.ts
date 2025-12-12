import type { Brand } from "@/haven/model/brand";

export type ArtifactId = Brand<string, "ArtifactId">;
export type HubId = Brand<string, "HubId">;
export type CollectionId = Brand<string, "CollectionId">;
export type UserId = Brand<string, "UserId">;
export type CommentId = Brand<string, "CommentId">;
export type DiscussionThreadId = Brand<string, "DiscussionThreadId">;
export type PipelineJobId = Brand<string, "PipelineJobId">;
export type OperatorId = Brand<string, "OperatorId">;
export type GovernanceProposalId = Brand<string, "GovernanceProposalId">;
export type ModerationCaseId = Brand<string, "ModerationCaseId">;
export type AnchorId = Brand<string, "AnchorId">;
export type ThreadId = Brand<string, "ThreadId">;
export type TagId = Brand<string, "TagId">;
export type VersionId = Brand<string, "VersionId">;

export function asArtifactId(value: string): ArtifactId {
  return value as ArtifactId;
}
export function asHubId(value: string): HubId {
  return value as HubId;
}
export function asCollectionId(value: string): CollectionId {
  return value as CollectionId;
}
export function asUserId(value: string): UserId {
  return value as UserId;
}
export function asCommentId(value: string): CommentId {
  return value as CommentId;
}
export function asDiscussionThreadId(value: string): DiscussionThreadId {
  return value as DiscussionThreadId;
}
export function asPipelineJobId(value: string): PipelineJobId {
  return value as PipelineJobId;
}
export function asOperatorId(value: string): OperatorId {
  return value as OperatorId;
}
export function asGovernanceProposalId(value: string): GovernanceProposalId {
  return value as GovernanceProposalId;
}
export function asModerationCaseId(value: string): ModerationCaseId {
  return value as ModerationCaseId;
}
export function asAnchorId(value: string): AnchorId {
  return value as AnchorId;
}
export function asThreadId(value: string): ThreadId {
  return value as ThreadId;
}
export function asTagId(value: string): TagId {
  return value as TagId;
}
export function asVersionId(value: string): VersionId {
  return value as VersionId;
}

