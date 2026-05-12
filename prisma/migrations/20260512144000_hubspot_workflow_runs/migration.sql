-- CreateEnum
CREATE TYPE "HubSpotWorkflowRunStatus" AS ENUM ('in_progress', 'succeeded', 'failed');

-- CreateEnum
CREATE TYPE "HubSpotWorkflowRunOutcome" AS ENUM ('no_writeback_needed');

-- CreateTable
CREATE TABLE "hubspot_workflow_runs" (
    "id" TEXT NOT NULL,
    "hubSpotWebhookEventId" TEXT NOT NULL,
    "status" "HubSpotWorkflowRunStatus" NOT NULL DEFAULT 'in_progress',
    "outcome" "HubSpotWorkflowRunOutcome",
    "failureMessage" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hubspot_workflow_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "hubspot_workflow_runs_hubSpotWebhookEventId_key" ON "hubspot_workflow_runs"("hubSpotWebhookEventId");

-- CreateIndex
CREATE INDEX "hubspot_workflow_runs_status_createdAt_idx" ON "hubspot_workflow_runs"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "hubspot_workflow_runs" ADD CONSTRAINT "hubspot_workflow_runs_hubSpotWebhookEventId_fkey" FOREIGN KEY ("hubSpotWebhookEventId") REFERENCES "hubspot_webhook_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
