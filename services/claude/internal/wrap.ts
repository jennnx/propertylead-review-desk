import type Anthropic from "@anthropic-ai/sdk";
import type {
  Message,
  MessageCreateParamsNonStreaming,
} from "@anthropic-ai/sdk/resources/messages";

import { env } from "@/lib/env";
import { recordLlmCall } from "@/services/llm-telemetry";

import { rawClaude } from "./client";

export type InstrumentedClaude = {
  apiKey: string | null;
  messages: {
    create(
      body: MessageCreateParamsNonStreaming,
      options?: Parameters<Anthropic["messages"]["create"]>[1],
    ): Promise<Message>;
  };
};

const TELEMETRY_SOURCE = env.LLM_TELEMETRY_SOURCE;

export function createInstrumentedClaude(
  inner: Anthropic = rawClaude,
): InstrumentedClaude {
  return {
    apiKey: inner.apiKey,
    messages: {
      create: (body, options) => instrumentedCreate(inner, body, options),
    },
  };
}

async function instrumentedCreate(
  inner: Anthropic,
  body: MessageCreateParamsNonStreaming,
  options?: Parameters<Anthropic["messages"]["create"]>[1],
): Promise<Message> {
  const startedAt = Date.now();
  const requestedAlias = body.model;
  try {
    const response = (await inner.messages.create(body, options)) as Message;
    const latencyMs = Date.now() - startedAt;

    await safelyRecord({
      provider: "anthropic",
      requestedModelAlias: requestedAlias,
      responseModelSnapshot: response.model ?? null,
      usage: {
        inputTokens: response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
        cacheCreationTokens: response.usage?.cache_creation_input_tokens ?? 0,
        cacheReadTokens: response.usage?.cache_read_input_tokens ?? 0,
      },
      latencyMs,
      source: TELEMETRY_SOURCE,
      status: "ok",
    });

    return response;
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    const message =
      error instanceof Error ? error.message : "unknown Anthropic SDK error";
    await safelyRecord({
      provider: "anthropic",
      requestedModelAlias: requestedAlias,
      responseModelSnapshot: null,
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
      },
      latencyMs,
      source: TELEMETRY_SOURCE,
      status: "error",
      errorMessage: message,
    });
    throw error;
  }
}

async function safelyRecord(
  input: Parameters<typeof recordLlmCall>[0],
): Promise<void> {
  try {
    await recordLlmCall(input);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "unknown telemetry error";
    console.warn(`llm-telemetry record failed: ${message}`);
  }
}
