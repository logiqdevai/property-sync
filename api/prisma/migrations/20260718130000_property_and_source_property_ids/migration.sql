ALTER TABLE "source_properties" RENAME COLUMN "external_id" TO "internal_id";

ALTER TABLE "source_properties" ADD COLUMN "property_id" TEXT;

UPDATE "source_properties"
SET "property_id" = COALESCE(
  "internal_id",
  NULLIF(regexp_replace("source_url", '^.*/', ''), '')
);

UPDATE "source_properties"
SET "property_id" = "id"
WHERE "property_id" IS NULL OR "property_id" = '';

ALTER TABLE "source_properties" ALTER COLUMN "property_id" SET NOT NULL;

DROP INDEX IF EXISTS "source_properties_external_id_idx";
CREATE INDEX "source_properties_property_id_idx" ON "source_properties"("property_id");

ALTER TABLE "properties" ADD COLUMN "property_id" TEXT,
ADD COLUMN "internal_id" TEXT;

UPDATE "properties" AS p
SET
  "property_id" = COALESCE(sp."property_id", p."id"),
  "internal_id" = sp."internal_id"
FROM "property_source_links" AS psl
JOIN "source_properties" AS sp ON sp."id" = psl."source_property_id"
WHERE psl."property_id" = p."id"
  AND psl."is_primary_source" = true;

UPDATE "properties"
SET "property_id" = "id"
WHERE "property_id" IS NULL;

ALTER TABLE "properties" ALTER COLUMN "property_id" SET NOT NULL;

CREATE INDEX "properties_property_id_idx" ON "properties"("property_id");
CREATE INDEX "properties_internal_id_idx" ON "properties"("internal_id");

ALTER TABLE "user_properties" RENAME COLUMN "property_id" TO "canonical_property_id";

ALTER TABLE "user_properties" ADD COLUMN "property_id" TEXT,
ADD COLUMN "internal_id" TEXT,
ADD COLUMN "integration_property_id" TEXT;

UPDATE "user_properties" AS up
SET
  "property_id" = COALESCE(p."property_id", up."canonical_property_id"),
  "internal_id" = p."internal_id"
FROM "properties" AS p
WHERE p."id" = up."canonical_property_id";

UPDATE "user_properties"
SET "property_id" = "canonical_property_id"
WHERE "property_id" IS NULL;

ALTER TABLE "user_properties" ALTER COLUMN "property_id" SET NOT NULL;

DROP INDEX IF EXISTS "user_properties_property_id_idx";
CREATE INDEX "user_properties_canonical_property_id_idx" ON "user_properties"("canonical_property_id");
CREATE INDEX "user_properties_property_id_idx" ON "user_properties"("property_id");

ALTER TABLE "user_properties" DROP CONSTRAINT IF EXISTS "user_properties_user_id_property_id_key";
ALTER TABLE "user_properties" ADD CONSTRAINT "user_properties_user_id_canonical_property_id_key" UNIQUE ("user_id", "canonical_property_id");
