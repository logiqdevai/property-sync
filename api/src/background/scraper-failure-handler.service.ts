import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { ScraperGenerationService } from '@/modules/scraper-generation/scraper-generation.service';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import {
  GenerationTrigger,
  NotificationSeverity,
  NotificationType,
  ScraperStatus,
} from 'generated/prisma';

// Shared between CrawlProcessor (a crawl that failed while its worker was alive)
// and CrawlRunWatchdogCron (a crawl whose worker died mid-job, discovered later by
// timestamp alone) so both paths roll up to the same scraper.consecutive_failures /
// BROKEN / self-heal behavior.
@Injectable()
export class ScraperFailureHandlerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scraperGenerationService: ScraperGenerationService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async handle(params: {
    scraper: {
      id: string;
      self_healing_enabled: boolean;
      consecutive_failures: number;
    };
    crawlRunId: string;
    sourceAgencyId: string;
    zeroListingsPage0: boolean;
    networkError: boolean;
    // True when the run never actually reached/rendered the target site at all
    // because our own worker crashed/restarted mid-job (CrawlRunWatchdogCron).
    // Distinct from networkError (target site itself is down/blocking us) --
    // both mean "not the scraper's config fault", so neither should trigger an
    // AI self-heal regeneration.
    infraFailure?: boolean;
    errorMessage: string;
  }): Promise<void> {
    const nextFailures = params.scraper.consecutive_failures + 1;
    const shouldMarkBroken =
      params.zeroListingsPage0 || params.networkError || nextFailures >= 3;

    const failedAt = new Date();

    await Promise.all([
      this.prisma.scraper.update({
        where: { id: params.scraper.id },
        data: {
          consecutive_failures: nextFailures,
          last_failure_at: failedAt,
          ...(shouldMarkBroken ? { status: ScraperStatus.BROKEN } : {}),
        },
      }),
      this.prisma.sourceAgency.update({
        where: { id: params.sourceAgencyId },
        data: {
          last_failure_at: failedAt,
          last_error_message: params.errorMessage,
        },
      }),
    ]);

    if (!shouldMarkBroken) return;

    if (params.networkError) {
      this.notificationsService.create({
        type: NotificationType.WEBSITE_UNAVAILABLE,
        severity: NotificationSeverity.CRITICAL,
        title: 'Website unavailable',
        message: params.errorMessage,
        source_agency_id: params.sourceAgencyId,
        scraper_id: params.scraper.id,
        crawl_run_id: params.crawlRunId,
      });
    } else {
      this.notificationsService.create({
        type: NotificationType.BROKEN_SCRAPER,
        severity: NotificationSeverity.WARNING,
        title: 'Scraper marked as broken',
        message: params.errorMessage,
        source_agency_id: params.sourceAgencyId,
        scraper_id: params.scraper.id,
        crawl_run_id: params.crawlRunId,
      });
    }

    if (
      params.scraper.self_healing_enabled &&
      !params.networkError &&
      !params.infraFailure
    ) {
      const selfHealPrompt = `Self-heal triggered after crawl failure: ${params.errorMessage}`;
      const retried = await this.scraperGenerationService.retryLatestForScraper(
        params.scraper.id,
        params.errorMessage,
        selfHealPrompt,
      );

      if (!retried) {
        await this.scraperGenerationService.trigger(
          params.sourceAgencyId,
          params.scraper.id,
          GenerationTrigger.SELF_HEAL,
          selfHealPrompt,
        );
      }
    }
  }
}
