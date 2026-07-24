-- Backfill/manual CMS pushes are not tied to an actual crawl. Previously this required
-- fabricating a placeholder CrawlRun row just to satisfy the NOT NULL FK. Make crawl_run_id
-- nullable again (it was nullable/SetNull before 20260717130000_cms_sync_run_batch_and_scrape_totals
-- forced it NOT NULL/Cascade) so those flows can leave it null instead.
ALTER TABLE "cms_sync_runs" DROP CONSTRAINT "cms_sync_runs_crawl_run_id_fkey";

ALTER TABLE "cms_sync_runs" ALTER COLUMN "crawl_run_id" DROP NOT NULL;

ALTER TABLE "cms_sync_runs" ADD CONSTRAINT "cms_sync_runs_crawl_run_id_fkey" FOREIGN KEY ("crawl_run_id") REFERENCES "crawl_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
