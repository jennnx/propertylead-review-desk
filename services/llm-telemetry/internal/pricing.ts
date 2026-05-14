// Per-million-token rates for every (provider, modelAlias) we instrument.
//
// Rates are sourced from Anthropic's public pricing page
// (https://www.anthropic.com/pricing) and frozen on historical rows at write
// time — see services/llm-telemetry/internal/record.ts and cost.ts.
//
// PR review note: cross-reference every entry against current Anthropic
// public pricing at merge time. Updates to live pricing are deliberate code
// changes; historical rows already in the database keep the cost that was
// computed when the call happened and do not get rewritten.

export type LlmProvider = "anthropic" | "voyage";

export type AnthropicPricingEntry = {
  provider: "anthropic";
  // Per-million-token rates in USD.
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
  cacheCreationUsdPerMillion: number;
  cacheReadUsdPerMillion: number;
};

export type VoyagePricingEntry = {
  provider: "voyage";
  totalUsdPerMillion: number;
};

export type PricingEntry = AnthropicPricingEntry | VoyagePricingEntry;

// Anthropic's documented dated snapshots → public alias. The wrapper
// normalizes a response-side snapshot back to its alias before pricing
// lookup; unknown snapshots fall back to the alias the caller requested.
export const ANTHROPIC_SNAPSHOT_TO_ALIAS: Record<string, string> = {
  "claude-sonnet-4-6-20251022": "claude-sonnet-4-6",
  "claude-opus-4-7-20260114": "claude-opus-4-7",
};

export const LLM_PRICING_TABLE: Record<string, PricingEntry> = {
  // Anthropic Sonnet 4.6 — $3 / $15 input/output, cache write $3.75, cache read $0.30.
  "anthropic:claude-sonnet-4-6": {
    provider: "anthropic",
    inputUsdPerMillion: 3,
    outputUsdPerMillion: 15,
    cacheCreationUsdPerMillion: 3.75,
    cacheReadUsdPerMillion: 0.3,
  },
  // Anthropic Opus 4.7 — $15 / $75 input/output, cache write $18.75, cache read $1.50.
  "anthropic:claude-opus-4-7": {
    provider: "anthropic",
    inputUsdPerMillion: 15,
    outputUsdPerMillion: 75,
    cacheCreationUsdPerMillion: 18.75,
    cacheReadUsdPerMillion: 1.5,
  },
};

export function pricingKey(
  provider: LlmProvider,
  modelAlias: string,
): string {
  return `${provider}:${modelAlias}`;
}

export function lookupPricing(
  provider: LlmProvider,
  modelAlias: string,
): PricingEntry | null {
  return LLM_PRICING_TABLE[pricingKey(provider, modelAlias)] ?? null;
}

export function resolveAnthropicAlias(
  responseModel: string | null | undefined,
  requestedAlias: string,
): string {
  if (!responseModel) return requestedAlias;
  if (responseModel in ANTHROPIC_SNAPSHOT_TO_ALIAS) {
    return ANTHROPIC_SNAPSHOT_TO_ALIAS[responseModel] ?? requestedAlias;
  }
  // Already-an-alias response (e.g. caller passed an alias and the SDK
  // echoed it back) is its own alias.
  if (responseModel in LLM_PRICING_TABLE) return responseModel;
  if (pricingKey("anthropic", responseModel) in LLM_PRICING_TABLE) {
    return responseModel;
  }
  return requestedAlias;
}
