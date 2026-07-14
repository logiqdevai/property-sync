-- CreateEnum
CREATE TYPE "AuthRole" AS ENUM ('USER', 'ADMIN', 'SUPER_ADMIN', 'SUPPORT');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('LOGO', 'BANNER', 'IMAGE', 'VIDEO', 'AUDIO', 'PDF', 'DOCUMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "CrawlType" AS ENUM ('HTML', 'API', 'GRAPHQL', 'PLAYWRIGHT', 'SITEMAP', 'HYBRID');

-- CreateEnum
CREATE TYPE "PaginationType" AS ENUM ('NONE', 'PAGE_NUMBER', 'OFFSET', 'CURSOR', 'INFINITE_SCROLL', 'LOAD_MORE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "AgencyStatus" AS ENUM ('ACTIVE', 'DISABLED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ScraperStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'DEPRECATED', 'TESTING', 'BROKEN');

-- CreateEnum
CREATE TYPE "ScraperHealth" AS ENUM ('EXCELLENT', 'GOOD', 'WARNING', 'CRITICAL', 'BROKEN');

-- CreateEnum
CREATE TYPE "CrawlRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCESS', 'PARTIAL_SUCCESS', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "GenerationRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'AWAITING_REVIEW', 'SUCCESS', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "GenerationTrigger" AS ENUM ('MANUAL', 'SELF_HEAL', 'SCHEDULED');

-- CreateEnum
CREATE TYPE "ComputerActionType" AS ENUM ('CLICK', 'DOUBLE_CLICK', 'TYPE', 'SCROLL', 'SCROLL_UP', 'SCROLL_DOWN', 'NAVIGATE', 'GO_BACK', 'CLOSE_TAB', 'WAIT', 'KEYPRESS', 'SCREENSHOT', 'DRAG', 'DONE');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('WAITING', 'ACTIVE', 'COMPLETED', 'FAILED', 'DELAYED', 'PAUSED', 'STALLED');

-- CreateEnum
CREATE TYPE "PropertyStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'REMOVED', 'SOLD', 'RENTED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ListingType" AS ENUM ('SALE', 'RENT', 'SHORT_TERM_RENT', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "PropertyType" AS ENUM ('APARTMENT', 'HOUSE', 'VILLA', 'MAISONETTE', 'STUDIO', 'LAND', 'COMMERCIAL', 'OFFICE', 'WAREHOUSE', 'PARKING', 'OTHER', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "IntegrationType" AS ENUM ('ESTATEWEB', 'OPENAI', 'ANTHROPIC', 'GEMINI', 'DEEPSEEK');

-- CreateEnum
CREATE TYPE "AuthType" AS ENUM ('EMAIL_PASSWORD', 'USERNAME_PASSWORD', 'BEARER_TOKEN', 'API_KEY', 'OAUTH');

-- CreateEnum
CREATE TYPE "CmsSyncAction" AS ENUM ('CREATE', 'UPDATE', 'REMOVE');

-- CreateEnum
CREATE TYPE "CmsSyncStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'RETRYING');

-- CreateEnum
CREATE TYPE "PropertyHistoryEventType" AS ENUM ('CREATED', 'UPDATED', 'PRICE_CHANGED', 'IMAGE_ADDED', 'IMAGE_REMOVED', 'STATUS_CHANGED', 'REMOVED', 'REAPPEARED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('BROKEN_SCRAPER', 'CMS_SYNC_FAILURE', 'PROPERTY_REMOVAL_SPIKE', 'LARGE_CRAWL_FAILURE', 'QUEUE_FAILURE', 'WEBSITE_UNAVAILABLE');

-- CreateEnum
CREATE TYPE "NotificationSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ScraperVersionCreatedBy" AS ENUM ('AI', 'USER');

-- CreateEnum
CREATE TYPE "AiProvider" AS ENUM ('OPENAI', 'ANTHROPIC', 'GEMINI');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "password" TEXT NOT NULL,
    "role" "AuthRole" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_targets" (
    "id" TEXT NOT NULL,
    "integration_type" "IntegrationType" NOT NULL,
    "auth_type" "AuthType" NOT NULL,
    "base_url" TEXT,
    "allow_multiple" BOOLEAN NOT NULL DEFAULT false,
    "is_visible" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_integrations" (
    "id" TEXT NOT NULL,
    "integration_target_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "api_key_secret" TEXT,
    "email" TEXT,
    "username" TEXT,
    "password" TEXT,
    "config" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_agencies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "base_url" TEXT NOT NULL,
    "country" TEXT,
    "city" TEXT,
    "status" "AgencyStatus" NOT NULL DEFAULT 'ACTIVE',
    "is_visible" BOOLEAN NOT NULL DEFAULT false,
    "is_enabled" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "last_success_at" TIMESTAMP(3),
    "last_failure_at" TIMESTAMP(3),
    "last_error_message" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "source_agencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_tracked_agencies" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "source_agency_id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "crawl_interval" TEXT NOT NULL DEFAULT '0 */6 * * *',
    "track_new_listings" BOOLEAN NOT NULL DEFAULT true,
    "track_removed_listings" BOOLEAN NOT NULL DEFAULT true,
    "track_updated_listings" BOOLEAN NOT NULL DEFAULT true,
    "use_ai_batching" BOOLEAN NOT NULL DEFAULT false,
    "ai_provider" "AiProvider" NOT NULL DEFAULT 'OPENAI',
    "ai_model" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_tracked_agencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scrapers" (
    "id" TEXT NOT NULL,
    "source_agency_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active_version_id" TEXT,
    "version_count" INTEGER NOT NULL DEFAULT 0,
    "status" "ScraperStatus" NOT NULL DEFAULT 'TESTING',
    "self_healing_enabled" BOOLEAN NOT NULL DEFAULT true,
    "health" "ScraperHealth" NOT NULL DEFAULT 'GOOD',
    "success_rate" DECIMAL(5,2),
    "avg_runtime_ms" INTEGER,
    "consecutive_failures" INTEGER NOT NULL DEFAULT 0,
    "last_success_at" TIMESTAMP(3),
    "last_failure_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scrapers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scraper_generation_runs" (
    "id" TEXT NOT NULL,
    "source_agency_id" TEXT NOT NULL,
    "scraper_id" TEXT,
    "trigger" "GenerationTrigger" NOT NULL DEFAULT 'MANUAL',
    "status" "GenerationRunStatus" NOT NULL DEFAULT 'QUEUED',
    "prompt" TEXT,
    "staged_config" JSONB,
    "produced_version_id" TEXT,
    "error_message" TEXT,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scraper_generation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "computer_use_steps" (
    "id" TEXT NOT NULL,
    "scraper_generation_run_id" TEXT NOT NULL,
    "step_index" INTEGER NOT NULL,
    "action_type" "ComputerActionType" NOT NULL,
    "action_payload" JSONB NOT NULL,
    "screenshot_before_id" TEXT,
    "screenshot_after_id" TEXT,
    "model_reasoning" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "computer_use_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scraper_versions" (
    "id" TEXT NOT NULL,
    "scraper_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "config" JSONB NOT NULL,
    "created_by" "ScraperVersionCreatedBy" NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scraper_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scraper_execution_traces" (
    "id" TEXT NOT NULL,
    "scraper_id" TEXT NOT NULL,
    "crawl_run_id" TEXT,
    "steps" JSONB NOT NULL,
    "success" BOOLEAN NOT NULL,
    "error_summary" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scraper_execution_traces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crawl_runs" (
    "id" TEXT NOT NULL,
    "source_agency_id" TEXT NOT NULL,
    "scraper_id" TEXT,
    "user_tracked_agency_id" TEXT,
    "status" "CrawlRunStatus" NOT NULL DEFAULT 'QUEUED',
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "total_found" INTEGER NOT NULL DEFAULT 0,
    "total_created" INTEGER NOT NULL DEFAULT 0,
    "total_updated" INTEGER NOT NULL DEFAULT 0,
    "total_removed" INTEGER NOT NULL DEFAULT 0,
    "total_failed" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "metadata" JSONB,
    "ai_model" TEXT,
    "ai_input_tokens" INTEGER,
    "ai_output_tokens" INTEGER,
    "ai_input_cost" DECIMAL(12,6),
    "ai_output_cost" DECIMAL(12,6),
    "ai_total_cost" DECIMAL(12,6),
    "ai_average_cost_per_property" DECIMAL(12,8),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crawl_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_logs" (
    "id" TEXT NOT NULL,
    "queue_name" TEXT NOT NULL,
    "job_id" TEXT,
    "job_name" TEXT,
    "status" "JobStatus" NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER,
    "crawl_run_id" TEXT,
    "payload" JSONB,
    "result" JSONB,
    "error_message" TEXT,
    "stack_trace" TEXT,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "duration_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "severity" "NotificationSeverity" NOT NULL DEFAULT 'INFO',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "source_agency_id" TEXT,
    "scraper_id" TEXT,
    "crawl_run_id" TEXT,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cms_sync_runs" (
    "id" TEXT NOT NULL,
    "user_integration_id" TEXT NOT NULL,
    "user_property_id" TEXT,
    "action" "CmsSyncAction" NOT NULL,
    "status" "CmsSyncStatus" NOT NULL DEFAULT 'PENDING',
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER,
    "payload" JSONB,
    "response" JSONB,
    "error_message" TEXT,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cms_sync_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_properties" (
    "id" TEXT NOT NULL,
    "source_agency_id" TEXT NOT NULL,
    "external_id" TEXT,
    "source_url" TEXT NOT NULL,
    "canonical_url" TEXT,
    "raw_title" TEXT,
    "raw_description" TEXT,
    "raw_price" TEXT,
    "raw_location" TEXT,
    "raw_data" JSONB,
    "raw_html_path" TEXT,
    "content_hash" TEXT,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3),
    "status" "PropertyStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "source_properties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "properties" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "listing_type" "ListingType" NOT NULL DEFAULT 'UNKNOWN',
    "property_type" "PropertyType" NOT NULL DEFAULT 'UNKNOWN',
    "status" "PropertyStatus" NOT NULL DEFAULT 'ACTIVE',
    "price" DECIMAL(14,2),
    "currency" TEXT DEFAULT 'EUR',
    "city" TEXT,
    "district" TEXT,
    "address" TEXT,
    "postal_code" TEXT,
    "country" TEXT,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "square_meters" DECIMAL(10,2),
    "bedrooms" INTEGER,
    "bathrooms" INTEGER,
    "floor" TEXT,
    "construction_year" INTEGER,
    "renovation_year" INTEGER,
    "features" JSONB,
    "images" JSONB,
    "normalized_data" JSONB,
    "duplicate_group_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "properties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_source_links" (
    "id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "source_property_id" TEXT NOT NULL,
    "confidence_score" DECIMAL(5,2),
    "is_primary_source" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_source_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_history" (
    "id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "event_type" "PropertyHistoryEventType" NOT NULL,
    "field" TEXT,
    "old_value" JSONB,
    "new_value" JSONB,
    "crawl_run_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "property_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_properties" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "listing_type" "ListingType" NOT NULL DEFAULT 'UNKNOWN',
    "property_type" "PropertyType" NOT NULL DEFAULT 'UNKNOWN',
    "status" "PropertyStatus" NOT NULL DEFAULT 'ACTIVE',
    "price" DECIMAL(14,2),
    "currency" TEXT DEFAULT 'EUR',
    "city" TEXT,
    "district" TEXT,
    "address" TEXT,
    "postal_code" TEXT,
    "country" TEXT,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "square_meters" DECIMAL(10,2),
    "bedrooms" INTEGER,
    "bathrooms" INTEGER,
    "floor" TEXT,
    "construction_year" INTEGER,
    "renovation_year" INTEGER,
    "features" JSONB,
    "images" JSONB,
    "normalized_data" JSONB,
    "duplicate_group_id" TEXT,
    "is_modified" BOOLEAN NOT NULL DEFAULT false,
    "last_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_properties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "user_uuid" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimetype" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "type" "DocumentType" NOT NULL DEFAULT 'LOGO',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_phone_idx" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "source_agencies_base_url_key" ON "source_agencies"("base_url");

-- CreateIndex
CREATE INDEX "source_agencies_status_idx" ON "source_agencies"("status");

-- CreateIndex
CREATE INDEX "user_tracked_agencies_user_id_idx" ON "user_tracked_agencies"("user_id");

-- CreateIndex
CREATE INDEX "user_tracked_agencies_source_agency_id_idx" ON "user_tracked_agencies"("source_agency_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_tracked_agencies_user_id_source_agency_id_key" ON "user_tracked_agencies"("user_id", "source_agency_id");

-- CreateIndex
CREATE UNIQUE INDEX "scrapers_active_version_id_key" ON "scrapers"("active_version_id");

-- CreateIndex
CREATE INDEX "scrapers_source_agency_id_idx" ON "scrapers"("source_agency_id");

-- CreateIndex
CREATE INDEX "scrapers_status_idx" ON "scrapers"("status");

-- CreateIndex
CREATE INDEX "scrapers_health_idx" ON "scrapers"("health");

-- CreateIndex
CREATE UNIQUE INDEX "scraper_generation_runs_produced_version_id_key" ON "scraper_generation_runs"("produced_version_id");

-- CreateIndex
CREATE INDEX "scraper_generation_runs_source_agency_id_idx" ON "scraper_generation_runs"("source_agency_id");

-- CreateIndex
CREATE INDEX "scraper_generation_runs_scraper_id_idx" ON "scraper_generation_runs"("scraper_id");

-- CreateIndex
CREATE INDEX "scraper_generation_runs_status_idx" ON "scraper_generation_runs"("status");

-- CreateIndex
CREATE INDEX "computer_use_steps_scraper_generation_run_id_idx" ON "computer_use_steps"("scraper_generation_run_id");

-- CreateIndex
CREATE INDEX "computer_use_steps_scraper_generation_run_id_step_index_idx" ON "computer_use_steps"("scraper_generation_run_id", "step_index");

-- CreateIndex
CREATE INDEX "computer_use_steps_screenshot_before_id_idx" ON "computer_use_steps"("screenshot_before_id");

-- CreateIndex
CREATE INDEX "computer_use_steps_screenshot_after_id_idx" ON "computer_use_steps"("screenshot_after_id");

-- CreateIndex
CREATE UNIQUE INDEX "scraper_versions_scraper_id_version_key" ON "scraper_versions"("scraper_id", "version");

-- CreateIndex
CREATE INDEX "scraper_execution_traces_scraper_id_idx" ON "scraper_execution_traces"("scraper_id");

-- CreateIndex
CREATE INDEX "crawl_runs_source_agency_id_idx" ON "crawl_runs"("source_agency_id");

-- CreateIndex
CREATE INDEX "crawl_runs_scraper_id_idx" ON "crawl_runs"("scraper_id");

-- CreateIndex
CREATE INDEX "crawl_runs_status_idx" ON "crawl_runs"("status");

-- CreateIndex
CREATE INDEX "crawl_runs_created_at_idx" ON "crawl_runs"("created_at");

-- CreateIndex
CREATE INDEX "job_logs_queue_name_idx" ON "job_logs"("queue_name");

-- CreateIndex
CREATE INDEX "job_logs_job_id_idx" ON "job_logs"("job_id");

-- CreateIndex
CREATE INDEX "job_logs_status_idx" ON "job_logs"("status");

-- CreateIndex
CREATE INDEX "job_logs_crawl_run_id_idx" ON "job_logs"("crawl_run_id");

-- CreateIndex
CREATE INDEX "job_logs_created_at_idx" ON "job_logs"("created_at");

-- CreateIndex
CREATE INDEX "notifications_type_idx" ON "notifications"("type");

-- CreateIndex
CREATE INDEX "notifications_severity_idx" ON "notifications"("severity");

-- CreateIndex
CREATE INDEX "notifications_is_read_idx" ON "notifications"("is_read");

-- CreateIndex
CREATE INDEX "notifications_created_at_idx" ON "notifications"("created_at");

-- CreateIndex
CREATE INDEX "cms_sync_runs_user_integration_id_idx" ON "cms_sync_runs"("user_integration_id");

-- CreateIndex
CREATE INDEX "cms_sync_runs_user_property_id_idx" ON "cms_sync_runs"("user_property_id");

-- CreateIndex
CREATE INDEX "cms_sync_runs_status_idx" ON "cms_sync_runs"("status");

-- CreateIndex
CREATE INDEX "cms_sync_runs_created_at_idx" ON "cms_sync_runs"("created_at");

-- CreateIndex
CREATE INDEX "source_properties_source_agency_id_idx" ON "source_properties"("source_agency_id");

-- CreateIndex
CREATE INDEX "source_properties_external_id_idx" ON "source_properties"("external_id");

-- CreateIndex
CREATE INDEX "source_properties_content_hash_idx" ON "source_properties"("content_hash");

-- CreateIndex
CREATE INDEX "source_properties_status_idx" ON "source_properties"("status");

-- CreateIndex
CREATE INDEX "source_properties_last_seen_at_idx" ON "source_properties"("last_seen_at");

-- CreateIndex
CREATE UNIQUE INDEX "source_properties_source_agency_id_source_url_key" ON "source_properties"("source_agency_id", "source_url");

-- CreateIndex
CREATE INDEX "properties_listing_type_idx" ON "properties"("listing_type");

-- CreateIndex
CREATE INDEX "properties_property_type_idx" ON "properties"("property_type");

-- CreateIndex
CREATE INDEX "properties_status_idx" ON "properties"("status");

-- CreateIndex
CREATE INDEX "properties_city_idx" ON "properties"("city");

-- CreateIndex
CREATE INDEX "properties_district_idx" ON "properties"("district");

-- CreateIndex
CREATE INDEX "properties_price_idx" ON "properties"("price");

-- CreateIndex
CREATE INDEX "properties_duplicate_group_id_idx" ON "properties"("duplicate_group_id");

-- CreateIndex
CREATE INDEX "property_source_links_property_id_idx" ON "property_source_links"("property_id");

-- CreateIndex
CREATE INDEX "property_source_links_source_property_id_idx" ON "property_source_links"("source_property_id");

-- CreateIndex
CREATE UNIQUE INDEX "property_source_links_property_id_source_property_id_key" ON "property_source_links"("property_id", "source_property_id");

-- CreateIndex
CREATE INDEX "property_history_property_id_idx" ON "property_history"("property_id");

-- CreateIndex
CREATE INDEX "property_history_event_type_idx" ON "property_history"("event_type");

-- CreateIndex
CREATE INDEX "property_history_crawl_run_id_idx" ON "property_history"("crawl_run_id");

-- CreateIndex
CREATE INDEX "user_properties_user_id_idx" ON "user_properties"("user_id");

-- CreateIndex
CREATE INDEX "user_properties_property_id_idx" ON "user_properties"("property_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_properties_user_id_property_id_key" ON "user_properties"("user_id", "property_id");

-- CreateIndex
CREATE INDEX "documents_user_uuid_idx" ON "documents"("user_uuid");

-- AddForeignKey
ALTER TABLE "user_integrations" ADD CONSTRAINT "user_integrations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_integrations" ADD CONSTRAINT "user_integrations_integration_target_id_fkey" FOREIGN KEY ("integration_target_id") REFERENCES "integration_targets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_tracked_agencies" ADD CONSTRAINT "user_tracked_agencies_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_tracked_agencies" ADD CONSTRAINT "user_tracked_agencies_source_agency_id_fkey" FOREIGN KEY ("source_agency_id") REFERENCES "source_agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scrapers" ADD CONSTRAINT "scrapers_source_agency_id_fkey" FOREIGN KEY ("source_agency_id") REFERENCES "source_agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scrapers" ADD CONSTRAINT "scrapers_active_version_id_fkey" FOREIGN KEY ("active_version_id") REFERENCES "scraper_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scraper_generation_runs" ADD CONSTRAINT "scraper_generation_runs_source_agency_id_fkey" FOREIGN KEY ("source_agency_id") REFERENCES "source_agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scraper_generation_runs" ADD CONSTRAINT "scraper_generation_runs_scraper_id_fkey" FOREIGN KEY ("scraper_id") REFERENCES "scrapers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scraper_generation_runs" ADD CONSTRAINT "scraper_generation_runs_produced_version_id_fkey" FOREIGN KEY ("produced_version_id") REFERENCES "scraper_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "computer_use_steps" ADD CONSTRAINT "computer_use_steps_scraper_generation_run_id_fkey" FOREIGN KEY ("scraper_generation_run_id") REFERENCES "scraper_generation_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "computer_use_steps" ADD CONSTRAINT "computer_use_steps_screenshot_before_id_fkey" FOREIGN KEY ("screenshot_before_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "computer_use_steps" ADD CONSTRAINT "computer_use_steps_screenshot_after_id_fkey" FOREIGN KEY ("screenshot_after_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scraper_versions" ADD CONSTRAINT "scraper_versions_scraper_id_fkey" FOREIGN KEY ("scraper_id") REFERENCES "scrapers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scraper_execution_traces" ADD CONSTRAINT "scraper_execution_traces_scraper_id_fkey" FOREIGN KEY ("scraper_id") REFERENCES "scrapers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scraper_execution_traces" ADD CONSTRAINT "scraper_execution_traces_crawl_run_id_fkey" FOREIGN KEY ("crawl_run_id") REFERENCES "crawl_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crawl_runs" ADD CONSTRAINT "crawl_runs_source_agency_id_fkey" FOREIGN KEY ("source_agency_id") REFERENCES "source_agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crawl_runs" ADD CONSTRAINT "crawl_runs_user_tracked_agency_id_fkey" FOREIGN KEY ("user_tracked_agency_id") REFERENCES "user_tracked_agencies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crawl_runs" ADD CONSTRAINT "crawl_runs_scraper_id_fkey" FOREIGN KEY ("scraper_id") REFERENCES "scrapers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_logs" ADD CONSTRAINT "job_logs_crawl_run_id_fkey" FOREIGN KEY ("crawl_run_id") REFERENCES "crawl_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_source_agency_id_fkey" FOREIGN KEY ("source_agency_id") REFERENCES "source_agencies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_scraper_id_fkey" FOREIGN KEY ("scraper_id") REFERENCES "scrapers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_crawl_run_id_fkey" FOREIGN KEY ("crawl_run_id") REFERENCES "crawl_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cms_sync_runs" ADD CONSTRAINT "cms_sync_runs_user_integration_id_fkey" FOREIGN KEY ("user_integration_id") REFERENCES "user_integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cms_sync_runs" ADD CONSTRAINT "cms_sync_runs_user_property_id_fkey" FOREIGN KEY ("user_property_id") REFERENCES "user_properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_properties" ADD CONSTRAINT "source_properties_source_agency_id_fkey" FOREIGN KEY ("source_agency_id") REFERENCES "source_agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_source_links" ADD CONSTRAINT "property_source_links_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_source_links" ADD CONSTRAINT "property_source_links_source_property_id_fkey" FOREIGN KEY ("source_property_id") REFERENCES "source_properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_history" ADD CONSTRAINT "property_history_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_history" ADD CONSTRAINT "property_history_crawl_run_id_fkey" FOREIGN KEY ("crawl_run_id") REFERENCES "crawl_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_properties" ADD CONSTRAINT "user_properties_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_properties" ADD CONSTRAINT "user_properties_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
