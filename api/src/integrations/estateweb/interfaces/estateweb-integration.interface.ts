import { IntegrationType } from 'generated/prisma';

export interface ResolvedEstateWebIntegration {
  userIntegrationId: string;
  userId: string;
  email: string;
  password: string;
  baseUrl: string;
  integrationType: IntegrationType;
  isActive: boolean;
}

export interface ResolvedEstateWebTrackedAgencyLink {
  linkId: string;
  userTrackedAgencyId: string;
  sourceAgencyId: string;
  integration: ResolvedEstateWebIntegration;
}
