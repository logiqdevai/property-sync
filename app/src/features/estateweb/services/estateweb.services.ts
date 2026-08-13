import axiosInstance from "@/config/api/axios";
import { ApiRoutes } from "@/config/api/routes";
import type { EstateWebPushSiteSetting } from "../interfaces/estateweb-integration-settings.interfaces";
import type {
  EstateWebAdminIntegration,
  EstateWebBulkSitesUpdateResult,
  EstateWebDuplicatePropertyGroup,
  EstateWebFlatCatalogItem,
  EstateWebLocationCatalogItem,
  EstateWebPropertyTypeCatalogItem,
} from "../interfaces/estateweb.interfaces";

export const getEstateWebLocationCatalog = async (): Promise<
  EstateWebLocationCatalogItem[]
> => {
  try {
    const response = await axiosInstance.get(
      ApiRoutes.estateweb.catalog.locations,
    );
    return response.data;
  } catch {
    throw new Error("Failed to fetch EstateWeb locations. Please try again.");
  }
};

export const getEstateWebFloorCatalog = async (): Promise<
  EstateWebFlatCatalogItem[]
> => {
  try {
    const response = await axiosInstance.get(ApiRoutes.estateweb.catalog.floors);
    return response.data;
  } catch {
    throw new Error("Failed to fetch floor options. Please try again.");
  }
};

export const getEstateWebEnergyClassCatalog = async (): Promise<
  EstateWebFlatCatalogItem[]
> => {
  try {
    const response = await axiosInstance.get(
      ApiRoutes.estateweb.catalog.energyClasses,
    );
    return response.data;
  } catch {
    throw new Error("Failed to fetch energy class options. Please try again.");
  }
};

export const getEstateWebRoadTypeCatalog = async (): Promise<
  EstateWebFlatCatalogItem[]
> => {
  try {
    const response = await axiosInstance.get(
      ApiRoutes.estateweb.catalog.roadTypes,
    );
    return response.data;
  } catch {
    throw new Error("Failed to fetch road type options. Please try again.");
  }
};

export const getEstateWebListingTypeCatalog = async (): Promise<
  EstateWebFlatCatalogItem[]
> => {
  try {
    const response = await axiosInstance.get(
      ApiRoutes.estateweb.catalog.listingTypes,
    );
    return response.data;
  } catch {
    throw new Error("Failed to fetch listing types. Please try again.");
  }
};

export const getEstateWebPropertyTypeCatalog = async (): Promise<
  EstateWebPropertyTypeCatalogItem[]
> => {
  try {
    const response = await axiosInstance.get(
      ApiRoutes.estateweb.catalog.propertyTypes,
    );
    return response.data;
  } catch {
    throw new Error("Failed to fetch property types. Please try again.");
  }
};

export const getEstateWebFeaturesCatalog = async (): Promise<
  EstateWebFlatCatalogItem[]
> => {
  try {
    const response = await axiosInstance.get(
      ApiRoutes.estateweb.catalog.features,
    );
    return response.data;
  } catch {
    throw new Error("Failed to fetch features. Please try again.");
  }
};

export const getEstateWebAdminIntegrations = async (): Promise<
  EstateWebAdminIntegration[]
> => {
  try {
    const response = await axiosInstance.get(ApiRoutes.admin.estateweb.integrations);
    return response.data;
  } catch (error: any) {
    throw new Error(
      error?.response?.data?.message ||
        "Failed to fetch EstateWeb integrations. Please try again.",
    );
  }
};

export const getEstateWebDuplicateProperties = async (
  userIntegrationId: string,
): Promise<EstateWebDuplicatePropertyGroup[]> => {
  try {
    const response = await axiosInstance.get(
      ApiRoutes.admin.estateweb.duplicates(userIntegrationId),
    );
    return response.data;
  } catch (error: any) {
    throw new Error(
      error?.response?.data?.message ||
        "Failed to check EstateWeb for duplicate properties. Please try again.",
    );
  }
};

export const bulkUpdateEstateWebPropertySites = async (
  userIntegrationId: string,
  codes: string[],
  sites: EstateWebPushSiteSetting[],
): Promise<EstateWebBulkSitesUpdateResult[]> => {
  try {
    const response = await axiosInstance.post(
      ApiRoutes.admin.estateweb.bulkUpdateSites(userIntegrationId),
      { codes, sites },
    );
    return response.data;
  } catch (error: any) {
    throw new Error(
      error?.response?.data?.message ||
        "Failed to update EstateWeb property sites. Please try again.",
    );
  }
};
