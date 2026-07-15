UPDATE "source_agencies"
SET
  "is_visible" = CASE WHEN "status" = 'ARCHIVED' THEN false ELSE true END,
  "is_enabled" = CASE WHEN "status" = 'ACTIVE' THEN true ELSE false END;

DROP INDEX IF EXISTS "source_agencies_status_idx";

ALTER TABLE "source_agencies" DROP COLUMN IF EXISTS "status";

DROP TYPE IF EXISTS "AgencyStatus";

CREATE INDEX IF NOT EXISTS "source_agencies_is_visible_idx" ON "source_agencies"("is_visible");
CREATE INDEX IF NOT EXISTS "source_agencies_is_enabled_idx" ON "source_agencies"("is_enabled");
