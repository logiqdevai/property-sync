import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly propertyAiBatchService: PropertyAiBatchService,
    private readonly propertyNormalizationService: PropertyNormalizationService,
  ) {}

  async handleWebhook(
    rawBody: string,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<void> {
    const secret = this.configService.get<string>('OPENAI_WEBHOOK_SECRET');
    if (!secret) {
      this.logger.warn('OPENAI_WEBHOOK_SECRET not configured — rejecting webhook');
      throw new Error('Webhook secret not configured');
    }

    const webhookId = this.headerValue(headers['webhook-id']);
    if (webhookId && this.processedWebhookIds.has(webhookId)) {
      this.logger.log(`Duplicate webhook ${webhookId} — skipping`);
      return;
    }

    const existing = webhookId
      ? await this.prisma.jobLog.findFirst({
          where: { queue_name: 'openai-webhook', job_id: webhookId },
        })
      : null;

    if (existing) {
      this.logger.log(`Webhook ${webhookId} already processed`);
      return;
    }

    const client = new OpenAI({ apiKey: 'unused' });
    const event = (await client.webhooks.unwrap(
      rawBody,
      this.normalizeHeaders(headers),
      secret,
    )) as { type: string; data: { id: string } };

    if (webhookId) {
      this.processedWebhookIds.add(webhookId);
      await this.prisma.jobLog.create({
        data: {
          queue_name: 'openai-webhook',
          job_id: webhookId,
          job_name: event.type,
          status: JobStatus.COMPLETED,
          payload: { event_type: event.type, batch_id: event.data.id },
        },
      });
    }

    const batchId = event.data.id;
    const crawlRuns = await this.prisma.crawlRun.findMany({
      where: {
        metadata: { not: Prisma.DbNull },
      },
      orderBy: { created_at: 'desc' },
      take: 200,
    });

    const crawlRun = crawlRuns.find((run) => {
      const meta = run.metadata as Record<string, unknown> | null;
      return meta?.ai_batch_id === batchId;
    });

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
