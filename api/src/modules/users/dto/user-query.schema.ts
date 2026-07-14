import { z } from 'zod';
import { AuthRole } from 'generated/prisma';

export const UserQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 1)),
  limit: z
    .string()
    .optional()
    .transform((v) => (v ? Math.min(parseInt(v, 10), 100) : 20)),
  search: z.string().optional(),
  role: z.nativeEnum(AuthRole).optional(),
});

export type UserQueryType = z.infer<typeof UserQuerySchema>;
