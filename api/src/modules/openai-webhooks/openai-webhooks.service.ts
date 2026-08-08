import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import OpenAI from 'openai';
import { PropertyAiBatchService } from '@/integrations/ai-batch/services/property-ai-batch.service';
import { PropertyNormalizationService } from '@/modules/properties/services/property-normalization.service';
import { AiTitleBatchService } from '@/modules/content-publishing/services/ai-title-batch.service';
import { ContentProductionService } from '@/modules/content-publishing/services/content-production.service';
import { CmsSyncOrchestratorService } from '@/modules/cms-sync/services/cms-sync-orchestrator.service';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import {
  JobStatus,
  NotificationSeverity,
  NotificationType,
  Prisma,
} from 'generated/prisma';

@Injectable()
export class OpenAiWebhooksService {
  private readonly logger = new Logger(OpenAiWebhooksService.name);
  private readonly processedWebhookIds = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly propertyAiBatchService: PropertyAiBatchService,
    private readonly propertyNormalizationService: PropertyNormalizationService,
    private readonly aiTitleBatchService: AiTitleBatchService,
    private readonly contentProductionService: ContentProductionService,
    private readonly cmsSyncOrchestratorService: CmsSyncOrchestratorService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async handleWebhook(
    rawBody: string,
    headers: Record<string, string | string[] | undefined>,
    userIntegrationId: string,
  ): Promise<void> {
    const secret = await this.resolveWebhookSecret(userIntegrationId);
    if (!secret) {
      this.logger.warn(
        `No webhook key for integration ${userIntegrationId} — rejecting webhook`,
      );
      throw new UnauthorizedException('Webhook secret not configured');
    }

    const webhookId = this.headerValue(headers['webhook-id']);
    const dedupeKey = `${userIntegrationId}:${webhookId ?? 'unknown'}`;

    if (this.processedWebhookIds.has(dedupeKey)) {
      this.logger.log(`Duplicate webhook ${dedupeKey} — skipping`);
      return;
    }

    const existing = webhookId
      ? await this.prisma.jobLog.findFirst({
          where: {
            queue_name: `openai-webhook:${userIntegrationId}`,
            job_id: webhookId,
          },
        })
      : null;

    if (existing) {
      this.logger.log(`Webhook ${dedupeKey} already processed`);
      return;
    }

    const startedAt = new Date();
    const client = new OpenAI({ apiKey: 'unused' });
    const event = (await client.webhooks.unwrap(
      rawBody,
      this.normalizeHeaders(headers),
      secret,
    )) as { type: string; data: { id: string } };

    const finishedAt = new Date();
    this.processedWebhookIds.add(dedupeKey);
    await this.prisma.jobLog.create({
      data: {
        queue_name: `openai-webhook:${userIntegrationId}`,
        job_id: webhookId ?? dedupeKey,
        job_name: event.type,
        status: JobStatus.COMPLETED,
        started_at: startedAt,
        finished_at: finishedAt,
        duration_ms: finishedAt.getTime() - startedAt.getTime(),
        payload: {
          event_type: event.type,
          batch_id: event.data.id,
          user_integration_id: userIntegrationId,
        },
      },
    });

    const batchId = event.data.id;
    const titleBatch =
      await this.aiTitleBatchService.findByOpenAiBatchId(batchId);

    if (titleBatch) {
      const apiKey = await this.resolveApiKey(userIntegrationId);
      if (!apiKey) {
        this.logger.warn(
          `No API key for title batch ${batchId} on integration ${userIntegrationId}`,
        );
        return;
      }

      if (event.type === 'batch.completed') {
        await this.aiTitleBatchService.completeBatch(batchId, apiKey);
        const ready =
          await this.contentProductionService.getReadyPropertyIdsAfterTitleBatch(
            batchId,
          );
        if (ready.readyIds.length) {
          try {
            await this.cmsSyncOrchestratorService.planAndEnqueueTitleBatchReady(
              ready.crawlRunId,
              ready.readyIds,
              ready.changeTypesByPropertyId,
            );
          } catch (error) {
            const message =
              error instanceof Error ? error.message : String(error);
            this.logger.error(
              `Failed to enqueue CMS sync after title batch ${batchId}: ${message}`,
            );
            const agency = await this.resolveAgencyForCrawlRun(
              ready.crawlRunId,
            );
            this.notificationsService.create({
              type: NotificationType.CMS_SYNC_FAILURE,
              severity: NotificationSeverity.CRITICAL,
              title: `CMS sync enqueue failed after title batch — ${agency.name}`,
              message: `Title batch ${batchId} for ${agency.name} completed but CMS enqueue failed. ${message}`,
              crawl_run_id: ready.crawlRunId,
              source_agency_id: agency.id,
            });
          }
        }
        return;
      }

      if (
        event.type === 'batch.failed' ||
        event.type === 'batch.expired' ||
        event.type === 'batch.cancelled'
      ) {
        await this.aiTitleBatchService.markFailed(
          batchId,
          `OpenAI batch ${event.type}`,
        );
        const agency = await this.resolveAgencyForCrawlRun(
          titleBatch.crawl_run_id,
        );
        this.notificationsService.create({
          type: NotificationType.CMS_SYNC_FAILURE,
          severity: NotificationSeverity.CRITICAL,
          title: `Content title AI batch failed — ${agency.name}`,
          message: `OpenAI title batch ${batchId} for ${agency.name} ${event.type}. CMS push held for affected properties.`,
          crawl_run_id: titleBatch.crawl_run_id,
          source_agency_id: agency.id,
        });
      }
      return;
    }

    const crawlRun = await this.findCrawlRunForBatch(
      batchId,
      userIntegrationId,
    );

    if (!crawlRun) {
      this.logger.warn(`No crawl run found for batch ${batchId}`);
      return;
    }

    if (event.type === 'batch.completed') {
      await this.propertyAiBatchService.enqueueBatchCompletion(
        batchId,
        crawlRun.id,
      );
      return;
    }

    if (
      event.type === 'batch.failed' ||
      event.type === 'batch.expired' ||
      event.type === 'batch.cancelled'
    ) {
      await this.propertyNormalizationService.markBatchFailed(
        crawlRun.id,
        event.type.replace('batch.', ''),
        `OpenAI batch ${event.type}`,
      );
    }
  }

