import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { EstateWebClientsService } from '@/integrations/estateweb/services/estateweb-clients.service';
import { EstateWebIntegrationResolverService } from '@/integrations/estateweb/services/estateweb-integration-resolver.service';
import { EstateWebPropertyService } from '@/integrations/estateweb/services/estateweb-property.service';
import { IntegrationType } from 'generated/prisma';
import {
  CrmClientNotesSyncItemResult,
  CrmClientNotesSyncJobData,
} from '../interfaces/crm-client-notes-sync-job.interface';

@Injectable()
export class CrmClientNotesSyncJobService {
  private readonly logger = new Logger(CrmClientNotesSyncJobService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly estateWebPropertyService: EstateWebPropertyService,
    private readonly estateWebClientsService: EstateWebClientsService,
    private readonly estateWebIntegrationResolver: EstateWebIntegrationResolverService,
  ) {}

  async processProperty(
    data: CrmClientNotesSyncJobData,
  ): Promise<CrmClientNotesSyncItemResult> {
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
      const sourceAgencyId = await this.resolveSourceAgencyId(
        property.canonical_property_id,
      );

      if (!sourceAgencyId) {
        return {
          user_property_id: data.user_property_id,
          status: 'failed',
          error:
            'Property has no source agency; cannot resolve CRM client note',
        };
      }

      const userIntegrationId = await this.resolveEstateWebIntegrationId(
        property.user_id,
        sourceAgencyId,
      );

      const integrationClientId =
        await this.estateWebIntegrationResolver.resolveIntegrationClientIdForTrackedAgency(
          data.user_id,
          sourceAgencyId,
        );

      if (!integrationClientId) {
        return {
          user_property_id: data.user_property_id,
          status: 'failed',
          error: 'No CRM client ID on the tracked agency integration link',
        };
      }

      const propertyNote =
        await this.estateWebClientsService.resolvePropertyNoteFromClient(
          data.user_id,
          integrationClientId,
        );

      if (!propertyNote) {
        return {
          user_property_id: data.user_property_id,
          status: 'failed',
          error: `CRM client ${integrationClientId} has no last name`,
        };
      }

      this.logger.log(
        `[processProperty] createPropertyNote property=${data.user_property_id} integration=${userIntegrationId} client=${integrationClientId} cmsProperty=${property.integration_property_id}`,
      );

      await this.estateWebPropertyService.createPropertyNote(
        userIntegrationId,
        property.integration_property_id,
        { note: propertyNote },
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

  private async resolveSourceAgencyId(
    canonicalPropertyId: string,
  ): Promise<string | null> {
    const link = await this.prisma.propertySourceLink.findFirst({
      where: { property_id: canonicalPropertyId },
      include: {
        source_property: { select: { source_agency_id: true } },
      },
    });
    return link?.source_property.source_agency_id ?? null;
  }

  private async resolveEstateWebIntegrationId(
    userId: string,
    sourceAgencyId: string,
  ): Promise<string> {
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
