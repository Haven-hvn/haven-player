import { DEFAULT_AI_CONFIG, isAiConfigDefault, isFilecoinConfigured } from "../settingsValidation";
import type { FilecoinConfig } from "@/types/filecoin";

describe("settingsValidation", () => {
  describe("isAiConfigDefault", () => {
    it("returns true for null/undefined", () => {
      expect(isAiConfigDefault(null)).toBe(true);
      expect(isAiConfigDefault(undefined)).toBe(true);
    });

    it("returns true for untouched defaults", () => {
      expect(isAiConfigDefault(DEFAULT_AI_CONFIG)).toBe(true);
    });

    it("returns false when any field differs", () => {
      expect(
        isAiConfigDefault({
          ...DEFAULT_AI_CONFIG,
          analysis_tags: "car",
        })
      ).toBe(false);
      expect(
        isAiConfigDefault({
          ...DEFAULT_AI_CONFIG,
          llm_base_url: "http://other",
        })
      ).toBe(false);
    });
  });

  describe("isFilecoinConfigured", () => {
    it("requires non-empty private key", () => {
      const cfg: FilecoinConfig = {
        privateKey: "",
        encryptionEnabled: false,
      };
      expect(isFilecoinConfigured(cfg)).toBe(false);
      expect(isFilecoinConfigured({ ...cfg, privateKey: "  " })).toBe(false);
      expect(isFilecoinConfigured({ ...cfg, privateKey: "0xabc" })).toBe(true);
    });
  });
});

