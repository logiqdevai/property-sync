import { Injectable } from '@nestjs/common';
import { EstateWebPropertyService } from '@/integrations/estateweb/services/estateweb-property.service';
import { buildEstateWebFullUpdatePayload } from '@/integrations/estateweb/utils/estateweb-full-update-payload.util';
import {
  EstateWebBulkSitesByCodesItemResult,
  EstateWebBulkSitesByCodesJobData,
} from '../interfaces/estateweb-bulk-sites-by-codes-job.interface';

@Injectable()
export class EstateWebBulkSitesByCodesJobService {
  constructor(
    private readonly estateWebPropertyService: EstateWebPropertyService,
  ) {}

  async processCode(
    data: EstateWebBulkSitesByCodesJobData,
  ): Promise<EstateWebBulkSitesByCodesItemResult> {
    try {
      const current = await this.estateWebPropertyService.getProperty(
        data.user_integration_id,
        data.property_id,
      );
      const payload = buildEstateWebFullUpdatePayload(current, data.sites);
      await this.estateWebPropertyService.updateProperty(
        data.user_integration_id,
        data.property_id,
        payload,
      );
      return {
        code: data.code,
        property_id: data.property_id,
        status: 'updated',
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
