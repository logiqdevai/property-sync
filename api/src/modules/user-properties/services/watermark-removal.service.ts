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
import {
  WatermarkRemovalJobData,
  WatermarkRemovalStepLog,
} from '../interfaces/watermark-removal-job.interface';
import {
  parseIntegrationPropertyImages,
  patchIntegrationPropertyImageSource,
  resolveIntegrationImageProcessUrl,
} from '../utils/integration-property-images.util';

function formatError(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }

  const parts = [error.message];
  const cause = (error as Error & { cause?: unknown }).cause;
  if (cause instanceof Error) {
    parts.push(`cause=${cause.message}`);
  } else if (cause !== undefined) {
    parts.push(`cause=${String(cause)}`);
  }

  return parts.join(' | ');
}

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
    steps: WatermarkRemovalStepLog[] = [],
  ): Promise<void> {
    const runStep = async <T>(
      step: string,
      fn: () => Promise<T>,
      detail?: string,
    ): Promise<T> => {
      const started = Date.now();
      const entry: WatermarkRemovalStepLog = { step, status: 'started', detail };
      steps.push(entry);
      this.logger.log(
        `[job=${data.job_log_id} image=${imageId}] ${step} started${detail ? ` (${detail})` : ''}`,
      );
      try {
        const result = await fn();
        entry.status = 'ok';
        entry.duration_ms = Date.now() - started;
        this.logger.log(
          `[job=${data.job_log_id} image=${imageId}] ${step} ok ${entry.duration_ms}ms${detail ? ` (${detail})` : ''}`,
        );
        return result;
      } catch (error) {
        entry.status = 'failed';
        entry.duration_ms = Date.now() - started;
        entry.error = formatError(error);
        this.logger.error(
          `[job=${data.job_log_id} image=${imageId}] ${step} failed ${entry.duration_ms}ms: ${entry.error}`,
          error instanceof Error ? error.stack : undefined,
        );
        throw error;
      }
    };

    const integrationProperty = await runStep(
      'load_integration_property',
      () =>
        this.prisma.integrationProperty.findFirst({
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
        }),
      `user_property_id=${data.user_property_id}`,
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

    steps.push({
      step: 'resolve_image',
      status: image && processUrl ? 'ok' : 'failed',
      detail: `images=${images.length} image_id=${numericId} has_url=${Boolean(image?.url)} has_source=${Boolean(image?.source_image)} process_url=${processUrl ?? 'none'}`,
      error:
        !image || !processUrl
          ? 'Image not found or missing source_image/url'
          : undefined,
    });

    if (!image || !processUrl) {
      throw new BadRequestException(
        'Image not found or missing source_image/url',
      );
    }

    await this.processEstateWebImage({
      jobLogId: data.job_log_id,
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
      steps,
      runStep,
    });
  }

  private async processEstateWebImage(params: {
    jobLogId: string;
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
    steps: WatermarkRemovalStepLog[];
    runStep: <T>(
      step: string,
      fn: () => Promise<T>,
      detail?: string,
    ) => Promise<T>;
  }): Promise<void> {
    const sourceBuffer = await params.runStep(
      'download_source_image',
      async () => {
        const buffer = await this.downloadImage(params.processUrl);
        if (!buffer?.length) {
          throw new BadRequestException('Failed to download source image');
        }
        return buffer;
      },
      `url=${params.processUrl}`,
    );

    params.steps[params.steps.length - 1].detail =
      `url=${params.processUrl} bytes=${sourceBuffer.length}`;

    const dewatermarkResult = await params.runStep(
      'dewatermark',
      () =>
        this.dewatermarkOrchestrator.eraseWatermarkForUser(params.userId, {
          originalPreviewImage: sourceBuffer,
        }),
      `user_id=${params.userId} input_bytes=${sourceBuffer.length}`,
    );

    const processedBuffer = Buffer.from(
      dewatermarkResult.imageBase64,
      'base64',
    );
    if (!processedBuffer.length) {
      throw new BadRequestException('Dewatermark returned empty image');
    }

    params.steps.push({
      step: 'dewatermark_decode',
      status: 'ok',
      detail: `output_bytes=${processedBuffer.length}`,
    });

    const zindex =
      Math.max(
        1,
        params.images.findIndex((item) => item.id === params.imageId) + 1,
      ) || 1;

    const filename = `watermark-removed-${params.userPropertyId}-${params.imageId}-${Date.now()}.jpg`;
    const gcsUpload = await params.runStep(
      'gcs_upload',
      () =>
        this.gcsService.uploadImageFromBuffer(
          processedBuffer,
          filename,
          'image/jpeg',
          GcsFolders.propertyImages,
        ),
      `filename=${filename} bytes=${processedBuffer.length}`,
    );
    const gcsUrl = gcsUpload.url;
    params.steps[params.steps.length - 1].detail =
      `filename=${filename} url=${gcsUrl}`;

    await params.runStep(
      'estateweb_replace_image',
      () =>
        this.estateWebCmsSyncAdapter.replaceImageAfterWatermark({
          userIntegrationId: params.userIntegrationId,
          userPropertyId: params.userPropertyId,
          crmPropertyId: params.crmPropertyId,
          oldImageId: params.imageId,
          processedBuffer,
          gcsUrl,
          oldImage: params.image,
          zindex,
          deleteOldImage: params.replaceCrmImages,
          stepLogs: params.steps,
        }),
      `crm_property_id=${params.crmPropertyId} old_image_id=${params.imageId} zindex=${zindex} delete_old=${params.replaceCrmImages} has_gcs=${Boolean(gcsUrl)} bytes=${processedBuffer.length}`,
    );

    if (!params.replaceCrmImages) {
      await params.runStep(
        'patch_source_image',
        () =>
          this.patchIntegrationPropertyImageSource({
            integrationPropertyId: params.integrationPropertyId,
            integrationType: params.integrationType,
            imageId: params.imageId,
            sourceImage: gcsUrl,
          }),
        `source_image=${gcsUrl}`,
      );
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

  private async downloadImage(url: string): Promise<Buffer | null> {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        this.logger.warn(
          `Source image download HTTP ${response.status} for ${url}`,
        );
        return null;
      }
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      this.logger.warn(
        `Source image download failed for ${url}: ${formatError(error)}`,
      );
      return null;
    }
  }
}
