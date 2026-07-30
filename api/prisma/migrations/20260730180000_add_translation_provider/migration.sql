-- CreateEnum
CREATE TYPE "TranslationProvider" AS ENUM ('GOOGLE_TRANSLATE', 'AZURE');

-- AlterTable
ALTER TABLE "platform_config" ADD COLUMN "translation_provider" "TranslationProvider";
