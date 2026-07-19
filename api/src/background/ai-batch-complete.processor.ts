import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { AI_BATCH_COMPLETE_QUEUE } from '@/core/queues/queues.constants';
import { PropertyNormalizationService } from '@/modules/properties/services/property-normalization.service';
import { CmsSyncOrchestratorService } from '@/modules/cms-sync/services/cms-sync-orchestrator.service';
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
                change_type: a.change_type.toUpperCase() as
                  | 'CREATE'
                  | 'UPDATE'
                  | 'REMOVE',
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
            this.notificationsService.create({
              type: NotificationType.CMS_SYNC_FAILURE,
              severity: NotificationSeverity.CRITICAL,
              title: 'CMS sync enqueue failed',
              message: `Crawl ${crawlRunId}: CMS sync enqueue failed after AI batch. ${message}`,
              crawl_run_id: crawlRunId,
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
