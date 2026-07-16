ALTER TABLE "user_tracked_agencies" DROP COLUMN IF EXISTS "ai_provider";
ALTER TABLE "user_tracked_agencies" DROP COLUMN IF EXISTS "ai_model";
DROP TYPE IF EXISTS "AiProvider";
