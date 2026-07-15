import axiosInstance from "@/config/api/axios";
import { ApiRoutes } from "@/config/api/routes";
import type {
  AdminUser,
  AdminUserDetail,
  AdminUserListQuery,
  CreateAdminUserPayload,
  CreateAdminUserResponse,
  PaginatedResponse,
  UpdateAdminUserPayload,
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

export const createAdminUser = async (payload: CreateAdminUserPayload): Promise<CreateAdminUserResponse> => {
  try {
    const response = await axiosInstance.post(ApiRoutes.auth.email.register, payload);
    return response.data;
  } catch (error: any) {
    throw new Error(error?.response?.data?.message || "Failed to create user. Please try again.");
  }
};

export const sendAdminUserPasswordReset = async (userId: string): Promise<{ message: string }> => {
  try {
    const response = await axiosInstance.post(ApiRoutes.auth.email.send_user_password_reset(userId));
    return response.data;
  } catch (error: any) {
    throw new Error(error?.response?.data?.message || "Failed to send password reset. Please try again.");
  }
};

export const updateAdminUser = async (
  id: string,
  payload: UpdateAdminUserPayload,
): Promise<AdminUserDetail> => {
  try {
    const response = await axiosInstance.patch(ApiRoutes.admin.users.detail(id), payload);
    return response.data;
  } catch (error: any) {
    throw new Error(error?.response?.data?.message || "Failed to update user. Please try again.");
  }
};

export const deleteAdminUser = async (id: string): Promise<{ message: string }> => {
  try {
    const response = await axiosInstance.delete(ApiRoutes.admin.users.detail(id));
    return response.data;
  } catch (error: any) {
    throw new Error(error?.response?.data?.message || "Failed to delete user. Please try again.");
  }
};
