import axiosInstance from "@/config/api/axios";
import { ApiRoutes } from "@/config/api/routes";
import type {
  CreateGenerationRunPayload,
  GenerationRun,
  GenerationRunListQuery,
  PaginatedResponse,
  RejectGenerationRunPayload,
} from "../interfaces/scraper-generation.interfaces";

export const getGenerationRuns = async (
  query?: GenerationRunListQuery,
): Promise<PaginatedResponse<GenerationRun>> => {
  try {
    const response = await axiosInstance.get(ApiRoutes.admin.generationRuns.list, {
      params: query,
    });
    return response.data;
  } catch (error) {
    throw new Error("Failed to fetch generation runs. Please try again.");
  }
};

export const getGenerationRun = async (id: string): Promise<GenerationRun> => {
  try {
    const response = await axiosInstance.get(ApiRoutes.admin.generationRuns.detail(id));
    return response.data;
  } catch (error) {
    throw new Error("Failed to fetch generation run. Please try again.");
  }
};

export const createGenerationRun = async (
  payload: CreateGenerationRunPayload,
): Promise<GenerationRun> => {
  try {
    const response = await axiosInstance.post(ApiRoutes.admin.generationRuns.list, payload);
    return response.data;
  } catch (error: any) {
    throw new Error(
      error?.response?.data?.message || "Failed to trigger generation run. Please try again.",
    );
  }
};

export const approveGenerationRun = async (id: string): Promise<GenerationRun> => {
  try {
    const response = await axiosInstance.post(ApiRoutes.admin.generationRuns.approve(id));
    return response.data;
  } catch (error: any) {
    throw new Error(
      error?.response?.data?.message || "Failed to approve generation run. Please try again.",
    );
  }
};

export const rejectGenerationRun = async (
  id: string,
  payload?: RejectGenerationRunPayload,
): Promise<GenerationRun> => {
  try {
    const response = await axiosInstance.post(ApiRoutes.admin.generationRuns.reject(id), payload);
    return response.data;
  } catch (error: any) {
    throw new Error(
      error?.response?.data?.message || "Failed to reject generation run. Please try again.",
    );
  }
};

export const cancelGenerationRun = async (id: string): Promise<GenerationRun> => {
  try {
    const response = await axiosInstance.post(ApiRoutes.admin.generationRuns.cancel(id));
    return response.data;
  } catch (error: any) {
    throw new Error(
      error?.response?.data?.message || "Failed to cancel generation run. Please try again.",
    );
  }
};
