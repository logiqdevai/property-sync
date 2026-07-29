export const GOOGLE_TRANSLATE_MAX_TEXTS_PER_REQUEST = 128;

export const GOOGLE_TRANSLATE_DEFAULT_FORMAT = 'text' as const;

// Google Cloud Translation "Basic" public pricing: $20 per 1,000,000 characters.
export const GOOGLE_TRANSLATE_COST_PER_CHAR = 20 / 1_000_000;
