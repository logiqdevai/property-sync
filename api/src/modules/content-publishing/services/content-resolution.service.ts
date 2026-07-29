import { Injectable, Logger } from '@nestjs/common';
import {
  ContentType,
  DescriptionProductionStrategy,
  TitleProductionStrategy,
  UserProperty,
} from 'generated/prisma';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import {
  ESTATEWEB_INIT_LANGUAGES,
  EstateWebLanguageId,
} from '@/integrations/estateweb/constants/estateweb-enums.constants';
import { CONTENT_LANGUAGE_TO_ESTATEWEB_ID } from '../constants/content-language.constants';
import {
  EstateWebAdLanguageMaps,
  ResolvedTrackerContentContext,
} from '../interfaces/content-publishing.interface';
import { ContentPublishingConfigService } from './content-publishing-config.service';

@Injectable()
export class ContentResolutionService {
  private readonly logger = new Logger(ContentResolutionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly contentPublishingConfigService: ContentPublishingConfigService,
  ) {}

  async resolveContextForUserProperty(
    userProperty: Pick<UserProperty, 'id' | 'user_id' | 'canonical_property_id'>,
  ): Promise<ResolvedTrackerContentContext | null> {
    const canonical = await this.prisma.property.findUnique({
      where: { id: userProperty.canonical_property_id },
      include: {
        source_links: {
          orderBy: [{ is_primary_source: 'desc' }, { created_at: 'asc' }],
          include: {
            source_property: { select: { source_agency_id: true } },
          },
          take: 1,
        },
      },
    });

    const sourceAgencyId =
      canonical?.source_links[0]?.source_property.source_agency_id;
    if (!sourceAgencyId) return null;

    const tracker = await this.prisma.userTrackedAgency.findUnique({
      where: {
        user_id_source_agency_id: {
          user_id: userProperty.user_id,
          source_agency_id: sourceAgencyId,
        },
      },
      include: {
        source_agency: { select: { content_language: true } },
      },
    });
    if (!tracker) return null;

    const config = await this.contentPublishingConfigService.getByTrackerId(
      tracker.id,
    );

    return {
      trackerId: tracker.id,
      sourceAgencyId,
      contentLanguage: tracker.source_agency.content_language,
      config,
    };
  }

  async resolveAdMaps(
    userProperty: UserProperty,
    fallbackLanguages: EstateWebLanguageId[],
  ): Promise<EstateWebAdLanguageMaps> {
    const context = await this.resolveContextForUserProperty(userProperty);
    const config = context?.config;

    this.logger.log(
      `[resolveAdMaps] property=${userProperty.id} tracker=${context?.trackerId ?? 'none'} configId=${config?.id ?? 'null'} enabled=${config?.is_enabled ?? false} outputs=${config?.outputs?.length ?? 0}`,
    );

    if (!config || !config.is_enabled) {
      this.logger.warn(
        `[resolveAdMaps] property=${userProperty.id} using legacy broadcast (no enabled content publishing config)`,
      );
      return this.legacyBroadcast(userProperty, fallbackLanguages);
    }

    const localized = await this.prisma.propertyLocalizedContent.findMany({
      where: { user_property_id: userProperty.id },
    });
    const byKey = new Map(
      localized.map((row) => [`${row.content_type}:${row.language}`, row]),
    );

    this.logger.log(
      `[resolveAdMaps] property=${userProperty.id} localizedRows=${localized.length} stale=${localized.filter((r) => r.is_stale).length}`,
    );

    const titles: Partial<Record<EstateWebLanguageId, string>> = {};
    const descriptions: Partial<Record<EstateWebLanguageId, string>> = {};
    const languages: EstateWebLanguageId[] = [];

    for (const lang of ESTATEWEB_INIT_LANGUAGES) {
      titles[lang.id] = '';
      descriptions[lang.id] = '';
    }

    for (const output of config.outputs) {
      const estatewebId = CONTENT_LANGUAGE_TO_ESTATEWEB_ID[output.language];
      languages.push(estatewebId);

      const titleLocalized = byKey.get(
        `${ContentType.TITLE}:${output.language}`,
      )?.text;
      const descriptionLanguage =
        output.description_content_language ?? output.language;
      const descriptionLocalized = byKey.get(
        `${ContentType.DESCRIPTION}:${descriptionLanguage}`,
      )?.text;

      titles[estatewebId] = this.resolveField({
        strategy: output.title_strategy,
        original: userProperty.title,
        localized: titleLocalized,
      });

      descriptions[estatewebId] = this.resolveField({
        strategy: output.description_strategy,
        original: userProperty.description ?? '',
        localized: descriptionLocalized,
      });

      this.logger.log(
        `[resolveAdMaps] property=${userProperty.id} slot=${output.language}->${estatewebId} titleStrategy=${output.title_strategy} descStrategy=${output.description_strategy} descContentLang=${descriptionLanguage} titleChars=${titles[estatewebId]?.length ?? 0} descChars=${descriptions[estatewebId]?.length ?? 0} titleFromLocalized=${Boolean(titleLocalized?.trim())} descFromLocalized=${Boolean(descriptionLocalized?.trim())}`,
      );
    }

    return {
      titles,
      descriptions,
      languages: [...new Set(languages)],
    };
  }

  private resolveField(input: {
    strategy: TitleProductionStrategy | DescriptionProductionStrategy;
    original: string;
    localized?: string | null;
  }): string {
    if (input.strategy === 'ORIGINAL') {
      return input.original ?? '';
    }
    if (input.localized?.trim()) {
      return input.localized;
    }
    return '';
  }

  private legacyBroadcast(
    userProperty: UserProperty,
    fallbackLanguages: EstateWebLanguageId[],
  ): EstateWebAdLanguageMaps {
    const titles: Partial<Record<EstateWebLanguageId, string>> = {};
    const descriptions: Partial<Record<EstateWebLanguageId, string>> = {};
    const selected = new Set(fallbackLanguages);

    for (const lang of ESTATEWEB_INIT_LANGUAGES) {
      if (selected.has(lang.id)) {
        titles[lang.id] = userProperty.title ?? '';
        descriptions[lang.id] = userProperty.description ?? '';
      } else {
        titles[lang.id] = '';
        descriptions[lang.id] = '';
      }
    }

    return {
      titles,
      descriptions,
      languages: fallbackLanguages,
    };
  }
}
