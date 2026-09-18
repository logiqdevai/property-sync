import axiosInstance from "@/config/api/axios";
import { ApiRoutes } from "@/config/api/routes";
import type {
  ActivityLogDetail,
  ActivityLogFacets,
  ActivityLogListQuery,
  ActivityLogListResponse,
} from "../interfaces/activity-logs.interfaces";

export const getActivityLogs = async (
  query?: ActivityLogListQuery,
): Promise<ActivityLogListResponse> => {
  try {
    const response = await axiosInstance.get(ApiRoutes.admin.activityLogs.list, { params: query });
    return response.data;
  } catch (error) {
    throw new Error("Failed to fetch activity logs. Please try again.", { cause: error });
  }
};

export const getActivityLog = async (id: string): Promise<ActivityLogDetail> => {
  try {
    const response = await axiosInstance.get(ApiRoutes.admin.activityLogs.detail(id));
    return response.data;
  } catch (error) {
    throw new Error("Failed to fetch activity log. Please try again.", { cause: error });
  }
};

export const getActivityLogFacets = async (): Promise<ActivityLogFacets> => {
  try {
    const response = await axiosInstance.get(ApiRoutes.admin.activityLogs.facets);
    return response.data;
  } catch (error) {
    throw new Error("Failed to fetch activity log filters. Please try again.", { cause: error });
  }
};
