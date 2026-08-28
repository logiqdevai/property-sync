import { Injectable, Logger } from '@nestjs/common';
import { CmsSyncOrchestratorService } from '@/modules/cms-sync/services/cms-sync-orchestrator.service';
import {
  PushToCmsItemResult,
  PushToCmsJobData,
} from '../interfaces/push-to-cms-job.interface';

@Injectable()
export class PushToCmsJobService {
  private readonly logger = new Logger(PushToCmsJobService.name);

  constructor(
    private readonly cmsSyncOrchestratorService: CmsSyncOrchestratorService,
  ) {}

  async processProperty(data: PushToCmsJobData): Promise<PushToCmsItemResult> {
    try {
      // One property per call so each runs as its own BullMQ job -- content
      // production (translations, AI titles) and CRM ownership verification
      // for this property no longer block the other properties in the batch,
      // or the original HTTP request that enqueued them.
      const result =
        await this.cmsSyncOrchestratorService.planAndEnqueueManualPropertyUpdate(
          data.user_id,
          [data.user_property_id],
        );

      const failedEntry = result.failed.find(
        (row) => row.user_property_id === data.user_property_id,
      );
      if (failedEntry) {
        return {
          user_property_id: data.user_property_id,
          status: 'failed',
          error: failedEntry.error,
        };
      }

      if (result.queued > 0) {
        return { user_property_id: data.user_property_id, status: 'queued' };
      }

      return {
        user_property_id: data.user_property_id,
        status: 'failed',
        error: 'CMS push produced no operations',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `[processProperty] property=${data.user_property_id} failed: ${message}`,
      );
      return {
        user_property_id: data.user_property_id,
        status: 'failed',
        error: message,
      };
    }
  }
}
