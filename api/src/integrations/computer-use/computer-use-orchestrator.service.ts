import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { GenerationRunStatus, Prisma } from 'generated/prisma';
import { ComputerUseClientService } from './services/computer-use-client.service';
import { PlaywrightDriverService } from './services/playwright-driver.service';
import { ScraperConfigVerificationService } from './services/scraper-config-verification.service';
import { ScreenshotStorageService } from './services/screenshot-storage.service';
import { GENERATION_SYSTEM_PROMPT } from './constants/generation-prompt';
import {
  DEFAULT_GENERATION_MODEL,
  MAX_CONSECUTIVE_ACCESS_ERRORS,
  MAX_GENERATION_STEPS,
  MAX_IMAGE_TURNS_IN_CONTEXT,
} from './constants/generation.constants';
import { extractJSON } from './utils/extract-json.util';
import { GenerationAction } from './interfaces/computer-use.interface';
import { GenerationRunOptions } from './interfaces/generation-run-options.interface';
import { mapActionType } from './utils/generation-action.util';
import {
  buildStepsSummaryText,
  compactImageMessages,
  extractResumeUrl,
} from './utils/generation-message.util';
import { isAccessBlockedPage } from './utils/access-blocked.util';

const INITIAL_STEP_HINT =
  'Initial page. Follow the mandatory workflow: find the listings page, inspect cards, visit a detail page, test pagination, then call done.';

@Injectable()
export class ComputerUseOrchestratorService {
  private readonly logger = new Logger(ComputerUseOrchestratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly computerUseClient: ComputerUseClientService,
    private readonly verificationService: ScraperConfigVerificationService,
    private readonly screenshotStorage: ScreenshotStorageService,
  ) {}

  async run(
    generationRunId: string,
    options: GenerationRunOptions = {},
  ): Promise<void> {
    const run = await this.prisma.scraperGenerationRun.findUniqueOrThrow({
      where: { id: generationRunId },
      include: {
        source_agency: true,
        steps: {
          orderBy: { step_index: 'asc' },
        },
      },
    });

    const startedAt = new Date();
    const claimed = await this.prisma.scraperGenerationRun.updateMany({
      where: {
        id: generationRunId,
        status: GenerationRunStatus.QUEUED,
      },
      data: { status: GenerationRunStatus.RUNNING, started_at: startedAt },
    });

    if (claimed.count === 0) {
      this.logger.warn(
        `generation run ${generationRunId}: not QUEUED at start — aborting`,
      );
      return;
    }

    const model =
      this.configService.get<string>('SCRAPER_GENERATION_MODEL') ??
      DEFAULT_GENERATION_MODEL;
    const targetUrl = run.source_agency.base_url;
    const systemPrompt = this.buildSystemPrompt(run.prompt);

    const driver = new PlaywrightDriverService();
    const messages: Anthropic.MessageParam[] = [];
    let finalConfig: Record<string, unknown> | null = null;
    let failureReason: string | null = null;
    let wasCancelled = false;
    let consecutiveAccessErrors = 0;
    let stepIndex = 0;
    const shouldResume = options.resume === true && run.steps.length > 0;

    try {
      await driver.launch(targetUrl);

      if (await this.isCancelled(generationRunId)) {
        wasCancelled = true;
        return;
      }

      if (shouldResume) {
        const resumeUrl = extractResumeUrl(run.steps, targetUrl);
        if (resumeUrl !== targetUrl) {
          await driver.executeAction({ action: 'navigate', url: resumeUrl });
        }

        const resumeParts = [
          buildStepsSummaryText(run.steps),
          this.buildRetryContext(
            options.retryError ?? run.error_message,
            options.retryPrompt,
          ),
        ].filter(Boolean);

        messages.push({
          role: 'user',
          content: resumeParts.join('\n\n'),
        });

        stepIndex = run.steps.length;
      }

      while (!finalConfig && !failureReason && !wasCancelled) {
        if (await this.isCancelled(generationRunId)) {
          wasCancelled = true;
          break;
        }

        if (stepIndex >= MAX_GENERATION_STEPS) {
          failureReason = `Reached max steps (${MAX_GENERATION_STEPS}) without a verified config`;
          break;
        }

        const accessBlocked = await isAccessBlockedPage(driver.currentPage);
        if (accessBlocked) {
          consecutiveAccessErrors += 1;
          this.logger.warn(
            `generation run ${generationRunId}: access blocked (${consecutiveAccessErrors}/${MAX_CONSECUTIVE_ACCESS_ERRORS}) url=${driver.currentPage.url()}`,
          );
          if (consecutiveAccessErrors >= MAX_CONSECUTIVE_ACCESS_ERRORS) {
            failureReason = `Website blocked access ${MAX_CONSECUTIVE_ACCESS_ERRORS} times in a row (CloudFront/WAF 403 or similar). Stopping generation.`;
            break;
          }
        } else {
          consecutiveAccessErrors = 0;
        }

        const screenshotBefore = await driver.screenshot(true);
        const screenshotBeforeId = await this.screenshotStorage.store(
          screenshotBefore,
          `generation-${generationRunId}-step-${stepIndex}-before.jpg`,
        );

        const stepHintParts = [
          stepIndex === 0 && !shouldResume
            ? INITIAL_STEP_HINT
            : `Step ${stepIndex}. URL: ${driver.currentPage.url()}.`,
        ];
        if (accessBlocked) {
          stepHintParts.push(
            `WARNING: page looks access-blocked (CloudFront/WAF 403). Consecutive blocks: ${consecutiveAccessErrors}/${MAX_CONSECUTIVE_ACCESS_ERRORS}. If the real site cannot load, do not invent selectors — try a short wait then reload once. After ${MAX_CONSECUTIVE_ACCESS_ERRORS} blocks the run will stop.`,
          );
        }

        messages.push({
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/jpeg',
                data: screenshotBefore.toString('base64'),
              },
            },
            { type: 'text', text: stepHintParts.join('\n') },
          ],
        });

