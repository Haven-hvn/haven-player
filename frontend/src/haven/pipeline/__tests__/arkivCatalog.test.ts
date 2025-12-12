import { createSeedState } from "@/haven/seed/seedData";
import { exportArkivCatalog } from "@/haven/pipeline/arkivCatalog";
import { nowIso } from "@/haven/util/time";

describe("arkivCatalog", () => {
  it("exports ArkivCatalogV1", () => {
    const seed = createSeedState();
    const artifact = Object.values(seed.entities.artifacts)[0]!;
    const hub = seed.entities.hubs[artifact.hubId]!;
    const tags = artifact.tags.map((id) => seed.entities.tags[id]!).filter(Boolean);
    const contributors = [seed.entities.users[artifact.createdBy]!];

    const payload = exportArkivCatalog({ artifact, hub, tags, contributors }, nowIso());
    expect(payload.version).toBe(1);
    expect(payload.hub.name).toBe(hub.name);
    expect(payload.artifact.title).toBe(artifact.title);
  });
});

