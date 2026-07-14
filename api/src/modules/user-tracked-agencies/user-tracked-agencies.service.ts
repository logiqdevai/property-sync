import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { UserIntegrationsService } from '@/modules/user-integrations/user-integrations.service';
import { BrowseAgencyQueryType } from './dto/agency-query.schema';
import { TrackAgencyDto } from './dto/track-agency.dto';
import { AgencyStatus, AiProvider, IntegrationType, Prisma } from 'generated/prisma';

@Injectable()
export class UserTrackedAgenciesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly userIntegrationsService: UserIntegrationsService,
  ) {}

  async findAll(userId: string, query: BrowseAgencyQueryType) {
    const where: Prisma.SourceAgencyWhereInput = {
      status: AgencyStatus.ACTIVE,
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
          is_tracked: Boolean(tracker),
          tracking_prefs: tracker
            ? {
                track_new_listings: tracker.track_new_listings,
                track_removed_listings: tracker.track_removed_listings,
                track_updated_listings: tracker.track_updated_listings,
                use_ai_batching: tracker.use_ai_batching,
                ai_provider: tracker.ai_provider,
                ai_model: tracker.ai_model,
                crawl_interval: tracker.crawl_interval,
                enabled: tracker.enabled,
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
    const aiProvider = dto.ai_provider ?? AiProvider.OPENAI;
    await this.assertUserHasIntegration(userId, aiProvider);

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
        use_ai_batching: dto.use_ai_batching ?? false,
        ai_provider: aiProvider,
        ai_model: dto.ai_model ?? null,
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
        ...(dto.use_ai_batching !== undefined && {
          use_ai_batching: dto.use_ai_batching,
        }),
        ai_provider: aiProvider,
        ...(dto.ai_model !== undefined && { ai_model: dto.ai_model }),
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

    const aiProvider = dto.ai_provider ?? existing.ai_provider;
    if (dto.ai_provider !== undefined || dto.ai_model !== undefined) {
      await this.assertUserHasIntegration(userId, aiProvider);
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
        ...(dto.use_ai_batching !== undefined && {
          use_ai_batching: dto.use_ai_batching,
        }),
        ...(dto.enabled !== undefined && { enabled: dto.enabled }),
        ...(dto.ai_provider !== undefined && { ai_provider: dto.ai_provider }),
        ...(dto.ai_model !== undefined && { ai_model: dto.ai_model }),
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

    await this.prisma.userTrackedAgency.delete({ where: { id: existing.id } });
  }

  private async requireTrackableAgency(agencyId: string) {
    const agency = await this.prisma.sourceAgency.findUnique({
      where: { id: agencyId },
    });

    if (!agency) {
      throw new NotFoundException('Agency not found');
    }

    if (!agency.is_visible) {
      throw new BadRequestException('This agency is not available for tracking');
    }

    if (!agency.is_enabled) {
      throw new BadRequestException(
        'This agency is not enabled for tracking yet',
      );
    }

    if (agency.status !== AgencyStatus.ACTIVE) {
      throw new BadRequestException('This agency is not active');
    }

    return agency;
  }

  private async assertUserHasIntegration(
    userId: string,
    aiProvider: AiProvider,
  ): Promise<void> {
    const integrationType = aiProvider as unknown as IntegrationType;
    try {
      await this.userIntegrationsService.resolveActiveApiKey(
        userId,
        integrationType,
      );
    } catch {
      throw new BadRequestException(
        `Connect ${aiProvider} on the Integrations page before tracking agencies with this provider`,
      );
    }
  }
}
