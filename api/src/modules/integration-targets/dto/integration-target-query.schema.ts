import { z } from 'zod';
import { AuthType, IntegrationType } from 'generated/prisma';

const booleanQueryParam = z
  .enum(['true', 'false'])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === 'true'));

export const IntegrationTargetQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 1)),
  limit: z
    .string()
    .optional()
    .transform((v) => (v ? Math.min(parseInt(v, 10), 100) : 20)),
  integration_type: z.nativeEnum(IntegrationType).optional(),
  auth_type: z.nativeEnum(AuthType).optional(),
  is_visible: booleanQueryParam,
  is_enabled: booleanQueryParam,
});

export type IntegrationTargetQueryType = z.infer<typeof IntegrationTargetQuerySchema>;
