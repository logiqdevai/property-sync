import { Injectable } from '@nestjs/common';
import { EstateWebPropertyService } from '@/integrations/estateweb/services/estateweb-property.service';
import { EstateWebCmsSyncAdapter } from '@/integrations/estateweb/services/estateweb-cms-sync-adapter.service';
import {
  DuplicateWatermarkCleanupItemResult,
  DuplicateWatermarkCleanupJobData,
} from '../interfaces/duplicate-watermark-cleanup-job.interface';

@Injectable()
export class DuplicateWatermarkCleanupJobService {
  constructor(
    private readonly estateWebPropertyService: EstateWebPropertyService,
    private readonly estateWebCmsSyncAdapter: EstateWebCmsSyncAdapter,
  ) {}

  async processItem(
    data: DuplicateWatermarkCleanupJobData,
  ): Promise<DuplicateWatermarkCleanupItemResult> {
    try {
      await this.estateWebPropertyService.deletePropertyImage(
        data.user_integration_id,
        data.crm_image_id,
      );
      await this.estateWebCmsSyncAdapter.syncIntegrationPropertyImages({
        userIntegrationId: data.user_integration_id,
        userPropertyId: data.user_property_id,
        estateWebPropertyId: data.crm_property_id,
      });
      return {
        user_property_id: data.user_property_id,
        crm_image_id: data.crm_image_id,
        status: 'deleted',
      };
    } catch (error) {
      return {
        user_property_id: data.user_property_id,
        crm_image_id: data.crm_image_id,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
