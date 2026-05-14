import {
  computeLlmCallCostUsd,
  type AnthropicUsage,
  type VoyageUsage,
} from "./cost";
import { insertLlmCall } from "./mutations";
import {
  resolveAnthropicAlias,
  type LlmProvider,
} from "./pricing";

export type LlmCallSource = "production" | "eval";

export type RecordLlmCallContext = {
  hubSpotWorkflowRunId?: string | null;
  sopDocumentId?: string | null;
};

export type RecordLlmCallStatus =
  | { status: "ok"; errorMessage?: never }
  | { status: "error"; errorMessage: string };

export type RecordAnthropicLlmCallInput = {
  provider: "anthropic";
  requestedModelAlias: string;
  responseModelSnapshot: string | null;
  usage: AnthropicUsage;
  latencyMs: number;
  source: LlmCallSource;
  context?: RecordLlmCallContext;
} & RecordLlmCallStatus;

export type RecordVoyageLlmCallInput = {
  provider: "voyage";
  requestedModelAlias: string;
  responseModelSnapshot: string | null;
  usage: VoyageUsage;
  latencyMs: number;
  source: LlmCallSource;
  context?: RecordLlmCallContext;
} & RecordLlmCallStatus;

export type RecordLlmCallInput =
  | RecordAnthropicLlmCallInput
  | RecordVoyageLlmCallInput;

export async function recordLlmCall(input: RecordLlmCallInput): Promise<void> {
  const provider: LlmProvider = input.provider;
  const modelAlias =
    provider === "anthropic"
      ? resolveAnthropicAlias(
          input.responseModelSnapshot,
          input.requestedModelAlias,
        )
      : input.requestedModelAlias;

  const modelSnapshot =
    input.responseModelSnapshot ?? input.requestedModelAlias;

  const costUsd =
    input.status === "ok"
      ? computeLlmCallCostUsd(provider, modelAlias, input.usage)
      : null;

  const tokenFields = projectTokens(input);

  await insertLlmCall({
    provider: provider === "anthropic" ? "ANTHROPIC" : "VOYAGE",
    modelAlias,
    modelSnapshot,
    source: input.source === "eval" ? "EVAL" : "PRODUCTION",
    inputTokens: tokenFields.inputTokens,
    outputTokens: tokenFields.outputTokens,
    cacheCreationTokens: tokenFields.cacheCreationTokens,
    cacheReadTokens: tokenFields.cacheReadTokens,
    totalTokens: tokenFields.totalTokens,
    costUsd,
    latencyMs: input.latencyMs,
    status: input.status === "ok" ? "OK" : "ERROR",
    errorMessage: input.status === "error" ? input.errorMessage : null,
    hubSpotWorkflowRunId: input.context?.hubSpotWorkflowRunId ?? null,
    sopDocumentId: input.context?.sopDocumentId ?? null,
  });
}

type ProjectedTokens = {
  inputTokens: number | null;
  outputTokens: number | null;
  cacheCreationTokens: number | null;
  cacheReadTokens: number | null;
  totalTokens: number | null;
};

function projectTokens(input: RecordLlmCallInput): ProjectedTokens {
  if (input.provider === "anthropic") {
    return {
      inputTokens: input.usage.inputTokens,
      outputTokens: input.usage.outputTokens,
      cacheCreationTokens: input.usage.cacheCreationTokens,
      cacheReadTokens: input.usage.cacheReadTokens,
      totalTokens: null,
    };
  }
  return {
    inputTokens: null,
    outputTokens: null,
    cacheCreationTokens: null,
    cacheReadTokens: null,
    totalTokens: input.usage.totalTokens,
  };
}
