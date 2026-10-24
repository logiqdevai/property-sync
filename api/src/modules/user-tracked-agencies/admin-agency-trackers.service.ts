import { Injectable, NotFoundException } from '@nestjs/common';
import { AuthRole } from 'generated/prisma';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { UserIntegrationsService } from '@/modules/user-integrations/user-integrations.service';
import { CreateUserIntegrationDto } from '@/modules/user-integrations/dto/user-integration.dto';
import { UserTrackedAgenciesService } from './user-tracked-agencies.service';

export interface AdminTrackUserResult {
  user_id: string;
  email: string | null;
  ok: boolean;
  error?: string;
}

/**
 * Admin-on-behalf versions of the per-user tracking / EstateWeb onboarding actions, used by the
 * "New agency" wizard. Every method delegates to the same user-scoped service the user's own
 * routes use, so the validation rules stay identical.
 */
@Injectable()
export class AdminAgencyTrackersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly userTrackedAgenciesService: UserTrackedAgenciesService,
    private readonly userIntegrationsService: UserIntegrationsService,
  ) {}

  async listTrackers(agencyId: string) {
    const trackers = await this.prisma.userTrackedAgency.findMany({
      where: { source_agency_id: agencyId, enabled: true },
      orderBy: { created_at: 'asc' },
      include: {
        user: { select: { id: true, email: true } },
        integration_link: {
          select: {
            user_integration_id: true,
            integration_client_id: true,
            user_integration: { select: { email: true, username: true } },
          },
        },
      },
    });

    return trackers.map((tracker) => ({
      id: tracker.id,
      user_id: tracker.user_id,
      email: tracker.user.email,
      user_integration_id: tracker.integration_link?.user_integration_id ?? null,
      integration_client_id: tracker.integration_link?.integration_client_id ?? null,
      integration_label:
        tracker.integration_link?.user_integration.email ??
        tracker.integration_link?.user_integration.username ??
        null,
    }));
  }

  async trackUsers(
    agencyId: string,
    userIds: string[],
  ): Promise<{ results: AdminTrackUserResult[] }> {
    const uniqueIds = [...new Set(userIds)];
    const users = await this.prisma.user.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true, email: true },
    });
    const emailById = new Map(users.map((user) => [user.id, user.email]));

    const results: AdminTrackUserResult[] = [];
    for (const userId of uniqueIds) {
      const email = emailById.get(userId) ?? null;
      if (!email) {
        results.push({ user_id: userId, email, ok: false, error: 'User not found' });
        continue;
      }

      try {
        await this.userTrackedAgenciesService.track(userId, agencyId, {});
        results.push({ user_id: userId, email, ok: true });
      } catch (error) {
        results.push({
          user_id: userId,
          email,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return { results };
  }

  /** Creates a new EstateWeb account for the user and links it to their tracked agency. */
  async connectEstateWeb(
    agencyId: string,
    userId: string,
    adminRole: AuthRole,
    dto: CreateUserIntegrationDto,
  ) {
    // Fails with 404 before an orphan connection is created if the user isn't tracking.
    await this.userTrackedAgenciesService.getIntegrationLink(userId, agencyId);

    const connection = await this.userIntegrationsService.createConnection(
      userId,
      adminRole,
      dto,
    );

    await this.userTrackedAgenciesService.linkIntegration(
      userId,
      agencyId,
      connection.id,
    );

    return connection;
  }

  async setIntegrationClient(
    agencyId: string,
    userId: string,
    integrationClientId: number | null,
  ) {
    const link = await this.userTrackedAgenciesService.getIntegrationLink(
      userId,
      agencyId,
    );
    if (!link) {
      throw new NotFoundException(
        'Link an EstateWeb account before choosing a CRM client',
      );
    }

    return this.userTrackedAgenciesService.linkIntegration(
      userId,
      agencyId,
      link.user_integration_id,
      integrationClientId,
    );
  }

  searchClients(userId: string, lastName: string) {
    return this.userTrackedAgenciesService.searchIntegrationClients(
      userId,
      lastName,
    );
  }
}
