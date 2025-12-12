import { createSeedState } from "@/haven/seed/seedData";
import { exportPortableAiMetadata, parsePortableAiMetadata } from "@/haven/pipeline/portableMetadata";
import { nowIso } from "@/haven/util/time";

describe("portableMetadata", () => {
  it("exports and parses PortableAiMetadataV1", () => {
    const seed = createSeedState();
    const artifact = Object.values(seed.entities.artifacts)[0]!;
    const payload = exportPortableAiMetadata(artifact, nowIso());
    const raw = JSON.stringify(payload);
    const parsed = parsePortableAiMetadata(raw);
    expect(parsed).not.toBeNull();
    expect(parsed?.version).toBe(1);
    expect(parsed?.artifact.title).toBe(artifact.title);
  });

  it("returns null for invalid payload", () => {
    expect(parsePortableAiMetadata("{not json")).toBeNull();
    expect(parsePortableAiMetadata(JSON.stringify({ version: 2 }))).toBeNull();
  });
});

