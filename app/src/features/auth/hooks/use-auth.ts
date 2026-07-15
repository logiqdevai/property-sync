import { adminLoginToAccount, forgotPassword, refreshAccountToken, resetPassword, signIn, signUp } from "../services/auth";
import { useMutation } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth";
import { useNavigate } from "react-router-dom";
import type { SignInUser, SignUpUser } from "../interfaces/auth.interface";
import { Routes } from "@/routes/routes";
import { canAccessAdmin, type LoggedInUser } from "@/features/user/interfaces/user.interface";
import { toast } from "@/hooks/use-toast";


export function useSignin() {
    const { login } = useAuthStore((state) => state);
    const navigate = useNavigate();

    return useMutation({
        mutationFn: (data: SignInUser) => signIn(data),
        onSuccess: (data: LoggedInUser) => {
            login({
                ...data,
                isLoggedIn: true,
            });
            toast({
                title: "Login successful",
                description: "You have successfully logged in",
                duration: 2000,
            });
            navigate(canAccessAdmin(data.role) ? Routes.admin.root : Routes.dashboard.root);
        },
        onError: (error: any) => {
            toast({
                title: "Could not sign in",
                description: error?.message || "An unexpected error occurred",
                duration: 3000,
                variant: "error",
            });
        },
    });
}


export function useSignup() {
    const { login } = useAuthStore((state) => state);
    const navigate = useNavigate();

    return useMutation({
        mutationFn: (data: SignUpUser) => signUp(data),
        onSuccess: (data) => {
            login({
                ...data,
                isLoggedIn: true,
            });
            toast({
                title: "Register successful",
                description: "You have successfully registered in",
                duration: 2000,
            });
            navigate(Routes.dashboard.root);
        },
        onError: (error) => {
            toast({
                title: "Could not sign up",
                description: error.message,
                duration: 3000,
                variant: "error",
            });
        },
    });
}


export function useRefreshAccountToken() {
    const { login } = useAuthStore((state) => state);
    return useMutation({
        mutationFn: () => refreshAccountToken(),
        onSuccess: (data: LoggedInUser) => {
            login({ ...data, isLoggedIn: true });
        },
    });
}

export function useAdminLoginToAccount() {
    const { login } = useAuthStore((state) => state);
    const navigate = useNavigate();

    return useMutation({
        mutationFn: (account_uuid: string) => adminLoginToAccount(account_uuid),
        onSuccess: (data: LoggedInUser) => {
            login({
                ...data,
                isLoggedIn: true,
            });
            toast({
                title: "Logged in as user",
                description: "You are now viewing the app as this user",
                duration: 2000,
            });
            navigate(Routes.dashboard.root);
        },
        onError: (error: any) => {
            toast({
                title: "Could not login as user",
                description: error.message,
                duration: 3000,
                variant: "error",
            });
        },
    });
}

export function useForgotPassword() {
    return useMutation({
        mutationFn: (email: string) => forgotPassword(email),
        onSuccess: (data) => {
            toast({
                title: "Check your email",
                description: data.message,
                duration: 4000,
            });
        },
        onError: (error: Error) => {
            toast({
                title: "Could not send reset email",
                description: error.message,
                duration: 3000,
                variant: "error",
            });
        },
    });
}

export function useResetPassword() {
    const navigate = useNavigate();

    return useMutation({
        mutationFn: ({ token, password }: { token: string; password: string }) =>
            resetPassword(token, password),
        onSuccess: (data) => {
            toast({
                title: "Password updated",
                description: data.message,
                duration: 3000,
            });
            navigate(Routes.auth.sign_in);
        },
        onError: (error: Error) => {
            toast({
                title: "Could not update password",
                description: error.message,
                duration: 3000,
                variant: "error",
            });
        },
    });
}