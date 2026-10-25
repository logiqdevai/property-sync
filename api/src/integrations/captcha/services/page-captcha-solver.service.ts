import { Injectable, Logger } from '@nestjs/common';
import type { Page } from 'playwright';
import { CostOperationType, IntegrationType } from 'generated/prisma';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import type { CaptchaSolveHook } from '@/integrations/crawler/block-handling/block-handling.interface';
import { DEFAULT_CAPTCHA_SOLVE_COST_USD } from '../constants/captcha.constants';
import { CaptchaSolution } from '../interfaces/captcha.interfaces';
import { CaptchaSolverService } from './captcha-solver.service';

/** Hard stop on paid solves per crawl so a page that keeps re-challenging cannot run up a bill. */
export const MAX_CAPTCHA_SOLVES_PER_CRAWL = 40;
/** After this many solves in a row that the page did not accept, stop trying for the rest of the crawl. */
export const MAX_CONSECUTIVE_CAPTCHA_FAILURES = 3;
/** How long to wait for the page to leave the challenge after the token is injected. */
const PAGE_ACCEPT_TIMEOUT_MS = 30_000;

type CaptchaKind = 'hcaptcha' | 'turnstile' | 'recaptcha2';

interface CaptchaProbe {
  hcaptcha: string | null;
  hcaptchaCallback: string | null;
  turnstile: string | null;
  turnstileCallback: string | null;
  recaptcha: string | null;
  recaptchaCallback: string | null;
  url: string;
}

// Page-side "is the captcha wall still up" check, used only to confirm a solve worked; the crawler's
// own block rules (BlockHandlingConfig) decide whether a page is blocked in the first place.
const CHALLENGE_STILL_UP = `(() => {
  const title = document.title || '';
  const titled = /Pardon Our Interruption|Just a moment|Attention Required|Access Denied/i.test(title);
  const widget = !!document.querySelector('.h-captcha, iframe[src*="hcaptcha"], .cf-turnstile, #cf-challenge-running, .g-recaptcha');
  const sparse = (document.body?.innerText || '').trim().length < 200;
  return titled || (widget && sparse);
})()`;

/**
 * Solves the captcha wall on a live Playwright page through 2captcha and injects the token so the
 * page carries on -- the server-side counterpart of the manual flow in the mcp-crawl skill (§3a/§3c).
 * One hook is created per crawl (`createHook`) and handed to the crawler through
 * `BlockHandlingConfig.captcha_solver`; it is shared by the listing walk and every detail-page lane.
 */
@Injectable()
export class PageCaptchaSolverService {
  private readonly logger = new Logger(PageCaptchaSolverService.name);

  constructor(
    private readonly solver: CaptchaSolverService,
    private readonly prisma: PrismaService,
  ) {}

  isConfigured(): boolean {
    return this.solver.isConfigured();
  }

