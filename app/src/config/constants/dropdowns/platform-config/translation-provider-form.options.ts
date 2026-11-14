import {
  GeminiTranslateModels,
  TranslationProviders,
  type GeminiTranslateModel,
  type TranslationProvider,
} from "@/features/platform-config/interfaces/platform-config.interfaces";

export const TranslationProviderFormOptions: {
  id: TranslationProvider;
  label: string;
}[] = [
  { id: TranslationProviders.GOOGLE_TRANSLATE, label: "Google Translate" },
  { id: TranslationProviders.AZURE, label: "Azure Translator" },
  { id: TranslationProviders.GEMINI, label: "Gemini AI" },
];

export const GeminiTranslateModelFormOptions: {
  id: GeminiTranslateModel;
  label: string;
}[] = [
  { id: GeminiTranslateModels.GEMINI_25_FLASH, label: "Gemini 2.5 Flash" },
  { id: GeminiTranslateModels.GEMINI_25_FLASH_LITE, label: "Gemini 2.5 Flash-Lite (cheaper)" },
];

export function getTranslationProviderLabel(
  provider: TranslationProvider | string | null | undefined,
): string {
  if (!provider) return getTranslationProviderLabel(TranslationProviders.GOOGLE_TRANSLATE);
  return (
    TranslationProviderFormOptions.find((option) => option.id === provider)?.label ?? provider
  );
}
