-- AlterTable
ALTER TABLE "scrapers" ADD COLUMN     "crawl_job_timeout_ms" INTEGER,
ADD COLUMN     "detail_concurrency" INTEGER;
