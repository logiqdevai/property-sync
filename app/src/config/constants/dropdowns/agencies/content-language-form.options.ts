import {
  ContentLanguages,
  type ContentLanguage,
} from "@/features/content-publishing/interfaces/content-publishing.interfaces";

export const ContentLanguageFormOptions: {
  id: ContentLanguage;
  label: string;
}[] = [
  { id: ContentLanguages.EL, label: "Greek" },
  { id: ContentLanguages.EN, label: "English" },
  { id: ContentLanguages.DE, label: "German" },
  { id: ContentLanguages.FR, label: "French" },
  { id: ContentLanguages.IT, label: "Italian" },
  { id: ContentLanguages.RU, label: "Russian" },
];

export function getContentLanguageLabel(
  language: ContentLanguage | string,
): string {
  return (
    ContentLanguageFormOptions.find((option) => option.id === language)
      ?.label ?? language
  );
}

export const TitleStrategyFormOptions = [
  { id: "ORIGINAL", label: "Original" },
  { id: "TRANSLATE", label: "Translate" },
  { id: "AI", label: "AI family" },
] as const;

export const DescriptionStrategyFormOptions = [
  { id: "ORIGINAL", label: "Original" },
  { id: "TRANSLATE", label: "Translate" },
] as const;
