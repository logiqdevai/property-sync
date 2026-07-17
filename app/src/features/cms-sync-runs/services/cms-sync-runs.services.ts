import axiosInstance from "@/config/api/axios";
import { ApiRoutes } from "@/config/api/routes";
import type {
  AdminCmsSyncRunListQuery,
  CmsSyncRun,
  CmsSyncRunListQuery,
  EstateWebIntegrationOption,
  PaginatedResponse,
} from "../interfaces/cms-sync-runs.interfaces";

export const getUserCmsSyncRuns = async (
  query?: CmsSyncRunListQuery,
): Promise<PaginatedResponse<CmsSyncRun>> => {
  try {
    const response = await axiosInstance.get(ApiRoutes.cmsSyncRuns.list, { params: query });
    return response.data;
  } catch (error) {
    throw new Error("Failed to fetch sync runs. Please try again.");
  }
};

export const getAdminCmsSyncRuns = async (
  query?: AdminCmsSyncRunListQuery,
): Promise<PaginatedResponse<CmsSyncRun>> => {
  try {
    const response = await axiosInstance.get(ApiRoutes.admin.cmsSyncRuns.list, { params: query });
    return response.data;
  } catch (error) {
    throw new Error("Failed to fetch sync runs. Please try again.");
  }
};

export const getAdminCmsSyncRunIntegrations = async (query?: {
  user_id?: string;
}): Promise<EstateWebIntegrationOption[]> => {
  try {
    const response = await axiosInstance.get(ApiRoutes.admin.cmsSyncRuns.integrations, {
      params: query,
    });
    return response.data;
  } catch (error) {
    throw new Error("Failed to fetch integrations. Please try again.");
  }
};
