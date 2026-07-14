import { z } from 'zod';
import { GenerationRunStatus, GenerationTrigger } from 'generated/prisma';

export const GenerationRunQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 1)),
  limit: z
    .string()
    .optional()
    .transform((v) => (v ? Math.min(parseInt(v, 10), 100) : 20)),
  status: z.nativeEnum(GenerationRunStatus).optional(),
  trigger: z.nativeEnum(GenerationTrigger).optional(),
  source_agency_id: z.string().uuid().optional(),
  scraper_id: z.string().uuid().optional(),
});

export type GenerationRunQueryType = z.infer<typeof GenerationRunQuerySchema>;
