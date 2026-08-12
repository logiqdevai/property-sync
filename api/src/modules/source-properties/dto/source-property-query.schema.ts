import { z } from 'zod';
import { PropertyStatus } from 'generated/prisma';
import { queryOrderSchemaFields } from '@/shared/utils/query-order.util';

export const SourcePropertyQuerySchema = z.object({
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
      return Math.min(parsed, 100);
    }),
  status: z.nativeEnum(PropertyStatus).optional(),
  search: z.string().optional(),
  agency_id: z.string().uuid().optional(),
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
  ...queryOrderSchemaFields,
});

export type SourcePropertyQueryType = z.infer<typeof SourcePropertyQuerySchema>;
