-- CreateEnum
CREATE TYPE "DiagnosticsMode" AS ENUM ('PRODUCTION', 'TRACE', 'FULL_DEBUG');

-- CreateEnum
CREATE TYPE "DiagnosticsArtifactKind" AS ENUM ('TRACE', 'SCREENSHOT', 'HTML_SNAPSHOT', 'CONSOLE_LOG', 'NETWORK_HAR', 'VIDEO');

-- AlterTable
ALTER TABLE "scrapers" ADD COLUMN     "diagnostics_mode" "DiagnosticsMode" NOT NULL DEFAULT 'PRODUCTION';

-- CreateTable
CREATE TABLE "diagnostics_packages" (
    "id" TEXT NOT NULL,
    "crawl_run_id" TEXT NOT NULL,
    "scraper_id" TEXT NOT NULL,
    "mode" "DiagnosticsMode" NOT NULL,
    "url" TEXT NOT NULL,
    "worker_id" TEXT,
    "browser_version" TEXT,
    "playwright_version" TEXT,
    "scraper_version" INTEGER,
    "retry_number" INTEGER,
    "started_at" TIMESTAMP(3) NOT NULL,
    "finished_at" TIMESTAMP(3) NOT NULL,
    "duration_ms" INTEGER NOT NULL,
    "failure_reason" TEXT,
    "exception" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "diagnostics_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diagnostics_artifacts" (
    "id" TEXT NOT NULL,
    "diagnostics_package_id" TEXT NOT NULL,
    "kind" "DiagnosticsArtifactKind" NOT NULL,
    "path" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "diagnostics_artifacts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "diagnostics_packages_crawl_run_id_key" ON "diagnostics_packages"("crawl_run_id");

-- CreateIndex
CREATE INDEX "diagnostics_packages_scraper_id_idx" ON "diagnostics_packages"("scraper_id");

-- CreateIndex
CREATE INDEX "diagnostics_artifacts_diagnostics_package_id_idx" ON "diagnostics_artifacts"("diagnostics_package_id");

-- AddForeignKey
ALTER TABLE "diagnostics_packages" ADD CONSTRAINT "diagnostics_packages_crawl_run_id_fkey" FOREIGN KEY ("crawl_run_id") REFERENCES "crawl_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diagnostics_packages" ADD CONSTRAINT "diagnostics_packages_scraper_id_fkey" FOREIGN KEY ("scraper_id") REFERENCES "scrapers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diagnostics_artifacts" ADD CONSTRAINT "diagnostics_artifacts_diagnostics_package_id_fkey" FOREIGN KEY ("diagnostics_package_id") REFERENCES "diagnostics_packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
