import axiosInstance from "@/config/api/axios";
import { ApiRoutes } from "@/config/api/routes";
import type {
  ChangePasswordPayload,
  ChangePasswordResponse,
  CurrentUser,
  UpdateMePayload,
} from "../interfaces/account.interfaces";

export const getCurrentUser = async (): Promise<CurrentUser> => {
  try {
    const response = await axiosInstance.get(ApiRoutes.users.me);
    return response.data;
  } catch (error: any) {
    throw new Error(error?.response?.data?.message || "Failed to fetch account details. Please try again.");
  }
};

export const updateCurrentUser = async (payload: UpdateMePayload): Promise<CurrentUser> => {
  try {
    const response = await axiosInstance.patch(ApiRoutes.users.me, payload);
    return response.data;
  } catch (error: any) {
    throw new Error(error?.response?.data?.message || "Failed to update profile. Please try again.");
  }
};

export const changeCurrentUserPassword = async (
  payload: ChangePasswordPayload,
): Promise<ChangePasswordResponse> => {
  try {
    const response = await axiosInstance.post(ApiRoutes.users.changePassword, payload);
    return response.data;
  } catch (error: any) {
    throw new Error(error?.response?.data?.message || "Failed to change password. Please try again.");
  }
};
