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
});

export type ScraperQueryType = z.infer<typeof ScraperQuerySchema>;
