import { DiagnosticsMode } from 'generated/prisma';

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
}

export interface DiagnosticsOutcome {
  success: boolean;
  errorSummary?: string | null;
}
