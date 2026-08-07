import {
  ContentLanguage,
  ContentPublishingConfig,
  ContentOutput,
  AiTitleFamily,
  DescriptionProductionStrategy,
  TitleProductionStrategy,
} from 'generated/prisma';
import { EstateWebLanguageId } from '@/integrations/estateweb/constants/estateweb-enums.constants';

export type ContentPublishingConfigWithRelations = ContentPublishingConfig & {
  outputs: Array<
    ContentOutput & {
      ai_title_family: AiTitleFamily | null;
    }
  >;
  ai_title_families: AiTitleFamily[];
};

export interface ResolvedTrackerContentContext {
  trackerId: string;
  sourceAgencyId: string;
  contentLanguage: ContentLanguage;
  textTruncatePieces: string[];
  config: ContentPublishingConfigWithRelations | null;
}

export interface EstateWebAdLanguageMaps {
  titles: Partial<Record<EstateWebLanguageId, string>>;
  descriptions: Partial<Record<EstateWebLanguageId, string>>;
  languages: EstateWebLanguageId[];
}

export interface ProduceContentResult {
  produced: number;
  skipped: number;
  pendingBatch: boolean;
}

export type TitleStrategy = TitleProductionStrategy;
export type DescriptionStrategy = DescriptionProductionStrategy;
