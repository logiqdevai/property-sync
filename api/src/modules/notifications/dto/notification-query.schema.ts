import { z } from 'zod';
import { NotificationSeverity, NotificationType } from 'generated/prisma';

export const NotificationQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 1)),
  limit: z
    .string()
    .optional()
    .transform((v) => (v ? Math.min(parseInt(v, 10), 100) : 20)),
  type: z.nativeEnum(NotificationType).optional(),
  severity: z.nativeEnum(NotificationSeverity).optional(),
  is_read: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
});

export type NotificationQueryType = z.infer<typeof NotificationQuerySchema>;
