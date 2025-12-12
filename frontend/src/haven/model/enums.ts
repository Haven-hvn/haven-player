export type IsoDateTime = string;

export type AccessPolicy = "public" | "hub_only" | "private";

export type PipelineStage = "capture" | "analyze" | "archive" | "replay";

export type PipelineJobStatus = "queued" | "running" | "failed" | "completed" | "cancelled";

export type ThreadType = "link" | "transclusion" | "discussion";

export type HubRole = "member" | "curator" | "moderator" | "archivist";

export type ModerationAction = "none" | "warn" | "restrict_posting" | "remove_from_hub" | "ban_member";

