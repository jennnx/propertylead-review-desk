-- CreateTable
CREATE TABLE "hubspot_writeback_settings" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "autoModeEnabled" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "hubspot_writeback_settings_pkey" PRIMARY KEY ("id")
);

-- Seed singleton
INSERT INTO "hubspot_writeback_settings" ("id", "autoModeEnabled")
VALUES ('global', false)
ON CONFLICT ("id") DO NOTHING;
