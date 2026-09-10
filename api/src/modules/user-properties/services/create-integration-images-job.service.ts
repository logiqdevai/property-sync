import { Injectable, Logger } from '@nestjs/common';
import {
  CreateIntegrationImagesItemResult,
  CreateIntegrationImagesJobData,
} from '../interfaces/create-integration-images-job.interface';
import { UserPropertiesService } from '../user-properties.service';

@Injectable()
export class CreateIntegrationImagesJobService {
  private readonly logger = new Logger(CreateIntegrationImagesJobService.name);

  constructor(
    private readonly userPropertiesService: UserPropertiesService,
  ) {}

  async processProperty(
    data: CreateIntegrationImagesJobData,
  ): Promise<CreateIntegrationImagesItemResult> {
    this.logger.log(
      `[processProperty] property=${data.user_property_id} job_log=${data.job_log_id}`,
    );

    try {
      const created =
        await this.userPropertiesService.createAllIntegrationImagesForUserProperty(
          data.user_id,
          data.user_property_id,
        );

      return {
        user_property_id: data.user_property_id,
        status: created ? 'created' : 'skipped',
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
