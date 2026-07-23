import { UserProperty } from 'generated/prisma';

export interface CmsPushCreateResult {
  integration_property_id: string;
}

export interface CmsSyncDeleteImagesParams {
  userIntegrationId: string;
  crmPropertyId: string;
  canonicalPropertyId: string;
  imageIds: Array<number | string>;
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
    userProperty: UserProperty,
  ): Promise<void>;
  deleteImages(params: CmsSyncDeleteImagesParams): Promise<void>;
}
