-- CreateEnum
CREATE TYPE "HubSpotWebhookEventProcessingStatus" AS ENUM ('new', 'processing', 'processed', 'failed', 'ignored');

-- CreateTable
CREATE TABLE "hubspot_webhook_events" (
    "id" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "rawWebhook" JSONB NOT NULL,
    "normalizedEvent" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processingStatus" "HubSpotWebhookEventProcessingStatus" NOT NULL DEFAULT 'new',
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "hubspot_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "hubspot_webhook_events_dedupeKey_key" ON "hubspot_webhook_events"("dedupeKey");

-- CreateIndex
CREATE INDEX "hubspot_webhook_events_processingStatus_receivedAt_idx" ON "hubspot_webhook_events"("processingStatus", "receivedAt");
