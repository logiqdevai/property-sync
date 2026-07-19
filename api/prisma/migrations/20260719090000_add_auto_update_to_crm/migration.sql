-- AlterTable
ALTER TABLE "user_tracked_agencies" ADD COLUMN "auto_update_to_crm" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "user_properties" ADD COLUMN "pending_crm_update" BOOLEAN NOT NULL DEFAULT false;
