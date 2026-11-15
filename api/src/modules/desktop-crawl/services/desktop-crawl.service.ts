import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ScraperStatus } from 'generated/prisma';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { CaptchaSolverService } from '@/integrations/captcha/services/captcha-solver.service';
import type { ScraperConfig } from '@/integrations/crawler/interfaces/scraper-config.interface';
import {
  extractDetailPage,
  extractListingCards,
} from '@/integrations/crawler/utils/page-extractors';
import {
  DESKTOP_CRAWL_PACING,
  DESKTOP_CRAWL_SOURCE,
} from '../constants/desktop-crawl.constants';
import type { DesktopCrawlScrapersQueryType } from '../dto/desktop-crawl.schemas';
import {
  DesktopCrawlAttentionReasons,
  DesktopCrawlPhases,
  type DesktopCrawlAttentionReason,
  type DesktopCrawlJob,
  type DesktopCrawlRunMetadata,
  type DesktopCrawlRunStatus,
  type DesktopCrawlRunSummary,
  type DesktopCrawlScraperRow,
} from '../interfaces/desktop-crawl.interfaces';

interface LastRunRow {
  scraper_id: string;
  id: string;
  status: string;
  created_at: Date;
  total_found: number;
  error_message: string | null;
}

// Same signal the mcp-crawl skill's "find failed/blocked scrapers" query uses.
const BLOCKED_ERROR_RE =
  /403|blocked|captcha|challenge|cloudflare|imperva|timeout/i;

