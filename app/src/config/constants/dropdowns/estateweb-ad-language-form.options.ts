import type { EstateWebLanguageId } from "@/features/estateweb/interfaces/estateweb-integration-settings.interfaces";

export const EstateWebAdLanguageFormOptions: {
  id: EstateWebLanguageId;
  label: string;
}[] = [
  { id: 1, label: "Greek" },
  { id: 2, label: "English" },
  { id: 3, label: "German" },
  { id: 4, label: "French" },
  { id: 5, label: "Italian" },
  { id: 6, label: "Russian" },
];

export const ESTATEWEB_DEFAULT_AD_LANGUAGES: EstateWebLanguageId[] = [1];

export function getEstateWebAdLanguageLabel(
  id: EstateWebLanguageId | number,
): string {
  return (
    EstateWebAdLanguageFormOptions.find((option) => option.id === id)?.label ??
    String(id)
  );
}
