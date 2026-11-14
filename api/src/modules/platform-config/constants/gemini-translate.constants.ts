import { AiModels } from '@/integrations/ai/interfaces/ai.interface';

// Only models whose thinking can be switched off (see GeminiTranslationService) and that have
// an entry in AiPricing, so every translation gets an accurate cost log.
export const GEMINI_TRANSLATE_MODELS = [
  AiModels.gemini.gemini25Flash,
  AiModels.gemini.gemini25FlashLite,
] as const;

export type GeminiTranslateModel = (typeof GEMINI_TRANSLATE_MODELS)[number];

export const DEFAULT_GEMINI_TRANSLATE_MODEL: GeminiTranslateModel =
  AiModels.gemini.gemini25Flash;
