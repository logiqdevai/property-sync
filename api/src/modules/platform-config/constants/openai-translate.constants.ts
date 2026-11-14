// Models offered for OpenAI translation (checked against OpenAI's models/pricing/deprecations
// pages on 2026-11-14). All three accept reasoning_effort "none", so no reasoning tokens are
// spent on translation. gpt-4o-mini / gpt-5-mini / gpt-5-nano were left out: all deprecated.
export const OPENAI_TRANSLATE_MODELS = [
  'gpt-6-luna',
  'gpt-5.6-luna',
  'gpt-5.4-mini',
] as const;

export type OpenAiTranslateModel = (typeof OPENAI_TRANSLATE_MODELS)[number];

export const DEFAULT_OPENAI_TRANSLATE_MODEL: OpenAiTranslateModel = 'gpt-6-luna';

// Standard (non-batch) text rates, USD per token; output includes any reasoning tokens.
// Cached-input discounts are ignored: a translation prompt is far below the 1,024-token
// minimum OpenAI needs before it caches anything.
export const OPENAI_TRANSLATE_PRICING: Record<
  OpenAiTranslateModel,
  { input: number; output: number }
> = {
  'gpt-6-luna': { input: 0.1e-6, output: 0.5e-6 },
  'gpt-5.6-luna': { input: 0.2e-6, output: 1.2e-6 },
  'gpt-5.4-mini': { input: 0.75e-6, output: 4.5e-6 },
};
