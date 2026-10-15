import axiosInstance from "@/config/api/axios";
import { ApiRoutes } from "@/config/api/routes";
import type { ActivityPeriod, UserDashboardResponse } from "../interfaces/user-dashboard.interfaces";

export const getUserDashboard = async (
  period: ActivityPeriod = "week",
): Promise<UserDashboardResponse> => {
  try {
    const response = await axiosInstance.get(ApiRoutes.dashboard.root, {
      params: { period },
    });
    return response.data;
  } catch {
    throw new Error("Failed to fetch dashboard. Please try again.");
  }
};
