import Anthropic from "@anthropic-ai/sdk";

import { env } from "../../../lib/env";

export const CLAUDE_MODELS = {
  OPUS: "claude-opus-4-7",
  SONNET: "claude-sonnet-4-6",
  HAIKU: "claude-haiku-4-5-20251001",
} as const;

export type ClaudeModel = (typeof CLAUDE_MODELS)[keyof typeof CLAUDE_MODELS];

export const DEFAULT_CLAUDE_MODEL: ClaudeModel = CLAUDE_MODELS.SONNET;

export const claude = new Anthropic({
  apiKey: env.ANTHROPIC_API_KEY,
});

export type ClaudeClient = Anthropic;
