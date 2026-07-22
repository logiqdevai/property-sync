import { z } from 'zod';
import { ListingType, PropertyStatus, PropertyType } from 'generated/prisma';

const booleanQueryParam = z
  .enum(['true', 'false'])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === 'true'));

export const PropertyQuerySchema = z.object({
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
  change: z.enum(['new', 'updated']).optional(),
  listing_type: z.nativeEnum(ListingType).optional(),
  property_type: z.nativeEnum(PropertyType).optional(),
  city: z.string().optional(),
  price_min: z
    .string()
    .optional()
    .transform((v) => (v ? parseFloat(v) : undefined)),
  price_max: z
    .string()
    .optional()
    .transform((v) => (v ? parseFloat(v) : undefined)),
  duplicate_group_id: z.string().uuid().optional(),
  has_duplicate_group: booleanQueryParam,
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
});

export type PropertyQueryType = z.infer<typeof PropertyQuerySchema>;
