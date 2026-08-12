import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { AI_BATCH_COMPLETE_QUEUE } from '@/core/queues/queues.constants';
import { PropertyNormalizationService } from '@/modules/properties/services/property-normalization.service';

interface AiBatchCompleteJobData {
  batchId: string;
  crawlRunId: string;
}

@Processor(AI_BATCH_COMPLETE_QUEUE)
export class AiBatchCompleteProcessor extends WorkerHost {
  private readonly logger = new Logger(AiBatchCompleteProcessor.name);

  constructor(
    private readonly propertyNormalizationService: PropertyNormalizationService,
  ) {
    super();
  }

  async process(job: Job<AiBatchCompleteJobData>): Promise<void> {
    const { batchId, crawlRunId } = job.data;
    this.logger.log(
      `Processing batch completion ${batchId} for crawl ${crawlRunId}`,
    );

    try {
      // CMS sync enqueue (and notification on its failure) is now owned by
      // PropertyNormalizationService.syncAfterNormalization, called from
      // finalizeCrawlNormalizationSync inside completeBatchNormalization —
      // no longer a closure passed in from here.
      await this.propertyNormalizationService.completeBatchNormalization(
        crawlRunId,
        batchId,
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
