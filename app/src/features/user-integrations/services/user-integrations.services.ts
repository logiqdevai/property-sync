import axiosInstance from "@/config/api/axios";
import { ApiRoutes } from "@/config/api/routes";
import type {
  AvailableIntegrationTarget,
  CreateConnectionPayload,
  MaskedUserIntegrationConnection,
  UpdateConnectionPayload,
  UpdateSettingsPayload,
  UserIntegrationSettings,
} from "../interfaces/user-integrations.interfaces";

export const getIntegrationTargetsForUser = async (): Promise<AvailableIntegrationTarget[]> => {
  try {
    const response = await axiosInstance.get(ApiRoutes.integrations.targets);
    return response.data;
  } catch {
    throw new Error("Failed to fetch integration targets. Please try again.");
  }
};

export const getUserIntegrationConnections = async (): Promise<MaskedUserIntegrationConnection[]> => {
  try {
    const response = await axiosInstance.get(ApiRoutes.integrations.connections);
    return response.data;
  } catch {
    throw new Error("Failed to fetch your integrations. Please try again.");
  }
};

export const createUserIntegrationConnection = async (
  payload: CreateConnectionPayload,
): Promise<MaskedUserIntegrationConnection> => {
  try {
    const response = await axiosInstance.post(ApiRoutes.integrations.connections, payload);
    return response.data;
  } catch (error: any) {
    throw new Error(
      error?.response?.data?.message || "Failed to connect integration. Please try again.",
    );
  }
};

export const updateUserIntegrationConnection = async (
  id: string,
  payload: UpdateConnectionPayload,
): Promise<MaskedUserIntegrationConnection> => {
  try {
    const response = await axiosInstance.patch(ApiRoutes.integrations.connection(id), payload);
    return response.data;
  } catch (error: any) {
    throw new Error(
      error?.response?.data?.message || "Failed to update integration. Please try again.",
    );
  }
};

export const updateUserIntegrationConnectionStatus = async (
  id: string,
  isActive: boolean,
): Promise<MaskedUserIntegrationConnection> => {
  try {
    const response = await axiosInstance.patch(ApiRoutes.integrations.connectionStatus(id), {
      is_active: isActive,
    });
    return response.data;
  } catch (error: any) {
    throw new Error(
      error?.response?.data?.message || "Failed to update integration status. Please try again.",
    );
  }
};

export const updateUserIntegrationConnectionDefault = async (
  id: string,
  isDefault: boolean,
): Promise<MaskedUserIntegrationConnection> => {
  try {
    const response = await axiosInstance.patch(ApiRoutes.integrations.connectionDefault(id), {
      is_default: isDefault,
    });
    return response.data;
  } catch (error: any) {
    throw new Error(
      error?.response?.data?.message || "Failed to update default integration. Please try again.",
    );
  }
};

export const deleteUserIntegrationConnection = async (id: string): Promise<void> => {
  try {
    await axiosInstance.delete(ApiRoutes.integrations.connection(id));
  } catch (error: any) {
    throw new Error(
      error?.response?.data?.message || "Failed to disconnect integration. Please try again.",
    );
  }
};

export const getUserIntegrationSettings = async (
  targetId: string,
): Promise<UserIntegrationSettings> => {
  try {
    const response = await axiosInstance.get(ApiRoutes.integrations.settings(targetId));
    return response.data;
  } catch {
    throw new Error("Failed to fetch integration settings. Please try again.");
  }
};

export const updateUserIntegrationSettings = async (
  targetId: string,
  payload: UpdateSettingsPayload,
): Promise<UserIntegrationSettings> => {
  try {
    const response = await axiosInstance.patch(
      ApiRoutes.integrations.settings(targetId),
      payload,
    );
    return response.data;
  } catch (error: any) {
    throw new Error(
      error?.response?.data?.message || "Failed to update integration settings. Please try again.",
    );
  }
};
