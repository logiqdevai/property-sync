import axiosInstance from "@/config/api/axios";
import { ApiRoutes } from "@/config/api/routes";
import type {
  DiagnosticsListQuery,
  DiagnosticsPackage,
  DiagnosticsPackageDetail,
  PaginatedResponse,
} from "../interfaces/diagnostics.interfaces";

export const getDiagnosticsPackages = async (
  query?: DiagnosticsListQuery,
): Promise<PaginatedResponse<DiagnosticsPackage>> => {
  try {
    const response = await axiosInstance.get(ApiRoutes.admin.diagnostics.list, {
      params: query,
    });
    return response.data;
  } catch (error) {
    throw new Error("Failed to fetch diagnostics packages. Please try again.");
  }
};

export const getDiagnosticsPackage = async (
  id: string,
): Promise<DiagnosticsPackageDetail> => {
  try {
    const response = await axiosInstance.get(ApiRoutes.admin.diagnostics.detail(id));
    return response.data;
  } catch (error) {
    throw new Error("Failed to fetch diagnostics package. Please try again.");
  }
};
