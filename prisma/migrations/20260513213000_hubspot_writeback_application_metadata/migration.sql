ALTER TABLE "hubspot_writebacks"
ADD COLUMN "appliedAt" TIMESTAMP(3),
ADD COLUMN "applicationMetadata" JSONB;
