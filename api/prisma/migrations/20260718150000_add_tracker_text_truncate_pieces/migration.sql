ALTER TABLE "user_tracked_agencies" ADD COLUMN "text_truncate_pieces" TEXT[] DEFAULT ARRAY[]::TEXT[] NOT NULL;
