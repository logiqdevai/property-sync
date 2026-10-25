-- AlterEnum
ALTER TYPE "CostOperationType" ADD VALUE 'GEOCODING';

-- AlterEnum
ALTER TYPE "IntegrationType" ADD VALUE 'GOOGLE_MAPS';

-- AlterTable
ALTER TABLE "platform_config" ADD COLUMN "google_geocoding_cost_per_request" DECIMAL(12,6);
ALTER TABLE "platform_config" ADD COLUMN "dewatermark_cost_per_credit" DECIMAL(12,6);

-- CreateTable
CREATE TABLE "geocode_cache" (
    "id" TEXT NOT NULL,
    "cache_key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "result" JSONB,
    "hit_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_hit_at" TIMESTAMP(3),

    CONSTRAINT "geocode_cache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "geocode_cache_cache_key_key" ON "geocode_cache"("cache_key");

-- CreateIndex
CREATE INDEX "geocode_cache_created_at_idx" ON "geocode_cache"("created_at");

-- CreateIndex
CREATE INDEX "geocode_cache_kind_lat_idx" ON "geocode_cache"("kind", "lat");
