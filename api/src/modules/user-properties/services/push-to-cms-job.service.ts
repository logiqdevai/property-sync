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
      // production (translations, AI titles) for this property no longer
      // blocks the other properties in the batch, or the original HTTP
      // request that enqueued them. skipOwnershipCheck: true because this is
      // a human-initiated bulk "Push to CRM" click -- trust the stored
      // integration_property_id instead of re-verifying it against
      // EstateWeb's stored code, so a since-corrected internal_id doesn't
      // make an already-linked listing look unowned and get duplicated.
      const result =
        await this.cmsSyncOrchestratorService.planAndEnqueueManualPropertyUpdate(
          data.user_id,
          [data.user_property_id],
          { skipOwnershipCheck: true },
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
