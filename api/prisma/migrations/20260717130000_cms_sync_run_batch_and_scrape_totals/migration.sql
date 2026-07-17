-- CmsSyncRun becomes one batch row per (crawl_run, user_integration) instead of one row per property.
ALTER TABLE "cms_sync_runs" DROP COLUMN "action";
DROP TYPE "CmsSyncAction";

ALTER TABLE "cms_sync_runs" DROP CONSTRAINT "cms_sync_runs_user_property_id_fkey";
DROP INDEX "cms_sync_runs_user_property_id_idx";
ALTER TABLE "cms_sync_runs" DROP COLUMN "user_property_id";

ALTER TABLE "cms_sync_runs" DROP CONSTRAINT "cms_sync_runs_crawl_run_id_fkey";
ALTER TABLE "cms_sync_runs" ALTER COLUMN "crawl_run_id" SET NOT NULL;
ALTER TABLE "cms_sync_runs" ADD CONSTRAINT "cms_sync_runs_crawl_run_id_fkey" FOREIGN KEY ("crawl_run_id") REFERENCES "crawl_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "cms_sync_runs_crawl_run_id_user_integration_id_key" ON "cms_sync_runs"("crawl_run_id", "user_integration_id");

-- Scrape-level "new vs already-known" signal, independent of the CMS-sync-derived totals above.
ALTER TABLE "crawl_runs" ADD COLUMN "total_new_listings" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "crawl_runs" ADD COLUMN "total_refreshed_listings" INTEGER NOT NULL DEFAULT 0;
