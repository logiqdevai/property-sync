import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { DewatermarkOrchestratorService } from '@/integrations/dewatermark/services/dewatermark-orchestrator.service';
import { EstateWebCmsSyncAdapter } from '@/integrations/estateweb/services/estateweb-cms-sync-adapter.service';
import { GcsService } from '@/integrations/storage/gcs/services/gcs.service';
import { GcsFolders } from '@/shared/config/gcs-folders';
import { IntegrationType, Prisma } from 'generated/prisma';
import { EstateWebIntegrationPropertyImage } from '../interfaces/integration-property-image.interface';
import { WatermarkRemovalJobData } from '../interfaces/watermark-removal-job.interface';
import {
  parseIntegrationPropertyImages,
  patchIntegrationPropertyImageSource,
  resolveIntegrationImageProcessUrl,
} from '../utils/integration-property-images.util';

@Injectable()
export class WatermarkRemovalService {
  private readonly logger = new Logger(WatermarkRemovalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dewatermarkOrchestrator: DewatermarkOrchestratorService,
    private readonly gcsService: GcsService,
    private readonly estateWebCmsSyncAdapter: EstateWebCmsSyncAdapter,
  ) {}

  async applyTrackerWatermarkPipeline(params: {
    userPropertyId: string;
    userId: string;
    removeWatermark: boolean;
    watermarkImageCount: number;
  }): Promise<void> {
    if (!params.removeWatermark) return;

    const userProperty = await this.prisma.userProperty.findUnique({
      where: { id: params.userPropertyId },
      select: { id: true, user_id: true, images: true },
    });
    if (!userProperty || userProperty.user_id !== params.userId) return;

    const sourceUrls = this.parseSourceImageUrls(userProperty.images);
    if (sourceUrls.length === 0) return;

    const dewatermarkIntegration =
      await this.dewatermarkOrchestrator.findActiveForUser(params.userId);
    if (!dewatermarkIntegration) {
      this.logger.warn(
        `Skipping watermark pipeline for user_property=${params.userPropertyId}: no active Dewatermark integration`,
      );
      return;
    }

    const limit = Math.max(
      0,
      Math.min(params.watermarkImageCount, sourceUrls.length),
    );
    if (limit === 0) return;

    const nextUrls = [...sourceUrls];
    let changed = false;

    for (let index = 0; index < limit; index++) {
      const sourceUrl = nextUrls[index];
      if (!sourceUrl || this.isPropertyImagesGcsUrl(sourceUrl)) continue;

      try {
        const sourceBuffer = await this.downloadImage(sourceUrl);
        if (!sourceBuffer?.length) {
          this.logger.warn(
            `Watermark pipeline: failed download for user_property=${params.userPropertyId} index=${index}`,
          );
          continue;
        }

        const dewatermarkResult =
          await this.dewatermarkOrchestrator.eraseWatermarkForUser(
            params.userId,
            { originalPreviewImage: sourceBuffer },
          );

        const processedBuffer = Buffer.from(
          dewatermarkResult.imageBase64,
          'base64',
        );
        if (!processedBuffer.length) {
          this.logger.warn(
            `Watermark pipeline: empty dewatermark result for user_property=${params.userPropertyId} index=${index}`,
          );
          continue;
        }

        const filename = `watermark-removed-${params.userPropertyId}-${index}-${Date.now()}.jpg`;
        const gcsUpload = await this.gcsService.uploadImageFromBuffer(
          processedBuffer,
          filename,
          'image/jpeg',
          GcsFolders.propertyImages,
        );

        nextUrls[index] = gcsUpload.url;
        changed = true;
      } catch (error) {
        this.logger.warn(
          `Watermark pipeline failed for user_property=${params.userPropertyId} index=${index}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    if (!changed) return;

    await this.prisma.userProperty.update({
      where: { id: params.userPropertyId },
      data: {
        images: nextUrls as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async processSingleImage(
    data: WatermarkRemovalJobData,
    imageId: string,
  ): Promise<void> {
    const integrationProperty = await this.prisma.integrationProperty.findFirst(
      {
        where: { user_property_id: data.user_property_id },
        orderBy: { updated_at: 'desc' },
        select: {
          id: true,
          images: true,
          user_integration_settings_id: true,
          user_integration_settings: {
            select: {
              integration_target: {
                select: { integration_type: true },
              },
            },
          },
        },
      },
    );

    if (!integrationProperty) {
      throw new NotFoundException('Integration property not found');
    }

    const integrationType =
      integrationProperty.user_integration_settings.integration_target
        .integration_type;

    if (integrationType !== IntegrationType.ESTATEWEB) {
      throw new BadRequestException(
        `Watermark removal is not supported for integration type ${integrationType}`,
      );
    }

    const images = this.parseIntegrationImages(
      integrationProperty.images,
      integrationType,
    );
    const numericId = Number(imageId);
    const image = images.find((item) => item.id === numericId);
    const processUrl = image
      ? resolveIntegrationImageProcessUrl(image)
      : undefined;

    if (!image || !processUrl) {
      throw new BadRequestException(
        'Image not found or missing source_image/url',
      );
    }

    await this.processEstateWebImage({
      userId: data.user_id,
      userIntegrationId: data.user_integration_id,
      userPropertyId: data.user_property_id,
      crmPropertyId: data.crm_property_id,
      integrationPropertyId: integrationProperty.id,
      integrationType,
      imageId: numericId,
      image,
      processUrl,
      replaceCrmImages: data.replace_crm_images,
      images,
    });
  }

  private async processEstateWebImage(params: {
    userId: string;
    userIntegrationId: string;
    userPropertyId: string;
    crmPropertyId: string;
    integrationPropertyId: string;
    integrationType: IntegrationType;
    imageId: number;
    image: EstateWebIntegrationPropertyImage;
    processUrl: string;
    replaceCrmImages: boolean;
    images: EstateWebIntegrationPropertyImage[];
  }): Promise<void> {
    const sourceBuffer = await this.downloadImage(params.processUrl);
    if (!sourceBuffer?.length) {
      throw new BadRequestException('Failed to download source image');
    }

    const dewatermarkResult =
      await this.dewatermarkOrchestrator.eraseWatermarkForUser(params.userId, {
        originalPreviewImage: sourceBuffer,
      });

    const processedBuffer = Buffer.from(
      dewatermarkResult.imageBase64,
      'base64',
    );
    if (!processedBuffer.length) {
      throw new BadRequestException('Dewatermark returned empty image');
    }

    const filename = `watermark-removed-${params.userPropertyId}-${params.imageId}-${Date.now()}.jpg`;
    const gcsUpload = await this.gcsService.uploadImageFromBuffer(
      processedBuffer,
      filename,
      'image/jpeg',
      GcsFolders.propertyImages,
    );

    const zindex =
      Math.max(
        1,
        params.images.findIndex((item) => item.id === params.imageId) + 1,
      ) || 1;

    await this.estateWebCmsSyncAdapter.replaceImageAfterWatermark({
      userIntegrationId: params.userIntegrationId,
      userPropertyId: params.userPropertyId,
      crmPropertyId: params.crmPropertyId,
      oldImageId: params.imageId,
      processedBuffer,
      gcsUrl: gcsUpload.url,
      oldImage: params.image,
      zindex,
      deleteOldImage: params.replaceCrmImages,
    });

    if (!params.replaceCrmImages) {
      await this.patchIntegrationPropertyImageSource({
        integrationPropertyId: params.integrationPropertyId,
        integrationType: params.integrationType,
        imageId: params.imageId,
        sourceImage: gcsUpload.url,
      });
    }
  }

  private async patchIntegrationPropertyImageSource(params: {
    integrationPropertyId: string;
    integrationType: IntegrationType;
    imageId: number;
    sourceImage: string;
  }): Promise<void> {
    const integrationProperty = await this.prisma.integrationProperty.findUnique(
      {
        where: { id: params.integrationPropertyId },
        select: { images: true },
      },
    );

    if (!integrationProperty) {
      throw new NotFoundException('Integration property not found');
    }

    const images = patchIntegrationPropertyImageSource(
      integrationProperty.images,
      params.integrationType,
      params.imageId,
      params.sourceImage,
    );
    if (!images) {
      throw new NotFoundException('CRM image not found in integration property');
    }

    await this.prisma.integrationProperty.update({
      where: { id: params.integrationPropertyId },
      data: {
        images: images as unknown as Prisma.InputJsonValue,
      },
    });
  }

  parseIntegrationImages(
    imagesJson: unknown,
    integrationType: IntegrationType = IntegrationType.ESTATEWEB,
  ): EstateWebIntegrationPropertyImage[] {
    return parseIntegrationPropertyImages(
      imagesJson,
      integrationType,
    ) as EstateWebIntegrationPropertyImage[];
  }

  private parseSourceImageUrls(imagesJson: unknown): string[] {
    if (!Array.isArray(imagesJson)) return [];
    return imagesJson.filter(
      (item): item is string => typeof item === 'string' && item.length > 0,
    );
  }

  private isPropertyImagesGcsUrl(url: string): boolean {
    return url.includes(`/${GcsFolders.propertyImages}/`);
  }

  private async downloadImage(url: string): Promise<Buffer | null> {
    try {
      const response = await fetch(url);
      if (!response.ok) return null;
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch {
      return null;
    }
  }
}
