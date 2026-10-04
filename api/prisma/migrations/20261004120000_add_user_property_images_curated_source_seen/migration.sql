-- AlterTable
ALTER TABLE "user_properties" ADD COLUMN     "images_curated_source_seen" JSONB;

-- Already hand-edited properties start following the agency from today's gallery.
UPDATE "user_properties" up
SET "images_curated_source_seen" = p."images"
FROM "properties" p
WHERE p."id" = up."canonical_property_id"
  AND up."images_curated_at" IS NOT NULL
  AND jsonb_typeof(p."images") = 'array';
