import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { EstateWebCmsSyncAdapter } from '@/integrations/estateweb/services/estateweb-cms-sync-adapter.service';
import { EstateWebIntegrationResolverService } from '@/integrations/estateweb/services/estateweb-integration-resolver.service';
import { ContentProductionService } from '@/modules/content-publishing/services/content-production.service';
import { IntegrationType } from 'generated/prisma';
import {
  ContentProductionItemResult,
  ContentProductionJobData,
} from '../interfaces/content-production-job.interface';

@Injectable()
export class ContentProductionJobService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contentProductionService: ContentProductionService,
    private readonly estateWebCmsSyncAdapter: EstateWebCmsSyncAdapter,
    private readonly estateWebIntegrationResolver: EstateWebIntegrationResolverService,
  ) {}

  async processProperty(
    data: ContentProductionJobData,
  ): Promise<ContentProductionItemResult> {
    const property = await this.prisma.userProperty.findFirst({
      where: { id: data.user_property_id, user_id: data.user_id },
    });

    if (!property) {
      return {
        user_property_id: data.user_property_id,
        status: 'failed',
        error: 'Property not found',
      };
    }

    const produce = await this.contentProductionService.produceForUserProperties(
      [data.user_property_id],
      {
        forceSyncAi: !data.use_ai_batch,
        forceBatchAi: data.use_ai_batch,
        runTranslations: data.run_translations,
        runAiTitles: data.run_ai_titles,
        markStaleFirst: data.regenerate,
      },
    );

    const produceFailed = produce.failed.find(
      (row) => row.user_property_id === data.user_property_id,
    );
    if (produceFailed) {
      return {
        user_property_id: data.user_property_id,
        status: 'failed',
        translations_written: produce.translationsWritten,
        titles_written: produce.titlesWritten,
        error: produceFailed.error,
      };
    }

    if (produce.pendingBatchIds.includes(data.user_property_id)) {
      return {
        user_property_id: data.user_property_id,
        status: 'pending_batch',
        translations_written: produce.translationsWritten,
        titles_written: produce.titlesWritten,
      };
    }

    if (!produce.readyIds.includes(data.user_property_id)) {
      return {
        user_property_id: data.user_property_id,
        status: 'failed',
        translations_written: produce.translationsWritten,
        titles_written: produce.titlesWritten,
        error: 'Property not ready after content production',
      };
    }

    if (!data.push_to_crm) {
      return {
        user_property_id: data.user_property_id,
        status: 'ready',
        translations_written: produce.translationsWritten,
        titles_written: produce.titlesWritten,
        cms_pushed: false,
      };
    }

    if (!property.integration_property_id) {
      return {
        user_property_id: data.user_property_id,
        status: 'cms_failed',
        translations_written: produce.translationsWritten,
        titles_written: produce.titlesWritten,
        cms_pushed: false,
        error:
          'Property not yet linked to EstateWeb CMS (not pushed before); push manually first',
      };
    }

    try {
      const userIntegrationId = await this.resolveEstateWebIntegrationId(
        property.user_id,
        property.canonical_property_id,
      );

      await this.estateWebCmsSyncAdapter.pushUpdate(
        userIntegrationId,
        property.integration_property_id,
        property,
      );

      return {
        user_property_id: data.user_property_id,
        status: 'ready',
        translations_written: produce.translationsWritten,
        titles_written: produce.titlesWritten,
        cms_pushed: true,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        user_property_id: data.user_property_id,
        status: 'cms_failed',
        translations_written: produce.translationsWritten,
        titles_written: produce.titlesWritten,
        cms_pushed: false,
        error: message,
      };
    }
  }

  private async resolveEstateWebIntegrationId(
    userId: string,
    canonicalPropertyId: string,
  ): Promise<string> {
    const link = await this.prisma.propertySourceLink.findFirst({
      where: { property_id: canonicalPropertyId },
      include: {
        source_property: { select: { source_agency_id: true } },
      },
    });
    const sourceAgencyId = link?.source_property.source_agency_id;
    if (!sourceAgencyId) {
      throw new Error(
        'Property has no source agency; cannot resolve linked EstateWeb CMS',
      );
    }

    const resolved =
      await this.estateWebIntegrationResolver.resolveForTrackedAgency(
        userId,
        sourceAgencyId,
      );

    const integration = await this.prisma.userIntegration.findUnique({
      where: { id: resolved.userIntegrationId },
      select: {
        integration_target: { select: { integration_type: true } },
      },
    });

    if (
      !integration ||
      integration.integration_target.integration_type !==
        IntegrationType.ESTATEWEB
    ) {
      throw new Error('CMS push only supported for EstateWeb');
    }

    return resolved.userIntegrationId;
  }
}