        if (await this.isCancelled(generationRunId)) {
          wasCancelled = true;
          break;
        }

        const requestMessages = compactImageMessages(
          messages,
          MAX_IMAGE_TURNS_IN_CONTEXT,
        );
        const { rawText } = await this.computerUseClient.sendStep(
          requestMessages,
          systemPrompt,
          model,
        );
        messages.push({ role: 'assistant', content: rawText });

        if (await this.isCancelled(generationRunId)) {
          wasCancelled = true;
          break;
        }

        let action: GenerationAction;
        try {
          action = extractJSON<GenerationAction>(rawText);
        } catch {
          messages.push({
            role: 'user',
            content:
              'Your response was not valid JSON. Return ONLY a JSON object, no other text.',
          });
          stepIndex += 1;
          continue;
        }

        const step = await this.prisma.computerUseStep.create({
          data: {
            scraper_generation_run_id: generationRunId,
            step_index: stepIndex,
            action_type: mapActionType(action.action),
            action_payload: (action.action === 'done'
              ? { config: action.config }
              : {
                  selector: action.selector,
                  url: action.url,
                  text: action.text,
                }) as Prisma.InputJsonValue,
            screenshot_before_id: screenshotBeforeId,
            model_reasoning: action.reasoning ?? null,
          },
        });

        if (action.action === 'done') {
          if (accessBlocked || (await isAccessBlockedPage(driver.currentPage))) {
            await this.prisma.computerUseStep.update({
              where: { id: step.id },
              data: {
                screenshot_after_id: screenshotBeforeId,
                model_reasoning: `${step.model_reasoning ?? ''} [REJECTED: page is access-blocked]`,
              },
            });
            messages.push({
              role: 'user',
              content:
                'Rejected "done": the current page is still an access-blocked error page (CloudFront/WAF 403). Do not invent listing selectors from an error page. Wait/reload only if useful; otherwise the run will stop after repeated blocks.',
            });
            stepIndex += 1;
            continue;
          }

          const errors = await this.verificationService.verify(
            driver.activeContext,
            driver.currentPage,
            action.config as never,
          );

          if (errors.length > 0) {
            await this.prisma.computerUseStep.update({
              where: { id: step.id },
              data: {
                screenshot_after_id: screenshotBeforeId,
                model_reasoning: `${step.model_reasoning ?? ''} [VERIFICATION FAILED]`,
              },
            });

            const feedback = [
              'Your proposed config was verified against the actual page and FAILED. Do NOT return "done" again with the same selectors.',
              '',
              'Errors:',
              ...errors.map((e) => `- ${e}`),
              '',
              'Return to the listings page, inspect the actual elements, and return a corrected config.',
            ].join('\n');
            messages.push({ role: 'user', content: feedback });
            stepIndex += 1;
            continue;
          }

          finalConfig = action.config ?? null;
          await this.prisma.computerUseStep.update({
            where: { id: step.id },
            data: { screenshot_after_id: screenshotBeforeId },
          });
          break;
        }

