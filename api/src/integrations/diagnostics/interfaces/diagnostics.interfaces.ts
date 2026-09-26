import { DiagnosticsMode } from 'generated/prisma';
import type { ProxyBrowserSession } from '@/integrations/crawler/interfaces/proxy-browser-session.interface';

export interface DiagnosticsRunContext {
  crawlRunId: string;
  scraperId: string;
  scraperVersion?: number;
  url: string;
  mode: DiagnosticsMode;
  retryNumber?: number;
  workerId?: string;
  // See NewStealthPageOptions on StealthBrowserService -- routes this crawl
  // through the managed remote browser and skips image bytes.
  useManagedBrowser?: boolean;
  // See NewStealthPageOptions.proxySession -- runs this crawl in a local
  // Chromium through a Webshare proxy, blocking heavy resources.
  proxySession?: ProxyBrowserSession;
}

export interface DiagnosticsOutcome {
  success: boolean;
  errorSummary?: string | null;
}
