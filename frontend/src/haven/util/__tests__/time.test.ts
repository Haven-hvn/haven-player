import { nowIso } from "@/haven/util/time";

describe("nowIso", () => {
  it("returns an ISO timestamp string", () => {
    const v = nowIso();
    expect(typeof v).toBe("string");
    expect(v).toMatch(/T/);
    expect(v).toMatch(/Z$/);
  });
});

