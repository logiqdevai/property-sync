ALTER TABLE "cms_sync_runs" ADD COLUMN "crawl_run_id" TEXT;
ALTER TABLE "cms_sync_runs" ADD COLUMN "total_created" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "cms_sync_runs" ADD COLUMN "total_updated" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "cms_sync_runs" ADD COLUMN "total_removed" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "cms_sync_runs" ADD COLUMN "total_failed" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "cms_sync_runs_crawl_run_id_idx" ON "cms_sync_runs"("crawl_run_id");

ALTER TABLE "cms_sync_runs" ADD CONSTRAINT "cms_sync_runs_crawl_run_id_fkey" FOREIGN KEY ("crawl_run_id") REFERENCES "crawl_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
