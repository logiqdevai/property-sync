import { DiagnosticsMode } from 'generated/prisma';

export interface DiagnosticsRunContext {
  crawlRunId: string;
  scraperId: string;
  scraperVersion?: number;
  url: string;
  mode: DiagnosticsMode;
  retryNumber?: number;
  workerId?: string;
}

export interface DiagnosticsOutcome {
  success: boolean;
  errorSummary?: string | null;
}