@Injectable()
export class DesktopCrawlService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly captchaSolver: CaptchaSolverService,
  ) {}

  /**
   * Every ACTIVE/BROKEN scraper with its latest scheduled (server) crawl and its latest desktop
   * crawl. Scrapers whose scheduled crawl is failing, blocked or empty are flagged and listed first.
   */
  async listScrapers(
    query: DesktopCrawlScrapersQueryType,
  ): Promise<DesktopCrawlScraperRow[]> {
    const search = query.search?.trim();
    const scrapers = await this.prisma.scraper.findMany({
      where: {
        status: { in: [ScraperStatus.ACTIVE, ScraperStatus.BROKEN] },
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                {
                  source_agency: {
                    OR: [
                      { name: { contains: search, mode: 'insensitive' } },
                      { base_url: { contains: search, mode: 'insensitive' } },
                    ],
                  },
                },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        name: true,
        status: true,
        active_version_id: true,
        source_agency: { select: { id: true, name: true, base_url: true } },
      },
    });
    if (scrapers.length === 0) return [];

    const ids = scrapers.map((s) => s.id);
    const [serverRuns, desktopRuns] = await Promise.all([
      this.latestRuns(ids, false),
      this.latestRuns(ids, true),
    ]);

    const rows = scrapers.map((s): DesktopCrawlScraperRow => {
      const server = serverRuns.get(s.id) ?? null;
      return {
        scraper_id: s.id,
        scraper_name: s.name,
        scraper_status: s.status,
        agency_id: s.source_agency.id,
        agency_name: s.source_agency.name,
        agency_url: s.source_agency.base_url,
        attention: this.attentionFor(s.status, server),
        last_server_crawl: server,
        last_desktop_crawl: desktopRuns.get(s.id) ?? null,
        has_config: !!s.active_version_id,
      };
    });

    return rows
      .filter((r) => !query.only_attention || r.attention)
      .sort(
        (a, b) =>
          Number(!!b.attention) - Number(!!a.attention) ||
          a.agency_name.localeCompare(b.agency_name),
      );
  }

  async getJob(scraperId: string): Promise<DesktopCrawlJob> {
    const scraper = await this.prisma.scraper.findUnique({
      where: { id: scraperId },
      select: {
        id: true,
        name: true,
        active_version: { select: { config: true } },
        source_agency: { select: { id: true, name: true } },
      },
    });
    if (!scraper) throw new NotFoundException('Scraper not found');
    const config = scraper.active_version?.config as unknown as
      | ScraperConfig
      | undefined;
    if (!config?.start_url || !config.listing_selector) {
      throw new NotFoundException(
        'This agency has no working scraper setup yet. Ask a developer to set it up first.',
      );
    }

    return {
      scraper_id: scraper.id,
      scraper_name: scraper.name,
      agency_id: scraper.source_agency.id,
      agency_name: scraper.source_agency.name,
      config,
      scripts: {
        listing: extractListingCards.toString(),
        detail: extractDetailPage.toString(),
      },
      pacing: DESKTOP_CRAWL_PACING,
      captcha_solver_available: this.captchaSolver.isConfigured(),
    };
  }

  async getRunStatus(crawlRunId: string): Promise<DesktopCrawlRunStatus> {
    const run = await this.prisma.crawlRun.findUnique({
      where: { id: crawlRunId },
      select: {
        id: true,
        status: true,
        source_agency_id: true,
        total_found: true,
        total_new_listings: true,
        total_refreshed_listings: true,
        total_removed: true,
        error_message: true,
        metadata: true,
      },
    });
    const metadata = (run?.metadata ?? {}) as {
      normalization_status?: string;
      desktop_crawl?: DesktopCrawlRunMetadata;
    };
    if (!run || !metadata.desktop_crawl) {
      throw new NotFoundException('Crawl not found');
    }

    const desktop = metadata.desktop_crawl;
    let phase = desktop.phase;
    if (phase === DesktopCrawlPhases.NORMALIZING) {
      if (metadata.normalization_status === 'completed') {
        phase = DesktopCrawlPhases.DONE;
      } else if (metadata.normalization_status === 'failed') {
        phase = DesktopCrawlPhases.FAILED;
      }
    }

    const finished =
      phase === DesktopCrawlPhases.DONE || phase === DesktopCrawlPhases.FAILED;
    const held = finished ? await this.heldCounts(run.source_agency_id) : null;

    return {
      crawl_run_id: run.id,
      agency_id: run.source_agency_id,
      phase,
      status: run.status,
      total_found: run.total_found ?? 0,
      total_new_listings: run.total_new_listings ?? 0,
      total_refreshed_listings: run.total_refreshed_listings ?? 0,
      total_removed: run.total_removed ?? 0,
      held_for_review: held?.held ?? null,
      held_without_photos: held?.withoutPhotos ?? null,
      auto_update_restored:
        desktop.restore_auto_update_ids.length === 0 ||
        !!desktop.auto_update_restored_at ||
        !!desktop.restore_handed_to,
      error_message: run.error_message,
    };
  }

  private attentionFor(
    status: ScraperStatus,
    last: DesktopCrawlRunSummary | null,
  ): DesktopCrawlAttentionReason | null {
    if (status === ScraperStatus.BROKEN)
      return DesktopCrawlAttentionReasons.BROKEN;
    if (!last) return null;
    if (last.error_message && BLOCKED_ERROR_RE.test(last.error_message)) {
      return DesktopCrawlAttentionReasons.BLOCKED;
    }
    if (last.status === 'FAILED') return DesktopCrawlAttentionReasons.FAILED;
    if (last.total_found === 0) return DesktopCrawlAttentionReasons.EMPTY;
    return null;
  }

  private async latestRuns(
    scraperIds: string[],
    desktop: boolean,
  ): Promise<Map<string, DesktopCrawlRunSummary>> {
    const sourceFilter = desktop
      ? Prisma.sql`coalesce(cr.metadata->>'source', '') = ${DESKTOP_CRAWL_SOURCE}`
      : Prisma.sql`coalesce(cr.metadata->>'source', '') <> ${DESKTOP_CRAWL_SOURCE}`;
    const rows = await this.prisma.$queryRaw<LastRunRow[]>`
      select distinct on (cr.scraper_id)
             cr.scraper_id, cr.id, cr.status::text as status, cr.created_at,
             coalesce(cr.total_found, 0)::int as total_found, cr.error_message
      from crawl_runs cr
      where cr.scraper_id in (${Prisma.join(scraperIds)})
        and ${sourceFilter}
      order by cr.scraper_id, cr.created_at desc`;
    return new Map(
      rows.map((r) => [
        r.scraper_id,
        {
          id: r.id,
          status: r.status,
          created_at: r.created_at,
          total_found: r.total_found,
          error_message: r.error_message,
        },
      ]),
    );
  }

  /**
   * Held listings of the agency, counted through the canonical property (never through
   * `user_properties.property_id`, which is the agency's own external id -- mcp-crawl skill §7).
   */
  private async heldCounts(
    sourceAgencyId: string,
  ): Promise<{ held: number; withoutPhotos: number }> {
    const [row] = await this.prisma.$queryRaw<
      Array<{ held: number; without_photos: number }>
    >`
      select count(distinct up.id)::int as held,
             count(distinct up.id) filter (
               where up.images is null or up.images::text in ('[]', 'null')
             )::int as without_photos
      from user_properties up
      join property_source_links l on l.property_id = up.canonical_property_id
      join source_properties sp on sp.id = l.source_property_id
      where sp.source_agency_id = ${sourceAgencyId} and up.pending_crm_update`;
    return { held: row?.held ?? 0, withoutPhotos: row?.without_photos ?? 0 };
  }
}