  createHook(ctx: { scraperId: string; crawlRunId: string }): CaptchaSolveHook {
    let solves = 0;
    let consecutiveFailures = 0;

    return async (page: Page): Promise<boolean> => {
      if (
        solves >= MAX_CAPTCHA_SOLVES_PER_CRAWL ||
        consecutiveFailures >= MAX_CONSECUTIVE_CAPTCHA_FAILURES
      ) {
        return false;
      }

      let probe: CaptchaProbe;
      try {
        probe = await this.probe(page);
      } catch {
        return false; // page navigated away mid-probe; the crawler re-classifies it
      }
      const kind: CaptchaKind | null = probe.hcaptcha
        ? 'hcaptcha'
        : probe.turnstile
          ? 'turnstile'
          : probe.recaptcha
            ? 'recaptcha2'
            : null;
      // No widget/sitekey: a hard IP block (403) or an unsupported challenge -- nothing to solve, so
      // don't spend money.
      if (!kind) return false;

      solves++;
      let solution: CaptchaSolution;
      try {
        solution = await this.solve(kind, probe);
      } catch (error) {
        consecutiveFailures++;
        this.logger.warn(
          `scraper ${ctx.scraperId}: ${kind} solve failed at ${probe.url}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        return false;
      }
      void this.recordCost(kind, solution, ctx);

      try {
        await this.inject(page, kind, probe, solution.token);
      } catch {
        // Navigation already started -- the usual sign the token was accepted.
      }

      const accepted = await this.waitUntilChallengeGone(page);
      if (accepted) {
        consecutiveFailures = 0;
        this.logger.log(
          `scraper ${ctx.scraperId}: ${kind} solved at ${probe.url} (task ${solution.taskId}, solve ${solves}/${MAX_CAPTCHA_SOLVES_PER_CRAWL})`,
        );
        await this.solver.reportCorrect(solution.taskId).catch(() => undefined);
      } else {
        consecutiveFailures++;
        this.logger.warn(
          `scraper ${ctx.scraperId}: ${kind} token not accepted at ${probe.url} (task ${solution.taskId})`,
        );
        await this.solver
          .reportIncorrect(solution.taskId)
          .catch(() => undefined);
      }
      return accepted;
    };
  }

  private probe(page: Page): Promise<CaptchaProbe> {
    return page.evaluate(() => {
      const el = (sel: string) =>
        document.querySelector(sel) as HTMLElement | null;
      const hc = el('.h-captcha[data-sitekey]');
      const hcFrame = Array.from(document.querySelectorAll('iframe'))
        .map((f) => f.src)
        .find((s) => /hcaptcha/.test(s));
      const frameKey = hcFrame
        ? new URLSearchParams(hcFrame.split('#')[1] ?? '').get('sitekey')
        : null;
      const ts = el('.cf-turnstile[data-sitekey]');
      const rc = el('.g-recaptcha[data-sitekey]');
      return {
        hcaptcha: hc?.dataset.sitekey ?? frameKey,
        hcaptchaCallback: hc?.dataset.callback ?? null,
        turnstile: ts?.dataset.sitekey ?? null,
        turnstileCallback: ts?.dataset.callback ?? null,
        recaptcha: rc?.dataset.sitekey ?? null,
        recaptchaCallback: rc?.dataset.callback ?? null,
        url: location.href,
      };
    });
  }

  private solve(kind: CaptchaKind, probe: CaptchaProbe) {
    const websiteURL = probe.url;
    switch (kind) {
      case 'hcaptcha':
        return this.solver.solveHCaptcha({
          websiteURL,
          websiteKey: probe.hcaptcha!,
        });
      case 'turnstile':
        return this.solver.solveTurnstile({
          websiteURL,
          websiteKey: probe.turnstile!,
        });
      case 'recaptcha2':
        return this.solver.solveRecaptchaV2({
          websiteURL,
          websiteKey: probe.recaptcha!,
        });
    }
  }

  private inject(
    page: Page,
    kind: CaptchaKind,
    probe: CaptchaProbe,
    token: string,
  ): Promise<void> {
    const callback =
      kind === 'hcaptcha'
        ? probe.hcaptchaCallback
        : kind === 'turnstile'
          ? probe.turnstileCallback
          : probe.recaptchaCallback;
    return page.evaluate(
      ({ token, kind, callback }) => {
        const setAll = (sel: string) =>
          document.querySelectorAll(sel).forEach((node) => {
            (node as HTMLTextAreaElement).value = token;
            node.innerHTML = token;
          });
        const w = window as unknown as Record<string, unknown>;
        // Imperva's wrapped hCaptcha uses the global `solvedCaptcha(payload)` as its callback.
        const fnName = callback ?? (kind === 'hcaptcha' ? 'solvedCaptcha' : null);
        if (kind === 'hcaptcha') {
          setAll('textarea[name="h-captcha-response"]');
          setAll('textarea[name="g-recaptcha-response"]');
        } else if (kind === 'turnstile') {
          const input = document.querySelector(
            'input[name="cf-turnstile-response"]',
          ) as HTMLInputElement | null;
          if (input) input.value = token;
        } else {
          setAll('textarea[name="g-recaptcha-response"]');
        }
        const fn = fnName ? w[fnName] : undefined;
        if (typeof fn === 'function') {
          setTimeout(() => (fn as (t: string) => void)(token), 50);
        }
      },
      { token, kind, callback },
    );
  }

  private async waitUntilChallengeGone(page: Page): Promise<boolean> {
    const deadline = Date.now() + PAGE_ACCEPT_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await page.waitForTimeout(1_000);
      try {
        const stillUp = (await page.evaluate(CHALLENGE_STILL_UP)) as boolean;
        if (!stillUp) return true;
      } catch {
        // Execution context destroyed by the post-solve navigation: re-check on the next tick.
      }
    }
    return false;
  }

  // Best-effort: a failed log must never lose a token that is already paid for.
  private async recordCost(
    kind: CaptchaKind,
    solution: CaptchaSolution,
    ctx: { scraperId: string; crawlRunId: string },
  ): Promise<void> {
    try {
      await this.prisma.costLog.create({
        data: {
          operation_type: CostOperationType.CAPTCHA,
          provider: IntegrationType.TWOCAPTCHA,
          model: kind,
          unit_count: 1,
          total_cost: solution.cost ?? DEFAULT_CAPTCHA_SOLVE_COST_USD,
          metadata: {
            ...(solution.cost == null ? { estimated: true } : {}),
            taskId: solution.taskId,
            scraperId: ctx.scraperId,
            crawlRunId: ctx.crawlRunId,
          },
        },
      });
    } catch (error) {
      this.logger.warn(
        `captcha cost log failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
