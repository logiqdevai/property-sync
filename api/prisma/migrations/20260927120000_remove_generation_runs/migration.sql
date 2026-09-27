-- Remove the AI computer-use scraper generation pipeline entirely: drop
-- ComputerUseStep (has FKs into ScraperGenerationRun and Document), then
-- ScraperGenerationRun itself, then the enums that only that pipeline used.

-- DropForeignKey
ALTER TABLE "computer_use_steps" DROP CONSTRAINT IF EXISTS "computer_use_steps_scraper_generation_run_id_fkey";
ALTER TABLE "computer_use_steps" DROP CONSTRAINT IF EXISTS "computer_use_steps_screenshot_before_id_fkey";
ALTER TABLE "computer_use_steps" DROP CONSTRAINT IF EXISTS "computer_use_steps_screenshot_after_id_fkey";

ALTER TABLE "scraper_generation_runs" DROP CONSTRAINT IF EXISTS "scraper_generation_runs_source_agency_id_fkey";
ALTER TABLE "scraper_generation_runs" DROP CONSTRAINT IF EXISTS "scraper_generation_runs_scraper_id_fkey";
ALTER TABLE "scraper_generation_runs" DROP CONSTRAINT IF EXISTS "scraper_generation_runs_produced_version_id_fkey";

-- DropTable
DROP TABLE IF EXISTS "computer_use_steps";
DROP TABLE IF EXISTS "scraper_generation_runs";

-- DropEnum
DROP TYPE IF EXISTS "GenerationRunStatus";
DROP TYPE IF EXISTS "GenerationTrigger";
DROP TYPE IF EXISTS "ComputerActionType";
