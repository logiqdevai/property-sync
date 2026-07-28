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

export interface CmsSyncPushSiteOverride {
  selected: boolean;
  name: string;
  agent_site_id: number;
  show_on_slider: 0 | 1;
  show_on_first_page: 0 | 1;
  show_on_relative_pages: 0 | 1;
}

export interface CmsSyncPushOptions {
  watermarkManualSelection?: boolean;
  propertyNote?: string;
  sitesOverride?: CmsSyncPushSiteOverride[];
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
