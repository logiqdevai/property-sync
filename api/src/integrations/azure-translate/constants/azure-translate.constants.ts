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
export const AZURE_TRANSLATE_MAX_ATTEMPTS = 3;
export const AZURE_TRANSLATE_RETRY_BASE_DELAY_MS = 1000;
export const AZURE_TRANSLATE_RETRY_MAX_DELAY_MS = 30_000;
