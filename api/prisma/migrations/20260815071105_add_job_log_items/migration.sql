-- CreateTable
CREATE TABLE "job_log_items" (
    "id" TEXT NOT NULL,
    "job_log_id" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_log_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "job_log_items_job_log_id_status_idx" ON "job_log_items"("job_log_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "job_log_items_job_log_id_entity_id_key" ON "job_log_items"("job_log_id", "entity_id");

-- AddForeignKey
ALTER TABLE "job_log_items" ADD CONSTRAINT "job_log_items_job_log_id_fkey" FOREIGN KEY ("job_log_id") REFERENCES "job_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
