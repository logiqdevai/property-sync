import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { IntegrationType, JobStatus } from 'generated/prisma';
import {
  ESTATEWEB_BULK_DELETE_BY_CODES_QUEUE,
  ESTATEWEB_BULK_SITES_BY_CODES_QUEUE,
} from '@/core/queues/queues.constants';
import { EstateWebConfig } from '@/integrations/estateweb/config/estateweb.config';
import {
  EstateWebCreatePropertyPayload,
  EstateWebPropertyListItem,
  EstateWebPropertyListQuery,
  EstateWebPropertySite,
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
import { EstateWebDuplicatePropertyGroup } from './interfaces/estateweb-duplicate-property.interface';
import {
  EstateWebBulkSitesByCodesJobData,
  EstateWebBulkSitesByCodesJobResult,
} from './interfaces/estateweb-bulk-sites-by-codes-job.interface';
import {
  EstateWebBulkDeleteByCodesJobData,
  EstateWebBulkDeleteByCodesJobResult,
} from './interfaces/estateweb-bulk-delete-by-codes-job.interface';

@Injectable()
export class AdminEstateWebPropertiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly estateWebConfig: EstateWebConfig,
    private readonly estateWebPropertyService: EstateWebPropertyService,
    private readonly estateWebClientsService: EstateWebClientsService,
    private readonly estateWebSessionService: EstateWebSessionService,
    private readonly estateWebIntegrationResolverService: EstateWebIntegrationResolverService,
    @InjectQueue(ESTATEWEB_BULK_SITES_BY_CODES_QUEUE)
    private readonly estateWebBulkSitesByCodesQueue: Queue<EstateWebBulkSitesByCodesJobData>,
    @InjectQueue(ESTATEWEB_BULK_DELETE_BY_CODES_QUEUE)
    private readonly estateWebBulkDeleteByCodesQueue: Queue<EstateWebBulkDeleteByCodesJobData>,
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

  // Resolves EstateWeb `code` values to property ids (one cheap catalog fetch, matching what
  // reconciliation already does) and enqueues one background job per matched code to apply the
  // site selection -- used to manage orphaned duplicate listings (see docs on the cretahouses
  // duplicate-property incident) that exist on EstateWeb but were never linked back into our
  // own database, so there's no local UserProperty to key off of. This runs as a BullMQ job
  // per code (mirroring UserPropertiesService.updateEstateWebSites) rather than inline in the
  // request, since a paste of hundreds of codes -- each requiring a live GET+PATCH round trip
  // to EstateWeb -- would far exceed any reasonable HTTP request timeout. Progress/results are
  // tracked on the JobLog row and readable via GET /admin/jobs/:id.
  async enqueueBulkUpdatePropertySitesByCodes(
    userIntegrationId: string,
    codes: string[],
    sites: EstateWebPropertySite[],
  ): Promise<{
    job_log_id: string;
    enqueued: number;
    failed: Array<{ code: string; error: string }>;
    message: string;
  }> {
    const requested = [...new Set(codes.map((code) => code.trim()).filter(Boolean))];
    if (requested.length === 0) {
      throw new BadRequestException('No codes provided');
    }

    const { list } =
      await this.estateWebPropertyService.listAllPropertiesForIntegration(
        userIntegrationId,
      );

    const byCode = new Map<string, number>();
    for (const listing of list) {
      const code = listing.code?.trim();
      if (code && !byCode.has(code)) byCode.set(code, listing.id);
    }

    const enqueueItems: Array<{ code: string; propertyId: number }> = [];
    const failed: Array<{ code: string; error: string }> = [];

    for (const code of requested) {
      const propertyId = byCode.get(code);
      if (propertyId === undefined) {
        failed.push({ code, error: 'No EstateWeb property has this code' });
        continue;
      }
      enqueueItems.push({ code, propertyId });
    }

    if (enqueueItems.length === 0) {
      const firstError = failed[0]?.error ?? 'No properties could be updated';
      throw new BadRequestException(
        failed.length === 1
          ? firstError
          : `None of the ${requested.length} codes matched an EstateWeb property.`,
      );
    }

    const selectedSites = sites.filter((site) => site.selected !== false);

    const initialResult: EstateWebBulkSitesByCodesJobResult = {
      total: enqueueItems.length,
      processed: 0,
      updated: 0,
      failed: failed.length,
      items: failed.map((row) => ({
        code: row.code,
        property_id: null,
        status: 'failed' as const,
        error: row.error,
      })),
      logs: [
        `enqueued integration=${userIntegrationId} codes=${enqueueItems.length} sites=${selectedSites.length}`,
      ],
    };

    const jobLog = await this.prisma.jobLog.create({
      data: {
        queue_name: ESTATEWEB_BULK_SITES_BY_CODES_QUEUE,
        job_name: 'update-estateweb-sites-by-code',
        status: JobStatus.WAITING,
        payload: {
          user_integration_id: userIntegrationId,
          codes: enqueueItems.map((item) => item.code),
          total: enqueueItems.length,
          sites: selectedSites,
        } as object,
        result: initialResult as object,
      },
    });

    await this.estateWebBulkSitesByCodesQueue.addBulk(
      enqueueItems.map(({ code, propertyId }) => {
        const jobData: EstateWebBulkSitesByCodesJobData = {
          job_log_id: jobLog.id,
          user_integration_id: userIntegrationId,
          code,
          property_id: propertyId,
          total: enqueueItems.length,
          sites: selectedSites,
        };
        return {
          name: 'update-estateweb-sites-by-code',
          data: jobData,
          opts: {
            jobId: `${jobLog.id}__${propertyId}`,
            attempts: 3,
            backoff: { type: 'exponential' as const, delay: 5000 },
            removeOnComplete: 100,
            removeOnFail: 200,
          },
        };
      }),
    );

    return {
      job_log_id: jobLog.id,
      enqueued: enqueueItems.length,
      failed,
      message:
        'EstateWeb sites update started in the background. Track progress in Job queue.',
    };
  }

  // Same resolve-by-code + enqueue-one-job-per-code shape as
  // enqueueBulkUpdatePropertySitesByCodes, but calls EstateWeb's delete endpoint instead of a
  // sites PATCH. Deletion is irreversible on EstateWeb's side, so the frontend
  // gates this behind an explicit confirmation before calling it.
  async enqueueBulkDeletePropertiesByCodes(
    userIntegrationId: string,
    codes: string[],
  ): Promise<{
    job_log_id: string;
    enqueued: number;
    failed: Array<{ code: string; error: string }>;
    message: string;
  }> {
    const requested = [...new Set(codes.map((code) => code.trim()).filter(Boolean))];
    if (requested.length === 0) {
      throw new BadRequestException('No codes provided');
    }

    const { list } =
      await this.estateWebPropertyService.listAllPropertiesForIntegration(
        userIntegrationId,
      );

    const byCode = new Map<string, number>();
    for (const listing of list) {
      const code = listing.code?.trim();
      if (code && !byCode.has(code)) byCode.set(code, listing.id);
    }

    const enqueueItems: Array<{ code: string; propertyId: number }> = [];
    const failed: Array<{ code: string; error: string }> = [];

    for (const code of requested) {
      const propertyId = byCode.get(code);
      if (propertyId === undefined) {
        failed.push({ code, error: 'No EstateWeb property has this code' });
        continue;
      }
      enqueueItems.push({ code, propertyId });
    }

    if (enqueueItems.length === 0) {
      const firstError = failed[0]?.error ?? 'No properties could be deleted';
      throw new BadRequestException(
        failed.length === 1
          ? firstError
          : `None of the ${requested.length} codes matched an EstateWeb property.`,
      );
    }

    const initialResult: EstateWebBulkDeleteByCodesJobResult = {
      total: enqueueItems.length,
      processed: 0,
      deleted: 0,
      failed: failed.length,
      items: failed.map((row) => ({
        code: row.code,
        property_id: null,
        status: 'failed' as const,
        error: row.error,
      })),
      logs: [
        `enqueued integration=${userIntegrationId} codes=${enqueueItems.length} action=delete`,
      ],
    };

    const jobLog = await this.prisma.jobLog.create({
      data: {
        queue_name: ESTATEWEB_BULK_DELETE_BY_CODES_QUEUE,
        job_name: 'delete-estateweb-properties-by-code',
        status: JobStatus.WAITING,
        payload: {
          user_integration_id: userIntegrationId,
          codes: enqueueItems.map((item) => item.code),
          total: enqueueItems.length,
        } as object,
        result: initialResult as object,
      },
    });

    await this.estateWebBulkDeleteByCodesQueue.addBulk(
      enqueueItems.map(({ code, propertyId }) => {
        const jobData: EstateWebBulkDeleteByCodesJobData = {
          job_log_id: jobLog.id,
          user_integration_id: userIntegrationId,
          code,
          property_id: propertyId,
          total: enqueueItems.length,
        };
        return {
          name: 'delete-estateweb-property-by-code',
          data: jobData,
          opts: {
            jobId: `${jobLog.id}__${propertyId}`,
            attempts: 3,
            backoff: { type: 'exponential' as const, delay: 5000 },
            removeOnComplete: 100,
            removeOnFail: 200,
          },
        };
      }),
    );

    return {
      job_log_id: jobLog.id,
      enqueued: enqueueItems.length,
      failed,
      message:
        'EstateWeb property deletion started in the background. Track progress in Job queue.',
    };
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
