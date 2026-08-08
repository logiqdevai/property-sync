import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { AI_BATCH_COMPLETE_QUEUE } from '@/core/queues/queues.constants';
import { PropertyNormalizationService } from '@/modules/properties/services/property-normalization.service';
import { CmsSyncOrchestratorService } from '@/modules/cms-sync/services/cms-sync-orchestrator.service';
import { toCmsSyncOperationType } from '@/modules/cms-sync/interfaces/cms-sync-batch.interface';
import {
  NotificationSeverity,
  NotificationType,
} from 'generated/prisma';
import { NotificationsService } from '@/modules/notifications/notifications.service';

interface AiBatchCompleteJobData {
  batchId: string;
  crawlRunId: string;
}

@Processor(AI_BATCH_COMPLETE_QUEUE)
export class AiBatchCompleteProcessor extends WorkerHost {
  private readonly logger = new Logger(AiBatchCompleteProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly propertyNormalizationService: PropertyNormalizationService,
    private readonly cmsSyncOrchestratorService: CmsSyncOrchestratorService,
    private readonly notificationsService: NotificationsService,
  ) {
    super();
  }

  async process(job: Job<AiBatchCompleteJobData>): Promise<void> {
    const { batchId, crawlRunId } = job.data;
    this.logger.log(
      `Processing batch completion ${batchId} for crawl ${crawlRunId}`,
    );

    try {
      await this.propertyNormalizationService.completeBatchNormalization(
        crawlRunId,
        batchId,
        async (affected) => {
          try {
            await this.cmsSyncOrchestratorService.planAndEnqueueCrawlSync(
              crawlRunId,
              affected.map((a) => ({
                user_property_id: a.user_property_id,
                change_type: toCmsSyncOperationType(a.change_type),
                user_property: undefined,
              })),
            );
          } catch (syncError) {
            const message =
              syncError instanceof Error
                ? syncError.message
                : String(syncError);
            this.logger.error(
              `Crawl ${crawlRunId}: CMS sync enqueue failed after AI batch normalization: ${message}`,
            );
            const crawlRun = await this.prisma.crawlRun.findUnique({
              where: { id: crawlRunId },
              select: {
                source_agency_id: true,
                source_agency: { select: { name: true } },
              },
            });
            const agencyName =
              crawlRun?.source_agency?.name ?? 'Unknown agency';
            this.notificationsService.create({
              type: NotificationType.CMS_SYNC_FAILURE,
              severity: NotificationSeverity.CRITICAL,
              title: `CMS sync enqueue failed — ${agencyName}`,
              message: `Crawl ${crawlRunId} for ${agencyName}: CMS sync enqueue failed after AI batch. ${message}`,
              crawl_run_id: crawlRunId,
              source_agency_id: crawlRun?.source_agency_id,
            });
          }
        },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Batch completion failed: ${message}`);
      await this.propertyNormalizationService.markBatchFailed(
        crawlRunId,
        'failed',
        message,
      );
      throw error;
    }
  }
}
