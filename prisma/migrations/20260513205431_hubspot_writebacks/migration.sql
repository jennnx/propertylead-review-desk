-- CreateEnum
CREATE TYPE "HubSpotWritebackState" AS ENUM ('pending', 'applied', 'auto_applied', 'rejected');

-- CreateTable
CREATE TABLE "hubspot_writebacks" (
    "id" TEXT NOT NULL,
    "hubSpotWorkflowRunId" TEXT NOT NULL,
    "plan" JSONB NOT NULL,
    "state" "HubSpotWritebackState" NOT NULL DEFAULT 'pending',
    "reviewDeskFeedbackNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hubspot_writebacks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "hubspot_writebacks_hubSpotWorkflowRunId_key" ON "hubspot_writebacks"("hubSpotWorkflowRunId");

-- CreateIndex
CREATE INDEX "hubspot_writebacks_state_createdAt_idx" ON "hubspot_writebacks"("state", "createdAt");

-- AddForeignKey
ALTER TABLE "hubspot_writebacks" ADD CONSTRAINT "hubspot_writebacks_hubSpotWorkflowRunId_fkey" FOREIGN KEY ("hubSpotWorkflowRunId") REFERENCES "hubspot_workflow_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
