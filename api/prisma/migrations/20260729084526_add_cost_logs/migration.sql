-- CreateEnum
CREATE TYPE "CostOperationType" AS ENUM ('NORMALIZATION', 'TITLE_GENERATION', 'TRANSLATION', 'DEWATERMARK', 'OTHER');

-- AlterEnum
ALTER TYPE "IntegrationType" ADD VALUE 'GOOGLE_TRANSLATE';

-- AlterTable
ALTER TABLE "platform_config" ADD COLUMN     "dewatermark_cost_per_image" DECIMAL(12,6);

-- CreateTable
CREATE TABLE "cost_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "operation_type" "CostOperationType" NOT NULL,
    "provider" "IntegrationType" NOT NULL,
    "model" TEXT,
    "input_quantity" INTEGER,
    "output_quantity" INTEGER,
    "unit_count" INTEGER,
    "input_cost" DECIMAL(12,6),
    "output_cost" DECIMAL(12,6),
    "total_cost" DECIMAL(12,6) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "crawl_run_id" TEXT,
    "user_property_id" TEXT,
    "user_tracked_agency_id" TEXT,
    "ai_batch_run_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cost_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cost_logs_user_id_idx" ON "cost_logs"("user_id");

-- CreateIndex
CREATE INDEX "cost_logs_operation_type_idx" ON "cost_logs"("operation_type");

-- CreateIndex
CREATE INDEX "cost_logs_provider_idx" ON "cost_logs"("provider");

-- CreateIndex
CREATE INDEX "cost_logs_created_at_idx" ON "cost_logs"("created_at");

-- CreateIndex
CREATE INDEX "cost_logs_crawl_run_id_idx" ON "cost_logs"("crawl_run_id");

-- AddForeignKey
ALTER TABLE "cost_logs" ADD CONSTRAINT "cost_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_logs" ADD CONSTRAINT "cost_logs_crawl_run_id_fkey" FOREIGN KEY ("crawl_run_id") REFERENCES "crawl_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_logs" ADD CONSTRAINT "cost_logs_user_property_id_fkey" FOREIGN KEY ("user_property_id") REFERENCES "user_properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_logs" ADD CONSTRAINT "cost_logs_user_tracked_agency_id_fkey" FOREIGN KEY ("user_tracked_agency_id") REFERENCES "user_tracked_agencies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_logs" ADD CONSTRAINT "cost_logs_ai_batch_run_id_fkey" FOREIGN KEY ("ai_batch_run_id") REFERENCES "ai_batch_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
