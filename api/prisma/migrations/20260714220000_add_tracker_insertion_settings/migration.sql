ALTER TABLE "user_tracked_agencies" ADD COLUMN "concurrent_insertions" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "user_tracked_agencies" ADD COLUMN "insertion_interval_minutes" INTEGER NOT NULL DEFAULT 5;
