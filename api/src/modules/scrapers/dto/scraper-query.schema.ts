import { z } from 'zod';
import { ScraperStatus, ScraperHealth, CrawlRunStatus } from 'generated/prisma';

export const TODAY_CRAWL_STATUS_NOT_RUN = 'NOT_RUN' as const;

export const ScraperQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 1)),
  limit: z
    .string()
    .optional()
    .transform((v) => (v ? Math.min(parseInt(v, 10), 100) : 20)),
  search: z.string().optional(),
  status: z.nativeEnum(ScraperStatus).optional(),
  health: z.nativeEnum(ScraperHealth).optional(),
  source_agency_id: z.string().uuid().optional(),
  // Bounds of "today" in the viewer's own timezone, used to attach each
  // scraper's today_crawl_run. Falls back to the server's UTC day if omitted.
  today_from: z
    .string()
    .datetime()
    .optional()
    .transform((v) => (v ? new Date(v) : undefined)),
  today_to: z
    .string()
    .datetime()
    .optional()
    .transform((v) => (v ? new Date(v) : undefined)),
  // Filters scrapers by their today_crawl_run status. 'NOT_RUN' means no crawl_run
  // was created for the scraper within [today_from, today_to) -- used to find
  // scrapers that haven't run yet today so they can be bulk-run.
  today_crawl_status: z
    .union([z.literal(TODAY_CRAWL_STATUS_NOT_RUN), z.nativeEnum(CrawlRunStatus)])
    .optional(),
});

export type ScraperQueryType = z.infer<typeof ScraperQuerySchema>;
