import axiosInstance from "@/config/api/axios";
import { ApiRoutes } from "@/config/api/routes";
import type {
  DeletePropertiesPayload,
  DedupePropertiesPayload,
  DedupePropertiesResult,
  MergePropertiesPayload,
  PaginatedResponse,
  Property,
  PropertyCountQuery,
  PropertyCountResponse,
  PropertyDetail,
  PropertyListQuery,
  PropertyMapQuery,
  PropertyMapResponse,
  SplitPropertiesPayload,
  SplitPropertiesResult,
  TruncatePropertyDescriptionsPayload,
  TruncatePropertyDescriptionsResult,
} from "../interfaces/properties.interfaces";

export const getProperties = async (
  query?: PropertyListQuery,
): Promise<PaginatedResponse<Property>> => {
  try {
    const response = await axiosInstance.get(ApiRoutes.admin.properties.list, {
      params: query,
    });
    return response.data;
  } catch {
    throw new Error("Failed to fetch properties. Please try again.");
  }
};

export const getPropertiesCount = async (
  query?: PropertyCountQuery,
): Promise<PropertyCountResponse> => {
  try {
    const response = await axiosInstance.get(ApiRoutes.admin.properties.count, {
      params: query,
    });
    return response.data;
  } catch {
    throw new Error("Failed to fetch property count. Please try again.");
  }
};

export const getPropertiesMap = async (
  query?: PropertyMapQuery,
): Promise<PropertyMapResponse> => {
  try {
    const response = await axiosInstance.get(ApiRoutes.admin.properties.map, {
      params: query,
    });
    return response.data;
  } catch {
    throw new Error("Failed to fetch properties for map. Please try again.");
  }
};

export const getProperty = async (id: string): Promise<PropertyDetail> => {
  try {
    const response = await axiosInstance.get(ApiRoutes.admin.properties.detail(id));
    return response.data;
  } catch (error: any) {
    throw new Error(
      error?.response?.data?.message || "Failed to fetch property. Please try again.",
    );
  }
};

export const mergeProperties = async (
  payload: MergePropertiesPayload,
): Promise<Property[]> => {
  try {
    const response = await axiosInstance.post(ApiRoutes.admin.properties.merge, payload);
    return response.data;
  } catch (error: any) {
    throw new Error(error?.response?.data?.message || "Failed to merge properties.");
  }
};

export const splitProperty = async (id: string): Promise<Property> => {
  try {
    const response = await axiosInstance.post(ApiRoutes.admin.properties.split(id));
    return response.data;
  } catch (error: any) {
    throw new Error(error?.response?.data?.message || "Failed to split property from group.");
  }
};

export const deleteProperty = async (id: string): Promise<void> => {
  try {
    await axiosInstance.delete(ApiRoutes.admin.properties.detail(id));
  } catch (error: any) {
    throw new Error(error?.response?.data?.message || "Failed to delete property.");
  }
};

export const deleteProperties = async (
  payload: DeletePropertiesPayload,
): Promise<{ deleted: number }> => {
  try {
    const response = await axiosInstance.post(ApiRoutes.admin.properties.bulkDelete, payload);
    return response.data;
  } catch (error: any) {
    throw new Error(error?.response?.data?.message || "Failed to delete properties.");
  }
};

export const dedupePropertyGroups = async (
  payload: DedupePropertiesPayload,
): Promise<DedupePropertiesResult> => {
  try {
    const response = await axiosInstance.post(
      ApiRoutes.admin.properties.dedupeGroups,
      payload,
    );
    return response.data;
  } catch (error: any) {
    throw new Error(
      error?.response?.data?.message || "Failed to keep one property per group.",
    );
  }
};

export const splitProperties = async (
  payload: SplitPropertiesPayload,
): Promise<SplitPropertiesResult> => {
  try {
    const response = await axiosInstance.post(
      ApiRoutes.admin.properties.bulkSplit,
      payload,
    );
    return response.data;
  } catch (error: any) {
    throw new Error(
      error?.response?.data?.message || "Failed to split properties from groups.",
    );
  }
};

export const truncatePropertyDescriptions = async (
  payload: TruncatePropertyDescriptionsPayload,
): Promise<TruncatePropertyDescriptionsResult> => {
  try {
    const response = await axiosInstance.post(
      ApiRoutes.admin.properties.truncateDescriptions,
      payload,
    );
    return response.data;
  } catch (error: any) {
    throw new Error(
      error?.response?.data?.message || "Failed to truncate property descriptions.",
    );
  }
};
