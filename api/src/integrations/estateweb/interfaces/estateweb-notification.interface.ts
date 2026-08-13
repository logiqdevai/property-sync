import { NotificationType } from 'generated/prisma';

export interface EstateWebErrorContext {
  userIntegrationId?: string;
  sourceAgencyId?: string;
  agencyName?: string;
  operation: string;
  path?: string;
  method?: string;
  propertyId?: number | string;
  upstreamStatus?: number;
  notificationType?: NotificationType;
}
