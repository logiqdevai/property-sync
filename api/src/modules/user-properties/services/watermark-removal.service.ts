import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { DewatermarkOrchestratorService } from '@/integrations/dewatermark/services/dewatermark-orchestrator.service';
import { EstateWebPropertyImage } from '@/integrations/estateweb/interfaces/estateweb-property.interface';
import { EstateWebCmsSyncAdapter } from '@/integrations/estateweb/services/estateweb-cms-sync-adapter.service';
import { GcsService } from '@/integrations/storage/gcs/services/gcs.service';
import { GcsFolders } from '@/shared/config/gcs-folders';
import { Prisma } from 'generated/prisma';
import { WatermarkRemovalJobData } from '../interfaces/watermark-removal-job.interface';

@Injectable()
export class WatermarkRemovalService {
  private readonly logger = new Logger(WatermarkRemovalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dewatermarkOrchestrator: DewatermarkOrchestratorService,
    private readonly gcsService: GcsService,
    private readonly estateWebCmsSyncAdapter: EstateWebCmsSyncAdapter,
  ) {}

  async processSingleImage(
    data: WatermarkRemovalJobData,
    imageId: string,
  ): Promise<void> {
    const integrationProperty = await this.prisma.integrationProperty.findFirst(
      {
        where: { user_property_id: data.user_property_id },
        orderBy: { updated_at: 'desc' },
        select: { id: true, images: true },
      },
    );

    if (!integrationProperty) {
      throw new NotFoundException('Integration property not found');
    }

    const images = this.parseIntegrationImages(integrationProperty.images);
    const numericId = Number(imageId);
    const image = images.find((item) => item.id === numericId);

    if (!image?.source_image) {
      throw new BadRequestException(
        'Image not found or missing source_image',
      );
    }

    await this.processImage({
      userId: data.user_id,
      userIntegrationId: data.user_integration_id,
      userPropertyId: data.user_property_id,
      crmPropertyId: data.crm_property_id,
      integrationPropertyId: integrationProperty.id,
      imageId: numericId,
      image,
      replaceCrmImages: data.replace_crm_images,
      images,
    });
  }

  private async processImage(params: {
    userId: string;
    userIntegrationId: string;
    userPropertyId: string;
    crmPropertyId: string;
    integrationPropertyId: string;
    imageId: number;
    image: EstateWebPropertyImage;
    replaceCrmImages: boolean;
    images: EstateWebPropertyImage[];
  }): Promise<void> {
    const sourceBuffer = await this.downloadImage(params.image.source_image!);
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
        imageId: params.imageId,
        sourceImage: gcsUpload.url,
      });
    }
  }

  private async patchIntegrationPropertyImageSource(params: {
    integrationPropertyId: string;
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

    const images = this.parseIntegrationImages(integrationProperty.images);
    const index = images.findIndex((item) => item.id === params.imageId);
    if (index < 0) {
      throw new NotFoundException('CRM image not found in integration property');
    }

    images[index] = {
      ...images[index],
      source_image: params.sourceImage,
    };

    await this.prisma.integrationProperty.update({
      where: { id: params.integrationPropertyId },
      data: {
        images: images as unknown as Prisma.InputJsonValue,
      },
    });
  }

  parseIntegrationImages(imagesJson: unknown): EstateWebPropertyImage[] {
    if (!Array.isArray(imagesJson)) return [];

    const images: EstateWebPropertyImage[] = [];
    for (const item of imagesJson) {
      if (
        item == null ||
        typeof item !== 'object' ||
        typeof (item as { id?: unknown }).id !== 'number' ||
        typeof (item as { path?: unknown }).path !== 'string' ||
        typeof (item as { filename?: unknown }).filename !== 'string'
      ) {
        continue;
      }

      const image = item as EstateWebPropertyImage;
      images.push({
        id: image.id,
        path: image.path,
        filename: image.filename,
        show_on_site: Boolean(image.show_on_site),
        show_on_groups: Boolean(image.show_on_groups),
        show_on_foreign_agents: Boolean(image.show_on_foreign_agents),
        url: typeof image.url === 'string' ? image.url : undefined,
        source_image:
          typeof image.source_image === 'string' && image.source_image.length > 0
            ? image.source_image
            : undefined,
      });
    }

    return images;
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
