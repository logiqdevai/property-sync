import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { EstateWebCmsSyncAdapter } from '@/integrations/estateweb/services/estateweb-cms-sync-adapter.service';
import { EstateWebIntegrationResolverService } from '@/integrations/estateweb/services/estateweb-integration-resolver.service';
import { PropertyStatus } from 'generated/prisma';
import {
  FixEstateWebRemovalItemResult,
  FixEstateWebRemovalJobData,
} from '../interfaces/fix-estateweb-removal-job.interface';

@Injectable()
export class FixEstateWebRemovalJobService {
  private readonly logger = new Logger(FixEstateWebRemovalJobService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly estateWebCmsSyncAdapter: EstateWebCmsSyncAdapter,
    private readonly estateWebIntegrationResolver: EstateWebIntegrationResolverService,
  ) {}

  async processProperty(
    data: FixEstateWebRemovalJobData,
  ): Promise<FixEstateWebRemovalItemResult> {
    const property = await this.prisma.userProperty.findFirst({
      where: { id: data.user_property_id, user_id: data.user_id },
    });

    if (!property) {
      return {
        user_property_id: data.user_property_id,
        status: 'failed',
        error: 'Property not found',
      };
    }

    if (
      (property.status !== PropertyStatus.REMOVED &&
        property.status !== PropertyStatus.SOLD) ||
      !property.integration_property_id
    ) {
      return { user_property_id: data.user_property_id, status: 'skipped' };
    }

    try {
      const userIntegrationId = await this.resolveEstateWebIntegrationId(
        property.user_id,
        property.canonical_property_id,
      );
      await this.estateWebCmsSyncAdapter.pushRemove(
        userIntegrationId,
        property.integration_property_id,
        property,
      );
      return { user_property_id: data.user_property_id, status: 'fixed' };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `[processProperty] user_property=${data.user_property_id} failed: ${message}`,
      );
      return {
        user_property_id: data.user_property_id,
        status: 'failed',
        error: message,
      };
    }
  }

  // Same resolution shape as EstateWebSitesUpdateJobService.resolveEstateWebIntegrationId.
  private async resolveEstateWebIntegrationId(
    userId: string,
    canonicalPropertyId: string,
  ): Promise<string> {
    const link = await this.prisma.propertySourceLink.findFirst({
      where: { property_id: canonicalPropertyId },
      include: {
        source_property: { select: { source_agency_id: true } },
      },
    });
    const sourceAgencyId = link?.source_property.source_agency_id;
    if (!sourceAgencyId) {
      throw new Error(
        'Property has no source agency; cannot resolve linked EstateWeb CMS',
      );
    }

    const resolved =
      await this.estateWebIntegrationResolver.resolveForTrackedAgency(
        userId,
        sourceAgencyId,
      );
    return resolved.userIntegrationId;
  }
}
