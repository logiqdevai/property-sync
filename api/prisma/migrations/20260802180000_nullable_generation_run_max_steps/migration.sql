-- AlterTable
ALTER TABLE "scraper_generation_runs" ALTER COLUMN "max_steps" DROP DEFAULT;
ALTER TABLE "scraper_generation_runs" ALTER COLUMN "max_steps" DROP NOT NULL;
