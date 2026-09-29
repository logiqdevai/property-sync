-- AlterTable
ALTER TABLE "integration_properties" ADD COLUMN     "linked_via_reconciliation" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "excluded_source_images" JSONB,
ADD COLUMN     "image_upload_failures" JSONB;
