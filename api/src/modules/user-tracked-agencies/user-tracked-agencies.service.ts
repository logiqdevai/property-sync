import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { UserIntegrationsService } from '@/modules/user-integrations/user-integrations.service';
import { CmsSyncOrchestratorService } from '@/modules/cms-sync/services/cms-sync-orchestrator.service';
import { AiDefaults } from '@/integrations/ai/utils/ai.config';
import { BrowseAgencyQueryType } from './dto/agency-query.schema';
import {
  BulkAgencyTrackingActions,
  BulkAgencyTrackingDto,
} from './dto/bulk-agency-tracking.dto';
import { TrackAgencyDto } from './dto/track-agency.dto';
import { IntegrationType, Prisma } from 'generated/prisma';
import { normalizeTextTruncatePieces } from './utils/apply-text-truncate-pieces.util';

const LINKABLE_INTEGRATION_TYPE = IntegrationType.ESTATEWEB;

@Injectable()
export class UserTrackedAgenciesService {
  private readonly logger = new Logger(UserTrackedAgenciesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly userIntegrationsService: UserIntegrationsService,
    private readonly cmsSyncOrchestratorService: CmsSyncOrchestratorService,
  ) {}

  async findAll(userId: string, query: BrowseAgencyQueryType) {
    const where: Prisma.SourceAgencyWhereInput = {
      is_visible: true,
      ...(query.search && {
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { city: { contains: query.search, mode: 'insensitive' } },
          { country: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
    };

    const unlimited = query.limit === 0;

    const [agencies, total, trackers] = await Promise.all([
      this.prisma.sourceAgency.findMany({
        where,
        ...(unlimited
          ? {}
          : {
              skip: (query.page - 1) * query.limit,
              take: query.limit,
            }),
        orderBy: { created_at: 'asc' },
      }),
      this.prisma.sourceAgency.count({ where }),
      this.prisma.userTrackedAgency.findMany({
        where: { user_id: userId },
        include: {
          integration_link: {
            select: {
              id: true,
              user_integration_id: true,
              integration_client_id: true,
              created_at: true,
            },
          },
        },
      }),
    ]);

    const trackerByAgencyId = new Map(
      trackers.map((tracker) => [tracker.source_agency_id, tracker]),
    );

    const totalPages = unlimited ? 1 : Math.ceil(total / query.limit);

    return {
      data: agencies.map((agency) => {
        const tracker = trackerByAgencyId.get(agency.id);
        return {
          ...agency,
          is_tracked: Boolean(tracker?.enabled),
          user_tracked_agency_id: tracker?.id ?? null,
          tracking_prefs: tracker?.enabled
            ? {
                track_new_listings: tracker.track_new_listings,
                track_removed_listings: tracker.track_removed_listings,
                track_updated_listings: tracker.track_updated_listings,
                auto_update_to_crm: tracker.auto_update_to_crm,
                cms_update_on_hash_only: tracker.cms_update_on_hash_only,
                enabled: tracker.enabled,
                user_integration_id:
                  tracker.integration_link?.user_integration_id ?? null,
                integration_client_id:
                  tracker.integration_link?.integration_client_id ?? null,
                concurrent_insertions: tracker.concurrent_insertions,
                insertion_interval_seconds: tracker.insertion_interval_seconds,
                max_properties: tracker.max_properties,
                text_truncate_pieces: tracker.text_truncate_pieces,
                remove_watermark: tracker.remove_watermark,
                watermark_image_count: tracker.watermark_image_count,
                watermark_manual_selection: tracker.watermark_manual_selection,
              }
            : undefined,
        };
      }),
      pagination: {
        page: unlimited ? 1 : query.page,
        limit: query.limit,
        total,
        total_pages: totalPages,
        has_next: unlimited ? false : query.page < totalPages,
        has_prev: unlimited ? false : query.page > 1,
      },
    };
  }

  async track(userId: string, agencyId: string, dto: TrackAgencyDto) {
    const agency = await this.requireTrackableAgency(agencyId);
    await this.assertUserHasDefaultAiIntegration(userId);

    return this.prisma.userTrackedAgency.upsert({
      where: {
        user_id_source_agency_id: {
          user_id: userId,
          source_agency_id: agency.id,
        },
      },
      create: {
        user_id: userId,
        source_agency_id: agency.id,
        enabled: true,
        track_new_listings: dto.track_new_listings ?? true,
        track_removed_listings: dto.track_removed_listings ?? true,
        track_updated_listings: dto.track_updated_listings ?? true,
        auto_update_to_crm: dto.auto_update_to_crm ?? true,
        cms_update_on_hash_only: dto.cms_update_on_hash_only ?? false,
        remove_watermark: dto.remove_watermark ?? false,
        watermark_image_count: dto.watermark_image_count ?? 1,
        watermark_manual_selection: dto.watermark_manual_selection ?? false,
      },
      update: {
        enabled: true,
        ...(dto.track_new_listings !== undefined && {
          track_new_listings: dto.track_new_listings,
        }),
        ...(dto.track_removed_listings !== undefined && {
          track_removed_listings: dto.track_removed_listings,
        }),
        ...(dto.track_updated_listings !== undefined && {
          track_updated_listings: dto.track_updated_listings,
        }),
        ...(dto.auto_update_to_crm !== undefined && {
          auto_update_to_crm: dto.auto_update_to_crm,
        }),
        ...(dto.cms_update_on_hash_only !== undefined && {
          cms_update_on_hash_only: dto.cms_update_on_hash_only,
        }),
        ...(dto.remove_watermark !== undefined && {
          remove_watermark: dto.remove_watermark,
        }),
        ...(dto.watermark_image_count !== undefined && {
          watermark_image_count: dto.watermark_image_count,
        }),
        ...(dto.watermark_manual_selection !== undefined && {
          watermark_manual_selection: dto.watermark_manual_selection,
        }),
      },
    });
  }

  async updateTracking(userId: string, agencyId: string, dto: TrackAgencyDto) {
    const existing = await this.prisma.userTrackedAgency.findUnique({
      where: {
        user_id_source_agency_id: {
          user_id: userId,
          source_agency_id: agencyId,
        },
      },
    });

    if (!existing) {
      throw new NotFoundException('You are not tracking this agency');
    }

    return this.prisma.userTrackedAgency.update({
      where: { id: existing.id },
      data: this.trackingUpdateData(dto),
    });
  }

  async bulkTracking(userId: string, dto: BulkAgencyTrackingDto) {
    const agencyIds = [...new Set(dto.agency_ids)];

    if (dto.action === BulkAgencyTrackingActions.UNTRACK) {
      const result = await this.prisma.userTrackedAgency.updateMany({
        where: {
          user_id: userId,
          source_agency_id: { in: agencyIds },
        },
        data: { enabled: false },
      });
      return { updated: result.count };
    }

    if (dto.action === BulkAgencyTrackingActions.UPDATE) {
      const data = this.trackingUpdateData(dto);
      if (Object.keys(data).length === 0) {
        throw new BadRequestException('No tracking fields to update');
      }

      const result = await this.prisma.userTrackedAgency.updateMany({
        where: {
          user_id: userId,
          source_agency_id: { in: agencyIds },
          enabled: true,
        },
        data,
      });
      return { updated: result.count };
    }

    await this.assertUserHasDefaultAiIntegration(userId);

    const agencies = await this.prisma.sourceAgency.findMany({
      where: {
        id: { in: agencyIds },
        is_visible: true,
        is_enabled: true,
      },
      select: { id: true },
    });
    const trackableIds = agencies.map((agency) => agency.id);

    if (trackableIds.length === 0) {
      return { updated: 0 };
    }

    const existingTrackers = await this.prisma.userTrackedAgency.findMany({
      where: {
        user_id: userId,
        source_agency_id: { in: trackableIds },
      },
      select: { id: true, source_agency_id: true },
    });
    const existingAgencyIds = new Set(
      existingTrackers.map((tracker) => tracker.source_agency_id),
    );
    const toCreate = trackableIds.filter((id) => !existingAgencyIds.has(id));
    const toReenable = existingTrackers.map((tracker) => tracker.id);

    await this.prisma.$transaction([
      ...(toCreate.length
        ? [
            this.prisma.userTrackedAgency.createMany({
              data: toCreate.map((agencyId) => ({
                user_id: userId,
                source_agency_id: agencyId,
                enabled: true,
                track_new_listings: dto.track_new_listings ?? true,
                track_removed_listings: dto.track_removed_listings ?? true,
                track_updated_listings: dto.track_updated_listings ?? true,
                auto_update_to_crm: dto.auto_update_to_crm ?? true,
                cms_update_on_hash_only: dto.cms_update_on_hash_only ?? false,
                remove_watermark: dto.remove_watermark ?? false,
                watermark_image_count: dto.watermark_image_count ?? 1,
                watermark_manual_selection:
                  dto.watermark_manual_selection ?? false,
              })),
            }),
          ]
        : []),
      ...(toReenable.length
        ? [
            this.prisma.userTrackedAgency.updateMany({
              where: { id: { in: toReenable } },
              data: {
                enabled: true,
                ...(dto.track_new_listings !== undefined && {
                  track_new_listings: dto.track_new_listings,
                }),
                ...(dto.track_removed_listings !== undefined && {
                  track_removed_listings: dto.track_removed_listings,
                }),
                ...(dto.track_updated_listings !== undefined && {
                  track_updated_listings: dto.track_updated_listings,
                }),
                ...(dto.auto_update_to_crm !== undefined && {
                  auto_update_to_crm: dto.auto_update_to_crm,
                }),
                ...(dto.cms_update_on_hash_only !== undefined && {
                  cms_update_on_hash_only: dto.cms_update_on_hash_only,
                }),
                ...(dto.remove_watermark !== undefined && {
                  remove_watermark: dto.remove_watermark,
                }),
                ...(dto.watermark_image_count !== undefined && {
                  watermark_image_count: dto.watermark_image_count,
                }),
                ...(dto.watermark_manual_selection !== undefined && {
                  watermark_manual_selection: dto.watermark_manual_selection,
                }),
              },
            }),
          ]
        : []),
    ]);

    return { updated: trackableIds.length };
  }

  async untrack(userId: string, agencyId: string): Promise<void> {
    const existing = await this.prisma.userTrackedAgency.findUnique({
      where: {
        user_id_source_agency_id: {
          user_id: userId,
          source_agency_id: agencyId,
        },
      },
    });

    if (!existing) {
      throw new NotFoundException('You are not tracking this agency');
    }

    await this.prisma.userTrackedAgency.update({
      where: { id: existing.id },
      data: { enabled: false },
    });
  }

  async linkIntegration(
    userId: string,
    agencyId: string,
    userIntegrationId: string,
    integrationClientId?: number | null,
  ) {
    const tracker = await this.requireOwnedTracker(userId, agencyId);
    const integration = await this.requireOwnedLinkableIntegration(
      userId,
      userIntegrationId,
    );

    const [existingTrackerLink, existingIntegrationLink] = await Promise.all([
      this.prisma.userTrackedAgencyIntegrationLink.findUnique({
        where: { user_tracked_agency_id: tracker.id },
      }),
      this.prisma.userTrackedAgencyIntegrationLink.findUnique({
        where: { user_integration_id: integration.id },
      }),
    ]);

    if (
      existingTrackerLink &&
      existingTrackerLink.user_integration_id !== integration.id
    ) {
      throw new ConflictException(
        'This tracked agency is already linked to another integration',
      );
    }

    if (
      existingIntegrationLink &&
      existingIntegrationLink.user_tracked_agency_id !== tracker.id
    ) {
      throw new ConflictException(
        'This integration is already linked to another tracked agency',
      );
    }

    if (existingTrackerLink) {
      if (integrationClientId === undefined) {
        return existingTrackerLink;
      }

      return this.prisma.userTrackedAgencyIntegrationLink.update({
        where: { id: existingTrackerLink.id },
        data: { integration_client_id: integrationClientId },
      });
    }

    const link = await this.prisma.userTrackedAgencyIntegrationLink.create({
      data: {
        user_tracked_agency_id: tracker.id,
        user_integration_id: integration.id,
        ...(integrationClientId !== undefined && {
          integration_client_id: integrationClientId,
        }),
      },
    });

    try {
      await this.cmsSyncOrchestratorService.planAndEnqueueBackfill(tracker.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Backfill failed after linking tracker ${tracker.id}: ${message}`,
      );
    }

    return link;
  }

  async unlinkIntegration(userId: string, agencyId: string) {
    const tracker = await this.requireOwnedTracker(userId, agencyId);

    const link = await this.prisma.userTrackedAgencyIntegrationLink.findUnique({
      where: { user_tracked_agency_id: tracker.id },
    });

    if (!link) {
      throw new NotFoundException('No integration linked to this agency');
    }

    await this.prisma.userTrackedAgencyIntegrationLink.delete({
      where: { id: link.id },
    });
  }

  async getIntegrationLink(userId: string, agencyId: string) {
    const tracker = await this.requireOwnedTracker(userId, agencyId);

    return this.prisma.userTrackedAgencyIntegrationLink.findUnique({
      where: { user_tracked_agency_id: tracker.id },
      include: {
        user_integration: {
          select: {
            id: true,
            is_active: true,
            email: true,
            username: true,
            created_at: true,
            integration_target: {
              select: {
                integration_type: true,
                base_url: true,
              },
            },
          },
        },
      },
    });
  }

  private trackingUpdateData(
    dto: TrackAgencyDto,
  ): Prisma.UserTrackedAgencyUpdateManyMutationInput {
    return {
      ...(dto.track_new_listings !== undefined && {
        track_new_listings: dto.track_new_listings,
      }),
      ...(dto.track_removed_listings !== undefined && {
        track_removed_listings: dto.track_removed_listings,
      }),
      ...(dto.track_updated_listings !== undefined && {
        track_updated_listings: dto.track_updated_listings,
      }),
      ...(dto.auto_update_to_crm !== undefined && {
        auto_update_to_crm: dto.auto_update_to_crm,
      }),
      ...(dto.cms_update_on_hash_only !== undefined && {
        cms_update_on_hash_only: dto.cms_update_on_hash_only,
      }),
      ...(dto.enabled !== undefined && { enabled: dto.enabled }),
      ...(dto.concurrent_insertions !== undefined && {
        concurrent_insertions: dto.concurrent_insertions,
      }),
      ...(dto.insertion_interval_seconds !== undefined && {
        insertion_interval_seconds: dto.insertion_interval_seconds,
      }),
      ...(dto.max_properties !== undefined && {
        max_properties: dto.max_properties,
      }),
      ...(dto.text_truncate_pieces !== undefined && {
        text_truncate_pieces: normalizeTextTruncatePieces(
          dto.text_truncate_pieces,
        ),
      }),
      ...(dto.remove_watermark !== undefined && {
        remove_watermark: dto.remove_watermark,
      }),
      ...(dto.watermark_image_count !== undefined && {
        watermark_image_count: dto.watermark_image_count,
      }),
      ...(dto.watermark_manual_selection !== undefined && {
        watermark_manual_selection: dto.watermark_manual_selection,
      }),
    };
  }

  private async requireOwnedTracker(userId: string, agencyId: string) {
    const tracker = await this.prisma.userTrackedAgency.findUnique({
      where: {
        user_id_source_agency_id: {
          user_id: userId,
          source_agency_id: agencyId,
        },
      },
    });

    if (!tracker) {
      throw new NotFoundException('You are not tracking this agency');
    }

    return tracker;
  }

  private async requireOwnedLinkableIntegration(
    userId: string,
    userIntegrationId: string,
  ) {
    const integration = await this.prisma.userIntegration.findFirst({
      where: {
        id: userIntegrationId,
        user_id: userId,
        integration_target: {
          integration_type: LINKABLE_INTEGRATION_TYPE,
        },
      },
    });

    if (!integration) {
      throw new NotFoundException('Integration connection not found');
    }

    return integration;
  }

  private async requireTrackableAgency(agencyId: string) {
    const agency = await this.prisma.sourceAgency.findUnique({
      where: { id: agencyId },
    });

    if (!agency) {
      throw new NotFoundException('Agency not found');
    }

    if (!agency.is_visible) {
      throw new BadRequestException(
        'This agency is not available for tracking',
      );
    }

    if (!agency.is_enabled) {
      throw new BadRequestException(
        'This agency is not currently available for connecting',
      );
    }

    return agency;
  }

  private async assertUserHasDefaultAiIntegration(
    userId: string,
  ): Promise<void> {
    try {
      await this.userIntegrationsService.resolveActiveApiKey(
        userId,
        AiDefaults.provider,
      );
    } catch {
      throw new BadRequestException(
        `Connect ${AiDefaults.provider} on the Integrations page before tracking agencies`,
      );
    }
  }
}
