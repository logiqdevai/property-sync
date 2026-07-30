import {
  TranslationProviders,
  type TranslationProvider,
} from "@/features/platform-config/interfaces/platform-config.interfaces";

export const TranslationProviderFormOptions: {
  id: TranslationProvider;
  label: string;
}[] = [
  { id: TranslationProviders.GOOGLE_TRANSLATE, label: "Google Translate" },
  { id: TranslationProviders.AZURE, label: "Azure Translator" },
];

export function getTranslationProviderLabel(
  provider: TranslationProvider | string | null | undefined,
): string {
  if (!provider) return getTranslationProviderLabel(TranslationProviders.GOOGLE_TRANSLATE);
  return (
    TranslationProviderFormOptions.find((option) => option.id === provider)?.label ?? provider
  );
}
