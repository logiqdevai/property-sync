ALTER TABLE "user_properties" DROP CONSTRAINT IF EXISTS "user_properties_property_id_fkey";

ALTER TABLE "user_properties"
  ADD CONSTRAINT "user_properties_canonical_property_id_fkey"
  FOREIGN KEY ("canonical_property_id") REFERENCES "properties"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

DROP INDEX IF EXISTS "user_properties_user_id_property_id_key";

CREATE INDEX IF NOT EXISTS "source_properties_internal_id_idx"
  ON "source_properties"("internal_id");
