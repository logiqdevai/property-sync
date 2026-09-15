-- AlterTable
ALTER TABLE "platform_config" ADD COLUMN     "crawler_max_concurrent_browser_pages" INTEGER;

-- Production incident 2026-09-15: DEFAULT_CRAWL_WORKER_CONCURRENCY (5)
-- concurrent crawl jobs, each opening its own detail-enrichment pages on top
-- of the listing-page walk, stacked enough simultaneous browser contexts
-- during the nightly scheduled-crawl batch to exhaust the container's 8GB
-- memory limit (JS heap OOM). Lower the crawl worker concurrency and pin an
-- explicit (still-default) detail concurrency so the tuned values are
-- visible in the row rather than relying only on in-code defaults --
-- crawler_max_concurrent_browser_pages is left NULL to pick up its in-code
-- default (see PlatformConfigService.getCrawlerConfig), which now also caps
-- total concurrent pages across every job platform-wide as a second
-- safety net.
INSERT INTO "platform_config" ("id", "crawler_worker_concurrency", "crawler_detail_concurrency", "created_at", "updated_at")
VALUES ('singleton', 3, 2, NOW(), NOW())
ON CONFLICT ("id") DO UPDATE SET
  "crawler_worker_concurrency" = 3,
  "crawler_detail_concurrency" = 2,
  "updated_at" = NOW();
