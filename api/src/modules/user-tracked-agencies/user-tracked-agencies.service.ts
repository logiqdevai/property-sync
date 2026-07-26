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

    const [agencies, total, trackers] = await Promise.all([
      this.prisma.sourceAgency.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { name: 'asc' },
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
                use_ai_batching: tracker.use_ai_batching,
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
              }
            : undefined,
        };
      }),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        total_pages: Math.ceil(total / query.limit),
        has_next: query.page < Math.ceil(total / query.limit),
        has_prev: query.page > 1,
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
        use_ai_batching: dto.use_ai_batching ?? false,
        remove_watermark: dto.remove_watermark ?? false,
        watermark_image_count: dto.watermark_image_count ?? 10,
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
        ...(dto.use_ai_batching !== undefined && {
          use_ai_batching: dto.use_ai_batching,
        }),
        ...(dto.remove_watermark !== undefined && {
          remove_watermark: dto.remove_watermark,
        }),
        ...(dto.watermark_image_count !== undefined && {
          watermark_image_count: dto.watermark_image_count,
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
      data: {
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
        ...(dto.use_ai_batching !== undefined && {
          use_ai_batching: dto.use_ai_batching,
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
      },
    });
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
