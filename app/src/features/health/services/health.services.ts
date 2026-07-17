import axiosInstance from "@/config/api/axios";
import { ApiRoutes } from "@/config/api/routes";
import type { HealthCheckResponse } from "../interfaces/health.interfaces";

export const getHealth = async (): Promise<HealthCheckResponse> => {
  try {
    const response = await axiosInstance.get<HealthCheckResponse>(ApiRoutes.health, {
      validateStatus: (status) => status === 200 || status === 503,
    });
    return response.data;
  } catch {
    throw new Error("Failed to fetch health status. Please try again.");
  }
};
