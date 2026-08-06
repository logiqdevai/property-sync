ALTER TABLE "source_agencies" ADD COLUMN "use_ai_batching" BOOLEAN NOT NULL DEFAULT false;

UPDATE "source_agencies" AS sa
SET "use_ai_batching" = true
WHERE EXISTS (
  SELECT 1
  FROM "user_tracked_agencies" AS uta
  WHERE uta."source_agency_id" = sa."id"
    AND uta."use_ai_batching" = true
);

ALTER TABLE "user_tracked_agencies" DROP COLUMN "use_ai_batching";
