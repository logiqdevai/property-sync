import axiosInstance from "@/config/api/axios";
import { ApiRoutes } from "@/config/api/routes";
import type {
  DeleteJobsPayload,
  JobLog,
  JobLogListQuery,
  PaginatedResponse,
} from "../interfaces/jobs.interfaces";

export const getJobs = async (query?: JobLogListQuery): Promise<PaginatedResponse<JobLog>> => {
  try {
    const response = await axiosInstance.get(ApiRoutes.admin.jobs.list, { params: query });
    return response.data;
  } catch (error) {
    throw new Error("Failed to fetch jobs. Please try again.");
  }
};

export const getJob = async (id: string): Promise<JobLog> => {
  try {
    const response = await axiosInstance.get(ApiRoutes.admin.jobs.detail(id));
    return response.data;
  } catch (error) {
    throw new Error("Failed to fetch job. Please try again.");
  }
};

export const retryJob = async (id: string): Promise<JobLog> => {
  try {
    const response = await axiosInstance.post(ApiRoutes.admin.jobs.retry(id));
    return response.data;
  } catch (error: any) {
    throw new Error(error?.response?.data?.message || "Failed to retry job. Please try again.");
  }
};

export const stopJob = async (id: string): Promise<JobLog> => {
  try {
    const response = await axiosInstance.post(ApiRoutes.admin.jobs.stop(id));
    return response.data;
  } catch (error: any) {
    throw new Error(error?.response?.data?.message || "Failed to stop job. Please try again.");
  }
};

export const deleteJob = async (id: string): Promise<void> => {
  try {
    await axiosInstance.delete(ApiRoutes.admin.jobs.detail(id));
  } catch (error: any) {
    throw new Error(error?.response?.data?.message || "Failed to delete job. Please try again.");
  }
};

export const deleteJobs = async (
  payload: DeleteJobsPayload,
): Promise<{ deleted: number }> => {
  try {
    const response = await axiosInstance.post(ApiRoutes.admin.jobs.bulkDelete, payload);
    return response.data;
  } catch (error: any) {
    throw new Error(error?.response?.data?.message || "Failed to delete jobs. Please try again.");
  }
};
