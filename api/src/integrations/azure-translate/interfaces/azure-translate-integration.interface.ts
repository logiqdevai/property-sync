import { IntegrationType } from 'generated/prisma';

export interface ResolvedAzureTranslateIntegration {
  userIntegrationId: string;
  userId: string;
  apiKey: string;
  integrationType: IntegrationType;
  isActive: boolean;
}
