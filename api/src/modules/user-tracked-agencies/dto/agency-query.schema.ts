import { z } from 'zod';

export const BrowseAgencyQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 1)),
  limit: z
    .string()
    .optional()
    .transform((v) => {
      if (v === undefined || v === '') return 20;
      const parsed = parseInt(v, 10);
      if (!Number.isFinite(parsed) || parsed < 0) return 20;
      if (parsed === 0) return 0;
      return Math.min(parsed, 1000);
    }),
  search: z.string().optional(),
});

export type BrowseAgencyQueryType = z.infer<typeof BrowseAgencyQuerySchema>;
