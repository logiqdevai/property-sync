import {
  GeminiTranslateModels,
  OpenAiTranslateModels,
  TranslationProviders,
  type GeminiTranslateModel,
  type OpenAiTranslateModel,
  type TranslationProvider,
} from "@/features/platform-config/interfaces/platform-config.interfaces";

export const TranslationProviderFormOptions: {
  id: TranslationProvider;
  label: string;
}[] = [
  { id: TranslationProviders.GOOGLE_TRANSLATE, label: "Google Translate" },
  { id: TranslationProviders.AZURE, label: "Azure Translator" },
  { id: TranslationProviders.GEMINI, label: "Gemini AI" },
  { id: TranslationProviders.OPENAI, label: "OpenAI" },
];

export const GeminiTranslateModelFormOptions: {
  id: GeminiTranslateModel;
  label: string;
}[] = [
  { id: GeminiTranslateModels.GEMINI_35_FLASH_LITE, label: "Gemini 3.5 Flash-Lite" },
  {
    id: GeminiTranslateModels.GEMINI_36_FLASH,
    label: "Gemini 3.6 Flash (higher quality, ~2.5–3x the cost)",
  },
];

export const OpenAiTranslateModelFormOptions: {
  id: OpenAiTranslateModel;
  label: string;
}[] = [
  { id: OpenAiTranslateModels.GPT_6_LUNA, label: "GPT-6 Luna (recommended, cheapest)" },
  { id: OpenAiTranslateModels.GPT_56_LUNA, label: "GPT-5.6 Luna (~2.3x the cost)" },
  { id: OpenAiTranslateModels.GPT_54_MINI, label: "GPT-5.4 mini (higher quality, ~9x the cost)" },
];

export function getTranslationProviderLabel(
  provider: TranslationProvider | string | null | undefined,
): string {
  if (!provider) return getTranslationProviderLabel(TranslationProviders.GOOGLE_TRANSLATE);
  return (
    TranslationProviderFormOptions.find((option) => option.id === provider)?.label ?? provider
  );
}
