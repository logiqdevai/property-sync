import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { UserPropertiesService } from '@/modules/user-properties/user-properties.service';

const PUSH_BATCH = 200;

/**
 * Pushes an agency's held listings (`pending_crm_update`) to the CRM on behalf of the desktop app,
 * the same push as the "Push to CRM" button (queued in the background). Used by the app's optional
 * "push after each crawl" step, so the operator does not have to open the web app to do it.
 */
@Injectable()
export class DesktopCrawlPushService {
  private readonly logger = new Logger(DesktopCrawlPushService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly userPropertiesService: UserPropertiesService,
  ) {}

  /** Held listings of the agency per tracking user (through the canonical property). */
  private async pendingByUser(
    sourceAgencyId: string,
  ): Promise<Map<string, string[]>> {
    const rows = await this.prisma.userProperty.findMany({
      where: {
        pending_crm_update: true,
        canonical_property: {
          source_links: {
            some: { source_property: { source_agency_id: sourceAgencyId } },
          },
        },
      },
      select: { id: true, user_id: true },
    });
    const byUser = new Map<string, string[]>();
    for (const row of rows) {
      byUser.set(row.user_id, [...(byUser.get(row.user_id) ?? []), row.id]);
    }
    return byUser;
  }

  async pendingCount(sourceAgencyId: string): Promise<{ pending: number }> {
    const byUser = await this.pendingByUser(sourceAgencyId);
    return { pending: [...byUser.values()].reduce((n, ids) => n + ids.length, 0) };
  }

  async pushPending(
    sourceAgencyId: string,
  ): Promise<{ queued: number; failed: number }> {
    const byUser = await this.pendingByUser(sourceAgencyId);
    let queued = 0;
    let failed = 0;
    for (const [userId, ids] of byUser) {
      for (let i = 0; i < ids.length; i += PUSH_BATCH) {
        const batch = ids.slice(i, i + PUSH_BATCH);
        try {
          await this.userPropertiesService.pushToCrm(userId, batch);
          queued += batch.length;
        } catch (error) {
          failed += batch.length;
          this.logger.warn(
            `push of ${batch.length} held listings (agency ${sourceAgencyId}) failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }
    return { queued, failed };
  }
}
