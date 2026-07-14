import { z } from 'zod';
import { AgencyStatus } from 'generated/prisma';

const booleanQueryParam = z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true'));

export const AgencyQuerySchema = z.object({
    page: z
        .string()
        .optional()
        .transform((v) => (v ? parseInt(v, 10) : 1)),
    limit: z
        .string()
        .optional()
        .transform((v) => (v ? Math.min(parseInt(v, 10), 100) : 20)),
    search: z.string().optional(),
    status: z.nativeEnum(AgencyStatus).optional(),
    country: z.string().optional(),
    city: z.string().optional(),
    is_visible: booleanQueryParam,
    is_enabled: booleanQueryParam,
});

export type AgencyQueryType = z.infer<typeof AgencyQuerySchema>;
