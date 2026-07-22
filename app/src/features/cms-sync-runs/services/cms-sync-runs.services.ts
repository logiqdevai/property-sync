import axiosInstance from "@/config/api/axios";
import { ApiRoutes } from "@/config/api/routes";
import type {
  AdminCmsSyncRunListQuery,
  CmsSyncRun,
  CmsSyncRunListQuery,
  DeleteCmsSyncRunsPayload,
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

export const getUserCmsSyncRun = async (id: string): Promise<CmsSyncRun> => {
  try {
    const response = await axiosInstance.get(ApiRoutes.cmsSyncRuns.detail(id));
    return response.data;
  } catch (error) {
    throw new Error("Failed to fetch sync run. Please try again.");
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

export const getAdminCmsSyncRun = async (id: string): Promise<CmsSyncRun> => {
  try {
    const response = await axiosInstance.get(ApiRoutes.admin.cmsSyncRuns.detail(id));
    return response.data;
  } catch (error) {
    throw new Error("Failed to fetch sync run. Please try again.");
  }
};

export const retryAdminCmsSyncRun = async (id: string): Promise<CmsSyncRun> => {
  try {
    const response = await axiosInstance.post(ApiRoutes.admin.cmsSyncRuns.retry(id));
    return response.data;
  } catch (error: any) {
    throw new Error(
      error?.response?.data?.message ?? "Failed to retry sync run. Please try again.",
    );
  }
};

export const rerunAdminCmsSyncRun = async (id: string): Promise<CmsSyncRun> => {
  try {
    const response = await axiosInstance.post(ApiRoutes.admin.cmsSyncRuns.rerun(id));
    return response.data;
  } catch (error: any) {
    throw new Error(
      error?.response?.data?.message ?? "Failed to rerun sync run. Please try again.",
    );
  }
};

export const deleteAdminCmsSyncRun = async (id: string): Promise<void> => {
  try {
    await axiosInstance.delete(ApiRoutes.admin.cmsSyncRuns.detail(id));
  } catch (error: any) {
    throw new Error(
      error?.response?.data?.message ?? "Failed to delete sync run. Please try again.",
    );
  }
};

export const deleteAdminCmsSyncRuns = async (
  payload: DeleteCmsSyncRunsPayload,
): Promise<{ deleted: number }> => {
  try {
    const response = await axiosInstance.post(
      ApiRoutes.admin.cmsSyncRuns.bulkDelete,
      payload,
    );
    return response.data;
  } catch (error: any) {
    throw new Error(
      error?.response?.data?.message ?? "Failed to delete sync runs. Please try again.",
    );
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
