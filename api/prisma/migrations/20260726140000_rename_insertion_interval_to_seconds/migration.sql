ALTER TABLE "user_tracked_agencies"
  RENAME COLUMN "insertion_interval_minutes" TO "insertion_interval_seconds";

UPDATE "user_tracked_agencies"
SET "insertion_interval_seconds" = "insertion_interval_seconds" * 60;

ALTER TABLE "user_tracked_agencies"
  ALTER COLUMN "insertion_interval_seconds" SET DEFAULT 300;
