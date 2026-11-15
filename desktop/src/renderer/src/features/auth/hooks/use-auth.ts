import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/stores/auth";
import { Routes } from "@/routes/routes";
import { toast } from "@/hooks/use-toast";
import { canUseCrawler, type LoggedInUser } from "@/features/user/interfaces/user.interface";
import { signIn } from "../services/auth.services";
import type { SignInUser } from "../interfaces/auth.interface";

export function useSignin() {
  const login = useAuthStore((state) => state.login);
  const navigate = useNavigate();

  return useMutation({
    mutationFn: async (data: SignInUser) => {
      const user = await signIn(data);
      if (!canUseCrawler(user.role)) {
        throw new Error("This account can't use the crawler. Ask an administrator for access.");
      }
      return user;
    },
    onSuccess: (data: LoggedInUser) => {
      login({ ...data, isLoggedIn: true });
      toast({ title: "Signed in", duration: 2000, variant: "success" });
      navigate(Routes.agencies, { replace: true });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not sign in",
        description: error.message,
        duration: 4000,
        variant: "error",
      });
    },
  });
}
