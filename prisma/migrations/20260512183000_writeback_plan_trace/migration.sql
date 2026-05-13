-- AlterEnum
ALTER TYPE "HubSpotWorkflowRunOutcome" ADD VALUE 'writeback_proposed';

-- AlterTable
ALTER TABLE "hubspot_workflow_runs"
  ADD COLUMN "writebackPlanInput" JSONB,
  ADD COLUMN "writebackPlanRawOutputs" JSONB,
  ADD COLUMN "writebackPlanValidations" JSONB,
  ADD COLUMN "writebackPlan" JSONB;
