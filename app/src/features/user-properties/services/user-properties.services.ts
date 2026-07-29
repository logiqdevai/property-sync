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
  UpdateEstateWebSitesPayload,
  UpdateEstateWebSitesResult,
  UpdateSalesPricesPayload,
  UpdateSalesPricesResult,
  UpdateUserPropertyPayload,
  UserProperty,
  AdminUserPropertyCountQuery,
  AdminUserPropertyListQuery,
  UserPropertyCountQuery,
  UserPropertyCountResponse,
  UserPropertyDetail,
  UserPropertyListQuery,
  TruncateUserPropertyDescriptionsPayload,
  TruncateUserPropertyDescriptionsResult,
  UpdateIntegrationImagesPayload,
  MigrateIntegrationImagesPayload,
  RemoveWatermarkImagesPayload,
  RemoveWatermarkImagesResponse,
  BulkRemoveWatermarkImagesPayload,
  BulkRemoveWatermarkImagesResponse,
  ProduceUserPropertyContentPayload,
  ProduceUserPropertyContentResponse,
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

export const getAdminUserProperties = async (
  query?: AdminUserPropertyListQuery,
): Promise<PaginatedResponse<UserProperty>> => {
  try {
    const response = await axiosInstance.get(ApiRoutes.admin.userProperties.list, {
      params: query,
    });
    return response.data;
  } catch {
    throw new Error("Failed to fetch user properties. Please try again.");
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

export const getAdminUserPropertiesCount = async (
  query?: AdminUserPropertyCountQuery,
): Promise<UserPropertyCountResponse> => {
  try {
    const response = await axiosInstance.get(ApiRoutes.admin.userProperties.count, {
      params: query,
    });
    return response.data;
  } catch {
    throw new Error("Failed to fetch user property count. Please try again.");
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

export const getAdminUserProperty = async (
  id: string,
): Promise<UserPropertyDetail> => {
  try {
    const response = await axiosInstance.get(
      ApiRoutes.admin.userProperties.detail(id),
    );
    return response.data;
  } catch {
    throw new Error("Failed to fetch user property. Please try again.");
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
    throw new Error(error?.response?.data?.message || "Failed to push property to CMS.");
  }
};

export const migrateUserPropertyIntegrationImages = async (
  id: string,
  payload: MigrateIntegrationImagesPayload,
): Promise<UserPropertyDetail> => {
  try {
    const response = await axiosInstance.post(
      ApiRoutes.userProperties.migrateIntegrationImages(id),
      payload,
    );
    return response.data;
  } catch (error: any) {
    throw new Error(
      error?.response?.data?.message || "Failed to migrate CMS images.",
    );
  }
};

export const migrateAdminUserPropertyIntegrationImages = async (
  id: string,
  payload: MigrateIntegrationImagesPayload,
): Promise<UserPropertyDetail> => {
  try {
    const response = await axiosInstance.post(
      ApiRoutes.admin.userProperties.migrateIntegrationImages(id),
      payload,
    );
    return response.data;
  } catch (error: any) {
    throw new Error(
      error?.response?.data?.message || "Failed to migrate CMS images.",
    );
  }
};

export const deleteUserPropertyIntegrationImages = async (
  id: string,
  imageIds: number[],
): Promise<UserPropertyDetail> => {
  try {
    const response = await axiosInstance.post(
      ApiRoutes.userProperties.deleteIntegrationImages(id),
      { image_ids: imageIds },
    );
    return response.data;
  } catch (error: any) {
    throw new Error(
      error?.response?.data?.message || "Failed to delete CMS images.",
    );
  }
};

export const deleteAdminUserPropertyIntegrationImages = async (
  id: string,
  imageIds: number[],
): Promise<UserPropertyDetail> => {
  try {
    const response = await axiosInstance.post(
      ApiRoutes.admin.userProperties.deleteIntegrationImages(id),
      { image_ids: imageIds },
    );
    return response.data;
  } catch (error: any) {
    throw new Error(
      error?.response?.data?.message || "Failed to delete CMS images.",
    );
  }
};

export const createUserPropertyIntegrationImages = async (
  id: string,
  imageIndexes: number[],
): Promise<UserPropertyDetail> => {
  try {
    const response = await axiosInstance.post(
      ApiRoutes.userProperties.createIntegrationImages(id),
      { image_indexes: imageIndexes },
    );
    return response.data;
  } catch (error: any) {
    throw new Error(
      error?.response?.data?.message || "Failed to create CMS images.",
    );
  }
};

export const createAdminUserPropertyIntegrationImages = async (
  id: string,
  imageIndexes: number[],
): Promise<UserPropertyDetail> => {
  try {
    const response = await axiosInstance.post(
      ApiRoutes.admin.userProperties.createIntegrationImages(id),
      { image_indexes: imageIndexes },
    );
    return response.data;
  } catch (error: any) {
    throw new Error(
      error?.response?.data?.message || "Failed to create CMS images.",
    );
  }
};

export const updateUserPropertyIntegrationImages = async (
  id: string,
  payload: UpdateIntegrationImagesPayload,
): Promise<UserPropertyDetail> => {
  try {
    const response = await axiosInstance.post(
      ApiRoutes.userProperties.updateIntegrationImages(id),
      payload,
    );
    return response.data;
  } catch (error: any) {
    throw new Error(
      error?.response?.data?.message || "Failed to update CMS image options.",
    );
  }
};

export const updateAdminUserPropertyIntegrationImages = async (
  id: string,
  payload: UpdateIntegrationImagesPayload,
): Promise<UserPropertyDetail> => {
  try {
    const response = await axiosInstance.post(
      ApiRoutes.admin.userProperties.updateIntegrationImages(id),
      payload,
    );
    return response.data;
  } catch (error: any) {
    throw new Error(
      error?.response?.data?.message || "Failed to update CMS image options.",
    );
  }
};

export const removeUserPropertyWatermarkImages = async (
  id: string,
  payload: RemoveWatermarkImagesPayload,
): Promise<RemoveWatermarkImagesResponse> => {
  try {
    const response = await axiosInstance.post(
      ApiRoutes.userProperties.removeWatermarkImages(id),
      payload,
    );
    return response.data;
  } catch (error: any) {
    throw new Error(
      error?.response?.data?.message || "Failed to start watermark removal.",
    );
  }
};

export const removeUserPropertiesWatermarkImages = async (
  payload: BulkRemoveWatermarkImagesPayload,
): Promise<RemoveWatermarkImagesResponse | BulkRemoveWatermarkImagesResponse> => {
  try {
    const response = await axiosInstance.post(
      ApiRoutes.userProperties.bulkRemoveWatermarkImages,
      payload,
    );
    return response.data;
  } catch (error: any) {
    throw new Error(
      error?.response?.data?.message || "Failed to start watermark removal.",
    );
  }
};

export const removeAdminUserPropertyWatermarkImages = async (
  id: string,
  payload: RemoveWatermarkImagesPayload,
): Promise<RemoveWatermarkImagesResponse> => {
  try {
    const response = await axiosInstance.post(
      ApiRoutes.admin.userProperties.removeWatermarkImages(id),
      payload,
    );
    return response.data;
  } catch (error: any) {
    throw new Error(
      error?.response?.data?.message || "Failed to start watermark removal.",
    );
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
    throw new Error(error?.response?.data?.message || "Failed to push properties to CMS.");
  }
};

export const updateUserPropertyEstateWebSites = async (
  payload: UpdateEstateWebSitesPayload,
): Promise<UserProperty | UpdateEstateWebSitesResult> => {
  try {
    const response = await axiosInstance.post(
      ApiRoutes.userProperties.updateEstateWebSites,
      payload,
    );
    return response.data;
  } catch (error: any) {
    throw new Error(
      error?.response?.data?.message || "Failed to update EstateWeb sites.",
    );
  }
};

export const updateUserPropertySalesPrices = async (
  payload: UpdateSalesPricesPayload,
): Promise<UserProperty | UpdateSalesPricesResult> => {
  try {
    const response = await axiosInstance.post(
      ApiRoutes.userProperties.updateSalesPrices,
      payload,
    );
    return response.data;
  } catch (error: any) {
    throw new Error(
      error?.response?.data?.message || "Failed to update sales prices on CRM.",
    );
  }
};

export const produceUserPropertyContent = async (
  payload: ProduceUserPropertyContentPayload,
): Promise<ProduceUserPropertyContentResponse> => {
  try {
    const response = await axiosInstance.post(
      ApiRoutes.userProperties.produceContent,
      payload,
    );
    return response.data;
  } catch (error: any) {
    throw new Error(
      error?.response?.data?.message || "Failed to produce content.",
    );
  }
};

export const deleteUserProperty = async (id: string): Promise<void> => {
  try {
    await axiosInstance.delete(ApiRoutes.userProperties.detail(id));
  } catch (error: any) {
    throw new Error(error?.response?.data?.message || "Failed to delete property.");
  }
};

export const deleteAdminUserProperty = async (id: string): Promise<void> => {
  try {
    await axiosInstance.delete(ApiRoutes.admin.userProperties.detail(id));
  } catch (error: any) {
    throw new Error(
      error?.response?.data?.message || "Failed to delete user property.",
    );
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

export const deleteAdminUserProperties = async (
  payload: DeleteUserPropertiesPayload,
): Promise<{ deleted: number }> => {
  try {
    const response = await axiosInstance.post(
      ApiRoutes.admin.userProperties.bulkDelete,
      payload,
    );
    return response.data;
  } catch (error: any) {
    throw new Error(
      error?.response?.data?.message || "Failed to delete user properties.",
    );
  }
};

export const truncateAdminUserPropertyDescriptions = async (
  payload: TruncateUserPropertyDescriptionsPayload,
): Promise<TruncateUserPropertyDescriptionsResult> => {
  try {
    const response = await axiosInstance.post(
      ApiRoutes.admin.userProperties.truncateDescriptions,
      payload,
    );
    return response.data;
  } catch (error: any) {
    throw new Error(
      error?.response?.data?.message || "Failed to truncate user property descriptions.",
    );
  }
};

export const dedupeAdminUserPropertyGroups = async (
  payload: DedupeUserPropertiesPayload,
): Promise<DedupeUserPropertiesResult> => {
  try {
    const response = await axiosInstance.post(
      ApiRoutes.admin.userProperties.dedupeGroups,
      payload,
    );
    return response.data;
  } catch (error: any) {
    throw new Error(
      error?.response?.data?.message || "Failed to keep one user property per group.",
    );
  }
};

export const splitAdminUserProperties = async (
  payload: SplitUserPropertiesPayload,
): Promise<SplitUserPropertiesResult> => {
  try {
    const response = await axiosInstance.post(
      ApiRoutes.admin.userProperties.bulkSplit,
      payload,
    );
    return response.data;
  } catch (error: any) {
    throw new Error(
      error?.response?.data?.message || "Failed to split user properties from groups.",
    );
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
