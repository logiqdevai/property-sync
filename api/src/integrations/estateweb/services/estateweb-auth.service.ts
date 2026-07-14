import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { chromium } from 'playwright';
import { NotificationType } from 'generated/prisma';
import { EstateWebConfig } from '../config/estateweb.config';
import { EstateWebException } from '../exceptions/estateweb.exception';
import {
  EstateWebCredentials,
  EstateWebLoginOptions,
  EstateWebLoginResult,
} from '../interfaces/estateweb-auth.interface';
import { EstateWebSession } from '../interfaces/estateweb-session.interface';
import { extractAppToken, extractCsrfToken } from '../utils/estateweb-html.util';
import { EstateWebNotificationService } from './estateweb-notification.service';

@Injectable()
export class EstateWebAuthService {
  private readonly logger = new Logger(EstateWebAuthService.name);

  constructor(
    private readonly estateWebConfig: EstateWebConfig,
    private readonly estateWebNotificationService: EstateWebNotificationService,
  ) {}

  async login(
    credentials: EstateWebCredentials,
    options: EstateWebLoginOptions = {},
  ): Promise<EstateWebSession> {
    const result = await this.loginWithPlaywright(credentials, options);
    return this.toSession(result);
  }

  async loginWithPlaywright(
    credentials: EstateWebCredentials,
    options: EstateWebLoginOptions = {},
  ): Promise<EstateWebLoginResult> {
    const baseUrl = this.estateWebConfig.normalizeBaseUrl(credentials.baseUrl);
    const timeoutMs = options.timeoutMs ?? this.estateWebConfig.getLoginTimeoutMs();
    const headless = options.headless ?? this.estateWebConfig.isHeadless();

    let browser;
    try {
      browser = await chromium.launch({ headless });
    } catch (error) {
      throw this.wrapLoginError(
        new EstateWebException(
          'EstateWeb login failed: could not launch browser',
          NotificationType.ESTATEWEB_LOGIN_FAILED,
          HttpStatus.SERVICE_UNAVAILABLE,
          { cause: error instanceof Error ? error.message : String(error) },
        ),
        options,
      );
    }

    const context = await browser.newContext({
      baseURL: baseUrl,
      locale: 'en-US',
    });
    const page = await context.newPage();

    try {
      await page.goto('/login', {
        waitUntil: 'domcontentloaded',
        timeout: timeoutMs,
      });

      const csrf = await page
        .locator('input[name="__csrf"]')
        .getAttribute('value')
        .catch(() => null);

      if (!csrf) {
        throw this.wrapLoginError(
          new EstateWebException(
            'EstateWeb login failed: missing CSRF token',
            NotificationType.ESTATEWEB_MISSING_CSRF,
            HttpStatus.UNAUTHORIZED,
          ),
          options,
        );
      }

      await page.locator('input[name="email"]').fill(credentials.email);
      await page.locator('input[name="password"]').fill(credentials.password);

      await Promise.all([
        page.waitForNavigation({ timeout: timeoutMs }).catch(() => null),
        page.locator('form[action="/login"] button').click(),
      ]);

      if (!page.url().includes('/app')) {
        await page.waitForTimeout(500);
      }

      if (page.url().includes('/login')) {
        throw this.wrapLoginError(
          new EstateWebException(
            'EstateWeb login failed: invalid credentials or login redirect did not complete',
            NotificationType.ESTATEWEB_LOGIN_REDIRECT_FAILED,
            HttpStatus.UNAUTHORIZED,
            { url: page.url() },
          ),
          options,
        );
      }

      const cookies = await context.cookies();
      const estateSession =
        cookies.find(
          (cookie) =>
            cookie.name === this.estateWebConfig.getConfig().sessionCookie,
        )?.value ?? null;

      if (!estateSession) {
        throw this.wrapLoginError(
          new EstateWebException(
            'EstateWeb login failed: missing estate_session cookie',
            NotificationType.ESTATEWEB_MISSING_SESSION_COOKIE,
            HttpStatus.UNAUTHORIZED,
          ),
          options,
        );
      }

      const html = await page.content().catch(() => '');
      const token = extractAppToken(html);

      if (!token) {
        this.logger.warn(
          'EstateWeb login succeeded but bearer token was not found in app HTML',
        );
      }

      return {
        baseUrl,
        email: credentials.email,
        password: credentials.password,
        url: page.url(),
        csrf,
        token,
        estateSession,
      };
    } catch (error) {
      if (error instanceof EstateWebException) {
        throw error;
      }

      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('Timeout') || message.includes('timeout')) {
        throw this.wrapLoginError(
          new EstateWebException(
            'EstateWeb login timed out',
            NotificationType.ESTATEWEB_REQUEST_TIMEOUT,
            HttpStatus.REQUEST_TIMEOUT,
          ),
          options,
        );
      }

      this.logger.error('EstateWeb login failed', error);
      throw this.wrapLoginError(
        new EstateWebException(
          'EstateWeb login failed',
          NotificationType.ESTATEWEB_LOGIN_FAILED,
          HttpStatus.UNAUTHORIZED,
          { cause: message },
        ),
        options,
      );
    } finally {
      await context.close().catch(() => undefined);
      await browser.close().catch(() => undefined);
    }
  }

  async refreshToken(
    session: EstateWebSession,
    credentials: EstateWebCredentials,
    options: EstateWebLoginOptions = {},
  ): Promise<EstateWebSession> {
    const baseUrl = this.estateWebConfig.normalizeBaseUrl(session.baseUrl);
    const timeoutMs = this.estateWebConfig.getLoginTimeoutMs();
    const headless = this.estateWebConfig.isHeadless();

    const browser = await chromium.launch({ headless });
    const context = await browser.newContext({
      baseURL: baseUrl,
      locale: 'en-US',
    });

    await context.addCookies([
      {
        name: this.estateWebConfig.getConfig().sessionCookie,
        value: session.estateSession,
        domain: new URL(baseUrl).hostname,
        path: '/',
      },
    ]);

    const page = await context.newPage();

    try {
      await page.goto('/app', {
        waitUntil: 'domcontentloaded',
        timeout: timeoutMs,
      });

      const html = await page.content().catch(() => '');
      const token = extractAppToken(html);

      if (token) {
        return {
          ...session,
          token,
          loggedInAt: new Date().toISOString(),
        };
      }

      return this.login(credentials, options);
    } catch (error) {
      this.logger.warn('EstateWeb token refresh failed, re-authenticating');
      return this.login(credentials, options);
    } finally {
      await context.close().catch(() => undefined);
      await browser.close().catch(() => undefined);
    }
  }

  async fetchCsrfFromLoginPage(baseUrl: string): Promise<string> {
    const normalizedBaseUrl = this.estateWebConfig.normalizeBaseUrl(baseUrl);
    let response: Response;

    try {
      response = await fetch(`${normalizedBaseUrl}/login`);
    } catch (error) {
      throw new EstateWebException(
        'Could not load EstateWeb login page',
        NotificationType.ESTATEWEB_NETWORK_ERROR,
        HttpStatus.BAD_GATEWAY,
        { cause: error instanceof Error ? error.message : String(error) },
      );
    }

    if (!response.ok) {
      throw new EstateWebException(
        `Could not load EstateWeb login page (${response.status})`,
        NotificationType.ESTATEWEB_API_ERROR,
        HttpStatus.BAD_GATEWAY,
        { status: response.status },
      );
    }

    const html = await response.text();
    const csrf = extractCsrfToken(html);

    if (!csrf) {
      throw new EstateWebException(
        'Could not extract EstateWeb CSRF token',
        NotificationType.ESTATEWEB_MISSING_CSRF,
        HttpStatus.BAD_REQUEST,
      );
    }

    return csrf;
  }

  private wrapLoginError(
    error: EstateWebException,
    options: EstateWebLoginOptions,
  ): EstateWebException {
    if (options.notifyOnFailure !== false) {
      this.estateWebNotificationService.captureError(
        {
          userIntegrationId: options.userIntegrationId,
          operation: 'login',
          path: '/login',
          method: 'POST',
          notificationType: error.code,
        },
        error,
      );
    }
    return error;
  }

  private toSession(result: EstateWebLoginResult): EstateWebSession {
    return {
      baseUrl: result.baseUrl,
      estateSession: result.estateSession,
      token: result.token,
      csrf: result.csrf,
      loggedInAt: new Date().toISOString(),
      url: result.url,
    };
  }
}

