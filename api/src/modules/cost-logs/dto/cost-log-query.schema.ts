import { z } from 'zod';
import { CostOperationType, IntegrationType } from 'generated/prisma';

export const CostLogQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 1)),
  limit: z
    .string()
    .optional()
    .transform((v) => (v ? Math.min(parseInt(v, 10), 100) : 20)),
  user_id: z.string().uuid().optional(),
  operation_type: z.nativeEnum(CostOperationType).optional(),
  provider: z.nativeEnum(IntegrationType).optional(),
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

export type CostLogQueryType = z.infer<typeof CostLogQuerySchema>;
