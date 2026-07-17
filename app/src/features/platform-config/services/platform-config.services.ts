import axiosInstance from "@/config/api/axios";
import { ApiRoutes } from "@/config/api/routes";
import type {
  PlatformConfig,
  UpdatePlatformConfigPayload,
} from "../interfaces/platform-config.interfaces";

export const getPlatformConfig = async (): Promise<PlatformConfig> => {
  try {
    const response = await axiosInstance.get(ApiRoutes.admin.platformConfig.root);
    return response.data;
  } catch {
    throw new Error("Failed to fetch platform config. Please try again.");
  }
};

export const updatePlatformConfig = async (
  payload: UpdatePlatformConfigPayload,
): Promise<PlatformConfig> => {
  try {
    const response = await axiosInstance.patch(ApiRoutes.admin.platformConfig.root, payload);
    return response.data;
  } catch (error: any) {
    throw new Error(
      error?.response?.data?.message || "Failed to update platform config. Please try again.",
    );
  }
};
