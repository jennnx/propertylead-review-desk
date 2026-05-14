import {
  lookupPricing,
  type LlmProvider,
} from "./pricing";

export type AnthropicUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
};

export type VoyageUsage = {
  totalTokens: number;
};

export type LlmUsage =
  | { provider: "anthropic"; usage: AnthropicUsage }
  | { provider: "voyage"; usage: VoyageUsage };

export function computeLlmCallCostUsd(
  provider: LlmProvider,
  modelAlias: string,
  usage: AnthropicUsage | VoyageUsage,
): number | null {
  const pricing = lookupPricing(provider, modelAlias);
  if (!pricing) return null;

  if (pricing.provider === "anthropic") {
    const anthropic = usage as AnthropicUsage;
    return (
      (anthropic.inputTokens * pricing.inputUsdPerMillion +
        anthropic.outputTokens * pricing.outputUsdPerMillion +
        anthropic.cacheCreationTokens * pricing.cacheCreationUsdPerMillion +
        anthropic.cacheReadTokens * pricing.cacheReadUsdPerMillion) /
      1_000_000
    );
  }

  const voyage = usage as VoyageUsage;
  return (voyage.totalTokens * pricing.totalUsdPerMillion) / 1_000_000;
}
