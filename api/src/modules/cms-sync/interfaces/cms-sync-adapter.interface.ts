import { UserProperty } from 'generated/prisma';

export interface CmsPushCreateResult {
  integration_property_id: string;
}

export interface CmsSyncDeleteImagesParams {
  userIntegrationId: string;
  crmPropertyId: string;
  userPropertyId: string;
  imageIds: Array<number | string>;
}

export interface CmsSyncCreateImagesParams {
  userIntegrationId: string;
  crmPropertyId: string;
  userPropertyId: string;
  sourceImageUrls: string[];
}

export interface CmsSyncUpdateImagesParams {
  userIntegrationId: string;
  crmPropertyId: string;
  userPropertyId: string;
  imageIds: Array<number | string>;
  show_on_site: boolean;
  show_on_groups: boolean;
  show_on_foreign_agents: boolean;
}

export interface CmsSyncPushOptions {
  removeWatermark?: boolean;
}

export interface CmsSyncAdapter {
  pushCreate(
    userIntegrationId: string,
    userProperty: UserProperty,
    options?: CmsSyncPushOptions,
  ): Promise<CmsPushCreateResult>;
  pushUpdate(
    userIntegrationId: string,
    integrationPropertyId: string,
    userProperty: UserProperty,
    options?: CmsSyncPushOptions,
  ): Promise<void>;
  pushRemove(
    userIntegrationId: string,
    integrationPropertyId: string,
    userProperty: UserProperty,
    options?: CmsSyncPushOptions,
  ): Promise<void>;
  deleteImages(params: CmsSyncDeleteImagesParams): Promise<void>;
  createImages(params: CmsSyncCreateImagesParams): Promise<void>;
  updateImages(params: CmsSyncUpdateImagesParams): Promise<void>;
}
