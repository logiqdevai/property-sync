-- AlterEnum
ALTER TYPE "TranslationProvider" ADD VALUE 'GEMINI';

-- AlterTable
ALTER TABLE "platform_config" ADD COLUMN     "gemini_translate_model" TEXT;

-- Gemini integration target (users store their own Gemini API key on the Integrations page).
-- Same settings as the existing OpenAI/Azure targets; skipped if one already exists.
INSERT INTO "integration_targets" ("id", "integration_type", "auth_type", "allow_multiple", "is_visible", "is_enabled", "created_at", "updated_at")
SELECT gen_random_uuid(), 'GEMINI', 'API_KEY', false, true, false, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "integration_targets" WHERE "integration_type" = 'GEMINI');
