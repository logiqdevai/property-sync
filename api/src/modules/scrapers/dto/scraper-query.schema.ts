import { z } from 'zod';
import { ScraperStatus, ScraperHealth } from 'generated/prisma';

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
});

export type ScraperQueryType = z.infer<typeof ScraperQuerySchema>;
