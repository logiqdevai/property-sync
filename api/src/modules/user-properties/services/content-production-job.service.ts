import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { EstateWebCmsSyncAdapter } from '@/integrations/estateweb/services/estateweb-cms-sync-adapter.service';
import { EstateWebIntegrationResolverService } from '@/integrations/estateweb/services/estateweb-integration-resolver.service';
import { ContentProductionService } from '@/modules/content-publishing/services/content-production.service';
import { IntegrationType } from 'generated/prisma';
import {
  ContentProductionGroupResult,
  ContentProductionItemResult,
  ContentProductionJobData,
} from '../interfaces/content-production-job.interface';

// How many CMS pushes to run at once within a single agency-group job. Title
// generation is already batched into one OpenAI call for the whole group;
// this just keeps the CMS-push step from hammering EstateWeb with hundreds of
// simultaneous requests while still processing a group faster than one push
// at a time.
const CMS_PUSH_CONCURRENCY = 5;

@Injectable()
export class ContentProductionJobService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contentProductionService: ContentProductionService,
    private readonly estateWebCmsSyncAdapter: EstateWebCmsSyncAdapter,
    private readonly estateWebIntegrationResolver: EstateWebIntegrationResolverService,
  ) {}

  async processGroup(
    data: ContentProductionJobData,
  ): Promise<ContentProductionGroupResult> {
    const requestedIds = [...new Set(data.user_property_ids)];
    const properties = await this.prisma.userProperty.findMany({
      where: { id: { in: requestedIds }, user_id: data.user_id },
    });
    const propertyById = new Map(properties.map((p) => [p.id, p]));

    const items: ContentProductionItemResult[] = [];
    for (const id of requestedIds) {
      if (!propertyById.has(id)) {
        items.push({
          user_property_id: id,
          status: 'failed',
          error: 'Property not found',
        });
      }
    }

    const foundIds = properties.map((p) => p.id);
    if (!foundIds.length) {
      return { items, translations_written: 0, titles_written: 0 };
    }

    const produce =
      await this.contentProductionService.produceForUserProperties(foundIds, {
        forceSyncAi: !data.use_ai_batch,
        forceBatchAi: data.use_ai_batch,
        runTranslations: data.run_translations,
        runAiTitles: data.run_ai_titles,
        markStaleFirst: data.regenerate,
      });

    const readyForCmsPush: (typeof properties)[number][] = [];

    for (const property of properties) {
      const produceFailed = produce.failed.find(
        (row) => row.user_property_id === property.id,
      );
      if (produceFailed) {
        items.push({
          user_property_id: property.id,
          status: 'failed',
          error: produceFailed.error,
        });
        continue;
      }

      if (produce.pendingBatchIds.includes(property.id)) {
        items.push({ user_property_id: property.id, status: 'pending_batch' });
        continue;
      }

      if (!produce.readyIds.includes(property.id)) {
        items.push({
          user_property_id: property.id,
          status: 'failed',
          error: 'Property not ready after content production',
        });
        continue;
      }

      if (!data.push_to_crm) {
        items.push({
          user_property_id: property.id,
          status: 'ready',
          cms_pushed: false,
        });
        continue;
      }

      if (!property.integration_property_id) {
        items.push({
          user_property_id: property.id,
          status: 'cms_failed',
          cms_pushed: false,
          error:
            'Property not yet linked to EstateWeb CMS (not pushed before); push manually first',
        });
        continue;
      }

      readyForCmsPush.push(property);
    }

    const pushResults = await this.mapWithConcurrency(
      readyForCmsPush,
      CMS_PUSH_CONCURRENCY,
      async (property) => {
        try {
          const userIntegrationId = await this.resolveEstateWebIntegrationId(
            property.user_id,
            property.canonical_property_id,
          );
          await this.estateWebCmsSyncAdapter.pushUpdate(
            userIntegrationId,
            property.integration_property_id!,
            property,
          );
          return {
            user_property_id: property.id,
            status: 'ready' as const,
            cms_pushed: true,
          };
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          return {
            user_property_id: property.id,
            status: 'cms_failed' as const,
            cms_pushed: false,
            error: message,
          };
        }
      },
    );
    items.push(...pushResults);

    return {
      items,
      translations_written: produce.translationsWritten,
      titles_written: produce.titlesWritten,
    };
  }

  private async mapWithConcurrency<T, R>(
    items: T[],
    concurrency: number,
    fn: (item: T) => Promise<R>,
  ): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let nextIndex = 0;
    const workers = Array.from(
      { length: Math.min(concurrency, items.length) },
      async () => {
        while (nextIndex < items.length) {
          const current = nextIndex++;
          results[current] = await fn(items[current]);
        }
      },
    );
    await Promise.all(workers);
    return results;
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
