import axiosInstance from "@/config/api/axios";
import { ApiRoutes } from "@/config/api/routes";
import type {
  PaginatedResponse,
  UpdateUserPropertyPayload,
  UserProperty,
  UserPropertyDetail,
  UserPropertyListQuery,
} from "../interfaces/user-properties.interfaces";

export const getUserProperties = async (
  query?: UserPropertyListQuery,
): Promise<PaginatedResponse<UserProperty>> => {
  try {
    const response = await axiosInstance.get(ApiRoutes.userProperties.list, {
      params: query,
    });
    return response.data;
  } catch {
    throw new Error("Failed to fetch your properties. Please try again.");
  }
};

export const getUserProperty = async (id: string): Promise<UserPropertyDetail> => {
  try {
    const response = await axiosInstance.get(ApiRoutes.userProperties.detail(id));
    return response.data;
  } catch {
    throw new Error("Failed to fetch property. Please try again.");
  }
};

export const updateUserProperty = async (
  id: string,
  payload: UpdateUserPropertyPayload,
): Promise<UserProperty> => {
  try {
    const response = await axiosInstance.patch(ApiRoutes.userProperties.detail(id), payload);
    return response.data;
  } catch (error: any) {
    throw new Error(error?.response?.data?.message || "Failed to update property.");
  }
};

export const resyncUserProperty = async (id: string): Promise<UserProperty> => {
  try {
    const response = await axiosInstance.post(ApiRoutes.userProperties.resync(id));
    return response.data;
  } catch (error: any) {
    throw new Error(error?.response?.data?.message || "Failed to resync property.");
  }
};
