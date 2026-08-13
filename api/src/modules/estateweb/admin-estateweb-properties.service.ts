import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { IntegrationType } from 'generated/prisma';
import { EstateWebConfig } from '@/integrations/estateweb/config/estateweb.config';
import {
  EstateWebCreatePropertyPayload,
  EstateWebPropertyFieldValue,
  EstateWebPropertyListItem,
  EstateWebPropertyListQuery,
  EstateWebPropertyResponse,
  EstateWebPropertySite,
  EstateWebUpdatePropertyPayload,
  EstateWebUploadImagePayload,
} from '@/integrations/estateweb/interfaces/estateweb-property.interface';
import { EstateWebSession } from '@/integrations/estateweb/interfaces/estateweb-session.interface';
import { EstateWebFieldType } from '@/integrations/estateweb/constants/estateweb-enums.constants';
import { getEstateWebInitField } from '@/integrations/estateweb/utils/estateweb-init-lookup.util';
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
import { EstateWebDuplicatePropertyGroup } from './interfaces/estateweb-duplicate-property.interface';
import { EstateWebBulkSitesUpdateResult } from './interfaces/estateweb-resolved-code-property.interface';

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

  // Finds EstateWeb listings sharing the same `code` -- the same field the reconciliation
  // service (EstateWebPropertyReconciliationService.normalizeCode) matches on. Multiple
  // listings with an identical code are the same underlying property pushed to EstateWeb more
  // than once (e.g. via the CMS sync duplicate-enqueue race), not a legitimate EstateWeb state.
  async findDuplicateProperties(
    userIntegrationId: string,
  ): Promise<EstateWebDuplicatePropertyGroup[]> {
    const { list } =
      await this.estateWebPropertyService.listAllPropertiesForIntegration(
        userIntegrationId,
      );

    const byCode = new Map<string, EstateWebPropertyListItem[]>();
    for (const listing of list) {
      const code = listing.code?.trim().toLowerCase();
      if (!code) continue;
      const group = byCode.get(code) ?? [];
      group.push(listing);
      byCode.set(code, group);
    }

    return [...byCode.values()]
      .filter((listings) => listings.length > 1)
      .map((listings) => {
        const sorted = [...listings].sort((a, b) => a.id - b.id);
        return {
          code: sorted[0].code ?? '',
          count: sorted.length,
          listings: sorted.map((listing) => ({
            id: listing.id,
            address: listing.address ?? null,
            price: listing.price ?? null,
            created_at: listing.created_at ?? null,
          })),
        };
      })
      .sort((a, b) => b.count - a.count);
  }

  // Applies the SAME site selection to every EstateWeb property matching the given `code`
  // values -- used to manage orphaned duplicate listings (see docs on the cretahouses
  // duplicate-property incident) that exist on EstateWeb but were never linked back into our
  // own database, so there's no local UserProperty to key off of. Resolution happens here,
  // internally, as part of the same request -- there is no separate lookup step, since
  // EstateWeb's list endpoint doesn't return usable `sites` data to preview beforehand.
  //
  // Each code is updated independently (partial failures/not-found codes don't block the
  // rest); every update round-trips the FULL current record (see toFullUpdatePayload) because
  // EstateWeb's PATCH endpoint resets price/description/ads/metadata/sites to defaults when
  // they're omitted from the payload -- confirmed by a live incident where a minimal {code}
  // PATCH wiped a listing.
  async bulkUpdatePropertySitesByCodes(
    userIntegrationId: string,
    codes: string[],
    sites: EstateWebPropertySite[],
  ): Promise<EstateWebBulkSitesUpdateResult[]> {
    const requested = [...new Set(codes.map((code) => code.trim()).filter(Boolean))];

    const { list } =
      await this.estateWebPropertyService.listAllPropertiesForIntegration(
        userIntegrationId,
      );

    const byCode = new Map<string, number>();
    for (const listing of list) {
      const code = listing.code?.trim();
      if (code && !byCode.has(code)) byCode.set(code, listing.id);
    }

    const results: EstateWebBulkSitesUpdateResult[] = [];

    for (const code of requested) {
      const propertyId = byCode.get(code);
      if (propertyId === undefined) {
        results.push({
          code,
          propertyId: null,
          success: false,
          error: 'No EstateWeb property has this code',
        });
        continue;
      }

      try {
        const current = await this.estateWebPropertyService.getProperty(
          userIntegrationId,
          propertyId,
        );
        const payload = this.toFullUpdatePayload(current, sites);
        await this.estateWebPropertyService.updateProperty(
          userIntegrationId,
          propertyId,
          payload,
        );
        results.push({ code, propertyId, success: true });
      } catch (error) {
        results.push({
          code,
          propertyId,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return results;
  }

  private toFullUpdatePayload(
    current: EstateWebPropertyResponse,
    sites: EstateWebPropertySite[],
  ): EstateWebUpdatePropertyPayload {
    return {
      id: current.id,
      type_id: current.type_id,
      scope_id: current.scope_id,
      location_id: current.location_id,
      client_id: current.client_id ?? undefined,
      coop_id: current.coop_id ?? undefined,
      to_client_id: current.to_client_id ?? undefined,
      code: current.code ?? '',
      address: current.address ?? '',
      zip: current.zip ?? '',
      price_start: current.price_start ?? 0,
      price: current.price ?? 0,
      price_final: current.price_final ?? 0,
      price_web: current.price_web ?? 0,
      sqm: current.sqm ?? 0,
      distance_airport: current.distance_airport ?? '',
      distance_port: current.distance_port ?? '',
      distance_beach: current.distance_beach ?? '',
      description: current.description ?? '',
      status_id: current.status_id,
      is_offer: current.is_offer ? 1 : 0,
      is_exclusive_order: current.is_exclusive_order ? 1 : 0,
      video_url: current.video_url ?? '',
      show_video_on_site: current.show_video_on_site ? 1 : 0,
      lat_lng: current.lat_lng ?? '',
      show_map_on_site: current.show_map_on_site ? 1 : 0,
      metadata: JSON.stringify(current.metadata ?? {}),
      client_contacted_at: current.client_contacted_at ?? '',
      expires_at: current.expires_at ?? '',
      fields: (current.fields ?? [])
        .map((field) => {
          const definition = getEstateWebInitField(field.field_id);
          if (!definition) return null;
          if (definition.type_id === EstateWebFieldType.SELECT) {
            return { id: field.field_id, value: Number(field.value) };
          }
          return { id: field.field_id, value: field.value };
        })
        .filter((field): field is EstateWebPropertyFieldValue => field !== null),
      sites: sites.map((site) => ({ ...site, selected: true })),
      gateways: [],
      ads: current.ads ?? [],
      foreign_agents: current.foreign_agents ?? [],
      notes: [],
      price_negotiable: current.price_negotiable ? 1 : 0,
    } as EstateWebUpdatePropertyPayload;
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

  deletePropertyNote(userIntegrationId: string, noteId: string) {
    return this.estateWebPropertyService.deletePropertyNote(
      userIntegrationId,
      noteId,
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