  private async resolveApiKey(
    userIntegrationId: string,
  ): Promise<string | null> {
    const integration = await this.prisma.userIntegration.findUnique({
      where: { id: userIntegrationId },
      select: { api_key_secret: true },
    });
    return integration?.api_key_secret ?? null;
  }

  private async resolveWebhookSecret(
    userIntegrationId: string,
  ): Promise<string | null> {
    const integration = await this.prisma.userIntegration.findUnique({
      where: { id: userIntegrationId },
      select: { webhook_key: true, is_active: true },
    });

    if (!integration?.is_active || !integration.webhook_key) {
      return null;
    }

    return integration.webhook_key;
  }

  private async resolveAgencyForCrawlRun(
    crawlRunId: string | null | undefined,
  ): Promise<{ id?: string; name: string }> {
    if (!crawlRunId) {
      return { name: 'Unknown agency' };
    }

    const crawlRun = await this.prisma.crawlRun.findUnique({
      where: { id: crawlRunId },
      select: {
        source_agency_id: true,
        source_agency: { select: { name: true } },
      },
    });

    return {
      id: crawlRun?.source_agency_id,
      name: crawlRun?.source_agency?.name ?? 'Unknown agency',
    };
  }

  private async findCrawlRunForBatch(
    batchId: string,
    userIntegrationId: string,
  ) {
    const crawlRuns = await this.prisma.crawlRun.findMany({
      where: {
        metadata: { not: Prisma.DbNull },
      },
      orderBy: { created_at: 'desc' },
      take: 200,
    });

    return crawlRuns.find((run) => {
      const meta = run.metadata as Record<string, unknown> | null;
      return (
        meta?.ai_batch_id === batchId &&
        meta.user_integration_id === userIntegrationId
      );
    });
  }

  private headerValue(
    value: string | string[] | undefined,
  ): string | undefined {
    if (Array.isArray(value)) return value[0];
    return value;
  }

  private normalizeHeaders(
    headers: Record<string, string | string[] | undefined>,
  ): Record<string, string> {
    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
      const resolved = this.headerValue(value);
      if (resolved) normalized[key] = resolved;
    }
    return normalized;
  }
}
