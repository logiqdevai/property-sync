-- Remap IntegrationProperty from canonical Property → UserProperty

ALTER TABLE "integration_properties" ADD COLUMN "user_property_id" TEXT;

UPDATE "integration_properties" AS ip
SET "user_property_id" = up."id"
FROM "user_properties" AS up
WHERE up."user_id" = ip."user_id"
  AND up."canonical_property_id" = ip."property_id";

DELETE FROM "integration_properties"
WHERE "user_property_id" IS NULL;

ALTER TABLE "integration_properties" DROP CONSTRAINT "integration_properties_property_id_fkey";

DROP INDEX IF EXISTS "integration_properties_property_id_idx";

DROP INDEX IF EXISTS "integration_properties_user_id_user_integration_settings_id_key";
DROP INDEX IF EXISTS "integration_properties_user_id_user_integration_settings_id_property_id_key";
DROP INDEX IF EXISTS "integration_properties_user_id_user_integration_settings_id_pro";

ALTER TABLE "integration_properties" DROP COLUMN "property_id";

ALTER TABLE "integration_properties" ALTER COLUMN "user_property_id" SET NOT NULL;

CREATE INDEX "integration_properties_user_property_id_idx" ON "integration_properties"("user_property_id");

CREATE UNIQUE INDEX "integration_properties_user_settings_user_property_key" ON "integration_properties"("user_id", "user_integration_settings_id", "user_property_id");

ALTER TABLE "integration_properties" ADD CONSTRAINT "integration_properties_user_property_id_fkey" FOREIGN KEY ("user_property_id") REFERENCES "user_properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
