-- CreateTable
CREATE TABLE "platform_config" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "crawler_max_pages" INTEGER,
    "crawler_page_timeout_ms" INTEGER,
    "crawler_selector_timeout_ms" INTEGER,
    "crawler_scroll_pause_ms" INTEGER,
    "crawler_detail_concurrency" INTEGER,
    "crawler_detail_delay_ms" INTEGER,
    "crawler_worker_concurrency" INTEGER,
    "crawler_job_timeout_ms" INTEGER,
    "crawler_chromium_max_contexts_before_restart" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_config_pkey" PRIMARY KEY ("id")
);
