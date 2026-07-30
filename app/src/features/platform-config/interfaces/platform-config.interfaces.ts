export const TranslationProviders = {
  GOOGLE_TRANSLATE: "GOOGLE_TRANSLATE",
  AZURE: "AZURE",
} as const;

export type TranslationProvider =
  (typeof TranslationProviders)[keyof typeof TranslationProviders];

export interface PlatformConfig {
  id: string;
  crawler_max_pages: number | null;
  crawler_page_timeout_ms: number | null;
  crawler_selector_timeout_ms: number | null;
  crawler_scroll_pause_ms: number | null;
  crawler_detail_concurrency: number | null;
  crawler_detail_delay_ms: number | null;
  crawler_worker_concurrency: number | null;
  crawler_job_timeout_ms: number | null;
  crawler_chromium_max_contexts_before_restart: number | null;
  normalization_ai_raw_description_max_chars: number | null;
  dewatermark_cost_per_image: number | null;
  google_translate_cost_per_million_chars: number | null;
  azure_translate_cost_per_million_chars: number | null;
  translation_provider: TranslationProvider | null;
  created_at: string;
  updated_at: string;
}

export interface UpdatePlatformConfigPayload {
  crawler_max_pages?: number | null;
  crawler_page_timeout_ms?: number | null;
  crawler_selector_timeout_ms?: number | null;
  crawler_scroll_pause_ms?: number | null;
  crawler_detail_concurrency?: number | null;
  crawler_detail_delay_ms?: number | null;
  crawler_worker_concurrency?: number | null;
  crawler_job_timeout_ms?: number | null;
  crawler_chromium_max_contexts_before_restart?: number | null;
  normalization_ai_raw_description_max_chars?: number | null;
  dewatermark_cost_per_image?: number | null;
  google_translate_cost_per_million_chars?: number | null;
  azure_translate_cost_per_million_chars?: number | null;
  translation_provider?: TranslationProvider | null;
}
