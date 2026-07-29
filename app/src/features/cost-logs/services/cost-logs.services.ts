import axiosInstance from "@/config/api/axios";
import { ApiRoutes } from "@/config/api/routes";
import type { CostLogListQuery, CostLogListResponse } from "../interfaces/cost-logs.interfaces";

export const getCostLogs = async (
  query?: CostLogListQuery,
): Promise<CostLogListResponse> => {
  try {
    const response = await axiosInstance.get(ApiRoutes.admin.costLogs.list, { params: query });
    return response.data;
  } catch (error) {
    throw new Error("Failed to fetch cost logs. Please try again.");
  }
};

export const getUserCostLogs = async (
  query?: Omit<CostLogListQuery, "user_id">,
): Promise<CostLogListResponse> => {
  try {
    const response = await axiosInstance.get(ApiRoutes.costLogs.list, { params: query });
    return response.data;
  } catch (error) {
    throw new Error("Failed to fetch cost logs. Please try again.");
  }
};
