import { Injectable, Logger } from '@nestjs/common';
import { mkdir, readFile, rm } from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { ConsoleMessage, Page } from 'playwright';
import { PrismaService } from '@/core/databases/prisma/prisma.service';
import { StealthBrowserService } from '@/integrations/crawler/services/stealth-browser.service';
import { GcsService } from '@/integrations/storage/gcs/services/gcs.service';
import { GcsFolders } from '@/shared/config/gcs-folders';
import { DiagnosticsArtifactKind, DiagnosticsMode } from 'generated/prisma';
import {
  DiagnosticsOutcome,
  DiagnosticsRunContext,
} from '../interfaces/diagnostics.interfaces';

const PLAYWRIGHT_VERSION: string = require('playwright/package.json').version;
const MAX_CONSOLE_ENTRIES = 500;

interface ConsoleEntry {
  type: string;
  text: string;
  ts: string;
}

interface PendingArtifact {
  kind: DiagnosticsArtifactKind;
  filename: string;
  contentType: string;
  buffer: Buffer;
}

/// Owns the full lifecycle described in docs/playwright-debug.md: determines whether to enable
/// tracing/video/HAR before the browser context is created, executes the caller's scraper logic,
/// then decides whether to keep or discard whatever was collected -- CrawlerService never touches
/// Playwright's tracing/video/HAR APIs directly.
@Injectable()
export class DiagnosticsCaptureService {
  private readonly logger = new Logger(DiagnosticsCaptureService.name);

  constructor(
    private readonly stealthBrowserService: StealthBrowserService,
    private readonly gcsService: GcsService,
    private readonly prisma: PrismaService,
  ) {}

  // Every mode (including PRODUCTION) now runs through here so a failure always
  // leaves behind at least a screenshot/HTML/console-log DiagnosticsPackage --
  // with 100 scrapers running unattended, "no diagnostics_mode flipped on" can't
  // mean "no idea why it failed". TRACE/FULL_DEBUG add progressively heavier
  // artifacts (Playwright trace, then video + HAR) on top of that baseline.
  async run<T extends DiagnosticsOutcome>(
    ctx: DiagnosticsRunContext,
    fn: (page: Page) => Promise<T>,
  ): Promise<T> {
    return this.runWithDiagnostics(ctx, fn);
  }

