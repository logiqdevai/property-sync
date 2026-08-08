import { Injectable, Logger } from '@nestjs/common';
import {
  MigrateIntegrationImagesItemResult,
  MigrateIntegrationImagesJobData,
} from '../interfaces/migrate-integration-images-job.interface';
import { UserPropertiesService } from '../user-properties.service';

@Injectable()
export class MigrateIntegrationImagesJobService {
  private readonly logger = new Logger(MigrateIntegrationImagesJobService.name);

  constructor(
    private readonly userPropertiesService: UserPropertiesService,
  ) {}

  async processProperty(
    data: MigrateIntegrationImagesJobData,
  ): Promise<MigrateIntegrationImagesItemResult> {
    this.logger.log(
      `[processProperty] property=${data.user_property_id} mode=${data.mode} job_log=${data.job_log_id}`,
    );

    try {
      await this.userPropertiesService.migrateIntegrationImagesForUserProperty(
        data.user_id,
        data.user_property_id,
        data.mode,
      );

      return {
        user_property_id: data.user_property_id,
        status: 'migrated',
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
