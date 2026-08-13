import { Injectable } from '@nestjs/common';
import { EstateWebPropertyService } from '@/integrations/estateweb/services/estateweb-property.service';
import {
  EstateWebBulkDeleteByCodesItemResult,
  EstateWebBulkDeleteByCodesJobData,
} from '../interfaces/estateweb-bulk-delete-by-codes-job.interface';

@Injectable()
export class EstateWebBulkDeleteByCodesJobService {
  constructor(
    private readonly estateWebPropertyService: EstateWebPropertyService,
  ) {}

  async processCode(
    data: EstateWebBulkDeleteByCodesJobData,
  ): Promise<EstateWebBulkDeleteByCodesItemResult> {
    try {
      await this.estateWebPropertyService.deleteProperty(
        data.user_integration_id,
        data.property_id,
      );
      return {
        code: data.code,
        property_id: data.property_id,
        status: 'deleted',
      };
    } catch (error) {
      return {
        code: data.code,
        property_id: data.property_id,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
