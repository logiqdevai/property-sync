import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createAdminUser, deleteAdminUser, getAdminUser, getAdminUsers, sendAdminUserPasswordReset, updateAdminUser } from "../services/admin-users.services";
import type { AdminUserListQuery, CreateAdminUserPayload, UpdateAdminUserPayload } from "../interfaces/admin-users.interfaces";
import { toast } from "@/hooks/use-toast";

export const useAdminUsers = (query: AdminUserListQuery) => {
  return useQuery({
    queryKey: ["adminUsers", "list", query],
    queryFn: () => getAdminUsers(query),
  });
};

export const useAdminUser = (id: string) => {
  return useQuery({
    queryKey: ["adminUsers", "detail", id],
    queryFn: () => getAdminUser(id),
    enabled: !!id,
  });
};

export const useCreateAdminUser = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateAdminUserPayload) => createAdminUser(payload),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["adminUsers"] });
      toast({
        title: "User created",
        description: data.invite_sent
          ? "An invite email was sent so they can set their password."
          : "Account created with the password you set.",
        duration: 3000,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not create user",
        description: error.message,
        duration: 3000,
        variant: "error",
      });
    },
  });
};

export const useSendAdminUserPasswordReset = () => {
  return useMutation({
    mutationFn: (userId: string) => sendAdminUserPasswordReset(userId),
    onSuccess: (data) => {
      toast({
        title: "Password reset sent",
        description: data.message,
        duration: 3000,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not send password reset",
        description: error.message,
        duration: 3000,
        variant: "error",
      });
    },
  });
};

export const useUpdateAdminUser = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateAdminUserPayload }) =>
      updateAdminUser(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adminUsers"] });
      toast({
        title: "User updated",
        duration: 3000,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not update user",
        description: error.message,
        duration: 3000,
        variant: "error",
      });
    },
  });
};

export const useDeleteAdminUser = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteAdminUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adminUsers"] });
      toast({
        title: "User deleted",
        duration: 3000,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not delete user",
        description: error.message,
        duration: 3000,
        variant: "error",
      });
    },
  });
};
