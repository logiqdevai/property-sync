import axiosInstance from "@/config/api/axios";
import { ApiRoutes } from "@/config/api/routes";
import type { UsageQuery, UsageResponse } from "../interfaces/usage.interfaces";

export const getUsage = async (query?: UsageQuery): Promise<UsageResponse> => {
  try {
    const response = await axiosInstance.get(ApiRoutes.usage.crawlRuns, { params: query });
    return response.data;
  } catch {
    throw new Error("Failed to fetch usage. Please try again.");
  }
};
