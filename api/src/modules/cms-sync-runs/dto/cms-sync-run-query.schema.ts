import { z } from 'zod';
import { CmsSyncStatus } from 'generated/prisma';

const paginationFields = {
  page: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 1)),
  limit: z
    .string()
    .optional()
    .transform((v) => (v ? Math.min(parseInt(v, 10), 100) : 20)),
};

const dateFields = {
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
};

export const UserCmsSyncRunQuerySchema = z.object({
  ...paginationFields,
  status: z.nativeEnum(CmsSyncStatus).optional(),
  user_integration_id: z.string().uuid().optional(),
  ...dateFields,
});

export type UserCmsSyncRunQueryType = z.infer<typeof UserCmsSyncRunQuerySchema>;

export const AdminCmsSyncRunQuerySchema = z.object({
  ...paginationFields,
  status: z.nativeEnum(CmsSyncStatus).optional(),
  user_id: z.string().uuid().optional(),
  user_integration_id: z.string().uuid().optional(),
  ...dateFields,
});

export type AdminCmsSyncRunQueryType = z.infer<typeof AdminCmsSyncRunQuerySchema>;

export const AdminCmsSyncRunIntegrationsQuerySchema = z.object({
  user_id: z.string().uuid().optional(),
});

export type AdminCmsSyncRunIntegrationsQueryType = z.infer<
  typeof AdminCmsSyncRunIntegrationsQuerySchema
>;
