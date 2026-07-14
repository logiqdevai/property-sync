import axiosInstance from "@/config/api/axios";
import { ApiRoutes } from "@/config/api/routes";
import type {
  AdminUser,
  AdminUserDetail,
  AdminUserListQuery,
  PaginatedResponse,
} from "../interfaces/admin-users.interfaces";

export const getAdminUsers = async (
  query?: AdminUserListQuery,
): Promise<PaginatedResponse<AdminUser>> => {
  try {
    const response = await axiosInstance.get(ApiRoutes.admin.users.list, { params: query });
    return response.data;
  } catch {
    throw new Error("Failed to fetch users. Please try again.");
  }
};

export const getAdminUser = async (id: string): Promise<AdminUserDetail> => {
  try {
    const response = await axiosInstance.get(ApiRoutes.admin.users.detail(id));
    return response.data;
  } catch {
    throw new Error("Failed to fetch user. Please try again.");
  }
};
