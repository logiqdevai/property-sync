export const AZURE_TRANSLATE_ENDPOINT =
  'https://api.cognitive.microsofttranslator.com';

export const AZURE_TRANSLATE_REGION = 'switzerlandnorth';

export const AZURE_TRANSLATE_API_VERSION = '3.0';

export const AZURE_TRANSLATE_API_PATHS = {
  translate: '/translate',
} as const;

export const DEFAULT_AZURE_TRANSLATE_COST_PER_MILLION_CHARS = 10;

// Fallback when platform_config.azure_translate_max_requests_per_second is null. Shared by every
// Azure Translate call in this process. Content production runs several properties in parallel,
// and each one translates sequentially, so without this cap the Translator receives a burst of
// requests and answers with 429.
export const DEFAULT_AZURE_TRANSLATE_MAX_REQUESTS_PER_SECOND = 5;

// Attempts for a request that Azure rejects with 429 (including the first try).
export const AZURE_TRANSLATE_MAX_ATTEMPTS = 6;
export const AZURE_TRANSLATE_RETRY_BASE_DELAY_MS = 2000;
export const AZURE_TRANSLATE_RETRY_MAX_DELAY_MS = 30_000;

// Measured against the live key on 2026-10-07: Azure accepts about 30-35k characters per rolling
// minute, then answers 429 (code 429001) until the window drains. The Translator limit is on
// characters, not requests, so a request-rate cap alone cannot prevent 429s on long descriptions.
// Kept under the observed ceiling to leave headroom.
export const AZURE_TRANSLATE_MAX_CHARS_PER_MINUTE = 28_000;
export const AZURE_TRANSLATE_CHAR_WINDOW_MS = 60_000;
