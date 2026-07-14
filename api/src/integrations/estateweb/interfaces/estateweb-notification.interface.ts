import { NotificationType } from 'generated/prisma';

export interface EstateWebErrorContext {
  userIntegrationId?: string;
  sourceAgencyId?: string;
  operation: string;
  path?: string;
  method?: string;
  propertyId?: number | string;
  statusCode?: number;
  notificationType?: NotificationType;
}
