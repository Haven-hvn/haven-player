import type { Artifact, ArtifactAnalysisTag, ArtifactSummarySegment } from "@/haven/model/types";
import type { IsoDateTime } from "@/haven/model/enums";

export interface PortableAiMetadataV1 {
  version: 1;
  generatedAt: IsoDateTime;
  artifact: {
    title: string;
    sourcePlatform: string;
    sourceUrl: string;
    creatorAttribution: string;
  };
  analysis: {
    tags: Array<Pick<ArtifactAnalysisTag, "atSeconds" | "label" | "confidence">>;
    summaries: ArtifactSummarySegment[];
  };
}

export function exportPortableAiMetadata(artifact: Artifact, generatedAt: IsoDateTime): PortableAiMetadataV1 {
  return {
    version: 1,
    generatedAt,
    artifact: {
      title: artifact.title,
      sourcePlatform: artifact.sourcePlatform,
      sourceUrl: artifact.sourceUrl,
      creatorAttribution: artifact.creatorAttribution,
    },
    analysis: {
      tags: artifact.analysis.tags.map((t) => ({
        atSeconds: t.atSeconds,
        label: t.label,
        confidence: t.confidence,
      })),
      summaries: artifact.analysis.summaries,
    },
  };
}

export function parsePortableAiMetadata(raw: string): PortableAiMetadataV1 | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isPortableAiMetadataV1(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function isPortableAiMetadataV1(value: unknown): value is PortableAiMetadataV1 {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Partial<PortableAiMetadataV1>;
  if (v.version !== 1) return false;
  if (typeof v.generatedAt !== "string") return false;
  if (!v.artifact || !v.analysis) return false;
  if (typeof v.artifact !== "object" || v.artifact === null) return false;
  if (typeof v.analysis !== "object" || v.analysis === null) return false;
  if (!Array.isArray((v.analysis as PortableAiMetadataV1["analysis"]).tags)) return false;
  if (!Array.isArray((v.analysis as PortableAiMetadataV1["analysis"]).summaries)) return false;
  return true;
}

