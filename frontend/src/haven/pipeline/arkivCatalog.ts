import type { Artifact, Hub, Tag, UserProfile } from "@/haven/model/types";
import type { IsoDateTime } from "@/haven/model/enums";

export interface ArkivCatalogV1 {
  version: 1;
  publishedAt: IsoDateTime;
  hub: { name: string; description: string };
  artifact: {
    title: string;
    sourcePlatform: string;
    sourceUrl: string;
    creatorAttribution: string;
    accessPolicy: string;
    cid: string | null;
    phash: string | null;
    tags: Array<{ label: string; color: string }>;
    contributors: Array<{ displayName: string; handle: string }>;
  };
}

export interface ArkivWeeklyCatalogV1 {
  version: 1;
  publishedAt: IsoDateTime;
  hub: { name: string; description: string };
  artifacts: Array<{
    title: string;
    sourcePlatform: string;
    creatorAttribution: string;
    accessPolicy: string;
    cid: string | null;
    phash: string | null;
  }>;
  notes: string;
}

export function exportArkivCatalog(
  input: {
    artifact: Artifact;
    hub: Hub;
    tags: Tag[];
    contributors: UserProfile[];
  },
  publishedAt: IsoDateTime
): ArkivCatalogV1 {
  return {
    version: 1,
    publishedAt,
    hub: { name: input.hub.name, description: input.hub.description },
    artifact: {
      title: input.artifact.title,
      sourcePlatform: input.artifact.sourcePlatform,
      sourceUrl: input.artifact.sourceUrl,
      creatorAttribution: input.artifact.creatorAttribution,
      accessPolicy: input.artifact.accessPolicy,
      cid: input.artifact.integrity.cid,
      phash: input.artifact.integrity.phash,
      tags: input.tags.map((t) => ({ label: t.label, color: t.color })),
      contributors: input.contributors.map((c) => ({ displayName: c.displayName, handle: c.handle })),
    },
  };
}

export function exportArkivWeeklyCatalog(
  input: { hub: Hub; artifacts: Artifact[] },
  publishedAt: IsoDateTime
): ArkivWeeklyCatalogV1 {
  return {
    version: 1,
    publishedAt,
    hub: { name: input.hub.name, description: input.hub.description },
    artifacts: input.artifacts.map((a) => ({
      title: a.title,
      sourcePlatform: a.sourcePlatform,
      creatorAttribution: a.creatorAttribution,
      accessPolicy: a.accessPolicy,
      cid: a.integrity.cid,
      phash: a.integrity.phash,
    })),
    notes: "Weekly Arkiv catalog publish (simulated).",
  };
}

