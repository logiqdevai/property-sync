import { IntegrationType } from 'generated/prisma';

export interface ResolvedDewatermarkIntegration {
  userIntegrationId: string;
  userId: string;
  apiKey: string;
  baseUrl: string | null;
  integrationType: IntegrationType;
  isActive: boolean;
}
