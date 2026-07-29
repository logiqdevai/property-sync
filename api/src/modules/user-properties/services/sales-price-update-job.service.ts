import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { EstateWebCmsSyncAdapter } from '@/integrations/estateweb/services/estateweb-cms-sync-adapter.service';
import { EstateWebIntegrationResolverService } from '@/integrations/estateweb/services/estateweb-integration-resolver.service';
import { IntegrationType } from 'generated/prisma';
import {
  SalesPriceUpdateItemResult,
  SalesPriceUpdateJobData,
} from '../interfaces/sales-price-update-job.interface';

@Injectable()
export class SalesPriceUpdateJobService {
  private readonly logger = new Logger(SalesPriceUpdateJobService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly estateWebCmsSyncAdapter: EstateWebCmsSyncAdapter,
    private readonly estateWebIntegrationResolver: EstateWebIntegrationResolverService,
  ) {}

  async processProperty(
    data: SalesPriceUpdateJobData,
  ): Promise<SalesPriceUpdateItemResult> {
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

    if (!property.integration_property_id) {
      return {
        user_property_id: data.user_property_id,
        status: 'failed',
        error: 'Property is not linked to EstateWeb CMS',
      };
    }

    try {
      const userIntegrationId = await this.resolveEstateWebIntegrationId(
        property.user_id,
        property.canonical_property_id,
      );

      this.logger.log(
        `[processProperty] pushUpdate property=${data.user_property_id} integration=${userIntegrationId}`,
      );
      await this.estateWebCmsSyncAdapter.pushUpdate(
        userIntegrationId,
        property.integration_property_id,
        property,
      );

      return {
        user_property_id: data.user_property_id,
        status: 'updated',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        user_property_id: data.user_property_id,
        status: 'failed',
        error: message,
      };
    }
  }

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

    const integration = await this.prisma.userIntegration.findUnique({
      where: { id: resolved.userIntegrationId },
      select: {
        integration_target: { select: { integration_type: true } },
      },
    });

    if (
      !integration ||
      integration.integration_target.integration_type !==
        IntegrationType.ESTATEWEB
    ) {
      throw new Error('CMS push only supported for EstateWeb');
    }

    return resolved.userIntegrationId;
  }
}
