import { getPrismaClient } from "@/services/database";

export type InsertLlmCallRow = {
  provider: "ANTHROPIC" | "VOYAGE";
  modelAlias: string;
  modelSnapshot: string;
  source: "PRODUCTION" | "EVAL";
  inputTokens: number | null;
  outputTokens: number | null;
  cacheCreationTokens: number | null;
  cacheReadTokens: number | null;
  totalTokens: number | null;
  costUsd: number | null;
  latencyMs: number;
  status: "OK" | "ERROR";
  errorMessage: string | null;
  hubSpotWorkflowRunId: string | null;
  sopDocumentId: string | null;
};

export async function insertLlmCall(row: InsertLlmCallRow): Promise<void> {
  await getPrismaClient().llmCall.create({
    data: {
      provider: row.provider,
      modelAlias: row.modelAlias,
      modelSnapshot: row.modelSnapshot,
      source: row.source,
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      cacheCreationTokens: row.cacheCreationTokens,
      cacheReadTokens: row.cacheReadTokens,
      totalTokens: row.totalTokens,
      costUsd: row.costUsd === null ? null : row.costUsd.toString(),
      latencyMs: row.latencyMs,
      status: row.status,
      errorMessage: row.errorMessage,
      hubSpotWorkflowRunId: row.hubSpotWorkflowRunId,
      sopDocumentId: row.sopDocumentId,
    },
  });
}
