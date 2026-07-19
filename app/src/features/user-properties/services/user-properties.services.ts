import axiosInstance from "@/config/api/axios";
import { ApiRoutes } from "@/config/api/routes";
import type {
  DeleteUserPropertiesPayload,
  DedupeUserPropertiesPayload,
  DedupeUserPropertiesResult,
  PaginatedResponse,
  PushUserPropertiesToCrmPayload,
  PushUserPropertiesToCrmResult,
  SplitUserPropertiesPayload,
  SplitUserPropertiesResult,
  UpdateUserPropertyPayload,
  UserProperty,
  UserPropertyCountQuery,
  UserPropertyCountResponse,
  UserPropertyDetail,
  UserPropertyListQuery,
  TruncateUserPropertyDescriptionsPayload,
  TruncateUserPropertyDescriptionsResult,
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

export const getUserPropertiesCount = async (
  query?: UserPropertyCountQuery,
): Promise<UserPropertyCountResponse> => {
  try {
    const response = await axiosInstance.get(ApiRoutes.userProperties.count, {
      params: query,
    });
    return response.data;
  } catch {
    throw new Error("Failed to fetch property count. Please try again.");
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

export const pushUserPropertyToCrm = async (id: string): Promise<UserProperty> => {
  try {
    const response = await axiosInstance.post(ApiRoutes.userProperties.pushToCrm(id));
    return response.data;
  } catch (error: any) {
    throw new Error(error?.response?.data?.message || "Failed to push property to CRM.");
  }
};

export const pushUserPropertiesToCrm = async (
  payload: PushUserPropertiesToCrmPayload,
): Promise<UserProperty | PushUserPropertiesToCrmResult> => {
  try {
    const response = await axiosInstance.post(
      ApiRoutes.userProperties.bulkPushToCrm,
      payload,
    );
    return response.data;
  } catch (error: any) {
    throw new Error(error?.response?.data?.message || "Failed to push properties to CRM.");
  }
};

export const deleteUserProperty = async (id: string): Promise<void> => {
  try {
    await axiosInstance.delete(ApiRoutes.userProperties.detail(id));
  } catch (error: any) {
    throw new Error(error?.response?.data?.message || "Failed to delete property.");
  }
};

export const deleteUserProperties = async (
  payload: DeleteUserPropertiesPayload,
): Promise<{ deleted: number }> => {
  try {
    const response = await axiosInstance.post(ApiRoutes.userProperties.bulkDelete, payload);
    return response.data;
  } catch (error: any) {
    throw new Error(error?.response?.data?.message || "Failed to delete properties.");
  }
};

export const dedupeUserPropertyGroups = async (
  payload: DedupeUserPropertiesPayload,
): Promise<DedupeUserPropertiesResult> => {
  try {
    const response = await axiosInstance.post(
      ApiRoutes.userProperties.dedupeGroups,
      payload,
    );
    return response.data;
  } catch (error: any) {
    throw new Error(
      error?.response?.data?.message || "Failed to keep one property per group.",
    );
  }
};

export const splitUserProperties = async (
  payload: SplitUserPropertiesPayload,
): Promise<SplitUserPropertiesResult> => {
  try {
    const response = await axiosInstance.post(
      ApiRoutes.userProperties.bulkSplit,
      payload,
    );
    return response.data;
  } catch (error: any) {
    throw new Error(
      error?.response?.data?.message || "Failed to split properties from groups.",
    );
  }
};

export const truncateUserPropertyDescriptions = async (
  payload: TruncateUserPropertyDescriptionsPayload,
): Promise<TruncateUserPropertyDescriptionsResult> => {
  try {
    const response = await axiosInstance.post(
      ApiRoutes.userProperties.truncateDescriptions,
      payload,
    );
    return response.data;
  } catch (error: any) {
    throw new Error(
      error?.response?.data?.message || "Failed to truncate property descriptions.",
    );
  }
};
