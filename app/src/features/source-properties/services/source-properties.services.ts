import axiosInstance from "@/config/api/axios";
import { ApiRoutes } from "@/config/api/routes";
import type {
  DeleteSourcePropertiesPayload,
  DeleteSourcePropertiesResult,
  SourcePropertyCountQuery,
  SourcePropertyCountResponse,
  SourcePropertyDetail,
  SourcePropertyListQuery,
  SourcePropertyPaginatedResponse,
} from "../interfaces/source-properties.interfaces";

export const getSourceProperties = async (
  query?: SourcePropertyListQuery,
): Promise<SourcePropertyPaginatedResponse> => {
  try {
    const response = await axiosInstance.get(ApiRoutes.admin.sourceProperties.list, {
      params: query,
    });
    return response.data;
  } catch {
    throw new Error("Failed to fetch source properties. Please try again.");
  }
};

export const getSourcePropertiesCount = async (
  query?: SourcePropertyCountQuery,
): Promise<SourcePropertyCountResponse> => {
  try {
    const response = await axiosInstance.get(ApiRoutes.admin.sourceProperties.count, {
      params: query,
    });
    return response.data;
  } catch {
    throw new Error("Failed to fetch source property count. Please try again.");
  }
};

export const getSourceProperty = async (
  id: string,
): Promise<SourcePropertyDetail> => {
  try {
    const response = await axiosInstance.get(
      ApiRoutes.admin.sourceProperties.detail(id),
    );
    return response.data;
  } catch (error: any) {
    throw new Error(
      error?.response?.data?.message ||
        "Failed to fetch source property. Please try again.",
    );
  }
};

export const deleteSourceProperty = async (id: string): Promise<void> => {
  try {
    await axiosInstance.delete(ApiRoutes.admin.sourceProperties.detail(id));
  } catch (error: any) {
    throw new Error(
      error?.response?.data?.message || "Failed to delete source property.",
    );
  }
};

export const deleteSourceProperties = async (
  payload: DeleteSourcePropertiesPayload,
): Promise<DeleteSourcePropertiesResult> => {
  try {
    const response = await axiosInstance.post(
      ApiRoutes.admin.sourceProperties.bulkDelete,
      payload,
    );
    return response.data;
  } catch (error: any) {
    throw new Error(
      error?.response?.data?.message || "Failed to delete source properties.",
    );
  }
};
