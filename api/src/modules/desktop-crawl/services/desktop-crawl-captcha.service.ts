import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  CostOperationType,
  IntegrationType,
  type Prisma,
} from 'generated/prisma';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { CaptchaSolverService } from '@/integrations/captcha/services/captcha-solver.service';
import { DEFAULT_CAPTCHA_SOLVE_COST_USD } from '@/integrations/captcha/constants/captcha.constants';
import type { CaptchaSolution } from '@/integrations/captcha/interfaces/captcha.interfaces';
import { DESKTOP_CRAWL_MAX_CAPTCHA_SOLVES_PER_HOUR } from '../constants/desktop-crawl.constants';
import type { SolveCaptchaDto } from '../dto/desktop-crawl.schemas';

/**
 * Solves a captcha wall the desktop app hit, through the server's 2captcha account, so the key never
 * ships inside the app. The app injects the token into its own page (same injection as
 * PageCaptchaSolverService) and then reports whether the page accepted it.
 */
@Injectable()
export class DesktopCrawlCaptchaService {
  private readonly logger = new Logger(DesktopCrawlCaptchaService.name);

  constructor(
    private readonly solver: CaptchaSolverService,
    private readonly prisma: PrismaService,
  ) {}

  async solve(
    dto: SolveCaptchaDto,
    userId: string,
  ): Promise<{ token: string; task_id: number }> {
    if (!this.solver.isConfigured()) {
      throw new ServiceUnavailableException(
        'Automatic captcha solving is not set up on the server.',
      );
    }

    // The hourly cap is per scraper for crawls, per agency for photo checks.
    const limitField = dto.scraper_id ? 'scraperId' : 'agencyId';
    const recent = await this.prisma.costLog.count({
      where: {
        operation_type: CostOperationType.CAPTCHA,
        created_at: { gte: new Date(Date.now() - 60 * 60 * 1000) },
        metadata: {
          path: [limitField],
          equals: dto.scraper_id ?? dto.agency_id,
        },
      },
    });
    if (recent >= DESKTOP_CRAWL_MAX_CAPTCHA_SOLVES_PER_HOUR) {
      throw new HttpException(
        'Too many captchas for this agency in the last hour. Solve it by hand in the Chrome window.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    let solution: CaptchaSolution;
    switch (dto.kind) {
      case 'hcaptcha':
        solution = await this.solver.solveHCaptcha({
          websiteURL: dto.url,
          websiteKey: dto.sitekey,
        });
        break;
      case 'turnstile':
        solution = await this.solver.solveTurnstile({
          websiteURL: dto.url,
          websiteKey: dto.sitekey,
        });
        break;
      case 'recaptcha2':
        solution = await this.solver.solveRecaptchaV2({
          websiteURL: dto.url,
          websiteKey: dto.sitekey,
        });
        break;
    }

    await this.recordCost(dto, solution, userId);
    return { token: solution.token, task_id: solution.taskId };
  }

  async report(taskId: number, correct: boolean): Promise<{ ok: true }> {
    try {
      if (correct) await this.solver.reportCorrect(taskId);
      else await this.solver.reportIncorrect(taskId);
    } catch (error) {
      this.logger.warn(
        `captcha report for task ${taskId} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return { ok: true };
  }

  // Best-effort: a failed log must never lose a token that is already paid for.
  private async recordCost(
    dto: SolveCaptchaDto,
    solution: CaptchaSolution,
    userId: string,
  ): Promise<void> {
    try {
      await this.prisma.costLog.create({
        data: {
          operation_type: CostOperationType.CAPTCHA,
          provider: IntegrationType.TWOCAPTCHA,
          model: dto.kind,
          unit_count: 1,
          total_cost: solution.cost ?? DEFAULT_CAPTCHA_SOLVE_COST_USD,
          metadata: {
            ...(solution.cost == null ? { estimated: true } : {}),
            taskId: solution.taskId,
            ...(dto.scraper_id
              ? { scraperId: dto.scraper_id }
              : { agencyId: dto.agency_id }),
            source: 'desktop-crawl',
            userId,
            url: dto.url,
          } as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      this.logger.warn(
        `captcha cost log failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
