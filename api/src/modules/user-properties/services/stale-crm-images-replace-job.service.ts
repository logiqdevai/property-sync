import { Injectable } from '@nestjs/common';
import { EstateWebCmsSyncAdapter } from '@/integrations/estateweb/services/estateweb-cms-sync-adapter.service';
import {
  StaleCrmImagesReplaceItemResult,
  StaleCrmImagesReplaceJobData,
} from '../interfaces/stale-crm-images-replace-job.interface';

@Injectable()
export class StaleCrmImagesReplaceJobService {
  constructor(private readonly estateWebCmsSyncAdapter: EstateWebCmsSyncAdapter) {}

  async processItem(
    data: StaleCrmImagesReplaceJobData,
  ): Promise<StaleCrmImagesReplaceItemResult> {
    try {
      const buffer = await this.estateWebCmsSyncAdapter.downloadImage(
        data.new_source_image,
      );
      if (!buffer?.length) {
        throw new Error(
          `Could not download the local image to upload: ${data.new_source_image}`,
        );
      }

      // Uploads the new (local, already-updated) image, then deletes the OLD
      // CRM image by its known numeric id -- a true in-place replace, not the
      // fuzzy cached-source_image-text match that createImages()/top-up logic
      // uses elsewhere. That matters here specifically: the whole reason
      // these candidates exist is that our cached source_image text is
      // stale, so a text-matching replace would fail to find the old image
      // and silently duplicate instead. Deleting by the id we already
      // resolved during calculate sidesteps that entirely.
      await this.estateWebCmsSyncAdapter.replaceImageAfterWatermark({
        userIntegrationId: data.user_integration_id,
        userPropertyId: data.user_property_id,
        crmPropertyId: data.crm_property_id,
        oldImageId: data.crm_image_id,
        processedBuffer: buffer,
        gcsUrl: data.new_source_image,
        oldImage: {
          id: data.crm_image_id,
          path: '',
          filename: '',
          show_on_site: data.show_on_site,
          show_on_groups: data.show_on_groups,
          show_on_foreign_agents: data.show_on_foreign_agents,
        },
        zindex: data.position + 1,
        deleteOldImage: true,
      });

      return {
        user_property_id: data.user_property_id,
        crm_image_id: data.crm_image_id,
        status: 'replaced',
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
