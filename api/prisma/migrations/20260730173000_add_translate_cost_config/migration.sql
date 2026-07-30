-- AlterTable
ALTER TABLE "platform_config" ADD COLUMN "google_translate_cost_per_million_chars" DECIMAL(12,6);
ALTER TABLE "platform_config" ADD COLUMN "azure_translate_cost_per_million_chars" DECIMAL(12,6);
