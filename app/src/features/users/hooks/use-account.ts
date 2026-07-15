import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { useAuthStore } from "@/stores/auth";
import {
  changeCurrentUserPassword,
  getCurrentUser,
  updateCurrentUser,
} from "../services/account.services";
import type { ChangePasswordPayload, UpdateMePayload } from "../interfaces/account.interfaces";

export const useCurrentUser = () => {
  return useQuery({
    queryKey: ["currentUser"],
    queryFn: getCurrentUser,
  });
};

export const useUpdateCurrentUser = () => {
  const queryClient = useQueryClient();
  const updateUser = useAuthStore((state) => state.updateUser);

  return useMutation({
    mutationFn: (payload: UpdateMePayload) => updateCurrentUser(payload),
    onSuccess: (user) => {
      queryClient.invalidateQueries({ queryKey: ["currentUser"] });
      updateUser({
        email: user.email,
        full_name: user.email.split("@")[0],
      });
      toast({
        title: "Profile updated",
        duration: 2000,
        variant: "success",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not update profile",
        description: error.message,
        duration: 3000,
        variant: "error",
      });
    },
  });
};

export const useChangeCurrentUserPassword = () => {
  return useMutation({
    mutationFn: (payload: ChangePasswordPayload) => changeCurrentUserPassword(payload),
    onSuccess: (data) => {
      toast({
        title: "Password changed",
        description: data.message,
        duration: 2000,
        variant: "success",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not change password",
        description: error.message,
        duration: 3000,
        variant: "error",
      });
    },
  });
};
