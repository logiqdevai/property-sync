import { z } from 'zod';
import { ActivityOutcome } from 'generated/prisma';

export const ActivityLogQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .transform((v) => (v ? Math.max(parseInt(v, 10) || 1, 1) : 1)),
  limit: z
    .string()
    .optional()
    .transform((v) => (v ? Math.min(Math.max(parseInt(v, 10) || 20, 1), 100) : 20)),
  /** Matches either the real actor or the account acted upon. */
  user_id: z.string().uuid().optional(),
  actor_id: z.string().uuid().optional(),
  action: z.string().min(1).max(200).optional(),
  category: z.string().min(1).max(100).optional(),
  entity_type: z.string().min(1).max(100).optional(),
  entity_id: z.string().min(1).max(100).optional(),
  outcome: z.nativeEnum(ActivityOutcome).optional(),
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

export type ActivityLogQueryType = z.infer<typeof ActivityLogQuerySchema>;
