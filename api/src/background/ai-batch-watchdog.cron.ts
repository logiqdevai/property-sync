import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { AiTitleBatchService } from '@/modules/content-publishing/services/ai-title-batch.service';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import {
  AiBatchRunStatus,
  IntegrationType,
  NotificationSeverity,
  NotificationType,
} from 'generated/prisma';

// OpenAI batches can legitimately take a while, so give the webhook a head start
// before polling behind its back.
const STALE_GRACE_MS = 10 * 60_000;

@Injectable()
export class AiBatchWatchdogCron {
  private readonly logger = new Logger(AiBatchWatchdogCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiTitleBatchService: AiTitleBatchService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // Fallback for when OpenAI's webhook is dropped/never delivered -- without this,
  // an AiBatchRun (and everything gated behind it: title production, CMS sync) can
  // stay stuck in SUBMITTED forever, since completeBatch()/markFailed() are otherwise
  // only ever reached from openai-webhooks.service.ts.
  @Cron(CronExpression.EVERY_10_MINUTES)
  async reconcileStaleTitleBatches(): Promise<void> {
    const staleBefore = new Date(Date.now() - STALE_GRACE_MS);

    const staleRuns = await this.prisma.aiBatchRun.findMany({
      where: {
        status: AiBatchRunStatus.SUBMITTED,
        created_at: { lt: staleBefore },
      },
    });

    for (const run of staleRuns) {
      const meta = (run.metadata ?? {}) as { user_id?: string | null };
      if (!meta.user_id) {
        this.logger.warn(
          `Stale AiBatchRun ${run.id} (batch ${run.openai_batch_id}) has no user_id in metadata; cannot resolve an API key to reconcile`,
        );
        continue;
      }

      const apiKey = await this.resolveOpenAiApiKey(meta.user_id);
      if (!apiKey) {
        this.logger.warn(
          `Stale AiBatchRun ${run.id} (batch ${run.openai_batch_id}): no active OpenAI integration for user ${meta.user_id}`,
        );
        continue;
      }

      try {
        await this.aiTitleBatchService.reconcileStaleBatch(
          run.openai_batch_id,
          apiKey,
        );

        const fresh = await this.prisma.aiBatchRun.findUnique({
          where: { id: run.id },
          select: { status: true, error_message: true },
        });
        if (fresh?.status === AiBatchRunStatus.FAILED) {
          await this.notifyBatchFailed(
            run.openai_batch_id,
            run.crawl_run_id,
            fresh.error_message ?? 'unknown error',
          );
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Failed to reconcile stale batch ${run.openai_batch_id}: ${message}`,
        );
      }
    }
  }

  private async notifyBatchFailed(
    batchId: string,
    crawlRunId: string | null,
    reason: string,
  ): Promise<void> {
    const crawlRun = crawlRunId
      ? await this.prisma.crawlRun.findUnique({
          where: { id: crawlRunId },
          select: {
            source_agency_id: true,
            source_agency: { select: { name: true } },
          },
        })
      : null;
    const agencyName = crawlRun?.source_agency?.name ?? 'Unknown agency';

    this.notificationsService.create({
      type: NotificationType.CMS_SYNC_FAILURE,
      severity: NotificationSeverity.CRITICAL,
      title: `Content title AI batch failed — ${agencyName}`,
      message: `OpenAI title batch ${batchId} for ${agencyName} did not complete (${reason}), detected by watchdog after webhook was never received. CMS push held for affected properties.`,
      crawl_run_id: crawlRunId ?? undefined,
      source_agency_id: crawlRun?.source_agency_id,
    });
  }

  private async resolveOpenAiApiKey(userId: string): Promise<string | null> {
    const integration = await this.prisma.userIntegration.findFirst({
      where: {
        user_id: userId,
        is_active: true,
        integration_target: { integration_type: IntegrationType.OPENAI },
      },
      orderBy: [{ is_default: 'desc' }, { created_at: 'asc' }],
    });
    return integration?.api_key_secret ?? null;
  }
}
