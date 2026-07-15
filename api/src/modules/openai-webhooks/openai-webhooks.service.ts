import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import OpenAI from 'openai';
import { PropertyAiBatchService } from '@/integrations/ai-batch/services/property-ai-batch.service';
import { PropertyNormalizationService } from '@/modules/properties/services/property-normalization.service';
import { JobStatus, Prisma } from 'generated/prisma';

@Injectable()
export class OpenAiWebhooksService {
  private readonly logger = new Logger(OpenAiWebhooksService.name);
  private readonly processedWebhookIds = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly propertyAiBatchService: PropertyAiBatchService,
    private readonly propertyNormalizationService: PropertyNormalizationService,
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

    const client = new OpenAI({ apiKey: 'unused' });
    const event = (await client.webhooks.unwrap(
      rawBody,
      this.normalizeHeaders(headers),
      secret,
    )) as { type: string; data: { id: string } };

    this.processedWebhookIds.add(dedupeKey);
    await this.prisma.jobLog.create({
      data: {
        queue_name: `openai-webhook:${userIntegrationId}`,
        job_id: webhookId ?? dedupeKey,
        job_name: event.type,
        status: JobStatus.COMPLETED,
        payload: {
          event_type: event.type,
          batch_id: event.data.id,
          user_integration_id: userIntegrationId,
        },
      },
    });

    const batchId = event.data.id;
    const crawlRun = await this.findCrawlRunForBatch(batchId, userIntegrationId);

    if (!crawlRun) {
      this.logger.warn(`No crawl run found for batch ${batchId}`);
      return;
    }

    if (event.type === 'batch.completed') {
      await this.propertyAiBatchService.enqueueBatchCompletion(batchId, crawlRun.id);
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

  private headerValue(value: string | string[] | undefined): string | undefined {
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
