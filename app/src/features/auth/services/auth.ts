import { formatAuthUser } from "../utils/auth.utils";
import axiosInstance from "@/config/api/axios";
import type { SignInUser, SignUpUser } from "../interfaces/auth.interface";
import { ApiRoutes } from "@/config/api/routes";
import type { LoggedInUser } from "@/features/user/interfaces/user.interface";

export const signIn = async (
    { email, password }: SignInUser,
): Promise<LoggedInUser> => {
    try {
        const response = await axiosInstance.post(ApiRoutes.auth.email.login, {
            email,
            password,
        });

        const auth_response = response.data;
        return formatAuthUser(auth_response);

    } catch (error: any) {
        throw new Error(
            error?.response?.data?.message || "Failed to sign in. Please try again.",
        );
    }
};

export const signUp = async ({ email, password }: SignUpUser): Promise<LoggedInUser> => {
    try {
        const response = await axiosInstance.post(ApiRoutes.auth.email.register, {
            email,
            password,
        });

        const auth_response = response.data;
        return formatAuthUser(auth_response);
    } catch (error: any) {
        throw new Error(
            error?.response?.data?.message || "Failed to sign up. Please try again.",
        );
    }
};

export const refreshAccountToken = async (): Promise<LoggedInUser> => {
    try {
        const response = await axiosInstance.post(ApiRoutes.auth.email.refresh_token);
        return formatAuthUser(response.data);
    } catch (error: any) {
        throw new Error(error.response.data.message || "Failed to refresh account token. Please try again.");
    }
};

export const adminLoginToAccount = async (account_uuid: string): Promise<LoggedInUser> => {
    try {
        const response = await axiosInstance.post(ApiRoutes.auth.email.admin_login_to_account(account_uuid));
        return formatAuthUser(response.data);
    } catch (error: any) {
        throw new Error(error.response.data.message || "Failed to admin login to account. Please try again.");
    }
};

export const forgotPassword = async (email: string): Promise<{ message: string }> => {
    try {
        const response = await axiosInstance.post(ApiRoutes.auth.email.forgot_password, { email });
        return response.data;
    } catch (error: any) {
        throw new Error(error?.response?.data?.message || "Failed to send reset email. Please try again.");
    }
};

export const resetPassword = async (token: string, password: string): Promise<{ message: string }> => {
    try {
        const response = await axiosInstance.post(ApiRoutes.auth.email.reset_password, { token, password });
        return response.data;
    } catch (error: any) {
        throw new Error(error?.response?.data?.message || "Failed to reset password. Please try again.");
    }
};

export const validatePasswordResetToken = async (token: string): Promise<{ valid: boolean }> => {
    try {
        const response = await axiosInstance.get(ApiRoutes.auth.email.validate_reset_password, {
            params: { token },
        });
        return response.data;
    } catch {
        throw new Error("This password reset link is invalid or has expired.");
    }
};

