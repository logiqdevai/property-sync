import { Injectable, Logger } from '@nestjs/common';
import {
  DeleteIntegrationImagesItemResult,
  DeleteIntegrationImagesJobData,
} from '../interfaces/delete-integration-images-job.interface';
import { UserPropertiesService } from '../user-properties.service';

@Injectable()
export class DeleteIntegrationImagesJobService {
  private readonly logger = new Logger(DeleteIntegrationImagesJobService.name);

  constructor(
    private readonly userPropertiesService: UserPropertiesService,
  ) {}

  async processProperty(
    data: DeleteIntegrationImagesJobData,
  ): Promise<DeleteIntegrationImagesItemResult> {
    this.logger.log(
      `[processProperty] property=${data.user_property_id} job_log=${data.job_log_id}`,
    );

    try {
      const result =
        await this.userPropertiesService.deleteAllIntegrationImagesForUserProperty(
          data.user_id,
          data.user_property_id,
        );

      return {
        user_property_id: data.user_property_id,
        status: result.deleted_count > 0 ? 'deleted' : 'skipped',
        deleted_count: result.deleted_count,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        user_property_id: data.user_property_id,
        status: 'failed',
        error: message,
      };
    }
  }
}
