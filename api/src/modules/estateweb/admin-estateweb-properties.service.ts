import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { IntegrationType } from 'generated/prisma';
import { EstateWebConfig } from '@/integrations/estateweb/config/estateweb.config';
import {
  EstateWebCreatePropertyPayload,
  EstateWebPropertyListQuery,
  EstateWebUpdatePropertyPayload,
  EstateWebUploadImagePayload,
} from '@/integrations/estateweb/interfaces/estateweb-property.interface';
import { EstateWebSession } from '@/integrations/estateweb/interfaces/estateweb-session.interface';
import { EstateWebIntegrationResolverService } from '@/integrations/estateweb/services/estateweb-integration-resolver.service';
import { EstateWebClientsService } from '@/integrations/estateweb/services/estateweb-clients.service';
import { EstateWebPropertyService } from '@/integrations/estateweb/services/estateweb-property.service';
import { EstateWebSessionService } from '@/integrations/estateweb/services/estateweb-session.service';
import {
  isStoredSessionExpired,
  readEstateWebConfig,
} from '@/integrations/estateweb/utils/estateweb-session-config.util';
import { SetEstateWebSessionDto } from './dto/admin-estateweb-session.dto';
import { AdminEstateWebPropertyListQueryType } from './dto/admin-estateweb-property-list-query.schema';

