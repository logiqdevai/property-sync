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
    .transform((v) => (v ? Math.min(parseInt(v, 10), 100) : 20)),
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
  agency_id: z.string().uuid().optional(),
  user_tracked_agency_id: z.string().uuid().optional(),
});

export type UserPropertyQueryType = z.infer<typeof UserPropertyQuerySchema>;
