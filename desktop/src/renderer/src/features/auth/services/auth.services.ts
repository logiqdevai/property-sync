import axiosInstance from "@/config/api/axios";
import { ApiRoutes } from "@/config/api/routes";
import { apiErrorMessage } from "@/lib/api-error";
import type { LoggedInUser } from "@/features/user/interfaces/user.interface";
import type { SignInUser } from "../interfaces/auth.interface";
import { formatAuthUser } from "../utils/auth.utils";

export const signIn = async ({ email, password }: SignInUser): Promise<LoggedInUser> => {
  try {
    const response = await axiosInstance.post(ApiRoutes.auth.email.login, { email, password });
    return formatAuthUser(response.data);
  } catch (error) {
    throw new Error(apiErrorMessage(error, "Failed to sign in. Please try again."), { cause: error });
  }
};
