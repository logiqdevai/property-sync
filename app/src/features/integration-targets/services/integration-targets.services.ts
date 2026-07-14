import axiosInstance from "@/config/api/axios";
import { ApiRoutes } from "@/config/api/routes";
import type {
  CreateIntegrationTargetPayload,
  CreateUserIntegrationAccountPayload,
  IntegrationTarget,
  IntegrationTargetDetail,
  IntegrationTargetListQuery,
  PaginatedResponse,
  UpdateIntegrationTargetPayload,
  UpdateUserIntegrationAccountPayload,
  MaskedUserIntegration,
} from "../interfaces/integration-targets.interfaces";

export const getIntegrationTargets = async (
  query?: IntegrationTargetListQuery,
): Promise<PaginatedResponse<IntegrationTarget>> => {
  try {
    const response = await axiosInstance.get(ApiRoutes.admin.integrationTargets.list, {
      params: query,
    });
    return response.data;
  } catch {
    throw new Error("Failed to fetch integration targets. Please try again.");
  }
};

export const getIntegrationTarget = async (id: string): Promise<IntegrationTargetDetail> => {
  try {
    const response = await axiosInstance.get(ApiRoutes.admin.integrationTargets.detail(id));
    return response.data;
  } catch {
    throw new Error("Failed to fetch integration target. Please try again.");
  }
};

export const createIntegrationTarget = async (
  payload: CreateIntegrationTargetPayload,
): Promise<IntegrationTarget> => {
  try {
    const response = await axiosInstance.post(ApiRoutes.admin.integrationTargets.list, payload);
    return response.data;
  } catch (error: any) {
    throw new Error(
      error?.response?.data?.message || "Failed to create integration target. Please try again.",
    );
  }
};

export const updateIntegrationTarget = async (
  id: string,
  payload: UpdateIntegrationTargetPayload,
): Promise<IntegrationTarget> => {
  try {
    const response = await axiosInstance.patch(
      ApiRoutes.admin.integrationTargets.detail(id),
      payload,
    );
    return response.data;
  } catch (error: any) {
    throw new Error(
      error?.response?.data?.message || "Failed to update integration target. Please try again.",
    );
  }
};

export const updateIntegrationTargetVisibility = async (
  id: string,
  isVisible: boolean,
): Promise<IntegrationTarget> => {
  try {
    const response = await axiosInstance.patch(
      ApiRoutes.admin.integrationTargets.visibility(id),
      { is_visible: isVisible },
    );
    return response.data;
  } catch (error: any) {
    throw new Error(
      error?.response?.data?.message ||
        "Failed to update integration target visibility. Please try again.",
    );
  }
};

export const deleteIntegrationTarget = async (id: string): Promise<void> => {
  try {
    await axiosInstance.delete(ApiRoutes.admin.integrationTargets.detail(id));
  } catch (error: any) {
    throw new Error(
      error?.response?.data?.message || "Failed to delete integration target. Please try again.",
    );
  }
};

export const createIntegrationTargetAccount = async (
  targetId: string,
  payload: CreateUserIntegrationAccountPayload,
): Promise<MaskedUserIntegration> => {
  try {
    const response = await axiosInstance.post(
      ApiRoutes.admin.integrationTargets.accounts(targetId),
      payload,
    );
    return response.data;
  } catch (error: any) {
    throw new Error(
      error?.response?.data?.message || "Failed to create user connection. Please try again.",
    );
  }
};

export const updateIntegrationTargetAccount = async (
  targetId: string,
  userIntegrationId: string,
  payload: UpdateUserIntegrationAccountPayload,
): Promise<MaskedUserIntegration> => {
  try {
    const response = await axiosInstance.patch(
      ApiRoutes.admin.integrationTargets.account(targetId, userIntegrationId),
      payload,
    );
    return response.data;
  } catch (error: any) {
    throw new Error(
      error?.response?.data?.message || "Failed to update user connection. Please try again.",
    );
  }
};
