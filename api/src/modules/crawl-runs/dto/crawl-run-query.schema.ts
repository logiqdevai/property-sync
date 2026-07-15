import { z } from 'zod';
import { CrawlRunStatus } from 'generated/prisma';

export const CrawlRunQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 1)),
  limit: z
    .string()
    .optional()
    .transform((v) => (v ? Math.min(parseInt(v, 10), 100) : 20)),
  status: z.nativeEnum(CrawlRunStatus).optional(),
  agency_id: z.string().uuid().optional(),
  scraper_id: z.string().uuid().optional(),
  user_tracked_agency_id: z.string().uuid().optional(),
  date_from: z
    .string()
    .datetime()
    .optional()
    .transform((v) => (v ? new Date(v) : undefined)),
  date_to: z
    .string()
    .datetime()
    .optional()
    .transform((v) => (v ? new Date(v) : undefined)),
});

export type CrawlRunQueryType = z.infer<typeof CrawlRunQuerySchema>;

export const UsageQuerySchema = CrawlRunQuerySchema.extend({
  user_id: z.string().uuid().optional(),
});

export type UsageQueryType = z.infer<typeof UsageQuerySchema>;
