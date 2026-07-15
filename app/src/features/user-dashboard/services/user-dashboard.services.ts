import axiosInstance from "@/config/api/axios";
import { ApiRoutes } from "@/config/api/routes";
import type { UserDashboardResponse } from "../interfaces/user-dashboard.interfaces";

export const getUserDashboard = async (): Promise<UserDashboardResponse> => {
  try {
    const response = await axiosInstance.get(ApiRoutes.dashboard.root);
    return response.data;
  } catch {
    throw new Error("Failed to fetch dashboard. Please try again.");
  }
};
