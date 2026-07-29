-- CreateEnum
CREATE TYPE "ContentLanguage" AS ENUM ('EL', 'EN', 'DE', 'FR', 'IT', 'RU');

-- CreateEnum
CREATE TYPE "ContentType" AS ENUM ('TITLE', 'DESCRIPTION');

-- CreateEnum
CREATE TYPE "TitleProductionStrategy" AS ENUM ('ORIGINAL', 'TRANSLATE', 'AI');

-- CreateEnum
CREATE TYPE "DescriptionProductionStrategy" AS ENUM ('ORIGINAL', 'TRANSLATE');

-- CreateEnum
CREATE TYPE "AiBatchRunKind" AS ENUM ('TITLE_FAMILY');

-- CreateEnum
CREATE TYPE "AiBatchRunStatus" AS ENUM ('SUBMITTED', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'CANCELLED');

-- AlterTable
ALTER TABLE "source_agencies" ADD COLUMN "content_language" "ContentLanguage" NOT NULL DEFAULT 'EL';

-- CreateTable
CREATE TABLE "content_publishing_configs" (
    "id" TEXT NOT NULL,
    "user_tracked_agency_id" TEXT NOT NULL,
    "ai_titles_enabled" BOOLEAN NOT NULL DEFAULT false,
    "use_ai_batch" BOOLEAN NOT NULL DEFAULT false,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_publishing_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_outputs" (
    "id" TEXT NOT NULL,
    "config_id" TEXT NOT NULL,
    "language" "ContentLanguage" NOT NULL,
    "title_strategy" "TitleProductionStrategy" NOT NULL,
    "description_strategy" "DescriptionProductionStrategy" NOT NULL,
    "ai_title_family_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_outputs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_title_families" (
    "id" TEXT NOT NULL,
    "config_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "model" TEXT,
    "use_batch" BOOLEAN,
    "instructions" TEXT,
    "generation_options" JSONB,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_title_families_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_localized_contents" (
    "id" TEXT NOT NULL,
    "user_property_id" TEXT NOT NULL,
    "content_type" "ContentType" NOT NULL,
    "language" "ContentLanguage" NOT NULL,
    "production" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "is_stale" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_localized_contents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_batch_runs" (
    "id" TEXT NOT NULL,
    "kind" "AiBatchRunKind" NOT NULL DEFAULT 'TITLE_FAMILY',
    "status" "AiBatchRunStatus" NOT NULL DEFAULT 'SUBMITTED',
    "openai_batch_id" TEXT,
    "config_id" TEXT,
    "ai_title_family_id" TEXT,
    "user_property_ids" JSONB NOT NULL,
    "metadata" JSONB,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_batch_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "content_publishing_configs_user_tracked_agency_id_key" ON "content_publishing_configs"("user_tracked_agency_id");

-- CreateIndex
CREATE INDEX "content_outputs_ai_title_family_id_idx" ON "content_outputs"("ai_title_family_id");

-- CreateIndex
CREATE UNIQUE INDEX "content_outputs_config_id_language_key" ON "content_outputs"("config_id", "language");

-- CreateIndex
CREATE UNIQUE INDEX "ai_title_families_config_id_name_key" ON "ai_title_families"("config_id", "name");

-- CreateIndex
CREATE INDEX "property_localized_contents_user_property_id_idx" ON "property_localized_contents"("user_property_id");

-- CreateIndex
CREATE UNIQUE INDEX "property_localized_contents_user_property_id_content_type_l_key" ON "property_localized_contents"("user_property_id", "content_type", "language");

-- CreateIndex
CREATE UNIQUE INDEX "ai_batch_runs_openai_batch_id_key" ON "ai_batch_runs"("openai_batch_id");

-- CreateIndex
CREATE INDEX "ai_batch_runs_status_idx" ON "ai_batch_runs"("status");

-- CreateIndex
CREATE INDEX "ai_batch_runs_config_id_idx" ON "ai_batch_runs"("config_id");

-- AddForeignKey
ALTER TABLE "content_publishing_configs" ADD CONSTRAINT "content_publishing_configs_user_tracked_agency_id_fkey" FOREIGN KEY ("user_tracked_agency_id") REFERENCES "user_tracked_agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_outputs" ADD CONSTRAINT "content_outputs_config_id_fkey" FOREIGN KEY ("config_id") REFERENCES "content_publishing_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_outputs" ADD CONSTRAINT "content_outputs_ai_title_family_id_fkey" FOREIGN KEY ("ai_title_family_id") REFERENCES "ai_title_families"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_title_families" ADD CONSTRAINT "ai_title_families_config_id_fkey" FOREIGN KEY ("config_id") REFERENCES "content_publishing_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_localized_contents" ADD CONSTRAINT "property_localized_contents_user_property_id_fkey" FOREIGN KEY ("user_property_id") REFERENCES "user_properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_batch_runs" ADD CONSTRAINT "ai_batch_runs_config_id_fkey" FOREIGN KEY ("config_id") REFERENCES "content_publishing_configs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_batch_runs" ADD CONSTRAINT "ai_batch_runs_ai_title_family_id_fkey" FOREIGN KEY ("ai_title_family_id") REFERENCES "ai_title_families"("id") ON DELETE SET NULL ON UPDATE CASCADE;
