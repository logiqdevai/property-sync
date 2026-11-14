-- AlterEnum
ALTER TYPE "TranslationProvider" ADD VALUE 'OPENAI';

-- AlterTable
ALTER TABLE "platform_config" ADD COLUMN     "openai_translate_model" TEXT;

-- Hide the Gemini integration from users (kept, not removed): OpenAI is the recommended AI
-- translation provider. Admins still see it, and existing Gemini keys keep working.
UPDATE "integration_targets" SET "is_visible" = false, "updated_at" = NOW()
WHERE "integration_type" = 'GEMINI';
