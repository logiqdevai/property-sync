import { z } from 'zod';
import { PropertyStatus } from 'generated/prisma';

const booleanQueryParam = z
  .enum(['true', 'false'])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === 'true'));

export const UserPropertyQuerySchema = z.object({
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
  city: z.string().optional(),
  price_min: z
    .string()
    .optional()
    .transform((v) => (v ? parseFloat(v) : undefined)),
  price_max: z
    .string()
    .optional()
    .transform((v) => (v ? parseFloat(v) : undefined)),
  has_duplicate_group: booleanQueryParam,
  pushed_to_crm: booleanQueryParam,
  pending_crm_update: booleanQueryParam,
  agency_id: z.string().uuid().optional(),
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

export type UserPropertyQueryType = z.infer<typeof UserPropertyQuerySchema>;