@Injectable()
export class AdminEstateWebPropertiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly estateWebConfig: EstateWebConfig,
    private readonly estateWebPropertyService: EstateWebPropertyService,
    private readonly estateWebClientsService: EstateWebClientsService,
    private readonly estateWebSessionService: EstateWebSessionService,
    private readonly estateWebIntegrationResolverService: EstateWebIntegrationResolverService,
  ) {}

  async listIntegrations(userId?: string) {
    const integrations = await this.prisma.userIntegration.findMany({
      where: {
        ...(userId ? { user_id: userId } : {}),
        integration_target: {
          integration_type: IntegrationType.ESTATEWEB,
        },
      },
      include: {
        integration_target: {
          select: {
            id: true,
            integration_type: true,
            base_url: true,
          },
        },
        user: {
          select: {
            id: true,
            email: true,
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    return integrations.map((integration) => {
      const estatewebConfig = readEstateWebConfig(integration.config);
      const storedSession = estatewebConfig.session;
      const ttlMs = this.estateWebConfig.getSessionTtlMs();

      return {
        id: integration.id,
        userId: integration.user_id,
        userEmail: integration.user.email,
        email: integration.email,
        isActive: integration.is_active,
        isDefault: integration.is_default,
        baseUrl:
          integration.integration_target.base_url ??
          this.estateWebConfig.getDefaultBaseUrl(),
        session: storedSession
          ? {
              loggedInAt: storedSession.loggedInAt,
              hasToken: Boolean(storedSession.token),
              expired: isStoredSessionExpired(storedSession, ttlMs),
            }
          : null,
        createdAt: integration.created_at,
        updatedAt: integration.updated_at,
      };
    });
  }

  getSessionStatus(userIntegrationId: string) {
    return this.estateWebIntegrationResolverService
      .resolveByUserIntegrationId(userIntegrationId)
      .then(async (integration) => {
        const row = await this.prisma.userIntegration.findUnique({
          where: { id: userIntegrationId },
          select: { config: true },
        });

        const estatewebConfig = readEstateWebConfig(row?.config);
        const storedSession = estatewebConfig.session;
        const ttlMs = this.estateWebConfig.getSessionTtlMs();

        return {
          userIntegrationId: integration.userIntegrationId,
          isActive: integration.isActive,
          baseUrl: integration.baseUrl,
          session: storedSession
            ? {
                loggedInAt: storedSession.loggedInAt,
                hasToken: Boolean(storedSession.token),
                hasEstateSession: Boolean(storedSession.estateSession),
                expired: isStoredSessionExpired(storedSession, ttlMs),
              }
            : null,
        };
      });
  }

  async setSession(userIntegrationId: string, dto: SetEstateWebSessionDto) {
    const integration =
      await this.estateWebIntegrationResolverService.resolveByUserIntegrationId(
        userIntegrationId,
      );

    const session: EstateWebSession = {
      baseUrl: this.estateWebConfig.normalizeBaseUrl(
        dto.base_url ?? integration.baseUrl,
      ),
      estateSession: dto.estate_session.trim(),
      token: dto.token.trim(),
      csrf: dto.csrf?.trim() ?? null,
      loggedInAt: new Date().toISOString(),
    };

    await this.estateWebSessionService.persistSession(
      userIntegrationId,
      session,
    );

    return {
      ok: true,
      userIntegrationId,
      baseUrl: session.baseUrl,
      hasToken: Boolean(session.token),
      loggedInAt: session.loggedInAt,
    };
  }

  async invalidateSession(userIntegrationId: string) {
    await this.estateWebIntegrationResolverService.resolveByUserIntegrationId(
      userIntegrationId,
    );
    await this.estateWebSessionService.invalidateSession(userIntegrationId);
    return { ok: true, userIntegrationId };
  }

  testConnection(userIntegrationId: string) {
    return this.estateWebIntegrationResolverService.testConnection(
      userIntegrationId,
    );
  }

  listProperties(
    userIntegrationId: string,
    query: AdminEstateWebPropertyListQueryType,
  ) {
    return this.estateWebPropertyService.listProperties(
      userIntegrationId,
      query as EstateWebPropertyListQuery,
    );
  }

  getProperty(userIntegrationId: string, propertyId: string) {
    return this.estateWebPropertyService.getProperty(
      userIntegrationId,
      propertyId,
    );
  }

  getClient(userIntegrationId: string, clientId: string) {
    return this.estateWebClientsService.getClient(
      userIntegrationId,
      clientId,
    );
  }

  createProperty(
    userIntegrationId: string,
    payload: EstateWebCreatePropertyPayload,
  ) {
    return this.estateWebPropertyService.createProperty(
      userIntegrationId,
      payload,
    );
  }

  updateProperty(
    userIntegrationId: string,
    propertyId: string,
    payload: EstateWebUpdatePropertyPayload,
  ) {
    return this.estateWebPropertyService.updateProperty(
      userIntegrationId,
      propertyId,
      payload,
    );
  }

  createPropertyNote(
    userIntegrationId: string,
    propertyId: string,
    note: string,
  ) {
    return this.estateWebPropertyService.createPropertyNote(
      userIntegrationId,
      propertyId,
      { note },
    );
  }

  uploadPropertyImage(
    userIntegrationId: string,
    propertyId: string,
    image: Buffer,
    payload: EstateWebUploadImagePayload,
    mimeType?: string,
  ) {
    return this.estateWebPropertyService.uploadPropertyImage(
      userIntegrationId,
      propertyId,
      image,
      payload,
      mimeType,
    );
  }

  deletePropertyImage(userIntegrationId: string, imageId: string) {
    return this.estateWebPropertyService.deletePropertyImage(
      userIntegrationId,
      imageId,
    );
  }

  getInitFields() {
    return this.estateWebPropertyService.getInitFields();
  }

  getInitPropertyTypes() {
    return this.estateWebPropertyService.getInitPropertyTypes();
  }

  getLocationCatalog() {
    return this.estateWebPropertyService.getLocationCatalog();
  }

  getFloorCatalog() {
    return this.estateWebPropertyService.getFloorCatalog();
  }

  getEnergyClassCatalog() {
    return this.estateWebPropertyService.getEnergyClassCatalog();
  }

  getRoadTypeCatalog() {
    return this.estateWebPropertyService.getRoadTypeCatalog();
  }

  getFeaturesCatalog() {
    return this.estateWebPropertyService.getFeaturesCatalog();
  }

  getListingTypeCatalog() {
    return this.estateWebPropertyService.getListingTypeCatalog();
  }

  getPropertyTypeCatalog() {
    return this.estateWebPropertyService.getPropertyTypeCatalog();
  }

  getInitPropertyTypeCatalog() {
    return this.estateWebPropertyService.getInitPropertyTypeCatalog();
  }

  getAiFieldCatalog(propertyTypeId?: number) {
    return this.estateWebPropertyService.getAiFieldCatalog(propertyTypeId);
  }

  getAiPropertyTypeCatalog() {
    return this.estateWebPropertyService.getAiPropertyTypeCatalog();
  }
}
