export const TranslationProviders = {
  GOOGLE_TRANSLATE: "GOOGLE_TRANSLATE",
  AZURE: "AZURE",
  GEMINI: "GEMINI",
  OPENAI: "OPENAI",
} as const;

export type TranslationProvider =
  (typeof TranslationProviders)[keyof typeof TranslationProviders];

export const GeminiTranslateModels = {
  GEMINI_35_FLASH_LITE: "gemini-3.5-flash-lite",
  GEMINI_36_FLASH: "gemini-3.6-flash",
} as const;

export type GeminiTranslateModel =
  (typeof GeminiTranslateModels)[keyof typeof GeminiTranslateModels];

export const OpenAiTranslateModels = {
  GPT_6_LUNA: "gpt-6-luna",
  GPT_56_LUNA: "gpt-5.6-luna",
  GPT_54_MINI: "gpt-5.4-mini",
} as const;

export type OpenAiTranslateModel =
  (typeof OpenAiTranslateModels)[keyof typeof OpenAiTranslateModels];

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
  crawler_max_concurrent_browser_pages: number | null;
  normalization_ai_raw_description_max_chars: number | null;
  dewatermark_cost_per_image: number | null;
  google_translate_cost_per_million_chars: number | null;
  google_geocoding_cost_per_request: number | null;
  dewatermark_cost_per_credit: number | null;
  azure_translate_cost_per_million_chars: number | null;
  translation_provider: TranslationProvider | null;
  estateweb_location_google_enabled: boolean | null;
  gemini_translate_model: GeminiTranslateModel | null;
  openai_translate_model: OpenAiTranslateModel | null;
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
  crawler_max_concurrent_browser_pages?: number | null;
  normalization_ai_raw_description_max_chars?: number | null;
  dewatermark_cost_per_image?: number | null;
  google_translate_cost_per_million_chars?: number | null;
  google_geocoding_cost_per_request?: number | null;
  dewatermark_cost_per_credit?: number | null;
  azure_translate_cost_per_million_chars?: number | null;
  translation_provider?: TranslationProvider | null;
  estateweb_location_google_enabled?: boolean | null;
  gemini_translate_model?: GeminiTranslateModel | null;
  openai_translate_model?: OpenAiTranslateModel | null;
}
