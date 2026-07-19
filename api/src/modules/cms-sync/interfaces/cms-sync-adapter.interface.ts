import { UserProperty } from 'generated/prisma';

export interface CmsPushCreateResult {
  integration_property_id: string;
}

export interface CmsSyncAdapter {
  pushCreate(
    userIntegrationId: string,
    userProperty: UserProperty,
  ): Promise<CmsPushCreateResult>;
  pushUpdate(
    userIntegrationId: string,
    integrationPropertyId: string,
    userProperty: UserProperty,
  ): Promise<void>;
  pushRemove(
    userIntegrationId: string,
    integrationPropertyId: string,
  ): Promise<void>;
}
