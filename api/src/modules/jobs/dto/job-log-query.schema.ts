import { z } from 'zod';
import { JobStatus } from 'generated/prisma';

export const JobLogQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 1)),
  limit: z
    .string()
    .optional()
    .transform((v) => (v ? Math.min(parseInt(v, 10), 100) : 20)),
  status: z.nativeEnum(JobStatus).optional(),
  queue_name: z.string().optional(),
});

export type JobLogQueryType = z.infer<typeof JobLogQuerySchema>;
