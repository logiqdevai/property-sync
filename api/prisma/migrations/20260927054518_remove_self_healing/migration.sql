-- Remap any historical SELF_HEAL runs to MANUAL before the enum value is dropped,
-- so the cast below doesn't fail on existing rows.
UPDATE "scraper_generation_runs" SET "trigger" = 'MANUAL' WHERE "trigger" = 'SELF_HEAL';

-- AlterEnum
BEGIN;
CREATE TYPE "GenerationTrigger_new" AS ENUM ('MANUAL', 'SCHEDULED');
ALTER TABLE "scraper_generation_runs" ALTER COLUMN "trigger" DROP DEFAULT;
ALTER TABLE "scraper_generation_runs" ALTER COLUMN "trigger" TYPE "GenerationTrigger_new" USING ("trigger"::text::"GenerationTrigger_new");
ALTER TYPE "GenerationTrigger" RENAME TO "GenerationTrigger_old";
ALTER TYPE "GenerationTrigger_new" RENAME TO "GenerationTrigger";
DROP TYPE "GenerationTrigger_old";
ALTER TABLE "scraper_generation_runs" ALTER COLUMN "trigger" SET DEFAULT 'MANUAL';
COMMIT;

-- AlterTable
ALTER TABLE "scrapers" DROP COLUMN "self_healing_enabled";