  private async runWithDiagnostics<T extends DiagnosticsOutcome>(
    ctx: DiagnosticsRunContext,
    fn: (page: Page) => Promise<T>,
  ): Promise<T> {
    const startedAt = new Date();
    const traceEnabled = ctx.mode !== DiagnosticsMode.PRODUCTION;
    const fullDebug = ctx.mode === DiagnosticsMode.FULL_DEBUG;

    const workDir = path.join(os.tmpdir(), 'diagnostics', ctx.crawlRunId);
    const videoDir = path.join(workDir, 'video');
    const tracePath = path.join(workDir, 'trace.zip');
    const harPath = path.join(workDir, 'network.har');
    await mkdir(fullDebug ? videoDir : workDir, { recursive: true });

    const { context, page } = await this.stealthBrowserService.newStealthPage({
      ...(fullDebug ? { recordVideo: { dir: videoDir } } : {}),
      ...(fullDebug
        ? { recordHar: { path: harPath, content: 'embed' as const } }
        : {}),
    });

    const consoleEntries: ConsoleEntry[] = [];
    const pushConsoleEntry = (type: string, text: string) => {
      if (consoleEntries.length >= MAX_CONSOLE_ENTRIES) return;
      consoleEntries.push({ type, text, ts: new Date().toISOString() });
    };
    page.on('console', (msg: ConsoleMessage) =>
      pushConsoleEntry(msg.type(), msg.text()),
    );
    page.on('pageerror', (err) => pushConsoleEntry('pageerror', err.message));

    if (traceEnabled) {
      await context.tracing.start({ screenshots: true, snapshots: true });
    }

    let outcome: T | null = null;
    let thrown: unknown = null;

    try {
      outcome = await fn(page);
    } catch (err) {
      thrown = err;
    }

    const success = outcome?.success ?? false;
    const errorSummary =
      outcome?.errorSummary ??
      (thrown instanceof Error
        ? thrown.message
        : thrown
          ? String(thrown)
          : null);
    const shouldKeep = !success;

    const artifacts: PendingArtifact[] = [];

    if (shouldKeep) {
      const [screenshot, html] = await Promise.all([
        page.screenshot({ fullPage: true }).catch(() => null),
        page.content().catch(() => null),
      ]);
      if (screenshot) {
        artifacts.push({
          kind: DiagnosticsArtifactKind.SCREENSHOT,
          filename: 'screenshot.png',
          contentType: 'image/png',
          buffer: screenshot,
        });
      }
      if (html) {
        artifacts.push({
          kind: DiagnosticsArtifactKind.HTML_SNAPSHOT,
          filename: 'page.html',
          contentType: 'text/html',
          buffer: Buffer.from(html, 'utf-8'),
        });
      }
    }

    // Tracing is not retroactive but tracing.stop() always has to be called to release
    // resources -- passing no path discards it, matching the "discard on success" retention rule.
    if (traceEnabled) {
      await context.tracing.stop(shouldKeep ? { path: tracePath } : undefined);
    }

    let browserVersion: string | undefined;
    try {
      browserVersion = context.browser()?.version();
    } catch {
      browserVersion = undefined;
    }

    await this.stealthBrowserService.closeContext(context);

    if (!shouldKeep) {
      await rm(workDir, { recursive: true, force: true }).catch(
        () => undefined,
      );
      if (thrown) throw thrown;
      return outcome as T;
    }

    if (traceEnabled) {
      artifacts.push({
        kind: DiagnosticsArtifactKind.TRACE,
        filename: 'trace.zip',
        contentType: 'application/zip',
        buffer: await readFile(tracePath).catch(() => Buffer.alloc(0)),
      });
    }

    artifacts.push({
      kind: DiagnosticsArtifactKind.CONSOLE_LOG,
      filename: 'console.json',
      contentType: 'application/json',
      buffer: Buffer.from(JSON.stringify(consoleEntries, null, 2), 'utf-8'),
    });

    if (fullDebug) {
      const videoPath = await page
        .video()
        ?.path()
        .catch(() => null);
      const videoBuffer = videoPath
        ? await readFile(videoPath).catch(() => null)
        : null;
      if (videoBuffer) {
        artifacts.push({
          kind: DiagnosticsArtifactKind.VIDEO,
          filename: 'video.webm',
          contentType: 'video/webm',
          buffer: videoBuffer,
        });
      }

      const harBuffer = await readFile(harPath).catch(() => null);
      if (harBuffer) {
        artifacts.push({
          kind: DiagnosticsArtifactKind.NETWORK_HAR,
          filename: 'network.har',
          contentType: 'application/json',
          buffer: harBuffer,
        });
      }
    }

    const finishedAt = new Date();

    await this.persist({
      ctx,
      startedAt,
      finishedAt,
      failureReason: errorSummary,
      exception:
        thrown instanceof Error ? (thrown.stack ?? thrown.message) : null,
      browserVersion,
      artifacts,
    });

    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);

    if (thrown) throw thrown;
    return outcome as T;
  }

  private async persist(params: {
    ctx: DiagnosticsRunContext;
    startedAt: Date;
    finishedAt: Date;
    failureReason: string | null;
    exception: string | null;
    browserVersion?: string;
    artifacts: PendingArtifact[];
  }): Promise<void> {
    const { ctx } = params;
    const folder = `${GcsFolders.diagnostics}/${ctx.crawlRunId}`;

    const uploaded = await Promise.all(
      params.artifacts.map(async (artifact) => {
        try {
          const response = await this.gcsService.uploadImageFromBuffer(
            artifact.buffer,
            artifact.filename,
            artifact.contentType,
            folder,
          );
          return {
            kind: artifact.kind,
            path: response.path,
            content_type: artifact.contentType,
            size_bytes: response.size,
          };
        } catch (error) {
          this.logger.error(
            `Failed to upload diagnostics artifact ${artifact.filename} for crawl run ${ctx.crawlRunId}`,
            error,
          );
          return null;
        }
      }),
    );

    const artifactRows = uploaded.filter(
      (row): row is NonNullable<typeof row> => row !== null,
    );

    if (artifactRows.length === 0) {
      this.logger.warn(
        `No diagnostics artifacts uploaded for crawl run ${ctx.crawlRunId} -- skipping DiagnosticsPackage row`,
      );
      return;
    }

    await this.prisma.diagnosticsPackage.create({
      data: {
        crawl_run_id: ctx.crawlRunId,
        scraper_id: ctx.scraperId,
        mode: ctx.mode,
        url: ctx.url,
        worker_id: ctx.workerId ?? null,
        browser_version: params.browserVersion ?? null,
        playwright_version: PLAYWRIGHT_VERSION,
        scraper_version: ctx.scraperVersion ?? null,
        retry_number: ctx.retryNumber ?? null,
        started_at: params.startedAt,
        finished_at: params.finishedAt,
        duration_ms: params.finishedAt.getTime() - params.startedAt.getTime(),
        failure_reason: params.failureReason,
        exception: params.exception,
        artifacts: {
          create: artifactRows,
        },
      },
    });
  }
}