        try {
          await driver.executeAction(action);
        } catch (e) {
          messages.push({
            role: 'user',
            content: `The action "${action.action}"${action.selector ? ` with selector "${action.selector}"` : ''} failed: ${(e as Error).message}. Try a different approach.`,
          });
        }

        if (await this.isCancelled(generationRunId)) {
          wasCancelled = true;
          break;
        }

        const screenshotAfter = await driver.screenshot();
        const screenshotAfterId = await this.screenshotStorage.store(
          screenshotAfter,
          `generation-${generationRunId}-step-${stepIndex}-after.png`,
        );
        await this.prisma.computerUseStep.update({
          where: { id: step.id },
          data: { screenshot_after_id: screenshotAfterId },
        });

        stepIndex += 1;
      }
    } catch (error) {
      failureReason =
        error instanceof Error
          ? error.message
          : 'Unknown error during generation run';
      this.logger.error(
        `generation run ${generationRunId} failed: ${failureReason}`,
      );
    } finally {
      await driver.close();
    }

    if (wasCancelled || (await this.isCancelled(generationRunId))) {
      this.logger.log(`generation run ${generationRunId}: stopped by cancel`);
      const finishedAt = new Date();
      await this.prisma.scraperGenerationRun.updateMany({
        where: {
          id: generationRunId,
          status: GenerationRunStatus.CANCELLED,
        },
        data: {
          finished_at: finishedAt,
          duration_ms: finishedAt.getTime() - startedAt.getTime(),
        },
      });
      return;
    }

    const finishedAt = new Date();
    await this.prisma.scraperGenerationRun.updateMany({
      where: {
        id: generationRunId,
        status: GenerationRunStatus.RUNNING,
      },
      data: finalConfig
        ? {
            status: GenerationRunStatus.AWAITING_REVIEW,
            staged_config: finalConfig as Prisma.InputJsonValue,
            finished_at: finishedAt,
            duration_ms: finishedAt.getTime() - startedAt.getTime(),
          }
        : {
            status: GenerationRunStatus.FAILED,
            error_message: failureReason ?? 'Generation did not converge',
            finished_at: finishedAt,
            duration_ms: finishedAt.getTime() - startedAt.getTime(),
          },
    });
  }

  private async isCancelled(generationRunId: string): Promise<boolean> {
    const current = await this.prisma.scraperGenerationRun.findUnique({
      where: { id: generationRunId },
      select: { status: true },
    });
    return current?.status === GenerationRunStatus.CANCELLED;
  }

  private buildSystemPrompt(prompt: string | null): string {
    if (!prompt?.trim()) {
      return GENERATION_SYSTEM_PROMPT;
    }

    return `${GENERATION_SYSTEM_PROMPT}\n\n## Additional instructions:\n${prompt.trim()}`;
  }

  private buildRetryContext(
    retryError?: string | null,
    retryPrompt?: string,
  ): string | null {
    const parts: string[] = [];

    if (retryError?.trim()) {
      parts.push(
        `The previous attempt failed with this error:\n${retryError.trim()}`,
      );
    }

    if (retryPrompt?.trim()) {
      parts.push(`Additional instructions:\n${retryPrompt.trim()}`);
    }

    if (parts.length === 0) {
      return 'Continue the generation from the current browser state. Do not restart from scratch.';
    }

    parts.push(
      'Continue from the current browser state. Do not restart from scratch.',
    );
    return parts.join('\n\n');
  }
}
