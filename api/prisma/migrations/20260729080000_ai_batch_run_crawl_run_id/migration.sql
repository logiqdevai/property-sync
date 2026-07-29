-- AlterTable
ALTER TABLE "ai_batch_runs" ADD COLUMN "crawl_run_id" TEXT;

-- CreateIndex
CREATE INDEX "ai_batch_runs_crawl_run_id_idx" ON "ai_batch_runs"("crawl_run_id");

-- AddForeignKey
ALTER TABLE "ai_batch_runs" ADD CONSTRAINT "ai_batch_runs_crawl_run_id_fkey" FOREIGN KEY ("crawl_run_id") REFERENCES "crawl_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
