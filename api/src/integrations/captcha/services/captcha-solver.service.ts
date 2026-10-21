import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { CaptchaConfig } from '../config/captcha.config';
import {
  CAPTCHA_API_PATHS,
  CAPTCHA_MAX_SOLVE_ATTEMPTS,
  CAPTCHA_RETRYABLE_ERROR_CODES,
} from '../constants/captcha.constants';
import { CaptchaException } from '../exceptions/captcha.exception';
import {
  CaptchaSolution,
  HCaptchaParams,
  ImageCaptchaParams,
  ProxyParams,
  RecaptchaV2Params,
  RecaptchaV3Params,
  TurnstileParams,
} from '../interfaces/captcha.interfaces';
import { CaptchaClientService } from './captcha-client.service';

type TaskBody = Record<string, unknown>;

interface RawSolution {
  token?: string;
  gRecaptchaResponse?: string;
  text?: string;
  userAgent?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

@Injectable()
export class CaptchaSolverService {
  private readonly logger = new Logger(CaptchaSolverService.name);

  constructor(
    private readonly client: CaptchaClientService,
    private readonly config: CaptchaConfig,
  ) {}

  isConfigured(): boolean {
    return this.config.isConfigured();
  }

  async getBalance(): Promise<number> {
    const res = await this.client.call(CAPTCHA_API_PATHS.getBalance);
    return Number(res.balance ?? 0);
  }

  /** Turnstile widget, or a Cloudflare Challenge page when action/data/pagedata are given. */
  solveTurnstile(p: TurnstileParams): Promise<CaptchaSolution> {
    return this.solve(
      this.withProxy(
        {
          type: p.proxy ? 'TurnstileTask' : 'TurnstileTaskProxyless',
          websiteURL: p.websiteURL,
          websiteKey: p.websiteKey,
          action: p.action,
          data: p.data,
          pagedata: p.pagedata,
        },
        p.proxy,
      ),
    );
  }

  solveRecaptchaV2(p: RecaptchaV2Params): Promise<CaptchaSolution> {
    return this.solve(
      this.withProxy(
        {
          type: p.proxy ? 'RecaptchaV2Task' : 'RecaptchaV2TaskProxyless',
          websiteURL: p.websiteURL,
          websiteKey: p.websiteKey,
          isInvisible: p.isInvisible,
          recaptchaDataSValue: p.recaptchaDataSValue,
          userAgent: p.userAgent,
          cookies: p.cookies,
        },
        p.proxy,
      ),
    );
  }

  solveHCaptcha(p: HCaptchaParams): Promise<CaptchaSolution> {
    return this.solve(
      this.withProxy(
        {
          type: p.proxy ? 'HCaptchaTask' : 'HCaptchaTaskProxyless',
          websiteURL: p.websiteURL,
          websiteKey: p.websiteKey,
        },
        p.proxy,
      ),
    );
  }

  solveRecaptchaV3(p: RecaptchaV3Params): Promise<CaptchaSolution> {
    return this.solve({
      type: 'RecaptchaV3TaskProxyless',
      websiteURL: p.websiteURL,
      websiteKey: p.websiteKey,
      minScore: p.minScore ?? 0.7,
      pageAction: p.pageAction,
      isEnterprise: p.isEnterprise,
    });
  }

  /** Plain image captcha; the recognised text is returned in `token`. */
  solveImage(p: ImageCaptchaParams): Promise<CaptchaSolution> {
    return this.solve({ type: 'ImageToTextTask', ...p });
  }

  async reportCorrect(taskId: number): Promise<void> {
    await this.client.call(CAPTCHA_API_PATHS.reportCorrect, { taskId });
  }

  async reportIncorrect(taskId: number): Promise<void> {
    await this.client.call(CAPTCHA_API_PATHS.reportIncorrect, { taskId });
  }

  private withProxy(task: TaskBody, proxy?: ProxyParams): TaskBody {
    return proxy ? { ...task, ...proxy } : task;
  }

  /** Submit a task and poll until solved, resubmitting on retryable 2captcha errors. */
  private async solve(task: TaskBody): Promise<CaptchaSolution> {
    const cleanTask = Object.fromEntries(
      Object.entries(task).filter(([, v]) => v !== undefined),
    );

    for (let attempt = 1; ; attempt++) {
      try {
        return await this.submitAndPoll(cleanTask);
      } catch (error) {
        const code = error instanceof CaptchaException ? error.code : '';
        if (
          !CAPTCHA_RETRYABLE_ERROR_CODES.has(code) ||
          attempt >= CAPTCHA_MAX_SOLVE_ATTEMPTS
        ) {
          throw error;
        }
        this.logger.warn(
          `2captcha ${String(cleanTask.type)} failed with ${code}; resubmitting (${attempt}/${CAPTCHA_MAX_SOLVE_ATTEMPTS})`,
        );
      }
    }
  }

  private async submitAndPoll(task: TaskBody): Promise<CaptchaSolution> {
    const created = await this.client.call(CAPTCHA_API_PATHS.createTask, {
      task,
    });
    const taskId = created.taskId;
    if (!taskId) {
      throw new CaptchaException(
        '2captcha createTask returned no taskId',
        'CAPTCHA_INVALID_RESPONSE',
      );
    }

    const deadline = Date.now() + this.config.getSolveTimeoutMs();
    while (Date.now() < deadline) {
      await sleep(this.config.getPollIntervalMs());
      const res = await this.client.call<RawSolution>(
        CAPTCHA_API_PATHS.getTaskResult,
        { taskId },
      );
      if (res.status !== 'ready') continue;

      const s = res.solution ?? {};
      const token = s.token ?? s.gRecaptchaResponse ?? s.text;
      if (!token) {
        throw new CaptchaException(
          '2captcha solution had no token/text',
          'CAPTCHA_INVALID_RESPONSE',
          HttpStatus.BAD_GATEWAY,
          { taskId },
        );
      }
      return { taskId, token, userAgent: s.userAgent, cost: res.cost };
    }

    throw new CaptchaException(
      `2captcha task ${taskId} not solved within ${this.config.getSolveTimeoutMs() / 1000}s`,
      'CAPTCHA_SOLVE_TIMEOUT',
      HttpStatus.GATEWAY_TIMEOUT,
      { taskId },
    );
  }
}
