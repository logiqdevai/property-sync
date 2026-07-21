-- CreateTable
CREATE TABLE "user_integration_settings" (
    "id" TEXT NOT NULL,
    "integration_target_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "settings" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_integration_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_integration_settings_user_id_integration_target_id_key" ON "user_integration_settings"("user_id", "integration_target_id");

-- AddForeignKey
ALTER TABLE "user_integration_settings" ADD CONSTRAINT "user_integration_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_integration_settings" ADD CONSTRAINT "user_integration_settings_integration_target_id_fkey" FOREIGN KEY ("integration_target_id") REFERENCES "integration_targets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: one settings row per existing (user, integration_target) pair, so every
-- pre-existing UserIntegration account has a settings row to attach to below.
INSERT INTO "user_integration_settings" ("id", "user_id", "integration_target_id", "settings", "created_at", "updated_at")
SELECT gen_random_uuid(), "user_id", "integration_target_id", NULL, MIN("created_at"), CURRENT_TIMESTAMP
FROM "user_integrations"
GROUP BY "user_id", "integration_target_id";

-- AlterTable
ALTER TABLE "user_integrations" ADD COLUMN "user_integration_settings_id" TEXT;

-- Backfill: point every existing account at its (user, integration_target) settings row.
UPDATE "user_integrations" ui
SET "user_integration_settings_id" = uis."id"
FROM "user_integration_settings" uis
WHERE uis."user_id" = ui."user_id"
  AND uis."integration_target_id" = ui."integration_target_id";

-- AlterTable
ALTER TABLE "user_integrations" ALTER COLUMN "user_integration_settings_id" SET NOT NULL;

-- CreateIndex
CREATE INDEX "user_integrations_user_integration_settings_id_idx" ON "user_integrations"("user_integration_settings_id");

-- AddForeignKey
ALTER TABLE "user_integrations" ADD CONSTRAINT "user_integrations_user_integration_settings_id_fkey" FOREIGN KEY ("user_integration_settings_id") REFERENCES "user_integration_settings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
