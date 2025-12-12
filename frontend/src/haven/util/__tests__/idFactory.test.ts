import { createLocalId } from "@/haven/util/idFactory";

describe("createLocalId", () => {
  it("includes prefix and produces different ids", () => {
    const a = createLocalId("x");
    const b = createLocalId("x");
    expect(a).toMatch(/^x_/);
    expect(b).toMatch(/^x_/);
    expect(a).not.toBe(b);
  });

  it("sanitizes prefix", () => {
    const id = createLocalId("weird prefix!");
    expect(id).toMatch(/^weird_prefix_/);
  });
});

