import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  CopyNormalizedImagesJobData,
  CopyNormalizedImagesJobResult,
} from '../interfaces/copy-normalized-images-job.interface';
import { UserPropertiesService } from '../user-properties.service';
import { WatermarkRemovalService } from './watermark-removal.service';

@Injectable()
export class CopyNormalizedImagesJobService {
  private readonly logger = new Logger(CopyNormalizedImagesJobService.name);

  constructor(
    private readonly userPropertiesService: UserPropertiesService,
    private readonly watermarkRemovalService: WatermarkRemovalService,
  ) {}

  // Runs the slow part of a "copy normalized images" request in the
  // background: optional per-image Dewatermark calls, then one CRM upload +
  // local persist for whatever survived. `onProgress` is called after every
  // image so the processor can persist incremental progress to the JobLog.
  async processJob(
    data: CopyNormalizedImagesJobData,
    onProgress: (result: CopyNormalizedImagesJobResult) => Promise<void>,
  ): Promise<CopyNormalizedImagesJobResult> {
    const result: CopyNormalizedImagesJobResult = {
      total: data.source_urls.length,
      processed: 0,
      copied: 0,
      failed: 0,
      items: [],
      logs: [
        `start job_log_id=${data.job_log_id} images=${data.source_urls.length} remove_watermark=${data.remove_watermark}`,
      ],
    };
    await onProgress(result);

    const finalImageUrls: string[] = [];

    for (let index = 0; index < data.source_urls.length; index++) {
      const sourceUrl = data.source_urls[index];

      try {
        let finalUrl = sourceUrl;
        if (data.remove_watermark) {
          const cleanedUrl =
            await this.watermarkRemovalService.removeWatermarkFromSourceUrl({
              userId: data.user_id,
              userPropertyId: data.user_property_id,
              sourceUrl,
              index,
            });
          if (!cleanedUrl) {
            throw new Error('Watermark removal failed for this image');
          }
          finalUrl = cleanedUrl;
        }

        finalImageUrls.push(finalUrl);
        result.items.push({ source_url: sourceUrl, status: 'copied' });
        result.copied += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        result.items.push({
          source_url: sourceUrl,
          status: 'failed',
          error: message,
        });
        result.failed += 1;
        result.logs?.push(`image=${index} failed: ${message}`);
      }

      result.processed += 1;
      await onProgress(result);
    }

    if (finalImageUrls.length === 0) {
      throw new BadRequestException(
        'Watermark removal failed for all selected images',
      );
    }

    result.logs?.push(
      `uploading ${finalImageUrls.length} image(s) to CMS and saving to tracked images`,
    );
    await onProgress(result);

    await this.userPropertiesService.finalizeCopyNormalizedImages({
      userPropertyId: data.user_property_id,
      finalImageUrls,
    });

    result.logs?.push('job completed');
    return result;
  }
}
