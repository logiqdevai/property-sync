import axiosInstance from "@/config/api/axios";
import { ApiRoutes } from "@/config/api/routes";
import type { DashboardResponse } from "../interfaces/dashboard.interfaces";

export const getDashboard = async (): Promise<DashboardResponse> => {
  try {
    const response = await axiosInstance.get(ApiRoutes.admin.dashboard.root);
    return response.data;
  } catch {
    throw new Error("Failed to fetch dashboard. Please try again.");
  }
};
