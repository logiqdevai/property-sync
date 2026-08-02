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
  DEFAULT_MAX_GENERATION_STEPS,
  ABSOLUTE_MAX_GENERATION_STEPS,
  MAX_CONSECUTIVE_ACCESS_ERRORS,
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
import {
  classifyPageAccess,
  isAccessBarrierPage,
  buildBlockHandlingConfig,
} from '@/integrations/crawler/block-handling/block-handling.utils';

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
        source_agency: {
          include: { block_rules: true },
        },
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
    const blockHandlingConfig = buildBlockHandlingConfig(run.source_agency);
    const maxSteps = Math.min(
      Math.max(run.max_steps ?? DEFAULT_MAX_GENERATION_STEPS, 1),
      ABSOLUTE_MAX_GENERATION_STEPS,
    );

    const driver = new PlaywrightDriverService();
    const messages: Anthropic.MessageParam[] = [];
    let finalConfig: Record<string, unknown> | null = null;
    let failureReason: string | null = null;
    let wasCancelled = false;
    let consecutiveAccessErrors = 0;
    let stepIndex = 0;
    const shouldResume = options.resume === true && run.steps.length > 0;

    try {
      await driver.launch(targetUrl, blockHandlingConfig);

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

        if (stepIndex >= maxSteps) {
          failureReason = `Reached max steps (${maxSteps}) without a verified config`;
          break;
        }

        const accessState = await classifyPageAccess(
          driver.currentPage,
          blockHandlingConfig,
        );
        const accessBlocked =
          accessState === 'blocked' || accessState === 'challenge';
        if (accessBlocked) {
          consecutiveAccessErrors += 1;
          const stopAfter =
            accessState === 'blocked'
              ? Math.min(2, MAX_CONSECUTIVE_ACCESS_ERRORS)
              : MAX_CONSECUTIVE_ACCESS_ERRORS;
          this.logger.warn(
            `generation run ${generationRunId}: access barrier state=${accessState} (${consecutiveAccessErrors}/${stopAfter}) url=${driver.currentPage.url()}`,
          );
          if (consecutiveAccessErrors >= stopAfter) {
            failureReason = `Website blocked or challenged access ${stopAfter} times in a row (WAF/bot interstitial/captcha). Stopping generation.`;
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
            `WARNING: page looks access-blocked or bot-challenged (WAF/Imperva/CloudFront/captcha). Consecutive barriers: ${consecutiveAccessErrors}/${MAX_CONSECUTIVE_ACCESS_ERRORS}. Do not invent selectors from an interstitial. After ${MAX_CONSECUTIVE_ACCESS_ERRORS} barriers the run will stop.`,
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
          if (
            accessBlocked ||
            (await isAccessBarrierPage(driver.currentPage, blockHandlingConfig))
          ) {
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
                'Rejected "done": the current page is still an access-blocked or bot-challenge interstitial (WAF/Imperva/CloudFront/captcha). Do not invent listing selectors from that page. Wait/reload only if useful; otherwise the run will stop after repeated barriers.',
            });
            stepIndex += 1;
            continue;
          }

          const errors = await this.verificationService.verify(
            driver.activeContext,
            driver.currentPage,
            action.config as never,
            blockHandlingConfig,
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
