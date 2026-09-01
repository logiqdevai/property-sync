-- AlterTable
ALTER TABLE "source_agencies" ALTER COLUMN "is_visible" SET DEFAULT true;
ALTER TABLE "source_agencies" ALTER COLUMN "is_enabled" SET DEFAULT true;

-- AlterTable
ALTER TABLE "user_tracked_agencies" ALTER COLUMN "auto_update_to_crm" SET DEFAULT false;
ALTER TABLE "user_tracked_agencies" ALTER COLUMN "cms_update_on_hash_only" SET DEFAULT true;
