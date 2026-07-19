import axiosInstance from "@/config/api/axios";
import { ApiRoutes } from "@/config/api/routes";
import type {
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
