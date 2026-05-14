-- CreateEnum
CREATE TYPE "LlmCallProvider" AS ENUM ('anthropic', 'voyage');

-- CreateEnum
CREATE TYPE "LlmCallSource" AS ENUM ('production', 'eval');

-- CreateEnum
CREATE TYPE "LlmCallStatus" AS ENUM ('ok', 'error');

-- CreateTable
CREATE TABLE "llm_calls" (
    "id" TEXT NOT NULL,
    "provider" "LlmCallProvider" NOT NULL,
    "modelAlias" TEXT NOT NULL,
    "modelSnapshot" TEXT NOT NULL,
    "source" "LlmCallSource" NOT NULL DEFAULT 'production',
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "cacheCreationTokens" INTEGER,
    "cacheReadTokens" INTEGER,
    "totalTokens" INTEGER,
    "costUsd" DECIMAL(12,8),
    "latencyMs" INTEGER NOT NULL,
    "status" "LlmCallStatus" NOT NULL DEFAULT 'ok',
    "errorMessage" TEXT,
    "hubSpotWorkflowRunId" TEXT,
    "sopDocumentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "llm_calls_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "llm_calls_source_createdAt_idx" ON "llm_calls"("source", "createdAt");

-- CreateIndex
CREATE INDEX "llm_calls_provider_modelAlias_createdAt_idx" ON "llm_calls"("provider", "modelAlias", "createdAt");

-- AddForeignKey
ALTER TABLE "llm_calls" ADD CONSTRAINT "llm_calls_hubSpotWorkflowRunId_fkey" FOREIGN KEY ("hubSpotWorkflowRunId") REFERENCES "hubspot_workflow_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "llm_calls" ADD CONSTRAINT "llm_calls_sopDocumentId_fkey" FOREIGN KEY ("sopDocumentId") REFERENCES "sop_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
