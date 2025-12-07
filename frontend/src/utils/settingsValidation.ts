import type { FilecoinConfig } from "@/types/filecoin";

export interface AiConfig {
  analysis_tags: string;
  llm_base_url: string;
  llm_model: string;
  max_batch_size: number;
  livekit_url: string;
}

export const DEFAULT_AI_CONFIG: AiConfig = {
  analysis_tags: "",
  llm_base_url: "http://localhost:1234",
  llm_model: "HuggingFaceTB/SmolVLM-Instruct",
  max_batch_size: 1,
  livekit_url: "wss://pump-prod-tg2x8veh.livekit.cloud",
};

export const isAiConfigDefault = (config?: Partial<AiConfig> | null): boolean => {
  if (!config) return true;

  const normalizedTags = (config.analysis_tags ?? "").trim();
  return (
    normalizedTags.length === 0 &&
    (config.llm_base_url ?? DEFAULT_AI_CONFIG.llm_base_url) === DEFAULT_AI_CONFIG.llm_base_url &&
    (config.llm_model ?? DEFAULT_AI_CONFIG.llm_model) === DEFAULT_AI_CONFIG.llm_model &&
    (config.max_batch_size ?? DEFAULT_AI_CONFIG.max_batch_size) === DEFAULT_AI_CONFIG.max_batch_size &&
    (config.livekit_url ?? DEFAULT_AI_CONFIG.livekit_url) === DEFAULT_AI_CONFIG.livekit_url
  );
};

export const isFilecoinConfigured = (config?: FilecoinConfig | null): boolean =>
  Boolean(config?.privateKey && config.privateKey.trim().length > 0);

