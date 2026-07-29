export const ContentLanguages = {
  EL: "EL",
  EN: "EN",
  DE: "DE",
  FR: "FR",
  IT: "IT",
  RU: "RU",
} as const;
export type ContentLanguage =
  (typeof ContentLanguages)[keyof typeof ContentLanguages];

export const TitleProductionStrategies = {
  ORIGINAL: "ORIGINAL",
  TRANSLATE: "TRANSLATE",
  AI: "AI",
} as const;
export type TitleProductionStrategy =
  (typeof TitleProductionStrategies)[keyof typeof TitleProductionStrategies];

export const DescriptionProductionStrategies = {
  ORIGINAL: "ORIGINAL",
  TRANSLATE: "TRANSLATE",
} as const;
export type DescriptionProductionStrategy =
  (typeof DescriptionProductionStrategies)[keyof typeof DescriptionProductionStrategies];

export interface AiTitleFamily {
  id: string;
  config_id: string;
  name: string;
  model: string | null;
  use_batch: boolean | null;
  instructions: string | null;
  writing_language: ContentLanguage | null;
  is_enabled: boolean;
  assigned_languages: ContentLanguage[];
}

export interface ContentOutput {
  id: string;
  language: ContentLanguage;
  title_strategy: TitleProductionStrategy;
  description_strategy: DescriptionProductionStrategy;
  description_content_language: ContentLanguage | null;
  ai_title_family_id: string | null;
  ai_title_family_name: string | null;
}

export interface ContentPublishingConfig {
  id: string;
  user_tracked_agency_id: string;
  ai_titles_enabled: boolean;
  use_ai_batch: boolean;
  is_enabled: boolean;
  notes: string | null;
  source_language: ContentLanguage;
  ai_title_families: AiTitleFamily[];
  outputs: ContentOutput[];
}

export interface UpsertAiTitleFamilyPayload {
  name: string;
  model?: string | null;
  use_batch?: boolean | null;
  instructions?: string | null;
  writing_language?: ContentLanguage | null;
  is_enabled?: boolean;
}

export interface UpsertContentOutputPayload {
  language: ContentLanguage;
  title_strategy: TitleProductionStrategy;
  description_strategy: DescriptionProductionStrategy;
  description_content_language?: ContentLanguage | null;
  ai_title_family?: string | null;
}

export interface UpsertContentPublishingConfigPayload {
  ai_titles_enabled?: boolean;
  use_ai_batch?: boolean;
  is_enabled?: boolean;
  notes?: string | null;
  ai_title_families: UpsertAiTitleFamilyPayload[];
  outputs: UpsertContentOutputPayload[];
}
