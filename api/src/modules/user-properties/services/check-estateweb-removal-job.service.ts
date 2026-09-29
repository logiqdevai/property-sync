import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { EstateWebIntegrationResolverService } from '@/integrations/estateweb/services/estateweb-integration-resolver.service';
import { EstateWebPropertyService } from '@/integrations/estateweb/services/estateweb-property.service';
import { PropertyStatus } from 'generated/prisma';
import {
  CheckEstateWebRemovalItemResult,
  CheckEstateWebRemovalJobData,
} from '../interfaces/check-estateweb-removal-job.interface';

@Injectable()
export class CheckEstateWebRemovalJobService {
  private readonly logger = new Logger(CheckEstateWebRemovalJobService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly estateWebPropertyService: EstateWebPropertyService,
    private readonly estateWebIntegrationResolver: EstateWebIntegrationResolverService,
  ) {}

  async processProperty(
    data: CheckEstateWebRemovalJobData,
  ): Promise<CheckEstateWebRemovalItemResult> {
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
      const remote = await this.estateWebPropertyService.getProperty(
        userIntegrationId,
        property.integration_property_id,
      );
      // EstateWeb's GET response for `sites` never includes a `selected`
      // field -- every entry in the array IS a currently-published site, so
      // a non-empty array means it's still live.
      const stillLive = (remote.sites ?? []).length > 0;
      return {
        user_property_id: data.user_property_id,
        status: stillLive ? 'still_live' : 'unpublished',
      };
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
