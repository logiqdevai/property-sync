-- AlterTable
ALTER TABLE "user_tracked_agencies" ADD COLUMN "remove_watermark" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "user_tracked_agencies" ADD COLUMN "watermark_image_count" INTEGER NOT NULL DEFAULT 10;
